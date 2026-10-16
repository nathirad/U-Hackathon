# U-Guard: System Specification (เอกสารหลักสำหรับส่งต่องาน)

> อัปเดต 16 ต.ค. 2026 ~11:30 น. · ทีม U-Hackathon 2026 (AI Track) · **สถานะล่าสุดดู §0.1** (หัวข้อ 14 และ 17 เป็นบันทึกของวันที่ 15)
> เอกสารนี้คือ **แหล่งความจริงหลัก (source of truth)** ใครมาต่องาน (คนหรือ AI session ใหม่) อ่านไฟล์นี้ก่อน
> รายละเอียดเสริม: [PLAN.md](PLAN.md) (ปัญหา, หลักฐาน, timeline, pitch) · [UI-PLAN.md](UI-PLAN.md) (หน้าเว็บ, nav, auth, loader)
> **Agent design v2 (English):** [AGENTIC-WORKFLOW.md](AGENTIC-WORKFLOW.md): models per job, LangGraph decision, RAG types, live data, alerts, portfolio drift. It supersedes §7 where they differ.

---

## 0. TL;DR

- **U-Guard** คือ agent ใน U-Bot ที่**เช็กความเสี่ยงจาก supply (token unlock / emission) ก่อนเงินของผู้ใช้ขยับ** อธิบายเป็นภาษาไทย 3 บรรทัดพร้อมเสียง แล้วให้ผู้ใช้**อนุมัติเองทุกครั้ง** (บันทึกการอนุมัติบน Avalanche)
- **Positioning:** *"The safety layer for U-Bot's agentic banking."* U-Bot สร้างบน Visa Intelligent Commerce ซึ่งเน้น spending control + approval workflow + trust signal และ U-Guard คือ trust signal ฝั่ง crypto
- **ไม่ทายราคา** แต่ forecast **supply** ซึ่งเป็นตัวแปรเดียวที่รู้ล่วงหน้าได้จริง และ**ไม่ให้คำแนะนำการลงทุน** (ไทยต้องมีใบอนุญาตที่ปรึกษาสินทรัพย์ดิจิทัลจาก ก.ล.ต.)
- **สถานะโค้ด:** ดู §0.1 ด้านล่าง (ข้อความเดิมของวันที่ 15 อยู่ใน §14 และ §17)


## 0.1 สถานะล่าสุด (16 ต.ค. ~11:30 น., `main`)

**แอปเดียว เมนูเรียงตามวันของนักลงทุน** (`/terminal`, ภาษาอังกฤษ · ถ้าถามเป็นภาษาไทย agent ตอบเป็นไทย)
| กลุ่ม | หน้า | ทำอะไร |
|---|---|---|
| Start | Today (`/terminal`) · Ask U-Bot (`/terminal/agent`) | ภาพรวมวันนี้ · แชต agent พร้อมการ์ด, ข้อเสนอ, เสียง, Agent Trace |
| Markets | Token screener · Unlock calendar · News | เหรียญใหญ่ 40 อันดับ + unlock ครั้งถัดไป (Tokenomist live) · ปฏิทิน unlock · ข่าวสด RSS |
| My money | Portfolio · My plan · Trade · Invest · Alerts | สัดส่วนเทียบเป้า, กราฟ, ตาราง unlock 6 เดือน · ไทม์ไลน์ 30 วัน + PDF · แผนเทรดจำลอง · แผนลงทุน · กฎแจ้งเตือน + กล่อง U-Bot |
| อื่น ๆ | `/` landing · `/en` · `/method` · `/login` · `/report` · `/app` (เฉพาะ demo บนเวที) | `/assistant` และ `/dashboard` redirect เข้า terminal |

**Agent (Claude ผ่าน Anthropic SDK, ไม่มี key ใช้ rules engine) · 25 tools**
- อ่าน 22 ตัว ใช้ทั้งแชตและ MCP:
  - ความเสี่ยง unlock, ข่าว, odds, market pulse, drift, stress test
  - ข้อมูลของแอปทั้งหมด: คำสั่งเทรด/สถานะ, กฎแจ้งเตือน, My plan, แผนลงทุน, unlock ทั้งตลาด
  - บนเชนผ่าน **Avalanche Data API**: ยอดเงิน, ธุรกรรม, smart contract
- เขียน 3 ตัว ใช้ได้เฉพาะ U-Bot ผ่าน MCP: ร่างแผนเทรด, ร่างแผนลงทุน, ตั้งกฎแจ้งเตือน
  - **ไม่มี tool ไหนอนุมัติหรือส่งคำสั่ง** ผู้ใช้อนุมัติในแอปเท่านั้น และการอนุมัติถูกบันทึกบน Avalanche Fuji
- คะแนนความเสี่ยงคำนวณด้วยโค้ด (deterministic) · โมเดลทำหน้าที่อธิบาย · compliance check ห้ามแนะนำซื้อขายหรือทายราคา
- **ไม่ใช้ VLM:** ข้อมูลเป็น JSON ไม่ใช่ภาพ และ Claude อ่านรูปได้อยู่แล้วถ้าต้องใช้

**แหล่งข้อมูล**
| ข้อมูล | แหล่ง | ถ้าใช้ไม่ได้ |
|---|---|---|
| Unlock, allocation, ระดมทุน | Tokenomist API (`TOKENOMIST_API_KEY`) | snapshot 15 ต.ค. มีป้ายบอก |
| ราคา, volume | Hyperliquid + CoinGecko (`MARKET_SOURCE=live`) | ไฟล์ตัวอย่าง มีป้ายบอก |
| ข่าว | RSS: Cointelegraph, CoinDesk, Decrypt (`NEWS_SOURCE=rss`) | snapshot ข่าว |
| Odds | Polymarket | snapshot |
| บนเชน | Avalanche Data API (ไม่ต้องมี key) · บันทึกการอนุมัติบน Fuji (`DEMO_PRIVATE_KEY`) | บอกว่าไม่ตอบ · บันทึกแบบ simulated |
| เช็กสถานะ | `GET /api/status` บอกว่าข้อมูลแต่ละส่วนมาจากไหน (ไม่แสดง key) | – |

**ระบบเตือน:**
- กฎ 3 แบบ: unlock, drift, ข่าว
- ไม่ส่งซ้ำ, ช่วง 22:00–07:00 ส่งเฉพาะเรื่องเสี่ยงสูง, วันละไม่เกิน 5 ครั้ง
- ข่าวสำคัญต้องมี 2 แหล่งยืนยัน
- watcher ทำงานทุก 10 นาที และมี Vercel Cron

**บัญชีผู้ใช้:**
- demo (กดครั้งเดียว), email, กระเป๋า (SIWE) · มีปุ่มบัญชีมุมขวาบนของ terminal (Sign out / เข้าระบบแบบอื่น)
- บน laptop ทุกคนใช้ `demo-user` ร่วมกัน เพราะ U-Bot stand-in ส่งข้อเสนอไปหา user นี้
- บน Vercel แต่ละคนได้บัญชี demo ของตัวเอง (`DEMO_SHARED` ใช้เปลี่ยนได้)

**ตัวเลือกเพิ่ม (ปิดไว้เป็นค่าเริ่มต้น):**
- `BROKER=alpaca-paper`: ส่งคำสั่งไป Alpaca บัญชี paper หลังผู้ใช้อนุมัติเท่านั้น
- `npm run ubot -- --trade --coingecko`: ขั้นเพิ่มใน U-Bot stand-in
- รายละเอียดใน [MCP-INTEGRATIONS.md](MCP-INTEGRATIONS.md)

**การทดสอบ:**
- `npm run eval`: 72 เคส (ไทย/อังกฤษ, offline, deterministic)
- `npm run responsive`: 17 หน้า × 5 อุปกรณ์
- typecheck และ build ผ่าน

**ยังไม่ได้ทำ / รอ:**
- เว็บที่ host บน Vercel (connector ของ Claude สร้าง project ไม่ได้: 403)
- key ของ Claude, ElevenLabs, Fuji
- โลโก้ Tokenomist
- spec ของ U-Bot ตัวจริง
- database จริง (ตอนนี้เก็บในหน่วยความจำ / Upstash)
- รายละเอียดดู [TODO.md](TODO.md) และ [STATUS.md](STATUS.md)

---

## 1. บริบท Hackathon (ข้อเท็จจริงที่ยืนยันแล้ว)

