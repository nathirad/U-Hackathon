// Deterministic unlock-risk score (v0.2 heuristic). The LLM explains this result; it never
// computes it.
//
// Weights follow Keyrock's study of 16,000+ unlock events
// (https://keyrock.com/from-locked-to-liquidity-what-16000-token-unlocks-teach-us/):
//   - 90% of unlocks push price down; pressure starts ~30 days before, sharpest in the last
//     week, and fades about two weeks after
//   - size relative to circulating supply matters (buckets below are Keyrock's)
//   - recipient matters most: team unlocks are worst (~-25%), investor unlocks are
//     hedged/OTC (moderate), ecosystem-development unlocks average +1.18%

import { config, now as clockNow } from "./config";
import { compact, daysBetween, pct, relativeDays, shortDate, thaiDate, untilText, usd } from "./format";
import { getQuote } from "./market";
import { findToken, getFundraising, getUnlockEvents, type FundraisingData, type UnlockEvent } from "./tokenomist";
import { classifyRecipient } from "./recipient";
import type { Locale, RecipientClass, RecipientSlice, RiskCard, RiskLevel, UnlockTiming } from "./types";

export { classifyRecipient };

export const RISK_VERSION = "v0.2";
const DAY_MS = 86_400_000;

const RECIPIENT_WEIGHT: Record<RecipientClass, number> = {
  team: 1.0,
  investor: 0.6,
  community: 0.5,
  other: 0.5,
  reserve: 0.4,
  ecosystem: 0.0,
};

export const RECIPIENT_LABEL: Record<RecipientClass, string> = {
  team: "Team",
  investor: "Investors",
  community: "Community / airdrop",
  other: "Other",
  reserve: "Foundation / treasury reserve",
  ecosystem: "Ecosystem fund",
};

export const RECIPIENT_TH: Record<RecipientClass, string> = {
  team: "ทีมงาน",
  investor: "นักลงทุน",
  community: "ชุมชน / airdrop",
  other: "อื่นๆ",
  reserve: "เงินสำรองโครงการ",
  ecosystem: "กองทุนพัฒนา ecosystem",
};

const RECIPIENT_NOTE_TH: Record<RecipientClass, string> = {
  team: "Keyrock พบว่า unlock ของทีมกดราคาแรงที่สุด (เฉลี่ย −25%)",
  investor: "นักลงทุนมักทยอยขายผ่าน OTC/hedge ผลกระทบปานกลาง",
  community: "ผลกระทบมักปานกลาง",
  other: "",
  reserve: "ขึ้นกับว่าโครงการนำไปใช้อย่างไร",
  ecosystem: "Keyrock พบว่ามักไม่กดราคา (เฉลี่ย +1.18%)",
};

const RECIPIENT_NOTE: Record<RecipientClass, string> = {
  team: "Team unlocks hit prices hardest in Keyrock's study (about -25% on average).",
  investor: "Investors often sell gradually via OTC desks or hedges, so the impact is usually moderate.",
  community: "The impact is usually moderate.",
  other: "",
  reserve: "The impact depends on how the foundation uses it.",
  ecosystem: "Ecosystem-fund unlocks averaged +1.18% in Keyrock's study.",
};

// Assets that never have vesting unlocks: answering "no unlock risk" is a fact, not a gap.
const NO_VESTING: Record<string, string> = {
  USDC: "USDC is a stablecoin: new supply is minted against deposits, not unlocked from a vesting schedule.",
  USDT: "USDT is a stablecoin: new supply is minted against deposits, not unlocked from a vesting schedule.",
  DAI: "DAI is a stablecoin: new supply is minted against collateral, not unlocked from a vesting schedule.",
  BTC: "Bitcoin has no vesting unlocks. New supply comes only from mining (about 450 BTC a day, fixed by the protocol).",
  ETH: "Ether has no vesting unlocks. Supply changes come from staking issuance and fee burning.",
};

const NO_VESTING_TH: Record<string, string> = {
  USDC: "USDC เป็น stablecoin เหรียญใหม่ถูกสร้างจากเงินฝาก ไม่ได้มาจากตาราง vesting จึงไม่มีการปลดล็อก",
  USDT: "USDT เป็น stablecoin เหรียญใหม่ถูกสร้างจากเงินฝาก ไม่ได้มาจากตาราง vesting จึงไม่มีการปลดล็อก",
  DAI: "DAI เป็น stablecoin เหรียญใหม่ถูกสร้างจากหลักประกัน ไม่ได้มาจากตาราง vesting จึงไม่มีการปลดล็อก",
  BTC: "Bitcoin ไม่มี vesting unlock เหรียญใหม่มาจากการขุดเท่านั้น (ประมาณ 450 BTC ต่อวัน ตามโปรโตคอล)",
  ETH: "Ether ไม่มี vesting unlock อุปทานเปลี่ยนจากรางวัล staking และการเผาค่าธรรมเนียม",
};

