import type { RiskLevel } from "@/lib/types";

const RING: Record<RiskLevel | "idle", string> = {
  idle: "#2DD4BF",
  low: "#2DD4BF",
  none: "#94A3B8",
  medium: "#FBBF24",
  high: "#FB7151",
};

/** U-Guard glowing neon shield avatar. The ring/glow shows the risk level of the answer; pulsating while thinking. */
export function Avatar({ level = "idle", thinking = false, size = 32 }: { level?: RiskLevel | "idle"; thinking?: boolean; size?: number }) {
  const color = thinking ? "#5EEAD4" : RING[level];
  return (
    <div
      className={`avatar ${thinking ? "ring-think" : ""}`}
      style={{
        width: size,
        height: size,
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: Math.max(8, Math.round(size * 0.25)),
        border: `2px solid ${color}`,
        boxShadow: `0 0 ${Math.round(size * 0.3)}px ${color}88`,
        overflow: "hidden",
        background: "#070b14",
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/icon.png"
        width={size}
        height={size}
        alt="U-Guard"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />
    </div>
  );
}

/** Highest risk level among the cards of one answer, for the avatar ring. */
export function topLevel(levels: RiskLevel[]): RiskLevel | "idle" {
  for (const l of ["high", "medium", "low", "none"] as const) if (levels.includes(l)) return l;
  return "idle";
}