| หัวข้อ | รายละเอียด | แหล่ง |
|---|---|---|
| งาน | U-Hackathon 2026 ภายใน FLOW Summit · Avani Sukhumvit Bangkok | Luma |
| เวลา | พฤ. 15 ต.ค. 10:00–18:00 · ศ. 16 ต.ค. 10:00–21:00 · demo บนเวทีบ่ายวันศุกร์ | Luma |
| Tracks | **AI** (ไม่ต้องมี Web3) · **Web3** (deploy on-chain) | Luma |
| AI Track brief | "Build an AI-powered app or assistant, exploring ideas related to **U-Bot**" | โพสต์ประกาศงาน |
| กติกา | สมาชิกที่เป็นคนได้ไม่เกิน 4 คน · **ห้ามใช้โปรเจกต์ที่มีอยู่แล้ว** (pre-research ทำได้) · ใช้ AI tools ได้ทั้งหมด | Luma |
| เกณฑ์ตัดสิน | **App execution 40% · Practicality 40% · Usability & design 10% · Innovation & ecosystem 5% · U-Bot integration 5%** (รวม 100%) | สไลด์ในงาน |
| การตัดสิน | กรรมการเลือก 6 ทีม → **U-Center DAO Community โหวตสด** หาผู้ชนะรางวัลใหญ่ | Luma |
| รางวัล | รวม 1,000,000 THB · ถ้วยให้ top 3 ของแต่ละ track · มี surprise bounty จาก partner | Luma |
| Sponsors | **Tokenomist** (ข้อมูล unlock/vesting) · **ElevenLabs** (เสียง AI) · **Avalanche** (smart contract, wallet, on-chain tx) | สไลด์ในงาน |

---

## 2. U-topia Ecosystem: ข้อมูลล่าสุดที่ใช้ได้จริงใน Hackathon

ระดับความเชื่อมั่น: ✅ จากแหล่งทางการหรือหลายแหล่ง · 🟡 จากแหล่งเดียวหรือบุคคลที่สาม · ❓ ยังไม่รู้ ต้องถาม mentor

### 2.1 บริษัทและเส้นเวลา
- ✅ U-TOPIA ก่อตั้ง **16 ต.ค. 2021** (ตาม official deck) โฟกัส fintech super app ตั้งแต่ปี 2025
- ✅ **เปิดตัวแอปสู่สาธารณะ 16 ต.ค. 2026 ที่ FLOW Summit** (ครบรอบ 5 ปี) ซึ่ง**ตรงกับวัน demo ของเรา**
- 🟡 หลังเปิดตัว **ใครก็ใช้แอปได้โดยไม่ต้องเป็นสมาชิก U.CENTER** ส่วนก่อนหน้านี้เป็น beta แบบเชิญเท่านั้น (ucenterreviewed.com ซึ่งเป็นเว็บรีวิวอิสระ)
- ✅ ผู้บริหาร: Emmanuel Quezada (Co-Founder & CEO) · Kyle Kemper (President) · **Maya Nicks (CTO & Head of AI)**
- 🟡 พาร์ตเนอร์: Yellow Capital, GC Capital · มีแผนระดมทุน $10M นำโดย Seventy7 Ventures (ยังเป็นข้อเสนอ) (new-banking.app)
- 🟡 ผู้ใช้ราว 130,000 คนต่อเดือนใน 19 ประเทศ (TheBlock, ส.ค. 2025)

### 2.2 แอป U-TOPIA (สิ่งที่ใช้งานได้จริงใน beta)
- ✅ **กระเป๋า self-custody** (ผู้ใช้ถือ key เอง) แบบ multichain บน**เครือข่าย EVM + stablecoin หลัก**
- ✅ **Swap**, send / receive / withdraw
- ✅ **Visa tap-to-pay** (U-Card, virtual/physical, Apple Wallet) ใช้จ่ายได้ราว 50 ประเทศ และตั้งเป้าราว 90 ประเทศเมื่อขยายไปยุโรป
- 🟡 ตามแผน: crypto-fiat bridge (BTC/ETH/USDT ↔ fiat), IBAN, ค่าธรรมเนียม top-up ด้วย crypto 0.7%, U.Points / Owner Rights, **"AI-powered assistant helps with spending, saving goals and crypto investments"**, UTOPIA Kids
- ❓ รายชื่อเหรียญที่ swap ได้จริงและ DEX ที่ใช้ · ประเทศที่รองรับ (ไทย?)

### 2.3 U-Bot (หัวใจของคะแนน U-Bot integration 5%)
- ✅ (bio ของ CTO บน Sessionize) **"U-Bot, the AI orchestration system powering U-Topia's agentic banking and commerce layer, built on Visa Intelligent Commerce"**
- ความหมายต่อเรา: U-Bot คือ **orchestrator** ที่เรียก agent หรือ skill ย่อยๆ ได้ U-Guard จึงควรถูกออกแบบเป็น **skill/sub-agent ที่ U-Bot เรียกก่อนทำธุรกรรม** ไม่ใช่แอปแยกที่แข่งกับ U-Bot
- ❓ U-Bot มี API, webhook หรือ plugin interface ไหม · อยู่ในแอปหรือ Telegram · **ควรถาม Maya Nicks โดยตรง (น่าจะอยู่ในงาน)**

### 2.4 Visa Intelligent Commerce (VIC): ฐานของ U-Bot
- ✅ VIC = แพลตฟอร์มให้ AI agent ทำธุรกรรมแทนผู้ใช้ ประกอบด้วย
  - **agent-scoped tokenized credentials** (token ผูกกับ agent พร้อม spend limit และเพิกถอนได้)
  - **Trusted Agent Protocol** (ยืนยันตัวตน agent ด้วย HTTP Message Signatures)
  - **spend controls / approval workflows / trust signals**
  - **MCP Server**
  - settlement ทั้ง fiat และ stablecoin
- ✅ Visa stablecoin settlement รองรับ 9 chain **รวม Avalanche** (เมษายน 2026) ทำให้เล่าความเชื่อมโยงกับ sponsor ได้
- **การนำมาใช้ของเรา:** VIC ให้ "controls + approvals" อยู่แล้ว U-Guard เพิ่ม **"crypto supply-risk signal"** เข้าไปใน approval workflow ของ U-Bot ก่อน agent จะ swap, ซื้อ หรือ DCA
- ⚠️ การเข้าถึง VIC sandbox ต้องเป็นพาร์ตเนอร์ **ไม่ต้องเชื่อมจริงใน hackathon** ให้วาดใน architecture และใส่ใน roadmap

### 2.5 ส่วนอื่นใน Ecosystem
- 🟡 **Topi AI**: บอท market intelligence บน Telegram ให้สัญญาณแบบ real-time และ**ส่งคำสั่งเทรดอัตโนมัติ**ได้ → U-Guard ใช้เป็นชั้น "Signal + Safety" ได้
- 🟡 **U-Wallet**: ERC-4337 account abstraction (gasless) · **U-Rewards** · **OTC** ผ่านพาร์ตเนอร์ที่มีใบอนุญาต
- ✅ **UCOIN (U)**: BEP20 บน BNB และ ERC20 · เทรดบน MEXC และ BitMart · market cap ราว $0.56M (CoinDesk) · vesting 12–36 เดือน
- ✅ **U.CENTER**: DAO Association จดทะเบียนที่ Ras Al Khaimah (UAE) เปิดตัว พ.ค. 2026 มี Academy, membership packages และ points · **มีการโหวตในแพลตฟอร์มแล้ว แต่ยังไม่มีการโหวต on-chain** · สมาชิกไม่มีสิทธิ์โหวตเรื่องของบริษัท U-TOPIA

### 2.6 ข้อจำกัดด้านกฎหมาย
- ✅ ประเทศไทย: **ที่ปรึกษาสินทรัพย์ดิจิทัล (Digital Asset Advisory Service) ต้องได้รับอนุญาตจาก ก.ล.ต.** ดังนั้น U-Guard ให้ได้แค่ข้อมูล การศึกษา และเครื่องมือควบคุม **ห้ามแนะนำให้ซื้อหรือขาย**

---

## 3. Problem → Solution (ย่อ)
- **Problem:** ผู้ใช้ U-topia มีทั้งสัญญาณเทรดและปุ่ม swap ในกระเป๋าตัวเอง แต่ไม่มีอะไรบอกว่าเหรียญที่จะซื้อมี supply ก้อนใหญ่รอปลดล็อก ความเสียหายในปี 2026 กระจุกในเหรียญ float บางในช่วง ~30 วันก่อนวัน unlock (Tokenomist มิ.ย. 2026 · Keyrock 16,000+ events) และในกระเป๋า self-custody ไม่มีใครคอยกันให้
- **Solution:** agent ที่เช็ก supply risk **ตรงจังหวะที่กำลังทำธุรกรรม** อธิบายภาษาไทย 3 บรรทัดพร้อมเสียง เสนอ protection rule และผู้ใช้อนุมัติแล้วบันทึกบน chain
- หลักฐานและตัวเลขทั้งหมดอยู่ใน PLAN.md §1

