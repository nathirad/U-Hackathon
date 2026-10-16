// Optional paper broker. After the user approves a trade plan in the app, the paper order can
// also go to an Alpaca paper account (BROKER=alpaca-paper), so it fills against a real
// market feed instead of only our local book. Three rules keep this safe:
//   1. Only decideTradePlan() calls this, after the user's own approval. No agent tool and no
//      MCP tool can reach it, unlike broker MCP servers that hand the model an order tool.
//   2. The URL is Alpaca's paper endpoint, hard-coded. There is no setting for live trading.
//   3. Any failure keeps the local paper order and says why; the approval stands.
// Settings are read when an order is sent, so tests and restarts pick up changes.

import type { BrokerFill, PaperOrder } from "./types";

export const ALPACA_PAPER_URL = "https://paper-api.alpaca.markets";

// Coins Alpaca lists against USD that this app can trade (check /v2/assets before adding more).
export const ALPACA_CRYPTO = new Set(["BTC", "ETH", "AVAX", "ARB", "SOL", "LINK", "UNI", "AAVE", "DOGE", "LTC", "BCH", "DOT"]);

function settings() {
  const env = (name: string) => (process.env[name] ?? "").trim();
  return { adapter: env("BROKER") || "local", key: env("ALPACA_API_KEY"), secret: env("ALPACA_SECRET_KEY") };
}

/** "local" (paper orders stay in the app) or "alpaca-paper". */
export function brokerName(): "local" | "alpaca-paper" {
  return settings().adapter === "alpaca-paper" ? "alpaca-paper" : "local";
}

/**
 * Sends an approved paper order to Alpaca's paper account. Returns null when BROKER is local.
 * Buys are sized in USD (notional), sells in coin quantity. The plan id is the client order id,
 * so approving twice can't place two orders.
 */
export async function sendToBroker(
  order: Pick<PaperOrder, "planId" | "symbol" | "side" | "qty" | "amountThb" | "feeThb">,
  usdThb: number,
  fetchImpl: typeof fetch = fetch,
): Promise<BrokerFill | null> {
  const s = settings();
  if (s.adapter !== "alpaca-paper") return null;
  const venue = "alpaca-paper" as const;
  if (!s.key || !s.secret) return { venue, ok: false, note: "ALPACA_API_KEY / ALPACA_SECRET_KEY not set: kept as a local paper order" };
  if (!ALPACA_CRYPTO.has(order.symbol)) return { venue, ok: false, note: `${order.symbol} isn't traded on Alpaca: kept as a local paper order` };

  const body: Record<string, string> = {
    symbol: `${order.symbol}/USD`,
    side: order.side,
    type: "market",
    time_in_force: "gtc",
    client_order_id: order.planId,
  };
  if (order.side === "buy") body.notional = ((order.amountThb - order.feeThb) / usdThb).toFixed(2);
  else body.qty = order.qty.toFixed(8).replace(/\.?0+$/, "");

  try {
    const res = await fetchImpl(`${ALPACA_PAPER_URL}/v2/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", "APCA-API-KEY-ID": s.key, "APCA-API-SECRET-KEY": s.secret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const out = (await res.json().catch(() => ({}))) as { id?: string; status?: string; message?: string };
    if (!res.ok) return { venue, ok: false, note: `Alpaca paper said ${res.status}${out.message ? `: ${out.message}` : ""} · kept as a local paper order` };
    return { venue, ok: true, orderId: out.id, status: out.status, note: `Sent to the Alpaca paper account (${out.status ?? "accepted"})` };
  } catch (err) {
    const why = (err as Error).name === "TimeoutError" ? "timed out" : "network error";
    return { venue, ok: false, note: `Alpaca paper didn't answer (${why}) · kept as a local paper order` };
  }
}
