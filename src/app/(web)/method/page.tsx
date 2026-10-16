import type { Metadata } from "next";
import { SiteFooter, SiteNav } from "@/components/site/SiteChrome";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Method & data" };

const FACTORS = [
  ["Size", "Unlock as % of circulating supply", "<0.1% → 0.05 · <0.5% → 0.2 · <1% → 0.4 · <5% → 0.7 · <10% → 1.0 · ≥10% → 0.9", "0.35"],
  ["Liquidity", "Unlock value ÷ 24h trading volume", "<0.1 days → 0.1 · <0.5 → 0.4 · <1 → 0.7 · ≥1 → 1.0 · unknown → 0.5", "0.30"],
  ["Recipient", "Who receives the tokens", "team 1.0 · investors 0.6 · community 0.5 · reserve 0.4 · ecosystem fund 0", "0.35"],
  ["Timing", "Multiplier on the sum", "≤7 days before 1.0 · ≤14 → 0.8 · ≤30 → 0.65 · just unlocked ≤2 days 0.85 · ≤7 → 0.6 · ≤14 → 0.4 · continuous 0.65", "×"],
  ["Investor profit", "Bonus when investors are in profit", "10 × investor share × (≥10x → 1 · ≥3x → 0.6 · ≥1x → 0.3)", "+"],
];

const SOURCES = [
  ["Token unlocks, allocations, fundraising", "Tokenomist API v5", "Live with a key; otherwise a dated snapshot (ARB) or labelled samples (WLD, AVAX)"],
  ["Price, 24h volume", "CoinGecko", "Live with MARKET_SOURCE=live; otherwise a dated snapshot"],
  ["News", "GDELT DOC 2.0", "Live with NEWS_SOURCE=live; otherwise a dated snapshot of real reporting with links"],
  ["Event odds", "Polymarket Gamma API", "Live with ODDS_SOURCE=live; otherwise a dated snapshot as reported"],
  ["Sentiment, implied range", "Alternative.me Fear & Greed · Deribit DVOL", "Live with MARKET_SOURCE=live"],
  ["Voice", "ElevenLabs (eleven_v3, Thai + English)", "Browser voice when no key is set"],
  ["Approval receipts", "Avalanche Fuji testnet", "Simulated receipts when no testnet key is set"],
];

