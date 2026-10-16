// Deterministic planner + writer. It runs when no LLM is configured, when the LLM fails,
// and as the last-resort template when an LLM answer fails the compliance check. It uses
// the same tools as the LLM agents, so the trace and cards look the same. It answers in the
// language of the question (Thai copy follows the U-topia app's Thai offline agent).

import { compact, LEVEL_LABEL, LEVEL_TH, shortDate, signedPct, thaiDate, thb, usd, usdFull } from "../../format";
import { usdToThb } from "../../market";
import { trackedTokens } from "../../tokenomist";
import type { AnswerMode, ChatTurn, RiskCard } from "../../types";
import { matchFaq, type FaqEntry } from "../../knowledge";
import { executeTool, type RunContext } from "../tools";

export type Intent =
  | "buy"
  | "sell"
  | "scan"
  | "drift"
  | "stress"
  | "news"
  | "odds"
  | "calendar"
  | "risk"
  | "learn"
  | "help"
  // The rest of the app: the agent reads what the user sees on each page.
  | "orders"
  | "alerts"
  | "myplan"
  | "investplans"
  | "unlocks"
  | "onchain";

/** App-data intents and the tool that answers each. */
const APP_TOOLS: [Intent, string][] = [
  ["orders", "get_paper_trading"],
  ["alerts", "list_alerts"],
  ["myplan", "get_my_plan"],
  ["investplans", "get_invest_plans"],
  ["unlocks", "get_upcoming_unlocks"],
  ["onchain", "get_wallet_activity"],
];
const PERSONAL = new Set<Intent>(["orders", "alerts", "myplan", "investplans", "onchain"]);

export interface Plan {
  intents: Intent[];
  symbols: string[];
  amountThb: number | null;
  faq: FaqEntry | null; // answered from the static knowledge base (CAG), no tools needed
  needsSymbol: boolean;
}

const NAMES: Record<string, string> = {
  bitcoin: "BTC",
  btc: "BTC",
  บิตคอยน์: "BTC",
  บิทคอยน์: "BTC",
  ethereum: "ETH",
  ether: "ETH",
  eth: "ETH",
  อีเธอเรียม: "ETH",
  arbitrum: "ARB",
  arb: "ARB",
  worldcoin: "WLD",
  wld: "WLD",
  avalanche: "AVAX",
  avax: "AVAX",
  usdc: "USDC",
  usdt: "USDT",
  tether: "USDT",
  solana: "SOL",
  sol: "SOL",
};

// Thai names, matched anywhere in the text (Thai has no spaces between words).
const THAI_NAMES: Record<string, string> = {
  อาร์บิทรัม: "ARB",
  อาร์บ: "ARB",
  เวิลด์คอยน์: "WLD",
  เวิลด์: "WLD",
  อวาแลนช์: "AVAX",
  อาวาแลนช์: "AVAX",
  เอแวกซ์: "AVAX",
  ยูเอสดีซี: "USDC",
  บิตคอยน์: "BTC",
  บิทคอยน์: "BTC",
  อีเธอเรียม: "ETH",
};

// Uppercase words that are not tickers.
const NOT_TICKERS = new Set(["I", "OK", "ETF", "ETFS", "USD", "THB", "FED", "FOMC", "CPI", "SEC", "AI", "US", "UK", "EU", "THE", "DCA", "OTC", "API", "FDV", "TVL", "NFT", "IPO", "GDP", "ATH"]);

const STABLES = new Set(["USDC", "USDT", "DAI"]);

