# แผนงานที่เหลือ: สิ่งที่ยังไม่ได้ทำ · ยังขาด · ยังไม่ได้รับ

> อัปเดต 16 ต.ค. 2026 ~07:30 น. (เวลาไทย) · **demo บ่ายวันนี้**
> สิ่งที่ทำแล้วดู [STATUS.md](STATUS.md) · ประวัติการทำงานดู [LOGS.md](LOGS.md)
> ระดับความด่วน: 🔴 ต้องทำก่อน demo · 🟠 ควรทำถ้ามีเวลา · ⚪ หลัง hackathon
> ผู้รับผิดชอบ: **คุณ** (เจ้าของ repo/ทีม) · **Claude** · **mentor/sponsor**
> **Demo day:** step-by-step plan in [DEMO-DAY-PLAN.md](DEMO-DAY-PLAN.md) · stage script in [DEMO.md](DEMO.md)

---

## 0. สรุป 1 นาที

1. ✅ **Done:** PR #1, #2 and #3 are merged into `main`. The work ported from `wip/v2-freshness-drift-alerts` (drift, full alert engine, "as of HH:MM", Vercel cron) is on `feat/merge-app-ui-agentic`, already merged with the English `main` and translated, waiting for its PR to be merged ([compare](https://github.com/nathirad/U-Hackathon/compare/main...feat/merge-app-ui-agentic)). Don't merge `wip/v2-freshness-drift-alerts` itself: everything in it is now in this branch.
2. **ยังไม่มี key จริงสักตัว:** Claude, ElevenLabs, Fuji wallet ยังเป็นตัวสำรอง/จำลอง · Tokenomist มี key แล้วแต่เครือข่ายของ session บล็อก
3. **ยังไม่ได้ขึ้น host:** Vercel connector มีสิทธิ์แค่อ่าน
4. **บท demo บนเวทีใน SPEC §13 ยังเป็นแบบเก่า** (ใช้ `/app` กรอบโทรศัพท์) ต้องเขียนใหม่ให้มีหน้าเทรด/ลงทุน/แจ้งเตือน
5. **ข้อมูลทั้งหมดเก็บในหน่วยความจำ:** restart server เมื่อไร ข้อเสนอ, กฎแจ้งเตือน, คำสั่งจำลอง, แผนลงทุน, ข้อความ U-Bot หายหมด

---

## 1. สิ่งที่ยังไม่ได้รับ (รอคนอื่น)

