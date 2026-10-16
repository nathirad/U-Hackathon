"use client";

import { useCallback, useEffect, useState } from "react";
import { ensureSession } from "@/components/EnsureSession";
import { Spotlight } from "@/components/fx";
import { DataBadge } from "@/components/DataBadge";
import { LEVEL_LABEL, shortDate, thb } from "@/lib/format";
import type { InvestPlan } from "@/lib/types";

interface Defaults {
  questions: { q: string; a: string[] }[];
  classes: { id: string; name: string; example: string; risk: number; color: string }[];
  plans: InvestPlan[];
  pending?: InvestPlan[];
}

const PICKS = ["BTC", "ETH", "ARB", "WLD", "AVAX"];
const riskText = (r: number) => (r >= 9 ? "8+" : String(r));

/** Allocation as one stacked bar plus a legend that carries the numbers (colour is never the only cue). */
function AllocationBar({ plan }: { plan: InvestPlan }) {
  const slices = plan.slices.filter((s) => s.pct > 0);
  return (
    <div>
      <div className="inv-bar" role="img" aria-label={slices.map((s) => `${s.name} ${s.pct}%`).join(", ")}>
        {slices.map((s) => (
          <i key={s.id} style={{ width: `${s.pct}%`, background: s.color }} title={`${s.name} ${s.pct}%`} />
        ))}
      </div>
      <div className="legend" style={{ marginTop: 8 }}>
        {slices.map((s) => (
          <span key={s.id}>
            <i style={{ background: s.color }} />
            {s.name} {s.pct}%
          </span>
        ))}
      </div>
    </div>
  );
}