---

## 4. Features

ระดับความสำคัญ: **M** = Must (ต้องมีตอน demo) · **S** = Should · **C** = Could · **W** = Won't (ใน hackathon)

### 4.1 Application (`/app`): หน้าจอแอป U-topia + แชต U-Bot
| ID | Feature | ระดับ | รายละเอียด |
|---|---|---|---|
| A1 | Pre-trade check | **M** | พิมพ์ "ซื้อ ARB 5,000 บาท" → agent เรียก tools → แสดงการ์ดความเสี่ยง |
| A2 | Risk card | **M** | ระดับ/คะแนน · วันที่ unlock · % ของ circulating · มูลค่าเทียบ volume · ผู้รับ · กำไรของนักลงทุน · ข้อความไทย 3 บรรทัด · แหล่งข้อมูลพร้อมวันที่ |
| A3 | Agent Trace panel | **M** | แสดงทีละขั้นว่า agent เรียก tool อะไร ใช้เวลาเท่าไร ใช้พิสูจน์ความเป็น agentic ให้กรรมการเห็น |
| A4 | Protection proposal + approve | **M** | การ์ดข้อเสนอ (pause_buying / price_alert / reduce_exposure) → กดอนุมัติ → บันทึกบน Avalanche Fuji → แสดงลิงก์ Snowtrace |
| A5 | Voice brief (ElevenLabs) | **M** | ปุ่ม 🔊 อ่านสรุปภาษาไทย (สำรอง: เสียง th-TH ของเบราว์เซอร์) |
| A6 | Portfolio scan + push alert | S | "สแกนพอร์ต" → ประเมินทุกเหรียญ → ส่งแจ้งเตือนผ่าน U-Bot adapter |
| A7 | Avatar สถานะ | S | สีกรอบตามความเสี่ยง และกรอบหมุนตอนกำลังคิด (`public/brand/avatar.svg`) |
| A8 | Suggestion chips | S | ปุ่มคำถามสำเร็จรูปสำหรับ demo |
| A9 | Unlock-aware DCA plan | C | ผู้ใช้เลือกเหรียญและงบ → agent จัดตารางหลบช่วงเสี่ยง → อนุมัติทั้งแผน |
| A10 | ถาม-ตอบด้วยเสียง (ElevenLabs Agents) | C | พูดถาม U-Guard |
| A11 | เทรดหรือ swap อัตโนมัติ | **W** | ขัดกับหลัก "ผู้ใช้ตัดสินใจเอง" และกฎ ก.ล.ต. |

### 4.2 Dashboard (`/dashboard`)
| ID | Feature | ระดับ |
|---|---|---|
| D1 | KPI: float %, ออกใหม่ต่อวัน, unlock ถัดไป ของแต่ละเหรียญในพอร์ต | S |
| D2 | Supply forecast รายเดือนแยกตามผู้รับ (stacked bar) | S |
| D3 | เหรียญใหม่ต่อเดือนเทียบ market cap (เช่น ARB ~1.80% เทียบกับ BTC ~0.07%) | S |
| D4 | ตัวคำนวณ dilution ("ต้องซื้อเพิ่มเท่าไรเพื่อรักษาสัดส่วน") | S |
| D5 | ปฏิทิน unlock ทั้งตลาด 30 วัน | C |

### 4.3 Platform (`/`, `/method`) + Shell
| ID | Feature | ระดับ |
|---|---|---|
| P1 | Loader ครั้งแรกของ session (≤1.5 วินาที ปิดเมื่อข้อมูลจริงโหลดเสร็จ) | S |
| P2 | Nav: glass + scrollspy pill + **Live Unlock Ticker** + ⌘K | S |
| P3 | Landing: Hero (Unlock Timeline) → Manifesto → Numbers → 3 Pillars → Live demo → Forecast → How it works → Trust → CTA | S (ขั้นต่ำ: Hero + Manifesto + ปุ่ม Launch demo) |
| P4 | `/method`: สูตรคะแนน, แหล่งข้อมูล, ข้อจำกัด, disclaimer | S |
| P5 | Pitch mode (กด P) | C |
| P6 | TH/EN toggle | C |

### 4.4 Account
| ID | Feature | ระดับ |
|---|---|---|
| U1 | **ปุ่ม "เข้าโหมด demo"** (บัญชี demo ที่เตรียมไว้) | **M** ถ้ามี auth |
| U2 | Connect wallet (SIWE ผ่าน Supabase Web3) | S |
| U3 | Email OTP | C |
| U4 | Watchlist, ประวัติการเช็กความเสี่ยง และ proposal เก็บใน DB | S |

---

## 5. System Architecture

```
┌──────────────────────────── Browser (Next.js App Router) ───────────────────────────┐
│  /  Platform (landing)   /app  U-topia phone + U-Bot chat + Agent Trace   /dashboard │
│  Shared: RiskCard · ProposalCard · Avatar · Ticker · CommandPalette · Charts        │
└───────────────┬──────────────────────────────────────────────────────┬──────────────┘
                │ fetch (JSON)                                          │ Supabase JS (auth session)
┌───────────────▼──────────────── Next.js Route Handlers (Node) ────────▼──────────────┐
│ /api/agent  /api/scan  /api/protect  /api/voice  /api/forecast  /api/ticker          │
│ /api/portfolio  /api/ubot/webhook  /api/ubot/inbox                                   │
└───────┬───────────────────────────────┬───────────────────────────────┬─────────────┘
        │                               │                               │
┌───────▼────────── Agent Runtime ──────▼───────┐   ┌──────────── Integrations ──────────────┐
│ Router: claude | offline | auto               │   │ Tokenomist v5 (live → fixture)         │
│ Claude loop (Opus 5.5, strict tools,          │   │ CoinGecko (price/volume → fixture)     │
│   server-side fallbacks, prompt cache)        │   │ ElevenLabs TTS (→ browser th-TH)       │
│ Offline agent (deterministic, same tools)     │   │ Avalanche Fuji via viem (→ simulated)  │
│ Tools (7) → executeTool() → Trace             │   │ U-Bot adapter: mock | webhook          │
│ Risk scorer = code (never the LLM)            │   │ AI Gateway: Anthropic direct | Vercel  │
└───────┬───────────────────────────────────────┘   └────────────────────────────────────────┘
        │
┌───────▼──────────── Persistence ──────────────┐
│ Supabase Postgres + RLS (แทน in-memory store)  │
│ profiles · wallets · watchlist · risk_checks  │
│ proposals · protection_receipts · alerts      │
└───────────────────────────────────────────────┘

ภาพในอนาคต (roadmap): U-Bot (VIC orchestration) ──calls──▶ U-Guard skill (MCP) ──signal──▶ VIC approval workflow
```

### 5.1 Tech stack
| ชั้น | ที่ใช้ |
|---|---|
| Framework | Next.js 15 (App Router) · React 19 · TypeScript 5 |
| UI | Tailwind v4 · shadcn/ui · Motion · Lenis · cmdk · Recharts · Geist + IBM Plex Sans Thai |
| AI | `@anthropic-ai/sdk` 0.134 · model `claude-opus-5-5` · effort low (ตั้งได้) · `fallbacks: "default"` |
| Data | Tokenomist API v5 · CoinGecko · fixtures ใน `data/fixtures` |
| Chain | viem 2.x · Avalanche Fuji (chainId 43113) |
| Voice | ElevenLabs TTS (`eleven_v3` รองรับภาษาไทย) |
| Auth/DB | Supabase (Auth: Web3 SIWE / email OTP + Postgres + RLS) |
| Deploy | Vercel (ใช้ Vercel AI Gateway ได้ทันที) หรือ localhost บนเวที |

### 5.2 โครงสร้างโฟลเดอร์ (✅ มีแล้ว · ⬜ ยังไม่ทำ)
```
u-guard/
├─ SPEC.md ✅  PLAN.md ✅  UI-PLAN.md ✅  .env.example ✅
├─ data/fixtures/ ✅              tokenomist/{token-list, unlock-events/*, allocations/*, fundraising/*}.json · market.json · portfolio.json
├─ public/brand/ ✅               logo-mark.svg · avatar.svg
├─ scripts/snapshot-tokenomist.mjs ✅
├─ src/lib/ ✅                    config · types · fixtures · format · tokenomist · market · risk · portfolio · avalanche · store
├─ src/lib/agent/ ✅              tools · prompt · claude
│   └─ ⬜ offline.ts · index.ts (router)
├─ src/lib/ ⬜                    voice.ts · forecast.ts · ubot/{adapter,mock,webhook}.ts · supabase/{client,server}.ts
├─ src/app/ ⬜                    layout · globals.css · (platform)/{page, method/page} · (app)/{app,dashboard,login}/page
├─ src/app/api/ ⬜                agent · scan · protect · voice · forecast · ticker · portfolio · ubot/{webhook,inbox}
├─ src/components/ ⬜             shared/ · platform/ · app/
└─ supabase/migrations/ ⬜        0001_init.sql
```

