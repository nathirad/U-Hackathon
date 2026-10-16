// Trade plans and paper orders. The user picks the token, side and amount; U-Guard drafts the
// plan around that choice (size, stop-loss, what-if rows) and runs its checks. Every number
// here is arithmetic on the user's inputs, the quote and the wallet, or a dated historical
// average: no model picks tokens or predicts prices. The user approves; the order is a paper
// order whose approval is recorded on Avalanche Fuji (simulated without a key).

import { randomUUID } from "node:crypto";
import { runAgent } from "./agent";
import { recordMemo } from "./avalanche";
import { sendToBroker } from "./broker";
import { engineLabel, LEVEL_LABEL, thb } from "./format";
import { getMarketPulse } from "./intel/pulse";
import { getQuote, usdToThb } from "./market";
import { getHoldings } from "./portfolio";
import { assessUnlockRisk } from "./risk";
import { store } from "./store";
import { findToken } from "./tokenomist";
import type { PaperOrder, TradeCheck, TradePlan, TradeScenario, TradeSide } from "./types";

/** Assumed exchange fee, shown in the UI as an assumption. */
export const FEE_RATE = 0.0025;
const STABLES = new Set(["USDC", "USDT", "DAI"]);
const NAMES: Record<string, string> = { USDC: "USD Coin", USDT: "Tether", BTC: "Bitcoin", ETH: "Ethereum" };
const CONCENTRATION_PCT = 25;
const CHASE_PCT = 10;
const TEAM_UNLOCK_AVG_PCT = -25; // Keyrock, 16,000+ unlock events (see risk.ts)

