"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Spotlight } from "@/components/fx";
import { DataBadge } from "@/components/DataBadge";
import { compact, LEVEL_LABEL, shortDate, unlockWhen, untilLabel, usd } from "@/lib/format";
import { asOfLabel } from "@/lib/freshness";
import type { RiskCard } from "@/lib/types";

interface MarketEvent {
  symbol: string;
  date: string;
  summary: string;
  sizeNote: string;
  source: string;
  url: string;
  past?: boolean;
  dateApprox?: boolean;
}

// Unlock calendar: what U-Guard scores in full, plus market events from public reports.
export default function UnlocksPage() {
  const [analysed, setAnalysed] = useState<RiskCard[]>([]);
  const [market, setMarket] = useState<MarketEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [marketSource, setMarketSource] = useState<{ mode: string; asOf: string; note: string | null } | null>(null);

  useEffect(() => {
    fetch("/api/calendar")
      .then((r) => r.json())
      .then((b) => {
        setAnalysed(b.analysed ?? []);
        setMarket(b.market ?? []);
        setMarketSource(b.marketSource ?? null);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const upcoming = market.filter((e) => !e.past).sort((a, b) => a.date.localeCompare(b.date));
  const past = market.filter((e) => e.past);

  const primaryMode = analysed[0]?.source.mode;
  const badgeStatus = primaryMode === "live" ? "LIVE" : primaryMode === "snapshot" ? "CACHED" : primaryMode === "sample" ? "DEMO" : "CACHED";

  return (
    <>
      <div className="page-title" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1>Unlock calendar</h1>
          <p>Prices often start sliding ~30 days before an unlock (Keyrock) · U-Guard scores size, liquidity and recipients</p>
        </div>
        <DataBadge
          status={badgeStatus}
          source="Tokenomist v5"
          date={analysed[0]?.source.asOf}
          label="Schedule"
        />
      </div>

      <Spotlight className="panel">
        <div className="panel-head">
          <h2>Fully analysed by U-Guard</h2>
          <span className="total">Scores computed in code</span>
        </div>
        {loading && (
          <div style={{ padding: "16px 0", display: "grid", gap: 12 }}>
            <div className="skeleton-row" style={{ height: 44, borderRadius: 8 }} />
            <div className="skeleton-row" style={{ height: 44, borderRadius: 8 }} />
            <div className="skeleton-row" style={{ height: 44, borderRadius: 8 }} />
          </div>
        )}
        {!loading && analysed.length === 0 && (
          <p className="empty" style={{ margin: "16px 0" }}>No upcoming unlock events found in tracked universe.</p>
        )}
        {analysed.map((c) => (
          <Link key={c.symbol} href={`/terminal/tokens/${c.symbol}`} className="event-row" style={{ textDecoration: "none", color: "inherit" }}>
            <span className="event-date">
              <b>{c.unlockDate ? shortDate(c.unlockDate) : "–"}</b>
              {unlockWhen(c)}
            </span>
            <span>
              <b>{c.symbol}</b> · {compact(c.amount)} ({usd(c.valueUsd)}) · {c.pctOfCirculating.toFixed(2)}% of circulating ·{" "}
              <span className="note">{c.reasons[2] ?? ""}</span>
            </span>
            <span className={`pill lv-${c.level}`}>
              {LEVEL_LABEL[c.level]} {c.score}
            </span>
          </Link>
        ))}
      </Spotlight>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <Spotlight className="panel">
          <div className="panel-head">
            <h2>Elsewhere in the market</h2>
            <span className="total">
              {marketSource?.mode === "live" ? `Tokenomist live · next cliff of the largest tokens · ${asOfLabel(marketSource.asOf)}` : "From saved public reports"}
            </span>
          </div>
          {marketSource?.note && <p className="note" style={{ margin: "0 0 8px" }}>{marketSource.note}</p>}
          {upcoming.length === 0 && <p className="empty">No large cliff unlocks in the next 45 days</p>}
          {upcoming.map((e) => (
            <div key={e.symbol + e.date} className="event-row">
              <span className="event-date">
                <b>{e.dateApprox ? "Nov" : shortDate(e.date)}</b>
                {e.dateApprox ? "date TBC" : untilLabel(e.date)}
              </span>
              <span>
                <b>{e.symbol}</b> · {e.summary}
                <br />
                <span className="note">
                  {e.sizeNote} ·{" "}
                  <a href={e.url} target="_blank" rel="noreferrer">
                    {e.source}
                  </a>
                </span>
              </span>
              <span />
            </div>
          ))}
        </Spotlight>
        <Spotlight className="panel">
          <div className="panel-head">
            <h2>Recently passed (lessons)</h2>
          </div>
          {past.map((e) => (
            <div key={e.symbol + e.date} className="event-row">
              <span className="event-date">
                <b>{shortDate(e.date)}</b>
              </span>
              <span>
                <b>{e.symbol}</b> · {e.summary}
                <br />
                <span className="note">
                  {e.sizeNote} ·{" "}
                  <a href={e.url} target="_blank" rel="noreferrer">
                    {e.source}
                  </a>
                </span>
              </span>
              <span />
            </div>
          ))}
        </Spotlight>
      </div>
    </>
  );
}
