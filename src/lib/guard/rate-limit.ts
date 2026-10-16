// Fixed-window, in-memory rate limiter. Fine for one Node process (localhost or a single
// server); use Redis/Upstash when running several instances.

interface Bucket {
  count: number;
  reset: number;
}

const g = globalThis as typeof globalThis & { __uguardRate?: Map<string, Bucket> };
const buckets = (g.__uguardRate ??= new Map());

export interface RateResult {
  ok: boolean;
  retryAfterSec: number;
  remaining: number;
}

export function rateLimit(key: string, max: number, windowMs: number): RateResult {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset <= now) {
    b = { count: 0, reset: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
  }
  return { ok: b.count <= max, retryAfterSec: Math.ceil((b.reset - now) / 1000), remaining: Math.max(0, max - b.count) };
}

export const LIMITS = {
  agent: { max: 20, windowMs: 60_000 },
  scan: { max: 6, windowMs: 60_000 },
  voice: { max: 20, windowMs: 60_000 },
  protect: { max: 20, windowMs: 60_000 },
  mcp: { max: 60, windowMs: 60_000 },
  auth: { max: 10, windowMs: 15 * 60_000 },
  feedback: { max: 30, windowMs: 60_000 },
  stt: { max: 10, windowMs: 60_000 }, // each call spends ElevenLabs credit
  alerts: { max: 30, windowMs: 60_000 },
  ubot: { max: 30, windowMs: 60_000 },
  screenshot: { max: 6, windowMs: 60_000 }, // each call can spend vision-model credit
} as const;
