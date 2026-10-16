# U-Guard

**Know before your money moves.** (รู้ก่อน เงินจะขยับ)

U-Guard is an agent inside U-Bot that checks supply risk (token unlocks and emissions) before a U-topia user buys or holds a token. It also checks **news and events** and **what markets are pricing** (prediction markets, options). It explains the risk in three plain lines (Thai or English, with voice), and the user approves every protective action themselves. Approvals are recorded on Avalanche.

U-Hackathon 2026 · AI Track · FLOW Summit Bangkok

> Decision support only. Not investment advice. We don't predict price; we forecast supply.

## Documents

| File | What it covers |
|---|---|
| [SPEC.md](SPEC.md) | **Start here.** The whole system: features, architecture, workflows, agents, data model, API, status, decisions (Thai) |
| [DEMO.md](DEMO.md) | **Stage script:** 3-minute run of show (EN + TH lines), fallbacks, judge Q&A, pre-stage checklist |
| [DEMO-DAY-PLAN.md](DEMO-DAY-PLAN.md) | Step-by-step plan for demo day: keys, MCP demo, tests, rehearsal, risks, post-hackathon roadmap |
| [TODO.md](TODO.md) | **What is left:** not done, missing, or still waiting on keys/people, with priorities and a plan for demo day (Thai) |
| [STATUS.md](STATUS.md) | Latest status: every feature built, which flows work, what doesn't fit together yet, Trade/Invest direction, models, integrations, data pipeline (Thai) |
| [AGENTIC-WORKFLOW.md](AGENTIC-WORKFLOW.md) | Agentic AI design v2: what is new, models per job, LangGraph or not, RAG types, live data, alerts, portfolio drift |
| [PLAN.md](PLAN.md) | Problem and evidence, U-topia, timeline, demo script, judging criteria, forecast (Thai) |
| [UI-PLAN.md](UI-PLAN.md) | Pages, navigation, AI gateway, auth and DB, loading page, UI resources (Thai) |
| [ANALYSIS.md](ANALYSIS.md) | Models and VLMs, Nansen comparison, user segments, regulation, U-topia gaps, roadmap (Thai) |
| [UI-REVIEW.md](UI-REVIEW.md) | UI test results, fixes, what to show to whom, logo slots |
| [MCP-INTEGRATIONS.md](MCP-INTEGRATIONS.md) | Other MCP servers (CoinGecko, Alpaca, EVM, Coinrule): what fits where, what we left out and why |
| [LOGS.md](LOGS.md) | Development log. The agent's runtime log is written to `logs/YYYY-MM-DD.jsonl` (not served as a page) |

## Pages

One app, one menu that follows an investor's day. It signs the browser into the demo account automatically; the account button (top right) shows who is signed in, with Sign out and "Sign in another way" (email or wallet). On Vercel each visitor gets their own demo account, so judges don't see each other's orders; on the laptop everyone shares `demo-user`, which U-Bot over MCP acts for (`DEMO_SHARED` overrides). The UI is English; ask U-Bot in Thai and it answers in Thai (with voice).

