"use client";

import Link from "next/link";
import { BRANDS, BrandLogo } from "./logos";
import { useEffect, useState } from "react";
import { CountUp, Reveal, Spotlight } from "./fx";
import { GuardMark } from "./GuardMark";
import { GuardWatch } from "./GuardWatch";

const SECTIONS = [
  { id: "home", th: "Home" },
  { id: "problem", th: "Problem" },
  { id: "features", th: "Features" },
  { id: "demo", th: "Demo" },
  { id: "method", th: "How it works" },
  { id: "faq", th: "FAQ" },
];

const ROTATING = ["your money moves", "the unlock lands", "the market sells"];


const FEATURES = [
  { n: "01", title: "Check before you buy", desc: "Type \"Buy 5,000 THB of ARB\" and the agent pulls the unlock schedule, recipients and funding rounds, then scores the risk in code before any money moves", href: "/terminal/agent" },
  { n: "02", title: "Three plain lines + voice", desc: "A short summary a beginner can follow. Ask by voice and hear the answer with ElevenLabs, in English or Thai, and save it as a PDF", href: "/terminal/agent" },
  { n: "03", title: "You approve", desc: "U-Guard only proposes protection. When you approve, the rule is recorded on Avalanche so anyone can verify it", href: "/terminal/trade" },
  { n: "04", title: "Terminal + Forecast", desc: "Screener, unlock calendar, 6-month supply forecast, portfolio and alerts in one place", href: "/terminal" },
];

const DEMOS = [
  { tag: "Terminal", badge: "New", title: "U-Guard Terminal", desc: "Overview, ask the AI, a 25-token screener and the unlock calendar", tags: ["Screener", "Unlocks", "⌘K"], href: "/terminal" },
  { tag: "Trade", badge: "U-Bot", title: "Trade with an AI-drafted plan", desc: "You pick the token and budget; U-Bot drafts a plan, checks the risk, and you approve", tags: ["Plan", "Approval", "Paper trade"], href: "/terminal/trade" },
  { tag: "Token", badge: "Forecast", title: "Supply Mode: ARB", desc: "92.65M ARB unlocks every month until Mar 2027, charted by recipient", tags: ["Allocation", "Fundraising"], href: "/terminal/tokens/ARB" },
  { tag: "Portfolio", badge: "Dilution", title: "My portfolio", desc: "Value at risk, concentration, and how much your share gets diluted over 6 months", tags: ["Risk", "PDF"], href: "/terminal/portfolio" },
  { tag: "Alerts", badge: "U-Bot", title: "Smart alerts", desc: "Set rules for when to be alerted, and see your approval history", tags: ["Rules", "Decisions"], href: "/terminal/alerts" },
  { tag: "Calendar", badge: "30 days", title: "Unlock calendar", desc: "Upcoming unlocks with scores, plus market events with a source on every row", tags: ["Keyrock", "Tokenomist"], href: "/terminal/unlocks" },
];

const STEPS = [
  { k: "Perceive", th: "Listen", d: "A chat question, voice, or a portfolio scan" },
  { k: "Plan", th: "Plan", d: "The agent chooses which tools it needs" },
  { k: "Act", th: "Fetch", d: "Tokenomist, prices, portfolio" },
  { k: "Score", th: "Score", d: "Code computes the score; the AI doesn't guess" },
  { k: "Explain", th: "Explain", d: "Three plain lines + voice + PDF" },
  { k: "Approve", th: "Approve", d: "Recorded on Avalanche" },
];

const FAQ = [
  { q: "Does U-Guard tell me to buy or sell?", a: "No. U-Guard gives decision support only. Advising on digital assets in Thailand needs a licence from the SEC, and every action waits for your approval." },
  { q: "Where does the data come from?", a: "Unlock schedules, allocations and funding from Tokenomist; prices and volume from CoinGecko. Every card shows its source and says whether it is live, a dated snapshot, or sample data." },
  { q: "Why not alert on every unlock?", a: "Not every unlock pushes the price down. Research found team unlocks hit hardest while ecosystem-fund unlocks often don't, so U-Guard scores size, liquidity and who receives the tokens." },
  { q: "How does it work with U-Bot?", a: "U-Guard is a skill that U-Bot, U-topia's orchestrator, calls before a transaction, over MCP or a webhook. Its alerts and proposals come back through U-Bot for you to approve." },
  { q: "Why record it on Avalanche?", a: "So your approval can be verified and never edited afterwards. The demo uses the Fuji testnet only: no real money." },
];

