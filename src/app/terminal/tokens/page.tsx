"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Spotlight, RECIPIENT_LABEL } from "@/components/fx";
import { DataBadge } from "@/components/DataBadge";
import { LEVEL_LABEL, shortDate, usd } from "@/lib/format";
import type { ScreenResult, ScreenRow } from "@/lib/screener";

type SortKey = "rank" | "price" | "ch24" | "ch7" | "mcap" | "fdv" | "float" | "next" | "size" | "grade";
const WINDOWS = [
  { days: 0, label: "All" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 60, label: "60 days" },
] as const;
const LEVEL_RANK = { none: 0, low: 1, medium: 2, high: 3 } as const;

const value = (r: ScreenRow, k: SortKey): number => {
  switch (k) {
    case "rank": return -r.rank;
    case "price": return r.priceUsd ?? -1;
    case "ch24": return r.change24hPct ?? -1e9;
    case "ch7": return r.change7dPct ?? -1e9;
    case "mcap": return r.marketCapUsd ?? -1;
    case "fdv": return r.fdvUsd ?? -1;
    case "float": return r.floatPct ?? 101;
    case "next": return r.nextUnlock ? -r.nextUnlock.daysUntil : -1e9;
    case "size": return r.nextUnlock?.pctCirc ?? -1;
    case "grade": return LEVEL_RANK[r.grade.level] * 1000 + (r.grade.score ?? 0);
  }
};

function price(p: number | null): string {
  if (p === null) return "–";
  if (p >= 1000) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  return `$${p.toPrecision(3)}`;
}