export interface PlanInput {
  symbol: string;
  side: TradeSide;
  amountThb: number;
  orderType: "market" | "limit";
  limitPriceUsd?: number | null;
  stopLossPct?: number;
  riskBudgetPct?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const usdPrice = (p: number) => `$${p.toLocaleString("en-US", { maximumFractionDigits: p < 1 ? 4 : 2 })}`;
const qtyText = (q: number) => q.toLocaleString("en-US", { maximumFractionDigits: q < 1 ? 6 : q < 100 ? 4 : 2 });
const pct1 = (v: number) => `${v.toFixed(v < 1 ? 2 : 1)}%`;
const warnText = (n: number) => `U-Guard flags ${n === 1 ? "one thing" : `${n} things`} to look at`;

/** Wallet plus approved paper orders: cash (USDC) and each token's quantity. */
export async function paperWallet(userId: string) {
  const [holdings, fx] = await Promise.all([getHoldings(), usdToThb()]);
  const qty = new Map(holdings.map((h) => [h.symbol, h.amount]));
  const price = new Map(holdings.map((h) => [h.symbol, h.priceUsd]));
  for (const o of store.orders.get(userId) ?? []) {
    const sign = o.side === "buy" ? 1 : -1;
    qty.set(o.symbol, (qty.get(o.symbol) ?? 0) + sign * o.qty);
    // Paper orders settle against USDC at the order's own fill.
    const usdc = (o.side === "buy" ? -(o.amountThb + o.feeThb) : o.amountThb - o.feeThb) / fx;
    qty.set("USDC", (qty.get("USDC") ?? 0) + usdc);
    if (!price.has(o.symbol)) price.set(o.symbol, (await getQuote(o.symbol))?.priceUsd ?? o.priceUsd);
  }
  const valueThb = (s: string) => (qty.get(s) ?? 0) * (price.get(s) ?? 0) * fx;
  const totalThb = [...qty.keys()].reduce((sum, s) => sum + valueThb(s), 0);
  return { qty, price, fx, valueThb, totalThb };
}

export interface DraftOptions {
  /** Ask the in-app agent to explain the plan (an extra agent run). Off for MCP: U-Bot explains it itself. */
  explain?: boolean;
  /** Who drafted it: the app's own page, or U-Bot over MCP. */
  origin?: "app" | "mcp";
}

export async function draftTradePlan(input: PlanInput, userId: string, now: number, opts: DraftOptions = {}): Promise<TradePlan | { error: string }> {
  const sym = input.symbol.trim().toUpperCase();
  const quote = await getQuote(sym);
  if (!quote) return { error: `No ${sym} price in this demo yet` };
  const [{ token }, wallet, risk, pulse] = await Promise.all([
    findToken(sym),
    paperWallet(userId),
    assessUnlockRisk(sym, input.amountThb, { now, locale: "en" }),
    getMarketPulse(),
  ]);
  const fx = wallet.fx;
  const side = input.side;
  const amountThb = Math.round(input.amountThb);
  const stopLossPct = clamp(input.stopLossPct ?? 10, 2, 50);
  const riskBudgetPct = clamp(input.riskBudgetPct ?? 2, 0.5, 10);
  const limit = input.orderType === "limit" && input.limitPriceUsd && input.limitPriceUsd > 0 ? input.limitPriceUsd : null;
  const priceUsd = limit ?? quote.priceUsd;
  const feeThb = Math.round(amountThb * FEE_RATE);
  const qty = side === "buy" ? (amountThb - feeThb) / (priceUsd * fx) : amountThb / (priceUsd * fx);
  const stopPriceUsd = priceUsd * (1 - stopLossPct / 100);
  const maxLossThb = side === "buy" ? Math.round(amountThb * (stopLossPct / 100) + feeThb) : 0;
  const portfolioThb = wallet.totalThb;
  const maxSizeThb = Math.round((portfolioThb * riskBudgetPct) / stopLossPct);
  const positionThb = wallet.valueThb(sym);
  const positionAfter = side === "buy" ? positionThb + amountThb : Math.max(0, positionThb - amountThb);
  const positionPctAfter = portfolioThb > 0 ? (positionAfter / portfolioThb) * 100 : 0;
  const card = risk.ok ? risk.card : null;

  // ─── U-Guard checks ───
  const checks: TradeCheck[] = [];
  if (card && (card.level === "high" || card.level === "medium")) {
    checks.push({
      id: "unlock",
      status: side === "buy" ? "warn" : "ok",
      label: `Unlock coming up · ${LEVEL_LABEL[card.level]} risk ${card.score}/100`,
      detail: card.reasons[0] ?? card.headline,
    });
  } else {
    checks.push({
      id: "unlock",
      status: "ok",
      label: "No large unlock in the next 30 days",
      detail: card ? card.reasons[0] ?? card.headline : risk.ok ? "" : risk.reason,
    });
  }
  if (STABLES.has(sym)) {
    checks.push({ id: "stablecoin", status: "ok", label: "Stablecoin", detail: "Pegged to the dollar, so a stop-loss barely matters" });
  }
  if (side === "buy") {
    const cashThb = wallet.valueThb("USDC");
    checks.push(
      amountThb + feeThb > cashThb
        ? { id: "balance", status: "block", label: "Not enough USDC", detail: `You have about ${thb(cashThb)} in USDC, but this plan needs ${thb(amountThb + feeThb)}` }
        : { id: "balance", status: "ok", label: "Enough USDC", detail: `Uses ${thb(amountThb + feeThb)} of ${thb(cashThb)}` },
    );
    const lossPct = portfolioThb > 0 ? (maxLossThb / portfolioThb) * 100 : 0;
    checks.push(
      amountThb > maxSizeThb
        ? {
            id: "size",
            status: "warn",
            label: "Size is over your risk budget",
            detail: `If it falls to the −${stopLossPct}% stop-loss you lose ~${thb(maxLossThb)} = ${pct1(lossPct)} of the portfolio (budget ${riskBudgetPct}%) · a size within budget is up to ${thb(maxSizeThb)}`,
          }
        : {
            id: "size",
            status: "ok",
            label: "Size fits your risk budget",
            detail: `If it falls to the −${stopLossPct}% stop-loss you lose at most ~${thb(maxLossThb)} = ${pct1(lossPct)} of the portfolio (budget ${riskBudgetPct}%)`,
          },
    );
    if (!STABLES.has(sym)) {
      checks.push(
        positionPctAfter > CONCENTRATION_PCT
          ? { id: "concentration", status: "warn", label: `Portfolio would lean on ${sym}`, detail: `After this buy, ${sym} would be ${pct1(positionPctAfter)} of the portfolio (over ${CONCENTRATION_PCT}%)` }
          : { id: "concentration", status: "ok", label: "Portfolio stays spread out", detail: `After this buy, ${sym} would be ${pct1(positionPctAfter)} of the portfolio` },
      );
    }
    if (quote.change24hPct !== null && quote.change24hPct > CHASE_PCT) {
      checks.push({ id: "chase", status: "warn", label: "Price just jumped", detail: `Up ${quote.change24hPct.toFixed(1)}% in 24 hours: careful not to chase it (FOMO)` });
    }
  } else {
    const held = wallet.qty.get(sym) ?? 0;
    checks.push(
      qty > held + 1e-9
        ? { id: "balance", status: "block", label: `Not enough ${sym} in the wallet`, detail: `You hold ${qtyText(held)} ${sym}, but this plan sells ${qtyText(qty)}` }
        : { id: "balance", status: "ok", label: `Enough ${sym} to sell`, detail: `Sells ${qtyText(qty)} of ${qtyText(held)} ${sym}` },
    );
  }
  const verdict = checks.some((c) => c.status === "block") ? "blocked" : checks.some((c) => c.status === "warn") ? "caution" : "ready";

  // ─── What-if rows (arithmetic on the plan, or a cited historical average) ───
  const row = (label: string, pct: number, basis: string): TradeScenario => {
    const move = side === "buy" ? (amountThb - feeThb) * (pct / 100) - feeThb : -amountThb * (pct / 100); // sell: what you avoid or miss
    return { label, pct, priceUsd: priceUsd * (1 + pct / 100), pnlThb: Math.round(move), basis };
  };
  const scenarios: TradeScenario[] =
    side === "buy"
      ? [
          row("Stop-loss hit", -stopLossPct, "The level you set"),
          row("1:2 target hit", stopLossPct * 2, "A target worth twice the risk you take · arithmetic, not a price forecast"),
        ]
      : [
          row("Price falls after you sell", -stopLossPct, "What you avoid if the price falls by your stop-loss"),
          row("Price rises after you sell", stopLossPct * 2, "What you miss if the price rises twice your stop-loss"),
        ];
  const teamShare = card?.breakdown.filter((b) => b.recipient === "team").reduce((s, b) => s + b.share, 0) ?? 0;
  if (card && teamShare >= 0.3 && (card.timing === "upcoming" || card.timing === "recent")) {
    scenarios.push(row("Like past team unlocks", TEAM_UNLOCK_AVG_PCT, "Average price move around team unlocks (Keyrock, 16,000+ events) · a stop-loss would sell before this point"));
  }
  const im = pulse.data.impliedMove;
  if (im) {
    scenarios.push(row(`Options-implied downside (BTC, ${im.days} days)`, -im.pct, `The ±${im.pct.toFixed(1)}% range options give about 68% odds · altcoins usually swing more than BTC`));
  }

  const summary = [
    `${side === "buy" ? "Buy" : "Sell"} ${thb(amountThb)} of ${sym} ≈ ${qtyText(qty)} ${sym} at ${usdPrice(priceUsd)}${limit ? " (limit)" : ""}`,
    side === "buy"
      ? `Stop-loss −${stopLossPct}% at ${usdPrice(stopPriceUsd)} → max loss ~${thb(maxLossThb)}`
      : `About ${thb(amountThb - feeThb)} after fees · ${qtyText(Math.max(0, (wallet.qty.get(sym) ?? 0) - qty))} ${sym} left`,
    verdict === "blocked"
      ? `This plan can't go ahead: ${checks.find((c) => c.status === "block")!.detail}`
      : verdict === "caution"
        ? `${warnText(checks.filter((c) => c.status === "warn").length)} before you approve: ${checks.filter((c) => c.status === "warn").map((c) => c.label).join(" · ")}`
        : "Passes every U-Guard check · you decide",
  ];

  // The agent explains in its own words (Claude when configured; rules engine otherwise).
  let agent: TradePlan["agent"] = null;
  if (opts.explain !== false) {
    try {
      const message = side === "buy" ? `Buy ${amountThb.toLocaleString("en-US")} THB of ${sym}` : `Check ${sym} for me`;
      const res = await runAgent({ message, userId, scope: "user", now, route: "/api/trade/plan", locale: "en" });
      agent = { reply: res.reply, engine: engineLabel(res), trace: res.trace };
    } catch {
      agent = null;
    }
  }

  const plan: TradePlan = {
    id: randomUUID(),
    symbol: sym,
    name: token?.name ?? NAMES[sym] ?? sym,
    side,
    orderType: limit ? "limit" : "market",
    amountThb,
    priceUsd,
    quotePriceUsd: quote.priceUsd,
    usdThb: fx,
    qty,
    feeThb,
    stopLossPct,
    stopPriceUsd,
    maxLossThb,
    riskBudgetPct,
    maxSizeThb,
    portfolioThb: Math.round(portfolioThb),
    positionPctAfter,
    checks,
    scenarios,
    verdict,
    summary,
    card,
    agent,
    priceSource: quote.source,
    priceAsOf: quote.asOf,
    priceStale: quote.stale ?? false,
    createdAt: new Date(now).toISOString(),
    status: "pending",
    origin: opts.origin ?? "app",
  };
  store.tradePlans.set(plan.id, { plan, ownerId: userId });
  if (store.tradePlans.size > 500) store.tradePlans.delete(store.tradePlans.keys().next().value!);
  return plan;
}

export type DecideResult =
  | { ok: true; plan: TradePlan; order: PaperOrder | null }
  | { ok: false; status: number; error: string; plan?: TradePlan };

// Plans being approved right now: a double tap can't record or send the order twice.
const approving = new Set<string>();

export async function decideTradePlan(planId: string, decision: "approve" | "decline", userId: string): Promise<DecideResult> {
  const rec = store.tradePlans.get(planId);
  if (!rec || rec.ownerId !== userId) return { ok: false, status: 404, error: "Plan not found. Ask the AI to draft a new one." };
  const { plan } = rec;
  const orderFor = () => (store.orders.get(userId) ?? []).find((o) => o.planId === plan.id) ?? null;
  if (plan.status !== "pending") {
    const same = (plan.status === "approved") === (decision === "approve");
    return same ? { ok: true, plan, order: orderFor() } : { ok: false, status: 409, error: `This plan was already ${plan.status === "approved" ? "approved" : "declined"}`, plan };
  }
  if (decision === "decline") {
    plan.status = "declined";
    return { ok: true, plan, order: null };
  }
  if (plan.verdict === "blocked") return { ok: false, status: 409, error: "U-Guard's checks block this plan. Adjust it first.", plan };
  if (approving.has(plan.id)) return { ok: false, status: 409, error: "This plan is already being approved", plan };
  approving.add(plan.id);
  try {
    return await approve(plan, userId);
  } finally {
    approving.delete(plan.id);
  }
}

async function approve(plan: TradePlan, userId: string): Promise<DecideResult> {
  const memo = JSON.stringify({
    app: "U-Guard",
    v: 1,
    kind: "paper_trade",
    symbol: plan.symbol,
    side: plan.side,
    qty: Number(plan.qty.toFixed(6)),
    priceUsd: plan.priceUsd,
    stopUsd: Number(plan.stopPriceUsd.toFixed(6)),
    checks: plan.checks.filter((c) => c.status !== "ok").map((c) => c.id),
    approvedAt: new Date().toISOString(),
  });
  const receipt = await recordMemo(plan.id, memo);
  // Only after the user's approval: optionally mirror the order to the Alpaca paper account.
  const broker = await sendToBroker(
    { planId: plan.id, symbol: plan.symbol, side: plan.side, qty: plan.qty, amountThb: plan.amountThb, feeThb: plan.feeThb },
    plan.usdThb,
  );
  const order: PaperOrder = {
    id: randomUUID(),
    planId: plan.id,
    symbol: plan.symbol,
    side: plan.side,
    qty: plan.qty,
    priceUsd: plan.priceUsd,
    amountThb: plan.amountThb,
    feeThb: plan.feeThb,
    stopPriceUsd: plan.stopPriceUsd,
    at: new Date().toISOString(),
    receipt,
    ...(broker ? { broker } : {}),
  };
  plan.status = "approved";
  const list = store.orders.get(userId) ?? [];
  list.push(order);
  store.orders.set(userId, list.slice(-200));
  return { ok: true, plan, order };
}

/** Paper orders plus net positions (qty, average cost, value now, unrealised P/L). */
export async function tradingSummary(userId: string) {
  const orders = store.orders.get(userId) ?? [];
  const fx = await usdToThb();
  const bySym = new Map<string, { qty: number; cost: number }>();
  for (const o of orders) {
    const p = bySym.get(o.symbol) ?? { qty: 0, cost: 0 };
    if (o.side === "buy") {
      p.qty += o.qty;
      p.cost += o.amountThb;
    } else {
      const avg = p.qty > 0 ? p.cost / p.qty : 0;
      p.qty -= o.qty;
      p.cost -= avg * o.qty;
    }
    bySym.set(o.symbol, p);
  }
  const positions = await Promise.all(
    [...bySym.entries()]
      .filter(([, p]) => p.qty > 1e-9)
      .map(async ([symbol, p]) => {
        const price = (await getQuote(symbol))?.priceUsd ?? 0;
        const valueThb = p.qty * price * fx;
        return { symbol, qty: p.qty, costThb: Math.round(p.cost), valueThb: Math.round(valueThb), pnlThb: Math.round(valueThb - p.cost), priceUsd: price };
      }),
  );
  const pending = [...store.tradePlans.values()].filter((r) => r.ownerId === userId && r.plan.status === "pending").map((r) => r.plan).slice(-5);
  return { orders: [...orders].reverse(), positions, pending };
}
