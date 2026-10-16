"use client";

import { useEffect, useState } from "react";

/**
 * First-visit splash (once per browser session, max ~1.2 s): the U-Guard logo fades in
 * while "scanning" the calendar, and the count is real data. Skipped entirely for
 * reduced motion, and hidden before paint on repeat visits (see the inline script in
 * the root layout).
 */
export function Loader({ events }: { events: number }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setDone(true);
      try {
        sessionStorage.setItem("ug_seen", "1");
      } catch {
        // ignore
      }
    }, 1200);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="loader" data-done={done ? "1" : undefined} aria-hidden="true">
      <div className="loader-inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="loader-logo" src="/brand/icon.png" width={84} height={84} alt="" />
        <div className="status">Scanning the unlock calendar…</div>
        <div className="count">{events} scheduled events in the next 45 days</div>
      </div>
    </div>
  );
}
