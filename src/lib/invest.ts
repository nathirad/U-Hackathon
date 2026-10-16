// Invest plans: a five-question risk profile picks a model portfolio (the user can change every
// weight), U-Guard checks the crypto part against unlock schedules, and the monthly DCA dates
// are flagged when they land on a big unlock. Model portfolios are illustrative and labelled
// as such; a real advisory service needs a licensed partner (Thai SEC).

import { randomUUID } from "node:crypto";
import { recordMemo } from "./avalanche";
import { readFixture } from "./fixtures";
import { LEVEL_LABEL, shortDate, thb } from "./format";
import { assessUnlockRisk } from "./risk";
import { store } from "./store";
import type { DataSource, InvestCheck, InvestPlan, InvestProfile, InvestSlice } from "./types";

interface Universe {
  mode?: DataSource;
  classes: { id: string; name: string; example: string; risk: number; feePct: number; color: string }[];
  profiles: Record<InvestProfile, { name: string; weights: Record<string, number>; cryptoMax: number }>;
}

export const QUESTIONS = [
  { q: "How long do you plan to invest?", a: ["Under 1 year", "1–3 years", "3–5 years", "Over 5 years"] },
  { q: "If your portfolio fell 20% in one month, you would", a: ["Sell everything", "Sell some", "Hold", "Buy more"] },
  { q: "What have you invested in before?", a: ["Nothing yet", "Deposits / money market funds", "Stocks / equity funds", "Crypto / derivatives"] },
  { q: "How much of your total savings is this money?", a: ["Over 75%", "50–75%", "25–50%", "Under 25%"] },
  { q: "Main goal", a: ["Keep my capital safe", "Steady income", "Moderate growth", "High growth"] },
] as const;

export interface InvestInput {
  answers: number[]; // five answers, 1..4
  lumpSumThb: number;
  monthlyThb: number;
  dcaDay: number;
  weights?: Record<string, number>; // user-adjusted, any scale; normalised to 100
  cryptoPicks?: string[];
}

export function profileFor(score: number): InvestProfile {
  if (score <= 9) return "conservative";
  if (score <= 14) return "moderate";
  if (score <= 17) return "growth";
  return "aggressive";
}

async function universe(): Promise<Universe> {
  const u = await readFixture<Universe>("invest-universe.json");
  if (!u) throw new Error("invest-universe.json missing");
  return u;
}

/** Profile defaults, for the page to show before the user drafts a plan. */
export async function investDefaults() {
  const u = await universe();
  return { questions: QUESTIONS, classes: u.classes, profiles: u.profiles, source: u.mode ?? "sample" };
}