| Path | Purpose |
|---|---|
| `/` | Landing: GuardWatch hero (live scores), problem numbers, features, how it works, FAQ · "Open the app" |
| `/terminal` | **Today**: ask U-Bot, the four steps (Check → Plan → Approve → Stay alerted), portfolio at risk, decisions waiting, "coming up for your money" |
| `/terminal/agent` | **Ask U-Bot**: the agent with risk cards, drift card, proposals, voice and the Agent Trace |
| `/terminal/tokens` | **Token screener** (Tokenomist-style table): top 40 tokens by market cap, live prices, float, next unlock (date, size, value, recipient), unlock risk grade, 7/30/60-day windows, sort, search |
| `/terminal/tokens/[symbol]` | Token page: risk card, 6-month supply forecast, allocations, fundraising, trade ticket |
| `/terminal/unlocks` | Unlock calendar: analysed tokens, market unlocks, Fed dates |
| `/terminal/news` | **News**: live headlines (Cointelegraph, CoinDesk, Decrypt) tagged by token and topic, unlock watch, curated picks, "what does this mean for me?" |
| `/terminal/portfolio` | Portfolio: weights vs your **target mix** (drift), unlock risk, dilution, charts, editable targets, PDF |
| `/terminal/plan` | **My plan**: the next 30 days on one dated timeline (unlocks of your coins, daily releases, Fed dates, DCA buys, decisions, active rules, stop-losses), each with a next step · save as PDF |
| `/terminal/trade` | Trade: U-Bot drafts the plan (size, stop-loss, what-if rows), U-Guard checks it, the user approves a paper order |
| `/terminal/invest` | Invest: five-question risk profile → adjustable model portfolio (sample data) → U-Guard checks the crypto part and DCA dates → approve |
| `/terminal/alerts` | Alert rules, decisions, U-Bot inbox (bell on every page) |
| `/method` | Score formula, data sources, agent architecture, MCP usage, compliance |
| `/app` | Stage demo only (not in the menus): U-topia phone screen with U-Bot chat |
| `/report` | An A4 report to save as PDF |

Also: `/login` (demo account · email/password · Sign-In with Ethereum) and `/en` (platform overview). `/assistant` and `/dashboard` redirect into the app. The app installs to a phone's home screen (web app manifest).

### Hosting (Vercel)

