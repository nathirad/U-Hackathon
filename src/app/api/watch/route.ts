import { getSession } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { bearerMatches, jsonError } from "@/lib/http";
import { store, withStore } from "@/lib/store";
import { runWatch, watchStatus } from "@/lib/watch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const cronAuthed = (req: Request) => Boolean(config.watch.cronSecret) && bearerMatches(req, config.watch.cronSecret);

// GET with "Authorization: Bearer $CRON_SECRET" runs one watcher pass (Vercel Cron calls GET,
// see vercel.json). Otherwise, for a signed-in user: watcher status, their last run and history.
async function handleGET(req: Request) {
  if (cronAuthed(req)) return Response.json({ ...(await runWatch("cron")), status: watchStatus() });
  const session = await getSession();
  if (!session) return jsonError(401, "Sign in to see the watcher.");
  return Response.json({
    ...watchStatus(),
    quietHours: { start: config.watch.quietStartHour, end: config.watch.quietEndHour },
    maxPerDay: config.watch.maxPerDay,
    last: store.lastWatch.get(session.sub) ?? null,
    events: store.alertEvents.filter((e) => e.ownerId === session.sub).slice(0, 30),
  });
}

// One watcher pass for every user, for other schedulers (Bearer CRON_SECRET).
async function handlePOST(req: Request) {
  if (!cronAuthed(req)) return jsonError(401, "Bearer CRON_SECRET required.");
  return Response.json({ ...(await runWatch("cron")), status: watchStatus() });
}

export const GET = withStore(handleGET);
export const POST = withStore(handlePOST);
