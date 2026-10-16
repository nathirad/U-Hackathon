"use client";

import { useEffect, useState } from "react";

// Live countdown to a scheduled unlock ("6h 31m 34s"), like Tokenomist's unlock table.
// Renders a stable placeholder on the server so hydration never mismatches.
export function Countdown({ to, className }: { to: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return <span className={className}>…</span>;
  const ms = Date.parse(to) - now;
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return <span className={className}>unlocked</span>;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className={`countdown ${d === 0 ? "countdown-soon" : ""} ${className ?? ""}`} aria-label={`in ${d} days ${h} hours ${m} minutes`}>
      {d > 0 ? `${d}d ` : ""}
      {pad(h)}h {pad(m)}m {pad(sec)}s
    </span>
  );
}
