import Link from "next/link";

export function TopBar({ current, children }: { current: "home" | "app" | "terminal" | "logs"; children?: React.ReactNode }) {
  const link = (href: string, key: typeof current, label: string) => (
    <Link href={href} aria-current={current === key ? "page" : undefined}>
      {label}
    </Link>
  );
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/icon.png"
          width={28}
          height={28}
          alt="U-Guard"
          style={{ borderRadius: 7, objectFit: "cover", boxShadow: "0 0 10px rgba(45,212,191,0.25)" }}
        />
        U-Guard <small>in U-Bot</small>
      </Link>
      {children && <div className="badges">{children}</div>}
      <nav className="navlinks" aria-label="Main">
        {link("/", "home", "Home")}
        {link("/app", "app", "App")}
        {link("/terminal", "terminal", "Terminal")}
      </nav>
    </header>
  );
}
