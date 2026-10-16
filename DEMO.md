# Stage demo · 3 minutes

**Story:** U-Bot is about to move your money. U-Guard checks first.
**Today's real case:** 92.65M ARB unlocks **at 20:00 Bangkok** (13:00 UTC), 61% to the team and 39% to investors. Data: Tokenomist API (live, with a saved snapshot as fallback). **Finalists present at 20:00: the unlock happens while we are on stage.**
**Scores are live:** they move with live prices and trading volume (ARB was HIGH 58 this morning; 67 on the overnight snapshot). Say the number on screen, not a memorised one.
**Language:** the app UI is English. Ask in Thai and the agent replies in Thai (voice too).

Plan for the whole day (keys, tests, rehearsal): [DEMO-DAY-PLAN.md](DEMO-DAY-PLAN.md).

---

## Before going on stage (10 minutes before)

```bash
npm run build            # only if the code changed since the last build; never while `npm run dev` runs
npm start                # .env loaded: LLM, ElevenLabs, Fuji, AUTH_SECRET, MCP_API_KEY, TOKENOMIST_API_KEY
```

Open these, left to right, then don't touch the server again:

| Tab / window | What |
|---|---|
| 1 | `http://localhost:3000/` landing |
| 2 | Terminal window in the repo folder with `npm run ubot` typed (not run yet) |
| 3 | `http://localhost:3000/terminal` (Today; the bell is top right) |
| 4 | `http://localhost:3000/terminal/tokens` (Token screener) |
| 5 | `http://localhost:3000/terminal/plan` (My plan) |
| 6 | `http://localhost:3000/terminal/agent` |

Checklist:
- [ ] `DEMO_NOW` is **not** set (real clock)
- [ ] Warm the data: open tab 4 once and run `npm run ubot -- --auto` once; both should say "Live data" / "Tokenomist live" (Tokenomist rate-limits bursts; the app then shows the saved snapshot, labelled)
- [ ] The server was started fresh before the session (clean inbox), and is **not** restarted after
- [ ] Speaker volume up, mic allowed in the browser
- [ ] Phone hotspot ready if the venue Wi-Fi drops
- [ ] Backup video open in another window
- [ ] Projector mirrored; browser zoom 110–125% so cards read from the back

---

## Run of show

### 1 · Hook (0:00 – 0:25) · tab 1, landing
**Do:** let the hero animation play; point at the ARB bar reaching the scan line.
**Say (EN):** "Tonight at eight, 92 million ARB unlock, mostly to the team and investors. Most people buying ARB in an app today won't know."
**พูด (TH):** "คืนนี้สองทุ่ม ARB จะปลดล็อก 92 ล้านเหรียญ ส่วนใหญ่ไปที่ทีมและนักลงทุน คนที่กดซื้อในแอปวันนี้ส่วนใหญ่ไม่รู้เลย"

### 2 · U-Bot asks U-Guard over MCP (0:25 – 1:05) · window 2
**Do:** run `npm run ubot`, press Enter four times.
1. Connect → `u-guard 0.4.0`
2. `tools/list` → 25 tools
3. `assess_unlock_risk ARB ฿5,000` → **HIGH** (live score), three reasons, "data: Tokenomist live"
4. `propose_protection` → proposal "Pause auto-buys of ARB through the unlock window", "Delivered to demo-user's U-Bot inbox"
5. *(optional, only with `npm run ubot -- --trade`)* `draft_trade_plan ARB ฿5,000` → **CAUTION**, "Unlock coming up · High risk 67/100", "Portfolio would lean on ARB"; the plan waits on the Trade page. Skip it if time is short.

**Say (EN):** "The user asks U-Bot to buy five thousand baht of ARB. Before any money moves, U-Bot calls U-Guard over MCP, the open standard agents use for tools. U-Guard scores the unlock high, from live Tokenomist data, and proposes a rule. It doesn't act on its own."
**พูด (TH):** "ผู้ใช้สั่ง U-Bot ซื้อ ARB ห้าพันบาท ก่อนเงินขยับ U-Bot ถาม U-Guard ผ่าน MCP ได้ระดับเสี่ยงสูงจากข้อมูล Tokenomist สด และเสนอกฎป้องกัน แต่ไม่ทำเองเด็ดขาด"

### 3 · The user decides (1:05 – 1:35) · tab 3, terminal
**Do:** click the bell → "U-BOT ALERT" with the ARB card → **Listen** (voice) → **Approve** → receipt link.
**Say (EN):** "The user sees it in plain words, can listen to it, and approves. The approval is written to Avalanche, so it can't be changed later."
**พูด (TH):** "ผู้ใช้เห็นเป็นภาษาง่ายๆ ฟังเป็นเสียงได้ แล้วกดอนุมัติเอง การอนุมัติถูกบันทึกบน Avalanche แก้ย้อนหลังไม่ได้"

