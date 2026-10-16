// Unlock schedule of the coins the user holds: every scheduled cliff and continuous release in
// the next months, straight from the Tokenomist API (live with the key, the dated snapshot
// otherwise), with size, value, recipients and how much of it touches the user's holding.

import { getQuote } from "./market";
import { getHoldings } from "./portfolio";
import { classifyRecipient } from "./recipient";
import { findToken, getUnlockEvents } from "./tokenomist";
import type { DataSource, RecipientClass } from "./types";

const STABLES = new Set(["USDC", "USDT", "DAI"]);
const DAY = 86_400_000;
const API_LAST_DAY = "2027-06-30"; // the API rejects windows past its dataset

export interface ScheduleRow {
  date: string; // YYYY-MM-DD (start for continuous releases)
  endDate: string | null; // continuous releases only
  symbol: string;
  name: string;
  kind: "cliff" | "linear";
  amount: number;
  valueUsd: number | null;
  pctCirc: number | null;
  recipients: { class: RecipientClass; name: string; share: number }[];
  holdingValueThb: number;
}

export interface HoldingsSchedule {
  months: number;
  rows: ScheduleRow[];
  covered: string[]; // holdings with a Tokenomist schedule
  noSchedule: string[]; // holdings without vesting data (stablecoins, BTC/ETH-style)
  source: DataSource;
  asOf: string;
}

export async function holdingsSchedule(userId: string, now: number, months = 6): Promise<HoldingsSchedule> {
  const start = new Date(now).toISOString().slice(0, 10);
  const endIso = new Date(now + months * 30 * DAY).toISOString().slice(0, 10);
  const end = endIso > API_LAST_DAY ? API_LAST_DAY : endIso;
  const holdings = (await getHoldings(userId)).filter((h) => h.amount > 0);
  const rows: ScheduleRow[] = [];
  const covered: string[] = [];
  const noSchedule: string[] = holdings.filter((h) => STABLES.has(h.symbol)).map((h) => h.symbol);
  let source: DataSource = "sample";
  let asOf = new Date(now).toISOString();

  await Promise.all(
    holdings
      .filter((h) => !STABLES.has(h.symbol))
      .map(async (h) => {
        const { token } = await findToken(h.symbol);
        if (!token) {
          noSchedule.push(h.symbol);
          return;
        }
        const [events, quote] = await Promise.all([getUnlockEvents(token.id, start, end), getQuote(h.symbol)]);
        const price = quote?.priceUsd ?? (token.circulatingSupply > 0 ? token.marketCap / token.circulatingSupply : null);
        if (events.source === "live" || (events.source === "snapshot" && source === "sample")) {
          source = events.source;
          asOf = events.asOf;
        }
        const mine = (events.data ?? []).filter((e) => (e.cliffUnlocks?.cliffAmount ?? 0) > 0 || (e.linearUnlocks?.linearAmount ?? e.linearUnlocks?.amount ?? 0) > 0);
        if (mine.length === 0) {
          noSchedule.push(h.symbol);
          return;
        }
        covered.push(h.symbol);
        for (const e of mine) {
          const cliff = e.cliffUnlocks?.cliffAmount ?? 0;
          const amount = cliff > 0 ? cliff : (e.linearUnlocks?.linearAmount ?? e.linearUnlocks?.amount ?? 0);
          const parts: { name: string; std: string; amount: number }[] =
            cliff > 0
              ? (e.cliffUnlocks?.allocationBreakdown ?? []).map((a) => ({ name: a.allocationName, std: a.standardAllocationName, amount: a.cliffAmount }))
              : (e.linearUnlocks?.allocationBreakdown ?? []).map((a) => ({
                  name: a.allocationName,
                  std: a.standardAllocationName,
                  amount: (a as { linearAmount?: number; amount?: number }).linearAmount ?? (a as { amount?: number }).amount ?? 0,
                }));
          const merged = new Map<string, { class: RecipientClass; name: string; amount: number }>();
          for (const p of parts) {
            const prev = merged.get(p.name);
            merged.set(p.name, { class: classifyRecipient(p.name, p.std), name: p.name, amount: (prev?.amount ?? 0) + p.amount });
          }
          const total = [...merged.values()].reduce((s, p) => s + p.amount, 0) || amount || 1;
          rows.push({
            date: e.unlockDate.slice(0, 10),
            endDate: cliff > 0 ? null : (e.endDate ?? null)?.slice(0, 10) ?? null,
            symbol: h.symbol,
            name: token.name,
            kind: cliff > 0 ? "cliff" : "linear",
            amount,
            valueUsd: price !== null ? amount * price : null,
            pctCirc: token.circulatingSupply > 0 ? (amount / token.circulatingSupply) * 100 : null,
            recipients: [...merged.values()]
              .sort((a, b) => b.amount - a.amount)
              .slice(0, 3)
              .map((p) => ({ class: p.class, name: p.name, share: p.amount / total })),
            holdingValueThb: h.valueThb,
          });
        }
      }),
  );

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));
  return { months, rows, covered: covered.sort(), noSchedule: [...new Set(noSchedule)].sort(), source, asOf };
}