### 5.3 Environment variables (ดู `.env.example`)
| กลุ่ม | ตัวแปร | ถ้าไม่ตั้ง |
|---|---|---|
| Agent | `ANTHROPIC_API_KEY`, `AGENT_MODE` (auto), `ANTHROPIC_MODEL`, `AGENT_EFFORT` | ใช้ offline agent |
| Gateway (⬜ เพิ่ม) | `AI_GATEWAY` (none\|vercel), `AI_GATEWAY_API_KEY` | ใช้ Anthropic ตรง |
| Tokenomist | `TOKENOMIST_API_KEY`, `TOKENOMIST_BASE_URL` | ใช้ fixtures (ติดป้าย SAMPLE) |
| Market | `MARKET_SOURCE` (fixture\|live) | ใช้ fixture |
| ElevenLabs | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID` | ใช้เสียงของเบราว์เซอร์ |
| Avalanche | `AVALANCHE_RPC_URL`, `WALLET_ADDRESS`, `DEMO_PRIVATE_KEY` (testnet เท่านั้น) | บันทึกแบบ simulated |
| U-Bot | `UBOT_ADAPTER` (mock\|webhook), `UBOT_WEBHOOK_URL`, `UBOT_API_KEY` | ใช้ mock |
| Supabase (⬜ เพิ่ม) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server เท่านั้น) | ใช้ in-memory store |

---

## 6. Workflows

### W1: Pre-trade check (Flow A)
```mermaid
sequenceDiagram
  actor U as ผู้ใช้
  participant B as U-Bot chat (/app)
  participant A as /api/agent
  participant G as Agent (Claude/offline)
  participant T as Tools
  U->>B: "ซื้อ ARB 5,000 บาท"
  B->>A: POST {message, history}
  A->>G: run(message)
  G->>T: assess_unlock_risk(ARB, 5000)
  T->>T: Tokenomist unlocks + fundraising, market quote → risk.ts (โค้ดคำนวณ)
  T-->>G: card (level, score, reasons_th)
  G->>T: propose_protection(ARB, pause_buying)  [ถ้า medium/high]
  G-->>A: reply (ไทย ≤5 บรรทัด)
  A-->>B: {reply, cards, proposals, trace, mode}
  B-->>U: การ์ด + ข้อความ + Agent Trace + ปุ่ม 🔊 / อนุมัติ
```

### W2: Approve → On-chain receipt
`ProposalCard` กด "อนุมัติ" → `POST /api/protect {proposalId, decision}`
→ หา proposal ใน store/DB (**ไม่เชื่อข้อมูลที่ client ส่งมา**)
→ `recordProtection()` (ส่ง tx 0 AVAX ให้ตัวเองบน Fuji พร้อม memo JSON)
→ บันทึก `protection_receipts` → คืน tx hash และลิงก์ Snowtrace
ถ้าไม่มี `DEMO_PRIVATE_KEY` → คืน receipt แบบ `simulated` ที่ติดป้ายชัดเจน

### W3: Portfolio scan + push (Flow B)
ปุ่ม "สแกนพอร์ต" (หรือ cron ภายหลัง) → `/api/scan`
→ agent: `get_portfolio` → `assess_unlock_risk` ทุกเหรียญพร้อมกัน
→ เฉพาะเหรียญ medium/high: `propose_protection(price_alert)`
→ `ubot.send(userId, alert)` → mock เก็บใน inbox และ UI ดึงผ่าน `/api/ubot/inbox` ส่วนแบบ webhook จะ POST ไปที่ U-Bot

### W4: U-Bot inbound (เมื่อ U-topia ให้ API)
U-Bot → `POST /api/ubot/webhook {userId, text, signature}` → ตรวจลายเซ็น → run agent → ตอบกลับแบบ sync และ `ubot.send` แบบ async
ต้องปรับ payload ให้ตรง spec จริงใน `src/lib/ubot/webhook.ts`

### W5: Forecast (Dashboard)
`GET /api/forecast?symbol=ARB&months=6` → Tokenomist `unlock/events` + `daily-emission` → รวมเป็นรายเดือนแยกตามผู้รับ
→ คำนวณ `monthlyPctOfMcap`, `dilutionPct` → ถ้ามีเดือนที่ไม่มีข้อมูลล่วงหน้า ให้ใช้รอบล่าสุดซ้ำและติดป้าย "ประมาณการ"

### W6: Auth
`/login`: (1) **โหมด demo** → sign-in บัญชี seed (2) Connect wallet → `supabase.auth.signInWithWeb3({chain:'ethereum'})` (3) Email OTP
→ middleware ป้องกัน `/app` และ `/dashboard` → สร้าง `profiles` ครั้งแรก → ผูก `wallets.address` เพื่อใช้อ่านยอดบน Avalanche

### W7: Data snapshot (ก่อนขึ้นเวที)
`npm run snapshot -- ARB WLD AVAX` (ต้องมี `TOKENOMIST_API_KEY`) → เขียนทับ fixtures ด้วยข้อมูลจริง → demo ไม่พังแม้ Wi-Fi ล่ม

### W8: Fallback chain (ห้ามพังบนเวที)
| ส่วน | หลัก | สำรอง 1 | สำรอง 2 |
|---|---|---|---|
| Agent | Claude (Opus 5.5) | server-side `fallbacks: "default"` | offline agent (deterministic) |
| ข้อมูล unlock | Tokenomist live | snapshot fixtures | sample fixtures (มีป้าย) |
| ราคา/volume | CoinGecko | market.json | — |
| เสียง | ElevenLabs | เสียง th-TH ของเบราว์เซอร์ | ซ่อนปุ่ม |
| On-chain | Fuji tx | simulated receipt | — |
| ทั้งระบบ | demo สด | **วิดีโอสำรอง** | — |

---

## 7. Agents: การออกแบบ (ปัจจุบันและต่อยอด)

> v2 design (news, drift, alerts, freshness, RAG): see [AGENTIC-WORKFLOW.md](AGENTIC-WORKFLOW.md).

### 7.1 ตอนนี้: Single agent + deterministic tools (ทำไปแล้ว)
- **Orchestrator:** Claude Opus 5.5 ใช้ manual tool loop (`src/lib/agent/claude.ts`) สูงสุด 8 turn เรียก tool พร้อมกันได้ และส่ง thinking blocks กลับไปตามเดิมไม่แก้ไข
- **Tools (7):** `get_portfolio` · `lookup_token` · `get_unlock_schedule` · `get_allocations` · `get_fundraising` · `assess_unlock_risk` · `propose_protection` ทุกตัวใช้ `strict: true` และตรวจ input ด้วย zod
- **หลักการ:**
  - ตัวเลขทุกตัวมาจาก tool ไม่ใช่จาก LLM
  - คะแนนคำนวณด้วยโค้ด
  - agent **เสนอได้อย่างเดียว ไม่ลงมือทำเอง** ผู้ใช้ต้องอนุมัติ (human-in-the-loop)
  - ถ้าใช้ข้อมูลตัวอย่างต้องติดป้ายทุกครั้ง
- **Agentic patterns ที่ใช้:** tool use · planning (เลือก tool เอง) · parallelization · human-in-the-loop · guardrails (system prompt + กันการเสนอ proposal ซ้ำหรือเสนอให้เหรียญเสี่ยงต่ำ)

### 7.2 ต่อยอด: Multi-agent "U-Guard Council" (ใช้เล่าเป็น roadmap หรือ demo บางส่วน)
```
                     ┌──────────────────────┐
  U-Bot / ผู้ใช้ ───▶│  Guard Orchestrator  │── routing ตาม intent (buy / hold / plan / learn)
                     └───┬──────┬──────┬────┘
         ┌───────────────┘      │      └───────────────┐
┌────────▼────────┐  ┌──────────▼────────┐  ┌──────────▼─────────┐
│ Supply Analyst  │  │ Liquidity Analyst │  │ Investor-Flow      │
│ unlock/emission │  │ volume, depth     │  │ fundraising, claims│
└────────┬────────┘  └──────────┬────────┘  └──────────┬─────────┘
         └──────────────┬───────┴──────────────────────┘
                 ┌──────▼──────┐   (โค้ด ไม่ใช่ LLM)
                 │ Risk Scorer │
                 └──────┬──────┘
     ┌──────────────────┼────────────────────┐
