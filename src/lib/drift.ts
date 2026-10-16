// Portfolio drift (AGENTIC-WORKFLOW.md §8): how far the portfolio has moved from the mix the
// user set, plus its unlock risk, dilution and concentration. All deterministic. Drift is
// measured against the user's own plan; it never says what to buy or sell.

import { readFixture } from "./fixtures";
import { supplyForecast } from "./forecast";
import { LEVEL_LABEL, LEVEL_TH, untilLabel, untilText } from "./format";
import { getHoldings } from "./portfolio";
import { assessUnlockRisk } from "./risk";
import { store, type Targets } from "./store";
import type { DriftReport, DriftRow, Holding, Locale, RiskCard } from "./types";

export interface HoldingRisk extends Holding {
  weightPct: number;
  card: RiskCard | null;
  dilutionPct: number;
}

/** The user's target mix; a new user starts from the demo targets in data/fixtures. */
export async function getTargets(userId: string): Promise<Targets> {
  const own = store.targets.get(userId);
  if (own) return own;
  const fx = await readFixture<Targets>("targets.json");
  return { targets: fx?.targets ?? {}, bandPp: fx?.bandPp ?? 5 };
}

export function setTargets(userId: string, t: Targets): void {
  store.targets.set(userId, t);
}

/** Every holding with its weight, unlock risk card and 6-month dilution. */
export async function portfolioRisk(opts: { locale?: Locale; now?: number; userId?: string } = {}): Promise<{ rows: HoldingRisk[]; totalThb: number }> {
  const holdings = await getHoldings(opts.userId);
  const totalThb = holdings.reduce((s, h) => s + h.valueThb, 0);
  const rows = await Promise.all(
    holdings.map(async (h): Promise<HoldingRisk> => {
      const [risk, forecast] = await Promise.all([
        assessUnlockRisk(h.symbol, null, { locale: opts.locale, now: opts.now }),
        supplyForecast(h.symbol, 6, { now: opts.now }),
      ]);
      return {
        ...h,
        weightPct: totalThb > 0 ? (h.valueThb / totalThb) * 100 : 0,
        card: risk.ok ? risk.card : null,
        dilutionPct: forecast?.dilutionPct ?? 0,
      };
    }),
  );
  return { rows, totalThb };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export async function checkDrift(
  userId: string,
  opts: { locale?: Locale; now?: number; pre?: { rows: HoldingRisk[]; totalThb: number } } = {},
): Promise<DriftReport> {
  const [{ rows, totalThb }, t] = await Promise.all([opts.pre ?? portfolioRisk({ ...opts, userId }), getTargets(userId)]);
  const th = opts.locale === "th";
  const now = opts.now ?? Date.now();
  const hasTargets = Object.keys(t.targets).length > 0;

  // Off target: outside the band, or off by more than a quarter of a small target.
  const outOfBand = (drift: number, target: number) =>
    Math.abs(drift) > t.bandPp || (target > 0 && Math.abs(drift) >= 1 && Math.abs(drift) / target > 0.25);

  const driftRows: DriftRow[] = rows.map((r) => {
    const target = hasTargets ? (t.targets[r.symbol] ?? null) : null;
    const drift = target === null ? null : r.weightPct - target;
    const status: DriftRow["status"] =
      drift === null || target === null ? "no_target" : !outOfBand(drift, target) ? "ok" : drift > 0 ? "over" : "under";
    return {
      symbol: r.symbol,
      valueThb: r.valueThb,
      weightPct: r1(r.weightPct),
      targetPct: target,
      driftPp: drift === null ? null : r1(drift),
      status,
      riskLevel: r.card?.level ?? null,
      riskScore: r.card && r.card.level !== "none" ? r.card.score : 0,
      unlockDate: r.card?.unlockDate ?? null,
      dilutionPct: r1(r.dilutionPct),
    };
  });
  // A target for a token the user doesn't hold yet is fully under target.
  for (const [symbol, target] of Object.entries(t.targets)) {
    if (driftRows.some((r) => r.symbol === symbol)) continue;
    driftRows.push({
      symbol,
      valueThb: 0,
      weightPct: 0,
      targetPct: target,
      driftPp: -target,
      status: outOfBand(-target, target) ? "under" : "ok",
      riskLevel: null,
      riskScore: 0,
      unlockDate: null,
      dilutionPct: 0,
    });
  }

  const withTarget = driftRows.filter((r) => r.driftPp !== null);
  const totalDriftPct = r1(withTarget.reduce((s, r) => s + Math.abs(r.driftPp!), 0) / 2);
  const portfolioRiskScore = Math.round(driftRows.reduce((s, r) => s + (r.weightPct / 100) * r.riskScore, 0));
  const weightedDilutionPct = r1(driftRows.reduce((s, r) => s + (r.weightPct / 100) * r.dilutionPct, 0));
  const top = [...driftRows].sort((a, b) => b.weightPct - a.weightPct)[0];

  // ─── Plain-language lines (at most 3) ───
  const lines: string[] = [];
  const off = withTarget.filter((r) => r.status === "over" || r.status === "under").sort((a, b) => Math.abs(b.driftPp!) - Math.abs(a.driftPp!));
  const describe = (r: DriftRow) =>
    th
      ? `${r.symbol} อยู่ที่ ${r.weightPct}% ของพอร์ต ${r.status === "over" ? "เกิน" : "ต่ำกว่า"}เป้าที่คุณตั้งไว้ (${r.targetPct}%) ${Math.abs(r.driftPp!)} จุด`
      : `${r.symbol} is ${r.weightPct}% of your portfolio, ${Math.abs(r.driftPp!)} points ${r.status === "over" ? "above" : "below"} your ${r.targetPct}% target.`;
  if (!hasTargets) {
    lines.push(th ? "ยังไม่ได้ตั้งเป้าสัดส่วนพอร์ต จึงดูได้แค่การกระจุกตัวและความเสี่ยง" : "You haven't set a target mix yet, so this shows concentration and unlock risk only.");
    if (top) lines.push(th ? `เหรียญที่ถือมากที่สุดคือ ${top.symbol} (${top.weightPct}% ของพอร์ต)` : `Largest holding: ${top.symbol} (${top.weightPct}% of the portfolio).`);
  } else if (off.length === 0) {
    lines.push(th ? `ทุกเหรียญอยู่ในกรอบ ±${t.bandPp} จุดจากเป้าที่คุณตั้งไว้` : `Every token is within ±${t.bandPp} points of the target mix you set.`);
  } else {
    lines.push(describe(off[0]));
    const riskyOver = off.find((r) => r.status === "over" && (r.riskLevel === "high" || r.riskLevel === "medium") && r.unlockDate);
    if (riskyOver) {
      lines.push(
        th
          ? `ส่วนที่เกินเป้าคือเหรียญที่มี unlock ${LEVEL_TH[riskyOver.riskLevel!]} (${riskyOver.symbol}, ${untilText(riskyOver.unlockDate!, now)})`
          : `The overweight part is in a token with a ${LEVEL_LABEL[riskyOver.riskLevel!].toLowerCase()}-risk unlock (${riskyOver.symbol}, ${untilLabel(riskyOver.unlockDate!, now)}).`,
      );
    } else if (off[1]) {
      lines.push(describe(off[1]));
    }
  }
  lines.push(
    th
      ? `คะแนนความเสี่ยง unlock ทั้งพอร์ต ${portfolioRiskScore}/100${hasTargets ? ` · ห่างจากเป้ารวม ${totalDriftPct}%` : ""}`
      : `Portfolio unlock risk score ${portfolioRiskScore}/100${hasTargets ? ` · ${totalDriftPct}% away from your target mix` : ""}.`,
  );

  return {
    hasTargets,
    bandPp: t.bandPp,
    rows: driftRows,
    totalThb,
    totalDriftPct,
    portfolioRiskScore,
    weightedDilutionPct,
    concentration: top ? { symbol: top.symbol, weightPct: top.weightPct } : null,
    lines: lines.slice(0, 3),
    // The oldest price behind these weights, for "prices as of …".
    pricesAsOf: rows.map((r) => r.asOf).filter((x): x is string => Boolean(x)).sort()[0] ?? null,
  };
}
