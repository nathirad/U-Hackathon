// The watcher: U-Guard checks every user's alert rules on a timer, so alerts arrive without
// anyone pressing a button. In a long-running server (`next start`) it ticks in-process every
// WATCH_INTERVAL_MIN minutes (default 10; 0 turns it off). On serverless hosts, call
// POST /api/watch with Bearer CRON_SECRET from a cron instead.

import { runAlerts } from "./alerts";
import { now } from "./config";
import { logEvent } from "./log";
import { store } from "./store";

interface WatchState {
  timer?: ReturnType<typeof setInterval>;
  lastRun: string | null;
  lastChecked: number;
  lastFired: number;
  running: boolean;
}

const g = globalThis as typeof globalThis & { __uguardWatch?: WatchState };
const state: WatchState = (g.__uguardWatch ??= { lastRun: null, lastChecked: 0, lastFired: 0, running: false });

export function intervalMin(): number {
  const v = Number(process.env.WATCH_INTERVAL_MIN ?? 10);
  return Number.isFinite(v) && v >= 0 ? v : 10;
}

/** One pass over every user who has alert rules. */
export async function runWatch(trigger: "timer" | "cron" | "manual" = "timer"): Promise<{ users: number; checked: number; fired: number }> {
  if (state.running) return { users: 0, checked: 0, fired: 0 };
  state.running = true;
  try {
    const users = [...new Set(store.alerts.map((r) => r.ownerId))];
    let checked = 0;
    let fired = 0;
    for (const u of users) {
      const { outcomes, summary } = await runAlerts(u, now(), trigger);
      checked += outcomes.length;
      fired += summary.fired.length;
    }
    state.lastRun = new Date().toISOString();
    state.lastChecked = checked;
    state.lastFired = fired;
    if (checked) logEvent("watch.run", { users: users.length, checked, fired });
    return { users: users.length, checked, fired };
  } finally {
    state.running = false;
  }
}

export function startWatcher(): void {
  const min = intervalMin();
  if (!min || state.timer) return;
  state.timer = setInterval(() => void runWatch().catch((err) => logEvent("watch.error", { error: (err as Error).message })), min * 60_000);
  state.timer.unref?.();
  logEvent("watch.started", { intervalMin: min });
}

export function watchStatus() {
  const min = intervalMin();
  const next = state.lastRun && min ? new Date(new Date(state.lastRun).getTime() + min * 60_000).toISOString() : null;
  return { enabled: Boolean(min && state.timer), intervalMin: min, lastRun: state.lastRun, nextRun: next, lastChecked: state.lastChecked, lastFired: state.lastFired };
}
