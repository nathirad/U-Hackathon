// Tokenomist API v5 client (https://docs.tokenomist.ai/api-documents/introduction).
// Live when TOKENOMIST_API_KEY is set; on a missing key or any API error it reads the
// matching file under data/fixtures/tokenomist and marks the result as "snapshot" or "sample".

import { config } from "./config";
import { readFixture } from "./fixtures";
import { logEvent } from "./log";
import type { DataSource, Sourced } from "./types";

// ─── Response shapes (subset of the v5 schema we use) ───────────────────────

export interface TokenListItem {
  id: string; // slug, used as tokenId in every other endpoint
  name: string;
  symbol: string;
  circulatingSupply: number;
  marketCap: number;
  maxSupply: number;
  totalLockedAmount: number;
  hasFundraising: boolean;
  latestFundraisingRound: string | null;
  websiteUrl: string;
  lastUpdatedDate: string;
}

export interface AllocationUnlock {
  unlockDate: string;
  allocationName: string;
  standardAllocationName: string;
  cliffAmount: number;
  cliffValue: number;
  referencePrice: number;
}

export interface LinearAllocationUnlock {
  allocationName: string;
  standardAllocationName: string;
  linearAmount?: number;
  amount?: number;
}

export interface UnlockEvent {
  unlockDate: string;
  endDate?: string; // linear windows only
  tokenName: string;
  tokenSymbol: string;
  cliffUnlocks?: {
    cliffAmount: number;
    cliffValue: number;
    valueToMarketCap: number;
    allocationBreakdown: AllocationUnlock[];
  };
  // Linear (continuous) releases. The fixtures use this shape; map the live v5 field names
  // here once a snapshot shows them (see npm run snapshot).
  linearUnlocks?: {
    linearAmount?: number;
    amount?: number;
    allocationBreakdown?: LinearAllocationUnlock[];
  };
}

export interface AllocationsData {
  name: string;
  symbol: string;
  maxSupply: number;
  totalUnlockedAmount: number;
  totalLockedAmount: number;
  allocations: {
    allocationName: string;
    standardAllocationName: string;
    allocationUnlockedAmount: number;
    allocationLockedAmount: number;
    allocationAmount: number;
    trackedAllocationPercentage: number;
  }[];
}

export interface FundraisingData {
  tokenId: string;
  tokenSymbol: string;
  totalAmountRaised: number | null;
  investorReleasedPercentage: number | null;
  fundingRounds: {
    fundingRound: string;
    fundingDate: string;
    amountRaised: number | null;
    valuation: number | null;
    pricePerToken: number | null;
    numberOfInvestors: number | null;
  }[];
}

interface Envelope<T> {
  metadata?: { queryDate?: string; mode?: DataSource };
  status: boolean;
  data: T;
}

// ─── Transport ──────────────────────────────────────────────────────────────

const TTL_MS = 10 * 60 * 1000;
// After a failed live call the saved fallback is kept for 5 minutes, so a rate limit doesn't turn
// into a retry storm (several servers share one API key).
const FALLBACK_TTL_MS = 5 * 60 * 1000;
// On globalThis so every route (and the warm-up at server start) shares one cache.
const g = globalThis as typeof globalThis & {
  __ugTokenomist?: { cache: Map<string, { at: number; ttl: number; value: Sourced<unknown> }>; pending: Map<string, Promise<Sourced<unknown>>> };
};
const shared = (g.__ugTokenomist ??= { cache: new Map(), pending: new Map() });
const cache = shared.cache;
// One request per key at a time: pages opened together wait on the same call instead of repeating it.
const pending = shared.pending;
// The last successful live response per key, kept past the TTL: if Tokenomist fails later,
// answers use this copy marked stale rather than dropping to saved fixture data.
const lastGood = new Map<string, Sourced<unknown>>();

