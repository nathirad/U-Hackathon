"use client";

import { useId } from "react";
import type { RiskLevel } from "@/lib/types";

// The U-Guard mark with its motion language (spec in UI-REVIEW.md, "Logo motion"), drawn with
// the team's logo (public/brand/icon.png, the neon shield):
//   fade-in  the logo fades in inside its frame
//   look     the logo shifts toward whatever U-Guard is checking
//   react    the ring takes the risk colour, a ripple goes out, and on a high
//            risk the shield lifts once ("shield up")
// All motion is CSS (gm-*), so prefers-reduced-motion turns it off in one place.

const LEVEL_COLOR: Record<RiskLevel | "idle", string> = {
  idle: "#2DD4BF",
  none: "#94A3B8",
  low: "#2DD4BF",
  medium: "#FBBF24",
  high: "#FB7151",
};

export function GuardMark({
  level = "idle",
  look = { x: 0, y: 0 },
  react = 0,
  size = 120,
}: {
  level?: RiskLevel | "idle";
  /** face offset in viewBox units, clamped to ±4 */
  look?: { x: number; y: number };
  /** bump this to replay the reaction (ripple, plus "shield up" on high risk) */
  react?: number;
  size?: number;
}) {
  const frame = `gm-frame-${useId().replace(/:/g, "")}`;
  const clamp = (n: number) => Math.max(-4, Math.min(4, n));
  const bump = react > 0 && level === "high" ? (react % 2 ? "gm-up-a" : "gm-up-b") : "";
  return (
    <svg
      className="gm"
      width={size}
      height={size}
      viewBox="0 0 128 128"
      aria-hidden="true"
      style={{ "--gm-color": LEVEL_COLOR[level] } as React.CSSProperties}
    >
      <defs>
        <clipPath id={frame}>
          <rect x="4" y="4" width="120" height="120" rx="32" />
        </clipPath>
      </defs>
      <rect className="gm-bg" x="4" y="4" width="120" height="120" rx="32" />
      {react > 0 && <rect key={react} className="gm-ripple" x="4" y="4" width="120" height="120" rx="32" />}
      <g clipPath={`url(#${frame})`}>
        <g className={`gm-body ${bump}`}>
          <g className="gm-face" style={{ transform: `translate(${clamp(look.x)}px, ${clamp(look.y)}px)` }}>
            <image className="gm-logo" href="/brand/icon.png" x="0" y="0" width="128" height="128" preserveAspectRatio="xMidYMid slice" />
          </g>
        </g>
      </g>
      <rect className="gm-ring" x="4" y="4" width="120" height="120" rx="32" />
    </svg>
  );
}
