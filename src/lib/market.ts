// Price and 24h volume. Tokenomist has no trading volume, which the risk score needs
// (unlock value ÷ daily volume): prices from Hyperliquid, volume from CoinGecko, or the fixture.

import { config } from "./config";
import { readFixture } from "./fixtures";
import type { DataSource } from "./types";

// Ticker → CoinGecko id. Add a row for every token you demo with MARKET_SOURCE=live.
export const COINGECKO_IDS: Record<string, string> = {
  ARB: "arbitrum",
  WLD: "worldcoin-wld",
  AVAX: "avalanche-2",
  USDC: "usd-coin",
  USDT: "tether",
  BTC: "bitcoin",
  ETH: "ethereum",
};

export interface MarketQuote {
  symbol: string;
  priceUsd: number;
  volume24hUsd: number;
  change24hPct: number | null;
  source: DataSource;
  asOf: string; // when the price was observed (ISO)
  stale?: boolean; // live source stopped answering; this is its last good answer
}

interface MarketFixture {
  asOf: string;
  usdThb: number;
  tokens: Record<string, { priceUsd: number; volume24hUsd: number; change24hPct?: number | null }>;
}

let fixtureCache: MarketFixture | null = null;
async function fixture(): Promise<MarketFixture> {
  fixtureCache ??= (await readFixture<MarketFixture>("market.json")) ?? { asOf: "", usdThb: 32.5, tokens: {} };
  return fixtureCache;
}

export async function usdToThb(): Promise<number> {
  return (await fixture()).usdThb;
}

// ─── Live prices ──────────────────────────────────────────────────────────────────
// Price and 24h change come from Hyperliquid's public market data (free, no key, one call for
// every listed token, generous limits). CoinGecko's free API adds aggregated spot volume, but it
// rate-limits shared IPs (venue Wi-Fi, serverless hosts), so it is called at most every 10
// minutes and its last good answer is kept. Volume falls back to the market fixture.

interface PerpCtx {
  priceUsd: number;
  change24hPct: number | null;
}

let perps: { at: number; ctx: Map<string, PerpCtx> } | null = null;
let perpsInFlight: Promise<Map<string, PerpCtx> | null> | null = null;

/** Hyperliquid mark price and 24h change for every perp, keyed by ticker. Cached 30 s. */
export async function perpPrices(): Promise<Map<string, PerpCtx> | null> {
  if (perps && Date.now() - perps.at < 30_000) return perps.ctx;
  perpsInFlight ??= (async () => {
    try {
      const res = await fetch("https://api.hyperliquid.xyz/info", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "metaAndAssetCtxs" }),
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return perps?.ctx ?? null;
      const [meta, ctxs] = (await res.json()) as [{ universe: { name: string }[] }, { markPx: string; prevDayPx: string }[]];
      const ctx = new Map<string, PerpCtx>();
      meta.universe.forEach((u, i) => {
        const mark = Number(ctxs[i]?.markPx);
        const prev = Number(ctxs[i]?.prevDayPx);
        if (mark > 0) ctx.set(u.name.toUpperCase(), { priceUsd: mark, change24hPct: prev > 0 ? ((mark - prev) / prev) * 100 : null });
      });
      perps = { at: Date.now(), ctx };
      return ctx;
    } catch {
      return perps?.ctx ?? null;
    } finally {
      perpsInFlight = null;
    }
  })();
  return perpsInFlight;
}

const GECKO_TTL_MS = 10 * 60_000;
let gecko: { at: number; quotes: Map<string, { priceUsd: number; volume24hUsd: number; change24hPct: number | null }> } | null = null;
let geckoInFlight: Promise<void> | null = null;

