"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ensureSession } from "@/components/EnsureSession";
import { thb } from "@/lib/format";
import { asOfLabel } from "@/lib/freshness";
import type { PaperOrder, TradePlan, TradeSide } from "@/lib/types";

export const TRADE_EVENT = "trade:changed";

const VERDICT = {
  ready: { th: "Passed the checks", lv: "lv-low" },
  caution: { th: "Review before approving", lv: "lv-medium" },
  blocked: { th: "This plan can't go ahead", lv: "lv-high" },
} as const;
const MARK = { ok: "✓", warn: "!", block: "✕" } as const;

const usdP = (p: number) => `$${p.toLocaleString("en-US", { maximumFractionDigits: p < 1 ? 4 : 2 })}`;
const qtyT = (q: number) => q.toLocaleString("en-US", { maximumFractionDigits: q < 1 ? 6 : q < 100 ? 4 : 2 });
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${thb(Math.abs(n))}`;

/** The plan U-Bot drafted: summary, numbers, U-Guard checks, what-if rows, and the approval buttons. */
export function TradePlanCard({ plan, onDone }: { plan: TradePlan; onDone?: (order: PaperOrder | null) => void }) {
  const [state, setState] = useState<"pending" | "busy" | "approved" | "declined">(plan.status === "pending" ? "pending" : plan.status);
  const [order, setOrder] = useState<PaperOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const v = VERDICT[plan.verdict];

  async function decide(decision: "approve" | "decline") {
    setState("busy");
    setError(null);
    try {
      const res = await fetch("/api/trade/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, decision }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't save");
      setOrder(body.order ?? null);
      setState(decision === "approve" ? "approved" : "declined");
      window.dispatchEvent(new Event(TRADE_EVENT));
      onDone?.(body.order ?? null);
    } catch (err) {
      setError((err as Error).message);
      setState("pending");
    }
  }

  return (
    <article className={`tp-plan ${v.lv}`} aria-label={`Plan to ${plan.side === "buy" ? "buy" : "sell"} ${plan.symbol}`}>
      <div className="tp-plan-head">
        <b>{plan.origin === "mcp" ? "Drafted by U-Bot in chat (MCP)" : "Plan drafted by U-Bot"}</b>
        <span className="tp-verdict">
          <span className="dot" />
          {v.th}
        </span>
      </div>
      <ul className="tp-summary">
        {plan.summary.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>

      <dl className="tp-nums">
        <div><dt>Amount</dt><dd>{qtyT(plan.qty)} {plan.symbol}</dd></div>
        <div><dt>Price{plan.orderType === "limit" ? " (limit)" : ""} {asOfLabel(plan.priceAsOf, plan.priceStale)}</dt><dd>{usdP(plan.priceUsd)}</dd></div>
        <div><dt>Fee (assumed 0.25%)</dt><dd>{thb(plan.feeThb)}</dd></div>
        {plan.side === "buy" && (
          <>
            <div><dt>Stop-loss −{plan.stopLossPct}%</dt><dd>{usdP(plan.stopPriceUsd)}</dd></div>
            <div><dt>Max loss (if stopped out)</dt><dd>{thb(plan.maxLossThb)}</dd></div>
            <div><dt>{plan.symbol} after buying</dt><dd>{plan.positionPctAfter.toFixed(1)}% of portfolio</dd></div>
          </>
        )}
      </dl>

      <h4 className="tp-sub">U-Guard checks</h4>
      <ul className="tp-checks">
        {plan.checks.map((c) => (
          <li key={c.id} className={`tp-check ${c.status}`}>
            <span className="tp-mark" aria-hidden="true">{MARK[c.status]}</span>
            <span>
              <b>{c.label}</b>
              {c.detail && <small>{c.detail}</small>}
            </span>
          </li>
        ))}
      </ul>

      <h4 className="tp-sub">If the price goes to</h4>
      <div className="table-scroll">
        <table className="t-table tp-table">
          <thead>
            <tr><th>Case</th><th className="num">Price</th><th className="num">{plan.side === "buy" ? "P&L" : "Effect for you"}</th></tr>
          </thead>
          <tbody>
            {plan.scenarios.map((s) => (
              <tr key={s.label} title={s.basis}>
                <td>
                  {s.label} <span className="note">({s.pct > 0 ? "+" : ""}{s.pct.toFixed(1)}%)</span>
                  <small className="tp-basis">{s.basis}</small>
                </td>
                <td className="num">{usdP(s.priceUsd)}</td>
                <td className={`num ${s.pnlThb >= 0 ? "pos" : "neg"}`}>{signed(s.pnlThb)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {plan.agent && (
        <details className="tp-agent">
          <summary>U-Bot's explanation · {plan.agent.engine} · {plan.agent.trace.length} steps</summary>
          <p>{plan.agent.reply}</p>
        </details>
      )}

      {state === "approved" && (
        <p className="receipt">
          Approved · paper order {order ? `${qtyT(order.qty)} ${order.symbol}` : ""} · recorded on {order?.receipt.chain ?? "Avalanche"}
          {order?.receipt.explorerUrl ? (
            <>
              {" "}·{" "}
              <a href={order.receipt.explorerUrl} target="_blank" rel="noreferrer">View transaction</a>
            </>
          ) : order?.receipt.note ? (
            <> · {order.receipt.note}</>
          ) : null}{" "}
          · <Link href="/terminal/trade">All orders</Link>
        </p>
      )}
      {state === "declined" && <p className="receipt">Plan declined. No order was placed.</p>}
      {(state === "pending" || state === "busy") && (
        <div className="tp-actions">
          <button className="btn btn-primary" disabled={state === "busy" || plan.verdict === "blocked"} onClick={() => decide("approve")}>
            {state === "busy" ? "Saving…" : plan.side === "buy" ? "Approve buy (paper)" : "Approve sell (paper)"}
          </button>
          <button className="btn" disabled={state === "busy"} onClick={() => decide("decline")}>
            Decline
          </button>
          {error && <span className="error">{error}</span>}
        </div>
      )}
    </article>
  );
}

/** Order ticket: the user picks side, amount and order type; U-Bot drafts the plan around it. */
export function TradePanel({ symbol, defaultAmount = 5000, defaultSide = "buy" }: { symbol: string; defaultAmount?: number; defaultSide?: TradeSide }) {
  const [side, setSide] = useState<TradeSide>(defaultSide);
  useEffect(() => setSide(defaultSide), [defaultSide]);
  const [amount, setAmount] = useState(String(defaultAmount));
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [stop, setStop] = useState("10");
  const [budget, setBudget] = useState("2");
  const [plan, setPlan] = useState<TradePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPlan(null);
    setError(null);
  }, [symbol]);

  async function draft(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setPlan(null);
    try {
      await ensureSession();
      const res = await fetch("/api/trade/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          side,
          amountThb: Number(amount.replace(/,/g, "")),
          orderType,
          limitPriceUsd: orderType === "limit" && limitPrice ? Number(limitPrice) : null,
          stopLossPct: Number(stop),
          riskBudgetPct: Number(budget),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't draft the plan");
      setPlan(body as TradePlan);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel tp" aria-label={`Trade ${symbol}`}>
      <div className="panel-head">
        <h2>Trade {symbol}</h2>
        <span className="total">paper trading</span>
      </div>
      <form onSubmit={draft} className="tp-form">
        <div className="tp-side" role="radiogroup" aria-label="Buy or sell">
          <button type="button" role="radio" aria-checked={side === "buy"} className={side === "buy" ? "on buy" : ""} onClick={() => setSide("buy")}>
            Buy
          </button>
          <button type="button" role="radio" aria-checked={side === "sell"} className={side === "sell" ? "on sell" : ""} onClick={() => setSide("sell")}>
            Sell
          </button>
        </div>
        <label>
          Amount (THB)
          <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <div className="tp-presets">
          {[1000, 5000, 20000].map((n) => (
            <button type="button" key={n} className="chip" onClick={() => setAmount(String(n))}>
              {thb(n)}
            </button>
          ))}
        </div>
        <div className="tp-row">
          <label>
            Order type
            <select value={orderType} onChange={(e) => setOrderType(e.target.value as "market" | "limit")}>
              <option value="market">Market</option>
              <option value="limit">Limit</option>
            </select>
          </label>
          {orderType === "limit" && (
            <label>
              Limit price ($)
              <input inputMode="decimal" value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} placeholder="0.17" />
            </label>
          )}
        </div>
        <details className="tp-adv">
          <summary>Risk settings</summary>
          <div className="tp-row">
            <label>
              Stop-loss (%)
              <input inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} />
            </label>
            <label>
              Risk budget per trade (% of portfolio)
              <input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </label>
          </div>
        </details>
        <button className="btn btn-primary tp-go" type="submit" disabled={busy}>
          {busy ? "U-Bot is drafting…" : "Let AI draft a plan and check the risk"}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
      {plan && <TradePlanCard key={plan.id} plan={plan} />}
      <p className="note tp-foot">You pick the token and amount · U-Bot drafts a plan and checks the risk · orders are simulated · not investment advice</p>
    </section>
  );
}
