"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { CountUp, Spotlight, useTypewriter } from "@/components/fx";
import { LEVEL_LABEL, thb, shortDate, unlockWhen, usd, compact } from "@/lib/format";
import type { ScreenRow } from "@/lib/screener";
import type { NewsItem, RiskCard } from "@/lib/types";
import { TokenLogo } from "@/components/TokenLogo";

const PROMPTS = [
  "Is buying 5,000 THB of ARB risky right now?",
  "Scan my portfolio",
  "How far is my portfolio from my target mix?",
  "What's in the news for my coins?",
  "Who receives AVAX's unlocks?",
];

// The four steps of U-Guard, so a first-time user knows where to go next.
const STEPS = [
  { n: 1, title: "Check", text: "Screen tokens and see who unlocks what, when", href: "/terminal/tokens" },
  { n: 2, title: "Plan", text: "Your next 30 days, with dates and risk", href: "/terminal/plan" },
  { n: 3, title: "Approve", text: "U-Bot proposes; you decide, recorded on Avalanche", href: "/terminal/alerts" },
  { n: 4, title: "Stay alerted", text: "Rules watch your coins and ping U-Bot", href: "/terminal/alerts" },
];

interface PlanItemLite {
  date: string;
  kind: string;
  symbol: string | null;
  title: string;
  level: string | null;
  action: { label: string; href: string } | null;
}

