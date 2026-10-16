"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RiskCardView } from "@/components/Cards";
import { TradePanel } from "@/components/TradePanel";
import { RECIPIENT_COLOR, RECIPIENT_LABEL, Spotlight, StackedBars } from "@/components/fx";
import { compact, sourceTag, usd } from "@/lib/format";
import type { RecipientClass, RiskCard } from "@/lib/types";
import { classifyRecipient } from "@/lib/recipient";
import { PriceChart } from "@/components/PriceChart";
import { DataBadge } from "@/components/DataBadge";

interface TokenData {
  tracked: boolean;
  symbol?: string;
  token?: { symbol: string; name: string; marketCap: number; circulating: number; maxSupply: number; floatPct: number; priceUsd: number; volume24hUsd: number | null };
  card?: RiskCard | null;
  forecast?: { months: { month: string; total: number; byRecipient: Partial<Record<RecipientClass, number>> }[]; totalNew: number; dilutionPct: number; pctOfMcapPerMonth: number | null } | null;
  allocations?: { allocationName: string; standardAllocationName: string; allocationAmount: number; allocationLockedAmount: number; trackedAllocationPercentage: number }[];
  fundraising?: { fundingRound: string; fundingDate: string; amountRaised: number | null; valuation: number | null }[];
  totalRaised?: number | null;
  source?: string;
  sources?: Record<"unlocks" | "allocations" | "fundraising", { mode: string; asOf: string } | null>;
}

interface ScreenerRow {
  symbol: string;
  marketCap: number;
  fdv: number;
  floatPct: number | null;
  totalRaised: number | null;
  pctInvestorsUnlocked: number | null;
  latestRound: string | null;
  leadInvestors: string | null;
}

