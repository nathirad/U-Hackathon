"use client";

import { useState } from "react";
import { compact, LEVEL_LABEL, pct, shortDate, sourceTag, usd } from "@/lib/format";
import { asOfLabel } from "@/lib/freshness";
import type { StressReport } from "@/lib/stress";
import type { DriftReport, Proposal, ProtectionReceipt, RecipientClass, RiskCard } from "@/lib/types";

import { DataBadge } from "./DataBadge";

const RECIPIENT: Record<RecipientClass, { th: string; color: string }> = {
  team: { th: "Team", color: "#FB7151" },
  investor: { th: "Investors", color: "#FBBF24" },
  community: { th: "Community", color: "#94A3B8" },
  other: { th: "Other", color: "#64748B" },
  reserve: { th: "Reserve", color: "#A78BFA" },
  ecosystem: { th: "Ecosystem fund", color: "#2DD4BF" },
};

async function speak(text: string) {
  const res = await fetch("/api/voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }).catch(() => null);
  if (res && res.status === 200) {
    const url = URL.createObjectURL(await res.blob());
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play();
    return;
  }
  // Fallback: the browser's own Thai voice.
  if ("speechSynthesis" in window) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = /[\u0E00-\u0E7F]/.test(text) ? "th-TH" : "en-US";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }
}

