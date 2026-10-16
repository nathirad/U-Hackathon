import { publicUser, startSession } from "@/lib/auth/session";
import { createUser, emailProblem, passwordProblem } from "@/lib/auth/users";
import { LIMITS, rateLimit } from "@/lib/guard/rate-limit";
import { sanitize } from "@/lib/guard/input";
import { anonId, checkPost, handleError, jsonError, readJson, tooMany } from "@/lib/http";
import { logEvent } from "@/lib/log";
import { withStore } from "@/lib/store";

export const runtime = "nodejs";

async function handlePOST(req: Request) {
  const blocked = checkPost(req);
  if (blocked) return blocked;
  try {
    const limit = rateLimit(`auth:register:${anonId(req)}`, LIMITS.auth.max, LIMITS.auth.windowMs);
    if (!limit.ok) return tooMany(limit);
    const body = await readJson<{ email?: unknown; name?: unknown; password?: unknown }>(req);
    const emailErr = emailProblem(body.email);
    if (emailErr) return jsonError(400, emailErr);
    const pwErr = passwordProblem(body.password, body.email as string);
    if (pwErr) return jsonError(400, pwErr);
    const name = typeof body.name === "string" ? sanitize(body.name, 60) : "";
    const user = await createUser({ email: body.email as string, name, password: body.password as string });
    if ("error" in user) return jsonError(409, user.error);
    const session = await startSession({ sub: user.id, name: user.name, email: user.email, method: "password" });
    logEvent("auth.register", { userId: user.id });
    return Response.json({ user: publicUser(session) }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

export const POST = withStore(handlePOST);
