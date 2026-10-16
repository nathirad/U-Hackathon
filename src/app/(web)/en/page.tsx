import Link from "next/link";
import { BRANDS, BrandLogo } from "@/components/logos";
import { RiskCardView } from "@/components/chat/RiskCardView";
import { Icon, type IconName } from "@/components/Icon";
import { Loader } from "@/components/site/Loader";
import { SiteFooter, SiteNav } from "@/components/site/SiteChrome";
import { UnlockRadar } from "@/components/site/UnlockRadar";
import { getSession } from "@/lib/auth/session";
import { now } from "@/lib/config";
import { getEventCalendar } from "@/lib/intel/calendar";
import { assessUnlockRisk } from "@/lib/risk";

export const dynamic = "force-dynamic";

const SIGNALS: { icon: IconName; title: string; body: string; source: string }[] = [
  {
    icon: "unlock",
    title: "Supply",
    body: "Scheduled unlocks and emissions: who receives how much, and when. Scored 0-100 by code from size, liquidity, recipient and timing.",
    source: "Tokenomist",
  },
  {
    icon: "news",
    title: "News & events",
    body: "What is moving a token or the whole market (ETF flows, the Fed, regulation), with every source one tap away.",
    source: "GDELT · dated snapshot offline",
  },
  {
    icon: "odds",
    title: "Market odds",
    body: "What traders are pricing for events like the next Fed decision. Always attributed, never presented as our forecast.",
    source: "Polymarket · options markets",
  },
];

const STEPS = [
  { title: "Ask U-Bot", body: "“Buy ARB ฿5,000”, “Scan my portfolio”, or just “What's moving Bitcoin?” In Thai or English." },
  { title: "U-Guard checks", body: "The agent plans and calls its tools: unlock schedule, news, market odds. Every number comes from data." },
  { title: "Plain answer", body: "Beginner or pro, read aloud by ElevenLabs. A compliance check removes advice and unsourced numbers first." },
  { title: "You decide", body: "Approve a protection rule if you want one. It is recorded on Avalanche; nothing moves your money." },
];

