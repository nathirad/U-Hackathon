import Link from "next/link";

/** Neon shield emblem for U-Guard */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/icon.png"
      width={size}
      height={size}
      alt="U-Guard"
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(6, Math.round(size * 0.22)),
        objectFit: "cover",
        display: "inline-block",
        verticalAlign: "middle",
        boxShadow: "0 0 12px rgba(45,212,191,0.3)",
      }}
    />
  );
}

/** U-Bot's face: the neon shield avatar */
export function BotFace({ size = 36 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/avatar.png"
      width={size}
      height={size}
      alt="U-Bot"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        display: "inline-block",
        boxShadow: "0 0 12px rgba(45,212,191,0.35)",
      }}
    />
  );
}

export function Logo({ href = "/", tag }: { href?: string; tag?: string }) {
  return (
    <Link href={href} className="logo" aria-label="U-Guard home">
      <LogoMark />
      <span>U-Guard</span>
      {tag ? <span className="tag">{tag}</span> : null}
    </Link>
  );
}

export function Avatar({ level, thinking }: { level?: string | null; thinking?: boolean }) {
  return (
    <span className="avatar" data-level={level ?? undefined} data-state={thinking ? "thinking" : undefined}>
      <BotFace />
    </span>
  );
}

