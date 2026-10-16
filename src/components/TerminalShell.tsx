"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { shortDate } from "@/lib/format";
import { Icon, type IconName } from "./Icon";
import { AccountMenu } from "./AccountMenu";
import { UBotInbox } from "./UBotInbox";
import { DataBadge } from "./DataBadge";

// One menu that follows an investor's day: what needs attention today, what is happening in the
// market, then my money (portfolio → plan → act → stay alerted). U-Bot is one tap away everywhere.
const NAV: { label: string; items: { href: string; icon: IconName; th: string }[] }[] = [
  {
    label: "Start",
    items: [
      { href: "/terminal", icon: "home", th: "Today" },
      { href: "/terminal/agent", icon: "spark", th: "Ask U-Bot" },
    ],
  },
  {
    label: "Markets",
    items: [
      { href: "/terminal/tokens", icon: "coins", th: "Token screener" },
      { href: "/terminal/unlocks", icon: "calendar", th: "Unlock calendar" },
      { href: "/terminal/news", icon: "news", th: "News" },
    ],
  },
  {
    label: "My money",
    items: [
      { href: "/terminal/portfolio", icon: "wallet", th: "Portfolio" },
      { href: "/terminal/plan", icon: "list", th: "My plan" },
      { href: "/terminal/trade", icon: "swap", th: "Trade" },
      { href: "/terminal/invest", icon: "target", th: "Invest" },
      { href: "/terminal/alerts", icon: "bell", th: "Alerts" },
    ],
  },
  {
    label: "Help",
    items: [{ href: "/method", icon: "book", th: "How U-Guard works" }],
  },
];

// Where the unlock data on these pages comes from, per token (from /api/ticker), so the header
// never says "sample" for real data or the other way round.
function useDataLabel(): { text: string; sample: boolean } {
  const [label, setLabel] = useState({ text: "Tokenomist data", sample: false });
  useEffect(() => {
    fetch("/api/ticker")
      .then((r) => r.json())
      .then((b: { items?: { symbol: string; source: string; asOf?: string }[] }) => {
        const items = b.items ?? [];
        const by = (mode: string) => [...new Set(items.filter((i) => i.source === mode).map((i) => i.symbol))];
        const live = by("live");
        const snap = by("snapshot");
        const sample = by("sample");
        const asOf = items.find((i) => i.source === "snapshot")?.asOf;
        const parts = [
          live.length ? `${live.join(", ")} live` : "",
          snap.length ? `${snap.join(", ")} real data${asOf ? ` ${shortDate(asOf)}` : ""}` : "",
          sample.length ? `${sample.join(", ")} sample` : "",
        ].filter(Boolean);
        if (parts.length) setLabel({ text: parts.join(" · "), sample: sample.length > 0 });
      })
      .catch(() => undefined);
  }, []);
  return label;
}

const KNOWN = ["ARB", "WLD", "AVAX", "SOL", "SUI", "ENA", "ONDO", "LINK", "UNI", "NEAR", "TAO", "WLFI", "PUMP", "LIT", "DOT", "AAVE", "ADA", "OKB", "BGB", "MNT"];

// App frame for /terminal/*: collapsible sidebar (⌘B) and a search box (⌘K) that opens a
// token page for a ticker or sends anything else to the AI Agent.
export function TerminalShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const dataLabel = useDataLabel();

  // On phones the nav is one swipeable row; keep the current page's link in view.
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
    const n = nav.getBoundingClientRect();
    const a = active.getBoundingClientRect();
    nav.scrollLeft += a.left - n.left - (n.width - a.width) / 2;
  }, [path]);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("ug-sidebar") === "collapsed");
    } catch {
      // storage blocked: keep the default
    }
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key.toLowerCase() === "b") {
        e.preventDefault();
        setCollapsed((c) => {
          try {
            localStorage.setItem("ug-sidebar", c ? "open" : "collapsed");
          } catch {
            // ignore
          }
          return !c;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    const ticker = q.replace(/^\$/, "").toUpperCase();
    setQuery("");
    if (KNOWN.includes(ticker)) router.push(`/terminal/tokens/${ticker}`);
    else router.push(`/terminal/agent?q=${encodeURIComponent(q)}`);
  }

  const isActive = (href: string) => (href === "/terminal" ? path === href : path.startsWith(href));

  return (
    <div className={`term ${collapsed ? "term-collapsed" : ""}`}>
      <aside className="term-side" aria-label="Menu">
        <Link href="/" className="term-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/icon.png"
            width={32}
            height={32}
            alt="U-Guard"
            style={{ borderRadius: 8, objectFit: "cover", boxShadow: "0 0 12px rgba(45,212,191,0.25)" }}
          />
          <span>
            U-Guard <small>Terminal</small>
          </span>
        </Link>
        <nav ref={navRef}>
          {NAV.map((g) => (
            <div key={g.label} className="term-group">
              <p className="term-group-label">{g.label}</p>
              {g.items.map((it) => (
                <Link key={it.href} href={it.href} className="term-link" aria-current={isActive(it.href) ? "page" : undefined} title={it.th}>
                  <Icon name={it.icon} />
                  <span>{it.th}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <button
          className="term-link term-collapse"
          onClick={() => setCollapsed((c) => !c)}
          title="Collapse/expand menu (⌘B)"
          aria-label="Collapse or expand the menu"
        >
          <Icon name="collapse" />
          <span>Collapse</span>
          <kbd>⌘B</kbd>
        </button>
      </aside>

      <div className="term-main">
        <header className="term-top">
          <form className="term-search" onSubmit={submit} role="search">
            <Icon name="search" size={16} />
            <label htmlFor="term-q" className="sr-only">
              Search a token or ask U-Guard
            </label>
            <input
              id="term-q"
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a token (ARB) or ask U-Guard…"
              autoComplete="off"
            />
            <kbd>⌘K</kbd>
          </form>
          <div className="term-data-status" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <DataBadge
              status={dataLabel.sample ? "DEMO" : "CACHED"}
              tooltip="Tokenomist supply data: verified offline snapshot for U-Hackathon 2026 demo"
              showTime={false}
            />
            <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }} className="term-data-label">
              {dataLabel.text}
            </span>
          </div>
          <UBotInbox />
          <Link href="/terminal/agent" className="btn btn-sm">
            Ask U-Bot
          </Link>
          <AccountMenu />
        </header>
        <main className="term-content">{children}</main>
      </div>
    </div>
  );
}
