import { runAgent } from "@/lib/agent";
import { getSession } from "@/lib/auth/session";
import { LIMITS, rateLimit } from "@/lib/guard/rate-limit";
import { anonId, checkOrigin, handleError, jsonError, tooMany } from "@/lib/http";
import { logEvent } from "@/lib/log";
import { withStore } from "@/lib/store";
import type { Locale, TraceStep } from "@/lib/types";
import { agentMessageFor, cleanSymbols, MAX_IMAGE_BYTES, readScreenshot, sniffImage, visionConfigured, type ScreenshotRead } from "@/lib/vision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tells the client whether a vision model will read the image, or the user should type the ticker.
export async function GET() {
  return Response.json({ vision: visionConfigured() });
}

// multipart/form-data: "image" (PNG/JPEG/WebP/GIF, ≤ 5 MB), optional "symbols" (typed by the user,
// used when no vision model is set or the model found none), optional "lang" (en/th).
// → { vision, read, result } where result is the normal agent answer for the tickers found,
//   or { vision, read, needsSymbols: true } when there is nothing to check yet.
async function handlePOST(req: Request) {
  const blocked = checkOrigin(req); // multipart, so no JSON content-type check
  if (blocked) return blocked;
  try {
    const session = await getSession();
    const key = session ? `shot:u:${session.sub}:${anonId(req)}` : `shot:ip:${anonId(req)}`;
    const limit = rateLimit(key, session ? LIMITS.screenshot.max : 3, LIMITS.screenshot.windowMs);
    if (!limit.ok) return tooMany(limit);

    const form = await req.formData().catch(() => null);
    const image = form?.get("image");
    if (!(image instanceof Blob) || image.size === 0) return jsonError(400, "Attach a screenshot (PNG, JPEG, WebP or GIF).");
    if (image.size > MAX_IMAGE_BYTES) return jsonError(413, "That image is larger than 5 MB. Crop it or send a smaller screenshot.");
    const bytes = new Uint8Array(await image.arrayBuffer());
    const type = sniffImage(bytes);
    if (!type) return jsonError(415, "That file is not a PNG, JPEG, WebP or GIF image.");

    const locale: Locale = form?.get("lang") === "th" ? "th" : "en";
    const typed = cleanSymbols(form?.get("symbols"));
    const vision = visionConfigured();

    let read: ScreenshotRead | null = null;
    let visionError: string | null = null;
    if (vision && typed.length === 0) {
      try {
        read = await readScreenshot(bytes, type);
      } catch (err) {
        visionError = (err as Error).message.slice(0, 160);
        logEvent("screenshot.vision_error", { error: visionError });
      }
    }
    if (typed.length) {
      read = { kind: "other", symbols: typed, claims: [], summary: "", engine: "typed by you", droppedSecrets: false, ms: 0 };
    }

    const symbols = read?.symbols ?? [];
    if (symbols.length === 0) {
      return Response.json({ vision, read, needsSymbols: true, visionError });
    }

    const result = await runAgent({
      message: agentMessageFor(symbols, locale),
      userId: session?.sub ?? `anon:${anonId(req)}`,
      scope: session ? "user" : "public",
      route: "/api/screenshot",
      locale,
    });
    // Put the image-reading step at the top of the Agent Trace.
    const step: TraceStep = {
      kind: read?.engine === "typed by you" ? "guard" : "llm",
      name: read?.engine === "typed by you" ? "screenshot (tickers typed)" : `vision · ${read?.engine}`,
      summary: `${read?.kind ?? "other"} · found ${symbols.join(", ")}${read?.claims.length ? ` · ${read.claims.length} claim(s) quoted, not sent to the agent` : ""}${read?.droppedSecrets ? " · removed text that looked like a secret" : ""}`,
      ms: read?.ms ?? 0,
      ok: true,
    };
    result.trace.unshift(step);
    logEvent("screenshot.checked", { requestId: result.requestId, kind: read?.kind, symbols, claims: read?.claims.length ?? 0, engine: read?.engine });
    return Response.json({ vision, read, result });
  } catch (err) {
    return handleError(err);
  }
}

export const POST = withStore(handlePOST);