// The API rate-limits bursts (429 with retry-after), so at most a few calls run at once and
// call starts are spaced out (~8 a second).
const MAX_IN_FLIGHT = 4;
const SPACING_MS = 120;
let inFlight = 0;
let nextStart = 0;
const waiting: (() => void)[] = [];

async function fetchLive<T>(pathAndQuery: string, retry = true): Promise<Envelope<T>> {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((go) => waiting.push(go));
  inFlight++;
  const wait = nextStart - Date.now();
  nextStart = Math.max(Date.now(), nextStart) + SPACING_MS;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  let res: Response;
  try {
    res = await fetch(`${config.tokenomist.baseUrl}${pathAndQuery}`, {
      headers: { "x-api-key": config.tokenomist.apiKey },
      cache: "no-store",
    });
  } finally {
    inFlight--;
    waiting.shift()?.();
  }
  if (res.status === 429 && retry) {
    const waitS = Math.min(3, Number(res.headers.get("retry-after")) || 1);
    await new Promise((r) => setTimeout(r, waitS * 1000));
    return fetchLive<T>(pathAndQuery, false);
  }
  if (!res.ok) {
    throw new Error(`Tokenomist ${res.status} on ${pathAndQuery.split("?")[0]}`);
  }
  return (await res.json()) as Envelope<T>;
}

async function load<T>(
  cacheKey: string,
  livePath: string,
  fixturePath: string[],
  empty: T,
): Promise<Sourced<T>> {
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value as Sourced<T>;
  // Expired live copy: answer with it now and refresh in the background (stale-while-revalidate),
  // so a page never waits on Tokenomist for data it already has. Unlock schedules change rarely.
  if (hit && hit.value.source === "live" && !hit.value.stale) {
    void refresh(cacheKey, livePath, fixturePath, empty);
    return hit.value as Sourced<T>;
  }
  return refresh(cacheKey, livePath, fixturePath, empty);
}

function refresh<T>(cacheKey: string, livePath: string, fixturePath: string[], empty: T): Promise<Sourced<T>> {
  let p = pending.get(cacheKey);
  if (!p) {
    p = fetchOrFallback(cacheKey, livePath, fixturePath, empty).finally(() => pending.delete(cacheKey));
    pending.set(cacheKey, p);
  }
  return p as Promise<Sourced<T>>;
}

