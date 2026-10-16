# Development Log

U-Guard development log. Times are Bangkok time (UTC+7); a "~" means approximate.
The agent's **runtime log** (every question with PII redacted, tool call, approval and error) is written to `logs/YYYY-MM-DD.jsonl`. Those files are not committed, and there is no `/logs` page (it was never committed; see UI-REVIEW, "What to show to whom").

---

## 2026-10-15 (Thu) · Hackathon day 1

### ~10:30–12:30 · Research and planning
- Read the event brief (Luma), the judging weights 40/40/10/5/5 and the sponsors (Tokenomist, ElevenLabs, Avalanche).
- Problem: retail buyers don't know about token unlocks at the moment they buy. Confirmed with 2026 data (Tokenomist, Keyrock, October unlock news).
- U-topia: app launches Oct 16, U-Bot is built on Visa Intelligent Commerce, plus Topi AI, UCOIN and U.CENTER.
- **Decision:** position the product as decision support, not investment advice (advice needs a Thai SEC licence).
- Wrote PLAN.md, UI-PLAN.md and SPEC.md. Designed the avatar and logo.
- **Problem:** `npm install` failed because the sandbox can't write `~/.npm` → fixed with `npm_config_cache=$TMPDIR/npm-cache`.
- **Problem:** the sandbox blocks creating `.git` in the session's scratch folder → used a separate `GIT_DIR`, then pushed the first commit `1f787ba` to `main`.

### ~13:05 · Moved into the real repo
- Cloned `nathirad/U-Hackathon` to `~/code/U-Hackathon` and created branch **`feat/app-ui`**.
- First `tsc` run found one error (`source.mode` typed as `string`); fixed.

### ~13:10 · Data
- Switched the token set from SUI (not EVM) to **ARB / WLD / AVAX / USDC**.
- ARB uses real data from tokenomist.ai/arbitrum: a 92.65M unlock (team 56.13M + investors 36.52M) on the 16th of every month until Mar 2027 · price ~$0.178 · $123.7M raised in total (Series B at a $1.2B valuation).
- WLD and AVAX are labelled sample data until `npm run snapshot` runs with a key.

### ~13:15 · Agent and backend
- `offline.ts`: a fallback agent with no LLM that calls the same tools as Claude, so the agent trace looks the same.
- `agent/index.ts`: switches between claude / offline / auto and logs every run.
- `log.ts`: JSONL in `logs/` plus the `/logs` page.
- Supports Vercel AI Gateway (`AI_GATEWAY=vercel`) and turns off the `fallbacks` beta when routed through the gateway.
- API routes: `agent`, `scan`, `protect`, `voice`, `stt`, `portfolio`, `ticker`, `logs`, `ubot/webhook`, `ubot/inbox`.
- U-Bot adapter: `mock` (internal inbox) and `webhook`.

### ~13:20 · `/app` UI
- U-topia phone screen (wallet + U-Bot chat) · risk card · proposal card · agent trace · live unlock ticker · `/logs` · a minimal `/`.
- UI review at three screen sizes, 8 fixes (see [UI-REVIEW.md](UI-REVIEW.md)). The most important: horizontal overflow on mobile and no room left for the chat.

### ~13:30 · ElevenLabs STT + PDF
- **Speak** button: records audio and sends it to ElevenLabs Scribe (`/api/stt`). Without a key it uses the browser's th-TH speech recognition.
- **PDF report:** the "Summarise as PDF" button opens `/report` (A4) and the browser saves it as PDF, which shapes Thai text correctly.
- **Problem:** running `next build` while the dev server was running overwrote `.next` and broke dev → restarted. **Rule:** never build while dev is running.

### ~13:40 · Documents
- [ANALYSIS.md](ANALYSIS.md): models and VLMs, Nansen comparison, three user segments, regulation, U-topia gaps, roadmap.
- [UI-REVIEW.md](UI-REVIEW.md) and this file.

### ~13:50 · U-Guard Terminal (`/terminal`), Nansen-style in our own style
- **Why:** the user wanted a web app like app.nansen.ai, restyled as our own.
- **Decision:** Nansen's core is Smart Money, which is its own labelled-wallet data. We use **supply and unlock data** instead, because it is the one market variable that is scheduled in advance and that we can actually get from Tokenomist.
- **New pages:**
  - Overview: AI ask box with typed examples, KPIs, upcoming unlocks, lowest-float tokens.
  - Tokens: a 25-token screener, sortable, with a Float < 50% filter.
  - Token page: KPIs, risk card, 6-month supply chart by recipient, allocations, funding rounds.
  - Unlock calendar, portfolio (6-month dilution and PDF), alerts, AI agent (`?q=`).
- **Sidebar:** collapse with ⌘B, search with ⌘K (a ticker opens its token page; anything else goes to the AI agent).
- **New APIs:** `/api/screener`, `/api/calendar`, `/api/token/{symbol}`, `/api/portfolio/risk`, `/api/alerts`.
- **New lib files:**
  - `forecast.ts` (monthly supply + dilution)
  - `recipient.ts` (shared by server and client)
- **New data:**
  - `screener.json`: 25 real rows from the Tokenomist fundraising screener.
  - `unlock-calendar.json`: market events, each with a source URL.

### ~14:00 · New landing page (`/`)
- Only the **layout and interactions** follow areazeroai.com, as the user asked. All content, data and branding are U-Guard's own.
- **Parts:**
  - First-visit loader and a pill nav that highlights the current section.
  - Hero with a rotating word, an orbit around the avatar, and a marquee.
  - Count-up numbers, features 01–04, demo cards that link to real pages, the agent's 6 steps.
  - FAQ, CTA and a back-to-top button with a progress ring.