// Platform page: loader → story → proof → enter the terminal.
export function Landing() {
  const [active, setActive] = useState("home");
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const [word, setWord] = useState(0);
  const [open, setOpen] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);
  const [found, setFound] = useState<number | null>(null);

  // Loader: first visit of the session only, closes when real data arrives.
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("ug-loaded") === "1";
      sessionStorage.setItem("ug-loaded", "1");
    } catch {
      seen = true;
    }
    if (seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setLoading(true);
    // Stay up long enough for the mark to finish drawing itself (~1.4s), never past 1.8s.
    const t0 = performance.now();
    const done = setTimeout(() => setLoading(false), 1800);
    fetch("/api/ticker")
      .then((r) => r.json())
      .then((b) => {
        setFound(b.items?.length ?? 0);
        setTimeout(() => setLoading(false), Math.max(400, 1500 - (performance.now() - t0)));
      })
      .catch(() => setLoading(false));
    return () => clearTimeout(done);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setWord((w) => (w + 1) % ROTATING.length), 2600);
    const onScroll = () => {
      setScrolled(window.scrollY > 30);
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(h > 0 ? window.scrollY / h : 0);
    };
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-45% 0px -50% 0px" },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      clearInterval(t);
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div className="lp">
      {loading && (
        <div className="lp-loader" role="status" aria-live="polite">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/icon.png"
            width={76}
            height={76}
            alt="U-Guard"
            style={{ borderRadius: 18, marginBottom: 12, boxShadow: "0 0 32px rgba(45,212,191,0.5)" }}
          />
          <p>Scanning the unlock calendar…</p>
          <small>{found === null ? "Connecting to Tokenomist" : `Found ${found} unlocks in the next 30 days`}</small>
        </div>
      )}

      <header className={`lp-nav ${scrolled ? "lp-nav-scrolled" : ""}`}>
        <a href="#home" className="lp-logo" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/icon.png"
            width={32}
            height={32}
            alt="U-Guard"
            style={{ borderRadius: 8, objectFit: "cover", boxShadow: "0 0 12px rgba(45,212,191,0.3)" }}
          />
          <span>U-GUARD</span>
        </a>
        <nav className="lp-pills" aria-label="Page sections">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} aria-current={active === s.id ? "true" : undefined}>
              {s.th}
            </a>
          ))}
        </nav>
        <Link href="/method" className="lp-lang" title="How the score is computed, the data and the agent">
          Method
        </Link>
        <Link href="/terminal" className="lp-cta">
          Open the app →
        </Link>
      </header>

      <section id="home" className="lp-hero">
        <div className="lp-dots" aria-hidden="true" />
        <div className="lp-hero-copy">
          <span className="lp-chip">
            <i /> Agentic AI in U-Bot · U-Hackathon 2026
          </span>
          <h1>
            Know before
            <br />
            {/* The wrapper animates; the inner span carries the gradient text. Animating a
                background-clip:text element directly can leave it unpainted in Chromium. */}
            <span key={word} className="lp-rotate">
              <span className="lp-grad">{ROTATING[word]}</span>
            </span>
          </h1>
          <p className="lp-quote">&ldquo;Retail no longer finds out last.&rdquo;</p>
          <p className="lp-lead">
            U-Guard checks a token&apos;s <b>unlock schedule</b> before you buy or hold it, explains it in <b>three plain lines</b> with voice, and <b>you approve</b> every action
          </p>
          <div className="lp-buttons">
            <Link href="/terminal" className="lp-btn lp-btn-primary">
              Open the app →
            </Link>
            <Link href="/terminal/agent" className="lp-btn">
              Talk to U-Bot
            </Link>
          </div>
          <div className="lp-tags">
            {["Supply risk", "Thai voice", "Human approval", "On-chain receipt"].map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </div>
        <div className="lp-visual">
          <GuardWatch />
        </div>
      </section>

      <div className="lp-marquee" aria-label="Data and technology we use">
        <p>Data and technology we use</p>
        <div className="lp-marquee-track lp-logos">
          {[...BRANDS, ...BRANDS, ...BRANDS].map((b, i) => (
            <div key={i} className="lp-logo-tile" aria-hidden={i >= BRANDS.length}>
              <BrandLogo brand={b} scale={1.45} />
            </div>
          ))}
        </div>
      </div>

      <section id="problem" className="lp-section">
        <Reveal className="lp-head">
          <span className="lp-chip">
            <i /> THE PROBLEM
          </span>
          <h2 className="lp-grad">Retail finds out last</h2>
          <p>Tokens unlock on schedules published in advance. The data exists, but it never shows up at the moment you tap buy.</p>
        </Reveal>
        <div className="lp-stats">
          {[
            { v: 97.4, f: (n: number) => `$${n.toFixed(1)}B`, l: "unlocked in 2025", s: "Tokenomist" },
            { v: 90, f: (n: number) => `${Math.round(n)}%`, l: "of unlocks push the price down", s: "Keyrock, 16,000+ events" },
            { v: 30, f: (n: number) => `~${Math.round(n)} days`, l: "before an unlock, prices start to slide", s: "Keyrock" },
            { v: 92.6, f: (n: number) => `${n.toFixed(1)}M`, l: "ARB unlocking Oct 16", s: "Tokenomist" },
          ].map((st, i) => (
            <Reveal key={st.l} delay={i * 80}>
              <Spotlight className="lp-stat">
                <b className="lp-grad">
                  <CountUp value={st.v} format={st.f} />
                </b>
                <span>{st.l}</span>
                <small>{st.s}</small>
              </Spotlight>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <div className="lp-mission">
            <h3>MISSION</h3>
            <p>
              We are building the <b>safety layer for agentic banking</b>: it works <b>before money moves</b>. It doesn&apos;t predict prices; it forecasts <b>supply</b>, the one market variable that is known in advance.
              For anyone 20 and up, <b>from first-time buyers to pros</b>.
            </p>
            <a href="#features">See what it does →</a>
          </div>
        </Reveal>
      </section>

      <section id="features" className="lp-section">
        <Reveal className="lp-head">
          <span className="lp-chip">
            <i /> WHAT IT DOES
          </span>
          <h2 className="lp-grad">Features</h2>
          <p>From one question to an approval anyone can verify</p>
        </Reveal>
        <div className="lp-features">
          {FEATURES.map((f, i) => (
            <Reveal key={f.n} delay={i * 80}>
              <Spotlight className="lp-feature">
                <span className="lp-num">{f.n}</span>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
                <Link href={f.href}>Try it in the demo →</Link>
              </Spotlight>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="demo" className="lp-section">
        <Reveal className="lp-head">
          <span className="lp-chip">
            <i /> LIVE DEMO
          </span>
          <h2 className="lp-grad">Try it live</h2>
          <p>Every card opens a working page of this demo</p>
        </Reveal>
        <div className="lp-demos">
          {DEMOS.map((d, i) => (
            <Reveal key={d.title} delay={(i % 3) * 80}>
              <Link href={d.href} className="lp-demo-link">
                <Spotlight className="lp-demo">
                  <div className="lp-demo-top">
                    <span>{d.tag}</span>
                    <em>{d.badge}</em>
                  </div>
                  <h3>{d.title}</h3>
                  <p>{d.desc}</p>
                  <div className="lp-demo-tags">
                    {d.tags.map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                </Spotlight>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="method" className="lp-section">
        <Reveal className="lp-head">
          <span className="lp-chip">
            <i /> HOW IT WORKS
          </span>
          <h2 className="lp-grad">How the agent works</h2>
          <p>Every number comes from a tool or code · the AI plans and explains · you decide</p>
        </Reveal>
        <div className="lp-steps">
          {STEPS.map((s, i) => (
            <Reveal key={s.k} delay={i * 70}>
              <div className="lp-step">
                <span className="lp-num">{String(i + 1).padStart(2, "0")}</span>
                <b>{s.th}</b>
                <small>{s.k}</small>
                <p>{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <div className="lp-score">
            <div>
              <h3>Risk score</h3>
              <p>time × (0.35 size + 0.30 liquidity + 0.35 recipient) + investor-profit bonus</p>
            </div>
            <ul>
              <li><i style={{ background: "var(--coral)" }} /> Team: hits the price hardest (−25% on average)</li>
              <li><i style={{ background: "var(--amber)" }} /> Investors: often hedge or sell OTC</li>
              <li><i style={{ background: "var(--teal)" }} /> Ecosystem funds: usually no price pressure</li>
            </ul>
          </div>
        </Reveal>
      </section>

      <section id="faq" className="lp-section">
        <Reveal className="lp-head">
          <span className="lp-chip">
            <i /> FAQ
          </span>
          <h2 className="lp-grad">FAQ</h2>
        </Reveal>
        <div className="lp-faq">
          {FAQ.map((f, i) => (
            <div key={f.q} className={`lp-faq-item ${open === i ? "lp-faq-open" : ""}`}>
              <button aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                {f.q}
                <span aria-hidden="true">{open === i ? "−" : "+"}</span>
              </button>
              <div className="lp-faq-body">
                <p>{f.a}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section lp-final">
        <Reveal className="lp-head">
          <h2>
            Ready to <span className="lp-grad">know before</span>?
          </h2>
          <p>Open the Terminal and ask about your first token</p>
          <div className="lp-buttons" style={{ justifyContent: "center" }}>
            <Link href="/terminal" className="lp-btn lp-btn-primary">
              Open the app →
            </Link>
            <Link href="/terminal/agent" className="lp-btn">
              Talk to U-Bot
            </Link>
          </div>
        </Reveal>
        <footer className="lp-footer">
          U-Guard · U-Hackathon 2026 · Decision support, not investment advice ·{" "}
          <Link href="/method" style={{ color: "var(--teal-2)" }}>
            Method &amp; data
          </Link>
        </footer>
      </section>

      <a href="#home" className={`lp-top ${scrolled ? "lp-top-show" : ""}`} aria-label="Back to top" style={{ "--p": progress } as React.CSSProperties}>
        ↑
      </a>
    </div>
  );
}