┌────▼──────────┐ ┌─────▼───────────┐ ┌──────▼─────────────┐
│ Explainer /   │ │ Planner         │ │ Compliance Guard   │
│ Educator (TH) │ │ unlock-aware DCA│ │ ตรวจคำตอบก่อนส่ง    │
└────┬──────────┘ └─────┬───────────┘ └──────┬─────────────┘
     └──────────────────┼────────────────────┘
                 ┌──────▼──────┐        ┌───────────────┐
                 │ Action Agent│──────▶ │ ผู้ใช้อนุมัติ   │──▶ Avalanche / VIC controls
                 └─────────────┘        └───────────────┘
   + Watcher Agent (สแกนตามเวลา → แจ้งเตือนผ่าน U-Bot)
```

| Agent | หน้าที่ | Tools/ข้อมูล | ความเสี่ยงที่ต้องคุม |
|---|---|---|---|
| **Guard Orchestrator** | แยก intent แล้วส่งต่อให้ agent ที่เกี่ยวข้อง รวมคำตอบ | ทุก agent | loop ยาวเกินไป → ตั้งเพดาน turn |
| **Supply Analyst** | ตาราง unlock/emission/allocation, float, dilution | Tokenomist | ข้อมูลไม่ครบ → แจ้งว่าไม่มีข้อมูล |
| **Liquidity Analyst** | volume, มูลค่าเทียบ ADV, ความผันผวน | CoinGecko | ราคาล่าช้า → แสดงเวลาของข้อมูล |
| **Investor-Flow Analyst** | ราคารอบระดมทุน, กำไรของนักลงทุน, committed claims | Tokenomist fundraising / claims | ต้องใช้แพ็กเกจที่สูงขึ้น |
| **Risk Scorer** | คำนวณคะแนน (ไม่ใช่ LLM) | `risk.ts` | น้ำหนักยังไม่ validate → ติดป้าย v0 |
| **Explainer / Educator** ("ที่ปรึกษาด้านความรู้") | อธิบายเป็นภาษาไทยง่ายๆ สอนแนวคิด (unlock, float, FDV) ทำสคริปต์เสียง | ผลจากด้านบน + ElevenLabs | **ห้ามแนะนำให้ซื้อหรือขาย** |
| **Planner** | วางแผน DCA ที่หลบช่วงเสี่ยง (ผู้ใช้เป็นคนกำหนดเหรียญและงบ) | Supply + ปฏิทิน | ต้องให้ผู้ใช้อนุมัติทั้งแผน |
| **Compliance Guard** (reflection) | ตรวจคำตอบก่อนส่ง: ตัวเลขตรงกับ tool, ไม่มีคำว่า "ควรซื้อ/ขาย", มีแหล่งข้อมูลและ disclaimer | ข้อความตอบ + trace | ถ้าไม่ผ่านให้เขียนใหม่ 1 ครั้ง ไม่ผ่านอีกให้ใช้ template |
| **Action Agent** | สร้าง proposal → รอการอนุมัติ → บันทึก on-chain (อนาคต: ตั้ง VIC spend control) | avalanche.ts, VIC (roadmap) | **ห้ามทำอะไรถ้าผู้ใช้ไม่อนุมัติ** |
| **Watcher** | สแกนพอร์ตตามเวลา แจ้งเตือน 30, 7 และ 1 วันก่อน unlock | scan + U-Bot adapter | แจ้งเตือนบ่อยเกินไป → แจ้งเฉพาะ medium/high |

**เรื่อง "Agent ที่ปรึกษา":**
- ทำได้ในรูปแบบ **ที่ปรึกษาด้านความรู้และการตัดสินใจ (decision coach)** เช่น
  - ถามเป้าหมายและระยะเวลาของผู้ใช้
  - ชวนคิดด้วยคำถาม เช่น "ถ้าราคาลด 20% ในช่วง unlock คุณจะทำอะไร"
  - เทียบสถานการณ์จากตัวเลข supply ที่เกิดขึ้นจริง
  - สอนแนวคิด
- **ทำไม่ได้:** แนะนำให้ซื้อ/ขาย/ถือ, ระบุสัดส่วนการลงทุน, หรือทายราคา เพราะต้องมีใบอนุญาตที่ปรึกษาสินทรัพย์ดิจิทัล
- ถ้า U-topia ทำผ่านพาร์ตเนอร์ที่มีใบอนุญาตในอนาคต ค่อยเปิดโหมดนี้

**ทางเลือกในการลงมือทำ:**
- (1) **hackathon:** ใช้ agent เดียวแล้วเพิ่ม Compliance Guard เป็นขั้นตรวจท้าย และ Explainer ผ่าน system prompt **เสี่ยงต่ำสุด**
- (2) ใช้ sub-agent จริง (เรียก Claude แยกต่อ agent) ทำให้ตอบช้าลงและแพงขึ้น เหมาะกับ Watcher หรือ Planner ที่ทำงานเบื้องหลัง
- (3) **production:** เปิด U-Guard เป็น **MCP server** ให้ U-Bot (orchestrator) เรียก ซึ่งตรงกับทิศทางของ VIC ที่ใช้ MCP อยู่แล้ว

### 7.3 Agent อื่นที่ต่อยอดได้ใน ecosystem U-topia (roadmap)
- **Signal Safety for Topi AI:** ก่อนแสดงสัญญาณเทรด ให้เช็ก supply risk ก่อน
- **Card Spend Guard:** ตอน top-up U-Card ด้วยเหรียญที่กำลังจะมี unlock ให้แจ้งเตือน และแนะนำให้เลือกใช้ stablecoin แทน (เป็นข้อมูล ไม่ใช่คำแนะนำการลงทุน)
- **UCOIN Transparency Agent:** แสดงตาราง vesting ของ UCOIN ให้ชุมชน U.CENTER เห็น (ต้องได้รับอนุญาตจาก U-topia ก่อน)
- **DAO Proposal Explainer:** สรุป proposal ของ U.CENTER เป็นภาษาไทยพร้อมเสียง
- **Scam / Contract Risk Agent:** ตรวจ contract ของเหรียญก่อน swap (honeypot, owner privileges)

---

## 8. Risk Scoring Spec (v0)
```
time      = 1.0 (≤7 วัน) | 0.8 (≤14) | 0.65 (≤30)        ← Keyrock: ราคาเริ่มถูกกด ~30 วันก่อน และหนักสุดในสัปดาห์สุดท้าย
size      = ตาม % ของ circulating: <0.1→0.05 · <0.5→0.2 · <1→0.4 · <5→0.7 · <10→1.0 · ≥10→0.9
liquidity = ตามมูลค่า unlock ÷ volume 24 ชม.: <0.1→0.1 · <0.5→0.4 · <1→0.7 · ≥1→1.0 · ไม่มีข้อมูล→0.5
recipient = Σ สัดส่วน × น้ำหนัก (team 1.0 · investor 0.6 · community 0.5 · other 0.5 · reserve 0.4 · ecosystem 0)
bonus     = 10 × สัดส่วนนักลงทุน × f(กำไรของนักลงทุน: ≥10x→1 · ≥3x→0.6 · ≥1x→0.3 · <1x→0)
score     = min(100, 100 × time × (0.35·size + 0.30·liquidity + 0.35·recipient) + bonus)
level     = high ≥55 · medium ≥30 · low <30 · none (ไม่มี unlock ใน 30 วัน)
```
- **ข้อเสนอ v1:** เพิ่ม `float factor` (float <30% ให้เพิ่มคะแนน) ตามงานวิจัย Tokenomist ปี 2026 · ใช้ข้อมูล committed claim (สัดส่วนที่ถูกเคลมจริง) · backtest กับ unlock ARB รายเดือนย้อนหลัง
- โค้ดอยู่ที่ `src/lib/risk.ts` · ต้องอธิบายในหน้า `/method` ว่าเป็น heuristic

## 9. Data Model (Supabase Postgres + RLS)
```sql
-- ทุกตาราง: enable row level security; policy: user_id = auth.uid()
profiles(id uuid pk references auth.users, display_name text, locale text default 'th', created_at timestamptz default now())
wallets(id uuid pk, user_id uuid, chain text, address text, label text, unique(user_id, chain, address))
watchlist(user_id uuid, symbol text, created_at timestamptz, primary key(user_id, symbol))
risk_checks(id uuid pk, user_id uuid, symbol text, level text, score int, unlock_date timestamptz, payload jsonb, data_source text, created_at timestamptz)
proposals(id uuid pk, user_id uuid, symbol text, action text, risk_level text, unlock_date timestamptz, status text check (status in ('pending','approved','declined')), created_at timestamptz, decided_at timestamptz)
protection_receipts(id uuid pk, proposal_id uuid references proposals, chain text, mode text, tx_hash text, memo jsonb, created_at timestamptz)
alerts(id uuid pk, user_id uuid, symbol text, channel text check (channel in ('ubot','telegram')), active bool default true)
chat_messages(id uuid pk, user_id uuid, role text, text text, created_at timestamptz)   -- ไม่บังคับ
```
**ห้ามเก็บ private key หรือ seed ในทุกกรณี** · `SUPABASE_SERVICE_ROLE_KEY` ใช้ได้ฝั่ง server เท่านั้น

## 10. API Contracts
| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/api/agent` | `{message: string, history?: ChatTurn[]}` | `AgentResult {reply, cards: RiskCard[], proposals: Proposal[], trace: TraceStep[], mode, note?}` |
| POST | `/api/scan` | `{}` | `AgentResult` (และ push ไปที่ U-Bot inbox) |
| POST | `/api/protect` | `{proposalId: string, decision: 'approve'\|'decline'}` | `ProtectionReceipt {mode, chain, txHash, explorerUrl, memo, note?}` |
| POST | `/api/voice` | `{text: string}` | `audio/mpeg` หรือ `204` (ให้ client ใช้เสียงของเบราว์เซอร์) |
| GET | `/api/token/{symbol}` | — | `{tracked, token{marketCap, circulating, maxSupply, floatPct, priceUsd}, card, forecast{months[{month,total,byRecipient}], totalNew, dilutionPct, pctOfMcapPerMonth}, allocations, fundraising, totalRaised, source}` (แทน `/api/forecast` เดิม) |
| GET | `/api/screener` | — | `{rows:[{symbol, marketCap, fdv, floatPct, totalRaised, pctInvestorsUnlocked, latestRound, leadInvestors, analysed}]}` |
| GET | `/api/calendar` | — | `{analysed: RiskCard[], market:[{symbol, date, amount, note, sourceUrl}]}` |
| GET | `/api/portfolio/risk` | — | `{rows:[Holding & {weightPct, card, dilutionPct}], totalThb, atRiskThb, topHolding}` |
| GET/POST/DELETE | `/api/alerts` | POST `{symbol, minLevel: medium\|high, daysBefore: 1–30, channel: ubot\|telegram\|line}` · DELETE `?id=` | `AlertRule[]` (เก็บในหน่วยความจำ) |
| POST | `/api/stt` | `multipart audio` | `{text}` หรือ `204` (ให้ใช้ระบบรู้จำเสียงของเบราว์เซอร์) |
| GET | `/api/ticker` | — | `[{symbol, date, amount, valueUsd, recipients, level}]` (Tokenomist upcoming) |
| GET | `/api/portfolio` | — | `Holding[]` |
| POST | `/api/ubot/webhook` | `{userId, text, signature?}` | `AgentResult` |
| GET | `/api/ubot/inbox` | `?userId=` | `InboxItem[]` |