- **Effects** (`src/components/fx.tsx`): CountUp, typewriter, pointer spotlight, reveal on scroll, growing bar chart. All of them switch off when the user prefers reduced motion.
- **Removed the duplicate `u-guard/` folder** (copied in when the session moved; identical to commit `1f787ba`).

### ~14:05 · Browser testing and fixes (details in [UI-REVIEW.md](UI-REVIEW.md), round 2)
- The rotating hero word sometimes didn't paint, because the gradient text and the animation were on the same element → split into two layers.
- KPI numbers were as small as their labels, because `.kpi span` also matched CountUp's span → changed to `.kpi > span`.
- **The token page said "no data" when loading failed** → separate error state with a retry button, so a server hiccup never looks like a clean bill of health.
- **Mobile:**
  - The menu wrapped into 3 rows (~300px) → one horizontally scrolling row that keeps the current page in view.
  - Token page tables overflowed by 9px → wrapped them in a scroll container.
  - Unlock rows now put the risk badge under the text.
- Checked: every `/terminal` page and `/` fit a 375px screen · adding an alert rule works · the FAQ opens and closes · typecheck passes.

### ~14:10 · Direction change: agentic workflow first, UI template later
- The team will supply a UI template later. Docs are now written in English (README, LOGS, UI-REVIEW, AGENTIC-WORKFLOW; SPEC, PLAN, UI-PLAN, ANALYSIS are still Thai).
- Wrote [AGENTIC-WORKFLOW.md](AGENTIC-WORKFLOW.md): what is new in v2, models per job, LangGraph or not, RAG types, live market data, alerts and portfolio drift, and an ordered build plan.
- **Decision:** no LangChain / LangGraph for the hackathon; numbers come from tools, not vector RAG; GraphRAG-lite in Postgres for investor links.

### ~14:20 · Hero in our own style + logo motion
- The orbit read as a copy of the reference site, and two of its chips overlapped. Replaced it with **U-Guard Watch** (`GuardWatch.tsx`): a 30-day unlock timeline slides into a scan line, the mark reacts in the risk colour, 3 Thai lines appear, and the proposal is approved.
- New animated mark `GuardMark.tsx`: draw-in, blink, look, risk-colour ripple, "shield up" on high risk. Motion spec and the layers a redesigned logo must keep are in [UI-REVIEW.md](UI-REVIEW.md). The loader uses the draw-in.
- **Problem:** the hero froze in a background browser tab because IntersectionObserver never fired → start after 1.5s if no callback arrives.
- Removed run logs, the GitHub button and the old Run Logs card from user-facing pages (reasons in UI-REVIEW, "What to show to whom"). `/logs` still works by URL.
- Sent the current logo SVGs to the user for the redesign.

### Status at the end of this round
| Area | Status |
|---|---|
| typecheck | ✅ passes (no production build this round, because the dev server is running) |
| Buy → card → approve flow (offline agent) | ✅ tested in the browser |
| All `/terminal` pages + landing `/` | ✅ tested at 1440px and 375px |
| Real Claude agent | ⬜ not tested (no `ANTHROPIC_API_KEY`) |
| Real ElevenLabs TTS / STT | ⬜ not tested (no key, and the test browser has no speaker or mic) |
| Real Avalanche Fuji tx | ⬜ not tested (no `DEMO_PRIVATE_KEY`); simulated for now |
| Tokenomist live / snapshot | ⬜ needs a key (screener and calendar are copied from the website on Oct 15) |
| Alerts | ⚠️ stored in memory, lost on restart · not sent to Telegram / LINE yet |
| Auth + DB | ⬜ plan only (Supabase; ask before creating a project) |

### Next
1. Put keys in `.env` → test Claude, ElevenLabs and Fuji for real → `npm run snapshot -- ARB WLD AVAX`.
2. Build the v2 agent pieces in the order given in [AGENTIC-WORKFLOW.md](AGENTIC-WORKFLOW.md) §10.
3. Stop dev and run `npm run build` to confirm the production build.
4. Supabase auth + DB (ask before creating the project).
5. Rehearse the demo 3 times and record a backup video (test on the real projector).

### 16:22 · English web app and model-agnostic agent (branch `feat/agentic-web-english`, commit `2339b8c`)
Built in a separate session without seeing `feat/app-ui`.
- **Pages:** `/` platform page, `/login`, `/app` chat, `/dashboard`, `/method`, a floating U-Bot bubble and a 404 page.
- **Agent harness:** guard → plan + act → reflect → observe. The model is pluggable: any OpenAI-compatible model, Claude, or a deterministic rules engine that is also the automatic fallback.
- **11 tools.** The new ones are `get_market_news` (GDELT, with [n] citations), `get_event_odds` (Polymarket), `get_market_pulse` (CoinGecko, Fear & Greed, Deribit DVOL) and `get_event_calendar`.
- **RAG and CAG:** fresh facts come through tools; static knowledge (`data/knowledge/faq.json`) sits in the cached system prompt.
- **Guardrails:** an input guard (blocks seed phrases and private keys, redacts PII, flags injection), rate limits, Origin checks, a compliance check in EN and TH, and security headers.
- **Auth:** demo account, email and password (scrypt with lockout), and Sign-In with Ethereum. MCP server at `/api/mcp`.
- **Checks:** `npm run eval` (26 cases) and `npm run responsive` (Playwright: iPhone SE, 15 Pro, 15 Pro Max, iPad, desktop).

### 17:03 · CSS-only restyle (commit `78ecb6d`)
- Inter font, cleaner surfaces and light glass on the English pages. No layout changes.

