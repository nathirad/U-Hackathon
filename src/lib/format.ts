// Formatting helpers shared by the server (agent replies) and the client (UI).

import { asOfLabel, asOfLabelTh } from "./freshness";

export function compact(n: number, digits = 1): string {
  const abs = Math.abs(n);
  const fixed = (v: number) => {
    const s = v.toFixed(digits);
    return digits > 0 ? s.replace(/\.?0+$/, "") : s;
  };
  if (abs >= 1e12) return `${fixed(n / 1e12)}T`;
  if (abs >= 1e9) return `${fixed(n / 1e9)}B`;
  if (abs >= 1e6) return `${fixed(n / 1e6)}M`;
  if (abs >= 1e3) return `${fixed(n / 1e3)}K`;
  if (n === 0) return "0";
  return abs < 10 ? fixed(n).replace(/^-?0$/, "0") : n.toFixed(0);
}

export function usd(n: number, digits = 1): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${compact(Math.abs(n), digits)}`;
}

export function usdFull(n: number): string {
  const maximumFractionDigits = Math.abs(n) < 1 ? 4 : Math.abs(n) < 100 ? 2 : 0;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits })}`;
}

export function thb(n: number): string {
  return `฿${Math.round(n).toLocaleString("en-US")}`;
}

export function pct(n: number, digits = 2): string {
  return `${n.toFixed(digits)}%`;
}

export function signedPct(n: number, digits = 1): string {
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

/** "Oct 16" (UTC), so a server in any timezone renders the same date. */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Oct 16, 2026" */
export function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Whole days from `fromMs` to the date (UTC day boundaries); negative when it has passed. */
export function daysBetween(fromMs: number, iso: string): number {
  const dayMs = 86_400_000;
  const fromDay = Math.floor(fromMs / dayMs);
  const toDay = Math.floor(new Date(iso).getTime() / dayMs);
  return toDay - fromDay;
}

export function relativeDays(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

export const LEVEL_LABEL: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No unlock",
};

/** "in ~31 hours" inside two days (the demo runs hours before ARB's unlock), else "in 9 days"; past dates read "~3 hours ago". */
export function untilLabel(iso: string, nowMs = Date.now()): string {
  const hours = (new Date(iso).getTime() - nowMs) / 3_600_000;
  if (hours <= -48) return `${Math.round(-hours / 24)} days ago`;
  if (hours < 0) return `~${Math.max(1, Math.round(-hours))} hours ago`;
  if (hours < 48) return `in ~${Math.max(1, Math.round(hours))} hours`;
  return `in ${Math.round(hours / 24)} days`;
}

/** When a card's unlock happens: a continuous (daily) release has no single date. */
export function unlockWhen(card: { timing?: string; unlockDate: string | null }, nowMs = Date.now()): string {
  if (card.timing === "continuous") return "releasing daily";
  return card.unlockDate ? untilLabel(card.unlockDate, nowMs) : "";
}

/** Data-source label: live data, a dated snapshot of real data, or illustrative sample data. */
export function sourceLabel(mode: string): string {
  return mode === "live" ? "Live data" : mode === "snapshot" ? "Real data (snapshot)" : "Sample data";
}

/** Label plus time for one data section: "Real data (snapshot) · as of 15 Oct 07:00", "Live data · as of 14:05", "Sample data". */
export function sourceTag(src: { mode: string; asOf?: string; stale?: boolean } | null | undefined): string {
  if (!src) return "";
  const when = src.mode !== "sample" ? asOfLabel(src.asOf, src.stale) : "";
  return when ? `${sourceLabel(src.mode)} · ${when}` : sourceLabel(src.mode);
}

// Thai copy for Thai replies (the agent answers in the user's language).

/** "24 ต.ค.": day and month only, so the Buddhist-era year never confuses anyone. */
export function thaiDate(iso: string): string {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** "อีก ~31 ชั่วโมง" inside two days, else "อีก 9 วัน"; past dates read "ปลดล็อกแล้วเมื่อ ~3 ชั่วโมงก่อน". */
export function untilText(iso: string, nowMs = Date.now()): string {
  const hours = (new Date(iso).getTime() - nowMs) / 3_600_000;
  if (hours <= -48) return `ปลดล็อกแล้วเมื่อ ${Math.round(-hours / 24)} วันก่อน`;
  if (hours < 0) return `ปลดล็อกแล้วเมื่อ ~${Math.max(1, Math.round(-hours))} ชั่วโมงก่อน`;
  if (hours < 48) return `อีก ~${Math.max(1, Math.round(hours))} ชั่วโมง`;
  return `อีก ${Math.round(hours / 24)} วัน`;
}

export const LEVEL_TH: Record<string, string> = {
  high: "เสี่ยงสูง",
  medium: "เสี่ยงปานกลาง",
  low: "เสี่ยงต่ำ",
  none: "ไม่มี unlock ใกล้นี้",
};

/** When a card's unlock happens, in Thai: a continuous (daily) release has no single date. */
export function unlockWhenTh(card: { timing?: string; unlockDate: string | null }, nowMs = Date.now()): string {
  if (card.timing === "continuous") return "ทยอยปลดล็อกทุกวัน";
  return card.unlockDate ? untilText(card.unlockDate, nowMs) : "";
}

/** Data-source label in Thai: live data, a dated snapshot of real data, or illustrative sample data. */
export function sourceLabelTh(mode: string): string {
  return mode === "live" ? "ข้อมูลสด" : mode === "snapshot" ? "ข้อมูลจริง (snapshot)" : "ข้อมูลตัวอย่าง";
}

/** Label plus date for one data section: "ข้อมูลจริง (snapshot) · 15 ต.ค.", "ข้อมูลสด", "ข้อมูลตัวอย่าง". */
export function sourceTagTh(src: { mode: string; asOf?: string; stale?: boolean } | null | undefined): string {
  if (!src) return "";
  const when = src.mode !== "sample" ? asOfLabelTh(src.asOf, src.stale) : "";
  return when ? `${sourceLabelTh(src.mode)} · ${when}` : sourceLabelTh(src.mode);
}

/** Which engine answered: Claude, another LLM (by model name) or the offline rules engine. */
export function engineLabel(r: { provider?: string; model?: string | null } | null | undefined): string {
  if (!r) return "";
  if (r.provider === "anthropic") return "Claude";
  if (r.provider === "openai") return r.model || "LLM";
  return "Offline agent";
}