const INTENTS: [Intent, RegExp][] = [
  ["learn", /\b(what is|what's an?|what are|explain|meaning of|define|how does)\b|คืออะไร|อธิบาย|หมายถึง/i],
  ["buy", /\b(buy|buying|purchase|invest(ing)? in|ape|accumulate|dca)\b|ซื้อ|ลงทุน|เข้าซื้อ/i],
  ["sell", /\b(sell|selling|take profit|cash out)\b|ขาย/i],
  ["scan", /\b(scan|portfolio|my (holdings|wallet|bag|coins|assets)|what do i (own|hold))\b|พอร์ต|สแกน|ถืออะไร|ถืออยู่/i],
  ["drift", /\b(drift(ed|ing)?|off[- ](plan|target)|from my (plan|target)|rebalanc\w*|target (mix|allocation|weights?)|my targets?|balanced|concentrat\w*|diversif\w*)\b|สัดส่วนพอร์ต|ปรับพอร์ต|ห่างจากเป้า|กระจุก|เป้าพอร์ต|ตามแผน|เบี้ยว|ปรับสมดุล|สัดส่วน|ตามเป้า|จากเป้า/i],
  ["stress", /\b(stress|what if|worst case|what could go wrong|how (bad|much) could|protect my (portfolio|money)|risk(s|y)? (to|for|in) my (portfolio|money)|how (risky|safe) is my portfolio|handle (it|this|the risk))\b|ความเสี่ยงพอร์ต|พอร์ตเสี่ยง|รับมือ|ป้องกันพอร์ต|ถ้าตลาดลง|แย่ที่สุด/i],
  ["news", /\b(news|headlines?|what'?s (moving|happening|going on)|why (is|did|are|has)|happening|events?)\b|ข่าว|เหตุการณ์|ทำไม/i],
  ["odds", /\b(odds|probabilit(y|ies)|chances?|likely|prediction market|polymarket|fed|fomc|rate (cut|hike)|interest rates?)\b|โอกาส|ความน่าจะเป็น|ดอกเบี้ย|เฟด/i],
  ["calendar", /\b(calendar|upcoming|coming up|next (week|month)|schedule|this week)\b|ปฏิทิน|เร็วๆ\s?นี้|สัปดาห์นี้/i],
  ["risk", /\b(unlocks?|vesting|risk|risky|safe|supply|dilution)\b|ปลดล็อก|เสี่ยง|ปลอดภัย/i],
  ["orders", /\b(my (paper )?(orders?|trades?|positions?)|paper (trading|orders?|positions?|trades?)|open positions?|p&l|pnl|pending (trade )?plans?)\b|คำสั่ง(ซื้อขาย|เทรด)?ของ(ฉัน|ผม)|ออเดอร์|สถานะ(การ)?เทรด|กำไรขาดทุน|แผนเทรด/i],
  ["alerts", /\b(my alerts?|alert rules?|what alerts|alerts? (did|have) i|which alerts|notifications?)\b|การแจ้งเตือน(ของ(ฉัน|ผม))?|กฎแจ้งเตือน/i],
  ["myplan", /\b(my plan|my month|this month for me|next 30 days|what('?s| is) (coming up )?for me|my (calendar|schedule|timeline))\b|แผนของ(ฉัน|ผม)|เดือนนี้(ของ(ฉัน|ผม))?ต้องทำ|ไทม์ไลน์/i],
  ["investplans", /\b(invest(ment)? plans?|my dca|model portfolio)\b|แผนลงทุน|แผน DCA/i],
  ["unlocks", /\b(upcoming unlocks|unlocks? (this|next) (week|month)|which (tokens|coins) (will )?unlock|biggest unlocks|market unlocks|unlock calendar)\b|unlock(อะไร|ไหน)บ้าง|เหรียญไหน(จะ)?(ปลดล็อก|unlock)|ปฏิทิน ?unlock/i],
  ["onchain", /\b(on-?chain|transactions?|txs?|tx hash|wallet activity|transfers?|smart contracts?|contract address|snowtrace)\b|ธุรกรรม|บนเชน|ออนเชน|โอน(เข้า|ออก)|สัญญาอัจฉริยะ|0x[0-9a-f]{40}/i],
];

async function extractSymbols(text: string): Promise<string[]> {
  const found: string[] = [];
  const add = (s: string) => {
    if (!found.includes(s)) found.push(s);
  };
  for (const word of text.toLowerCase().split(/[^a-z0-9฀-๿]+/)) if (NAMES[word]) add(NAMES[word]);
  for (const [name, sym] of Object.entries(THAI_NAMES)) if (text.includes(name)) add(sym);
  // Any other all-caps word is treated as a ticker, so unknown tokens get an honest
  // "not in dataset" answer instead of being ignored. Words like THB or AI never count, even
  // though the live list has tokens with those tickers.
  for (const m of text.matchAll(/\b[A-Z][A-Z0-9]{1,5}\b/g)) {
    if (!NOT_TICKERS.has(m[0])) add(m[0]);
  }
  // Names of the tracked tokens as whole words. Not the whole live list: 650+ names include
  // "RE" and "UR", which sit inside "are" and "your".
  const words = new Set(text.toLowerCase().split(/[^a-z0-9]+/));
  for (const t of (await trackedTokens()).data) if (words.has(t.name.toLowerCase())) add(t.symbol.toUpperCase());
  return found.slice(0, 3);
}

async function extractAmountThb(text: string): Promise<number | null> {
  const num = (s: string, k?: string) => Number(s.replace(/,/g, "")) * (k ? 1000 : 1);
  let m = /(?:฿|thb\s?)\s?(\d[\d,]*(?:\.\d+)?)\s?(k)?\b/i.exec(text) ?? /(\d[\d,]*(?:\.\d+)?)\s?(k)?\s?(?:baht|thb|บาท)/i.exec(text);
  if (m) return num(m[1], m[2]);
  m = /\$\s?(\d[\d,]*(?:\.\d+)?)\s?(k)?\b/i.exec(text) ?? /(\d[\d,]*(?:\.\d+)?)\s?(k)?\s?(?:usd|dollars?)\b/i.exec(text);
  if (m) return Math.round(num(m[1], m[2]) * (await usdToThb()));
  // "buy ARB 5000": a bare amount right after the ticker is read as baht.
  m = /\b[A-Za-z]{2,6}\s+(\d[\d,]{2,}(?:\.\d+)?)\s?(k)?\b/.exec(text);
  return m ? num(m[1], m[2]) : null;
}

export async function makePlan(message: string): Promise<Plan> {
  const intents = INTENTS.filter(([, re]) => re.test(message)).map(([i]) => i);
  const symbols = await extractSymbols(message);
  const amountThb = intents.includes("buy") ? await extractAmountThb(message) : null;
  const tradeOrRisk = intents.some((i) => i === "buy" || i === "sell" || i === "risk");
  const app = intents.some((i) => APP_TOOLS.some(([a]) => a === i));
  const acting = app || intents.some((i) => i === "buy" || i === "sell" || i === "scan" || i === "drift" || i === "stress");
  const faq = !acting && (symbols.length === 0 || intents.includes("learn")) ? matchFaq(message) : null;
  if (intents.length === 0) intents.push(symbols.length ? "risk" : "help");
  return { intents, symbols, amountThb, faq, needsSymbol: tradeOrRisk && symbols.length === 0 && !intents.includes("scan") && !app };
}

/** Runs the plan's tools. Independent calls run in parallel. */
export async function runPlan(plan: Plan, message: string, ctx: RunContext): Promise<void> {
  const has = (i: Intent) => plan.intents.includes(i);
  if (plan.faq || plan.needsSymbol) return;

  // Questions about the app's own data (orders, alerts, plan, invest plans, market unlocks,
  // on-chain activity) read that data and nothing else. A buy/sell question goes the usual way.
  const app = APP_TOOLS.filter(([i]) => has(i) && (ctx.scope === "user" || !PERSONAL.has(i)));
  if (appQuestion(plan) && !has("buy") && !has("sell")) {
    const id = /0x[0-9a-fA-F]{64}|0x[0-9a-fA-F]{40}/.exec(message)?.[0];
    const network = /\b(main ?net|c-?chain)\b/i.test(message) ? "mainnet" : "fuji";
    await Promise.all(
      app.map(([i, tool]) =>
        i === "onchain"
          ? id
            ? executeTool("lookup_onchain", { id, network }, ctx)
            : executeTool("get_wallet_activity", { address: null, network }, ctx)
          : executeTool(tool, tool === "get_upcoming_unlocks" ? { days: 30 } : {}, ctx),
      ),
    );
    return;
  }

  if (has("scan")) {
    if (ctx.scope === "public") return;
    await executeTool("get_portfolio", {}, ctx);
    const rateable = (ctx.holdings ?? []).map((h) => h.symbol).filter((s) => !STABLES.has(s));
    await Promise.all(rateable.map((symbol) => executeTool("assess_unlock_risk", { symbol, trade_amount_thb: null }, ctx)));
    for (const card of ctx.cards.values()) {
      if (card.level === "high" || card.level === "medium") {
        await executeTool("propose_protection", { symbol: card.symbol, action: "price_alert" }, ctx);
      }
    }
    await Promise.all([
      executeTool("check_portfolio_drift", {}, ctx),
      executeTool("stress_test_portfolio", {}, ctx),
      rateable.length ? executeTool("get_market_news", { query: "", symbols: rateable, days: 14 }, ctx) : Promise.resolve(),
    ]);
    return;
  }

  if (has("drift") || has("stress")) {
    if (ctx.scope === "public") return;
    await Promise.all([
      has("drift") ? executeTool("check_portfolio_drift", {}, ctx) : Promise.resolve(),
      has("stress") ? executeTool("stress_test_portfolio", {}, ctx) : Promise.resolve(),
    ]);
    return;
  }

  const jobs: Promise<unknown>[] = [];
  const macroAsked = /\b(fed|fomc|rates?|macro|inflation)\b|ดอกเบี้ย|เฟด/i.test(message);
  if (plan.symbols.length && (has("buy") || has("sell") || has("risk"))) {
    for (const symbol of plan.symbols) {
      jobs.push(executeTool("assess_unlock_risk", { symbol, trade_amount_thb: has("buy") ? plan.amountThb : null }, ctx));
      jobs.push(executeTool("get_token_market", { symbol }, ctx));
    }
    if (has("buy") || has("sell")) jobs.push(executeTool("get_market_pulse", {}, ctx));
  }
  if (has("news") || has("buy") || has("sell") || has("risk") || plan.symbols.length || macroAsked) {
    jobs.push(executeTool("get_market_news", { query: message, symbols: plan.symbols, days: 14 }, ctx));
  }
  const majors = plan.symbols.some((s) => s === "BTC" || s === "ETH");
  if (has("news") && (majors || plan.symbols.length === 0)) jobs.push(executeTool("get_market_pulse", {}, ctx));
  if (has("odds") || macroAsked || (has("news") && plan.symbols.length === 0) || (majors && (has("buy") || has("sell")))) {
    jobs.push(executeTool("get_event_odds", { topic: macroAsked || has("odds") ? "fed rates" : plan.symbols.join(" ") || "crypto" }, ctx));
  }
  if (has("calendar") || (has("odds") && macroAsked)) jobs.push(executeTool("get_event_calendar", { days: 45 }, ctx));
  await Promise.all(jobs);

  for (const symbol of plan.symbols) {
    const card = ctx.cards.get(symbol);
    if (card && (card.level === "high" || card.level === "medium")) {
      await executeTool("propose_protection", { symbol, action: has("buy") ? "pause_buying" : "price_alert" }, ctx);
    }
  }
}

/** Price line and a trade check (facts plus the user's options) for buy/sell questions. */
function tradeLines(ctx: RunContext, plan: Plan, th: boolean): string[] {
  const out: string[] = [];
  const mood = ctx.pulse?.data.sentiment;
  for (const symbol of plan.symbols) {
    const m = ctx.markets.get(symbol);
    const card = ctx.cards.get(symbol);
    if (m) {
      const ch = m.change24hPct === null ? "" : ` (${signedPct(m.change24hPct)} ${th ? "ใน 24 ชม." : "in 24h"})`;
      out.push(th ? `ราคา ${symbol} ตอนนี้ ${usdFull(m.priceUsd)}${ch}` : `${symbol} trades at ${usdFull(m.priceUsd)}${ch}.`);
    }
    const flags: string[] = [];
    if (card && (card.level === "high" || card.level === "medium")) {
      const when = card.timing === "continuous" ? (th ? "ทยอยปลดล็อกทุกวัน" : "releasing daily") : card.unlockDate ? (th ? `unlock ${thaiDate(card.unlockDate)}` : `unlock ${shortDate(card.unlockDate)}`) : "";
      flags.push(th ? `ความเสี่ยง unlock ${LEVEL_TH[card.level]} (${when})` : `${LEVEL_LABEL[card.level].toLowerCase()} unlock risk (${when})`);
    }
    if (m?.change24hPct !== null && m?.change24hPct !== undefined && Math.abs(m.change24hPct) >= 8) {
      flags.push(th ? `ราคาเคลื่อน ${signedPct(m.change24hPct)} ใน 24 ชม.` : `price moved ${signedPct(m.change24hPct)} in 24h${m.change24hPct > 0 ? " (careful chasing it)" : ""}`);
    }
    const headlines = (ctx.news?.data ?? []).filter((n) => n.symbols.includes(symbol)).length;
    if (headlines) flags.push(th ? `ข่าวล่าสุด ${headlines} ข่าว` : `${headlines} recent headline${headlines === 1 ? "" : "s"}`);
    if (mood && (mood.value >= 75 || mood.value <= 25)) flags.push(`Fear & Greed ${mood.value} (${mood.label})`);
    if (plan.intents.includes("buy") || plan.intents.includes("sell")) {
      if (th) {
        out.push(`U-Guard ตรวจ ${symbol}: ${flags.length ? flags.join(" · ") : "ไม่พบสัญญาณเตือน"}. ทางเลือก: รอหลังวัน unlock, ลดขนาด, ตั้งจุดตัดขาดทุน หรือให้ร่างแผนในหน้า Trade · คุณเป็นคนตัดสินใจ`);
      } else {
        out.push(
          `U-Guard trade check for ${symbol}: ${flags.length ? flags.join(" · ") : "no warning signs"}. Your options: wait until after the unlock, a smaller amount, a stop-loss, or a checked plan on the Trade page. You decide.`,
        );
      }
    }
  }
  return out;
}

function stressLines(ctx: RunContext, th: boolean): string[] {
  const st = ctx.stress;
  if (!st) return [];
  const worst = [...st.scenarios].sort((a, b) => a.impactThb - b.impactThb)[0];
  if (!worst) return [];
  if (th) return [`ทดสอบสถานการณ์: ถ้า${worst.label} พอร์ตจะลดลงราว ${compact(-worst.impactThb)} บาท (${Math.abs(worst.impactPct).toFixed(1)}% ของพอร์ต)`, ...st.handles.slice(0, 1).map((h) => h.text)];
  return [st.lines[0], ...st.handles.slice(0, 1).map((h) => h.text)];
}

function cardLine(card: RiskCard, mode: AnswerMode): string {
  if (card.level === "none") return `${card.symbol}: no unlocks in the next 30 days.`;
  const head = `${card.symbol} · ${LEVEL_LABEL[card.level]} unlock risk (${card.score}/100).`;
  if (mode === "beginner") return `${head} ${card.plain}`;
  const recipient = card.reasons.find((r) => r.startsWith("Main recipient")) ?? "";
  return `${head} ${card.reasons[0]} ${recipient}`.trim();
}

function cardLineTh(card: RiskCard, mode: AnswerMode): string {
  if (card.level === "none") return `${card.symbol}: ${card.reasons[0]}`;
  const head = `${card.symbol}: ${LEVEL_TH[card.level]} (${card.score}/100)`;
  if (mode === "beginner") return `${head} · ${card.plain}`;
  const recipient = card.reasons.find((r) => r.startsWith("ผู้รับหลัก"));
  return `${head} · ${card.reasons[0]}${recipient ? ` · ${recipient}` : ""}`;
}

/** Thai version of composeReply: same facts, same tools, Thai sentences. */
function composeReplyTh(ctx: RunContext, plan: Plan, mode: AnswerMode): string {
  const lines: string[] = [];
  const has = (i: Intent) => plan.intents.includes(i);

  if (plan.faq) return plan.faq.a;
  if ((has("scan") || has("drift") || has("stress") || personalQuestion(plan)) && ctx.scope === "public") {
    return "เข้าสู่ระบบเพื่อสแกนกระเป๋าของคุณ ระหว่างนี้ถามเรื่องเหรียญไหนก็ได้ เช่น “ARB ตอนนี้เสี่ยงไหม”";
  }
  if (appQuestion(plan) && !has("buy") && !has("sell")) return appReply(ctx, plan, true);
  if (plan.needsSymbol || (plan.intents.includes("help") && ctx.trace.every((s) => s.kind !== "tool"))) {
    return "บอกชื่อเหรียญที่อยากเช็กได้เลย เช่น “ซื้อ ARB 5,000 บาท” หรือ “สแกนพอร์ตของฉัน”";
  }

  const cards = [...ctx.cards.values()];
  if (has("scan")) {
    const flagged = cards.filter((c) => c.level === "high" || c.level === "medium");
    flagged.forEach((c) => lines.push(cardLineTh(c, mode)));
    const calm = cards.filter((c) => c.level === "low" || c.level === "none");
    calm.forEach((c) => lines.push(cardLineTh(c, "pro")));
    const noVesting = [...ctx.notes.keys(), ...(ctx.holdings ?? []).map((h) => h.symbol).filter((sym) => STABLES.has(sym))];
    if (noVesting.length) lines.push(`${[...new Set(noVesting)].join(", ")}: ไม่มีตาราง vesting unlock`);
    if (ctx.drift) lines.push(...new Set([ctx.drift.lines[0], ctx.drift.lines[ctx.drift.lines.length - 1]]));
    lines.push(...stressLines(ctx, true));
  } else if ((has("drift") && ctx.drift) || (has("stress") && ctx.stress)) {
    if (ctx.drift) lines.push(...ctx.drift.lines);
    lines.push(...stressLines(ctx, true));
  } else {
    for (const symbol of plan.symbols) {
      const card = ctx.cards.get(symbol);
      if (card) lines.push(cardLineTh(card, mode));
      else if (ctx.notes.has(symbol)) lines.push(`${symbol}: ${ctx.notes.get(symbol)}`);
    }
    lines.push(...tradeLines(ctx, plan, true));
  }

  if (ctx.proposals.length) lines.push("มีข้อเสนอให้ตั้งการป้องกันในการ์ดด้านล่าง คุณเป็นคนตัดสินใจเอง");

  const news = (ctx.news?.data ?? []).slice(0, mode === "pro" ? 2 : 1);
  for (const item of news) {
    const cite = ctx.citations.find((c) => c.url === item.url && c.title === item.summary);
    lines.push(`ข่าว: ${item.summary}${cite ? ` [${cite.n}]` : ""}`);
  }
  if (!has("scan") && (has("news") || plan.symbols.length) && ctx.news && ctx.news.data.length === 0) {
    lines.push("ไม่พบข่าวที่เกี่ยวข้องในช่วง 2 สัปดาห์ที่ผ่านมา");
  }

  const pulse = ctx.pulse?.data;
  if (pulse?.btc) {
    const change = pulse.btc.change24hPct === null ? "" : ` (${signedPct(pulse.btc.change24hPct)} วันที่ ${thaiDate(pulse.btc.date)})`;
    const mood = pulse.sentiment ? ` · Fear & Greed ${pulse.sentiment.value} (${pulse.sentiment.label})` : "";
    lines.push(`Bitcoin ${usdFull(pulse.btc.priceUsd)}${change}${mood}`);
  }

  const market = ctx.odds?.data[0];
  if (market) {
    const outcomes = [...market.outcomes]
      .sort((a, b) => b.probability - a.probability)
      .map((o) => `${o.name.toLowerCase()} ${Math.round(o.probability * 100)}%`)
      .join(", ");
    const via = market.reportedBy ? ` via ${market.reportedBy.name}` : "";
    const when = ctx.odds && ctx.odds.source !== "live" ? `, ${thaiDate(ctx.odds.asOf)}` : "";
    lines.push(`ตลาดคาดการณ์ “${market.question.trim()}”: ${outcomes} (${market.provider}${via}${when})`);
  }

  if (ctx.calendar?.length) {
    const today = new Date(ctx.now).toISOString().slice(0, 10);
    const next = ctx.calendar.slice(0, 3).map((e) => `${e.date === today ? "วันนี้" : thaiDate(e.date)} ${e.title.replace(/:.*$/, "")}`);
    lines.push(`เร็วๆ นี้: ${next.join("; ")}`);
  }

  if (lines.length === 0) lines.push("ไม่พบข้อมูลเรื่องนี้ ลองบอกชื่อเหรียญ (ARB, WLD, AVAX, BTC) หรือให้สแกนพอร์ต");
  if (ctx.sources.has("sample")) lines.push("(ข้อมูลตัวอย่าง)");
  return lines.join("\n");
}

const appQuestion = (plan: Plan) => plan.intents.some((i) => APP_TOOLS.some(([a]) => a === i));
const personalQuestion = (plan: Plan) => plan.intents.some((i) => PERSONAL.has(i));

/* eslint-disable @typescript-eslint/no-explicit-any -- tool results are plain JSON built in tools.ts */
/** Replies about the app's own data, from the tool results only (English or Thai). */
function appReply(ctx: RunContext, plan: Plan, th: boolean): string {
  const has = (i: Intent) => plan.intents.includes(i);
  const d = (tool: string) => ctx.data.get(tool) as any;
  const lines: string[] = [];
  const signed = (n: number) => `${n >= 0 ? "+" : "−"}${thb(Math.abs(n))}`;
  const day = (iso: string | null) => (iso ? (th ? thaiDate(iso) : shortDate(iso)) : "–");

  const t = d("get_paper_trading");
  if (has("orders") && t) {
    if (t.positions.length) {
      lines.push(
        (th ? "สถานะเทรดจำลอง: " : "Paper positions: ") +
          t.positions.map((p: any) => `${p.symbol} ${p.qty} (${th ? "มูลค่า" : "value"} ${thb(p.value_thb)}, P&L ${signed(p.pnl_thb)})`).join(" · "),
      );
    } else lines.push(th ? "ยังไม่มีสถานะเทรดจำลอง" : "No paper positions yet.");
    for (const o of t.orders.slice(0, 3)) {
      lines.push(
        th
          ? `${o.side === "buy" ? "ซื้อ" : "ขาย"} ${o.symbol} ${thb(o.amount_thb)} เมื่อ ${day(o.at)} · บันทึกบน ${o.receipt.chain}${o.broker ? ` · ${o.broker.note}` : ""}`
          : `${o.side === "buy" ? "Bought" : "Sold"} ${o.symbol} for ${thb(o.amount_thb)} on ${day(o.at)} · recorded on ${o.receipt.chain}${o.broker ? ` · ${o.broker.note}` : ""}`,
      );
    }
    if (t.pending_plans.length) {
      lines.push(th ? `มีแผนเทรด ${t.pending_plans.length} แผนรอคุณอนุมัติในหน้า Trade` : `${t.pending_plans.length} trade plan(s) waiting for your approval on the Trade page.`);
    }
  }

  const a = d("list_alerts");
  if (has("alerts") && a) {
    if (a.rules.length) {
      const rule = (r: any) => `${r.type} ${r.symbol === "*" ? (th ? "ทุกเหรียญ" : "every holding") : r.symbol} (${r.min_level}+)`;
      lines.push(th ? `กฎแจ้งเตือน ${a.rules.length} ข้อ: ${a.rules.map(rule).join(", ")}` : `${a.rules.length} alert rule(s): ${a.rules.map(rule).join(", ")}.`);
    } else lines.push(th ? "ยังไม่ได้ตั้งกฎแจ้งเตือน ตั้งได้ที่หน้า Alerts" : "No alert rules yet. Set them on the Alerts page.");
    if (a.recent_alerts.length) lines.push((th ? "แจ้งเตือนล่าสุด: " : "Latest alerts: ") + a.recent_alerts.slice(0, 3).map((e: any) => e.title).join(" · "));
    if (a.last_check?.held_back?.length) {
      lines.push(th ? `รอบล่าสุดยังไม่ส่ง ${a.last_check.held_back.length} เรื่อง (${a.last_check.held_back[0].reason})` : `${a.last_check.held_back.length} held back on the last check (${a.last_check.held_back[0].reason}).`);
    }
  }

  const p = d("get_my_plan");
  if (has("myplan") && p) {
    lines.push(...p.summary.slice(0, 2));
    for (const i of p.items.slice(0, 4)) lines.push(`${day(i.date)} · ${i.title}`);
  }

  const ip = d("get_invest_plans");
  if (has("investplans") && ip) {
    const one = (x: any, state: string) => `"${x.profile}" · DCA ${thb(x.monthly_thb)}${th ? "/เดือน" : "/month"} · ${state}`;
    for (const x of ip.approved.slice(0, 2)) lines.push(one(x, th ? "อนุมัติแล้ว" : "approved"));
    for (const x of ip.pending.slice(0, 2)) lines.push(one(x, th ? "รออนุมัติในหน้า Invest" : "waiting for your approval on the Invest page"));
    if (!ip.approved.length && !ip.pending.length) lines.push(th ? "ยังไม่มีแผนลงทุน ตอบคำถาม 5 ข้อในหน้า Invest ได้เลย" : "No investment plans yet. Answer the 5 questions on the Invest page.");
  }

  const u = d("get_upcoming_unlocks");
  if (has("unlocks") && u) {
    const from = u.data === "live" ? "Tokenomist live" : th ? "รายงานที่บันทึกไว้" : "saved reports";
    if (u.unlocks.length) {
      lines.push(
        (th ? `unlock ใหญ่ที่กำลังมา (${from}): ` : `Next big unlocks (${from}): `) +
          u.unlocks.slice(0, 5).map((x: any) => `${x.symbol} ${day(x.date)} (${x.size})`).join(" · "),
      );
    } else lines.push(th ? `ไม่มี unlock ใหญ่ใน ${u.window_days} วันข้างหน้า (${from})` : `No large cliff unlocks in the next ${u.window_days} days (${from}).`);
  }

  const w = d("get_wallet_activity");
  const lk = d("lookup_onchain");
  if (has("onchain") && w) {
    if (!w.available) lines.push(w.note ?? (th ? "อ่านข้อมูลบนเชนไม่ได้ตอนนี้" : "On-chain data isn't available right now."));
    else {
      const short = `${w.address.slice(0, 6)}…${w.address.slice(-4)}`;
      lines.push(
        th
          ? `กระเป๋า ${short} บน ${w.network}: ${w.native?.balance ?? "–"} AVAX · token ${w.tokens.length} ตัว (Avalanche Data API)`
          : `Wallet ${short} on ${w.network}: ${w.native?.balance ?? "–"} AVAX · ${w.tokens.length} token(s) (Avalanche Data API)`,
      );
      for (const x of w.transactions.slice(0, 3)) {
        lines.push(`${day(x.time)} · ${x.method ?? (th ? "โอน" : "transfer")}${x.value_avax ? ` · ${x.value_avax} AVAX` : ""} · ${x.status ?? ""} · ${x.explorer}`);
      }
      if (!w.transactions.length) lines.push(th ? "ยังไม่มีธุรกรรม" : "No transactions yet.");
    }
  } else if (has("onchain") && lk) {
    if (lk.source !== "live") lines.push(lk.note ?? (th ? "อ่านข้อมูลบนเชนไม่ได้ตอนนี้" : "On-chain data isn't available right now."));
    else if (lk.tx) lines.push(`${th ? "ธุรกรรม" : "Transaction"} ${lk.tx.hash.slice(0, 10)}… · ${lk.tx.status ?? "?"} · ${lk.tx.method ?? ""} · ${day(lk.tx.time)} · ${lk.tx.explorerUrl}`);
    else if (lk.contract) lines.push(`${th ? "สัญญา" : "Contract"} ${lk.contract.name ?? "?"}${lk.contract.symbol ? ` (${lk.contract.symbol})` : ""} · ${lk.contract.ercType ?? ""} · ${lk.contract.explorerUrl}`);
    else lines.push(lk.note ?? "");
  }

  if (lines.length === 0) lines.push(th ? "ยังไม่มีข้อมูลส่วนนี้" : "Nothing to show for that yet.");
  if (ctx.sources.has("sample")) lines.push(th ? "(ข้อมูลตัวอย่าง)" : "(sample data)");
  return lines.join("\n");
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Writes the answer from what the tools found. Only numbers from tool results appear. */
export function composeReply(ctx: RunContext, plan: Plan, mode: AnswerMode): string {
  if (ctx.locale === "th") return composeReplyTh(ctx, plan, mode);
  const lines: string[] = [];
  const has = (i: Intent) => plan.intents.includes(i);

  if (plan.faq) return plan.faq.a;
  if ((has("scan") || has("drift") || has("stress") || personalQuestion(plan)) && ctx.scope === "public") {
    return "Sign in to scan your own wallet. Meanwhile, ask me about any token, for example “Is ARB risky right now?”";
  }
  if (appQuestion(plan) && !has("buy") && !has("sell")) return appReply(ctx, plan, false);
  if (plan.needsSymbol) {
    return "Which token do you mean? Name it, for example ARB, WLD or AVAX, and I'll check its unlock schedule and news before you decide.";
  }
  if (plan.intents.includes("help") && ctx.trace.every((s) => s.kind !== "tool")) {
    return "I check what could move your money before you act: scheduled token unlocks, news, and what markets are pricing. Try “I want to buy ARB”, “Scan my portfolio” or “What's moving Bitcoin this week?”";
  }

  const cards = [...ctx.cards.values()];
  if (has("scan")) {
    const flagged = cards.filter((c) => c.level === "high" || c.level === "medium");
    const held = ctx.holdings?.length ?? 0;
    lines.push(
      flagged.length
        ? `I checked ${held} holdings. ${flagged.length === 1 ? "One needs" : `${flagged.length} need`} attention: ${flagged.map((c) => `${c.symbol} (${LEVEL_LABEL[c.level].toLowerCase()})`).join(", ")}.`
        : `I checked ${held} holdings. None has a significant unlock in the next 30 days.`,
    );
    flagged.forEach((c) => lines.push(cardLine(c, mode)));
    const calm = cards.filter((c) => c.level === "low" || c.level === "none").map((c) => c.symbol);
    const noVesting = [...ctx.notes.keys(), ...(ctx.holdings ?? []).map((h) => h.symbol).filter((sym) => STABLES.has(sym))];
    if (calm.length) lines.push(`${calm.join(", ")}: low or no unlock pressure.`);
    if (noVesting.length) lines.push(`${noVesting.join(", ")}: no vesting unlocks apply.`);
    if (ctx.drift) lines.push(...new Set([ctx.drift.lines[0], ctx.drift.lines[ctx.drift.lines.length - 1]]));
    lines.push(...stressLines(ctx, false));
  } else if ((has("drift") && ctx.drift) || (has("stress") && ctx.stress)) {
    if (ctx.drift) lines.push(...ctx.drift.lines);
    if (ctx.stress) lines.push(...ctx.stress.lines, ...ctx.stress.handles.slice(0, 2).map((h) => h.text));
  } else {
    for (const symbol of plan.symbols) {
      const card = ctx.cards.get(symbol);
      if (card) lines.push(cardLine(card, mode));
      else if (ctx.notes.has(symbol)) lines.push(`${symbol}: ${ctx.notes.get(symbol)}`);
    }
    lines.push(...tradeLines(ctx, plan, false));
  }

  if (ctx.proposals.length) {
    lines.push(
      `I've prepared ${ctx.proposals.length === 1 ? "a protection rule" : "protection rules"} below. Nothing happens unless you approve it.`,
    );
  }

  const news = (ctx.news?.data ?? []).slice(0, mode === "pro" ? 2 : 1);
  for (const item of news) {
    const cite = ctx.citations.find((c) => c.url === item.url && c.title === item.summary);
    lines.push(`In the news: ${item.summary}${cite ? ` [${cite.n}]` : ""}`);
  }
  if (!has("scan") && (has("news") || plan.symbols.length) && ctx.news && ctx.news.data.length === 0) {
    lines.push("I found no relevant news for this in the last two weeks.");
  }

  const pulse = ctx.pulse?.data;
  if (pulse?.btc) {
    const change = pulse.btc.change24hPct === null ? "" : ` (${signedPct(pulse.btc.change24hPct)} on ${shortDate(pulse.btc.date)})`;
    const mood = pulse.sentiment ? `; Fear & Greed ${pulse.sentiment.value} (${pulse.sentiment.label})` : "";
    lines.push(`Bitcoin ${usdFull(pulse.btc.priceUsd)}${change}${mood}.`);
    if (mode === "pro" && pulse.etfFlows.length) {
      lines.push(`Spot ETF flows, ${pulse.etfFlows[0].label}: ${pulse.etfFlows.map((f) => `${f.asset} ${usd(f.netUsd)}`).join(", ")}.`);
    }
    if (pulse.impliedMove) {
      lines.push(
        `Options imply a ±${pulse.impliedMove.pct.toFixed(1)}% ${pulse.impliedMove.days}-day BTC range (${usd(pulse.impliedMove.low)} to ${usd(pulse.impliedMove.high)}), at roughly two-in-three odds.`,
      );
    }
  }

  const market = ctx.odds?.data[0];
  if (market) {
    const outcomes = [...market.outcomes]
      .sort((a, b) => b.probability - a.probability)
      .map((o) => `${o.name.toLowerCase()} ${Math.round(o.probability * 100)}%`)
      .join(", ");
    const via = market.reportedBy ? ` via ${market.reportedBy.name}` : "";
    const when = ctx.odds && ctx.odds.source !== "live" ? `, ${shortDate(ctx.odds.asOf)}` : "";
    const question = market.question.trim().endsWith("?") ? `“${market.question.trim()}”` : `the ${market.question.trim()}`;
    lines.push(`Traders price ${question}: ${outcomes} (${market.provider}${via}${when}).`);
  }

  if (ctx.calendar?.length) {
    const today = new Date(ctx.now).toISOString().slice(0, 10);
    const next = ctx.calendar
      .slice(0, 3)
      .map((e) => `${e.date === today ? "today" : shortDate(e.date)} ${e.title.replace(/:.*$/, "")}`);
    lines.push(`Coming up: ${next.join("; ")}.`);
  }

  if (lines.length === 0) {
    lines.push("I couldn't find data for that. Try naming a token (ARB, WLD, AVAX, BTC) or ask me to scan your portfolio.");
  }
  if (ctx.sources.has("sample")) lines.push("(sample data)");
  return lines.join("\n");
}

/** A plan that matches what the tools already found (used to rewrite an LLM answer). */
export function planFromContext(ctx: RunContext, base: Plan): Plan {
  const symbols = [...new Set([...base.symbols, ...ctx.cards.keys(), ...ctx.notes.keys()])];
  return { ...base, symbols, needsSymbol: false, faq: null, intents: base.intents.filter((i) => i !== "help") };
}

export async function runRules(message: string, _history: ChatTurn[], mode: AnswerMode, ctx: RunContext): Promise<{ reply: string; plan: Plan }> {
  const t0 = Date.now();
  const plan = await makePlan(message);
  ctx.trace.push({
    kind: "plan",
    name: "rules_planner",
    summary: `intent: ${plan.intents.join("+")}${plan.symbols.length ? ` · ${plan.symbols.join(", ")}` : ""}${plan.amountThb ? ` · ฿${compact(plan.amountThb)}` : ""}`,
    ms: Date.now() - t0,
    ok: true,
  });
  await runPlan(plan, message, ctx);
  return { reply: composeReply(ctx, plan, mode), plan };
}