### 4 · The market and my month (1:35 – 2:10) · tabs 4 and 5
**Do:** tab 4, Token screener → press **30 days**: the large unlocks light up (ARB, HYPE, CRO…) with dates, size and who receives them. Then tab 5, **My plan**: today's ARB unlock, WLD's daily release, the Fed on Oct 28, drift from the target mix → **Save plan as PDF**.
**Say (EN):** "This is Tokenomist's live data for the top forty tokens, with dates and who gets the tokens. And this is the user's next thirty days: every date that can move their money, what U-Guard found, and what they can do. It saves as a PDF."
**พูด (TH):** "นี่คือข้อมูลสดจาก Tokenomist ของ 40 เหรียญใหญ่ มีวันที่ ขนาด และใครได้รับ และนี่คือแผน 30 วันของผู้ใช้ ทุกวันที่กระทบเงินของเขา พร้อมสิ่งที่ทำได้ และบันทึกเป็น PDF ได้"

### 5 · Ask anything, see how it decided (2:10 – 2:40) · tab 5, agent
**Do:** press the mic, ask **"Is AVAX worrying?"** (or **"AVAX น่ากังวลไหม"** to show the Thai reply and Thai voice). Point at the answer, then the **Agent Trace**.
**Say (EN):** "AVAX is low: a small release, mostly staking rewards. It stays calm when it's safe. Every number comes from a tool call you can see here, and a compliance check blocks any buy-or-sell advice."
**พูด (TH):** "AVAX เสี่ยงต่ำ ปลดล็อกน้อยและส่วนใหญ่เป็นรางวัล staking ระบบไม่เตือนพร่ำเพรื่อ ทุกตัวเลขมาจาก tool ที่เห็นตรงนี้ และมีตัวตรวจไม่ให้แนะนำซื้อขาย"

### 6 · Close (2:40 – 3:00)
**Say (EN):** "U-Guard is the safety check U-Bot calls before money moves. Tokenomist for supply, ElevenLabs for Thai voice, Avalanche for the receipt. Information, not advice: the user always decides."
**พูด (TH):** "U-Guard คือด่านตรวจที่ U-Bot เรียกก่อนเงินขยับ ข้อมูลจาก Tokenomist เสียงไทยจาก ElevenLabs หลักฐานบน Avalanche เราให้ข้อมูล ไม่ใช่คำแนะนำ ผู้ใช้ตัดสินใจเองเสมอ"

---

## If something breaks

| Beat | Symptom | Do |
|---|---|---|
| Any | Wi-Fi drops | Keep going: the app falls back to labelled snapshot data and the rules engine. Say "offline mode, same checks" |
| 2 | `npm run ubot` errors (401/503) | `.env` must hold the same `MCP_API_KEY` the server started with. Skip to the backup video of beat 2, then continue at beat 3 by asking "Buy 5,000 THB of ARB" in tab 5 (it creates the same card and proposal) |
| 3 | Bell is empty | Reload tab 3 (the bell refreshes every 20 s). Still empty: use the proposal in tab 5 instead |
| 3 | No voice | The browser's own voice takes over; if muted, just read the three lines |
| 2, 4 | Says "snapshot" or "Sample" instead of "live" | Tokenomist rate-limited a burst; the numbers are the same real data saved this morning. Say "saved real data, refreshed every minute" and continue |
| 3 | Receipt says "simulated" | Fuji key missing: say "on testnet this writes the receipt; here it's simulated" |
| 5 | Answer is slow (> 8 s) | Talk over it about the trace; the rules engine answers automatically if the model fails |
| Any | At/after 20:00 | The unlock happens during the finals: before 20:00 the card says "today", after it "just unlocked". Say "it's happening right now", then point at the next one on 16 Nov in My plan |

---

## Judge Q&A (one or two sentences each)

| Question | Answer |
|---|---|
| Is U-Bot really connected? | Not yet: U-Bot has no public API. We built the integration on MCP, the standard U-Bot's agent stack can call, and ran it live with a stand-in client. With U-topia's spec it's a configuration change: their key, their user token. |
| Which data is real? | ARB, WLD and AVAX unlocks, allocations and funding come from the Tokenomist API (pulled today). Prices and the demo wallet are labelled samples; every card says which. |
| Why not just tell people to buy or sell? | That's investment advice, which needs a Thai SEC licence. We give the facts, a score computed by code, and a protection option; the user decides. |
| Who computes the score? | Deterministic code, based on Keyrock's study of 16,000 unlocks: size vs supply, size vs trading volume, who receives the tokens, and how far investors are in profit. The model only explains it. |
| Which AI model? | Pluggable. Today it runs on [model in `.env`]; Claude and any OpenAI-compatible model work, and a rules engine takes over if the model fails, so the safety check never depends on one provider. |
| What about WLD? | WLD doesn't unlock in cliffs; it releases ~2.9M a day (community, investors, team). We read Tokenomist's daily emission, so it shows as a continuous medium risk instead of "no unlock". |
| Is the trade real? | Approvals and orders are paper/testnet in the demo. Real execution would go through U-Bot and U-topia Pay, still behind the user's approval. |
| What's next? | Real wallet sync, a database, U-Bot's real user tokens, a backtest of the score, and LINE/Telegram alerts. |