async function fetchOrFallback<T>(cacheKey: string, livePath: string, fixturePath: string[], empty: T): Promise<Sourced<T>> {
  let warning: string | undefined;
  if (config.tokenomist.apiKey) {
    try {
      const body = await fetchLive<T>(livePath);
      const value: Sourced<T> = {
        // The API can answer 200 with `data: null` (e.g. no daily emission for a token).
        data: body.data ?? empty,
        source: "live",
        asOf: body.metadata?.queryDate ?? new Date().toISOString(),
      };
      cache.set(cacheKey, { at: Date.now(), ttl: TTL_MS, value });
      lastGood.set(cacheKey, value);
      return value;
    } catch (err) {
      logEvent("tokenomist.fallback", { path: livePath.split("?")[0], error: (err as Error).message });
      const good = lastGood.get(cacheKey);
      if (good) {
        const value = { ...(good as Sourced<T>), stale: true, warning: `${(err as Error).message}; showing the last good copy` };
        cache.set(cacheKey, { at: Date.now(), ttl: FALLBACK_TTL_MS, value });
        return value;
      }
      // e.g. 429 after a burst, or 403 for datasets outside the plan
      warning = `${(err as Error).message}; using saved data`;
    }
  }

  // Fixture files say whether they hold a real snapshot (npm run snapshot, or public
  // reporting) or illustrative sample data.
  const fixture = await readFixture<Envelope<T>>(...fixturePath);
  const value: Sourced<T> = {
    data: fixture?.data ?? empty,
    source: fixture?.metadata?.mode === "snapshot" ? "snapshot" : "sample",
    asOf: fixture?.metadata?.queryDate ?? new Date().toISOString(),
    warning,
  };
  cache.set(cacheKey, { at: Date.now(), ttl: config.tokenomist.apiKey ? FALLBACK_TTL_MS : TTL_MS, value });
  return value;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function listTokens(): Promise<Sourced<TokenListItem[]>> {
  return load<TokenListItem[]>("list", "/v5/token/list", ["tokenomist", "token-list.json"], []);
}

/** Tokens scored in full when Tokenomist is live, on top of the snapshot ones (TRACKED_TOKENS overrides). */
const DEFAULT_TRACKED = "ARB,WLD,AVAX,OP,SUI,APT,TIA,STRK,ZRO,ENA";
const MAX_TRACKED = 12;

/**
 * Tokens U-Guard follows in full on the ticker, calendar and Today page. Offline: the ones kept in
 * the dated snapshot. Live: those plus TRACKED_TOKENS (default a list of tokens with regular
 * unlocks), at most 12. The live list has every token Tokenomist covers (650+), and scoring all
 * of them at once trips the API's rate limit. Any other token can still be looked up one at a
 * time (findToken), and the screener shows the next cliff of the 40 largest.
 */
export async function trackedTokens(): Promise<Sourced<TokenListItem[]>> {
  const [list, snapshot] = await Promise.all([
    listTokens(),
    readFixture<Envelope<TokenListItem[]>>("tokenomist", "token-list.json"),
  ]);
  const ids = new Set((snapshot?.data ?? []).map((t) => t.id));
  if (list.source === "live") {
    const wanted = (process.env.TRACKED_TOKENS?.trim() || DEFAULT_TRACKED)
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    for (const sym of wanted) {
      if (ids.size >= MAX_TRACKED) break;
      // Several tokens can share a ticker; take the largest.
      const t = list.data.filter((x) => x.symbol.toUpperCase() === sym).sort((a, b) => b.marketCap - a.marketCap)[0];
      if (t) ids.add(t.id);
    }
  }
  return ids.size ? { ...list, data: list.data.filter((t) => ids.has(t.id)) } : list;
}

/** Resolves a ticker or name ("arb", "WLD", "Avalanche") to a Tokenomist token. */
export async function findToken(query: string): Promise<{ token: TokenListItem | null; meta: Sourced<unknown> }> {
  const list = await listTokens();
  const q = query.trim().toLowerCase();
  // Several tokens can share a ticker; prefer the largest market cap.
  const matches = list.data
    .filter((t) => t.symbol.toLowerCase() === q || t.id.toLowerCase() === q || t.name.toLowerCase() === q)
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
  return { token: matches[0] ?? null, meta: list };
}

/** Cliff unlocks only: one call, no daily-emission fold-in (the screener's next-unlock column). */
export async function getCliffEvents(tokenId: string, start: string, end: string): Promise<Sourced<UnlockEvent[]>> {
  const qs = new URLSearchParams({ start, end, pageSize: "50" });
  const res = await load<UnlockEvent[]>(
    `unlocks:${tokenId}:${start}:${end}`,
    `/v5/unlock/events/${encodeURIComponent(tokenId)}?${qs}`,
    ["tokenomist", "unlock-events", `${tokenId}.json`],
    [],
  );
  const day = (iso: string) => iso.slice(0, 10);
  return { ...res, data: (res.data ?? []).filter((e) => (e.cliffUnlocks?.cliffAmount ?? 0) > 0 && day(e.unlockDate) >= start && day(e.unlockDate) <= end) };
}

export async function getUnlockEvents(tokenId: string, start: string, end: string): Promise<Sourced<UnlockEvent[]>> {
  const qs = new URLSearchParams({ start, end, pageSize: "50" });
  const res = await load<UnlockEvent[]>(
    `unlocks:${tokenId}:${start}:${end}`,
    `/v5/unlock/events/${encodeURIComponent(tokenId)}?${qs}`,
    ["tokenomist", "unlock-events", `${tokenId}.json`],
    [],
  );
  // Fixtures hold every event; apply the same window the live API applies. A linear
  // window counts when it overlaps the requested range.
  const events = (res.data ?? []).filter(
    (e) => e.unlockDate.slice(0, 10) <= end && (e.endDate ?? e.unlockDate).slice(0, 10) >= start,
  );
  if (events.some((e) => e.linearUnlocks)) return { ...res, data: events };

  // The v5 events endpoint lists cliffs only. Continuous releases (e.g. WLD's ~2.9M a day)
  // are in daily emission; fold them into one linear event so the scorer and the forecast
  // see them. Without this, a token that unlocks every day reads as "no unlock".
  const emission = await getDailyEmission(tokenId, start, end);
  const linear = linearFromEmission(emission.data ?? [], events, start, end);
  return linear ? { ...res, data: [...events, linear] } : { ...res, data: events };
}

export interface EmissionDay {
  startDate: string;
  endDate: string;
  tokenName: string;
  tokenSymbol: string;
  unlockAmount: number;
  allocations?: { allocationName: string; standardAllocationName: string; unlockAmount: number }[];
}

export function getDailyEmission(tokenId: string, start: string, end: string): Promise<Sourced<EmissionDay[]>> {
  // One page of 100 days covers every window the app asks for (the scorer looks ~74 days).
  const qs = new URLSearchParams({ start, end, pageSize: "100" });
  return load<EmissionDay[]>(
    `emission:${tokenId}:${start}:${end}`,
    `/v5/daily-emission/${encodeURIComponent(tokenId)}?${qs}`,
    ["tokenomist", "daily-emission", `${tokenId}.json`],
    [],
  );
}

/**
 * Daily emission inside [start, end] as one linear event. Days that already carry a cliff
 * event are left out, so a monthly cliff (ARB) is never counted twice.
 */
export function linearFromEmission(days: EmissionDay[], cliffs: UnlockEvent[], start: string, end: string): UnlockEvent | null {
  const cliffDays = new Set(cliffs.filter((e) => e.cliffUnlocks).map((e) => e.unlockDate.slice(0, 10)));
  const rows = days
    .filter((d) => d.unlockAmount > 0 && d.startDate.slice(0, 10) >= start && d.startDate.slice(0, 10) <= end)
    .filter((d) => !cliffDays.has(d.startDate.slice(0, 10)))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (rows.length === 0) return null;
  const byAllocation = new Map<string, LinearAllocationUnlock>();
  for (const r of rows) {
    for (const a of r.allocations ?? []) {
      const prev = byAllocation.get(a.allocationName);
      if (prev) prev.linearAmount = (prev.linearAmount ?? 0) + a.unlockAmount;
      else byAllocation.set(a.allocationName, { allocationName: a.allocationName, standardAllocationName: a.standardAllocationName, linearAmount: a.unlockAmount });
    }
  }
  return {
    unlockDate: rows[0].startDate,
    endDate: rows[rows.length - 1].endDate,
    tokenName: rows[0].tokenName,
    tokenSymbol: rows[0].tokenSymbol,
    linearUnlocks: {
      linearAmount: rows.reduce((sum, r) => sum + r.unlockAmount, 0),
      allocationBreakdown: [...byAllocation.values()],
    },
  };
}

export function getAllocations(tokenId: string): Promise<Sourced<AllocationsData | null>> {
  return load<AllocationsData | null>(
    `alloc:${tokenId}`,
    `/v5/allocations/${encodeURIComponent(tokenId)}`,
    ["tokenomist", "allocations", `${tokenId}.json`],
    null,
  );
}

export function getFundraising(tokenId: string): Promise<Sourced<FundraisingData | null>> {
  return load<FundraisingData | null>(
    `fund:${tokenId}`,
    `/v5/fundraising/token/${encodeURIComponent(tokenId)}`,
    ["tokenomist", "fundraising", `${tokenId}.json`],
    null,
  );
}
