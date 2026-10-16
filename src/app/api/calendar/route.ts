import { now } from "@/lib/config";
import { langOf } from "@/lib/http";
import { getEventCalendar } from "@/lib/intel/calendar";
import { assessUnlockRisk } from "@/lib/risk";
import { trackedTokens } from "@/lib/tokenomist";
import { marketUnlocks } from "@/lib/unlock-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Unlock calendar: tokens U-Guard scores in full (cards carry `timing`: upcoming, recent or
// continuous), the next cliffs across the market (Tokenomist live, else saved reports), and macro events.
export async function GET(req: Request) {
  const t = now();
  const locale = langOf(req);
  const tokens = (await trackedTokens()).data;
  const cards = (await Promise.all(tokens.map((tk) => assessUnlockRisk(tk.symbol, null, { now: t, locale }))))
    .flatMap((r) => (r.ok && r.card.unlockDate ? [r.card] : []))
    .sort((a, b) => a.unlockDate!.localeCompare(b.unlockDate!));
  const feed = await marketUnlocks(t, { excludeTracked: true });
  // events: macro dates (FOMC) and scheduled cliffs from the agent's calendar tool.
  return Response.json({
    analysed: cards,
    market: [...feed.upcoming, ...feed.past],
    marketSource: { mode: feed.source, asOf: feed.asOf, note: feed.note ?? null },
    events: await getEventCalendar(45, { now: t }),
    now: new Date(t).toISOString(),
  });
}