Type ทั้งหมดอยู่ใน `src/lib/types.ts`

## 11. Integrations (endpoint จริง)
| ระบบ | Endpoint / วิธี | หมายเหตุ |
|---|---|---|
| Tokenomist | `GET https://api.tokenomist.ai/v5/token/list` · `/v5/unlock/events/{id}?start&end` · `/v5/unlock/events/upcoming` · `/v5/allocations/{id}` · `/v5/fundraising/token/{id}` · `/v5/daily-emission/{id}` · `/v5/burn/{id}` · `/v5/buyback/{id}` · header `x-api-key` | free trial: ไม่มีข้อมูล unlock ล่วงหน้า และ fundraising มีแค่ JUP/OKB → **ขอ key จากบูธ** |
| CoinGecko | `/api/v3/simple/price?ids=…&vs_currencies=usd&include_24hr_vol=true` | id: arbitrum, worldcoin-wld, avalanche-2, usd-coin |
| ElevenLabs | `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}` header `xi-api-key` body `{text, model_id:"eleven_v3"}` | ทดสอบเสียงภาษาไทยตั้งแต่แรก |
| Avalanche | viem `avalancheFuji` · RPC `https://api.avax-test.network/ext/bc/C/rpc` · explorer `https://testnet.snowtrace.io/tx/` | faucet ของ Fuji |
| Claude | `@anthropic-ai/sdk` → `client.beta.messages.create({model:'claude-opus-5-5', betas:['server-side-fallback-2026-07-01'], fallbacks:'default', output_config:{effort}})` | |
| Vercel AI Gateway | `baseURL: https://ai-gateway.vercel.sh` + `AI_GATEWAY_API_KEY` · model `anthropic/<id>` | ตรวจชื่อ model และการส่งต่อ beta header ก่อนใช้ |
| Supabase | `@supabase/ssr` · `signInWithWeb3`, `signInWithOtp` | ต้องสร้าง project บนบัญชีผู้ใช้ (ถามก่อน) |
| U-Bot | adapter: `mock` (inbox ภายใน) / `webhook` (POST) | ❓ รอ spec จาก U-topia |

## 12. Security & Compliance
- API key ทั้งหมดอยู่ฝั่ง server · client ไม่เห็น key
- `DEMO_PRIVATE_KEY` ใช้กับ **Fuji testnet เท่านั้น** (โค้ดปฏิเสธการ sign ถ้า chainId ≠ 43113)
- Input ของ tool ทุกตัวตรวจด้วย zod และใช้ `strict` schema
- proposal อนุมัติได้เฉพาะ id ที่อยู่ใน store/DB ของ server
- RLS เปิดทุกตาราง · ไม่เก็บ key หรือ seed
- ทุกคำตอบเป็นข้อมูล ไม่ใช่คำแนะนำการลงทุน มีแหล่งข้อมูลและวันที่ และติดป้ายข้อมูลตัวอย่าง

## 13. Demo & Judging (สรุป)
> **Current stage script: [DEMO.md](DEMO.md)** (16 Oct: ARB unlock tonight, U-Bot stand-in over MCP, approve from the bell). The flow below is the earlier draft.

- **Flow บนเวที (3 นาที):**
  1. `/` hook: "วันนี้ (16 ต.ค.) ARB ปลดล็อก 92.6M ให้ทีมและนักลงทุน และวันนี้ U-topia เปิดตัวแอป"
  2. `/app` "ซื้อ ARB 5,000 บาท" → การ์ด + เสียง → อนุมัติ → tx บน Fuji
  3. ถาม AVAX → "เสี่ยงต่ำ เพราะขนาดเล็กเมื่อเทียบกับ supply และไม่ได้ไปที่ทีม/นักลงทุน" → ชี้ Agent Trace
  4. `/terminal/tokens/ARB`: supply 6 เดือนแยกผู้รับ + ปฏิทินปลดล็อก (หน้าจอใหญ่สำหรับ projector)
  5. ปิด: "safety layer ของ U-Bot บน Visa Intelligent Commerce"
- **การเก็บคะแนนแต่ละเกณฑ์:** Execution (สด + fallback + วิดีโอ) · Practicality (ปัญหาจริงในปี 2026, เหรียญ EVM, ทำตามกฎ ก.ล.ต., ตรงกับ VIC/U-Bot) · UX (การ์ดเดียว ภาษาไทย มีเสียง) · Innovation (คะแนนแบบมีเงื่อนไข, 3 sponsor, บันทึกการอนุมัติ on-chain) · U-Bot (เป็น skill/sub-agent ของ orchestrator)

## 14. สถานะและขั้นต่อไป (บันทึก 15 ต.ค. เย็น · ล่าสุดดู §0.1)

**ทำแล้ว ✅ (branch `feat/app-ui`, เจ้าของ repo, รายละเอียดใน LOGS.md)**
- โครง Next.js + deps (next 15.5, react 19, @anthropic-ai/sdk 0.134, zod 4, viem 2, typescript 5.9)
- `/app`: แชต U-Bot ในจอโทรศัพท์ U-topia, การ์ด, อนุมัติ → Fuji (simulated เมื่อไม่มี key), STT/TTS, PDF · `/report`
- `/terminal` (แบบ Nansen ในสไตล์ของเรา): ภาพรวม, AI Agent, screener, หน้าเหรียญ + forecast 6 เดือน, ปฏิทินปลดล็อก, พอร์ต + dilution, การแจ้งเตือน, sidebar ⌘B / ค้นหา ⌘K
- Landing `/` (โครงหน้าจาก areazeroai.com เท่านั้น เนื้อหาของเราเอง): loader, nav pill + scrollspy, GuardWatch hero, FAQ, ลูกเล่นใน `fx.tsx`
- Claude (Opus 5.5) + Vercel AI Gateway · U-Bot adapter (webhook + inbox) · run log JSONL
- ข้อมูล: ARB จริงจาก tokenomist.ai (15 ต.ค.), WLD/AVAX ตัวอย่าง, screener 25 เหรียญจริง, ปฏิทินตลาดพร้อมแหล่งที่มา