export function RiskCardView({ card }: { card: RiskCard }) {
  const [speaking, setSpeaking] = useState(false);
  const hasUnlock = card.level !== "none";
  const script = `${card.name}: ${LEVEL_LABEL[card.level]} risk, ${card.score} out of 100. ${card.reasons.join(" ")}`;

  return (
    <article className={`card lv-${card.level}`} aria-label={`Risk card ${card.symbol}`}>
      <div className="card-head">
        <h3>{card.symbol}</h3>
        <span className="name">{card.name}</span>
        <span className="pill">
          <span className="dot" />
          {LEVEL_LABEL[card.level]}
        </span>
        {hasUnlock && <span className="score">{card.score}/100</span>}
      </div>
      <span className="guard-tag">U-Guard check · Tokenomist data</span>
      {hasUnlock && (
        <>
          <div className="meter" aria-hidden="true">
            <i style={{ width: `${Math.max(4, card.score)}%` }} />
          </div>
          <div className="stats">
            <div className="stat">
              <b>{pct(card.pctOfCirculating)}</b>
              <span>of circulating supply</span>
            </div>
            <div className="stat">
              <b>{card.daysOfVolume === null ? "–" : `${card.daysOfVolume.toFixed(2)} days`}</b>
              <span>of trading volume</span>
            </div>
            <div className="stat">
              <b>{usd(card.valueUsd)}</b>
              <span>
                {compact(card.amount)} {card.symbol} · {card.timing === "continuous" ? "released over 30 days" : card.unlockDate ? shortDate(card.unlockDate) : ""}
              </span>
            </div>
          </div>
        </>
      )}
      <ul className="reasons">
        {card.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {card.breakdown.length > 0 && (
        <>
          <div className="split" aria-hidden="true">
            {card.breakdown.map((b) => (
              <i key={b.name} style={{ width: `${b.share * 100}%`, background: RECIPIENT[b.recipient].color }} />
            ))}
          </div>
          <div className="legend">
            {card.breakdown.map((b) => (
              <span key={b.name}>
                <i style={{ background: RECIPIENT[b.recipient].color }} />
                {RECIPIENT[b.recipient].th} {Math.round(b.share * 100)}%
              </span>
            ))}
          </div>
        </>
      )}
      <div className="card-foot">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>Tokenomist</span>
          <DataBadge mode={card.source.mode} stale={card.source.stale} asOf={card.source.asOf} />
          <span>· not investment advice</span>
        </span>
        <button
          className="btn btn-sm"
          disabled={speaking}
          onClick={async () => {
            setSpeaking(true);
            await speak(script).catch(() => undefined);
            setSpeaking(false);
          }}
        >
          {speaking ? "Reading…" : "Listen"}
        </button>
      </div>
    </article>
  );
}

export function ProposalCardView({ proposal }: { proposal: Proposal }) {
  const [state, setState] = useState<"pending" | "busy" | "approved" | "declined">("pending");
  const [receipt, setReceipt] = useState<ProtectionReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approve" | "decline") {
    setState("busy");
    setError(null);
    try {
      const res = await fetch("/api/protect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: proposal.id, decision }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong");
      setReceipt(body.receipt ?? null);
      setState(decision === "approve" ? "approved" : "declined");
    } catch (err) {
      setError((err as Error).message);
      setState("pending");
    }
  }

  return (
    <article className="proposal" aria-label="Protection proposal">
      <span className="guard-tag">U-Guard proposal · waits for you</span>
      <h4>{proposal.title}</h4>
      <p>{proposal.detail}</p>
      {state === "approved" && receipt && (
        <p className="receipt">
          Approved · recorded on {receipt.chain}
          {receipt.explorerUrl ? (
            <>
              {" "}
              ·{" "}
              <a href={receipt.explorerUrl} target="_blank" rel="noreferrer">
                View transaction {receipt.txHash?.slice(0, 10)}…
              </a>
            </>
          ) : (
            <> · {receipt.note}</>
          )}
        </p>
      )}
      {state === "declined" && <p className="receipt">No protection set. U-Guard won't do anything more.</p>}
      {(state === "pending" || state === "busy") && (
        <div className="row">
          <button className="btn btn-primary" disabled={state === "busy"} onClick={() => decide("approve")}>
            {state === "busy" ? "Saving…" : "Approve"}
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

const DRIFT_LABEL = { over: "Above target", under: "Below target", ok: "On target", no_target: "No target" } as const;

/** Portfolio vs the user's own target mix: one bar per token with the target as a tick. */
export function DriftCardView({ drift }: { drift: DriftReport }) {
  const off = drift.rows.filter((r) => r.status === "over" || r.status === "under");
  const scale = Math.max(40, ...drift.rows.map((r) => Math.max(r.weightPct, r.targetPct ?? 0))) * 1.08;
  const level = !drift.hasTargets ? "lv-none" : off.length === 0 ? "lv-low" : drift.totalDriftPct > 10 ? "lv-high" : "lv-medium";
  return (
    <article className={`card drift ${level}`} aria-label="Portfolio vs your target mix">
      <div className="card-head">
        <h3>Portfolio vs your targets</h3>
        <span className="name">{drift.hasTargets ? `${drift.totalDriftPct}% off target · band ±${drift.bandPp} pts` : "No target mix set"}</span>
        <span className="score" title="Unlock risk of the whole portfolio, weighted by holding size">
          Risk {drift.portfolioRiskScore}/100
        </span>
      </div>
      <div className="drift-rows">
        {drift.rows.map((r) => (
          <div key={r.symbol} className={`drift-row drift-${r.status}`} title={DRIFT_LABEL[r.status]}>
            <b>{r.symbol}</b>
            <div className="drift-bar" aria-hidden="true">
              <i style={{ width: `${(r.weightPct / scale) * 100}%` }} />
              {r.targetPct !== null && <em style={{ left: `${(r.targetPct / scale) * 100}%` }} />}
            </div>
            <span className="drift-num">
              {r.weightPct}%{r.targetPct !== null ? <small> / {r.targetPct}%</small> : null}
            </span>
            <span className="drift-pp">{r.driftPp === null ? "–" : `${r.driftPp > 0 ? "+" : ""}${r.driftPp}`}</span>
          </div>
        ))}
      </div>
      <ul className="reasons">
        {drift.lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <div className="card-foot">
        <span>Bar = your weight · tick = your target · compared with targets you set, not advice{drift.pricesAsOf ? ` · prices ${asOfLabel(drift.pricesAsOf)}` : ""}</span>
      </div>
    </article>
  );
}

/** Stress test: what each scenario would cost, in baht, and how the user can protect each holding. */
export function StressCardView({ stress }: { stress: StressReport }) {
  const worst = Math.max(1, ...stress.scenarios.map((x) => Math.abs(x.impactThb)));
  return (
    <article className="card stress lv-medium" aria-label="Portfolio stress test">
      <div className="card-head">
        <h3>Stress test</h3>
        <span className="name">scenarios on today&apos;s holdings, not forecasts</span>
      </div>
      <div className="stress-rows">
        {stress.scenarios.map((x) => (
          <div key={x.id} className="stress-row" title={x.basis}>
            <span className="stress-label">{x.label}</span>
            <span className="stress-bar" aria-hidden="true">
              <i style={{ width: `${(Math.abs(x.impactThb) / worst) * 100}%` }} />
            </span>
            <span className="stress-num">
              −฿{compact(Math.abs(x.impactThb))} <small>({Math.abs(x.impactPct).toFixed(1)}%)</small>
            </span>
          </div>
        ))}
      </div>
      {stress.handles.length > 0 && (
        <ul className="reasons">
          {stress.handles.slice(0, 3).map((h) => (
            <li key={h.symbol}>
              {h.text}{" "}
              <a href={h.action.href} className="plan-action">
                {h.action.label} →
              </a>
            </li>
          ))}
        </ul>
      )}
      <div className="card-foot">
        <span>Stablecoins ฿{compact(stress.stableThb)} are not affected · hover a row for its basis · not advice</span>
      </div>
    </article>
  );
}