| # | ต้องการ | ใช้ทำอะไร | ถ้าไม่มี ตอนนี้เป็นอย่างไร | ใคร | ด่วน |
|---|---|---|---|---|---|
| 1 | **Merge PR เข้า `main`** ([ลิงก์](https://github.com/nathirad/U-Hackathon/pull/new/feat/merge-app-ui-agentic)) | ให้ทุกคนดึงโค้ดล่าสุดได้ | `main` ว่าง · ระบบสิทธิ์ของ Claude บล็อกการ push เข้า `main` | คุณ | 🔴 | ✅ merged 16 Oct
| 2 | `ANTHROPIC_API_KEY` | ให้ U-Bot ตอบด้วย Claude จริง | ตอบด้วย rules engine (ตอบได้ แต่ภาษาแข็งและตอบนอกแบบไม่ได้) | คุณ | 🔴 |
| 3 | Tokenomist snapshot | ข้อมูล unlock จริงของ ARB/WLD/AVAX | ARB = คัดลอกจากเว็บ 15 ต.ค. · WLD/AVAX = ข้อมูลตัวอย่าง · key มีแล้ว แต่ session นี้เรียก `api.tokenomist.ai` ไม่ได้ | คุณ: รัน `npm run snapshot -- ARB WLD AVAX` บนเครื่อง หรือเพิ่ม `api.tokenomist.ai` ใน Allowed domains ของ environment | 🔴 | ✅ done 16 Oct 02:45 via the API, incl. daily emission (WLD/AVAX continuous releases)
| 4 | `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` (เสียงไทย) | เสียงอ่าน + พูดถาม (STT) + Voice mode แบบ hands-free (ทำแล้ว รอ key) | ใช้เสียงของเบราว์เซอร์แทน · ยังไม่เคยทดสอบไมค์จริง | คุณ | 🔴 |
| 5 | `DEMO_PRIVATE_KEY` (Fuji testnet เท่านั้น) + AVAX จาก faucet | หลักฐานการอนุมัติบน Avalanche จริง | หลักฐานเป็น "จำลอง" กรรมการกดดู tx ไม่ได้ | คุณ | 🔴 |
| 6 | `AUTH_SECRET`, `MCP_API_KEY`, `UBOT_API_KEY`, `CRON_SECRET` | ค่าลับสำหรับ production | `npm start` ไม่ขึ้นถ้าไม่มี `AUTH_SECRET` · webhook/MCP ปิดใน production ถ้าไม่มี key | คุณ (สุ่มเองได้ด้วย `openssl rand -base64 32`) | 🔴 |
| 7 | ตัดสินใจที่รัน demo + host (connector ของ Claude สร้าง project ไม่ได้ 403 · ต้องสร้างเองใน dashboard) | เปิดให้กรรมการ/ทีมดู | ยังไม่มี URL สาธารณะ · Vercel connector สร้าง project ไม่ได้ (403) | คุณ: เลือก "รันบน laptop" หรือ "import repo ที่ vercel.com" | 🔴 |
| 8 | Spec / API ของ U-Bot ตัวจริง (`u.bot`) | เชื่อม U-Bot จริง (ส่งแจ้งเตือน, รับพอร์ตผู้ใช้, VIC approval) | ใช้ U-Bot จำลองในแอป + webhook adapter + MCP ที่รอเชื่อม | mentor (U-topia, Maya Nicks) | 🟠 |
| 9 | ไฟล์โลโก้ Tokenomist (SVG/PNG) | แถบ "ข้อมูลและเทคโนโลยีที่ใช้" เป็นโลโก้ครบ | แสดงเป็นตัวอักษร "Tokenomist" | คุณ / บูธ Tokenomist | 🟠 |
| 10 | คำตอบ mentor (SPEC §15) | ความถูกต้องของ pitch | ดูข้อ 10.1–10.5 ด้านล่าง | mentor | 🟠 |
| 11 | ความเห็นด้านกฎหมายเรื่องหน้าเทรด/ลงทุน | ยืนยันว่าแบบ "AI ร่างแผน + ผู้ใช้อนุมัติ + จำลอง" ไม่เข้าข่ายแนะนำการลงทุน | ใช้ disclaimer + paper trading + ข้อมูลตัวอย่าง | ทีม / ผู้รู้กฎหมาย | 🟠 |
| 12 | แหล่งข้อมูลหุ้น/กองทุนจริง | หน้าลงทุนใช้ข้อมูลจริง | ข้อมูลตัวอย่าง ชื่อกองทุนเป็นตัวอย่าง | คุณ: สมัคร SEC Open Data (ฟรี) · SET (มีค่า license) · Finnhub/Polygon (หุ้น US) | ⚪ |
| 13 | Nansen API key (ไม่บังคับ) | Smart Money / flow บนหน้าเหรียญ | ไม่มีส่วนนี้ | คุณ (แพ็กเกจเสียเงิน) | ⚪ |

**10. คำถาม mentor ที่ยังไม่ได้คำตอบ**
1. U-Bot เปิดให้ skill/agent ภายนอกต่อได้ไหม (API, webhook, MCP) · payload แบบไหน · VIC approval ทำงานอย่างไร
2. แอปที่เปิดวันนี้รองรับเหรียญ/เครือข่ายอะไร · ใช้ในไทยได้ไหม · มีหุ้นหรือกองทุนไหม
3. "AI assistant" ในแอปคือ U-Bot ตัวเดียวกันไหม · เกี่ยวกับ Topi AI อย่างไร
4. แสดงตาราง vesting ของ UCOIN ได้ไหม
5. Surprise bounty ของแต่ละ sponsor · Tokenomist มี hackathon key ที่เปิด forward unlocks ไหม

---

## 2. ต้องทำก่อน demo (บ่ายวันนี้) เรียงตามลำดับ

| # | งาน | ใคร | เวลา | รายละเอียด |
|---|---|---|---|---|
| 1 | Merge PR | คุณ | 2 นาที | ดูข้อ 1.1 |
| 2 | ใส่ key ใน `.env` บนเครื่องที่จะ demo | คุณ | 10 นาที | ห้าม commit `.env` · `DEMO_PRIVATE_KEY` ต้องเป็นกระเป๋า testnet ใหม่เท่านั้น |
| 3 | Tokenomist snapshot | คุณ | 15 นาที | `npm run snapshot -- ARB WLD AVAX` → ตรวจเวลา ARB (ตอนนี้ 13:00 UTC = 20:00 น.) → commit `data/fixtures/tokenomist/` | ✅ done
| 4 | ทดสอบ end-to-end ด้วย key จริง | คุณ + Claude | 45 นาที | Claude ตอบไทย · เสียงไทย ElevenLabs · ไมค์ STT · tx บน Fuji · ทุกหน้าใน STATUS.md "หน้าแอปทั้งหมด" |
| 5 | **เขียนบท demo ใหม่** (SPEC §13) | Claude | 20 นาที | ร่างด้านล่าง (ข้อ 2.1) | ✅ see [DEMO.md](DEMO.md)
| 6 | เลือกที่รัน | คุณ | – | **แนะนำ: laptop** `npm run build && AUTH_SECRET=… npm start` เพราะ watcher ทำงานได้ และข้อมูลในหน่วยความจำอยู่ครบตลอด demo · ถ้าใช้ Vercel ต้องทำข้อ 3.4 ก่อน |
| 7 | ซ้อม 3 รอบกับ projector จริง | ทีม | 1 ชม. | เช็กจอ 1280/1920 px, ขนาดตัวอักษร, เสียง, ไมค์ |
| 8 | อัดวิดีโอสำรอง | ทีม | 20 นาที | เผื่อเน็ต/เครื่องมีปัญหาบนเวที |

**2.1 ร่างบท demo ใหม่ (3 นาที)**
1. `/` hook: "วันนี้ 16 ต.ค. ARB ปลดล็อก 92.6M ให้ทีมและนักลงทุน" → ชี้แถบโลโก้ sponsor
2. `/terminal/tokens/ARB`: การ์ดเสี่ยงสูง + supply 6 เดือน → แผงเทรด "ซื้อ ฿5,000" → **ให้ AI ร่างแผน** → U-Guard เตือน 2 เรื่อง (unlock ใกล้, พอร์ตกระจุก 35%) → อนุมัติแบบจำลอง → หลักฐานบน Avalanche
3. กระดิ่ง 🔔 เด้ง: U-Bot เฝ้าดูเองแล้วเตือน WLD/ARB (ตั้งกฎ "เฝ้าดูทุกเหรียญในพอร์ต" ไว้ก่อนขึ้นเวที)
4. `/terminal/agent`: ถามเสียง "AVAX น่ากังวลไหม" → ตอบไทย + เสียง → ชี้ Agent Trace
5. `/terminal/invest`: แบบประเมิน → พอร์ตตัวอย่าง → DCA งวด 16 พ.ย. ตรงกับ unlock ARB
6. ปิด: "U-Bot เรียก U-Guard ได้ทาง MCP · ทุกการกระทำคนอนุมัติ · ไม่ใช่คำแนะนำการลงทุน"

**2.2 เช็กลิสต์ก่อนขึ้นเวที**
- ไม่ตั้ง `DEMO_NOW` (ใช้นาฬิกาจริง) · หลัง 20:00 น. การ์ด ARB จะเปลี่ยนเป็น "เพิ่งปลดล็อก"
- ห้าม restart server ระหว่าง demo (ข้อมูลในหน่วยความจำหาย)
- ตั้ง `WATCH_INTERVAL_MIN=1` ให้กระดิ่งเด้งเร็ว · กดตั้งกฎแจ้งเตือนล่วงหน้า ~10 นาที
- เปิดแท็บไว้ล่วงหน้า: `/`, `/terminal/tokens/ARB`, `/terminal/agent`, `/terminal/invest`
- เตรียมคำตอบ: ทำไมเป็นแบบจำลอง · ข้อมูลไหนจริง/ตัวอย่าง · ทำไมไม่แนะนำซื้อขายตรง ๆ (ก.ล.ต.) · เชื่อม U-Bot จริงอย่างไร (MCP/webhook)

---

## 3. ฟีเจอร์ที่ยังไม่ได้ทำ หรือทำแค่บางส่วน

### 3.1 เทรด (`/terminal/trade`, แผงเทรดบนหน้าเหรียญ)
| งาน | สถานะตอนนี้ | ด่วน |
|---|---|---|
| ส่งคำสั่งจริง (U-topia swap ผ่าน U-Bot / โบรกเกอร์ที่มีใบอนุญาต) | คำสั่งจำลอง (paper) · ส่งต่อ Alpaca **paper** ได้แล้วหลังผู้ใช้อนุมัติ (`BROKER=alpaca-paper`) · เงินจริงต้องผ่านพาร์ทเนอร์ที่มีใบอนุญาต ก.ล.ต. | ⚪ |
| ราคาสด | ใช้ราคาใน fixture · `MARKET_SOURCE=live` (CoinGecko) ยังไม่ได้ทดสอบเพราะเครือข่าย session บล็อก | 🟠 |
| Limit order ที่รอราคาจริง + ยกเลิกคำสั่ง | ตอนนี้ถือว่าได้ราคา limit ทันที | 🟠 |
| เฝ้าจุดตัดขาดทุน/เป้าของคำสั่งจำลอง แล้วแจ้งเตือน | ยังไม่มี | ⚪ |
| กราฟราคาบนหน้าเหรียญ (แบบ Nansen) | ยังไม่มี (มีแค่กราฟ supply) | 🟠 |
| Smart Money / flow / ใครซื้อใครขาย | ยังไม่มี (ต้อง Nansen API) | ⚪ |
| ค่าธรรมเนียมจริงของแพลตฟอร์ม | ใช้ค่าสมมติ 0.25% (ติดป้ายไว้) | ⚪ |
| Perps / leverage | **ไม่ทำโดยตั้งใจ** (เสี่ยงเกินกลุ่มผู้ใช้) | – |

### 3.2 ลงทุน (`/terminal/invest`)
| งาน | สถานะตอนนี้ | ด่วน |
|---|---|---|
| ข้อมูลกองทุน/หุ้นจริง (NAV, ค่าธรรมเนียม, factsheet) | ข้อมูลตัวอย่าง ชื่อกองทุนเป็นตัวอย่าง | ⚪ |
| พอร์ตตัวอย่างผ่านการตรวจของผู้มีใบอนุญาต | ยังไม่ผ่าน (ติดป้าย "เพื่อการศึกษา") | ⚪ |
| เก็บผลแบบประเมินต่อผู้ใช้ + ให้ทำใหม่ทุกปี | ยังไม่เก็บ | ⚪ |
| ติดตามพอร์ตเทียบเป้าสัดส่วน (drift) | ✅ ทำแล้วในหน้าพอร์ต (ตั้งเป้าเอง) · ยังไม่ผูกกับแผนลงทุนที่อนุมัติ และไม่เสนอ rebalance (ตั้งใจ: ไม่แนะนำซื้อขาย) | ⚪ |
| DCA ตัดเงินจริงตามวัน | ยังไม่มี (แสดงแค่ตาราง 3 งวด) | ⚪ |
| หน้า "ตลาด" แท็บ คริปโต / หุ้นไทย / หุ้น US / กองทุน | ยังไม่ได้ทำ (มีแค่ screener คริปโต) | 🟠 |

### 3.3 AI / agent
| งาน | สถานะตอนนี้ | ด่วน |
|---|---|---|
| ใช้ Claude จริง | ไม่มี key → rules engine | 🔴 (ข้อ 1.2) |
| แบ่งโมเดลตามงาน (Opus วิเคราะห์ · Sonnet แชต · Haiku คัดข่าว) | ใช้ provider เดียวทุกงาน | 🟠 |
| ข่าวล่าสุดด้วย Claude web search | ใช้ GDELT / snapshot | ⚪ |
| Pipeline รายงานประจำปี + เทรนด์โลก (Files API, Batches, Haiku ดึงตัวเลขพร้อมเลขหน้า) | ออกแบบไว้ใน STATUS.md §7 ยังไม่ได้สร้าง | ⚪ |
| MCP tools สำหรับเทรด/ลงทุน/แจ้งเตือน | ✅ 18 tools: `draft_trade_plan`, `get_paper_trading`, `get_invest_options`, `draft_invest_plan`, `list_alerts`, `create_alert_rule` · ร่างอย่างเดียว ผู้ใช้อนุมัติในแอป | – |
| Eval สำหรับเทรด/ลงทุน/แจ้งเตือน | ✅ eval 55 เคส (เทรด 5 · ลงทุน 5 · แจ้งเตือน 7 · MCP ใหม่ 6) | – |
| GraphRAG-lite (เหรียญที่มีนักลงทุนร่วมกัน) · morning brief | ยังไม่มี | ⚪ |

### 3.4 การเฝ้าดูและแจ้งเตือน
| งาน | สถานะตอนนี้ | ด่วน |
|---|---|---|
| เฝ้า unlock ตามกฎ (ทุก 10 นาที) | ✅ ทำแล้ว | – |
| Vercel Cron (GET + `CRON_SECRET`, `vercel.json`) | ✅ ทำแล้ว · แพ็กเกจ Hobby ตั้ง cron ได้วันละครั้ง (ตั้งไว้ 08:00 น.) | – |
| เฝ้าพอร์ตเบี้ยวจากเป้า + ข่าวลบของเหรียญในพอร์ต | ✅ ทำแล้ว · ข่าวสำคัญต้องมี 2 แหล่งยืนยันก่อนเตือน | – |
| ช่วงเวลาเงียบ 22:00–07:00 + จำกัดจำนวนต่อวัน + ไม่แจ้งซ้ำ + ประวัติ | ✅ ทำแล้ว | – |
| เฝ้าเหตุการณ์มหภาค (FOMC, กนง.) แล้วเตือนเอง | ตอบได้เมื่อถาม แต่ยังไม่เตือนเอง | ⚪ |
| ส่งทาง LINE / Telegram จริง | ตัวเลือกมีในหน้า แต่ส่งเข้า U-Bot ในแอปแทน | ⚪ |
| สรุปรวมรายวัน (morning brief) | ยังไม่มี | ⚪ |

### 3.5 แอปและประสบการณ์ใช้งาน
| งาน | สถานะตอนนี้ | ด่วน |
|---|---|---|
| แชตยังแยกหลายที่: `/terminal/agent` (ไทย), `/assistant` (อังกฤษ), ปุ่ม U-Bot ลอย · ประวัติไม่ต่อกัน | `/app` ออกจากเมนูแล้ว | 🟠 |
| แอปเดียว + ปุ่มสลับภาษา TH/EN | ยังเป็นสองแอป · หน้าเทรด/ลงทุน/แจ้งเตือนมีแค่ไทย | ⚪ |
| หน้าแรกแบบ Agent + สรุปประจำวัน (แบบ Nansen `?agent=true`) | ภาพรวมมีช่องถาม AI แต่ยังไม่มีสรุปประจำวัน | 🟠 |
| หน้า "อนุมัติ" รวมทุกข้อเสนอที่เดียว | กระจายอยู่ในแชต, หน้าเทรด, หน้าแจ้งเตือน | 🟠 |
| Presentation mode สำหรับ projector (ตัวใหญ่) | ยังไม่มี | ⚪ |
| ตรวจ accessibility หน้าใหม่ (เทรด/ลงทุน/กระดิ่ง) | มี aria label แต่ยังไม่ได้ audit | 🟠 |
| โลโก้ Tokenomist | เป็นตัวอักษร (รอไฟล์ ข้อ 1.9) | 🟠 |

### 3.6 ข้อมูล
| งาน | สถานะตอนนี้ | ด่วน |
|---|---|---|
| Tokenomist จริง: ARB/WLD/AVAX | ARB snapshot 15 ต.ค. · WLD/AVAX ตัวอย่าง · หลัง snapshot ต้อง map ช่อง linear unlock ของ WLD และแก้วันที่ AVAX (SPEC §17.6) | 🔴 | ✅ real data; WLD/AVAX linear releases come from daily emission
| ราคา/ข่าว/odds สด | โค้ดรองรับแล้ว (`MARKET_SOURCE`, `NEWS_SOURCE`, `ODDS_SOURCE=live`) แต่ยังไม่ได้ทดสอบ | 🟠 |
| "as of HH:MM" ทุกตัวเลข + ป้ายข้อมูลเก่า | ✅ การ์ด, หน้าเหรียญ, แผนเทรด, พอร์ต, ผล tool · ใช้ข้อมูลชุดล่าสุดที่ดึงสำเร็จเมื่อแหล่งล่ม (ติดป้าย "(may be out of date)"; ตอบไทยใช้ "ณ HH:MM" / "อาจไม่ล่าสุด") | – |
| คะแนนความเสี่ยง v0.2 ยังไม่ backtest | – | ⚪ |
| กระเป๋าจริงของผู้ใช้ | ทุกคนใช้ demo wallet เดียวกัน (AVAX อ่านจริงได้ถ้าตั้ง `WALLET_ADDRESS`) | ⚪ |

### 3.7 Backend และโครงสร้างระบบ
| งาน | สถานะตอนนี้ | ด่วน |
|---|---|---|
| ฐานข้อมูลถาวร (Supabase/Postgres) | ทุกอย่างอยู่ในหน่วยความจำ หายเมื่อ restart | ⚪ (บน demo: ห้าม restart) |
| บัญชี email บน serverless | เขียนไฟล์ `data/runtime/users.json` → บน Vercel เขียนไม่ได้ (demo account ใช้ได้ปกติ) | ⚪ |
| Rate limit ข้ามหลายเครื่อง | อยู่ในหน่วยความจำต่อ process | ⚪ |
| CI (GitHub Actions: typecheck, eval, build) | ยังไม่มี | ⚪ |

### 3.8 ความปลอดภัยและ compliance
| งาน | สถานะตอนนี้ | ด่วน |
|---|---|---|
| Code review + security review ของ endpoint ใหม่ (trade, invest, alerts/run, watch) | มี session check, owner check, Origin check, rate limit, zod แล้ว แต่ยังไม่ได้รีวิวแบบเป็นทางการ | 🟠 |
| ตรวจข้อความ disclaimer กับผู้รู้กฎหมาย | ใช้ข้อความตามแนว ก.ล.ต. ที่ทีมวิเคราะห์ไว้ | 🟠 |

### 3.9 เอกสาร
| งาน | สถานะตอนนี้ | ด่วน |
|---|---|---|
| SPEC §13 บท demo | ยังเป็นแบบเก่า (ใช้ `/app`) → แทนด้วยข้อ 2.1 | 🔴 | ✅ replaced by [DEMO.md](DEMO.md)
| UI-REVIEW รอบ 3 (หน้าอังกฤษ + หน้าใหม่) · ANALYSIS ตารางช่องว่าง · AGENTIC-WORKFLOW §10 คอลัมน์สถานะ | ยังไม่ได้อัปเดต | 🟠 |
| คู่มือ deploy (laptop / Vercel) | มีใน README บางส่วน | 🟠 |

---

## 4. ปัญหาที่รู้อยู่แล้ว (known issues)

| ปัญหา | ผลกระทบ | วิธีเลี่ยงตอนนี้ |
|---|---|---|
| ข้อมูลอยู่ในหน่วยความจำ | restart แล้วหาย | อย่า restart ระหว่าง demo |
| การ์ด ARB เปลี่ยนตามเวลาจริง | หลัง 20:00 น. เป็น "เพิ่งปลดล็อก" | พูดตามสถานะบนการ์ด ไม่ท่องจำ |
| Limit order ได้ราคาทันที | ไม่สมจริง | บอกว่าเป็นแบบจำลอง |
| Demo wallet เดียวกันทุกคน | ทุกคนเห็นยอดเดียวกัน | ใช้ demo account เดียวบนเวที |
| กระดิ่งรีเฟรชทุก 20 วินาที | แจ้งเตือนจาก watcher อาจช้าไม่กี่วินาที | ตั้ง `WATCH_INTERVAL_MIN=1` ก่อน demo |
| หน้า Landing ถ่ายภาพเต็มหน้าแล้วบางส่วนว่าง | เฉพาะภาพหน้าจออัตโนมัติ (animation ยังไม่เล่น) ใช้งานจริงปกติ | – |

---

## 5. ลำดับที่แนะนำ

1. **ตอนนี้ – 10:00 น.:** merge (คุณ) → ส่ง key / รัน snapshot (คุณ) → Claude เขียนบท demo ใหม่ใน SPEC §13 + ทดสอบด้วย key จริง
2. **10:00 – 12:00 น.:** ซ้อมบน laptop ที่จะใช้จริง · แก้สิ่งที่เจอ · ถ้ามีเวลา: MCP tools ใหม่, หน้าอนุมัติรวม, กราฟราคา
3. **12:00 – ก่อนขึ้นเวที:** freeze โค้ด · อัดวิดีโอสำรอง · เช็กลิสต์ข้อ 2.2
4. **หลัง hackathon:** ฐานข้อมูลถาวร, ข้อมูลจริง (หุ้น/กองทุน), เชื่อม U-Bot จริง, LINE/Telegram, pipeline รายงานประจำปี + เทรนด์โลก, แอปเดียวสองภาษา
