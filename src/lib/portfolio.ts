// The user's U-topia wallet. Holdings come from the demo fixture (U-topia has no public
// wallet API yet); AVAX is replaced by the live Fuji balance when WALLET_ADDRESS is set. With a
// user id, the paper orders they approved are applied on top (buys add the token and spend
// USDC, sells do the reverse), so a trade shows up in the portfolio right away.

import { getAvaxBalance } from "./avalanche";
import { config } from "./config";
import { readFixture } from "./fixtures";
import { getQuote, usdToThb } from "./market";
import { store } from "./store";
import { listTokens } from "./tokenomist";
import type { Holding } from "./types";

interface PortfolioFixture {
  holdings: { symbol: string; amount: number }[];
}

const NAMES: Record<string, string> = { USDC: "USD Coin", USDT: "Tether", BTC: "Bitcoin", ETH: "Ethereum" };

export async function getHoldings(userId?: string): Promise<Holding[]> {
  const [fixture, fx, tokens] = await Promise.all([
    readFixture<PortfolioFixture>("portfolio.json"),
    usdToThb(),
    listTokens(),
  ]);
  const rows = (fixture?.holdings ?? []).map((r) => ({ ...r }));
  for (const o of userId ? (store.orders.get(userId) ?? []) : []) {
    const sign = o.side === "buy" ? 1 : -1;
    const row = rows.find((r) => r.symbol === o.symbol) ?? rows[rows.push({ symbol: o.symbol, amount: 0 }) - 1];
    row.amount = Math.max(0, row.amount + sign * o.qty);
    const usdc = rows.find((r) => r.symbol === "USDC") ?? rows[rows.push({ symbol: "USDC", amount: 0 }) - 1];
    usdc.amount = Math.max(0, usdc.amount + (o.side === "buy" ? -(o.amountThb + o.feeThb) : o.amountThb - o.feeThb) / fx);
  }
  const liveAvax = config.avalanche.walletAddress ? await getAvaxBalance(config.avalanche.walletAddress) : null;

  return Promise.all(
    rows.map(async (row): Promise<Holding> => {
      const isLiveAvax = row.symbol === "AVAX" && liveAvax !== null;
      const amount = isLiveAvax ? liveAvax : row.amount;
      const quote = await getQuote(row.symbol);
      const priceUsd = quote?.priceUsd ?? 0;
      const name = tokens.data.find((t) => t.symbol === row.symbol)?.name ?? NAMES[row.symbol] ?? row.symbol;
      return {
        symbol: row.symbol,
        name,
        amount,
        priceUsd,
        valueUsd: amount * priceUsd,
        valueThb: amount * priceUsd * fx,
        source: isLiveAvax ? "live" : "sample",
        asOf: quote?.asOf,
      };
    }),
  );
}
