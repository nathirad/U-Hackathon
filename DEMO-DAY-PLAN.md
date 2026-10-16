# Demo-day plan · Fri 16 Oct 2026

What has to happen before the stage demo this afternoon, who does it, how, and how we know it worked. After that, the post-hackathon roadmap.
Status of everything already built: [STATUS.md](STATUS.md). Full backlog: [TODO.md](TODO.md).

> Written 02:40 Bangkok time. ARB unlocks **92.65M tonight at 20:00 Bangkok (13:00 UTC)**, after the demo, so the card on stage reads "unlocks today, in ~X hours".

---

## 0. The story we are proving

**"U-Bot is about to move your money. U-Guard checks first."**
ARB unlocks 92.65M tonight (team + investors, 1.56% of circulating) → U-Guard scores it **high** → proposes a protection rule → **you approve** → the approval is recorded on **Avalanche**. U-Bot reaches U-Guard through **MCP**, so any U-Bot skill can call this check before a swap.

| Judging criterion | Weight | Estimate now | After this plan | What moves it |
|---|---|---|---|---|
| App execution | 40% | ~26–30 | ~33–35 | Real keys (LLM, voice, Fuji), live MCP call, rehearsed run |
| Practicality | 40% | ~28–31 | ~32–34 | One real case (ARB tonight), real Tokenomist data, compliance story |
| Usability & design | 10% | ~7 | ~8 | One chat entry on stage, projector check |
| Innovation & ecosystem | 5% | ~3 | ~4 | All three sponsors live: Tokenomist, ElevenLabs, Avalanche |
| U-Bot integration | 5% | ~1–2 | ~3 | U-Bot stand-in calls U-Guard over MCP, proposal lands in the user's inbox |

---

## 1. Timeline (Bangkok time)

| When | Who | Phase |
|---|---|---|
| 02:40 – 05:00 | Claude | **B** live MCP demo · **C** demo script (branch `feat/demo-script-mcp-standin`, PR to `main`) |
| 09:00 – 10:00 | You | **A** keys and config · **F** questions for mentors (booths open at 10:00) |
| 10:00 – 11:30 | You + Claude | **D** test everything with real keys, production build |
| 11:30 – 13:00 | Team | **E** rehearse 3×, record backup video |
| 13:00 | Team | **Code freeze.** Only `.env` changes after this |
| Afternoon | Team | Stage demo (3 min) |
| 20:00 | – | ARB unlock (after the demo) |

---

## 2. Phase A · Keys and config (you, ~60 min)

Put everything in `.env` on the **demo laptop** only. Never commit `.env`.

