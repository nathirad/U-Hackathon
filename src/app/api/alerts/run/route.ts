import { runAlerts } from "@/lib/alerts";
import { getSession } from "@/lib/auth/session";
import { now } from "@/lib/config";
import { LIMITS, rateLimit } from "@/lib/guard/rate-limit";
import { checkPost, handleError, jsonError, tooMany } from "@/lib/http";
import { writeLog } from "@/lib/log";
import { withStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Check now": evaluate the signed-in user's alert rules and push the ones that fire into their
// U-Bot inbox. The same function can run from a cron later.
async function handlePOST(req: Request) {
  const blocked = checkPost(req, { allowEmptyBody: true });
  if (blocked) return blocked;
  try {
    const session = await getSession();
    if (!session) return jsonError(401, "Sign in to check your alerts.");
    const limit = rateLimit(`alerts-run:${session.sub}`, LIMITS.scan.max, LIMITS.scan.windowMs);
    if (!limit.ok) return tooMany(limit);
    const { outcomes, summary } = await runAlerts(session.sub, now(), "manual");
    return Response.json({ checked: outcomes.length, fired: summary.fired.length, outcomes, skipped: summary.skipped, events: summary.fired });
  } catch (err) {
    await writeLog({ type: "error", route: "/api/alerts/run", message: (err as Error).message });
    return handleError(err);
  }
}

export const POST = withStore(handlePOST);