export default async function MethodPage() {
  const session = await getSession();
  return (
    <>
      <SiteNav signedIn={!!session} />
      <main className="section" style={{ paddingTop: 40 }}>
        <div className="container prose">
          <span className="eyebrow">Method &amp; data</span>
          <h1 style={{ fontSize: "clamp(2rem, 5vw, 3rem)", marginTop: 10 }}>How U-Guard decides what to show you</h1>
          <p>
            U-Guard does not predict prices. It reports three things that can be checked: what is <b>scheduled</b> (token unlocks), what is{" "}
            <b>reported</b> (news), and what markets are <b>pricing</b> (prediction markets, options). The AI explains; the numbers come from
            code and data.
          </p>

          <h2>The unlock risk score (v0.2 heuristic)</h2>
          <p>
            <code>score = min(100, 100 × timing × (0.35·size + 0.30·liquidity + 0.35·recipient) + investor bonus)</code>. 55 or more is high, 30
            to 54 medium, below 30 low. Weights follow{" "}
            <a href="https://keyrock.com/from-locked-to-liquidity-what-16000-token-unlocks-teach-us/" target="_blank" rel="noopener noreferrer">
              Keyrock&apos;s study of 16,000+ unlocks
            </a>
            : pressure builds about 30 days before an unlock and fades about two weeks after, team unlocks hurt most, ecosystem-fund unlocks
            averaged +1.18%.
          </p>
          <div className="table-wrap card" style={{ padding: 0 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Factor</th>
                  <th>Measures</th>
                  <th>Scale</th>
                  <th className="r">Weight</th>
                </tr>
              </thead>
              <tbody>
                {FACTORS.map(([f, m, s, w]) => (
                  <tr key={f}>
                    <td>
                      <b>{f}</b>
                    </td>
                    <td>{m}</td>
                    <td className="dim" style={{ minWidth: 220 }}>
                      {s}
                    </td>
                    <td className="r">{w}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="dim" style={{ fontSize: 14 }}>
            Limits: the weights are not yet backtested; continuous (linear) releases are approximated; thin-float tokens deserve an extra factor
            (planned for v1).
          </p>

          <h2>Data sources</h2>
          <div className="table-wrap card" style={{ padding: 0 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>What</th>
                  <th>Source</th>
                  <th>Mode</th>
                </tr>
              </thead>
              <tbody>
                {SOURCES.map(([w, s, m]) => (
                  <tr key={w}>
                    <td>{w}</td>
                    <td>
                      <b>{s}</b>
                    </td>
                    <td className="dim">{m}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Every card carries a badge: <b>Live</b> (fetched now), <b>Snapshot</b> (real data captured on the date shown) or <b>Sample</b>{" "}
            (illustrative demo data).
          </p>

          <h2>How the agent works</h2>
          <ol>
            <li>
              <b>Guard.</b> Your message is checked first: seed phrases and private keys are blocked, personal data is redacted, prompt-injection
              attempts are flagged.
            </li>
            <li>
              <b>Plan and act.</b> A language model (any OpenAI-compatible model, or Claude) decides which tools to call; without a model, a
              deterministic planner runs the same tools. Every call is validated and shown in the trace.
            </li>
            <li>
              <b>Retrieve.</b> Fresh facts come from tools (RAG): unlock schedules, news ranked by relevance and recency, odds. Static knowledge
              (this method, the FAQ) is preloaded into the model&apos;s cached context (CAG).
            </li>
            <li>
              <b>Reflect.</b> Before you see the answer, a compliance check blocks advice language and price predictions (English and Thai) and
              any number that is not in the tool results. A failing answer is rewritten once, then replaced by a checked template.
            </li>
            <li>
              <b>You approve.</b> Protection rules are proposals. Approving records a receipt on Avalanche; nothing moves your money.
            </li>
          </ol>

          <h2>Connecting U-Bot (MCP)</h2>
          <p>
            U-Guard exposes its 25 tools as a Model Context Protocol server, so U-Bot or any MCP client can call them before acting. 22 read: risk,
            news, odds, the user&apos;s plan, orders, alerts and on-chain activity (Avalanche Data API). Three let U-Bot draft a paper-trade plan, an
            investment plan or an alert rule. None of them approves or executes anything: plans wait for the user in the app, and every tool is
            annotated as read-only or as a write that is not destructive.
          </p>
          <pre className="code">{`POST /api/mcp   (Streamable HTTP, JSON-RPC)
Authorization: Bearer $MCP_API_KEY
X-UGuard-User: <the U-topia user U-Bot is serving>   (optional)
X-UGuard-Locale: th | en                             (optional)

{"jsonrpc":"2.0","id":1,"method":"tools/call",
 "params":{"name":"assess_unlock_risk",
           "arguments":{"symbol":"ARB","trade_amount_thb":5000}}}`}</pre>
          <p>
            A caller holding the key may act for one of its users. A proposal it creates then belongs to that user and lands in their U-Bot inbox,
            where they approve or decline it. Without the key the header is ignored. Once U-topia shares its spec, a delegated user token replaces the
            header. Try it locally with <code>npm run ubot</code>, a stand-in MCP client that plays U-Bot.
          </p>

          <h2>Compliance</h2>
          <p>
            In Thailand, giving advice on the value of digital assets is a licensed business (SEC digital asset advisory). U-Guard therefore gives
            information only: facts with sources, what markets price, and protection rules you choose. It never tells you to buy, sell or hold.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
