"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Spotlight } from "@/components/fx";
import { TRADE_EVENT, TradePanel, TradePlanCard } from "@/components/TradePanel";
import { DataBadge } from "@/components/DataBadge";
import { thb } from "@/lib/format";
import type { PaperOrder, RiskLevel, TradePlan } from "@/lib/types";

const SYMBOLS = ["ARB", "WLD", "AVAX", "ETH", "BTC"];
const LEVEL_SHORT: Record<RiskLevel, string> = { high: "High", medium: "Medium", low: "Low", none: "–" };

interface Position {
  symbol: string;
  qty: number;
  costThb: number;
  valueThb: number;
  pnlThb: number;
  priceUsd: number;
}

const qtyT = (q: number) => q.toLocaleString("en-US", { maximumFractionDigits: q < 1 ? 6 : q < 100 ? 4 : 2 });

// Trade: pick a token, let U-Bot draft the plan and check it, approve. Orders are paper orders.
export default function TradePage() {
  const [symbol, setSymbol] = useState("ARB");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [symbols, setSymbols] = useState(SYMBOLS);
  // Deep links from the portfolio and token pages: /terminal/trade?symbol=WLD&side=sell
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const sym = q.get("symbol")?.toUpperCase();
    if (sym && /^[A-Z0-9]{2,10}$/.test(sym)) {
      setSymbol(sym);
      setSymbols((list) => (list.includes(sym) ? list : [...list, sym]));
    }
    if (q.get("side") === "sell") setSide("sell");
  }, []);
  const [levels, setLevels] = useState<Record<string, RiskLevel>>({});
  const [orders, setOrders] = useState<PaperOrder[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [pending, setPending] = useState<TradePlan[]>([]);

  const load = useCallback(() => {
    fetch("/api/trade")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (!b) return;
        setOrders(b.orders ?? []);
        setPositions(b.positions ?? []);
        setPending(b.pending ?? []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(TRADE_EVENT, load);
    fetch("/api/ticker")
      .then((r) => r.json())
      .then((b: { items?: { symbol: string; level: RiskLevel }[] }) => setLevels(Object.fromEntries((b.items ?? []).map((i) => [i.symbol, i.level]))))
      .catch(() => undefined);
    return () => window.removeEventListener(TRADE_EVENT, load);
  }, [load]);

  return (
    <>
      <div className="page-title">
        <h1>Trade</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          <DataBadge status="DEMO" tooltip="Paper trading simulation with verified math & safety rules" />
          <span style={{ fontSize: 13, color: "var(--muted)" }}>U-Bot drafts plans · You review & approve · Orders recorded on Avalanche testnet</span>
        </div>
      </div>

      <div className="trade-picker" role="tablist" aria-label="Pick a token">
        {symbols.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={symbol === s}
            className={`trade-pick ${symbol === s ? "on" : ""} ${levels[s] ? `lv-${levels[s]}` : ""}`}
            onClick={() => setSymbol(s)}
          >
            <b>{s}</b>
            {levels[s] && levels[s] !== "none" && (
              <span>
                <span className="dot" />
                {LEVEL_SHORT[levels[s]]}
              </span>
            )}
          </button>
        ))}
        <Link href={`/terminal/tokens/${symbol}`} className="note trade-more">
          Full data for {symbol} →
        </Link>
      </div>

      <div className="trade-grid">
        <TradePanel symbol={symbol} defaultSide={side} />
        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          {pending.length > 0 && (
            <Spotlight className="panel">
              <div className="panel-head"><h2>Plans waiting for you</h2><span className="total">{pending.length} plans</span></div>
              <div style={{ display: "grid", gap: 10 }}>
                {pending.map((p) => (
                  <TradePlanCard key={p.id} plan={p} />
                ))}
              </div>
            </Spotlight>
          )}
          <Spotlight className="panel">
            <div className="panel-head"><h2>Paper positions</h2><span className="total">From approved orders</span></div>
            {positions.length === 0 ? (
              <p className="empty">None yet. Let U-Bot draft a plan, then approve it.</p>
            ) : (
              <div className="table-scroll">
                <table className="t-table" style={{ minWidth: 0 }}>
                  <thead>
                    <tr><th>Token</th><th className="num">Amount</th><th className="num">Cost</th><th className="num">Value now</th><th className="num">P&amp;L</th></tr>
                  </thead>
                  <tbody>
                    {positions.map((p) => (
                      <tr key={p.symbol}>
                        <td><b>{p.symbol}</b></td>
                        <td className="num">{qtyT(p.qty)}</td>
                        <td className="num">{thb(p.costThb)}</td>
                        <td className="num">{thb(p.valueThb)}</td>
                        <td className="num" style={{ color: p.pnlThb >= 0 ? "var(--teal-2)" : "var(--coral)" }}>{p.pnlThb >= 0 ? "+" : "−"}{thb(Math.abs(p.pnlThb))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Spotlight>
          <Spotlight className="panel">
            <div className="panel-head"><h2>My paper orders</h2><span className="total">{orders.length} orders</span></div>
            {orders.length === 0 && <p className="empty">No orders yet</p>}
            {orders.map((o) => (
              <div key={o.id} className="event-row" style={{ gridTemplateColumns: "auto 1fr auto" }}>
                <span className={`pill ${o.side === "buy" ? "lv-low" : "lv-high"}`}>{o.side === "buy" ? "Buy" : "Sell"}</span>
                <span>
                  <b>{qtyT(o.qty)} {o.symbol}</b> · {thb(o.amountThb)} at ${o.priceUsd.toLocaleString("en-US", { maximumFractionDigits: o.priceUsd < 1 ? 4 : 2 })}
                  <small className="note" style={{ display: "block" }}>
                    {new Date(o.at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })} · recorded on {o.receipt.chain}
                    {o.broker && <> · {o.broker.note}</>}
                    {o.receipt.explorerUrl && (
                      <>
                        {" "}·{" "}
                        <a href={o.receipt.explorerUrl} target="_blank" rel="noreferrer">View transaction</a>
                      </>
                    )}
                  </small>
                </span>
                <span className="note">Stop ${o.stopPriceUsd.toLocaleString("en-US", { maximumFractionDigits: o.stopPriceUsd < 1 ? 4 : 2 })}</span>
              </div>
            ))}
          </Spotlight>
          <p className="note">
            No real orders are sent: real trading has to go through a licensed broker or platform (e.g. a U-topia swap via U-Bot), which is on the roadmap
          </p>
        </div>
      </div>
    </>
  );
}