**ทำแล้ว ✅ (branch `feat/agentic-web-english`, รายละเอียดใน §17)**
- เว็บภาษาอังกฤษ: `/en` · `/login` · `/assistant` · `/dashboard` · `/method` + ปุ่ม U-Bot ลอย
- Agent harness สลับโมเดลได้ (OpenAI-compatible / Claude / rules engine สำรอง) · 11 tools · compliance check · trace
- RAG (unlock, ข่าว, odds, pulse) + CAG (FAQ/วิธีคิดคะแนน) · MCP server `/api/mcp`
- Auth: demo account · email+password · Sign-In with Ethereum (ไม่ใช้ Supabase)

**รวมสอง branch แล้ว ✅ (branch `feat/merge-app-ui-agentic`)**
- สองหน้าเว็บ ใช้ backend เดียว: แอปไทยของเจ้าของ (`/`, `/app`, `/terminal/**`, `/report`) คงหน้าตาเดิม · แอปอังกฤษย้ายไป `/en`, `/assistant` · มีลิงก์ข้ามกัน (ปุ่ม EN บน landing, กลุ่ม English ใน sidebar ของ terminal)
- แอปไทย login demo account ให้อัตโนมัติ (`EnsureSession`) จึงอนุมัติ/สแกนได้เหมือนเดิม
- agent ตอบตามภาษาของผู้ใช้: ถามไทย → คำตอบ, เหตุผลในการ์ด, ข้อความ proposal เป็นไทย · หน้าแอปไทยได้การ์ดภาษาไทย
- CSS แยกกัน: stylesheet ของแอปอังกฤษอยู่ใต้ `.ug-web` ทั้งหมด จึงไม่กระทบหน้าของเจ้าของ
- `npm run typecheck` ✅ · `npm run build` ✅ · `npm run eval` 28/28 ✅ · `npm run responsive` ✅ (ทั้งสองแอป)

**ขั้นต่อไป (เรียงตามความสำคัญ)**
1. ใส่ key จริง: Anthropic (หรือ `LLM_*`), ElevenLabs + voice id (ทดสอบเสียงไทย, STT), Fuji wallet + faucet (`DEMO_PRIVATE_KEY`) แล้วทดสอบ end-to-end
2. ขอ **Tokenomist key** จากบูธ → `npm run snapshot -- ARB WLD AVAX` → ตรวจเวลา ARB unlock และรูปแบบ linear unlock ของ WLD (ดู §17.6)
3. ตั้ง `AUTH_SECRET`, `MCP_API_KEY`, `UBOT_API_KEY` · ซ้อมด้วย `DEMO_NOW=2026-10-16T07:00:00Z`
4. การแจ้งเตือน: เก็บลง DB และส่งผ่าน U-Bot inbox จริง · Supabase/Postgres หลัง hackathon
5. ซ้อม 3 รอบกับ projector จริง + อัดวิดีโอสำรอง

**ข้อควรรู้ด้าน environment:** sandbox เขียน `~/.npm` ไม่ได้ ให้ใช้ `npm_config_cache="$TMPDIR/npm-cache" npm install …`

## 15. คำถามที่ต้องถาม Mentor (อัปเดต)
1. **(Maya Nicks / ทีม AI)** U-Bot เปิด interface ให้ skill หรือ agent ภายนอกต่อได้ไหม (API, webhook, MCP) · รูปแบบ payload · เชื่อม VIC approval workflow อย่างไร
2. แอปที่เปิดตัววันที่ 16 ต.ค. รองรับเหรียญและเครือข่ายอะไรสำหรับ swap · ใช้ได้ในประเทศไทยไหม
3. "AI-powered assistant" ในแอปคือ U-Bot ตัวเดียวกันไหม และเกี่ยวกับ Topi AI อย่างไร
4. แสดงตาราง vesting ของ UCOIN ใน demo ได้ไหม
5. Surprise bounty ของแต่ละ sponsor
6. (บูธ Tokenomist) hackathon key ที่เปิดข้อมูล unlock ล่วงหน้า, fundraising และ daily emission

## 16. แหล่งข้อมูล
- Hackathon: https://luma.com/lqrbtu27 · ประกาศ AI Track (Facebook groups) · สไลด์ในงาน
- U-topia: https://u-topia.com · https://u-topia.com/blog · https://u.center · https://new-banking.app/en/ · https://new-banking.app/en/leadership/ · https://the-block.com/blog/2025/08/21/u-topia/ · https://www.coindesk.com/price/ucoin
- รีวิวอิสระ (บุคคลที่สาม): https://ucenterreviewed.com/utopia-app · /timeline · /using-utopia-without-membership · /dao-governance
- U-Bot / CTO: https://sessionize.com/mayanicks/
- Visa Intelligent Commerce: https://www.visa.com/en-us/solutions/intelligent-commerce · https://eco.com/support/en/articles/14845484-visa-intelligent-commerce-explained
- Tokenomist: https://docs.tokenomist.ai/api-documents/introduction · token pages (bitcoin, ethereum, arbitrum) · Research (2025 Review, มิ.ย. 2026 study, Weekly Digest ต.ค. 2026)
- Keyrock: https://keyrock.com/from-locked-to-liquidity-what-16000-token-unlocks-teach-us/ · Binance Research (Low Float & High FDV)
- Vercel AI Gateway: https://vercel.com/docs/ai-gateway/sdks-and-apis/anthropic-messages-api
- Supabase Web3 auth: https://supabase.com/docs/guides/auth/auth-web3
- ก.ล.ต.: https://www.sec.or.th/TH/pages/lawandregulations/digitalassetbusiness.aspx

---

## 17. สิ่งที่สร้างจริงใน branch อังกฤษ (15 ต.ค. เย็น) และการตัดสินใจหลังรวม branch (บันทึก · ล่าสุดดู §0.1)

| เรื่อง | ตัดสินใจ | สถานะ |
|---|---|---|
| โมเดล | Claude Opus 5.5 เป็นตัวเลือกของทีม · harness รองรับ OpenAI-compatible และ rules engine สำรอง · `AGENT_MODE` ยังใช้ได้ | ยืนยัน |
| ภาษา UI | แอปไทย (`/`, `/app`, `/terminal`, `/report`) คงภาษาไทย · แอปอังกฤษอยู่ที่ `/en`, `/assistant`, `/dashboard`, `/method` · agent ตอบตามภาษาผู้ใช้ | เปิด (ปุ่มสลับ TH/EN ภายหลัง) |
| Auth | ทำเองในแอป (demo, email, SIWE) · แอปไทย login demo ให้อัตโนมัติ · Supabase หลัง hackathon | ยืนยัน |
| ARB unlock | 16 ต.ค. 13:00 UTC (20:00 น. ไทย) ตาม tokenomist.ai 15 ต.ค. · ยืนยันด้วย snapshot ก่อน code freeze | รอ key |
| AVAX | พูดบนเวทีว่า "low เพราะขนาดเล็กเมื่อเทียบกับ supply และไม่ได้ไปที่ทีม/นักลงทุน" | ยืนยัน |
| ไมโครโฟน | `Permissions-Policy: microphone=(self)` เพื่อให้ STT ใช้ได้ | ยืนยัน |
| Run log | เก็บข้อความที่ปิดบัง PII แล้ว ≤200 ตัวอักษร · ไม่มีหน้า `/logs` สาธารณะ | ยืนยัน |

### 17.1 หน้าเว็บ
| Path | เนื้อหา |
|---|---|
| `/en` | Hero + การ์ด ARB สด · ปัญหา (มีแหล่งอ้างอิง) · 3 signals · How it works · ผังเชื่อม U-Bot/MCP · Unlock radar · Trust · CTA · หน้าโหลดครั้งแรก (≤1.2 วิ, ข้ามถ้า reduced motion) |
| `/login` | Demo account (ปุ่มเดียว) · email+password · Sign-In with Ethereum (แสดงเมื่อมีกระเป๋าในเบราว์เซอร์) |
| `/assistant` | แชต U-Bot (skill U-Guard) · Beginner/Pro · risk card · proposal (อนุมัติ → receipt Avalanche) · ข่าวพร้อมเลขอ้างอิง · odds · pulse · Agent Trace · ฟังเสียง · 👍/👎 · แถบ wallet + สถานะการเชื่อมต่อ |
| `/dashboard` | KPI 4 ช่อง · holdings ตามระดับความเสี่ยง · supply forecast (กราฟ + ตาราง + dilution calculator) · investor profit pressure · ปฏิทินเหตุการณ์ · market intel |
| `/method` | สูตรคะแนน · แหล่งข้อมูล · วิธีทำงานของ agent · วิธีเรียก MCP · compliance |
| ปุ่ม U-Bot ลอย | เฉพาะ `/en`, `/method` และหน้า 404 · ผู้ที่ยังไม่ login ถาม FAQ/เหรียญได้ (ไม่มี wallet tools) |

