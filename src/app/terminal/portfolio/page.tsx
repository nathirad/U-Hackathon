"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DriftCardView } from "@/components/Cards";
import { HoldingsSchedule } from "@/components/HoldingsSchedule";
import { CountUp, Spotlight } from "@/components/fx";
import { PortfolioCharts } from "@/components/PortfolioCharts";
import { LEVEL_LABEL, thb, unlockWhen } from "@/lib/format";
import { asOfLabel } from "@/lib/freshness";
import { openReport, type ReportResult } from "@/lib/report";
import type { DriftReport, Holding, RiskCard } from "@/lib/types";
import { DataBadge } from "@/components/DataBadge";

interface Row extends Holding {
  weightPct: number;
  card: RiskCard | null;
  dilutionPct: number;
}

interface PortfolioData {
  rows: Row[];
  totalThb: number;
  atRiskThb: number;
  topHolding: { symbol: string; weightPct: number } | null;
  drift: DriftReport;
}

// Portfolio: weight, target and drift, unlock risk and 6-month dilution per holding.
export default function PortfolioPage() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, number> | null>(null);
  const [band, setBand] = useState(5);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = () =>
    fetch("/api/portfolio/risk")
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json().catch(() => ({}))).error ?? "Could not load your portfolio."))))
      .then((d: PortfolioData) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  if (error) {
    return (
      <p className="note">
        {error}{" "}
        <button className="btn btn-sm" onClick={load}>
          Try again
        </button>
      </p>
    );
  }
  if (!data) return <p className="note">Loading your portfolio…</p>;

  const driftOf = (symbol: string) => data.drift.rows.find((r) => r.symbol === symbol);
  const startEdit = () => {
    setSaveError(null);
    setBand(data.drift.bandPp);
    setEditing(Object.fromEntries(data.drift.rows.map((r) => [r.symbol, r.targetPct ?? 0])));
  };
  const editSum = editing ? Object.values(editing).reduce((s, v) => s + v, 0) : 0;
  async function saveTargets() {
    setSaveError(null);
    const res = await fetch("/api/portfolio/targets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets: editing, bandPp: band }),
    });
    if (!res.ok) {
      setSaveError((await res.json().catch(() => ({}))).error ?? "Could not save your targets.");
      return;
    }
    setEditing(null);
    load();
  }

  const cards = data.rows.flatMap((r) => (r.card ? [r.card] : []));
  const report = () => {
    const result: ReportResult = {
      reply: [`Portfolio value ${thb(data.totalThb)} · value facing a risky unlock in 30 days ${thb(data.atRiskThb)}`, ...data.drift.lines].join("\n"),
      cards,
      proposals: [],
      trace: [],
    };
    openReport("Portfolio risk summary", result);
  };
  const concentrated = data.topHolding && data.topHolding.weightPct > 40;
  const d = data.drift;

  return (
    <>
      <div className="page-title">
        <h1>My portfolio</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          <DataBadge status="DEMO" tooltip="Demo wallet holdings for U-Hackathon 2026" />
          {d.pricesAsOf && <DataBadge mode="snapshot" asOf={d.pricesAsOf} tooltip={`Prices ${asOfLabel(d.pricesAsOf)}`} />}
          <span style={{ fontSize: 13, color: "var(--muted)" }}>AVAX reads live on-chain balance when WALLET_ADDRESS is set</span>
        </div>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Link className="btn btn-sm" href="/terminal/plan">
            Build my plan →
          </Link>
          <button className="btn btn-sm" onClick={report}>
            Summary as PDF
          </button>
        </span>
      </div>
      <div className="kpis">
        <div className="kpi"><span>Total value</span><b><CountUp value={data.totalThb} format={thb} /></b></div>
        <div className="kpi">
          <span>Facing a risky unlock (30 days)</span>
          <b style={{ color: data.atRiskThb ? "var(--coral)" : undefined }}><CountUp value={data.atRiskThb} format={thb} /></b>
          <small>{data.totalThb ? ((data.atRiskThb / data.totalThb) * 100).toFixed(0) : 0}% of portfolio</small>
        </div>
        <div className="kpi">
          <span>Away from your target mix</span>
          <b style={{ color: d.totalDriftPct > 10 ? "var(--coral)" : d.totalDriftPct > d.bandPp ? "var(--amber)" : undefined }}>
            {d.hasTargets ? `${d.totalDriftPct}%` : "–"}
          </b>
          <small>Portfolio unlock risk {d.portfolioRiskScore}/100</small>
        </div>
        <div className="kpi">
          <span>Largest holding</span>
          <b>{data.topHolding?.symbol}</b>
          <small style={{ color: concentrated ? "var(--amber)" : undefined }}>
            {data.topHolding?.weightPct.toFixed(0)}% of portfolio{concentrated ? " · highly concentrated" : ""}
          </small>
        </div>
      </div>
      <PortfolioCharts rows={data.rows} totalThb={data.totalThb} />
      <div className="table-wrap">
        <table className="t-table">
          <thead>
            <tr>
              <th>Token</th>
              <th className="num">Amount</th>
              <th className="num">Value</th>
              <th className="num">Weight</th>
              <th className="num">Target</th>
              <th className="num">Drift</th>
              <th>Next unlock</th>
              <th>Risk</th>
              <th className="num">Diluted over 6 months</th>
              <th aria-label="Trade" />
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => {
              const dr = driftOf(r.symbol);
              return (
                <tr key={r.symbol}>
                  <td>
                    <Link href={`/terminal/tokens/${r.symbol}`} className="sym">
                      <i>{r.symbol.slice(0, 4)}</i>
                      {r.symbol}
                    </Link>
                  </td>
                  <td className="num">{r.amount.toLocaleString("en-US")}</td>
                  <td className="num">{thb(r.valueThb)}</td>
                  <td className="num">{r.weightPct.toFixed(1)}%</td>
                  <td className="num">{dr?.targetPct != null ? `${dr.targetPct}%` : "–"}</td>
                  <td className={`num drift-${dr?.status ?? "no_target"}`}>
                    {dr?.driftPp != null ? `${dr.driftPp > 0 ? "+" : ""}${dr.driftPp} pts` : "–"}
                  </td>
                  <td>{r.card ? unlockWhen(r.card) || "–" : "–"}</td>
                  <td>
                    <span className={`pill lv-${r.card?.level ?? "none"}`}>
                      {r.card ? `${LEVEL_LABEL[r.card.level]}${r.card.level !== "none" ? ` ${r.card.score}` : ""}` : "No unlock"}
                    </span>
                  </td>
                  <td className="num">{r.dilutionPct ? `${r.dilutionPct.toFixed(1)}%` : "–"}</td>
                  <td>
                    {r.symbol !== "USDC" && (
                      <span className="row-trade">
                        <Link className="btn btn-sm btn-buy" href={`/terminal/trade?symbol=${r.symbol}&side=buy`}>
                          Buy
                        </Link>
                        <Link className="btn btn-sm btn-sell" href={`/terminal/trade?symbol=${r.symbol}&side=sell`}>
                          Sell
                        </Link>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <HoldingsSchedule />

      <div className="grid-2" style={{ marginTop: 16 }}>
        <DriftCardView drift={d} />
        <Spotlight className="panel">
          <div className="panel-head">
            <h2>Your target mix</h2>
            {!editing && (
              <button className="btn btn-sm" onClick={startEdit}>
                Edit targets
              </button>
            )}
          </div>
          {editing ? (
            <>
              <div className="target-edit">
                {Object.keys(editing).map((sym) => (
                  <label key={sym}>
                    {sym} %
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={editing[sym]}
                      onChange={(e) => setEditing({ ...editing, [sym]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                    />
                  </label>
                ))}
                <label>
                  Band ± pts
                  <input type="number" min={1} max={50} value={band} onChange={(e) => setBand(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
                </label>
              </div>
              <p className="note" style={{ margin: "4px 0 10px", color: Math.abs(editSum - 100) <= 1 || editSum === 0 ? undefined : "var(--coral)" }}>
                Total {editSum}% {Math.abs(editSum - 100) <= 1 ? "✓" : "(must add up to 100%)"}
                {saveError ? ` · ${saveError}` : ""}
              </p>
              <span style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-sm btn-primary" onClick={saveTargets} disabled={!(Math.abs(editSum - 100) <= 1 || editSum === 0)}>
                  Save targets
                </button>
                <button className="btn btn-sm" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </span>
            </>
          ) : (
            <p className="note" style={{ margin: 0 }}>
              {d.hasTargets
                ? Object.entries(Object.fromEntries(d.rows.filter((r) => r.targetPct !== null).map((r) => [r.symbol, r.targetPct])))
                    .map(([s, t]) => `${s} ${t}%`)
                    .join(" · ")
                : "No targets yet."}{" "}
              · drift band ±{d.bandPp} points. U-Guard measures drift against the mix you set; it never decides the mix for you.
            </p>
          )}
          <p className="note" style={{ margin: "12px 0 0" }}>
            &ldquo;Diluted&rdquo; is how much your share of the circulating supply shrinks from already-scheduled unlocks if you don&apos;t buy more · Decision support, not investment advice
          </p>
        </Spotlight>
      </div>
    </>
  );
}