/** "เมื่อวาน" / "วันนี้" / "เมื่อ 3 วันก่อน" for a cliff that already happened. */
function agoTh(days: number): string {
  return days === 0 ? "วันนี้" : days === -1 ? "เมื่อวาน" : `เมื่อ ${-days} วันก่อน`;
}

function sizeScore(pctCirc: number): number {
  if (pctCirc < 0.1) return 0.05; // nano
  if (pctCirc < 0.5) return 0.2; // micro
  if (pctCirc < 1) return 0.4; // small
  if (pctCirc < 5) return 0.7; // medium
  if (pctCirc < 10) return 1.0; // large
  return 0.9; // huge: Keyrock found these no worse than large (too big to dump at once)
}

function liquidityScore(daysOfVolume: number | null): number {
  if (daysOfVolume === null) return 0.5;
  if (daysOfVolume < 0.1) return 0.1;
  if (daysOfVolume < 0.5) return 0.4;
  if (daysOfVolume < 1) return 0.7;
  return 1.0;
}

function timeFactor(timing: UnlockTiming, days: number): number {
  if (timing === "continuous") return 0.65; // steady drip rather than one shock
  if (timing === "recent") {
    const since = -days;
    if (since <= 2) return 0.85;
    if (since <= 7) return 0.6;
    return 0.4;
  }
  if (days <= 7) return 1.0;
  if (days <= 14) return 0.8;
  return 0.65;
}

function levelFor(score: number): RiskLevel {
  if (score >= 55) return "high";
  if (score >= 30) return "medium";
  return "low";
}

/** Current price ÷ the price the most recent priced round paid. */
function investorMultiple(
  fund: FundraisingData | null,
  priceUsd: number,
  maxSupply: number,
): { multiple: number; round: string } | null {
  const rounds = [...(fund?.fundingRounds ?? [])].sort((a, b) => b.fundingDate.localeCompare(a.fundingDate));
  for (const r of rounds) {
    if (r.pricePerToken && r.pricePerToken > 0) return { multiple: priceUsd / r.pricePerToken, round: r.fundingRound };
    if (r.valuation && r.valuation > 0 && maxSupply > 0) {
      return { multiple: (priceUsd * maxSupply) / r.valuation, round: r.fundingRound };
    }
  }
  return null;
}

/** Investor profit pressure for one token (dashboard view). */
export async function investorPressure(symbol: string) {
  const { token } = await findToken(symbol);
  if (!token) return null;
  const [fund, quote] = await Promise.all([getFundraising(token.id), getQuote(token.symbol)]);
  const priceUsd = quote?.priceUsd ?? (token.circulatingSupply > 0 ? token.marketCap / token.circulatingSupply : 0);
  const m = investorMultiple(fund.data, priceUsd, token.maxSupply);
  return {
    symbol: token.symbol,
    name: token.name,
    raisedUsd: fund.data?.totalAmountRaised ?? null,
    round: m?.round ?? null,
    multiple: m?.multiple ?? null,
    fdvUsd: priceUsd * token.maxSupply,
    source: fund.source,
    asOf: fund.asOf,
  };
}

function multipleScore(m: number | null): number {
  if (m === null) return 0;
  if (m >= 10) return 1;
  if (m >= 3) return 0.6;
  if (m >= 1) return 0.3;
  return 0; // investors under water rarely rush to sell
}

function linearAmount(e: UnlockEvent): number {
  const l = e.linearUnlocks;
  if (!l) return 0;
  return (
    l.linearAmount ??
    l.amount ??
    (l.allocationBreakdown ?? []).reduce((sum, a) => sum + (a.linearAmount ?? a.amount ?? 0), 0)
  );
}

interface Candidate {
  timing: Exclude<UnlockTiming, "none">;
  event: UnlockEvent;
  amount: number; // tokens released inside the watch window
  slices: { name: string; std: string; amount: number }[];
  days: number | null;
  windowDays: number | null;
}