### 17.2 Agent harness (`src/lib/agent/index.ts`)
**Guard → Plan + Act → Reflect → Observe**
- `AGENT_PROVIDER=auto|openai|anthropic|rules` · `openai` = endpoint แบบ OpenAI-compatible ใดก็ได้ (Gemini, OpenAI, Typhoon, Groq, OpenRouter, Vercel AI Gateway, Ollama) · `anthropic` = Claude ผ่าน SDK ตรง · `rules` = planner แบบกำหนดผลตายตัว (ใช้เป็นตัวสำรองอัตโนมัติเมื่อ LLM ล่ม)
- Reflect: compliance check → ให้ LLM เขียนใหม่ 1 ครั้ง → ถ้ายังไม่ผ่านใช้ template ที่ตรวจแล้ว

### 17.3 Tools (ตอนนั้น 11 ตัว · ตอนนี้ 25 ตัว ดู §0.1 และ README)
เดิม 7 ตัว + `get_market_news` · `get_event_odds` · `get_market_pulse` · `get_event_calendar` · ทุกตัวตรวจ input ด้วย zod และใช้ร่วมกันทั้ง chat และ MCP

### 17.4 RAG + CAG
- **RAG แบบ agentic:** agent เลือกเองว่าจะดึงอะไร · ข่าวจัดอันดับแบบ hybrid (คำค้น + ชื่อเหรียญ + ความใหม่) · ตัดข่าวที่ไม่เกี่ยวทิ้ง (ตอบว่า "ไม่พบข่าว" แทนการเดา) · ทุกข่าวมีเลข [n] ลิงก์ไปต้นฉบับ
- **CAG:** ความรู้คงที่ (`data/knowledge/faq.json` ~2K tokens) ใส่ใน system prompt ที่ provider cache ได้ · rules engine ใช้ไฟล์เดียวกันจับคู่คำถาม
- live: GDELT (ข่าว), Polymarket (odds), CoinGecko + Fear & Greed + Deribit DVOL (pulse) · offline: snapshot ของข่าวจริงพร้อมลิงก์และวันที่

### 17.5 Guardrails และ Observability
- Input guard: บล็อก seed phrase / private key · ปิดบัง email, เบอร์โทร, เลขบัตร, เลขบัตรประชาชน · flag prompt injection · จำกัดความยาว
- Rate limit ทุก endpoint · CSRF (JSON + ตรวจ Origin) · security headers
- Compliance (EN/TH): ห้ามแนะนำซื้อ/ขาย/ถือ, ห้ามทายราคา, ห้ามสัญญาผลตอบแทน · ตัวเลขทุกตัวต้องมาจากผลของ tool
- Trace ทุกขั้น (guard, plan, tool, model, check) + log JSON ต่อ request + feedback 👍/👎
- `npm run eval` 28 เคส (คะแนน, planner, end-to-end, compliance, guard, FAQ, MCP, ภาษาไทย)

### 17.6 ข้อมูลและข้อจำกัดที่ต้องรู้
- **ARB:** snapshot จาก Coinotag (12 ต.ค., อ้าง Tokenomist): 92.65M (ทีม 56.13M + นักลงทุน 36.52M) = 1.56% ของ 5.95B · ราคา ~$0.199 · รอบถัดไป 16 พ.ย.–16 มี.ค. 2027
- **วัน demo (หลังรวม branch):** ใช้เวลาของ tokenomist.ai คือ 13:00 UTC (20:00 น. ไทย) → ช่วงบ่ายวันงาน การ์ดขึ้น "unlocks today" คะแนน **high 67** · หลัง 20:00 น. ขึ้น "just unlocked" · ซ้อมด้วย `DEMO_NOW=2026-10-16T07:00:00Z` · พูดบนเวทีว่า "วันนี้ 16 ต.ค." แล้วอ่านสถานะจากการ์ด
- **WLD:** sample (team เดิม) จำลองเป็น linear 30 วัน · ของจริงปลดล็อกรายวัน → หลัง `npm run snapshot` ต้องดูชื่อ field ของ linear ใน v5 แล้ว map ใน `src/lib/tokenomist.ts`
- **AVAX:** sample · ผู้รับคือ Avalanche Foundation (KuCoin) → **low** เพราะขนาดเล็ก (0.30%) ไม่ใช่เพราะ "กองทุน ecosystem" · วันที่ยังเป็น placeholder
- คะแนน v0.2 ยังไม่ backtest · ข่าว snapshot เป็นสรุปของเราพร้อมลิงก์ต้นฉบับ · wallet demo เป็น sample

### 17.7 Auth
- Session: cookie HttpOnly ลงลายเซ็น HMAC (7 วัน) · `npm start` ต้องมี `AUTH_SECRET`
- Email: scrypt · ล็อก 15 นาทีหลังผิด 5 ครั้ง · เก็บใน `data/runtime/users.json` บน localhost/server เดียว · บน Vercel (มี Upstash) เก็บใน shared store แทน สมัครแล้ว login ได้ข้าม function · หลัง hackathon ย้ายไป Postgres/Supabase
- Wallet: SIWE ด้วย `viem/siwe` · nonce ใช้ได้ครั้งเดียว · ตรวจ domain และเวลา (รองรับ EOA; smart account ต้องใช้ `publicClient.verifySiweMessage`)

### 17.8 MCP (`/api/mcp`)
Streamable HTTP (stateless, JSON) ด้วย `@modelcontextprotocol/sdk` · `Authorization: Bearer $MCP_API_KEY` · ไม่มี key: เปิดใน dev / ปิดใน production · ตรวจ Origin กัน DNS rebinding

### 17.9 API ที่มีจริง
| Method | Path | หมายเหตุ |
|---|---|---|
| POST | `/api/agent` | `{message, history?, mode?: "beginner"\|"pro"}` → `AgentResult` (ไม่ login = public scope) |
| POST | `/api/scan` | ต้อง login |
| POST | `/api/protect` | `{proposalId, decision}` เฉพาะ proposal ของผู้ใช้เอง |
| POST | `/api/voice` | `{text}` → audio/mpeg หรือ 204 (ใช้เสียงเบราว์เซอร์) |
| POST | `/api/feedback` | `{requestId, rating}` |
| POST | `/api/auth/demo` · `/login` · `/register` · `/logout` · `/wallet` | |
| GET | `/api/auth/me` · `/api/auth/nonce` | |
| GET/POST/DELETE | `/api/mcp` | MCP |
| GET | `/api/ticker` · `/api/calendar` · `/api/screener` · `/api/token/{symbol}` | ข้อมูลของแอปไทย (`?lang=en` ให้การ์ดเป็นอังกฤษ) |
| GET | `/api/portfolio` · `/api/portfolio/risk` | ต้อง login |
| GET/POST/DELETE | `/api/alerts` | กฎแจ้งเตือนของผู้ใช้แต่ละคน |
| GET/POST | `/api/stt` | ElevenLabs Scribe (204 เมื่อไม่มี key) |
| POST | `/api/ubot/webhook` · GET `/api/ubot/inbox` | U-Bot (Bearer `UBOT_API_KEY`) |
| POST | `/api/alerts/run` | ตรวจกฎแจ้งเตือนของผู้ใช้ตอนนี้ ส่งข้อที่เข้าเงื่อนไขเข้า U-Bot |
| GET · POST | `/api/watch` | สถานะ watcher · cron เรียกรอบตรวจ (Bearer `CRON_SECRET`) |
| GET · POST | `/api/trade` · `/api/trade/plan` · `/api/trade/decide` | คำสั่งจำลองและสถานะ · ร่างแผนเทรด · อนุมัติ/ไม่ทำ |
| GET · POST | `/api/invest` · `/api/invest/plan` · `/api/invest/decide` | คำถาม + พอร์ตตัวอย่าง · ร่างแผนลงทุน · อนุมัติ/ไม่ใช้ |

### 17.10 ENV ใหม่
`AGENT_PROVIDER` · `LLM_BASE_URL` · `LLM_API_KEY` · `LLM_MODEL` · `LLM_LABEL` · `AUTH_SECRET` · `DEMO_LOGIN` · `DATA_DIR` · `MCP_API_KEY` · `NEWS_SOURCE` · `ODDS_SOURCE` · `DEMO_NOW` (ดู `.env.example`)