// Token page ("supply mode"): risk now, supply over the next 6 months, who holds what, who paid what.
export default function TokenPage() {
  const { symbol } = useParams<{ symbol: string }>();
  const router = useRouter();
  const [data, setData] = useState<TokenData | null>(null);
  const [screen, setScreen] = useState<ScreenerRow | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setFailed(false);
    // A failed request is not the same as "no unlock data": keep them apart so the
    // page never tells someone a token is safe-looking just because the server hiccupped.
    fetch(`/api/token/${symbol}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch(() => setFailed(true));
    fetch("/api/screener")
      .then((r) => r.json())
      .then((b: { rows: ScreenerRow[] }) => setScreen(b.rows.find((r) => r.symbol === String(symbol).toUpperCase()) ?? null))
      .catch(() => undefined);
  }, [symbol, attempt]);

  if (failed) {
    return (
      <p className="empty">
        Couldn't load {String(symbol).toUpperCase()}{" "}
        <button className="btn btn-sm" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </button>
      </p>
    );
  }
  if (!data) return <p className="note">Loading…</p>;
  const sym = String(symbol).toUpperCase();

  if (!data.tracked) {
    return (
      <>
        <div className="page-title">
          <h1>{sym}</h1>
          <p>No full unlock schedule for this token in the demo yet (needs a Tokenomist API key and a snapshot)</p>
        </div>
        {screen ? (
          <div className="kpis">
            <div className="kpi"><span>Market cap</span><b>{usd(screen.marketCap)}</b></div>
            <div className="kpi"><span>FDV</span><b>{usd(screen.fdv)}</b></div>
            <div className="kpi"><span>Float</span><b>{screen.floatPct?.toFixed(0)}%</b><small>the rest is still to come</small></div>
            <div className="kpi"><span>Investors unlocked</span><b>{screen.pctInvestorsUnlocked ?? "–"}%</b><small>{screen.latestRound ?? ""}</small></div>
          </div>
        ) : (
          <p className="empty">Not in the screener</p>
        )}
        <button className="btn btn-primary" onClick={() => router.push(`/terminal/agent?q=${encodeURIComponent(`Does ${sym} have an unlock coming?`)}`)}>
          Ask U-Guard about {sym}
        </button>
      </>
    );
  }

  const t = data.token!;
  const allocations = data.allocations ?? [];
  const totalAlloc = allocations.reduce((s, a) => s + a.allocationAmount, 0) || 1;

  return (
    <>
      <div className="page-title">
        <h1>
          {t.symbol} <span className="note" style={{ fontSize: 16 }}>{t.name}</span>
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          <span>Price ~${t.priceUsd.toFixed(t.priceUsd < 1 ? 4 : 2)}</span>
          <span>·</span>
          <span>Unlock schedule:</span>
          <DataBadge mode={data.sources?.unlocks?.mode ?? data.source} asOf={data.sources?.unlocks?.asOf} />
        </div>
        <button className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={() => router.push(`/terminal/agent?q=${encodeURIComponent(`Buy 5,000 THB of ${t.symbol}`)}`)}>
          Ask U-Guard before buying
        </button>
      </div>

      <div className="kpis">
        <div className="kpi"><span>Market cap</span><b>{usd(t.marketCap)}</b></div>
        <div className="kpi"><span>FDV</span><b>{usd(t.priceUsd * t.maxSupply)}</b></div>
        <div className="kpi"><span>Float</span><b>{t.floatPct.toFixed(1)}%</b><small>{compact(t.circulating)} / {compact(t.maxSupply)}</small></div>
        <div className="kpi">
          <span>New supply, 6 months</span>
          <b>{compact(data.forecast?.totalNew ?? 0)}</b>
          <small>holders diluted by {data.forecast?.dilutionPct.toFixed(1) ?? 0}%</small>
        </div>
        <div className="kpi">
          <span>Supply pressure per month</span>
          <b>{data.forecast?.pctOfMcapPerMonth === null || data.forecast?.pctOfMcapPerMonth === undefined ? "–" : `${data.forecast.pctOfMcapPerMonth.toFixed(2)}%`}</b>
          <small>of market cap</small>
        </div>
      </div>

      <div className="tgm">
      <aside className="tgm-side">
        <TradePanel symbol={t.symbol} />
      </aside>
      <div className="tgm-main">
      <PriceChart
        symbol={t.symbol}
        markers={[
          ...(data.card && data.card.timing !== "continuous" && data.card.unlockDate ? [{ date: data.card.unlockDate, label: `Unlock ${compact(data.card.amount)}` }] : []),
          ...(data.card?.nextUnlock ? [{ date: data.card.nextUnlock.date, label: `Next ${compact(data.card.nextUnlock.amount)}` }] : []),
        ]}
      />
      <div className="grid-2">
        <div>{data.card && <RiskCardView card={data.card} />}</div>
        <Spotlight className="panel">
          <div className="panel-head">
            <h2>Supply entering the market, 6 months</h2>
            <span className="total">From the vesting schedule</span>
          </div>
          {data.forecast && data.forecast.totalNew > 0 ? (
            <>
              <StackedBars months={data.forecast.months} />
              <div className="legend" style={{ marginTop: 6 }}>
                {(Object.keys(RECIPIENT_LABEL) as RecipientClass[])
                  .filter((r) => data.forecast!.months.some((m) => m.byRecipient[r]))
                  .map((r) => (
                    <span key={r}>
                      <i style={{ background: RECIPIENT_COLOR[r] }} />
                      {RECIPIENT_LABEL[r]}
                    </span>
                  ))}
              </div>
            </>
          ) : (
            <p className="empty">No scheduled unlocks in the next 6 months in the demo data</p>
          )}
        </Spotlight>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <Spotlight className="panel">
          <div className="panel-head">
            <h2>Who holds the supply (allocation)</h2>
            <span className="total">{sourceTag(data.sources?.allocations)}</span>
          </div>
          <div className="split" style={{ height: 10 }} aria-hidden="true">
            {allocations.map((a, i) => (
              <i key={`${a.allocationName}-${i}`} style={{ width: `${(a.allocationAmount / totalAlloc) * 100}%`, background: RECIPIENT_COLOR[classifyRecipient(a.allocationName, a.standardAllocationName)] }} />
            ))}
          </div>
          <div className="table-scroll">
            <table className="t-table" style={{ minWidth: 0 }}>
              <thead>
                <tr><th>Group</th><th className="num">Share</th><th className="num">Still locked</th></tr>
              </thead>
              <tbody>
                {allocations.map((a, i) => (
                  <tr key={`${a.allocationName}-${i}`}>
                    <td>
                      <span className="dot" style={{ display: "inline-block", marginRight: 6, background: RECIPIENT_COLOR[classifyRecipient(a.allocationName, a.standardAllocationName)] }} />
                      {a.allocationName}
                    </td>
                    <td className="num">{a.trackedAllocationPercentage.toFixed(1)}%</td>
                    <td className="num">{compact(a.allocationLockedAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Spotlight>
        <Spotlight className="panel">
          <div className="panel-head">
            <h2>Funding rounds</h2>
            <span className="total">Total {data.totalRaised ? usd(data.totalRaised) : "–"}</span>
          </div>
          <div className="table-scroll">
            <table className="t-table" style={{ minWidth: 0 }}>
              <thead>
                <tr><th>Round</th><th>Date</th><th className="num">Raised</th><th className="num">Valuation</th></tr>
              </thead>
              <tbody>
                {(data.fundraising ?? []).map((f) => (
                  <tr key={f.fundingRound + f.fundingDate}>
                    <td>{f.fundingRound}</td>
                    <td>{new Date(f.fundingDate).toLocaleDateString("en-US", { year: "numeric", month: "short" })}</td>
                    <td className="num">{f.amountRaised ? usd(f.amountRaised) : "–"}</td>
                    <td className="num">{f.valuation ? usd(f.valuation) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note" style={{ marginTop: 8 }}>
            {data.sources?.fundraising && <>{sourceTag(data.sources.fundraising)} · </>}
            <Link href="/terminal/tokens">← Back to the screener</Link>
          </p>
        </Spotlight>
      </div>
      </div>
      </div>
    </>
  );
}
