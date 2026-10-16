"use client";

import { useEffect, useState } from "react";
import { Spotlight } from "@/components/fx";
import { DataBadge } from "@/components/DataBadge";
import { INBOX_EVENT, InboxList, useInbox } from "@/components/UBotInbox";
import type { Proposal } from "@/lib/types";

interface Outcome {
  ruleId: string;
  symbol: string;
  fired: boolean;
  reason: string;
  channelNote?: string;
}

interface Rule {
  id: string;
  createdAt: string;
  type?: "unlock" | "drift" | "news";
  symbol: string;
  minLevel: "medium" | "high";
  daysBefore: number;
  channel: "ubot" | "telegram" | "line";
}

const CHANNEL_TH = { ubot: "U-Bot in the app", telegram: "Telegram", line: "LINE" };
const TYPE_TH = { unlock: "Unlock", drift: "Portfolio drift", news: "Negative news" };

interface AlertEvent {
  id: string;
  type: "unlock" | "drift" | "news";
  symbol: string;
  severity: "high" | "medium";
  firedAt: string;
  title: string;
  url?: string;
}

interface WatchInfo {
  enabled: boolean;
  intervalMin: number;
  lastRun: string | null;
  lastFired: number;
  quietHours?: { start: number; end: number };
  maxPerDay?: number;
  last?: { ranAt: string; skipped: { title: string; reason: string }[] } | null;
  events?: AlertEvent[];
}

const hhmm = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function ruleText(r: Rule): string {
  const who = r.symbol === "*" ? "every token in my portfolio" : r.symbol;
  if (r.type === "drift") return `portfolio drifts outside the band around your targets · ${CHANNEL_TH[r.channel]}`;
  if (r.type === "news") return `negative news on ${who} · ${r.minLevel === "high" ? "serious only" : "medium or higher"} · ${CHANNEL_TH[r.channel]}`;
  return `unlocks of ${who} · ${r.minLevel === "high" ? "high" : "medium or higher"} risk · ${r.daysBefore} days before · ${CHANNEL_TH[r.channel]}`;
}