export default async function Home() {
  const t = now();
  const today = new Date(t).toISOString().slice(0, 10);
  const [session, events, arb] = await Promise.all([getSession(), getEventCalendar(45, { now: t }), assessUnlockRisk("ARB", null, { now: t })]);

  return (
    <>
      <Loader events={events.length} />
      <SiteNav signedIn={!!session} />
      <main id="top">
        <section className="hero">
          <div className="container hero-grid">
            <div>
              <span className="eyebrow">
                <Icon name="shield" size={14} /> U-Hackathon 2026 · AI Track · Built for U-Bot
              </span>
              <h1 style={{ marginTop: 14 }}>
                Know before your <span className="accent">money moves.</span>
              </h1>
              <p className="lede">
                U-Guard is the safety skill inside <span className="nowrap">U-Bot</span>, <span className="nowrap">U-topia&apos;s</span> assistant. Before you buy, it checks scheduled token unlocks, the news
                and what markets are pricing, explains it in plain words, and lets you approve every action.
              </p>
              <div className="ctas">
                <Link className="btn btn-primary" href={session ? "/assistant" : "/login"}>
                  {session ? "Open the assistant" : "Try the live demo"} <Icon name="arrowRight" size={16} />
                </Link>
                <a className="btn" href="#how">
                  How it works
                </a>
              </div>
              <p className="dim" style={{ fontSize: 13, marginTop: 14 }}>
                No account? Tap the U-Bot bubble in the corner and ask anything.
              </p>
            </div>
            <div className="stack" style={{ gap: 10 }}>
              <span className="eyebrow">Live check · today</span>
              {arb.ok ? <RiskCardView card={arb.card} mode="pro" /> : null}
            </div>
          </div>
        </section>

        <section className="section" id="why" style={{ paddingTop: 24 }}>
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">The problem</span>
              <h2 style={{ marginTop: 10 }}>The schedule is public. Retail still finds out last.</h2>
              <p>
                Tokens unlock for teams and early investors on dates published years in advance. In a self-custody wallet nobody stands
                between you and a buy, so the warning has to come from your own assistant, at the moment you act.
              </p>
            </div>
            <div className="grid-3">
              <div className="card">
                <div className="stat-big">~90%</div>
                <p className="muted" style={{ margin: 0 }}>
                  of the 16,000+ token unlocks Keyrock studied put downward pressure on price.
                </p>
                <p className="source-line">
                  Source:{" "}
                  <a href="https://keyrock.com/from-locked-to-liquidity-what-16000-token-unlocks-teach-us/" target="_blank" rel="noopener noreferrer">
                    Keyrock
                  </a>
                </p>
              </div>
              <div className="card">
                <div className="stat-big">~30 days</div>
                <p className="muted" style={{ margin: 0 }}>
                  before an unlock is when that pressure usually starts, while the hype is still running.
                </p>
                <p className="source-line">
                  Source:{" "}
                  <a href="https://keyrock.com/from-locked-to-liquidity-what-16000-token-unlocks-teach-us/" target="_blank" rel="noopener noreferrer">
                    Keyrock
                  </a>
                </p>
              </div>
              <div className="card">
                <div className="stat-big">92.65M ARB</div>
                <p className="muted" style={{ margin: 0 }}>
                  released to Arbitrum&apos;s team and investors on Oct 16, 2026: 1.56% of circulating supply, again every month until early
                  2027.
                </p>
                <p className="source-line">
                  Source:{" "}
                  <a href="https://en.coinotag.com/arbitrum-arb-unlocks-92-65-million-tokens-october-16" target="_blank" rel="noopener noreferrer">
                    Coinotag
                  </a>{" "}
                  (Tokenomist data)
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="signals">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">Three signals, one answer</span>
              <h2 style={{ marginTop: 10 }}>Everything that can move a coin, in one place</h2>
              <p>U-Guard combines what is scheduled, what is reported and what markets are pricing, and only flags what matters for what you hold.</p>
            </div>
            <div className="grid-3">
              {SIGNALS.map((s) => (
                <div className="card feature" key={s.title}>
                  <span className="icon-wrap">
                    <Icon name={s.icon} size={20} />
                  </span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                  <p className="source-line">{s.source}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="how">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">How it works</span>
              <h2 style={{ marginTop: 10 }}>An agent that checks, explains, and waits for you</h2>
            </div>
            <div className="steps">
              {STEPS.map((s) => (
                <div className="step" key={s.title}>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              ))}
            </div>

            <div className="card" style={{ marginTop: 20 }}>
              <h3 className="row" style={{ gap: 8 }}>
                <Icon name="plug" /> Built to plug into U-Bot
              </h3>
              <p className="muted" style={{ margin: 0 }}>
                U-Guard is a skill, not a separate app: <span className="nowrap">U-Bot</span>, <span className="nowrap">U-topia&apos;s</span> AI orchestrator, calls it before a swap, a buy or a recurring plan.
              </p>
              <div className="flow" aria-label="Integration flow">
                <div className="node">
                  <strong>U-Bot</strong>
                  <span>U-topia&apos;s assistant</span>
                </div>
                <span className="arrow" aria-hidden="true">
                  <Icon name="arrowRight" />
                </span>
                <div className="node">
                  <strong>MCP · /api/mcp</strong>
                  <span>25 tools, one endpoint</span>
                </div>
                <span className="arrow" aria-hidden="true">
                  <Icon name="arrowRight" />
                </span>
                <div className="node">
                  <strong>U-Guard</strong>
                  <span>unlocks · news · odds</span>
                </div>
                <span className="arrow" aria-hidden="true">
                  <Icon name="arrowRight" />
                </span>
                <div className="node">
                  <strong>You approve</strong>
                  <span>receipt on Avalanche</span>
                </div>
              </div>
              <p className="source-line">
                In this demo the chat stands in for U-Bot; the MCP endpoint is live for when <span className="nowrap">U-topia</span> opens{" "}
                <span className="nowrap">U-Bot&apos;s</span> interface.
              </p>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container grid-2" style={{ alignItems: "start" }}>
            <UnlockRadar events={events} today={today} />
            <div className="stack" style={{ gap: 16 }}>
              <div>
                <span className="eyebrow">Trust</span>
                <h2 style={{ marginTop: 10 }}>We don&apos;t predict prices.</h2>
                <p className="muted">We show what is scheduled, what is reported and what markets price, with the source on every number.</p>
              </div>
              {[
                {
                  icon: "info" as const,
                  t: "Information, not advice",
                  b: "Advising on digital assets needs an SEC licence in Thailand, so U-Guard never says buy, sell or hold.",
                },
                { icon: "shield" as const, t: "Checked before you see it", b: "A compliance step blocks advice language and any number that is not in the data." },
                { icon: "lock" as const, t: "Your keys stay yours", b: "Self-custody first. Paste a seed phrase and U-Guard refuses to send it anywhere." },
              ].map((x) => (
                <div className="card card-tight row" key={x.t} style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                  <span className="icon-wrap" style={{ display: "inline-grid", placeItems: "center", width: 36, height: 36, flex: "none", borderRadius: 10, background: "rgba(45,212,191,0.12)", color: "var(--teal)" }}>
                    <Icon name={x.icon} />
                  </span>
                  <div>
                    <strong>{x.t}</strong>
                    <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                      {x.b}
                    </p>
                  </div>
                </div>
              ))}
              <div className="logo-row" aria-label="Data and technology">
                {BRANDS.map((b) => (
                  <BrandLogo key={b.id} brand={b} />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="cta-band">
              <h2>Ask before you buy.</h2>
              <p className="muted" style={{ maxWidth: "32em", margin: "0 auto 18px" }}>
                Try it with the demo wallet: ARB, WLD, AVAX, ETH and USDC.
              </p>
              <Link className="btn btn-primary" href={session ? "/assistant" : "/login"}>
                {session ? "Open the assistant" : "Try the live demo"} <Icon name="arrowRight" size={16} />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
