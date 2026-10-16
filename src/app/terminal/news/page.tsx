"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DataBadge } from "@/components/DataBadge";
import { shortDate } from "@/lib/format";
import type { NewsItem } from "@/lib/types";

interface NewsData {
  live: NewsItem[];
  curated: NewsItem[];
  unlocks: { symbol: string; date: string; summary: string; sizeNote: string; source: string; url: string }[];
  sources: { live: string | null; curatedAsOf: string | null };
}

const MY_COINS = ["ARB", "WLD", "AVAX", "ETH", "USDC"];
const FILTERS = [
  { key: "all", label: "All" },
  { key: "mine", label: "My coins" },
  { key: "unlock", label: "Unlocks" },
  { key: "fed", label: "Fed & macro" },
  { key: "regulation", label: "Regulation" },
  { key: "etf", label: "ETFs" },
  { key: "hack", label: "Hacks" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

function ago(iso?: string | null): string {
  if (!iso) return "";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(mins)) return "";
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
}

function matches(item: NewsItem, f: FilterKey): boolean {
  if (f === "all") return true;
  if (f === "mine") return item.symbols.some((s) => MY_COINS.includes(s));
  if (f === "fed") return item.topics.includes("fed") || item.topics.includes("macro");
  return item.topics.includes(f);
}

const ask = (title: string) => `/terminal/agent?q=${encodeURIComponent(`What does this news mean for my coins: "${title}"`)}`;

// News: live headlines from the big crypto outlets, tagged by token and topic, next to the unlock
// reports U-Guard tracks. Every headline has a one-tap "what does this mean for me?".
export default function NewsPage() {
  const [data, setData] = useState<NewsData | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    fetch("/api/news")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  const feed = useMemo(() => {
    const pool = data ? (data.live.length ? data.live : data.curated) : [];
    return pool.filter((i) => matches(i, filter));
  }, [data, filter]);
  const today = new Date().toISOString().slice(0, 10);

  if (failed) return <p className="empty">Couldn&apos;t load the news. Reload the page to try again.</p>;

  return (
    <>
      <div className="page-title" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1>News</h1>
          <p>{data?.sources.live ? `Live headlines from ${data.sources.live}` : "U-Guard's saved news reports"} · tagged by token and topic · tap a headline to read the source</p>
        </div>
        <DataBadge
          status={data?.sources.live ? "LIVE" : "CACHED"}
          source={data?.sources.live ? data.sources.live : "Curated Dispatch"}
          date={data?.sources.curatedAsOf ?? undefined}
          label="Intel"
        />
      </div>
      <div className="screen-tools">
        <div className="seg" role="group" aria-label="Filter news">
          {FILTERS.map((f) => (
            <button key={f.key} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <span className="note">{data ? `${feed.length} stories` : "Loading the latest headlines…"}</span>
      </div>

      <div className="news-grid">
        <section aria-label="Headlines" className="news-feed">
          {!data &&
            Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="news-item skeleton-row">
                <span />
              </div>
            ))}
          {data && feed.length === 0 && <p className="empty">No stories for this filter right now.</p>}
          {feed.map((n) => (
            <article key={n.id} className={`news-item ${n.image ? "news-has-img" : ""}`}>
              {n.image && (
                <a className="news-thumb" href={n.url} target="_blank" rel="noreferrer noopener" tabIndex={-1} aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={n.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
                </a>
              )}
              <div className="news-body">
              <div className="news-meta">
                <b>{n.source}</b>
                <span>{n.dateLabel ? ago(n.dateLabel) : n.date ? shortDate(n.date) : ""}</span>
                {n.symbols.map((s) => (
                  <Link key={s} href={`/terminal/tokens/${s}`} className={`news-tag ${MY_COINS.includes(s) ? "news-tag-mine" : ""}`}>
                    {s}
                  </Link>
                ))}
                {n.topics.slice(0, 2).map((t) => (
                  <span key={t} className="news-topic">
                    {t}
                  </span>
                ))}
              </div>
              <a className="news-title" href={n.url} target="_blank" rel="noreferrer noopener">
                {n.summary}
              </a>
              <Link className="plan-action" href={ask(n.summary)}>
                What does this mean for me? →
              </Link>
              </div>
            </article>
          ))}
        </section>

        <aside className="news-side">
          <section className="panel">
            <div className="panel-head">
              <h2>Unlock watch</h2>
              <Link className="plan-action" href="/terminal/unlocks">
                Calendar →
              </Link>
            </div>
            <ol className="news-unlocks">
              {(data?.unlocks ?? []).map((u) => (
                <li key={`${u.symbol}-${u.date}`} className={u.date.slice(0, 10) < today ? "past" : ""}>
                  <span className="plan-date">
                    <b>{u.date.slice(0, 10) === today ? "Today" : shortDate(u.date)}</b>
                    <small>{u.symbol}</small>
                  </span>
                  <div>
                    <p className="plan-detail" style={{ margin: 0, color: "var(--text)" }}>
                      {u.summary}
                    </p>
                    <small className="muted">
                      {u.sizeNote} ·{" "}
                      <a href={u.url} target="_blank" rel="noreferrer noopener">
                        {u.source}
                      </a>
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>U-Guard picks</h2>
              <span className="note">{data?.sources.curatedAsOf ? `saved ${shortDate(data.sources.curatedAsOf)}` : ""}</span>
            </div>
            <ol className="news-picks">
              {(data?.curated ?? []).slice(0, 6).map((n) => (
                <li key={n.id}>
                  <a href={n.url} target="_blank" rel="noreferrer noopener">
                    {n.summary}
                  </a>
                  <small className="muted">
                    {n.source}
                    {n.date ? ` · ${shortDate(n.date)}` : ""}
                  </small>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
      <p className="note" style={{ marginTop: 12 }}>Headlines link to their publishers. U-Guard tags them by token and topic; it does not rewrite or judge them · not investment advice</p>
    </>
  );
}