// Smart alerts: rules for when U-Guard should speak up, and the protection decisions so far.
export default function AlertsPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [decisions, setDecisions] = useState<Proposal[]>([]);
  const [form, setForm] = useState({ type: "unlock", symbol: "ARB", minLevel: "medium", daysBefore: 7, channel: "ubot" });
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const inbox = useInbox();
  const [watch, setWatch] = useState<WatchInfo | null>(null);
  const [adding, setAdding] = useState(false);

  const load = () =>
    fetch("/api/alerts")
      .then((r) => r.json())
      .then((b) => {
        setRules(b.rules ?? []);
        setDecisions(b.decisions ?? []);
      })
      .catch(() => undefined);
  const loadWatch = () =>
    fetch("/api/watch")
      .then((r) => (r.ok ? r.json() : null))
      .then(setWatch)
      .catch(() => undefined);
  useEffect(() => {
    load();
    loadWatch();
    const t = setInterval(loadWatch, 30_000);
    return () => clearInterval(t);
  }, []);

  // One tap: unlock + drift + news rules for every token in the wallet, then check right away.
  async function watchWallet() {
    setAdding(true);
    setError(null);
    try {
      for (const rule of [
        { type: "unlock", symbol: "*", minLevel: "medium", daysBefore: 7, channel: "ubot" },
        { type: "drift", symbol: "*", minLevel: "medium", daysBefore: 7, channel: "ubot" },
        { type: "news", symbol: "*", minLevel: "medium", daysBefore: 7, channel: "ubot" },
      ]) {
        await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rule) });
      }
      await load();
      await checkNow();
    } finally {
      setAdding(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't add the rule");
      return;
    }
    load();
  }

  // Check every rule now: the ones that fire are pushed into the U-Bot inbox.
  async function checkNow() {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/alerts/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "The check failed");
      setOutcomes(body.outcomes ?? []);
      if (body.fired > 0) window.dispatchEvent(new Event(INBOX_EVENT));
      inbox.reload();
      loadWatch();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setChecking(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/alerts?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <>
      <div className="page-title" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1>Alerts</h1>
          <p>U-Guard only speaks up when it matters · delivered through U-Bot (Telegram / LINE on the roadmap)</p>
        </div>
        <DataBadge
          status={watch?.enabled ? "LIVE" : "DEMO"}
          source={watch?.enabled ? "U-Guard Sentinel" : "Watch Engine"}
          date={watch?.lastRun ?? undefined}
          label="Daemon"
        />
      </div>
      <div className="grid-2">
        <Spotlight className="panel">
          <div className="watch-bar">
            <span className={`watch-dot ${watch?.enabled ? "on" : ""}`} aria-hidden="true" />
            <span>
              {watch?.enabled
                ? `U-Bot checks automatically every ${watch.intervalMin} min`
                : "Automatic checks are off (set WATCH_INTERVAL_MIN or use a cron)"}
              {watch?.lastRun && (
                <small className="note">
                  {" "}· last check {new Date(watch.lastRun).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · alerts {watch.lastFired}
                </small>
              )}
              {watch?.quietHours && (
                <small className="note" style={{ display: "block" }}>
                  {watch.quietHours.start === watch.quietHours.end
                    ? "No quiet hours"
                    : `${watch.quietHours.start}:00–${watch.quietHours.end}:00 high-risk alerts only`}{" "}
                  · at most {watch.maxPerDay} a day · never the same alert twice
                </small>
              )}
            </span>
            <button className="btn btn-sm" onClick={watchWallet} disabled={adding || checking}>
              {adding ? "Setting up…" : "Watch every token in my portfolio"}
            </button>
          </div>
          <div className="panel-head"><h2>New alert rule</h2></div>
          <form className="form-row" onSubmit={add}>
            <label>
              Type
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="unlock">Unlock</option>
                <option value="drift">Portfolio drift</option>
                <option value="news">Negative news</option>
              </select>
            </label>
            {form.type !== "drift" && (
              <label>
                Token (* = whole portfolio)
                <input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} maxLength={20} style={{ width: 90 }} />
              </label>
            )}
            {form.type !== "drift" && (
              <label>
                {form.type === "news" ? "Severity at least" : "When risk is at least"}
                <select value={form.minLevel} onChange={(e) => setForm({ ...form, minLevel: e.target.value })}>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
            )}
            {form.type === "unlock" && (
              <label>
                Days ahead
                <input type="number" min={1} max={30} value={form.daysBefore} onChange={(e) => setForm({ ...form, daysBefore: Number(e.target.value) })} style={{ width: 80 }} />
              </label>
            )}
            <label>
              Channel
              <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                <option value="ubot">U-Bot in the app</option>
                <option value="telegram">Telegram</option>
                <option value="line">LINE</option>
              </select>
            </label>
            <button className="btn btn-primary" type="submit">Add</button>
          </form>
          {error && <p className="error">{error}</p>}
          <div style={{ marginTop: 14 }}>
            {rules.length === 0 && <p className="empty">No rules yet. Try adding ARB above, or watch the whole portfolio.</p>}
            {rules.map((r) => {
              const o = outcomes?.find((x) => x.ruleId === r.id);
              return (
                <div key={r.id} className="event-row" style={{ gridTemplateColumns: "1fr auto" }}>
                  <span>
                    <b>{TYPE_TH[r.type ?? "unlock"]}</b> · {ruleText(r)}
                    {o && (
                      <span className={`note alert-outcome ${o.fired ? "fired" : ""}`}>
                        {o.fired ? "✓ sent to U-Bot · " : "no alert · "}
                        {o.reason}
                        {o.channelNote ? ` · ${o.channelNote}` : ""}
                      </span>
                    )}
                  </span>
                  <button className="btn btn-sm" onClick={() => remove(r.id)}>Delete</button>
                </div>
              );
            })}
          </div>
          {rules.length > 0 && (
            <div className="row" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
              <button className="btn btn-primary" onClick={checkNow} disabled={checking}>
                {checking ? "Checking…" : "Check now"}
              </button>
              <span className="note">Checks every rule against the latest data; matches go to U-Bot as one message</span>
            </div>
          )}
        </Spotlight>
        <Spotlight className="panel">
          <div className="panel-head"><h2>Messages from U-Bot</h2><span className="total">Newest first</span></div>
          <InboxList items={inbox.items.slice(0, 6)} />
        </Spotlight>
        <Spotlight className="panel">
          <div className="panel-head"><h2>Alert history</h2><span className="total">{watch?.events?.length ?? 0} sent</span></div>
          {(watch?.events ?? []).length === 0 && <p className="empty">No alerts sent yet</p>}
          {(watch?.events ?? []).map((e) => (
            <div key={e.id} className="event-row" style={{ gridTemplateColumns: "auto 1fr" }}>
              <span className={`pill ${e.severity === "high" ? "lv-high" : "lv-medium"}`}>{TYPE_TH[e.type]}</span>
              <span>
                {e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.title}</a> : e.title}
                <small className="note" style={{ display: "block" }}>{hhmm(e.firedAt)}</small>
              </span>
            </div>
          ))}
          {(watch?.last?.skipped ?? []).length > 0 && (
            <>
              <h4 className="tp-sub" style={{ marginTop: 12 }}>Held back on the last run</h4>
              {watch!.last!.skipped.slice(0, 6).map((s) => (
                <p key={s.title + s.reason} className="note" style={{ margin: "4px 0" }}>
                  {s.title} · <span style={{ color: "var(--amber)" }}>{s.reason}</span>
                </p>
              ))}
            </>
          )}
        </Spotlight>
        <Spotlight className="panel">
          <div className="panel-head"><h2>Your decisions</h2><span className="total">Approved / declined</span></div>
          {decisions.length === 0 && <p className="empty">None yet. Approve a proposal on the AI Agent, Trade or Invest page.</p>}
          {decisions.map((d) => (
            <div key={d.id} className="event-row" style={{ gridTemplateColumns: "1fr auto" }}>
              <span>
                <b>{d.symbol}</b> · {d.title}
              </span>
              <span className={`pill ${d.status === "approved" ? "lv-low" : "lv-none"}`}>{d.status === "approved" ? "Approved" : "Declined"}</span>
            </div>
          ))}
        </Spotlight>
      </div>
    </>
  );
}