// Terminal home: ask U-Guard first, then the three things worth a glance.
export default function TerminalHome() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const placeholder = useTypewriter(PROMPTS);
  const [calendar, setCalendar] = useState<RiskCard[]>([]);
  const [unlocks, setUnlocks] = useState<ScreenRow[] | null>(null);
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [plan, setPlan] = useState<{ generatedAt: string; items: PlanItemLite[]; decisions: unknown[]; summary: string[] } | null>(null);
  const [portfolio, setPortfolio] = useState<{
    totalThb: number;
    atRiskThb: number;
    rows: { symbol: string; name?: string; amount?: number; valueThb?: number; weightPct?: number; card: RiskCard | null }[];
  } | null>(null);

  useEffect(() => {
    fetch("/api/calendar").then((r) => r.json()).then((b) => setCalendar(b.analysed ?? [])).catch(() => undefined);
    fetch("/api/markets")
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { rows: ScreenRow[] } | null) =>
        setUnlocks((b?.rows ?? []).filter((r) => r.nextUnlock && r.nextUnlock.daysUntil <= 30).sort((x, y) => x.nextUnlock!.daysUntil - y.nextUnlock!.daysUntil)),
      )
      .catch(() => setUnlocks([]));
    fetch("/api/news")
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { live: NewsItem[]; curated: NewsItem[] } | null) => setNews(b ? (b.live.length ? b.live : b.curated).slice(0, 4) : []))
      .catch(() => setNews([]));
    fetch("/api/plan")
      .then((r) => (r.ok ? r.json() : null))
      .then(setPlan)
      .catch(() => undefined);
    fetch("/api/portfolio/risk").then((r) => r.json()).then(setPortfolio).catch(() => undefined);
  }, []);

  const go = (text: string) => {
    const t = text.trim();
    if (t) router.push(`/terminal/agent?q=${encodeURIComponent(t)}`);
  };

  return (
    <>
      <section className="hero-ask">
        <Avatar size={52} />
        <h1>
          What do you want to know <em>before your money moves?</em>
        </h1>
        <p>Ask U-Guard about a token, your portfolio or the unlock calendar · answers in your language, with sources</p>
        <form
          className="askbox"
          onSubmit={(e) => {
            e.preventDefault();
            go(q);
          }}
        >
          <label htmlFor="home-ask" className="sr-only">
            Ask U-Guard
          </label>
          <input id="home-ask" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} autoComplete="off" />
          <button className="btn btn-primary" type="submit" disabled={!q.trim()}>
            Ask
          </button>
        </form>
        <div className="ask-chips">
          {PROMPTS.map((p) => (
            <button key={p} className="chip" onClick={() => go(p)}>
              {p}
            </button>
          ))}
        </div>
      </section>

      <ol className="flow-steps" aria-label="How U-Guard works">
        {STEPS.map((st) => (
          <li key={st.n}>
            <Link href={st.href}>
              <i>{st.n}</i>
              <b>{st.title}</b>
              <span>{st.text}</span>
            </Link>
          </li>
        ))}
      </ol>

      {portfolio && (
        <div className="kpis">
          <div className="kpi">
            <span>Portfolio value</span>
            <b>
              <CountUp value={portfolio.totalThb} format={thb} />
            </b>
          </div>
          <div className="kpi">
            <span>Value facing a risky unlock (30 days)</span>
            <b style={{ color: portfolio.atRiskThb > 0 ? "var(--coral)" : undefined }}>
              <CountUp value={portfolio.atRiskThb} format={thb} />
            </b>
          </div>
          <div className="kpi">
            <span>Unlocks U-Guard tracks</span>
            <b>
              {calendar.length}
            </b>
            <small>tokens with full data</small>
          </div>
          <div className="kpi">
            <span>Decisions waiting</span>
            <b style={{ color: plan && plan.decisions.length ? "var(--amber)" : undefined }}>{plan ? plan.decisions.length : "…"}</b>
            <small>
              <Link href="/terminal/plan">open my plan →</Link>
            </small>
          </div>
        </div>
      )}

      <div className="grid-2">
        <Spotlight className="panel">
          <div className="panel-head">
            <h2>Unlocks in the next 30 days</h2>
            <Link href="/terminal/tokens" className="total">
              Tokenomist · screener →
            </Link>
          </div>
          {!unlocks && <p className="note">Loading the Tokenomist schedule…</p>}
          {unlocks?.length === 0 && <p className="note">No large token unlocks in the next 30 days.</p>}
          {unlocks?.slice(0, 7).map((r) => (
            <Link key={r.id} href={`/terminal/tokens/${r.symbol}`} className="event-row today-unlock" style={{ textDecoration: "none", color: "inherit" }}>
              <span className="event-date">
                <b>{r.nextUnlock!.daysUntil <= 0 ? "Today" : shortDate(r.nextUnlock!.date)}</b>
                {r.nextUnlock!.daysUntil <= 0 ? "today" : `in ${r.nextUnlock!.daysUntil} d`}
              </span>
              <span className="tok">
                <TokenLogo symbol={r.symbol} src={r.image} size={20} />
                <span>
                  <b>{r.symbol}</b>
                  <small>
                    {r.nextUnlock!.pctCirc !== null ? `${r.nextUnlock!.pctCirc.toFixed(2)}% of circulating` : ""}
                    {r.nextUnlock!.valueUsd ? ` · ${usd(r.nextUnlock!.valueUsd)}` : ""}
                  </small>
                </span>
              </span>
              <span className={`pill lv-${r.grade.level}`}>
                {LEVEL_LABEL[r.grade.level]}
                {r.grade.score !== null ? ` ${r.grade.score}` : ""}
              </span>
            </Link>
          ))}
        </Spotlight>

        <Spotlight className="panel">
          <div className="panel-head">
            <h2>Coming up for your money</h2>
            <Link href="/terminal/plan" className="total">
              My plan →
            </Link>
          </div>
          {!plan && <p className="note">Building your plan from live data…</p>}
          {plan?.items
            .filter((i) => i.kind !== "rule" && i.kind !== "stop")
            .slice(0, 5)
            .map((i, n) => (
              <Link key={`${i.date}-${n}`} href={i.action?.href.startsWith("/") ? i.action.href : "/terminal/plan"} className="event-row" style={{ textDecoration: "none", color: "inherit" }}>
                <span className="event-date">
                  <b>{i.date <= plan.generatedAt.slice(0, 10) ? "Today" : shortDate(i.date)}</b>
                  {i.kind === "release" ? "daily" : i.kind}
                </span>
                <span>{i.title}</span>
                {i.level ? <span className={`pill lv-${i.level}`}>{LEVEL_LABEL[i.level]}</span> : <span />}
              </Link>
            ))}
        </Spotlight>
      </div>

      <Spotlight className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <h2>Latest news</h2>
          <Link href="/terminal/news" className="total">
            All news →
          </Link>
        </div>
        {!news && <p className="note">Loading headlines…</p>}
        <div className="today-news">
          {news?.map((n) => {
            const sym = n.symbols[0] ?? "";
            const isArb = n.symbols.includes("ARB");
            const isEth = n.symbols.includes("ETH");
            const isBtc = n.symbols.includes("BTC");
            const bgGradient = isArb
              ? "linear-gradient(135deg, rgba(40, 160, 240, 0.35) 0%, rgba(15, 23, 42, 0.95) 100%)"
              : isEth
              ? "linear-gradient(135deg, rgba(139, 92, 246, 0.35) 0%, rgba(15, 23, 42, 0.95) 100%)"
              : isBtc
              ? "linear-gradient(135deg, rgba(245, 158, 11, 0.35) 0%, rgba(15, 23, 42, 0.95) 100%)"
              : "linear-gradient(135deg, rgba(45, 212, 191, 0.3) 0%, rgba(15, 23, 42, 0.95) 100%)";

            return (
              <a key={n.id} href={n.url} target="_blank" rel="noreferrer noopener" className="today-news-item">
                {n.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={n.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "16 / 9",
                      borderRadius: 10,
                      background: bgGradient,
                      border: "1px solid var(--border)",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 1 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", color: "var(--teal-2)", background: "rgba(10,15,30,0.85)", padding: "2px 6px", borderRadius: 4 }}>
                        {n.topics[0] ?? "INTEL"}
                      </span>
                      <span style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 500 }}>{n.source}</span>
                    </div>
                    <div style={{ zIndex: 1 }}>
                      <b style={{ fontSize: 17, color: "#fff", letterSpacing: "0.5px" }}>
                        {n.symbols.join(" · ") || n.source}
                      </b>
                    </div>
                    <div
                      style={{
                        position: "absolute",
                        right: -6,
                        bottom: -18,
                        fontSize: 60,
                        fontWeight: 900,
                        opacity: 0.12,
                        userSelect: "none",
                        pointerEvents: "none",
                        color: "#fff",
                        fontFamily: "var(--mono)",
                      }}
                    >
                      {sym || "NEWS"}
                    </div>
                  </div>
                )}
                <small>
                  {n.source}
                  {n.symbols.length ? ` · ${n.symbols.join(", ")}` : ""}
                </small>
                <b>{n.summary}</b>
              </a>
            );
          })}
        </div>
      </Spotlight>

      {portfolio && (
        <Spotlight className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div>
              <h2>My portfolio</h2>
              <span className="total" style={{ marginLeft: 0, marginTop: 4, display: "inline-block" }}>
                Total: <b>{thb(portfolio.totalThb)}</b>
                {portfolio.atRiskThb > 0 && (
                  <span style={{ marginLeft: 8, color: "var(--coral)" }}>
                    (Facing unlock risk: <b>{thb(portfolio.atRiskThb)}</b>)
                  </span>
                )}
              </span>
            </div>
            <Link href="/terminal/portfolio" className="btn btn-sm">
              Portfolio details →
            </Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 14 }}>
            {portfolio.rows.map((r) => {
              const lv = r.card?.level ?? "none";
              return (
                <Link
                  key={r.symbol}
                  href={`/terminal/tokens/${r.symbol}`}
                  className="portfolio-mini-card"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    textDecoration: "none",
                    color: "inherit",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className={`dot ${lv !== "none" ? `dot-${lv}` : ""}`} />
                      <b style={{ fontSize: 14 }}>{r.symbol}</b>
                    </div>
                    <span className={`pill lv-${lv}`} style={{ fontSize: 10.5, padding: "2px 6px" }}>
                      {r.card ? LEVEL_LABEL[r.card.level] : "No unlock"}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{r.valueThb ? thb(r.valueThb) : "–"}</span>
                    {r.weightPct !== undefined && (
                      <span className="muted" style={{ fontSize: 11.5 }}>{r.weightPct.toFixed(1)}%</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </Spotlight>
      )}
    </>
  );
}
