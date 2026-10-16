// Market screener: the largest tokens Tokenomist covers, with live prices (CoinGecko) and the
// next scheduled cliff unlock from the Tokenomist API. Tokens U-Guard follows in full carry
// their real risk score; the others get a size grade (unlock as % of circulating supply) and
// the full score is computed when the user opens the token.

import { readFixture } from "./fixtures";
import { getMarkets, perpPrices } from "./market";
import { classifyRecipient } from "./recipient";
import { assessUnlockRisk } from "./risk";
import { sharedGet, sharedSet } from "./store";
import { getCliffEvents, listTokens, trackedTokens } from "./tokenomist";
import type { DataSource, RecipientClass, RiskLevel } from "./types";

export const WINDOW_DAYS = 60;
const LIMIT = 40;

export interface ScreenRow {
  rank: number;
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  priceUsd: number | null;
  change24hPct: number | null;
  change7dPct: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  volume24hUsd: number | null;
  floatPct: number | null; // circulating ÷ max supply
  lockedPct: number | null; // still locked ÷ max supply
  latestRound: string | null;
  leadInvestors: string | null;
  totalRaisedUsd: number | null;
  nextUnlock: {
    date: string;
    daysUntil: number;
    amount: number;
    valueUsd: number | null;
    pctCirc: number | null;
    topRecipient: RecipientClass | null;
  } | null;
  grade: { level: RiskLevel; score: number | null; kind: "full" | "size" };
}

export interface ScreenResult {
  rows: ScreenRow[];
  windowDays: number;
  sources: { tokens: DataSource; market: "live" | "tokenomist"; asOf: string };
}

interface FundraisingFile {
  rows: { symbol: string; leadInvestors: string | null; latestRound: string | null; totalRaised: number | null }[];
}

/** Size grade from the next cliff as a share of circulating supply (the scorer's first factor). */
function sizeGrade(pctCirc: number | null): RiskLevel {
  if (pctCirc === null || pctCirc <= 0) return "none";
  return pctCirc >= 2 ? "high" : pctCirc >= 0.5 ? "medium" : "low";
}

// A cold screen is ~40 Tokenomist calls (10–15 s through the rate limiter), so nobody should wait
// for one twice: the last screen is served at once and refreshed in the background after a
// minute, pages opened together share one run, and with Upstash on (Vercel) a cold function
// starts from the screen another one saved. On globalThis so the warm-up at start shares it.
type Screen = { at: number; day: string; value: ScreenResult };
const FRESH_MS = 60_000;
const SHARED_KEY = "uguard:screen:v1";
const sg = globalThis as typeof globalThis & { __ugScreen?: { last: Screen | null; running: Promise<ScreenResult> | null } };
const screen = (sg.__ugScreen ??= { last: null, running: null });

export async function marketScreen(now: number): Promise<ScreenResult> {
  const day = new Date(now).toISOString().slice(0, 10);
  if (!screen.last || screen.last.day !== day) {
    const saved = await sharedGet<Screen>(SHARED_KEY);
    if (saved?.day === day) screen.last = saved;
  }
  const last = screen.last;
  if (last && last.day === day) {
    if (Date.now() - last.at >= FRESH_MS) void runScreen(now, day).catch(() => undefined);
    return last.value;
  }
  return runScreen(now, day);
}

function runScreen(now: number, day: string): Promise<ScreenResult> {
  screen.running ??= computeScreen(now)
    .then(async (value) => {
      screen.last = { at: Date.now(), day, value };
      await sharedSet(SHARED_KEY, screen.last);
      return value;
    })
    .finally(() => {
      screen.running = null;
    });
  return screen.running;
}