| # | Step | How | Done when |
|---|---|---|---|
| A1 | **LLM (Gemini)** | Get a key at Google AI Studio. In `.env`: `AGENT_PROVIDER=openai` · `LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai` · `LLM_API_KEY=…` · `LLM_MODEL=gemini-3.5-flash` (confirm the exact id in AI Studio's model list) · `LLM_LABEL=Gemini` | In `/terminal/agent`, "ซื้อ ARB 5,000 บาท" answers in Thai and the Agent Trace shows `Gemini · gemini-3.5-flash`, not "rules" |
| A2 | **ElevenLabs** | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` (a Thai-capable voice), `ELEVENLABS_MODEL_ID=eleven_v3` | "ฟังสรุป" plays the ElevenLabs voice; the mic button transcribes a Thai question |
| A3 | **Avalanche Fuji** | Create a **new** wallet used only for this (never a mainnet key). Get test AVAX from the Fuji faucet. `DEMO_PRIVATE_KEY=…` · `WALLET_ADDRESS=…` | Approving a proposal shows a receipt link that opens on the Fuji explorer |
| A4 | **Secrets** | Run `openssl rand -base64 32` four times for `AUTH_SECRET`, `MCP_API_KEY`, `UBOT_API_KEY`, `CRON_SECRET` | `npm start` boots (it refuses without `AUTH_SECRET`) |
| A5 | **Tokenomist snapshot** | `npm run snapshot -- ARB WLD AVAX` on your own machine (this session's network can't reach the API) · check ARB's unlock is 13:00 UTC · commit `data/fixtures/tokenomist/` | Token pages show "live/snapshot" with today's date; WLD/AVAX no longer say "sample" |
| A6 | Live prices (optional) | `MARKET_SOURCE=live` (CoinGecko) | Prices change on refresh; if rate-limited, go back to the fixture (it is labelled) |
| A7 | Stage settings | `WATCH_INTERVAL_MIN=1` · leave `DEMO_NOW` **unset** | The bell picks up an alert within a minute |

---

## 3. Phase B · Live MCP demo, U-Bot stand-in (Claude, now)

The gap today: an MCP caller acts as an anonymous client, so a proposal it creates belongs to nobody and can't be approved. Fix it the way a real U-Bot integration would work, then show it.

| # | Step | How | Done when |
|---|---|---|---|
| B1 | **Act for a user** | `/api/mcp` accepts `X-UGuard-User: <userId>` **only** when the caller presents a valid `MCP_API_KEY` (server-to-server trust, like U-Bot). Without the key the header is ignored. Optional `X-UGuard-Locale: th` | A delegated `propose_protection` is owned by `demo-user` |
| B2 | **Deliver to the user** | After a delegated tool call that produces a risk card or a proposal, push a U-Bot message into that user's inbox | The bell in the Thai app shows the card and the proposal; "อนุมัติ" works and returns a receipt |
| B3 | **Stand-in client** | `scripts/ubot-standin.mjs` (`npm run ubot`): a real MCP client (`@modelcontextprotocol/sdk`, Streamable HTTP) that does `initialize` → `tools/list` → `assess_unlock_risk ARB 5000` → `propose_protection ARB pause_buying`, printing each request and reply. Press Enter between steps to pace it on stage | Run against the laptop server: 25 tools listed, ARB high, proposal id printed |
| B4 | Checks | Typecheck, `npm run eval` stays green, plus cases: header ignored without key; with key the proposal belongs to the user | All pass |
| B5 | Docs | README "How the agent works" + `/method` copy mention delegation | – |

---

## 4. Phase C · Demo script (Claude, now)

| # | Step | Done when |
|---|---|---|
| C1 | Write **[DEMO.md](DEMO.md)**: 3-minute run of show with exact clicks, what to type, what to say, time per beat, and a fallback for every beat | A teammate who hasn't seen the app can run it |
| C2 | Judge Q&A: why simulated/paper, which data is live vs snapshot, why we don't say "buy", how U-Bot connects for real, cost and model choice | Answers fit in 1–2 sentences each |
| C3 | Pre-stage checklist (tabs, env, clock, no restart, hotspot, charger) | Checklist printed/pinned |
| C4 | Point SPEC §13 to DEMO.md; fix stale lines in TODO.md (the PR is already merged) | – |

---

## 5. Phase D · Test with real keys (you + Claude, ~90 min)

| # | Step | How | Done when |
|---|---|---|---|
| D1 | Static checks | `npm run typecheck && npm run eval` | 0 errors · eval all green |
| D2 | Production build | Stop `npm run dev` first (never build while dev runs) · `npm run build` · `npm start` with `.env` loaded | Server up on :3000 |
| D3 | Walk the stage flow | Follow DEMO.md end to end with keys | Every beat works without falling back |
| D4 | MCP stand-in | `MCP_API_KEY=… npm run ubot` against :3000 | Proposal appears in the bell, approve → Fuji receipt |
| D5 | Voice | Speaker + mic in the room | Thai voice audible; mic picks up a Thai question |
| D6 | Projector | Mirror at 1280 and 1920 wide | Cards readable from the back; nothing cut off |
| D7 | Fallbacks | Turn Wi-Fi off once | App still runs on labelled fixtures + rules engine; nothing crashes |

---

## 6. Phase E · Rehearse and back up (team, ~90 min)

| # | Step | Done when |
|---|---|---|
| E1 | 3 timed runs | Each ≤ 3:00, no dead air |
| E2 | Record a backup video of a clean run | Saved on the laptop and a phone |
| E3 | Code freeze at 13:00 | No commits after this; `.env` only |
| E4 | Pre-stage checklist ([DEMO.md](DEMO.md)) | All ticked 10 minutes before going on |

**Rules on stage:** never restart the server (proposals, alerts and the inbox live in memory) · don't set `DEMO_NOW` · read times off the card, don't recite them.

---

## 7. Phase F · Ask mentors (you, at the booths)

| Who | Ask | Why |
|---|---|---|
| U-topia (Maya Nicks, Chief A.I. Officer) | Can U-Bot call an external skill or MCP server? How does it pass the user's identity? How does an approval (VIC) come back? | There is no public U-Bot console or API; this is the only way to the 5% U-Bot score and a real integration |
| U-topia | Which coins and chains does the app support at launch? Thailand availability? | Practicality story |
| Tokenomist booth | Logo file; a hackathon key with forward unlocks; surprise bounty | Logo strip, real data |
| ElevenLabs / Avalanche booths | Surprise bounty criteria | Ecosystem points |

---

## 8. Risks and fallbacks

| If this fails on stage | Fallback (already built) | What to say |
|---|---|---|
| Wi-Fi | Labelled fixtures + rules engine | "Offline mode: same tools, same checks, labelled sample data" |
| LLM error or slow | Automatic fallback to the rules engine (note in the trace) | "The safety check never depends on one model" |
| ElevenLabs | Browser Thai voice | – |
| Fuji | Simulated receipt (labelled) | "On testnet this writes the receipt; here it's simulated" |
| MCP stand-in | Show the same call in the backup video | – |
| Server restarted | Re-run the pre-stage setup (alert rule, one question) | – |
| Clock past 20:00 | Card switches to "just unlocked" | Talk about the next monthly unlock (16 Nov) |

---

## 9. After the hackathon (roadmap)

Ordered by value. None of this is needed for today.

| # | Work | How |
|---|---|---|
| 1 | **Persistent database** | Postgres/Supabase with row-level security for users, proposals, rules, inbox, snapshots (everything is in memory today) |
| 2 | **Real portfolio sync** | Read the signed-in wallet (SIWE already gives the address) via RPC/indexer on Avalanche, BNB Chain (UCOIN) and Arbitrum · price history from CoinGecko · transaction history for cost basis and P&L · scheduled snapshots · "as of HH:MM" on every number |
| 3 | **Price chart** on the token page | CoinGecko `market_chart`/OHLC, cached with a TTL |
| 4 | **Measure what we claim** | (a) LLM eval mode: golden questions per model with a rubric (number fidelity, citations, freshness, no advice), judged by a second model + human spot checks · (b) risk-score backtest: past unlocks vs forward returns by score bucket · (c) alert precision, lead time, false alarms · (d) metrics dashboard from the run log and 👍/👎 |
| 5 | **Real U-Bot integration** | Once U-topia shares the spec: delegated user tokens instead of a header, a signed approval callback, separate inbound/outbound secrets, HMAC + timestamp on the webhook, idempotency keys |
| 6 | Port from `wip/v2-freshness-drift-alerts` | Portfolio drift vs the user's own targets, quiet hours + daily cap, single-source news check, Vercel Cron via GET |
| 7 | Subagents + morning brief | A cheap model triages news and trends; a daily 08:00 brief in Thai with voice |
| 8 | Vision input | Gemini reads a screenshot of a portfolio or chart; the user confirms every number |
| 9 | One app, two languages | Merge the Thai terminal and the English app; one chat entry; one approvals page |
| 10 | Compliance and quality | Legal review of disclaimers and plans (Thai SEC), PDPA, security review of new endpoints, CI (typecheck, eval, build) |