export type RiskResult =
  | { ok: true; card: RiskCard }
  | { ok: false; kind: "no_vesting" | "not_covered"; symbol: string; reason: string };

export async function assessUnlockRisk(
  symbol: string,
  tradeAmountThb: number | null = null,
  opts: { now?: number; locale?: Locale } = {},
): Promise<RiskResult> {
  const sym = symbol.trim().toUpperCase();
  const th = opts.locale === "th"; // Thai copy for Thai questions; English otherwise
  if (NO_VESTING[sym]) return { ok: false, kind: "no_vesting", symbol: sym, reason: th ? NO_VESTING_TH[sym] : NO_VESTING[sym] };

  const { token } = await findToken(symbol);
  if (!token) {
    return {
      ok: false,
      kind: "not_covered",
      symbol: sym,
      reason: th
        ? `ยังไม่มีข้อมูล unlock ของ ${sym} ในชุดข้อมูลตอนนี้ U-Guard จึงยังให้คะแนนไม่ได้ (ถ้าใช้ Tokenomist key แบบสดจะครอบคลุมกว่า 500 เหรียญ)`
        : `No unlock data for ${sym} in the current dataset, so U-Guard can't rate it. With a live Tokenomist key it covers 500+ tokens.`,
    };
  }

  const t = opts.now ?? clockNow();
  const start = new Date(t - config.postUnlockDays * DAY_MS).toISOString().slice(0, 10);
  const end = new Date(t + 60 * DAY_MS).toISOString().slice(0, 10); // a little past the window, to name the next unlock
  const [events, fundraising, quote] = await Promise.all([
    getUnlockEvents(token.id, start, end),
    getFundraising(token.id),
    getQuote(token.symbol),
  ]);

  const priceUsd = quote?.priceUsd ?? (token.circulatingSupply > 0 ? token.marketCap / token.circulatingSupply : 0);
  const windowEnd = t + config.watchWindowDays * DAY_MS;

  // ─── Candidate events ───
  const cliffs = events.data
    .filter((e) => (e.cliffUnlocks?.cliffAmount ?? 0) > 0)
    .sort((a, b) => a.unlockDate.localeCompare(b.unlockDate));
  const toCliff = (e: UnlockEvent, timing: "upcoming" | "recent"): Candidate => ({
    timing,
    event: e,
    amount: e.cliffUnlocks!.cliffAmount,
    slices: e.cliffUnlocks!.allocationBreakdown.map((a) => ({
      name: a.allocationName,
      std: a.standardAllocationName,
      amount: a.cliffAmount,
    })),
    days: daysBetween(t, e.unlockDate),
    windowDays: null,
  });

  const upcomingEvent = cliffs.find((e) => Date.parse(e.unlockDate) > t && Date.parse(e.unlockDate) <= windowEnd);
  const recentEvent = [...cliffs]
    .reverse()
    .find((e) => Date.parse(e.unlockDate) <= t && t - Date.parse(e.unlockDate) <= config.postUnlockDays * DAY_MS);
  const linearEvent = events.data.find((e) => {
    if (linearAmount(e) <= 0) return false;
    const s = Date.parse(e.unlockDate);
    const f = Date.parse(e.endDate ?? e.unlockDate);
    return s <= windowEnd && f >= t;
  });

  const candidates: Candidate[] = [];
  if (upcomingEvent) candidates.push(toCliff(upcomingEvent, "upcoming"));
  if (recentEvent) candidates.push(toCliff(recentEvent, "recent"));
  if (linearEvent) {
    const s = Date.parse(linearEvent.unlockDate);
    const f = Date.parse(linearEvent.endDate ?? linearEvent.unlockDate);
    const span = Math.max(DAY_MS, f - s);
    const overlap = Math.max(0, Math.min(f, windowEnd) - Math.max(s, t));
    const share = Math.min(1, overlap / span);
    candidates.push({
      timing: "continuous",
      event: linearEvent,
      amount: linearAmount(linearEvent) * share,
      slices: (linearEvent.linearUnlocks?.allocationBreakdown ?? []).map((a) => ({
        name: a.allocationName,
        std: a.standardAllocationName,
        amount: (a.linearAmount ?? a.amount ?? 0) * share,
      })),
      days: null,
      windowDays: config.watchWindowDays,
    });
  }

  const shownEvent = upcomingEvent ?? recentEvent;
  const next = cliffs.find((e) => Date.parse(e.unlockDate) > t && e !== shownEvent);
  const nextUnlock = next ? { date: next.unlockDate, amount: next.cliffUnlocks!.cliffAmount } : null;

  const base = {
    symbol: token.symbol,
    name: token.name,
    tradeAmountThb: tradeAmountThb ?? undefined,
    nextUnlock,
    source: { provider: "Tokenomist" as const, mode: events.source, asOf: events.asOf, ...(events.stale ? { stale: true } : {}) },
  };

  if (candidates.length === 0) {
    const W = config.watchWindowDays;
    const reasons = [th ? `ไม่มี unlock ของ ${token.symbol} ในอีก ${W} วันข้างหน้า` : `No ${token.symbol} unlocks in the next ${W} days.`];
    if (nextUnlock) {
      reasons.push(
        th
          ? `unlock ครั้งถัดไป: ${compact(nextUnlock.amount, 2)} ${token.symbol} วันที่ ${thaiDate(nextUnlock.date)} (${untilText(nextUnlock.date, t)})`
          : `Next unlock: ${compact(nextUnlock.amount, 2)} ${token.symbol} on ${shortDate(nextUnlock.date)} (${relativeDays(daysBetween(t, nextUnlock.date))}).`,
      );
    }
    return {
      ok: true,
      card: {
        ...base,
        level: "none",
        score: 0,
        timing: "none",
        unlockDate: null,
        daysUntil: null,
        windowDays: null,
        amount: 0,
        valueUsd: 0,
        pctOfCirculating: 0,
        daysOfVolume: null,
        breakdown: [],
        investorMultiple: null,
        headline: th ? `ไม่มี unlock ใน ${W} วันข้างหน้า` : `No unlocks in the next ${W} days`,
        reasons,
        plain: th
          ? `ไม่มีตาราง unlock ของ ${token.symbol} ในอีก ${W} วัน อุปทานจึงยังไม่ใช่ปัจจัยระยะสั้น`
          : `No ${token.symbol} unlocks are scheduled in the next ${W} days, so supply is not a near-term factor.`,
        factors: { time: 0, size: 0, liquidity: 0, recipient: 0, investorBonus: 0 },
      },
    };
  }

  const fund = fundraising.data;
  const scored = candidates.map((c) => {
    const valueUsd = c.amount * priceUsd;
    const pctCirc = token.circulatingSupply > 0 ? (c.amount / token.circulatingSupply) * 100 : 0;
    const daysOfVolume = quote && quote.volume24hUsd > 0 ? valueUsd / quote.volume24hUsd : null;
    // Tokenomist can list one recipient twice (two allocations with the same name): merge them.
    const merged = [...c.slices.reduce((m, s) => m.set(s.name, { ...s, amount: (m.get(s.name)?.amount ?? 0) + s.amount }), new Map<string, (typeof c.slices)[number]>()).values()];
    const breakdown: RecipientSlice[] = merged
      .map((s) => ({
        name: s.name,
        recipient: classifyRecipient(s.name, s.std),
        amount: s.amount,
        valueUsd: s.amount * priceUsd,
        share: c.amount > 0 ? s.amount / c.amount : 0,
      }))
      .sort((a, b) => b.share - a.share);
    const recipient = breakdown.reduce((sum, s) => sum + s.share * (RECIPIENT_WEIGHT[s.recipient] ?? 0.5), 0);
    const investorShare = breakdown.filter((s) => s.recipient === "investor").reduce((sum, s) => sum + s.share, 0);
    const mult = investorMultiple(fund, priceUsd, token.maxSupply);
    const investorBonus = 10 * investorShare * multipleScore(mult?.multiple ?? null);
    const factors = {
      time: timeFactor(c.timing, c.days ?? 0),
      size: sizeScore(pctCirc),
      liquidity: liquidityScore(daysOfVolume),
      recipient,
      investorBonus,
    };
    const rawScore = Math.round(100 * factors.time * (0.35 * factors.size + 0.3 * factors.liquidity + 0.35 * factors.recipient) + investorBonus);
    const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, rawScore)) : 50;
    return { c, valueUsd, pctCirc, daysOfVolume, breakdown, investorShare, mult, factors, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const { c, valueUsd, pctCirc, daysOfVolume, breakdown, investorShare, mult, factors, score } = scored[0];
  const level = levelFor(score);
  const S = token.symbol;
  const amountText = `${compact(c.amount, 2)} ${S} (~${usd(valueUsd)})`;

  const insidersTh = breakdown.filter((b) => b.recipient === "team" || b.recipient === "investor").reduce((s, b) => s + b.share, 0);
  if (th) {
    const W = config.watchWindowDays;
    const date = thaiDate(c.event.unlockDate);
    const amountTh = `${compact(c.amount, 2)} ${S} (~${usd(valueUsd)})`;
    const reasonsTh: string[] = [];
    let headlineTh: string;
    if (c.timing === "continuous") {
      headlineTh = `ทยอยปลดล็อกต่อเนื่อง · ${W} วันข้างหน้า`;
      reasonsTh.push(`ราว ${amountTh} ทยอยปลดล็อกในอีก ${W} วัน = ${pct(pctCirc)} ของเหรียญที่หมุนเวียน`);
    } else if (c.timing === "recent") {
      headlineTh = `ปลดล็อกแล้ว${agoTh(c.days ?? 0)} · ${date}`;
      reasonsTh.push(
        `${amountTh} ปลดล็อกแล้ว${agoTh(c.days ?? 0)} (${date}) = ${pct(pctCirc)} ของเหรียญที่หมุนเวียน · แรงกดดันราคามักลดลงภายในราว 2 สัปดาห์หลัง unlock`,
      );
    } else {
      headlineTh = `${untilText(c.event.unlockDate, t)} · ${date}`;
      reasonsTh.push(`${untilText(c.event.unlockDate, t)} (${date}) จะปลดล็อก ${amountTh} = ${pct(pctCirc)} ของเหรียญที่หมุนเวียน`);
    }
    if (daysOfVolume !== null) {
      const feel =
        daysOfVolume >= 1 ? "ตลาดรับแรงขายได้ยาก" : daysOfVolume >= 0.5 ? "หนักสำหรับตลาด" : daysOfVolume >= 0.1 ? "ตลาดพอรับได้" : "ตลาดรับได้สบาย";
      reasonsTh.push(`มูลค่าเท่ากับ ~${daysOfVolume.toFixed(2)} วันของ volume ซื้อขาย (${feel})`);
    }
    const topTh = breakdown[0];
    if (topTh) {
      const note = RECIPIENT_NOTE_TH[topTh.recipient];
      reasonsTh.push(`ผู้รับหลักคือ${RECIPIENT_TH[topTh.recipient]} (${Math.round(topTh.share * 100)}%)${note ? ` · ${note}` : ""}`);
    }
    if (mult && investorShare > 0) {
      reasonsTh.push(
        mult.multiple >= 1
          ? `นักลงทุนรอบ ${mult.round} ได้ราคาถูกกว่าตอนนี้ ~${mult.multiple.toFixed(1)} เท่า`
          : `นักลงทุนรอบ ${mult.round} ยังต่ำกว่าทุน จึงมักขายน้อยกว่า`,
      );
    } else if (c.timing === "upcoming" && (c.days ?? 99) <= 7) {
      reasonsTh.push("เข้าสู่ 7 วันสุดท้ายก่อน unlock ซึ่งเป็นช่วงที่ราคามักแกว่งแรงที่สุด");
    }
    if (nextUnlock) {
      reasonsTh.push(`unlock ครั้งถัดไป: ${compact(nextUnlock.amount, 2)} ${S} วันที่ ${thaiDate(nextUnlock.date)} (${untilText(nextUnlock.date, t)})`);
    }
    const insiders = insidersTh >= 0.5;
    const plainTh =
      level === "low"
        ? `${S} ที่ปลดล็อกมีจำนวนน้อย ตลาดรับได้สบาย จึงไม่น่ามีผลมากนัก`
        : c.timing === "continuous"
          ? `${insiders ? "เหรียญของคนใน (ทีมและนักลงทุนรุ่นแรก) " : ""}${S} ทยอยปลดล็อกทุกวัน รวม ${W} วันถือว่าไม่น้อย อาจกดราคาได้`
          : c.timing === "recent"
            ? `${S} ล็อตใหญ่เพิ่งปลดล็อก${insiders ? "ให้คนใน (ทีมและนักลงทุนรุ่นแรก) ซึ่งตอนนี้ขายได้แล้ว" : ""} ราคามักถูกกดดันต่ออีกราว 2 สัปดาห์หลัง unlock`
            : `${S} กำลังจะเข้าตลาดเพิ่ม${insiders ? "จากคนใน (ทีมและนักลงทุนรุ่นแรก) ที่อาจขาย" : ""} ราคามักถูกกดดันช่วง unlock จึงควรรู้ก่อนซื้อ`;
    return {
      ok: true,
      card: {
        ...base,
        level,
        score,
        timing: c.timing,
        unlockDate: c.event.unlockDate,
        daysUntil: c.days,
        windowDays: c.windowDays,
        amount: c.amount,
        valueUsd,
        pctOfCirculating: pctCirc,
        daysOfVolume,
        breakdown,
        investorMultiple: mult?.multiple ?? null,
        headline: headlineTh,
        reasons: reasonsTh,
        plain: plainTh,
        factors,
      },
    };
  }

  // ─── Plain-English reasons (deterministic, so numbers are never hallucinated) ───
  let headline: string;
  const reasons: string[] = [];
  if (c.timing === "continuous") {
    headline = `Continuous release · next ${config.watchWindowDays} days`;
    reasons.push(
      `About ${amountText} is released gradually over the next ${config.watchWindowDays} days: ${pct(pctCirc)} of circulating supply.`,
    );
  } else if (c.timing === "recent") {
    const when = c.days === 0 ? "today" : relativeDays(c.days ?? 0);
    headline = `Unlocked ${when} · ${shortDate(c.event.unlockDate)}`;
    reasons.push(
      `${amountText} unlocked ${when} (${shortDate(c.event.unlockDate)}): ${pct(pctCirc)} of circulating supply. Price pressure tends to fade about two weeks after an unlock.`,
    );
  } else {
    headline = `Unlocks ${relativeDays(c.days ?? 0)} · ${shortDate(c.event.unlockDate)}`;
    reasons.push(
      `${amountText} unlocks ${relativeDays(c.days ?? 0)} (${shortDate(c.event.unlockDate)}): ${pct(pctCirc)} of circulating supply.`,
    );
  }
  if (daysOfVolume !== null) {
    const feel =
      daysOfVolume >= 1
        ? "hard for the market to absorb"
        : daysOfVolume >= 0.5
          ? "a heavy load for the market"
          : daysOfVolume >= 0.1
            ? "manageable for the market"
            : "easy for the market to absorb";
    reasons.push(`That is ~${daysOfVolume.toFixed(2)} days of trading volume: ${feel}.`);
  }
  const top = breakdown[0];
  if (top) {
    const note = RECIPIENT_NOTE[top.recipient];
    reasons.push(`Main recipient: ${RECIPIENT_LABEL[top.recipient]} (${Math.round(top.share * 100)}%).${note ? ` ${note}` : ""}`);
  }
  if (mult && investorShare > 0) {
    reasons.push(
      mult.multiple >= 1
        ? `${mult.round} investors are at ~${mult.multiple.toFixed(1)}x their entry price.`
        : `${mult.round} investors are below their entry price, which usually means less selling.`,
    );
  }
  if (nextUnlock) {
    reasons.push(
      `Next unlock: ${compact(nextUnlock.amount, 2)} ${S} on ${shortDate(nextUnlock.date)} (${relativeDays(daysBetween(t, nextUnlock.date))}).`,
    );
  }

  const insiders = breakdown.filter((b) => b.recipient === "team" || b.recipient === "investor").reduce((s, b) => s + b.share, 0);
  let plain: string;
  if (level === "low") {
    plain = `Only a small amount of ${S} is being released and the market can absorb it easily, so this unlock is unlikely to matter much on its own.`;
  } else if (c.timing === "continuous") {
    plain = `${insiders >= 0.5 ? "Insiders' (team and early investors') " : ""}${S} is being released a little every day. Over the next ${config.watchWindowDays} days that adds up to a meaningful amount, which can weigh on the price.`;
  } else if (c.timing === "recent") {
    plain = `A large batch of ${S} was just released${insiders >= 0.5 ? " to insiders (team and early investors) who can now sell it" : ""}. Prices often stay under pressure for about two weeks after an unlock.`;
  } else {
    plain = `More ${S} is about to enter the market${insiders >= 0.5 ? " from insiders (team and early investors) who may sell" : ""}. Prices often come under pressure around unlocks, so it helps to know before you buy.`;
  }

  return {
    ok: true,
    card: {
      ...base,
      level,
      score,
      timing: c.timing,
      unlockDate: c.event.unlockDate,
      daysUntil: c.days,
      windowDays: c.windowDays,
      amount: c.amount,
      valueUsd,
      pctOfCirculating: pctCirc,
      daysOfVolume,
      breakdown,
      investorMultiple: mult?.multiple ?? null,
      headline,
      reasons,
      plain,
      factors,
    },
  };
}