async function computeScreen(now: number): Promise<ScreenResult> {
  const start = new Date(now).toISOString().slice(0, 10);
  const end = new Date(now + WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);

  const [list, tracked, fundraising] = await Promise.all([listTokens(), trackedTokens(), readFixture<FundraisingFile>("screener.json")]);
  const top = [...list.data].filter((t) => t.marketCap > 0).sort((a, b) => b.marketCap - a.marketCap).slice(0, LIMIT);
  // Always include the tokens U-Guard follows in full, even below the cut.
  for (const t of tracked.data) if (!top.some((x) => x.id === t.id)) top.push(t);
  const trackedIds = new Set(tracked.data.map((t) => t.id));
  const funds = new Map((fundraising?.rows ?? []).map((r) => [r.symbol.toUpperCase(), r]));

  const [markets, perp, events, cards] = await Promise.all([
    getMarkets(top.map((t) => t.id)),
    perpPrices(),
    Promise.all(top.map((t) => getCliffEvents(t.id, start, end).catch(() => null))),
    Promise.all(top.map((t) => (trackedIds.has(t.id) ? assessUnlockRisk(t.symbol, null, { now, locale: "en" }) : Promise.resolve(null)))),
  ]);

  const rows: ScreenRow[] = top.map((t, i) => {
    const m = markets?.get(t.id) ?? null;
    // Hyperliquid's price is fresher (CoinGecko is cached for minutes); use it when the ticker
    // clearly is the same asset (within ±50% of CoinGecko's price, or CoinGecko has none).
    const hl = perp?.get(t.symbol.toUpperCase()) ?? null;
    const hlOk = hl && (!m?.priceUsd || Math.abs(hl.priceUsd / m.priceUsd - 1) < 0.5) ? hl : null;
    const price = hlOk?.priceUsd ?? m?.priceUsd ?? (t.circulatingSupply > 0 ? t.marketCap / t.circulatingSupply : null);
    const next = events[i]?.data.slice().sort((a, b) => a.unlockDate.localeCompare(b.unlockDate))[0] ?? null;
    let nextUnlock: ScreenRow["nextUnlock"] = null;
    if (next?.cliffUnlocks) {
      const amount = next.cliffUnlocks.cliffAmount;
      const byRecipient = new Map<RecipientClass, number>();
      for (const a of next.cliffUnlocks.allocationBreakdown ?? []) {
        const r = classifyRecipient(a.allocationName, a.standardAllocationName);
        byRecipient.set(r, (byRecipient.get(r) ?? 0) + a.cliffAmount);
      }
      const topRecipient = [...byRecipient.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      nextUnlock = {
        date: next.unlockDate,
        daysUntil: Math.round((new Date(next.unlockDate).getTime() - now) / 86_400_000),
        amount,
        valueUsd: price !== null ? amount * price : null,
        pctCirc: t.circulatingSupply > 0 ? (amount / t.circulatingSupply) * 100 : null,
        topRecipient,
      };
    }
    const card = cards[i];
    const grade: ScreenRow["grade"] =
      card && card.ok
        ? { level: card.card.level, score: card.card.level === "none" ? null : card.card.score, kind: "full" }
        : { level: sizeGrade(nextUnlock?.pctCirc ?? null), score: null, kind: "size" };
    const fund = funds.get(t.symbol.toUpperCase());
    return {
      rank: i + 1,
      id: t.id,
      symbol: t.symbol.toUpperCase(),
      name: t.name,
      image: m?.image ?? null,
      priceUsd: price,
      change24hPct: hlOk?.change24hPct ?? m?.change24hPct ?? null,
      change7dPct: m?.change7dPct ?? null,
      marketCapUsd: m?.marketCapUsd ?? (price !== null && t.circulatingSupply > 0 ? price * t.circulatingSupply : t.marketCap),
      fdvUsd: m?.fdvUsd ?? (price !== null && t.maxSupply > 0 ? price * t.maxSupply : null),
      volume24hUsd: m?.volume24hUsd ?? null,
      floatPct: t.maxSupply > 0 ? Math.min(100, (t.circulatingSupply / t.maxSupply) * 100) : null,
      lockedPct: t.maxSupply > 0 ? Math.min(100, (t.totalLockedAmount / t.maxSupply) * 100) : null,
      latestRound: fund?.latestRound ?? t.latestFundraisingRound ?? null,
      leadInvestors: fund?.leadInvestors ?? null,
      totalRaisedUsd: fund?.totalRaised ?? null,
      nextUnlock,
      grade,
    };
  });

  return {
    rows,
    windowDays: WINDOW_DAYS,
    sources: { tokens: list.source, market: markets || perp ? "live" : "tokenomist", asOf: list.asOf },
  };
}