// Invest: a short risk profile → a model portfolio the user can adjust → U-Guard checks the crypto
// part and the DCA dates → the user approves. Illustrative data; not personal investment advice.
export default function InvestPage() {
  const [defs, setDefs] = useState<Defaults | null>(null);
  const [answers, setAnswers] = useState<number[]>([0, 0, 0, 0, 0]);
  const [lump, setLump] = useState("50000");
  const [monthly, setMonthly] = useState("5000");
  const [day, setDay] = useState("25");
  const [picks, setPicks] = useState<string[]>(["BTC", "ETH"]);
  const [weights, setWeights] = useState<Record<string, string> | null>(null);
  const [plan, setPlan] = useState<InvestPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"pending" | "busy" | "approved" | "declined">("pending");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/invest")
      .then((r) => r.json())
      .then(setDefs)
      .catch(() => setError("Couldn't load the data"));
  }, []);
  useEffect(load, [load]);

  const done = answers.every((a) => a > 0);

  async function draft(custom: Record<string, string> | null) {
    setBusy(true);
    setError(null);
    try {
      await ensureSession();
      const res = await fetch("/api/invest/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers,
          lumpSumThb: Number(lump.replace(/,/g, "")) || 0,
          monthlyThb: Number(monthly.replace(/,/g, "")) || 0,
          dcaDay: Number(day) || 25,
          cryptoPicks: picks,
          weights: custom ? Object.fromEntries(Object.entries(custom).map(([k, v]) => [k, Number(v) || 0])) : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't draft the plan");
      const p = body as InvestPlan;
      setPlan(p);
      setState("pending");
      setWeights(Object.fromEntries(p.slices.map((s) => [s.id, String(s.pct)])));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Open a plan that is still waiting (e.g. one U-Bot drafted over MCP) with its own inputs. */
  function review(p: InvestPlan) {
    setPlan(p);
    setState("pending");
    setError(null);
    setWeights(Object.fromEntries(p.slices.map((s) => [s.id, String(s.pct)])));
    if (p.answers?.length === 5) setAnswers(p.answers);
    setLump(String(p.lumpSumThb));
    setMonthly(String(p.monthlyThb));
    setDay(String(p.dcaDay));
    if (p.crypto.length) setPicks(p.crypto.map((c) => c.symbol));
  }

  // Plans U-Bot drafted in chat (MCP). Drafts made on this page are the one shown on the right.
  const waiting = (defs?.pending ?? []).filter((p) => p.origin === "mcp" && p.id !== plan?.id);

  async function decide(decision: "approve" | "decline") {
    if (!plan) return;
    setState("busy");
    setError(null);
    try {
      const res = await fetch("/api/invest/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, decision }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't save");
      setPlan(body.plan);
      setState(decision === "approve" ? "approved" : "declined");
      load();
    } catch (err) {
      setError((err as Error).message);
      setState("pending");
    }
  }

  return (
    <>
      <div className="page-title">
        <h1>Invest</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          <DataBadge status="DEMO" tooltip="Educational model portfolio on sample asset classes" />
          <span style={{ fontSize: 13, color: "var(--muted)" }}>5-question risk assessment · U-Guard supply risk check on DCA dates · User approved</span>
        </div>
      </div>
      <p className="note inv-disclaimer">
        An educational model portfolio on sample data (fund names are examples, not real products) · not personal investment advice · real advice must come from someone licensed by the SEC
      </p>

      <div className="inv-grid">
        <Spotlight className="panel">
          <div className="panel-head"><h2>Risk profile</h2><span className="total">{answers.filter(Boolean).length}/5</span></div>
          {!defs && <p className="note">Loading…</p>}
          <div className="inv-quiz">
            {defs?.questions.map((q, i) => (
              <fieldset key={q.q}>
                <legend>{i + 1}. {q.q}</legend>
                <div className="inv-options">
                  {q.a.map((a, j) => (
                    <label key={a} className={answers[i] === j + 1 ? "on" : ""}>
                      <input
                        type="radio"
                        name={`q${i}`}
                        checked={answers[i] === j + 1}
                        onChange={() => setAnswers((prev) => prev.map((v, k) => (k === i ? j + 1 : v)))}
                      />
                      {a}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>

          <div className="panel-head" style={{ marginTop: 16 }}><h2>Money to invest</h2></div>
          <div className="tp-form">
            <div className="tp-row">
              <label>
                Lump sum (THB)
                <input inputMode="numeric" value={lump} onChange={(e) => setLump(e.target.value)} />
              </label>
              <label>
                DCA per month (THB)
                <input inputMode="numeric" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
              </label>
              <label>
                DCA day (1–28)
                <input inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} />
              </label>
            </div>
            <div>
              <p className="note" style={{ margin: "0 0 6px" }}>Crypto you want in the portfolio (your choice)</p>
              <div className="tp-presets">
                {PICKS.map((p) => (
                  <button
                    type="button"
                    key={p}
                    className={`chip ${picks.includes(p) ? "chip-on" : ""}`}
                    aria-pressed={picks.includes(p)}
                    onClick={() => setPicks((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn btn-primary tp-go" disabled={!done || busy} onClick={() => draft(null)}>
              {busy ? "U-Bot is drafting…" : done ? "Let U-Bot draft an investment plan" : "Answer every question first"}
            </button>
            {error && <p className="error">{error}</p>}
          </div>
        </Spotlight>

        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          {waiting.length > 0 && (
            <Spotlight className="panel">
              <div className="panel-head"><h2>Plans U-Bot drafted for you</h2><span className="total">{waiting.length}</span></div>
              {waiting.map((p) => (
                <div key={p.id} className="event-row" style={{ gridTemplateColumns: "1fr auto" }}>
                  <span>
                    <b>{p.profileName}</b> · DCA {thb(p.monthlyThb)}/month
                    <small className="note" style={{ display: "block" }}>
                      Score {p.score}/20 · {p.checks.filter((c) => c.status === "warn").length} thing(s) to look at · waiting for your approval
                    </small>
                  </span>
                  <button className="btn btn-sm" onClick={() => review(p)}>Review</button>
                </div>
              ))}
            </Spotlight>
          )}
          {!plan && (
            <Spotlight className="panel">
              <div className="panel-head"><h2>Your plan</h2></div>
              <p className="empty">Answer the questions and press &ldquo;Let U-Bot draft an investment plan&rdquo;. The plan shows up here.</p>
            </Spotlight>
          )}
          {plan && (
            <Spotlight className="panel">
              <div className="panel-head">
                <h2>&ldquo;{plan.profileName}&rdquo; investment plan</h2>
                <span className="total">Sample data</span>
              </div>
              <ul className="tp-summary">
                {plan.summary.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              <div style={{ marginTop: 12 }}>
                <AllocationBar plan={plan} />
              </div>

              <div className="table-scroll" style={{ marginTop: 12 }}>
                <table className="t-table tp-table">
                  <thead>
                    <tr><th>Asset</th><th className="num">Risk</th><th className="num">Weight %</th><th className="num">Lump sum</th><th className="num">Monthly</th></tr>
                  </thead>
                  <tbody>
                    {plan.slices.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <span className="dot" style={{ display: "inline-block", marginRight: 6, background: s.color }} />
                          {s.name}
                          <small className="tp-basis">{s.example}</small>
                        </td>
                        <td className="num">{riskText(s.risk)}</td>
                        <td className="num">
                          <input
                            className="inv-pct"
                            inputMode="decimal"
                            aria-label={`Weight of ${s.name}`}
                            value={weights?.[s.id] ?? String(s.pct)}
                            onChange={(e) => setWeights((w) => ({ ...(w ?? {}), [s.id]: e.target.value }))}
                            disabled={state !== "pending"}
                          />
                        </td>
                        <td className="num">{thb(s.lumpThb)}</td>
                        <td className="num">{thb(s.monthlyThb)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {state === "pending" && (
                <button className="btn btn-sm" style={{ marginTop: 8 }} disabled={busy} onClick={() => draft(weights)}>
                  Recalculate with my weights
                </button>
              )}

              <h4 className="tp-sub" style={{ marginTop: 14 }}>U-Guard checks</h4>
              <ul className="tp-checks">
                {plan.checks.map((c) => (
                  <li key={c.label} className={`tp-check ${c.status}`}>
                    <span className="tp-mark" aria-hidden="true">{c.status === "ok" ? "✓" : "!"}</span>
                    <span>
                      <b>{c.label}</b>
                      <small>{c.detail}</small>
                    </span>
                  </li>
                ))}
              </ul>

              {plan.crypto.length > 0 && (plan.slices.find((s) => s.id === "crypto")?.pct ?? 0) > 0 && (
                <>
                  <h4 className="tp-sub" style={{ marginTop: 14 }}>Crypto part (split evenly across your picks)</h4>
                  {plan.crypto.map((c) => (
                    <div key={c.symbol} className={`inbox-card lv-${c.level}`} style={{ marginTop: 6 }}>
                      <b>{c.symbol} · {c.pctOfCrypto}%</b>
                      <span className="inbox-lv">
                        <span className="dot" />
                        {c.level === "none" ? "No unlock" : `${LEVEL_LABEL[c.level]} ${c.score}/100`}
                      </span>
                      <p className="inbox-text">{c.note}</p>
                    </div>
                  ))}
                </>
              )}

              <h4 className="tp-sub" style={{ marginTop: 14 }}>Next 3 DCA dates</h4>
              {plan.dca.map((d) => (
                <div key={d.date} className="event-row" style={{ gridTemplateColumns: "88px 1fr auto" }}>
                  <span>{shortDate(d.date)}</span>
                  <span>
                    {d.notes.length === 0 ? <span className="note">Normal</span> : d.notes.map((n) => <small key={n} className="inv-dca-note">{n}</small>)}
                  </span>
                  <span>{thb(d.amountThb)}</span>
                </div>
              ))}

              {state === "approved" && (
                <p className="receipt" style={{ marginTop: 12 }}>
                  Approved · recorded on {plan.receipt?.chain ?? "Avalanche"}
                  {plan.receipt?.explorerUrl ? (
                    <>
                      {" "}·{" "}
                      <a href={plan.receipt.explorerUrl} target="_blank" rel="noreferrer">View transaction</a>
                    </>
                  ) : plan.receipt?.note ? (
                    <> · {plan.receipt.note}</>
                  ) : null}
                </p>
              )}
              {state === "declined" && <p className="receipt" style={{ marginTop: 12 }}>Plan not used</p>}
              {(state === "pending" || state === "busy") && (
                <div className="tp-actions" style={{ marginTop: 12 }}>
                  <button className="btn btn-primary" disabled={state === "busy"} onClick={() => decide("approve")}>
                    {state === "busy" ? "Saving…" : "Approve this plan"}
                  </button>
                  <button className="btn" disabled={state === "busy"} onClick={() => decide("decline")}>
                    Not now
                  </button>
                </div>
              )}
            </Spotlight>
          )}

          {defs && defs.plans.length > 0 && (
            <Spotlight className="panel">
              <div className="panel-head"><h2>Approved plans</h2><span className="total">{defs.plans.length}</span></div>
              {defs.plans.map((p) => (
                <div key={p.id} className="event-row" style={{ gridTemplateColumns: "1fr auto" }}>
                  <span>
                    <b>{p.profileName}</b> · DCA {thb(p.monthlyThb)}/month · {p.slices.filter((s) => s.pct > 0).map((s) => `${s.name} ${s.pct}%`).join(", ")}
                  </span>
                  <span className="pill lv-low">Approved</span>
                </div>
              ))}
            </Spotlight>
          )}
        </div>
      </div>
    </>
  );
}