Each route is its own serverless function, so the in-memory store (U-Bot inbox, proposals, plans, alert rules, email accounts) is shared through **Upstash Redis** when `KV_REST_API_URL`/`KV_REST_API_TOKEN` (Vercel's Upstash integration) or `UPSTASH_REDIS_REST_URL`/`_TOKEN` are set (`withStore()` in `src/lib/store.ts`). Without them, run it on one Node server (`npm run build && npm start`). Set `TOKENOMIST_API_KEY`, `MCP_API_KEY`, `AUTH_SECRET`, `MARKET_SOURCE=live`, `NEWS_SOURCE=rss`, and optionally `ELEVENLABS_API_KEY`, an LLM key and `DEMO_PRIVATE_KEY` (Fuji testnet).

## Run it

```bash
npm install
cp .env.example .env   # every key is optional; without keys the app uses sample data and fallbacks
npm run dev            # http://localhost:3000 (Thai landing) · /app · /terminal · /en
npm run snapshot -- ARB WLD AVAX   # pull real data from Tokenomist (needs TOKENOMIST_API_KEY)
```

Stage / production mode (never run `next build` while `next dev` is running):

```bash
npm run build
AUTH_SECRET=$(openssl rand -base64 32) npm start
```

Rehearse demo day today: `DEMO_NOW=2026-10-16T07:00:00Z npm run dev`. The ARB unlock is at 13:00 UTC (20:00 Bangkok), so at 07:00 UTC the card reads "unlocks today"; from 13:00 UTC it reads "just unlocked".

## How the agent works

`src/lib/agent/index.ts` is the harness: **guard → plan + act → reflect → observe**.

- **Model is pluggable**: Claude via the Anthropic SDK (the team's choice; optionally through the Vercel AI Gateway, `AI_GATEWAY=vercel`), any OpenAI-compatible model (`LLM_BASE_URL`), or the deterministic **rules engine** (the offline agent), which is also the automatic fallback. With `AGENT_PROVIDER=auto` the order is OpenAI-compatible (if `LLM_API_KEY` is set), then Claude, then rules; set `AGENT_PROVIDER=anthropic` to force Claude. `AGENT_MODE` (claude/offline/auto) still works as a legacy alias.
- **Language**: replies follow the user's language. Thai input gets Thai replies, card reasons and proposal text; English input gets English.
- **25 tools** (`src/lib/agent/tools.ts`), zod-validated.
  - **22 read tools** shared by the chat (every provider) and MCP. Besides risk, news, odds, drift and stress, they cover the whole app, so the agent can answer about anything the user sees: `get_paper_trading`, `list_alerts`, `get_my_plan`, `get_invest_plans`, `get_invest_options`, `get_upcoming_unlocks` (market-wide, Tokenomist live), `get_wallet_activity` and `lookup_onchain` (Avalanche Data API).
  - **3 that write**, for U-Bot over MCP only: `draft_trade_plan`, `draft_invest_plan`, `create_alert_rule`.
  - **No tool approves or executes anything.** Trade and invest tools only draft a plan; the user approves it in the app, behind their own session. This is a server rule, not just a hint.
  - Every tool carries MCP annotations (read-only, or a write that is not destructive) so a client can decide when to ask the user.
  - The in-app chat doesn't get the 3 tools that write; the user drafts on the Trade, Invest and Alerts pages.
- **Data status**: `GET /api/status` says where each piece of data comes from right now, never a key. It shows:
  - Tokenomist live or saved, and the tokens scored in full
  - prices, news, shared store and broker
  - which model answers (Claude, an OpenAI-compatible model, or the rules engine when no key is set)
  - ElevenLabs or the browser's voice
  `npm run check:live` calls every outside service the way the app does (Tokenomist, prices, RSS, Avalanche Data API, Fuji RPC, ElevenLabs, the LLM key) and prints PASS / WARN / FAIL.
- **Tokens scored in full**: offline, the 3 in the snapshot. With Tokenomist live, also `TRACKED_TOKENS` (default ARB, WLD, AVAX, OP, SUI, APT, TIA, STRK, ZRO, ENA; at most 12).
- **Voice mode** (Ask U-Bot page) is a full-screen, hands-free conversation in the style of ChatGPT's: an orb that moves with your voice and U-Bot's, captions, tap the orb to interrupt. Speak, U-Bot answers and reads the answer aloud, then the mic opens again. It uses ElevenLabs (`ELEVENLABS_MODEL_ID`, default `eleven_v3`, which speaks Thai) for speech and Scribe for listening, with the browser's voice and recognition as the fallback. Recording stops by itself after a pause.
- **RAG** for fresh facts (unlocks, news ranked by relevance + recency with citations, odds, pulse); **CAG** for static knowledge (`data/knowledge/faq.json`, preloaded into the cached system prompt).
- **Guardrails**: input guard (seed phrases/private keys blocked, PII redacted, injection flagged), rate limits, Origin checks, output compliance check (no buy/sell/hold advice or price predictions in EN/TH; every number must come from a tool result; one rewrite, then a checked template).
- **U-Bot reaches U-Guard three ways**, all through the same tools: the in-app chat, the webhook adapter (`/api/ubot/webhook` + `/api/ubot/inbox`, Bearer `UBOT_API_KEY`), and the **MCP server** at `/api/mcp` (Streamable HTTP, Bearer `MCP_API_KEY`). A caller with the key may act for a user (`X-UGuard-User`, optional `X-UGuard-Locale: th`): proposals it creates belong to that user and land in their U-Bot inbox (the bell), where they approve them. Trade and invest plans U-Bot drafts wait under "Plans waiting for you" on the Trade page and "Plans U-Bot drafted for you" on the Invest page, with a link in the inbox message. `npm run ubot` is a stand-in MCP client that plays U-Bot for the stage demo (`-- --trade` adds a fifth step that drafts the trade plan).
- **Watcher** (alert engine): unlock, drift and news rules (`*` = every holding) are checked on a timer (`WATCH_INTERVAL_MIN`, default 10) in `npm start`. On Vercel, `vercel.json` schedules `GET /api/watch` with `Bearer $CRON_SECRET`.
  - No model decides whether to alert.
  - Each alert goes out once.
  - 22:00–07:00 Bangkok sends high severity only (`WATCH_QUIET_START`/`WATCH_QUIET_END`).
  - At most `WATCH_MAX_PER_DAY` alerts per day.
  - High-severity news needs a second source.
  - Hits go to the U-Bot inbox (bell in the terminal header) as one message with cards and proposals. The alerts page shows the history and why anything was held back.
- **Portfolio drift**: the user sets their own target mix on `/terminal/portfolio`. `check_portfolio_drift` (chat and MCP) reports what is over or under the band, together with unlock risk and dilution; it never says what to buy or sell.
- **Freshness**: every unlock card, token-page section, trade plan and the portfolio shows "as of HH:MM" (Bangkok time). If Tokenomist or CoinGecko fails after a live success, the last good copy is used and marked "(may be out of date)". Tool results carry `as_of` / `as_of_th` and `stale`; the agent quotes the age in the reply's language.
- **Trade and Invest plans**: every number is arithmetic on the user's own choices, the quote and the wallet, or a cited historical average; no model picks assets or predicts prices. Orders are paper orders; approvals are recorded on Avalanche Fuji (simulated without a key). With `BROKER=alpaca-paper` an approved order is also sent to an Alpaca **paper** account (hard-coded paper URL, only after the user's approval, never from an AI or MCP tool; see [MCP-INTEGRATIONS.md](MCP-INTEGRATIONS.md)).
- **Run log**: every agent run is appended to `logs/YYYY-MM-DD.jsonl` (redacted text, tool trace, timings); `LOG_SILENT=true` turns it off.

## Checks

```bash
npm run typecheck
npm run check:live    # PASS/WARN/FAIL for every live service with your .env (run on a machine with internet)
npm run eval          # 72 golden cases (EN + TH): risk, agent, compliance, guard, MCP, trade, invest, alerts, paper broker, app data, unlock feed, Avalanche Data API · offline and deterministic (sandboxed shells: node --import tsx evals/run.ts)
npm run ubot          # U-Bot stand-in: MCP client acting for demo-user (needs the server's MCP_API_KEY in .env)
npm run ubot -- --trade --coingecko   # + draft the trade plan, + cross-check volume with CoinGecko's MCP server
npm run responsive    # 17 pages × iPhone SE/15 Pro/15 Pro Max/iPad/desktop: screenshots + layout audit
npm run responsive -- --webkit   # Safari engine (npx playwright install webkit once)
```

## Data

Offline data lives in `data/fixtures` and is labelled in the UI: **Snapshot** = real data captured on the date shown (ARB, WLD and AVAX unlocks, daily emission, allocations and funding from the Tokenomist API on 16 Oct; news, odds, pulse), **Sample** = illustrative (prices, demo wallet). `npm run snapshot -- ARB WLD AVAX` refreshes the Tokenomist fixtures (in a sandboxed shell, prefix `NODE_USE_ENV_PROXY=1` so Node's fetch uses the proxy).

**Live** (with keys / `MARKET_SOURCE=live`, `NEWS_SOURCE=rss`): Tokenomist API v5 (token list of 650+ tokens, unlock events, daily emission, allocations, fundraising; ARB, WLD and AVAX scored in full, the screener's top 40 get their next cliff), prices and 24h change from Hyperliquid's public API, spot volume and market data from CoinGecko (cached 10 minutes), headlines from Cointelegraph, CoinDesk and Decrypt RSS. Calls are rate-limited and cached so a burst never trips the APIs; on failure the app falls back to the labelled snapshot.

The v5 unlock-events endpoint lists cliffs only. Continuous releases (WLD ~2.9M a day, AVAX staking rewards, the ARB DAO treasury) come from daily emission, which `getUnlockEvents` folds into one linear event (cliff days are skipped, so nothing is counted twice).

Stack: Next.js 15 · React 19 · TypeScript · plain CSS · zod · Claude (Anthropic SDK, default) or any OpenAI-compatible model · Tokenomist API · ElevenLabs · Avalanche (viem) · @modelcontextprotocol/sdk · Playwright (dev) · Hyperliquid + CoinGecko (prices) · RSS news · Upstash Redis (optional, hosting) · Supabase (post-hackathon).