function nextDcaDates(now: number, day: number, n: number): string[] {
  const d = new Date(now);
  const out: string[] = [];
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth();
  if (d.getUTCDate() >= day) m += 1;
  while (out.length < n) {
    const dt = new Date(Date.UTC(y, m, day));
    out.push(dt.toISOString().slice(0, 10));
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

const DAY = 86_400_000;

export async function draftInvestPlan(input: InvestInput, userId: string, now: number, origin: "app" | "mcp" = "app"): Promise<InvestPlan> {
  const u = await universe();
  const score = input.answers.reduce((s, a) => s + a, 0);
  const profile = profileFor(score);
  const base = u.profiles[profile];

  // Weights: the user's own when given, else the profile's model portfolio. Normalised to 100.
  const raw = Object.fromEntries(u.classes.map((c) => [c.id, Math.max(0, input.weights?.[c.id] ?? base.weights[c.id] ?? 0)]));
  const total = Object.values(raw).reduce((s, v) => s + v, 0) || 1;
  const slices: InvestSlice[] = u.classes.map((c) => {
    const pct = Math.round((raw[c.id] / total) * 1000) / 10;
    return {
      id: c.id,
      name: c.name,
      example: c.example,
      risk: c.risk,
      pct,
      lumpThb: Math.round((input.lumpSumThb * pct) / 100),
      monthlyThb: Math.round((input.monthlyThb * pct) / 100),
      color: c.color,
    };
  });
  const cryptoPct = slices.find((s) => s.id === "crypto")?.pct ?? 0;
  const weightedRisk = slices.reduce((s, x) => s + (x.pct / 100) * Math.min(8, x.risk), 0);
  const feePctYear = slices.reduce((s, x) => s + (x.pct / 100) * (u.classes.find((c) => c.id === x.id)?.feePct ?? 0), 0);

  // Crypto split and U-Guard's unlock check on each pick.
  const picks = [...new Set((input.cryptoPicks?.length ? input.cryptoPicks : ["BTC", "ETH"]).map((p) => p.toUpperCase()))].slice(0, 5);
  const crypto: InvestPlan["crypto"] = [];
  const unlocks: { symbol: string; date: string; label: string }[] = [];
  for (const sym of picks) {
    const r = await assessUnlockRisk(sym, null, { now, locale: "en" });
    if (r.ok) {
      const c = r.card;
      crypto.push({ symbol: sym, pctOfCrypto: Math.round(1000 / picks.length) / 10, level: c.level, score: c.score, note: c.reasons[0] ?? c.headline });
      for (const d of [c.unlockDate, c.nextUnlock?.date]) {
        if (d && c.timing !== "continuous") unlocks.push({ symbol: sym, date: d, label: shortDate(d) });
      }
    } else {
      crypto.push({ symbol: sym, pctOfCrypto: Math.round(1000 / picks.length) / 10, level: "none", score: null, note: r.reason });
    }
  }

  const dates = nextDcaDates(now, Math.min(28, Math.max(1, Math.round(input.dcaDay))), 3);
  const dca = dates.map((date) => {
    const t = new Date(`${date}T00:00:00Z`).getTime();
    const notes = unlocks
      .filter((x) => {
        const gap = (new Date(x.date).getTime() - t) / DAY;
        return gap >= -2 && gap <= 7;
      })
      .map((x) => `${x.symbol}: this buy falls near the ${x.label} unlock · you can move the ${x.symbol} part to after the unlock`);
    return { date, amountThb: input.monthlyThb, notes };
  });

  const checks: InvestCheck[] = [];
  checks.push(
    cryptoPct > base.cryptoMax
      ? { status: "warn", label: `Crypto ${cryptoPct}% is above the "${base.name}" level`, detail: `Your answers put you at "${base.name}", whose model portfolio holds at most ${base.cryptoMax}% crypto` }
      : { status: "ok", label: `Crypto ${cryptoPct}% fits the "${base.name}" level`, detail: `The model portfolio at this level holds at most ${base.cryptoMax}% crypto` },
  );
  for (const c of crypto.filter((x) => x.level === "high" || x.level === "medium")) {
    checks.push({ status: "warn", label: `${c.symbol} has an unlock coming up (${LEVEL_LABEL[c.level]} risk ${c.score}/100)`, detail: c.note });
  }
  const flagged = dca.filter((d) => d.notes.length > 0).length;
  if (cryptoPct > 0) {
    checks.push(
      flagged > 0
        ? { status: "warn", label: `${flagged === 1 ? "1 DCA buy lands" : `${flagged} DCA buys land`} near an unlock`, detail: "See the dates with notes in the DCA table below" }
        : { status: "ok", label: "DCA avoids big unlocks", detail: "None of the next 3 buys is within 7 days before an unlock of the coins you picked" },
    );
  }
  if (input.answers[3] === 1) {
    checks.push({ status: "warn", label: "Investing over 75% of your savings", detail: "Keep an emergency fund (about 3–6 months of expenses) outside the portfolio first" });
  }
  const riskyPct = slices.filter((s) => ["thai_equity", "global_equity", "gold", "crypto"].includes(s.id)).reduce((s, x) => s + x.pct, 0);
  if (input.answers[0] === 1 && riskyPct > 30) {
    checks.push({ status: "warn", label: "Short horizon, lots of risky assets", detail: `Under 1 year, but stocks, gold and crypto make up ${riskyPct.toFixed(0)}%: prices may not recover before you need the money` });
  }

  const top = [...slices].sort((a, b) => b.pct - a.pct).slice(0, 3);
  const warns = checks.filter((c) => c.status === "warn");
  const summary = [
    `Risk profile ${score}/20 → "${base.name}" · model portfolio led by ${top.map((t) => `${t.name} ${t.pct}%`).join(", ")}`,
    `Lump sum ${thb(input.lumpSumThb)} + DCA ${thb(input.monthlyThb)} on day ${dates[0].slice(8, 10).replace(/^0/, "")} of each month · average risk ${weightedRisk.toFixed(1)}/8 · fees about ${feePctYear.toFixed(2)}%/year`,
    warns.length ? `U-Guard flags ${warns.length === 1 ? "one thing" : `${warns.length} things`}: ${warns.map((w) => w.label).join(" · ")}` : "Passes every U-Guard check · you can still change the weights before approving",
  ];

  const plan: InvestPlan = {
    id: randomUUID(),
    profile,
    profileName: base.name,
    score,
    answers: [...input.answers],
    lumpSumThb: input.lumpSumThb,
    monthlyThb: input.monthlyThb,
    dcaDay: Math.round(input.dcaDay),
    slices,
    crypto,
    checks,
    dca,
    weightedRisk,
    feePctYear,
    summary,
    source: u.mode ?? "sample",
    createdAt: new Date(now).toISOString(),
    status: "pending",
    origin,
  };
  store.investPlans.set(plan.id, { plan, ownerId: userId });
  if (store.investPlans.size > 500) store.investPlans.delete(store.investPlans.keys().next().value!);
  return plan;
}

export async function decideInvestPlan(planId: string, decision: "approve" | "decline", userId: string) {
  const rec = store.investPlans.get(planId);
  if (!rec || rec.ownerId !== userId) return { ok: false as const, status: 404, error: "Plan not found. Draft a new one." };
  const { plan } = rec;
  if (plan.status !== "pending") {
    const same = (plan.status === "approved") === (decision === "approve");
    return same ? { ok: true as const, plan } : { ok: false as const, status: 409, error: "You already decided on this plan" };
  }
  if (decision === "decline") {
    plan.status = "declined";
    return { ok: true as const, plan };
  }
  plan.receipt = await recordMemo(
    plan.id,
    JSON.stringify({
      app: "U-Guard",
      v: 1,
      kind: "invest_plan",
      profile: plan.profile,
      weights: Object.fromEntries(plan.slices.map((s) => [s.id, s.pct])),
      monthlyThb: plan.monthlyThb,
      dcaDay: plan.dcaDay,
      approvedAt: new Date().toISOString(),
    }),
  );
  plan.status = "approved";
  return { ok: true as const, plan };
}

/** Plans still waiting for the user's decision (drafted on the page or by U-Bot over MCP), newest first. */
export function pendingInvestPlans(userId: string): InvestPlan[] {
  return [...store.investPlans.values()].filter((r) => r.ownerId === userId && r.plan.status === "pending").map((r) => r.plan).reverse().slice(0, 5);
}

export function myInvestPlans(userId: string): InvestPlan[] {
  return [...store.investPlans.values()].filter((r) => r.ownerId === userId && r.plan.status === "approved").map((r) => r.plan).reverse();
}
