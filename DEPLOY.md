# Deploy U-Guard as an app

U-Guard is a Next.js app that installs to a phone's home screen (web app manifest, icons, standalone window). One deploy gives you the website, the installable app and the MCP endpoint U-Bot calls.

**Live:** https://u-hackathon-nine.vercel.app (Vercel project `u-hackathon`, production branch `main`). Checked 16 Oct, 22:14: every page in §3 loads, Tokenomist is live (651 tokens), `/api/mcp` is on and the U-Bot stand-in delivers to `demo-user`'s bell. Not done yet: Upstash (§1 step 4), so the inbox and approvals can still be lost between functions.

Checked on `release/app-integration`: typecheck ✅ · evals 74/74 ✅ · `next build` ✅ · the data files (demo wallet, Tokenomist snapshots) are bundled into every server function (`outputFileTracingIncludes`).

---

## 1 · Vercel (about 10 minutes)

1. **vercel.com/new** → *Import Git Repository* → `nathirad/U-Hackathon`. Framework: Next.js (detected). Root: `./`.
2. **Production branch:** `main` (Settings → Git).
3. **Environment variables** (Settings → Environment Variables, Production + Preview). Save the keys and secrets as **Sensitive**, then check each one shows in the list: a variable typed but not saved is the usual reason a redeploy still shows snapshots or `MCP is disabled`.

| Variable | Value | Needed for |
|---|---|---|
| `AUTH_SECRET` | `openssl rand -base64 32` | **Required.** Without it, demo login and every signed-in page fail in production |
| `TOKENOMIST_API_KEY` | team key (from `.env`) | Live unlock data; without it, labelled snapshots |
| `MCP_API_KEY` | from `.env` (the same value `npm run ubot` uses) | U-Bot over MCP; `/api/mcp` is off in production without it |
| `MARKET_SOURCE` | `live` | Live prices (Hyperliquid + CoinGecko) |
| `NEWS_SOURCE` | `rss` | Live headlines (Cointelegraph, CoinDesk, Decrypt) |
| `DEMO_SHARED` | `true` for the stage, else leave unset | `true` = every "demo" tap is the same `demo-user`, so U-Bot's MCP proposals reach the bell you're looking at |
| `CRON_SECRET` | any random string | Lets Vercel Cron run the alert watcher (`vercel.json`, daily on Hobby) |
| `ELEVENLABS_API_KEY` | optional | Real Thai voice (the browser voice is the fallback) |
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` or `ANTHROPIC_API_KEY` | optional | Natural replies (the rules engine is the fallback) |
| `DEMO_PRIVATE_KEY` | optional, **Fuji testnet only** | Real approval receipts on Avalanche (otherwise "simulated") |
| `UBOT_API_KEY` | optional | Inbound `/api/ubot/webhook` |

4. **Storage → Create → Upstash for Redis (free) → Connect to project.** This adds `KV_REST_API_URL` / `KV_REST_API_TOKEN`. On Vercel every route is its own function; with Redis connected, `withStore()` shares the U-Bot inbox, proposals, plans, alert rules and email accounts between them. Without it, pages work but approvals and the inbox can be lost between requests.
5. **Deploy** (or *Redeploy* after changing variables; variables apply to new deployments only).
6. Use the **Production** domain (Overview → Domains). Vercel gives `<project>.vercel.app` only when the name is free: ours is `u-hackathon-nine.vercel.app` because `u-hackathon.vercel.app` belongs to another team. The `…-nathirad.vercel.app` and preview URLs sit behind Vercel login under the default Deployment Protection, so don't share those.
7. **Check:** `/api/status` shows `"tokenomist":{"keySet":true,"mode":"live"…}`, and `/api/mcp` answers `401 Invalid MCP token` to a request without a token (`503 MCP is disabled` means `MCP_API_KEY` didn't reach this deploy).

## 2 · Install it as an app

- **iPhone (Safari):** open the URL → Share → **Add to Home Screen**. Opens full screen on the Today page.
- **Android (Chrome):** menu → **Install app**. Shortcuts: Ask U-Bot, My portfolio, Alerts.
- **Desktop (Chrome / Edge):** the install icon in the address bar.

## 3 · Smoke test after each deploy (3 minutes)

| Open | Expect |
|---|---|
| `/` | Landing; hero scores load (ARB/WLD/AVAX) |
| `/terminal` | Today: unlocks in the next 30 days with countdowns, news with images, "Coming up for your money" |
| `/terminal/tokens` | Screener rows with live prices; "30 days" filter shows the large unlocks |
| `/terminal/tokens/ARB` | Price chart with the unlock marked, risk card, Buy/Sell ticket |
| `/terminal/portfolio` | Total value (not ฿0), drift card, 6-month unlock schedule |
| `/terminal/plan` | Dated timeline, stress test, "Save plan as PDF" |
| `/terminal/agent` | "Should I buy 5,000 THB of ARB now?" → trade check with options |
| `/terminal/voice` | Voice assistant page: talk to U-Bot by voice (Thai or English) |
| `/manifest.webmanifest` | JSON with name "U-Guard" |

U-Bot over MCP against the hosted app (needs the same `MCP_API_KEY` locally):

```bash
npm run ubot -- --auto --url https://<your-domain>/api/mcp
```

Expect `u-guard 0.4.0`, 25 tools, an ARB risk card marked "data: Tokenomist live" (HIGH before the 16 Oct unlock, MEDIUM 50/100 after it), and "Delivered to demo-user's U-Bot inbox". The bell then shows the proposal (with `DEMO_SHARED=true`; connect Upstash so it survives between functions).

## 4 · Known limits

- **Hobby: at most 12 functions per deployment.** Vercel groups our ~40 routes into about 5 functions only while each stays under its size budget. `outputFileTracingExcludes` in `next.config.mjs` keeps the restored build cache (`.next/cache`, ~350 MB) and the docs out of every function; without it the deploy fails with `exceeded_serverless_functions_per_deployment`.
- **No env vars = broken sign-in.** A deploy without `AUTH_SECRET` builds fine, but every request that signs or reads a session throws (demo login, the terminal pages); set the variables in §1 before the first deploy.

- **Tokenomist rate limit:** one key shared by every server. Fallbacks are labelled saved data and kept 5 minutes; run only one `next dev` per folder locally.
- **Vercel Hobby cron runs once a day.** Alerts also run on "Check now" (Alerts page). A long-running server (`npm start`) checks every `WATCH_INTERVAL_MIN`.
- **Paper trading only.** Orders are simulated; `BROKER=alpaca-paper` sends approved orders to an Alpaca paper account.
- **Information, not investment advice.** The compliance check blocks buy/sell advice in every reply.

## 5 · Laptop fallback (no hosting)

```bash
npm run build && npm start
```

Everything runs on one server: the shared store isn't needed, and the watcher runs every `WATCH_INTERVAL_MIN` minutes.