function Change({ v }: { v: number | null }) {
  if (v === null) return <span className="muted">–</span>;
  return <span style={{ color: v >= 0 ? "var(--teal)" : "var(--coral)" }}>{`${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}</span>;
}

function floatColor(p: number | null) {
  if (p === null) return "var(--slate)";
  return p < 40 ? "var(--coral)" : p < 70 ? "var(--amber)" : "var(--teal)";
}

function whenLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

// Token screener: the largest tokens Tokenomist covers, live prices, and the next unlock with
// its size and who receives it. Click a row for the full U-Guard analysis.
export default function TokensPage() {
  const router = useRouter();
  const [data, setData] = useState<ScreenResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [windowDays, setWindowDays] = useState<number>(0);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "rank", dir: 1 });

  useEffect(() => {
    setFailed(false);
    fetch("/api/markets")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch(() => setFailed(true));
  }, [attempt]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = (data?.rows ?? []).filter(
      (r) =>
        (windowDays === 0 || (r.nextUnlock !== null && r.nextUnlock.daysUntil <= windowDays)) &&
        (!q || r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)),
    );
    return [...rows].sort((a, b) => (value(b, sort.key) - value(a, sort.key)) * sort.dir);
  }, [data, windowDays, query, sort]);

  const head = (key: SortKey, label: string, title?: string, num = true) => (
    <th className={num ? "num" : undefined} aria-sort={sort.key === key ? (sort.dir === 1 ? "descending" : "ascending") : "none"} title={title}>
      <button className="sort-btn" onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : 1 }))}>
        {label}
        <span aria-hidden="true" className={sort.key === key ? "on" : ""}>{sort.key === key ? (sort.dir === 1 ? "▼" : "▲") : "⇅"}</span>
      </button>
    </th>
  );

  if (failed) {
    return (
      <p className="empty">
        Couldn&apos;t load the screener.{" "}
        <button className="btn btn-sm" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </button>
      </p>
    );
  }

  const upcoming = (data?.rows ?? []).filter((r) => r.nextUnlock && r.nextUnlock.daysUntil <= 30);
  const flagged = upcoming.filter((r) => r.grade.level === "high");

  return (
    <>
      <div className="page-title" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1>Token screener</h1>
          <p>
            Top tokens by market cap · prices {data?.sources.market === "live" ? "live (Hyperliquid, CoinGecko)" : "from Tokenomist"} · unlocks from the Tokenomist API
            {data ? ` (${data.sources.tokens === "live" ? "live" : "saved"}, ${shortDate(data.sources.asOf)})` : ""}
          </p>
        </div>
        <DataBadge
          status={data?.sources.tokens === "live" ? "LIVE" : "CACHED"}
          source="Tokenomist Screener"
          date={data?.sources.asOf}
          label="Universe"
        />
      </div>

      <div className="kpis">
        <div className="kpi"><span>Tokens screened</span><b>{data ? data.rows.length : "…"}</b><small>by market cap, plus the tokens U-Guard follows</small></div>
        <div className="kpi"><span>Unlocking in 30 days</span><b>{data ? upcoming.length : "…"}</b><small>scheduled cliff unlocks</small></div>
        <div className="kpi">
          <span>High-risk unlocks (30 days)</span>
          <b style={{ color: flagged.length ? "var(--coral)" : undefined }}>{data ? flagged.length : "…"}</b>
          <small>{flagged.slice(0, 4).map((r) => r.symbol).join(", ") || "none"}</small>
        </div>
      </div>

      <div className="screen-tools">
        <div className="seg" role="group" aria-label="Unlock window">
          {WINDOWS.map((w) => (
            <button key={w.days} aria-pressed={windowDays === w.days} onClick={() => setWindowDays(w.days)}>
              {w.label}
            </button>
          ))}
        </div>
        <input className="screen-search" type="search" placeholder="Search a token" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search a token" />
        <span className="note">{data ? `${shown.length} tokens · click a column to sort` : "Loading live data…"}</span>
      </div>

      <div className="table-scroll">
        <table className="t-table screen-table">
          <thead>
            <tr>
              {head("rank", "#", "Rank by market cap")}
              <th>Token</th>
              {head("price", "Price")}
              {head("ch24", "24h")}
              {head("ch7", "7d")}
              {head("mcap", "Market cap")}
              {head("fdv", "FDV", "Fully diluted value: price × max supply")}
              {head("float", "Float", "Circulating ÷ max supply. Lower means more supply still to come")}
              {head("next", "Next unlock", "Next scheduled cliff unlock in the next 60 days", false)}
              {head("size", "Unlock size", "Next unlock as % of circulating supply, and its value")}
              {head("grade", "Unlock risk", "Full U-Guard score for tokens it follows; size grade for the rest", false)}
              <th aria-label="Details" />
            </tr>
          </thead>
          <tbody>
            {!data &&
              Array.from({ length: 8 }, (_, i) => (
                <tr key={i} className="skeleton-row">
                  <td colSpan={12}>
                    <span />
                  </td>
                </tr>
              ))}
            {shown.map((r) => (
              <tr key={r.id} className="row-link" onClick={() => router.push(`/terminal/tokens/${r.symbol}`)}>
                <td className="num muted">{r.rank}</td>
                <td>
                  <span className="tok">
                    {r.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.image} alt="" width={22} height={22} loading="lazy" />
                    ) : (
                      <i>{r.symbol.slice(0, 3)}</i>
                    )}
                    <span>
                      <b>{r.name}</b>
                      <small>
                        {r.symbol}
                        {r.grade.kind === "full" && <em className="uguard-badge">U-Guard</em>}
                      </small>
                    </span>
                  </span>
                </td>
                <td className="num">{price(r.priceUsd)}</td>
                <td className="num"><Change v={r.change24hPct} /></td>
                <td className="num"><Change v={r.change7dPct} /></td>
                <td className="num">{r.marketCapUsd ? usd(r.marketCapUsd) : "–"}</td>
                <td className="num">{r.fdvUsd ? usd(r.fdvUsd) : "–"}</td>
                <td className="num">
                  <span className="floatbar">
                    <span>
                      <i style={{ width: `${r.floatPct ?? 0}%`, background: floatColor(r.floatPct) }} />
                    </span>
                    {r.floatPct === null ? "–" : `${r.floatPct.toFixed(0)}%`}
                  </span>
                </td>
                <td>
                  {r.nextUnlock ? (
                    <span className="next-unlock">
                      <b>{shortDate(r.nextUnlock.date)}</b>
                      <small>
                        {whenLabel(r.nextUnlock.daysUntil)}
                        {r.nextUnlock.topRecipient ? ` · ${RECIPIENT_LABEL[r.nextUnlock.topRecipient]}` : ""}
                      </small>
                    </span>
                  ) : (
                    <span className="muted">None in 60 days</span>
                  )}
                </td>
                <td className="num">
                  {r.nextUnlock ? (
                    <span className="next-unlock" style={{ alignItems: "flex-end" }}>
                      <b>{r.nextUnlock.pctCirc === null ? "–" : `${r.nextUnlock.pctCirc.toFixed(2)}%`}</b>
                      <small>{r.nextUnlock.valueUsd ? usd(r.nextUnlock.valueUsd) : ""}</small>
                    </span>
                  ) : (
                    "–"
                  )}
                </td>
                <td>
                  <span className={`pill lv-${r.grade.level}`} title={r.grade.kind === "full" ? "U-Guard risk score (size, liquidity, recipients, investor profit)" : "Size grade: next unlock as % of circulating supply. Open the token for the full score."}>
                    {r.grade.level === "none" ? "No unlock" : LEVEL_LABEL[r.grade.level]}
                    {r.grade.score !== null ? ` ${r.grade.score}` : ""}
                    {r.grade.kind === "size" && r.grade.level !== "none" ? " · size" : ""}
                  </span>
                </td>
                <td>
                  <Link className="btn btn-sm" href={`/terminal/tokens/${r.symbol}`} onClick={(e) => e.stopPropagation()}>
                    Details ›
                  </Link>
                </td>
              </tr>
            ))}
            {data && shown.length === 0 && (
              <tr>
                <td colSpan={12} className="empty">No token matches this window or search.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="note" style={{ marginTop: 10 }}>
        Unlock risk: tokens marked U-Guard get the full score (size vs supply, size vs trading volume, who receives the tokens, how far investors are in profit). Others show a size grade:
        High ≥ 2% of circulating, Medium ≥ 0.5%, Low below. Open a token for its full analysis · decision support, not investment advice
      </p>
    </>
  );
}
