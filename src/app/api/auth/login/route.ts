import { publicUser, startSession } from "@/lib/auth/session";
import { authenticate, emailProblem } from "@/lib/auth/users";
import { LIMITS, rateLimit } from "@/lib/guard/rate-limit";
import { anonId, checkPost, handleError, jsonError, readJson, tooMany } from "@/lib/http";
import { logEvent } from "@/lib/log";
import { withStore } from "@/lib/store";

export const runtime = "nodejs";

async function handlePOST(req: Request) {
  const blocked = checkPost(req);
  if (blocked) return blocked;
  try {
    const limit = rateLimit(`auth:login:${anonId(req)}`, LIMITS.auth.max, LIMITS.auth.windowMs);
    if (!limit.ok) return tooMany(limit);
    const body = await readJson<{ email?: unknown; password?: unknown }>(req);
    if (emailProblem(body.email) || typeof body.password !== "string") return jsonError(400, "Enter your email and password.");
    const result = await authenticate(body.email as string, body.password);
    if ("error" in result) {
      logEvent("auth.login_failed", { status: result.status });
      return jsonError(result.status, result.error);
    }
    const session = await startSession({ sub: result.id, name: result.name, email: result.email, method: "password" });
    logEvent("auth.login", { userId: result.id, method: "password" });
    return Response.json({ user: publicUser(session) });
  } catch (err) {
    return handleError(err);
  }
}

export const POST = withStore(handlePOST);
