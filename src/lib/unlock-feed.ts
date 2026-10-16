// Market-wide unlocks for the Unlock calendar, the News page and the agent. With Tokenomist live
// this is the next cliff of the largest tokens it covers (the screener's calls, cached), so it
// moves with Tokenomist. Without a live answer it falls back to the dated reports file, and says so.

import { compact, usd } from "./format";
import { readFixture } from "./fixtures";
import { RECIPIENT_LABEL } from "./risk";
import { marketScreen, type ScreenRow } from "./screener";
import { trackedTokens } from "./tokenomist";
import type { DataSource, RiskLevel } from "./types";

export interface MarketUnlock {
  symbol: string;
  date: string;
  summary: string;
  sizeNote: string;
  source: string;
  url: string;
  past?: boolean;
  dateApprox?: boolean;
  /** Size grade (or full score for tracked tokens) when the event came from the live screener. */
  level?: RiskLevel;
  pctCirc?: number | null;
  valueUsd?: number | null;
}

export interface MarketUnlockFeed {
  /** Upcoming unlocks, soonest first. */
  upcoming: MarketUnlock[];
  /** Recent unlocks kept as lessons (dated public reports). */
  past: MarketUnlock[];
  source: DataSource;
  asOf: string;
  note?: string;
}

/**
 * Upcoming cliffs across the market in the next `days` days. `excludeTracked` leaves out the
 * tokens U-Guard scores in full (the calendar lists those separately).
 */
export async function marketUnlocks(now: number, opts: { days?: number; excludeTracked?: boolean } = {}): Promise<MarketUnlockFeed> {
  const days = opts.days ?? 45;
  const [file, screen, tracked] = await Promise.all([
    readFixture<{ events: MarketUnlock[] }>("unlock-calendar.json"),
    marketScreen(now).catch(() => null),
    trackedTokens(),
  ]);
  const past = (file?.events ?? []).filter((e) => e.past);
  const skip = new Set(opts.excludeTracked ? tracked.data.map((t) => t.symbol.toUpperCase()) : []);

  if (screen && screen.sources.tokens === "live") {
    return { upcoming: fromScreen(screen.rows, days, skip), past, source: "live", asOf: new Date(now).toISOString() };
  }

  // No live answer (no key, rate limit or network): the dated reports file, labelled.
  const upcoming = (file?.events ?? [])
    .filter((e) => !e.past && !skip.has(e.symbol.toUpperCase()))
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    upcoming,
    past,
    source: "snapshot",
    asOf: tracked.asOf,
    note: "Tokenomist live isn't answering (no key, rate limit or network), so this list comes from saved public reports",
  };
}

/** Screener rows → calendar events: next cliffs within `days`, soonest first. */
export function fromScreen(rows: ScreenRow[], days: number, skip: Set<string> = new Set()): MarketUnlock[] {
  return rows
    .filter((r) => r.nextUnlock && r.nextUnlock.daysUntil >= 0 && r.nextUnlock.daysUntil <= days && !skip.has(r.symbol))
    .sort((a, b) => a.nextUnlock!.date.localeCompare(b.nextUnlock!.date))
    .map((r): MarketUnlock => {
      const u = r.nextUnlock!;
      const who = u.topRecipient ? ` · mostly ${RECIPIENT_LABEL[u.topRecipient].toLowerCase()}` : "";
      return {
        symbol: r.symbol,
        date: u.date,
        summary: `${compact(u.amount, 2)} ${r.symbol} unlock${u.valueUsd ? ` (~${usd(u.valueUsd)})` : ""}${who}`,
        sizeNote: u.pctCirc !== null ? `~${u.pctCirc.toFixed(2)}% of circulating supply` : "share of supply not available",
        source: "Tokenomist (live)",
        url: `https://tokenomist.ai/${r.id}`,
        level: r.grade.level,
        pctCirc: u.pctCirc,
        valueUsd: u.valueUsd,
      };
    });
}
