// Alert engine (AGENTIC-WORKFLOW §9). For one user:
//   1. fetch fresh data through the agent's own tools (same Agent Trace as a chat)
//   2. evaluate every rule in code: no model decides whether to alert
//   3. dedupe, quiet hours (22:00–07:00 Bangkok: high severity only), daily cap
//   4. send one U-Bot message with the alerts, their cards and protective proposals
// Rule types: unlock (scheduled supply), drift (wallet off the user's own target mix), news.
// Messages are composed deterministically, so they can't drift into advice.

import { randomUUID } from "node:crypto";
import { executeTool, newContext, type RunContext } from "./agent/tools";
import { config } from "./config";
import { LEVEL_LABEL, shortDate, untilLabel } from "./format";
import { getHoldings } from "./portfolio";
import { store, type AlertEvent, type AlertRule, type AlertType, type WatchSummary } from "./store";
import type { AgentResult, NewsItem, RiskCard, RiskLevel } from "./types";
import { getUBot } from "./ubot";

const STABLES = new Set(["USDC", "USDT", "DAI"]);
const RANK: Record<RiskLevel, number> = { none: 0, low: 1, medium: 2, high: 3 };
const SEV = { medium: 2, high: 3 } as const;
// Whole words only: a bare /sec/ also matched "second" and "sector", /ban/ matched "bank".
const SERIOUS = /\b(hack(ed|s|ers?)?|exploit(ed|s)?|breach(ed|es)?|lawsuits?|sued|sec|delist(ed|ing|s)?|regulat\w*|ban(s|ned)?|bankrupt\w*|insolven\w*|halt(ed|s)?)\b/i;

export interface AlertOutcome {
  ruleId: string;
  symbol: string;
  fired: boolean;
  /** Why it fired or not, for the alerts page. */
  reason: string;
  channelNote?: string;
}

type Candidate = Omit<AlertEvent, "id" | "firedAt" | "ownerId">;

const bangkokDay = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

export function inQuietHours(nowMs: number): boolean {
  const h = Number(new Date(nowMs).toLocaleString("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Bangkok" }));
  const { quietStartHour: start, quietEndHour: end } = config.watch;
  if (start === end) return false;
  return start > end ? h >= start || h < end : h >= start && h < end;
}

/** Does this card meet an unlock rule? Level threshold plus the timing window. */
export function matches(rule: Pick<AlertRule, "minLevel" | "daysBefore">, card: RiskCard): { ok: boolean; reason: string } {
  const level = card.level === "none" ? LEVEL_LABEL.none : `${LEVEL_LABEL[card.level]} risk ${card.score}/100`;
  if (RANK[card.level] < RANK[rule.minLevel]) return { ok: false, reason: `Below your threshold (now ${level})` };
  if (card.timing === "upcoming" && card.daysUntil !== null && card.daysUntil > rule.daysBefore) {
    return { ok: false, reason: `Unlock in ${card.daysUntil} days, outside your ${rule.daysBefore}-day window` };
  }
  const when = card.timing === "continuous" ? "releasing daily" : card.unlockDate ? `unlock ${shortDate(card.unlockDate)}` : "unlock ahead";
  return { ok: true, reason: `${level} · ${when}` };
}

/** Severity of a news item: negative news is medium; negative and serious (hack, lawsuit...) is high. */
export function newsSeverity(n: NewsItem): "high" | "medium" | null {
  if (n.sentiment !== "negative") return null;
  return SERIOUS.test(`${n.summary} ${n.topics.join(" ")}`) ? "high" : "medium";
}

/** A second, independent source (another outlet) with negative news on the same token. */
export function isCorroborated(n: NewsItem, symbol: string, all: NewsItem[]): boolean {
  return all.some((o) => o !== n && o.source !== n.source && o.symbols.includes(symbol) && newsSeverity(o) !== null);
}

function resultFrom(ctx: RunContext, reply: string): AgentResult {
  return {
    requestId: ctx.requestId,
    reply,
    cards: [...ctx.cards.values()],
    news: ctx.news,
    odds: null,
    pulse: null,
    calendar: null,
    drift: ctx.drift,
    proposals: ctx.proposals,
    trace: ctx.trace,
    citations: ctx.citations,
    provider: "rules",
    model: null,
    compliance: { status: "pass", issues: [] },
    ms: 0,
    now: new Date(ctx.now).toISOString(),
  };
}

