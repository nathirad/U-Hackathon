// Freshness contract (AGENTIC-WORKFLOW.md §6): every number says when its source produced it,
// and data reused after a live source failed is marked stale instead of passing as fresh.
// No Node imports: the UI uses the same helpers to print "ณ 14:05".

/** Seconds each kind of data may be reused before it must be fetched again. */
export const TTL = {
  price: 60,
  tokenomist: 600,
  news: 900,
} as const;

/** "14:05" if the time is today in Bangkok, else "15 ต.ค. 07:00". Empty string for a missing date. */
export function asOfTh(iso: string | null | undefined, nowMs = Date.now()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const time = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
  if (day(d) === day(new Date(nowMs))) return time;
  return `${d.toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" })} ${time}`;
}

/** "ณ 15 ต.ค. 07:00", plus "(อาจไม่ล่าสุด)" when the data is a fallback copy. */
export function asOfLabelTh(iso: string | null | undefined, stale = false, nowMs = Date.now()): string {
  const t = asOfTh(iso, nowMs);
  if (!t) return stale ? "อาจไม่ล่าสุด" : "";
  return `ณ ${t}${stale ? " (อาจไม่ล่าสุด)" : ""}`;
}

/** English: "14:05" if the time is today in Bangkok, else "15 Oct 07:00". */
export function asOfEn(iso: string | null | undefined, nowMs = Date.now()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
  if (day(d) === day(new Date(nowMs))) return time;
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" })} ${time}`;
}

/** "as of 15 Oct 07:00", plus "(may be out of date)" when the data is a fallback copy. */
export function asOfLabel(iso: string | null | undefined, stale = false, nowMs = Date.now()): string {
  const t = asOfEn(iso, nowMs);
  if (!t) return stale ? "may be out of date" : "";
  return `as of ${t}${stale ? " (may be out of date)" : ""}`;
}
