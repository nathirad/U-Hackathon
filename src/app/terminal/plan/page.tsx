"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DriftCardView, ProposalCardView, StressCardView } from "@/components/Cards";
import { Spotlight } from "@/components/fx";
import { DataBadge } from "@/components/DataBadge";
import { LEVEL_LABEL, shortDate } from "@/lib/format";
import type { MyPlan, PlanItem } from "@/lib/plan";
import { openReport } from "@/lib/report";

const KIND_LABEL: Record<PlanItem["kind"], string> = {
  unlock: "Unlock",
  release: "Daily release",
  macro: "Macro",
  dca: "DCA buy",
  decision: "Decide",
  rule: "Active rule",
  stop: "Stop-loss",
};

const DAY = 86_400_000;

function bucket(date: string, today: string): string {
  if (date <= today) return "Today";
  const days = Math.round((new Date(date).getTime() - new Date(today).getTime()) / DAY);
  if (days <= 7) return "This week";
  if (days <= 14) return "Next week";
  return "Later this month";
}

// My plan: the next 30 days of the user's money on one dated timeline, with what to decide,
// what is scheduled, and what is already protected. Saves as a PDF.
export default function PlanPage() {
  const [plan, setPlan] = useState<MyPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setError(null);
    fetch("/api/plan")
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json().catch(() => ({}))).error ?? "Could not build your plan."))))
      .then(setPlan)
      .catch((e: Error) => setError(e.message));
  }, [attempt]);

  if (error) {
    return (
      <p className="note">
        {error}{" "}
        <button className="btn btn-sm" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </button>
      </p>
    );
  }
  if (!plan) return <p className="note">Building your 30-day plan from live data…</p>;

  const today = plan.generatedAt.slice(0, 10);
  const timeline = plan.items.filter((i) => i.kind !== "decision");
  const groups = timeline.reduce<Record<string, PlanItem[]>>((acc, i) => {
    (acc[bucket(i.date, today)] ??= []).push(i);
    return acc;
  }, {});
  const risky = plan.items.filter((i) => (i.kind === "unlock" || i.kind === "release") && (i.level === "high" || i.level === "medium"));
  const next = plan.items.find((i) => i.date >= today && (i.kind === "unlock" || i.kind === "macro" || i.kind === "dca"));

  const savePdf = () => {
    const lines = [
      ...plan.summary,
      "",
      "",
      "Stress test (scenarios, not forecasts):",
      ...plan.stress.scenarios.map((x) => `   ${x.label}: −${Math.abs(x.impactThb).toLocaleString("en-US")} THB (${Math.abs(x.impactPct).toFixed(1)}% of the portfolio)`),
      ...plan.stress.handles.map((h) => `   ${h.text}`),
      "",
      ...plan.items.map((i) => `${i.date === today ? "Today" : shortDate(i.date)} · ${KIND_LABEL[i.kind]} · ${i.title}${i.level ? ` (${LEVEL_LABEL[i.level]})` : ""}\n   ${i.detail}`),
    ];
    openReport(`My 30-day plan · ${shortDate(today)}`, { reply: lines.join("\n"), cards: plan.cards, proposals: plan.decisions, trace: [] });
  };

  return (
    <>
      <div className="page-title" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1>My plan · next {plan.horizonDays} days</h1>
          <p>Every date that can move your money, what U-Guard found, and what you can do · built from live data</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <DataBadge status="LIVE" source="U-Guard Engine" date={plan.generatedAt} label="Horizon" />
          <Link className="btn btn-sm" href={`/terminal/agent?q=${encodeURIComponent("Explain my plan for the next 30 days")}`}>
            Ask U-Bot to explain
          </Link>
          <button className="btn btn-sm btn-primary" onClick={savePdf}>
            Save plan as PDF
          </button>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <span>Decisions waiting</span>
          <b style={{ color: plan.decisions.length ? "var(--amber)" : undefined }}>{plan.decisions.length}</b>
          <small>{plan.decisions.length ? "approve or decline below" : "nothing to decide"}</small>
        </div>
        <div className="kpi">
          <span>Risky unlocks on your coins</span>
          <b style={{ color: risky.length ? "var(--coral)" : undefined }}>{risky.length}</b>
          <small>{risky.map((i) => i.symbol).filter(Boolean).join(", ") || "none in 30 days"}</small>
        </div>
        <div className="kpi">
          <span>Next date</span>
          <b>{next ? (next.date <= today ? "Today" : shortDate(next.date)) : "–"}</b>
          <small>{next ? next.title : "nothing scheduled"}</small>
        </div>
        <div className="kpi">
          <span>Portfolio unlock risk</span>
          <b>{plan.drift.portfolioRiskScore}/100</b>
          <small>{plan.drift.hasTargets ? `${plan.drift.totalDriftPct}% away from your target mix` : "no target mix set"}</small>
        </div>
      </div>

      <Spotlight className="panel plan-summary">
        <div className="panel-head">
          <h2>In short</h2>
        </div>
        <ul className="reasons">
          {plan.summary.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </Spotlight>

      {plan.decisions.length > 0 && (
        <section className="plan-section">
          <h2>Decide first</h2>
          <div className="plan-decisions">
            {plan.decisions.map((p) => (
              <ProposalCardView key={p.id} proposal={p} />
            ))}
          </div>
        </section>
      )}

      <div className="plan-grid">
        <section className="plan-section">
          <h2>Timeline</h2>
          {timeline.length === 0 && <p className="empty">Nothing scheduled for your coins in the next {plan.horizonDays} days.</p>}
          {["Today", "This week", "Next week", "Later this month"].map((g) =>
            groups[g]?.length ? (
              <div key={g} className="plan-group">
                <h3>{g}</h3>
                <ol className="plan-list">
                  {groups[g].map((i, n) => (
                    <li key={`${i.date}-${i.kind}-${i.symbol}-${n}`} className={`plan-item plan-${i.kind}`}>
                      <span className="plan-date">
                        <b>{i.date <= today ? "Today" : shortDate(i.date)}</b>
                        <small>{KIND_LABEL[i.kind]}</small>
                      </span>
                      <div>
                        <p className="plan-title">
                          {i.title}
                          {i.level && <span className={`pill lv-${i.level}`}>{LEVEL_LABEL[i.level]}</span>}
                        </p>
                        <p className="plan-detail">{i.detail}</p>
                        {i.action &&
                          (i.action.href.startsWith("http") ? (
                            <a className="plan-action" href={i.action.href} target="_blank" rel="noreferrer noopener">
                              {i.action.label} ↗
                            </a>
                          ) : (
                            <Link className="plan-action" href={i.action.href}>
                              {i.action.label} →
                            </Link>
                          ))}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null,
          )}
        </section>
        <aside className="plan-side">
          <StressCardView stress={plan.stress} />
          <DriftCardView drift={plan.drift} />
          <p className="note">
            Built from the Tokenomist unlock schedule, live prices, the Fed calendar and your own approvals, plans and alert rules. Information, not investment advice: you decide every step.
          </p>
        </aside>
      </div>
    </>
  );
}