/** CoinGecko spot volume (and a backup price) for the known symbols, refreshed every 10 minutes. */
async function geckoQuotes() {
  if (!(gecko && Date.now() - gecko.at < GECKO_TTL_MS)) {
    geckoInFlight ??= (async () => {
      try {
        const ids = [...new Set(Object.values(COINGECKO_IDS))].join(",");
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true`,
          { cache: "no-store", signal: AbortSignal.timeout(5000) },
        );
        if (!res.ok) {
          if (gecko) gecko.at = Date.now() - GECKO_TTL_MS + 60_000; // retry in a minute, keep the old data
          return;
        }
        const body = (await res.json()) as Record<string, { usd: number; usd_24h_vol: number; usd_24h_change?: number }>;
        const quotes = new Map<string, { priceUsd: number; volume24hUsd: number; change24hPct: number | null }>();
        for (const [sym, id] of Object.entries(COINGECKO_IDS)) {
          const q = body[id];
          if (q) quotes.set(sym, { priceUsd: q.usd, volume24hUsd: q.usd_24h_vol, change24hPct: q.usd_24h_change ?? null });
        }
        gecko = { at: Date.now(), quotes };
      } catch {
        // keep whatever we had
      } finally {
        geckoInFlight = null;
      }
    })();
    // Don't make callers wait on CoinGecko when we already have an answer.
    if (!gecko) await geckoInFlight;
  }
  return gecko?.quotes ?? null;
}

// Older than this, a cached live answer means the source stopped answering (refresh is 30 s for
// Hyperliquid, 10 min for CoinGecko), so the quote is labelled "may be out of date".
const PERP_STALE_MS = 3 * 60_000;
const GECKO_STALE_MS = 20 * 60_000;

export async function getQuote(symbol: string): Promise<MarketQuote | null> {
  const sym = symbol.toUpperCase();
  const fx = await fixture();
  const row = fx.tokens[sym];
  if (config.market.source === "live") {
    const [perp, cg] = await Promise.all([perpPrices(), COINGECKO_IDS[sym] ? geckoQuotes() : Promise.resolve(null)]);
    const p = perp?.get(sym);
    const g = cg?.get(sym);
    const priceUsd = p?.priceUsd ?? g?.priceUsd;
    if (priceUsd) {
      const at = p ? (perps?.at ?? Date.now()) : (gecko?.at ?? Date.now());
      return {
        symbol: sym,
        priceUsd,
        volume24hUsd: g?.volume24hUsd ?? row?.volume24hUsd ?? 0,
        change24hPct: p?.change24hPct ?? g?.change24hPct ?? null,
        source: "live",
        asOf: new Date(at).toISOString(),
        ...(Date.now() - at > (p ? PERP_STALE_MS : GECKO_STALE_MS) ? { stale: true } : {}),
      };
    }
  }
  return row
    ? { symbol: sym, priceUsd: row.priceUsd, volume24hUsd: row.volume24hUsd, change24hPct: row.change24hPct ?? null, source: "sample", asOf: fx.asOf }
    : null;
}

export interface MarketRow {
  id: string;
  priceUsd: number | null;
  change24hPct: number | null;
  change7dPct: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  volume24hUsd: number | null;
  image: string | null;
}

let marketsCache: { at: number; key: string; rows: Map<string, MarketRow> } | null = null;

/**
 * Market data for many tokens in one call (CoinGecko /coins/markets). Tokenomist's token ids
 * are CoinGecko ids ("arbitrum", "worldcoin-wld"), so the screener can join them directly.
 * Returns null when live market data is off or the call fails.
 */
export async function getMarkets(ids: string[]): Promise<Map<string, MarketRow> | null> {
  if (config.market.source !== "live" || ids.length === 0) return null;
  const key = [...ids].sort().join(",");
  if (marketsCache && marketsCache.key === key && Date.now() - marketsCache.at < GECKO_TTL_MS) return marketsCache.rows;
  try {
    const qs = new URLSearchParams({ vs_currency: "usd", ids: ids.join(","), per_page: "100", price_change_percentage: "24h,7d" });
    const res = await fetch(`https://api.coingecko.com/api/v3/coins/markets?${qs}`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!res.ok) return marketsCache?.rows ?? null;
    const body = (await res.json()) as {
      id: string;
      current_price: number | null;
      market_cap: number | null;
      fully_diluted_valuation: number | null;
      total_volume: number | null;
      image: string | null;
      price_change_percentage_24h_in_currency?: number | null;
      price_change_percentage_7d_in_currency?: number | null;
    }[];
    const rows = new Map<string, MarketRow>(
      body.map((c) => [
        c.id,
        {
          id: c.id,
          priceUsd: c.current_price,
          change24hPct: c.price_change_percentage_24h_in_currency ?? null,
          change7dPct: c.price_change_percentage_7d_in_currency ?? null,
          marketCapUsd: c.market_cap,
          fdvUsd: c.fully_diluted_valuation,
          volume24hUsd: c.total_volume,
          image: c.image,
        },
      ]),
    );
    marketsCache = { at: Date.now(), key, rows };
    return rows;
  } catch {
    return marketsCache?.rows ?? null;
  }
}