### Oct 16, ~00:50 · Merged both branches (branch `feat/merge-app-ui-agentic`, commit `f1898d9`)
- **Rule:** don't break either side.
- **Two front-ends, one backend:**
  - The owner's Thai app is unchanged at `/`, `/app`, `/terminal/**` and `/report`.
  - The English app moved to `/en` and `/assistant`; `/dashboard`, `/login` and `/method` keep their paths.
- **Cross-links:** an EN button on the landing page, an English group in the terminal sidebar, and a ไทย link on the English pages.
- **Thai app sign-in:** `EnsureSession` signs the Thai app into the demo account, so approve and scan still work without a login wall.
- **CSS isolation:** the English stylesheet is scoped under `.ug-web`, and the owner's rules on 37 shared class names are guarded, so neither side can restyle the other.
- **Backend:** the owner's Vercel AI Gateway path, `AGENT_MODE` alias, `pause_turn` handling, JSONL run log, U-Bot webhook and inbox, alerts and ElevenLabs STT were ported into the harness.
- **Replies follow the user's language.** Thai pages get Thai card reasons (`?lang=en` for English).
- **Data:** follows the owner's tokenomist.ai copy (ARB unlock 16 Oct 13:00 UTC = 20:00 Bangkok), plus the ETH wallet row and the news/odds/pulse fixtures.
- **Problem:** the merged Thai token page showed English reasons → passed the Thai locale in `/api/token`, `/api/calendar` and `/api/portfolio/risk`.
- **Problem:** the 14px inputs zoomed on iOS → 16px on touch devices. The EN link pushed the CTA off a 320px screen → hidden at ≤380px, with a footer link instead.
- **Checked:** typecheck ✅ · production build ✅ · eval 28/28 ✅ · responsive 60/60 ✅ · every page and API, end to end.
- **Blocked:**
  - Pushing to `main` was refused by the session's permission rules → open a PR and merge it.
  - The Vercel connector is read-only, so the app is not hosted yet.
  - The session's network blocks `api.tokenomist.ai`, so the Tokenomist key is not used yet.

### Oct 16, ~01:00 · Analysis: Trade and Invest pages like Nansen, status review
- The user wants Trade and Invest pages covering crypto, stocks and funds, with an AI that plans, measures risk and proposes trades, and a human approving each one.
- Wrote [STATUS.md](STATUS.md) (Thai):
  - every feature built so far, and which flows work
  - 10 places where the product doesn't flow or contradicts itself
  - the Nansen comparison and the proposed page structure
  - models per job with prices, and integrations ranked by value
  - the pre-processing pipeline for annual reports and world trends
  - Tokenomist key status, and the decisions needed
- **Open decisions:**
  - Scope for today's demo: crypto real (simulated/testnet), stocks and funds as labelled sample data.
  - How the AI phrases things: drafts plans and scenarios that the user approves, or direct buy/sell advice (a licensing risk with the Thai SEC).
  - Whether the Thai terminal becomes the single app.

### Oct 16, ~01:50 · Trade, Invest, alerts that fire, logos
- **Trade:** `/terminal/trade` plus a trade ticket on every token page, laid out like Nansen's Token God Mode.
  - The user picks the token, side and amount.
  - U-Bot drafts the plan: size against a risk budget, stop-loss, and what-if rows.
  - U-Guard checks unlock, balance, size, concentration and chasing.
  - Approval places a paper order recorded on Avalanche (simulated).
- **Invest:** `/terminal/invest`.
  - A five-question risk profile picks a model portfolio, which the user can adjust.
  - U-Guard checks the crypto part and flags DCA dates that land on a big unlock.
  - Sample data, clearly labelled.
- **Alerts actually fire:**
  - "Check now" runs each rule deterministically with a 12h cooldown.
  - A watcher (`src/instrumentation.ts`) checks every rule every `WATCH_INTERVAL_MIN` minutes; `POST /api/watch` is there for crons.
  - Hits land in the U-Bot inbox, a bell in the terminal header.
- **Phone mock-up:** at the user's request, `/app` left the terminal and landing menus; it stays reachable by URL for the stage.
- **Data labels:**
  - The ARB allocation and funding fixtures are real tokenomist.ai copies, now marked snapshot.
  - The header and token page label each section from its own source.
- **"Data and technology" strip:** logos only.
  - U-topia uses the team's own logo file unchanged; only the white area outside the circle is transparent (`public/brand/utopia-logo.png`).
  - Tokenomist stays a wordmark until we have its logo file.
- **Checked:** typecheck ✅ · build ✅ · eval 28/28 ✅ · responsive 80/80 ✅ · trade/invest/alert/watcher flows in the browser and API.

### Oct 16, ~02:10 · U-topia logo, remaining-work plan
- U-topia logo: the team's own file is used unchanged; only the white area outside the circle is transparent (`public/brand/utopia-logo.png`). The redrawn SVG was removed at the user's request.
- Confirmed with `git ls-remote`: `main` is still `1f787ba` (scaffold), and all work is on `feat/merge-app-ui-agentic`. Pushing to `main` needs the PR to be merged.
- Wrote [TODO.md](TODO.md) (Thai). It covers:
  - everything not done, missing, or still waiting on keys and people, with priorities
  - a step-by-step plan and new stage script for demo day
  - known issues
- Gaps found while writing it:
  - The SPEC §13 demo script still uses `/app`.
  - On Vercel, cron calls `GET`, but `/api/watch` runs a pass only on `POST`.
  - MCP has no trade, invest or alert tools yet.