/** Check every rule of one user and send what fires to their U-Bot inbox, as one message. */
export async function runAlerts(
  userId: string,
  now: number,
  trigger: WatchSummary["trigger"] = "manual",
): Promise<{ outcomes: AlertOutcome[]; summary: WatchSummary }> {
  const rules = store.alerts.filter((r) => r.ownerId === userId);
  const typeOf = (r: AlertRule): AlertType => r.type ?? "unlock";
  const ctx = newContext({ userId, scope: "user", requestId: randomUUID(), now, locale: "en" });
  const skipped: WatchSummary["skipped"] = [];
  const outcomes = new Map<string, AlertOutcome & { rank: number }>();
  // A rule over several tokens keeps its most telling reason: fired, then a real candidate held
  // back (already sent, quiet hours, daily cap), then "nothing matched".
  const note = (r: AlertRule, fired: boolean, reason: string, rank = fired ? 3 : 1) => {
    const prev = outcomes.get(r.id);
    if (!prev || rank > prev.rank) {
      outcomes.set(r.id, {
        rank,
        ruleId: r.id,
        symbol: r.symbol,
        fired,
        reason,
        channelNote: r.channel === "ubot" ? undefined : "LINE / Telegram are on the roadmap, so this goes to U-Bot in the app",
      });
    }
  };

  // ─── 1. Fresh data through the agent's tools ───
  const held = (await getHoldings()).map((h) => h.symbol).filter((s) => !STABLES.has(s));
  const expand = (symbol: string) => (symbol === "*" ? held : [symbol.toUpperCase()]);
  const unlockRules = rules.filter((r) => typeOf(r) === "unlock");
  const driftRules = rules.filter((r) => typeOf(r) === "drift");
  const newsRules = rules.filter((r) => typeOf(r) === "news");
  const unlockSymbols = [...new Set(unlockRules.flatMap((r) => expand(r.symbol)))];
  const newsSymbols = [...new Set(newsRules.flatMap((r) => expand(r.symbol)))].slice(0, 5);
  await Promise.all([
    ...unlockSymbols.map((symbol) => executeTool("assess_unlock_risk", { symbol, trade_amount_thb: null }, ctx)),
    driftRules.length ? executeTool("check_portfolio_drift", {}, ctx) : null,
    newsSymbols.length ? executeTool("get_market_news", { query: "", symbols: newsSymbols, days: 3 }, ctx) : null,
  ]);

  // ─── 2. Rules, in code ───
  const candidates: (Candidate & { rule: AlertRule })[] = [];
  for (const r of unlockRules) {
    for (const symbol of expand(r.symbol)) {
      const card = ctx.cards.get(symbol);
      if (!card) {
        note(r, false, ctx.notes.get(symbol) ? `${symbol}: ${ctx.notes.get(symbol)}` : `${symbol}: no unlock data`);
        continue;
      }
      const m = matches(r, card);
      if (!m.ok) {
        note(r, false, `${symbol}: ${m.reason}`);
        continue;
      }
      candidates.push({
        rule: r,
        ruleId: r.id,
        type: "unlock",
        symbol,
        severity: card.level === "high" ? "high" : "medium",
        dedupeKey: `unlock:${symbol}:${(card.unlockDate ?? "none").slice(0, 10)}:${card.level}`,
        title: `${symbol} unlock coming up (${LEVEL_LABEL[card.level]} risk ${card.score}/100)`,
        lines: card.reasons.slice(0, 2),
      });
    }
  }

  const drift = ctx.drift;
  for (const r of driftRules) {
    if (!drift?.hasTargets) {
      note(r, false, "No target mix set yet (set it on the portfolio page)");
      continue;
    }
    const off = drift.rows.filter((row) => row.status === "over" || row.status === "under");
    if (off.length === 0) note(r, false, `Every holding is within ±${drift.bandPp} points of target`);
    for (const row of off) {
      const over = row.status === "over";
      const soon = row.unlockDate !== null && new Date(row.unlockDate).getTime() - now <= 7 * 86_400_000;
      const risky = over && row.riskLevel === "high" && soon;
      candidates.push({
        rule: r,
        ruleId: r.id,
        type: "drift",
        symbol: row.symbol,
        severity: risky ? "high" : "medium",
        // Drift may repeat once a day while it lasts.
        dedupeKey: `drift:${row.symbol}:${over ? "over" : "under"}:${bangkokDay(now)}`,
        title: `${row.symbol} is ${Math.abs(row.driftPp ?? 0)} points ${over ? "over" : "under"} your target`,
        lines: [
          `Now ${row.weightPct}% of the portfolio; your target is ${row.targetPct}%`,
          ...(risky && row.unlockDate ? [`and ${row.symbol} has a high-risk unlock ${untilLabel(row.unlockDate, now)}`] : []),
        ],
      });
    }
  }

  const news = ctx.news?.data ?? [];
  for (const r of newsRules) {
    const watched = new Set(expand(r.symbol));
    let any = false;
    for (const n of news) {
      const symbol = n.symbols.find((s) => watched.has(s));
      const severity = symbol ? newsSeverity(n) : null;
      if (!symbol || !severity || SEV[severity] < SEV[r.minLevel]) continue;
      any = true;
      // A high alert needs a second, independent source on the same token.
      if (severity === "high" && !isCorroborated(n, symbol, news)) {
        skipped.push({ title: `${symbol} news: ${n.summary}`, reason: `Serious news from one source only (${n.source}); waiting for a second source` });
        note(r, false, `${symbol}: single-source news, waiting for a second source`);
        continue;
      }
      candidates.push({
        rule: r,
        ruleId: r.id,
        type: "news",
        symbol,
        severity,
        dedupeKey: `news:${n.url}#${n.summary.slice(0, 60)}`,
        title: `${symbol} news: ${n.summary}`,
        lines: [`Source: ${n.source}${n.date ? ` · ${shortDate(n.date)}` : ""}`],
        url: n.url,
      });
    }
    if (!any) note(r, false, "No relevant negative news in the last 3 days");
  }

  // ─── 3. Dedupe, quiet hours, daily cap ───
  const byKey = new Map<string, Candidate & { rule: AlertRule }>();
  for (const c of candidates) {
    const prev = byKey.get(c.dedupeKey);
    if (!prev || SEV[c.severity] > SEV[prev.severity]) byKey.set(c.dedupeKey, c);
  }
  const quiet = inQuietHours(now);
  const mine = store.alertEvents.filter((e) => e.ownerId === userId);
  let today = mine.filter((e) => bangkokDay(new Date(e.firedAt).getTime()) === bangkokDay(now)).length;
  const fired: AlertEvent[] = [];
  for (const c of [...byKey.values()].sort((a, b) => SEV[b.severity] - SEV[a.severity])) {
    const { rule, ...event } = c;
    if (mine.some((e) => e.dedupeKey === c.dedupeKey)) {
      skipped.push({ title: c.title, reason: "Already sent (no repeats)" });
      note(rule, false, `${c.symbol}: already sent`, 2);
    } else if (quiet && c.severity !== "high") {
      skipped.push({ title: c.title, reason: `Quiet hours ${config.watch.quietStartHour}:00–${config.watch.quietEndHour}:00 · will send on a later run` });
      note(rule, false, `${c.symbol}: quiet hours, will send later`, 2);
    } else if (today >= config.watch.maxPerDay) {
      skipped.push({ title: c.title, reason: `Daily limit of ${config.watch.maxPerDay} reached · will send tomorrow` });
      note(rule, false, `${c.symbol}: daily limit reached`, 2);
    } else {
      fired.push({ ...event, id: randomUUID(), ownerId: userId, firedAt: new Date(now).toISOString() });
      note(rule, true, c.title);
      today++;
    }
  }

  // ─── 4. Protective proposals + one U-Bot message ───
  if (fired.length > 0) {
    const overTarget = new Set(fired.filter((e) => e.type === "drift" && e.dedupeKey.includes(":over:")).map((e) => e.symbol));
    for (const symbol of new Set(fired.filter((e) => e.type !== "news").map((e) => e.symbol))) {
      const card = ctx.cards.get(symbol);
      if (card && (card.level === "high" || card.level === "medium")) {
        await executeTool("propose_protection", { symbol, action: overTarget.has(symbol) ? "pause_buying" : "price_alert" }, ctx);
      }
    }
    const reply = [
      `U-Guard alert: ${fired.length} item${fired.length === 1 ? "" : "s"}`,
      ...fired.map((e) => `• ${e.title}${e.lines[0] ? ` · ${e.lines[0]}` : ""}`),
      ...(fired.some((e) => outcomes.get(e.ruleId)?.channelNote) ? ["(LINE / Telegram are on the roadmap, so this came through U-Bot)"] : []),
    ].join("\n");
    const base = resultFrom(ctx, reply);
    const firedSyms = new Set(fired.filter((e) => e.type !== "news").map((e) => e.symbol));
    const result: AgentResult = {
      ...base,
      cards: base.cards.filter((c) => firedSyms.has(c.symbol) && (c.level === "high" || c.level === "medium")),
      drift: fired.some((e) => e.type === "drift") ? base.drift : null,
      news: base.news ? { ...base.news, data: base.news.data.filter((n) => fired.some((e) => e.type === "news" && e.url === n.url)) } : null,
    };
    try {
      await getUBot().send(userId, "alert", result);
      store.alertEvents.unshift(...fired);
      store.alertEvents.splice(500);
    } catch (err) {
      // Not recorded, so the next run tries again.
      for (const e of fired) skipped.push({ title: e.title, reason: `Could not send: ${(err as Error).message}` });
      fired.length = 0;
    }
  }
  for (const r of rules) if (!outcomes.has(r.id)) note(r, false, "Nothing matched");

  const summary: WatchSummary = { ranAt: new Date(now).toISOString(), trigger, fired, skipped };
  store.lastWatch.set(userId, summary);
  return {
    outcomes: rules.map((r) => {
      const o = outcomes.get(r.id)!;
      return { ruleId: o.ruleId, symbol: o.symbol, fired: o.fired, reason: o.reason, channelNote: o.channelNote };
    }),
    summary,
  };
}