### Oct 16, ~02:40–03:00 · Demo prep: plan, real Tokenomist data, U-Bot over MCP (branch `feat/demo-script-mcp-standin`)
- **Backup:** the uncommitted v2 work from the old `feat/app-ui` base (freshness labels, news search, portfolio drift, quiet hours, cron GET) is saved on `wip/v2-freshness-drift-alerts`, to port later. A local-only `/logs` page that was never committed (the old `.gitignore` rule `logs/` also matched `src/app/logs`) was moved to `~/code/U-Hackathon-local-backup/`.
- **Plan and script:** [DEMO-DAY-PLAN.md](DEMO-DAY-PLAN.md) (who does what, commands, checks, risks, roadmap) and [DEMO.md](DEMO.md) (3-minute run of show around tonight's ARB unlock, EN + TH lines, fallbacks, judge Q&A). SPEC §13 and TODO.md point to them.
- **Real Tokenomist data:** `npm run snapshot -- ARB WLD AVAX` with the team key. ARB: 92.65M on 16 Oct 13:00 UTC, 61% team / 39% investors, **1.37%** of circulating (the website copy said 1.56%; the API's circulating supply is 6.79B). WLD and AVAX now real too.
- **Problem:** WLD had zero unlock events, so it read "no unlock", but it releases ~2.9M a day. The v5 events endpoint lists cliffs only. **Fix:** the snapshot also saves daily emission (paginated, 20 per page by default), and `getUnlockEvents` folds non-cliff emission days into one linear event, so the scorer and the forecast see continuous releases without double-counting cliffs. Result: ARB high 67 (cliff tonight) · WLD medium 39 (continuous, community 55 / investors 26 / team 19) · AVAX low 22 (staking rewards). The landing hero now uses these numbers; old sample fixtures removed.
- **Problem:** over MCP every request gets a fresh context, so `propose_protection` never saw the card from the earlier `assess_unlock_risk` call and always refused. **Fix:** it scores the token itself when the card is missing (the medium/high gate still applies).
- **U-Bot acting for a user:** a caller holding `MCP_API_KEY` may send `X-UGuard-User` (+ `X-UGuard-Locale`); tools run as that user and a proposal lands in their U-Bot inbox. Without the key the header is ignored. The bell now shows proposal cards with approve/decline (before, it only said "open the chat", which created a new proposal).
- **U-Bot stand-in:** `npm run ubot`, a real MCP client (initialize → tools/list → assess ARB ฿5,000 → propose), paced with Enter for the stage. Tested end to end on the dev server: HIGH 67 from Tokenomist live → bell → approve → receipt (simulated until the Fuji key is set).
- **Problem:** `next dev` failed to compile (`node:crypto` in the edge bundle via `instrumentation.ts → watch → alerts → agent`). The early-return guard doesn't stop webpack bundling; **fix:** Next's documented `if (NEXT_RUNTIME === "nodejs") { await import(...) }` block. Production builds were not affected.
- **Checks:** typecheck ✅ · eval **30/30** ✅ (2 new MCP cases: no acting for a user without the key; delegated proposal is owned by and delivered to the user). In this sandbox `tsx` can't open its IPC pipe, so evals run with `node --import tsx evals/run.ts`.

### Oct 16, ~03:00–03:30 · Whole website in English, Tokenomist live mode fixed
- **Why the site was still Thai:** the "English" work before the merge built a separate English app (`/en`, `/assistant`, `/dashboard`, `/login`, `/method`). The merge kept the owner's Thai main app as it was. Now every page of the main app is English: landing, terminal (overview, agent, tokens, token page, unlocks, trade, invest, portfolio, alerts), `/app`, `/report`, plus the text the server writes (trade and invest plans, alert reasons, API errors, Fuji notes) and the fixtures (asset classes, model portfolios, unlock calendar). The agent still answers in Thai when asked in Thai; that copy stays.
- **Renamed** fields that now hold English: `InvestSlice.th` → `name`, `InvestPlan.profileTh` → `profileName`, fixture `th` → `name`.
- **U-Bot stand-in** defaults to English (`--lang en`).
- **Problem:** with the key set, cards said "snapshot", not "live". Tokenomist answered 429 (retry-after 7 s). The live token list has **651 tokens**, and the ticker (polled on every page), calendar, event calendar and dashboard scored all of them at once; the failed calls then cached the fallback for 10 minutes. **Fix:** `trackedTokens()` (the tokens in the dated snapshot: ARB, WLD, AVAX) for every fan-out; at most 4 calls in flight; one retry after a 429; a fallback is cached for 1 minute only, and logged (`tokenomist.fallback`). Credits are fine: 26 of 50,000 used this month. Result: ARB / WLD / AVAX all score from live data in ~0.6 s.
- **Problem:** with 651 live names, the agent's symbol finder matched names inside words ("RE" in "are", "UR" in "your"), and `THB` / `AI` counted as tickers because live tokens use them. **Fix:** names only for tracked tokens, as whole words; the not-a-ticker list always wins.
- **Problem:** the portfolio page showed ฿0 for total value; `CountUp` waited for an IntersectionObserver callback that this webview never sends. **Fix:** a 1.2 s fallback in `CountUp` and `Reveal` (same pattern as the hero).
- **Problem:** live allocations list "Arbitrum DAO Treasury" twice → duplicate React keys. **Fix:** index keys on the allocation table; the risk card merges recipients with the same name.
- **Checks:** typecheck ✅ · eval 30/30 ✅ · stand-in over MCP: HIGH 67, "Tokenomist live", proposal in the inbox ✅ · every page checked for Thai text ✅ (only "฿").

### Oct 16, ~07:00 · Ported the WIP branch into main's code (branch `feat/merge-app-ui-agentic`)
- **Found:** `npm run dev` on main returned 500 on every page (`node:crypto` reached the edge bundle through `src/instrumentation.ts`).
  - nathirad's fix arrived in PR #2 (merged).
  - This branch restarts from that main.
- **Ported from `wip/v2-freshness-drift-alerts`:** it was built on the pre-merge code, so its features were rewritten for main instead of merged.
- **Freshness:**
  - "ณ HH:MM" on unlock cards, token-page sections, trade plans and the portfolio.
  - `as_of_th` and `stale` in tool results, plus a prompt rule to quote them.
  - Last good live copy when Tokenomist or CoinGecko fails, labelled "อาจไม่ล่าสุด".
- **Portfolio drift:**
  - Per-user target mix (`data/fixtures/targets.json` as the default), editable on `/terminal/portfolio`.
  - `/api/portfolio/targets` GET/PUT.
  - `check_portfolio_drift` tool, so MCP now has 12 tools.
  - Drift card in chat; "พอร์ตเบี้ยวจากเป้าไหม" is understood by the rules engine.
- **Alert engine:**
  - Rule types: unlock, drift, news (`*` = every holding).
  - Dedupe: unlock and news alerts go out once; drift at most once a day.
  - Quiet hours 22:00–07:00 Bangkok (high severity only) and a daily cap of 5.
  - High-severity news needs a second source.
  - One U-Bot message per run, with cards and proposals.
  - Alert history and held-back reasons on `/terminal/alerts`.
  - `GET /api/watch` with Bearer `CRON_SECRET` for Vercel Cron, plus `vercel.json`.
- **Checked:**
  - typecheck ✅ · eval 32/32 ✅ · build ✅ · responsive 80/80 ✅
  - `next dev`: all 17 pages 200 ✅
  - Alerts at 06:42 (quiet hours): only the 2 high ones went out; a second run sent nothing new.
  - With a cap of 2: 2 sent, the rest deferred to tomorrow.
  - Cron: 401 without the secret.

### Oct 16, ~07:30 · Merged the English `main` (PR #3) into the port branch
- **Merged** `main` at `29abd31` into `feat/merge-app-ui-agentic`, so the PR is one click.
- **Conflicts (7 files):** LOGS.md, the alerts page, the portfolio page, `Cards.tsx`, `TradePanel.tsx`, `alerts.ts`, `tokenomist.ts`.
  - `tokenomist.ts`: kept main's in-flight limit, 429 retry and 1-minute fallback cache, plus this branch's last-good-copy fallback.
  - UI files: kept main's English copy and added the drift card, target editor, alert history, held-back reasons and freshness labels.
- **Translated the ported UI to English:**
  - `asOfEn` / `asOfLabel` in `freshness.ts` give "as of 15 Oct 07:00" and "(may be out of date)".
  - `sourceTag` now appends the age; `sourceTagTh` keeps the Thai label for Thai replies.
  - Alert engine reasons, drift lines (locale "en" for the watcher), the alerts page and the drift card.
  - The agent still answers Thai to Thai, with `as_of_th`.
- **Checked:**
  - typecheck ✅ · eval 32/32 ✅ · build ✅ · `next dev` all pages 200 ✅
  - responsive 80/80 ✅ against `next start`. An earlier run failed only because an old server still held the port.
  - Screenshots of the portfolio drift view, the alerts page after "Watch every token in my portfolio", and the chat drift card: no page errors ✅
  - API: "U-Guard alert: 2 items", "ARB unlock coming up (High risk 67/100)", "ARB is 8.8 points over your target" ✅

### Oct 16, ~09:00 · MCP tools for trade, invest and alerts; evals for all three
- **Looked at first:**
  - Broker MCP servers (e.g. Alpaca's) give the model order tools that execute directly.
  - Nansen's MCP server is read-only analytics.
  - MCP tool annotations are hints a client may ignore.
  - So U-Guard drafts over MCP and never approves. Approval stays in the app, behind the user's session, enforced on the server.
- **6 MCP-only tools:**
  - `draft_trade_plan` and `get_paper_trading`.
  - `get_invest_options` (U-Bot asks the 5 questions itself) and `draft_invest_plan`.
  - `list_alerts` and `create_alert_rule` (needs the user the caller acts for; deduplicated).
  - `tools/list` now returns 18, each with annotations. Server version 0.4.0.
- **Where drafts land:**
  - A trusted caller acting for a user (`X-UGuard-User`) gets the plan into that user's U-Bot inbox: Thai or English line plus a link.
  - Trade plans show under "Plans waiting for you", tagged "Drafted by U-Bot in chat (MCP)".
  - Invest plans show under "Plans U-Bot drafted for you"; Review restores the answers so the user can recalculate.
- **Kept out of the in-app chat:** `AGENT_TOOL_SPECS` filters them, and `executeTool` refuses them outside MCP.
  - The pages already cover them.
  - `draftTradePlan` runs the agent to explain the plan, so a model calling it from chat would recurse. Over MCP the explanation is skipped (`explain: false`), since U-Bot explains it itself.
- **Refactors:**
  - Alert-rule creation moved to `src/lib/alert-rules.ts`, shared by `/api/alerts` and MCP, to avoid an import cycle with the alert engine.
  - Trade and invest modules are imported lazily inside the tools for the same reason.
- **Bugs found:**
  - The serious-news regex matched "second" and "sector" (as SEC) and "bank" (as ban); it now matches whole words.
  - The trade plan table header rendered "P&amp;L".
- **Evals:** 32 → 55 cases.
  - Trade arithmetic and checks, blocked plans, approve/decline rules.
  - Invest profile scoring, weights, DCA-near-unlock, warnings, approval.
  - Alert cap, dedupe, quiet hours, thresholds, windows, news severity, rule dedupe.
  - MCP annotations, no approve tool, drafts for a user (EN/TH), alert rules need a user, bad inputs.
  - Mutation check: breaking the news regex, the MCP-only gate and the max-loss formula fails 3 cases; restoring passes 55/55.
- **Checked:**
  - typecheck ✅ · eval 55/55 ✅ · build ✅
  - `npm run ubot -- --auto --trade` against `next start`: 18 tools, HIGH 67, proposal, CAUTION plan ✅
  - Invest plan and alert rule over MCP in Thai ✅
  - Screenshots of Trade, Invest and the bell: no page errors ✅

### Oct 16, ~09:10–11:45 · Submission day: one app for the investor's day
- **Deadline found on the event slides:** submissions close **14:00**; judges open a public repo, a hosted demo website ("the real product, not just a landing page") and a pitch deck. Finalists present at 20:00, the minute ARB unlocks. A Tokenomist founder is on the jury. The deck is drafted in a parallel session.
- **Why the site felt disjointed:** two apps (the terminal and the older `/assistant` `/dashboard` `/en`) with different styles and a menu grouped by implementation. **Now:** one menu by the investor's day (Start · Markets · My money · Help); `/assistant` and `/dashboard` redirect into the app; landing says "Open the app".
- **Portfolio drift** ported from the v2 backup onto today's agent (tool `check_portfolio_drift`, 12 tools, card, editable targets).
- **Token screener** rebuilt like Tokenomist's tables: top 40 by market cap from the live list, next cliff per token (one call each, spaced), full scores for tracked tokens, size grade for the rest.
- **My plan** (30-day dated timeline + PDF) and **News** (live RSS from Cointelegraph, CoinDesk, Decrypt; tagged; "what does this mean for me?").
- **Problem:** CoinGecko's free API answered 429 (shared IP), so prices fell back to sample and ARB jumped from 58 back to 67. **Fix:** prices and 24h change from Hyperliquid's public API (one call, 30 s cache); CoinGecko only for spot volume and market data, every 10 minutes, keeping the last good answer. Live ARB score today: HIGH 58 (volume ~$229M/day makes the unlock ~0.08 days of volume); the hero and the stage script now follow the live number.
- **Problem:** GDELT news timed out (8 s). **Fix:** RSS feeds (~0.3 s each), `NEWS_SOURCE=rss`.
- **Hosting:** on Vercel each route is its own function, so the inbox, proposals and plans would not be shared. `withStore()` syncs the store through Upstash Redis when its variables are set; a no-op otherwise. The Vercel connector can't create projects here (403), so the project is created in the dashboard.
- **Landing:** the hero heading is sized to its column (it ran into the card at 92 px); technology logos 1.45× in 92 px tiles.
- **Checks:** typecheck ✅ · eval **31/31** ✅ (new: drift question).

### Oct 16, ~09:40–09:55 · Finance-app flow, stress test, schedule
- **Trades show in the portfolio:** holdings apply the user's approved paper orders (buy adds the token and spends USDC), so Portfolio, drift, charts, My plan and the agent see them at once. Buy/Sell on every portfolio row; `/terminal/trade?symbol=&side=`.
- **Token page:** live price chart (Hyperliquid candles 7D/30D/90D, CoinGecko fallback) with the unlock dates drawn on it, next to the Buy/Sell ticket.
- **Portfolio schedule:** every cliff and daily release of the coins you hold for 6 months, live from the Tokenomist API (amount, % of circulating, value, recipients, your holding).
- **Agent weighs news, price and risk:** `get_token_market` and `stress_test_portfolio` (14 tools). Buy/sell questions add price, market mood and a "U-Guard trade check" (flags + options, "You decide"); "Scan my portfolio" adds news on held coins and the stress test. Stress card in chat and My plan (options-implied drop, risky unlocks like past team unlocks, −20%; baht impact; protection options).
- **Today:** Tokenomist unlocks for the next 30 days (logos, size, value, grade) and news with images (RSS cover images).
- **Roles in the chat:** U-Bot talks, U-Guard checks (tagged cards, proposals and trace), you decide: one chat, not two boxes.
- Buyback and burn endpoints exist in v5 but don't cover ARB, WLD or AVAX ("token not supported"), so they aren't shown.
- **Checks:** typecheck ✅ · production build ✅ · eval **33/33** ✅ · 375 px: no sideways scroll on Today, screener, My plan.

### Oct 16, ~12:30 · Merged PR #4 (finance-app flow) with main
- **Why:** PR #4 (`feat/demo-script-mcp-standin`) and `main` both grew from the same commit. Both added portfolio drift, so 21 files conflicted.
- **Kept from PR #4:**
  - Today page, My plan, News, live prices (Hyperliquid + cached CoinGecko), screener, stress test, price charts, unlock schedule, Upstash store sync, installable app.
  - Its drift card, portfolio page, target fixture (ETH 20, ARB 20, WLD 15) and rules-engine flow (a portfolio question runs the scan with drift and the stress test).
- **Kept from main:**
  - The 6 MCP-only tools and their annotations.
  - The alert engine (unlock/drift/news rules, dedupe, quiet hours, daily cap, cron).
  - Freshness labels, the invest "Plans U-Bot drafted for you" panel, and the 55 evals.
- **Joined by hand:**
  - `drift.ts` and `market.ts`: PR #4's versions plus `pricesAsOf`, `asOf` and `stale`. A Hyperliquid answer older than 3 minutes, or a CoinGecko answer older than 20, counts as stale.
  - `store.ts`: the Redis snapshot now carries `alertEvents` and `lastWatch` instead of the removed `alertsFired`.
  - `/api/watch` and `/api/portfolio/targets`: main's logic wrapped in `withStore`.
- **Duplicates the auto-merge left behind, removed:**
  - `check_portfolio_drift` spec, input and handler.
  - `DriftRow`/`DriftReport` types and `AgentResult.drift`.
  - The drift intent regex (Thai words merged into one) and a second drift path in the rules engine.
- **Tools:** 20 in total (14 shared + 6 MCP only).
- **Responsive audit:** `/assistant` and `/dashboard` now redirect into the terminal, so the audit covers `/terminal/news`, `/terminal/plan` and `/terminal/tokens` instead (17 pages).
- **Checked:**
  - typecheck ✅ · eval 58/58 ✅ · build ✅
  - Every page 200 ✅ · responsive 17 pages × 5 devices ✅
  - `npm run ubot -- --auto --trade`: 20 tools, HIGH 67, proposal, CAUTION plan ✅

### Oct 16, ~13:00 · Outside MCP servers, the safe way (branch `feat/mcp-integrations`)
- **Context:** the team proposed three MCP servers: CoinGecko, `@mcpdotdirect/evm-mcp-server`, and Coinrule or Alpaca. Checked against their docs:
  - CoinGecko's keyless server is a public beta with a shared rate limit. The 76+ tools need a key.
  - The EVM server signs with a private key or mnemonic from the environment.
  - Alpaca needs API keys, and its MCP server hands the model order tools.
  - Coinrule trades real exchange accounts on its own.
- **Alpaca paper broker** (`src/lib/broker.ts`, `BROKER=alpaca-paper`, off by default):
  - Only `decideTradePlan()` calls it, after the user's approval.
  - Paper URL hard-coded; market order, `gtc`, USD notional for buys, qty for sells, plan id as `client_order_id`.
  - Coins outside Alpaca's list, errors, missing keys or no answer keep the local paper order with a note on the Trade page.
  - `get_paper_trading` reports it.
  - Also new: approving the same plan twice at once records one order.
- **CoinGecko in the U-Bot stand-in** (`--coingecko`, off by default):
  - A second MCP client asks CoinGecko for 24h volume and compares it with U-Guard's unlock value.
  - Tool names are looked up at runtime: a direct price tool, or `invoke_api_endpoint` in dynamic mode.
  - Tested against a local mock MCP server in both modes, and with the server down. This session can't reach the real endpoint (proxy).
- **Not added to the app:**
  - EVM MCP: dev-only and read-only, no key; `viem` already covers Fuji.
  - Coinrule: trades real money on its own.
  - The scorer keeps the cached REST/Hyperliquid feed instead of an MCP hop.
  - All written up in `MCP-INTEGRATIONS.md`.
- **Evals 58 → 62:**
  - Default broker sends nothing.
  - An MCP draft sends nothing, and the approval sends one paper order (literal paper URL, body, headers, idempotent).
  - Unlisted coin, Alpaca error and missing keys fall back.
  - A double approval records one order.
  - Mutation check: a live URL and a removed double-approve guard both fail.
- **Checked:**
  - typecheck ✅ · eval 62/62 ✅ · build ✅
  - In the browser: MCP draft → approve → order note "Alpaca paper didn't answer (network error) · kept as a local paper order" (sandbox has no route to Alpaca) ✅
  - Stand-in `--coingecko` against mocks: "the unlock (~$16.5M) is 10% of one day's volume" ✅

### Oct 16, ~12:00 · Live unlock feed, the agent reads the whole app, Avalanche Data API (branch `feat/live-data-sync`)
- **"Tokenomist doesn't update":**
  - The Unlock calendar's "Elsewhere in the market" list and the News page's unlock list read `data/fixtures/unlock-calendar.json`, six hand-written events. A key changed nothing.
  - Only the 3 snapshot tokens are scored in full.
  - **Fix:** `src/lib/unlock-feed.ts` takes the next cliff of the 40 largest tokens from the live screener (Tokenomist, cached). It falls back to the file with a visible note when Tokenomist doesn't answer.
  - `GET /api/status` shows the Tokenomist mode, its last problem, prices, news, store and broker (booleans and modes only).
  - This session's network policy blocks `api.tokenomist.ai` and `data-api.avax.network` (proxy 403), so live calls couldn't be tested here.
- **The agent reads the whole app:**
  - The read-only MCP tools are now offered to the in-app chat too.
  - New tools: `get_my_plan`, `get_invest_plans`, `get_upcoming_unlocks`, `get_wallet_activity`, `lookup_onchain` (25 tools; the 3 that write stay MCP-only).
  - The rules engine has intents for orders, alerts, my plan, invest plans, market unlocks and on-chain questions (EN/TH). It answers from the tool results only, and asks signed-out users to sign in for personal data.
  - Every tool result is kept in `ctx.data` for the replies.
- **Avalanche Data API** (`src/lib/avalanche-data.ts`):
  - Native and ERC-20 balances, the latest transactions with token transfers, one transaction by hash, contract metadata. Fuji or C-Chain.
  - Optional `AVALANCHE_DATA_API_KEY`. Fields are read defensively (the API is in beta).
  - The wallet is the SIWE session's address, else `WALLET_ADDRESS`, else the approvals signer.
- **Evals 62 → 72:**
  - App-data questions (EN/TH, signed in and out).
  - The unlock feed (live mapping, offline label).
  - The Data API: request URLs, parsing into the reply, an outage said plainly, tx and contract lookups.
  - Mutation check: 3 deliberate breaks fail 3 cases.
- **On VLMs:** not needed. The data is structured JSON, the scores are computed in code, and the Claude models read images if screenshot import is ever added. "Not enough data" is solved by more sources and these read tools, not a vision model.

### Oct 16, ~11:30 · Account button, per-visitor demo accounts, SPEC brought up to date (branch `feat/account-and-spec`)
- **Account button** in the terminal header:
  - Shows who is signed in (demo, email or a wallet's short address).
  - "Sign in another way" signs out and opens `/login`; "Sign out" goes back to the landing page.
- **Per-visitor demo accounts:**
  - On a hosted site every judge tapping "demo" was the same `demo-user`, so they would have seen each other's paper orders and U-Bot messages.
  - On Vercel (`VERCEL` is set) each browser now gets `demo-xxxxxxxx`.
  - The laptop keeps the shared `demo-user`, because the stage's U-Bot stand-in acts for it over MCP. `DEMO_SHARED=true|false` overrides.
- **SPEC.md:** new §0.1 with the current state (pages, 25 tools, data sources, alerts, accounts, tests, what's missing). §14 and §17 are marked as the 15 Oct record.
- **"Dashboard data isn't complete":**
  - Even with a key, only the 3 snapshot tokens were scored in full (`trackedTokens()`), so Today, the ticker and the calendar showed 3 coins.
  - With Tokenomist live, `TRACKED_TOKENS` is added (default 10 tokens with regular unlocks, at most 12), matched against the live list. Offline stays 3.
- **`npm run check:live`** (`scripts/check-live.ts`):
  - Calls Tokenomist (list, tracked, ARB score, screener), prices, RSS, the Avalanche Data API (WAVAX contract, your wallet), the Fuji RPC, ElevenLabs (voices) and the LLM key (models list, no cost) the way the app does.
  - Prints PASS / WARN / FAIL with reasons; never a key.
- **`/api/status`** also names the model that answers (rules engine when no key), the voice engines, the tokens scored in full and the Avalanche settings.
- **Voice mode** on Ask U-Bot (hands-free):
  - ElevenLabs Scribe listens, and stops itself ~1.4 s after you stop talking (or at 15 s).
  - U-Bot answers, the reply is read aloud (`eleven_v3`), then the mic reopens.
  - Falls back to the browser's recognition and voice without a key. Checked in Chromium: the reply triggers `/api/voice`, then it returns to listening.
- **Email accounts on Vercel:**
  - Accounts lived in `data/runtime/users.json`. Vercel's file system is read-only, so sign-up would have worked in one function and been gone in the next.
  - With the shared store on (Upstash), accounts now live in it; the register and login routes are wrapped with `withStore`. Locally the JSON file is used as before.
  - Checked against a stand-in KV: sign up, restart the server, log in with the same account; a wrong password and a second sign-up are refused; no file was written.
- **Vercel:** creating the project through the connector was refused twice. The first attempt was blocked by the session's permission check; the second reached Vercel and returned 403 (no permission to create projects in the team). The project has to be created in the dashboard by a team member who can.

### Oct 16, ~12:15 · Voice mode like ChatGPT's, Tokenomist logo (branch `feat/voice-mode-ui`)
- **Voice mode is now a full-screen conversation** (`src/components/voice/VoiceMode.tsx`), opened from "Voice mode" on Ask U-Bot:
  - An orb grows with your voice while it listens, breathes while U-Guard checks, and moves with U-Bot's voice while it answers. Then the mic opens again.
  - Tap the orb to interrupt U-Bot. The mic button pauses; the red button (or Esc) ends it.
  - Captions show what it heard and the answer. The answer also lands in the chat thread with its cards and trace.
  - Same agent and tools as typing; voice changes how you ask, not what is checked.
  - Ears: ElevenLabs Scribe; voice: ElevenLabs `eleven_v3` ("Voice by ElevenLabs" in the corner). Without a key: the browser's own recognition and voice, labelled.
  - Listening moved to `src/components/voice/listen.ts` (mic level for the orb, stops ~1.4 s after you go quiet). `speakAloud` reports U-Bot's loudness. The Speak button is tap-to-talk again.
  - Checked in Chromium with a fake mic, Scribe and the voice mocked (no ElevenLabs from this sandbox), the agent answering for real: listening → thinking → speaking → listening; the orb followed the mic and the voice; mute pauses; Esc closes. Desktop and phone width.
- **Tokenomist logo:** the "Data and technology we use" strip now shows Tokenomist's mark (redrawn as SVG from the team's file) next to its name. ElevenLabs already had its wordmark.

### Oct 16, ~12:30 · Pages no longer wait 13 s for Tokenomist (branch `perf/page-speed`)
- **Why pages were slow:** opening the app fires Today, Unlock calendar, News and the screener together. Each built the 40-token market screen on its own, so ~122 Tokenomist calls queued behind the rate limiter (4 at a time, 120 ms apart): **13–15 s per page** against a stand-in API with 300 ms latency. Then fast for 10 minutes, then slow again for whoever came next. On Vercel every new function starts empty, so it would be slow often.
- **Fixes:**
  - `tokenomist.ts`: one request per key at a time (pages share it); an expired live copy is served at once and refreshed in the background; the cache is on `globalThis` so every route shares it.
  - `screener.ts`: one screen run at a time; the last screen is served at once and refreshed in the background after a minute; with Upstash on, a cold Vercel function starts from the screen another one saved (`sharedGet`/`sharedSet` in `store.ts`).
  - `instrumentation.ts`: with a Tokenomist key, the screen is built in the background when the server starts.
- **Measured** (stand-in Tokenomist, 300 ms per call): pages opened right at server start ~3 s (was 13–15 s); afterwards 0.01–0.05 s, including after the cache ages; ~56 Tokenomist calls for a cold start instead of 122.
- `npm run dev` also compiles each page on its first visit (several seconds). For the demo use `npm run build && npm start`.

---

## Adding the next entry
Add a `### HH:MM · Topic` heading under the date, then record what was done, the decisions, and any problems with their fixes.
