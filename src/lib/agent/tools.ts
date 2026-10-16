// The agent's tools. Every provider (OpenAI-compatible LLM, Anthropic, the rules engine)
// and the MCP endpoint run tools through executeTool(), so validation, the Agent Trace and
// citations behave the same everywhere.
//
// The three tools that write (draft a trade plan, draft an invest plan, save an alert rule) are for
// U-Bot over MCP only (MCP_ONLY); the in-app chat reads everything else. No tool approves or
// executes anything; approval happens only in the app, behind the user's own session.

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { addAlertRule } from "../alert-rules";
import { ADDRESS_RE, lookupOnchain, walletActivity, type AvaxNetwork } from "../avalanche-data";
import { config } from "../config";
import { compact, shortDate, thaiDate, thb, usd } from "../format";
import { asOfEn, asOfTh } from "../freshness";
import { checkDrift } from "../drift";
import { stressTest, type StressReport } from "../stress";
import { getEventCalendar } from "../intel/calendar";
import { searchNews } from "../intel/news";
import { getEventOdds } from "../intel/odds";
import { getMarketPulse } from "../intel/pulse";
import { getQuote } from "../market";
import { getHoldings } from "../portfolio";
import { assessUnlockRisk } from "../risk";
import { store } from "../store";
import { findToken, getAllocations, getFundraising, getUnlockEvents } from "../tokenomist";
import { marketUnlocks } from "../unlock-feed";
import type {
  CalendarEvent,
  Citation,
  DataSource,
  DriftReport,
  Holding,
  Locale,
  MarketPulse,
  NewsItem,
  OddsMarket,
  Proposal,
  ProtectionAction,
  RiskCard,
  Sourced,
  TraceStep,
  TradeSide,
} from "../types";

/** JSON Schema tool spec, written strict-compatible (every property required, no extras). */
export interface ToolSpec {
  name: ToolName;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required: string[]; additionalProperties: false };
}

/** MCP tool annotations: hints for the client (e.g. when to ask the user first), not enforcement. */
export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint: boolean;
}

const symbolProp = { type: "string", description: "Token ticker, e.g. ARB, WLD, AVAX, BTC" } as const;
const noInput = { type: "object", properties: {}, required: [], additionalProperties: false } as const;

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: "get_portfolio",
    description:
      "List the user's holdings in their U-topia self-custody wallet (symbol, amount, value in THB). Call this first when the user asks about their portfolio or what they hold.",
    input_schema: { ...noInput, required: [] },
  },
  {
    name: "lookup_token",
    description: "Tokenomist overview of one token: price, market cap, FDV, share of max supply already circulating, latest fundraising round.",
    input_schema: { type: "object", properties: { symbol: symbolProp }, required: ["symbol"], additionalProperties: false },
  },
  {
    name: "get_unlock_schedule",
    description: "Token unlock events for one token within the next N days, with who receives the tokens.",
    input_schema: {
      type: "object",
      properties: { symbol: symbolProp, days: { type: "integer", description: "Look-ahead window in days (1-90)" } },
      required: ["symbol", "days"],
      additionalProperties: false,
    },
  },
  {
    name: "get_allocations",
    description: "How a token's total supply is split (team, investors, community...) and how much of each is still locked.",
    input_schema: { type: "object", properties: { symbol: symbolProp }, required: ["symbol"], additionalProperties: false },
  },
  {
    name: "get_fundraising",
    description: "A token's venture funding rounds: date, amount raised, valuation, price per token.",
    input_schema: { type: "object", properties: { symbol: symbolProp }, required: ["symbol"], additionalProperties: false },
  },
  {
    name: "assess_unlock_risk",
    description:
      "Compute the unlock risk score (0-100) and level for one token: upcoming unlocks in the next 30 days, unlocks in the last 14 days, and continuous releases, weighted by size vs circulating supply, size vs daily volume, recipient type and investor profit. The score is authoritative: report it, never recompute it. The app shows the result as a risk card.",
    input_schema: {
      type: "object",
      properties: {
        symbol: symbolProp,
        trade_amount_thb: {
          anyOf: [{ type: "number" }, { type: "null" }],
          description: "THB amount the user intends to buy, if they mentioned one; otherwise null",
        },
      },
      required: ["symbol", "trade_amount_thb"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_protection",
    description:
      "Offer the user a protection rule for a token with medium or high unlock risk. This only creates a proposal card; nothing happens until the user taps approve, which records the rule on Avalanche. price_alert = alert if price drops 10% around the unlock; pause_buying = pause recurring buys until 14 days after the unlock; reduce_exposure = a reminder to review position size.",
    input_schema: {
      type: "object",
      properties: { symbol: symbolProp, action: { type: "string", enum: ["price_alert", "pause_buying", "reduce_exposure"] } },
      required: ["symbol", "action"],
      additionalProperties: false,
    },
  },
  {
    name: "check_portfolio_drift",
    description:
      "Compare the user's portfolio with the target mix they set: weight vs target per token, drift in percentage points, the portfolio's weighted unlock risk score, 6-month dilution and the largest holding. Use it when the user asks whether their portfolio is off plan, balanced or concentrated, or for a full portfolio review. The app shows the result as a drift card. It measures against the user's own targets and never says what to buy or sell.",
    input_schema: { ...noInput, required: [] },
  },
  {
    name: "get_token_market",
    description:
      "Current market data for one token: price in USD, 24h change and 24h trading volume (live from Hyperliquid and CoinGecko when available). Call it with assess_unlock_risk whenever the user is about to buy or sell, or asks whether now is a good time to trade.",
    input_schema: { type: "object", properties: { symbol: symbolProp }, required: ["symbol"], additionalProperties: false },
  },
  {
    name: "stress_test_portfolio",
    description:
      "Stress-test the user's portfolio: the baht impact of an options-implied market drop, of their risky unlocks going like past team unlocks (Keyrock average), and of a 20% crypto drawdown, plus protection options per holding. Use it when the user asks how risky their portfolio is, what could go wrong, or how to handle or protect it. These are scenarios, not forecasts.",
    input_schema: { ...noInput, required: [] },
  },
  {
    name: "get_market_news",
    description:
      "Search recent news that can move a token or the market (ETF flows, macro/Fed, regulation, hacks, unlocks). Returns short summaries with source links and citation numbers; cite them as [n]. Returns an empty list when nothing relevant was found: say so instead of guessing.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for, e.g. 'bitcoin etf flows' or 'fed rate decision'" },
        symbols: { type: "array", items: symbolProp, description: "Tickers the question is about; empty for market-wide news" },
        days: { type: "integer", description: "How far back to look, in days (1-90)" },
      },
      required: ["query", "symbols", "days"],
      additionalProperties: false,
    },
  },
  {
    name: "get_event_odds",
    description:
      "Prediction-market (Polymarket) probabilities for real-world events related to a topic, e.g. 'fed rate decision' or 'bitcoin'. These are what traders are pricing, not U-Guard's forecast; always attribute them.",
    input_schema: {
      type: "object",
      properties: { topic: { type: "string", description: "Event topic, e.g. 'fed', 'bitcoin', 'recession'" } },
      required: ["topic"],
      additionalProperties: false,
    },
  },
  {
    name: "get_market_pulse",
    description:
      "Current market readings: BTC price and 24h change, the Fear & Greed sentiment index, recent ETF flows, and the options-implied 7-day BTC range when available.",
    input_schema: { ...noInput, required: [] },
  },
  {
    name: "get_event_calendar",
    description: "Scheduled events in the next N days that can move prices: Fed (FOMC) decisions and token unlocks.",
    input_schema: {
      type: "object",
      properties: { days: { type: "integer", description: "Look-ahead window in days (1-90)" } },
      required: ["days"],
      additionalProperties: false,
    },
  },
  // ─── MCP only: plans and rules U-Bot drafts for the user ───
  {
    name: "draft_trade_plan",
    description:
      "Draft a paper-trade plan around the user's own choice of token, side and THB amount: quantity at the current quote, fee, stop-loss price, the most the user could lose, size vs their risk budget, their share of the portfolio afterwards, what-if rows, and U-Guard's checks (unlock risk, balance, size, concentration, chasing a jump). verdict is ready, caution or blocked. It only drafts: nothing is bought or sold, and only the user can approve it, in the U-Guard app (Trade page), which places a simulated (paper) order recorded on Avalanche. Never pick the token or the amount for the user.",
    input_schema: {
      type: "object",
      properties: {
        symbol: symbolProp,
        side: { type: "string", enum: ["buy", "sell"] },
        amount_thb: { type: "number", description: "THB amount the user chose (100 to 10,000,000)" },
        order_type: { type: "string", enum: ["market", "limit"] },
        limit_price_usd: { anyOf: [{ type: "number" }, { type: "null" }], description: "Limit price in USD for a limit order; otherwise null" },
        stop_loss_pct: { anyOf: [{ type: "number" }, { type: "null" }], description: "Stop-loss distance in % (2-50) if the user gave one; null = 10" },
        risk_budget_pct: { anyOf: [{ type: "number" }, { type: "null" }], description: "Most of the portfolio the user will risk on one trade, in % (0.5-10); null = 2" },
      },
      required: ["symbol", "side", "amount_thb", "order_type", "limit_price_usd", "stop_loss_pct", "risk_budget_pct"],
      additionalProperties: false,
    },
  },
  {
    name: "get_paper_trading",
    description: "The user's paper-trading account: positions (quantity, cost, value now, unrealised P/L in THB), recent paper orders with their Avalanche receipts, and trade plans still waiting for the user's approval.",
    input_schema: { ...noInput, required: [] },
  },
  {
    name: "get_invest_options",
    description:
      "What the Invest planner needs: the five risk-profile questions with their answer choices (1-4), the asset classes with their risk level (Thai SEC 1-8 scale, crypto 8+), and each profile's model portfolio. Ask the user the questions yourself and pass their answers to draft_invest_plan; never answer for them. Sample data.",
    input_schema: { ...noInput, required: [] },
  },
  {
    name: "draft_invest_plan",
    description:
      "Draft an investment plan from the user's own answers to the five risk-profile questions (see get_invest_options): profile, model-portfolio weights (or the user's own weights), lump-sum and monthly DCA split, U-Guard's checks on the crypto part (each pick's unlock risk, crypto share vs the profile) and the next three DCA dates, flagged when one lands near a big unlock. It only drafts: the user reviews and approves it in the U-Guard app (Invest page). Educational model portfolio on sample data, not personal investment advice.",
    input_schema: {
      type: "object",
      properties: {
        answers: { type: "array", items: { type: "integer" }, description: "The user's five answers in order, each 1-4" },
        lump_sum_thb: { type: "number", description: "One-off amount in THB (0 if none)" },
        monthly_thb: { type: "number", description: "Monthly DCA amount in THB (0 if none)" },
        dca_day: { type: "integer", description: "Day of the month for the DCA buy (1-28)" },
        crypto_picks: { type: "array", items: symbolProp, description: "Coins for the crypto part, up to 5; empty = BTC and ETH" },
        weights: {
          anyOf: [
            {
              type: "array",
              items: {
                type: "object",
                properties: { id: { type: "string", description: "Asset class id from get_invest_options" }, pct: { type: "number" } },
                required: ["id", "pct"],
                additionalProperties: false,
              },
            },
            { type: "null" },
          ],
          description: "The user's own weights per asset class, if they gave them (classes left out keep the profile's weight; all are scaled to 100%); otherwise null for the profile's model portfolio",
        },
      },
      required: ["answers", "lump_sum_thb", "monthly_thb", "dca_day", "crypto_picks", "weights"],
      additionalProperties: false,
    },
  },
  {
    name: "list_alerts",
    description: "The user's alert rules, the alerts U-Guard sent recently, and what the last check held back and why (already sent, quiet hours, daily limit, waiting for a second news source).",
    input_schema: { ...noInput, required: [] },
  },
  {
    name: "create_alert_rule",
    description:
      "Save an alert rule when the user asks to be told about something. unlock: a token's unlock risk reaches min_level within days_before days. drift: the wallet moves outside the band around the user's own target mix (symbol is ignored). news: negative news on the token at min_level or worse. symbol '*' = every token the user holds. Alerts reach the user's U-Bot inbox, never twice, only high severity from 22:00 to 07:00 Bangkok, and at most a few a day. Needs the user the caller acts for. Saving a rule that exists returns it.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["unlock", "drift", "news"] },
        symbol: { type: "string", description: "Token ticker, or * for every token the user holds" },
        min_level: { type: "string", enum: ["medium", "high"] },
        days_before: { type: "integer", description: "Unlock rules: how many days ahead to warn (1-30)" },
      },
      required: ["type", "symbol", "min_level", "days_before"],
      additionalProperties: false,
    },
  },
  // ─── The rest of the app, so the agent can answer about anything the user sees ───
  {
    name: "get_my_plan",
    description:
      "The user's 30-day plan, as on the My plan page: dated unlocks and daily releases of the coins they hold, Fed dates, their DCA buys, open decisions, alert rules and stop levels, with a short summary. Use it for 'what's coming up for me', 'my plan', 'this month'.",
    input_schema: { ...noInput, required: [] },
  },
  {
    name: "get_upcoming_unlocks",
    description:
      "Market-wide upcoming cliff unlocks (not just the user's coins): the next unlock of the largest tokens Tokenomist covers, with date, size, share of circulating supply and main recipient. Live from Tokenomist when available, otherwise saved public reports (the result says which).",
    input_schema: {
      type: "object",
      properties: { days: { type: "integer", description: "Look-ahead window in days (1-90)" } },
      required: ["days"],
      additionalProperties: false,
    },
  },
  {
    name: "get_invest_plans",
    description: "The user's investment plans: approved ones and drafts still waiting for their decision (profile, weights, monthly DCA, U-Guard warnings).",
    input_schema: { ...noInput, required: [] },
  },
  {
    name: "get_wallet_activity",
    description:
      "On-chain activity of an Avalanche wallet from the Avalanche Data API: AVAX balance, ERC-20 token balances and the latest transactions (with token transfers and explorer links). address null = the signed-in user's wallet (Sign-In with Ethereum) or the app's configured wallet. network fuji (testnet, where U-Guard records approvals) or mainnet (C-Chain).",
    input_schema: {
      type: "object",
      properties: {
        address: { anyOf: [{ type: "string" }, { type: "null" }], description: "0x address, or null for the user's own wallet" },
        network: { type: "string", enum: ["fuji", "mainnet"] },
      },
      required: ["address", "network"],
      additionalProperties: false,
    },
  },
  {
    name: "lookup_onchain",
    description:
      "Look up one thing on Avalanche through the Avalanche Data API: a transaction by hash (status, time, from/to, method, transfers) or a smart contract by address (name, symbol, token standard, deployer).",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Transaction hash (0x + 64 hex) or contract address (0x + 40 hex)" },
        network: { type: "string", enum: ["fuji", "mainnet"] },
      },
      required: ["id", "network"],
      additionalProperties: false,
    },
  },
];

// ─── Input validation (tool inputs are untrusted model or MCP-client output) ──────────

const Sym = z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9.\-]+$/);
const Days = z.number().int().min(1).max(90);
const INPUTS = {
  get_portfolio: z.object({}),
  lookup_token: z.object({ symbol: Sym }),
  get_unlock_schedule: z.object({ symbol: Sym, days: Days.default(30) }),
  get_allocations: z.object({ symbol: Sym }),
  get_fundraising: z.object({ symbol: Sym }),
  assess_unlock_risk: z.object({ symbol: Sym, trade_amount_thb: z.number().positive().max(1e9).nullable().default(null) }),
  propose_protection: z.object({ symbol: Sym, action: z.enum(["price_alert", "pause_buying", "reduce_exposure"]) }),
  get_market_news: z.object({
    query: z.string().trim().max(160).default(""),
    symbols: z.array(Sym).max(5).default([]),
    days: Days.default(14),
  }),
  get_event_odds: z.object({ topic: z.string().trim().min(2).max(80) }),
  get_market_pulse: z.object({}),
  check_portfolio_drift: z.object({}),
  get_token_market: z.object({ symbol: Sym }),
  stress_test_portfolio: z.object({}),
  get_event_calendar: z.object({ days: Days.default(45) }),
  draft_trade_plan: z.object({
    symbol: Sym,
    side: z.enum(["buy", "sell"]),
    amount_thb: z.number().finite().min(100).max(10_000_000),
    order_type: z.enum(["market", "limit"]).default("market"),
    limit_price_usd: z.number().finite().positive().nullable().default(null),
    stop_loss_pct: z.number().finite().min(2).max(50).nullable().default(null),
    risk_budget_pct: z.number().finite().min(0.5).max(10).nullable().default(null),
  }),
  get_paper_trading: z.object({}),
  get_invest_options: z.object({}),
  draft_invest_plan: z
    .object({
      answers: z.array(z.number().int().min(1).max(4)).length(5),
      lump_sum_thb: z.number().finite().min(0).max(100_000_000),
      monthly_thb: z.number().finite().min(0).max(10_000_000),
      dca_day: z.number().int().min(1).max(28).default(25),
      crypto_picks: z.array(Sym).max(5).default([]),
      weights: z
        .array(z.object({ id: z.string().regex(/^[a-z_]{1,20}$/), pct: z.number().finite().min(0).max(100) }))
        .max(10)
        .nullable()
        .default(null),
    })
    .refine((v) => v.lump_sum_thb + v.monthly_thb > 0, "Give a lump sum or a monthly amount"),
  list_alerts: z.object({}),
  create_alert_rule: z.object({
    type: z.enum(["unlock", "drift", "news"]),
    symbol: z.string().trim().toUpperCase().regex(/^(\*|[A-Z0-9.\-]{1,20})$/),
    min_level: z.enum(["medium", "high"]).default("medium"),
    days_before: z.number().int().min(1).max(30).default(7),
  }),
  get_my_plan: z.object({}),
  get_upcoming_unlocks: z.object({ days: Days.default(30) }),
  get_invest_plans: z.object({}),
  get_wallet_activity: z.object({
    address: z.string().trim().regex(ADDRESS_RE).nullable().default(null),
    network: z.enum(["fuji", "mainnet"]).default("fuji"),
  }),
  lookup_onchain: z.object({
    id: z.string().trim().regex(/^0x[0-9a-fA-F]{40}([0-9a-fA-F]{24})?$/),
    network: z.enum(["fuji", "mainnet"]).default("fuji"),
  }),
} as const;

export type ToolName = keyof typeof INPUTS;
export const TOOL_NAMES = Object.keys(INPUTS) as ToolName[];

/** Tools that write: U-Bot gets them over MCP. In the app the user drafts on the Trade, Invest and Alerts pages. */
export const MCP_ONLY = new Set<ToolName>(["draft_trade_plan", "draft_invest_plan", "create_alert_rule"]);
/** The tools the in-app agent (Claude, OpenAI-compatible) is offered. */
export const AGENT_TOOL_SPECS = TOOL_SPECS.filter((t) => !MCP_ONLY.has(t.name));

const READ: ToolAnnotations = { readOnlyHint: true, openWorldHint: false };
const READ_WEB: ToolAnnotations = { readOnlyHint: true, openWorldHint: true };
// Writes that only create something waiting for the user (a proposal, a plan): never destructive.
const DRAFT: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
export const TOOL_ANNOTATIONS: Record<ToolName, ToolAnnotations> = {
  get_portfolio: READ,
  lookup_token: READ,
  get_unlock_schedule: READ,
  get_allocations: READ,
  get_fundraising: READ,
  assess_unlock_risk: READ,
  propose_protection: DRAFT,
  get_market_news: READ_WEB,
  get_event_odds: READ_WEB,
  get_market_pulse: READ_WEB,
  get_event_calendar: READ,
  check_portfolio_drift: READ,
  get_token_market: READ_WEB,
  stress_test_portfolio: READ,
  draft_trade_plan: DRAFT,
  get_paper_trading: READ,
  get_invest_options: READ,
  draft_invest_plan: DRAFT,
  list_alerts: READ,
  create_alert_rule: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  get_my_plan: READ,
  get_upcoming_unlocks: READ_WEB,
  get_invest_plans: READ,
  get_wallet_activity: READ_WEB,
  lookup_onchain: READ_WEB,
};

// ─── Per-request context ─────────────────────────────────────────────────────────────

/** Something U-Bot drafted or saved for the user over MCP, and where in the app they act on it. */
export interface Draft {
  kind: "trade" | "invest" | "alert_rule";
  id: string;
  title: string;
  titleTh: string;
  href: string;
}

export interface RunContext {
  userId: string;
  /** app = in-app agent and alert engine · mcp = U-Bot (or another MCP client) */
  channel: "app" | "mcp";
  /** MCP: a trusted caller named the user it acts for (X-UGuard-User). */
  actingFor: boolean;
  locale: Locale; // language of the user's message: replies and proposals follow it
  scope: "user" | "public"; // public = signed-out visitor: no wallet tools
  requestId: string;
  now: number;
  cards: Map<string, RiskCard>;
  notes: Map<string, string>; // symbol → why there is no card (no vesting / not covered)
  proposals: Proposal[];
  news: Sourced<NewsItem[]> | null;
  odds: Sourced<OddsMarket[]> | null;
  pulse: Sourced<MarketPulse> | null;
  calendar: CalendarEvent[] | null;
  holdings: Holding[] | null;
  drift: DriftReport | null;
  drafts: Draft[];
  /** Each tool's last result, by tool name (the rules engine writes its replies from these). */
  data: Map<string, unknown>;
  stress: StressReport | null;
  markets: Map<string, { symbol: string; priceUsd: number; change24hPct: number | null; volume24hUsd: number; source: DataSource }>;
  citations: Citation[];
  trace: TraceStep[];
  evidence: string[]; // serialized tool results: the only numbers a reply may use
  sources: Set<DataSource>;
}

export function newContext(init: {
  userId: string;
  scope: "user" | "public";
  requestId: string;
  now: number;
  locale?: Locale;
  channel?: RunContext["channel"];
  actingFor?: boolean;
}): RunContext {
  return {
    ...init,
    locale: init.locale ?? "en",
    channel: init.channel ?? "app",
    actingFor: init.actingFor ?? false,
    cards: new Map(),
    notes: new Map(),
    proposals: [],
    news: null,
    odds: null,
    pulse: null,
    calendar: null,
    holdings: null,
    drift: null,
    drafts: [],
    data: new Map(),
    stress: null,
    markets: new Map(),
    citations: [],
    trace: [],
    evidence: [],
    sources: new Set(),
  };
}

interface ToolOutput {
  result: unknown;
  summary: string;
}

function protectionCopy(action: ProtectionAction, s: string, card: RiskCard): { title: string; detail: string } {
  const date = card.unlockDate ? shortDate(card.unlockDate) : "the unlock";
  const twoWeeksAfter = card.unlockDate ? shortDate(new Date(Date.parse(card.unlockDate) + 14 * 86_400_000).toISOString()) : null;
  const window =
    card.timing === "continuous" ? "over the next 30 days" : card.timing === "recent" ? "over the next two weeks" : `before ${date}`;
  switch (action) {
    case "price_alert":
      return {
        title: `Price alert for ${s} around the unlock`,
        detail: `U-Bot alerts you if ${s} falls 10% ${window}. The rule is recorded on Avalanche when you approve.`,
      };
    case "pause_buying":
      return {
        title: `Pause auto-buys of ${s} through the unlock window`,
        detail:
          card.timing === "continuous" || !twoWeeksAfter
            ? `Pauses recurring ${s} buys for the next 30 days while supply keeps entering the market. Recorded on Avalanche when you approve.`
            : `Pauses recurring ${s} buys until ${twoWeeksAfter}, two weeks after the unlock, when volatility usually settles. Recorded on Avalanche when you approve.`,
      };
    case "reduce_exposure":
      return {
        title: `Reminder to review your ${s} position`,
        detail: `U-Bot reminds you ${card.timing === "upcoming" && (card.daysUntil ?? 0) > 7 ? `7 days before ${date}` : "tomorrow"} to review how much ${s} you hold. You decide and trade yourself. Recorded on Avalanche when you approve.`,
      };
  }
}

/** Thai copy for the same rules (the U-topia app speaks Thai). */
function protectionCopyTh(action: ProtectionAction, s: string, card: RiskCard): { title: string; detail: string } {
  const date = card.unlockDate ? thaiDate(card.unlockDate) : "วัน unlock";
  const twoWeeksAfter = card.unlockDate ? thaiDate(new Date(Date.parse(card.unlockDate) + 14 * 86_400_000).toISOString()) : null;
  const window =
    card.timing === "continuous" ? "ในอีก 30 วันข้างหน้า" : card.timing === "recent" ? "ในอีก 2 สัปดาห์ข้างหน้า" : `ก่อน ${date}`;
  switch (action) {
    case "price_alert":
      return {
        title: `ตั้งแจ้งเตือนราคา ${s} ช่วง unlock`,
        detail: `U-Bot จะเตือนถ้าราคา ${s} ลดลง 10% ${window} และบันทึกกฎนี้บน Avalanche เมื่อคุณอนุมัติ`,
      };
    case "pause_buying":
      return {
        title: `พักการซื้ออัตโนมัติ ${s} ช่วง unlock`,
        detail:
          card.timing === "continuous" || !twoWeeksAfter
            ? `หยุด DCA ของ ${s} ในอีก 30 วันข้างหน้า ระหว่างที่เหรียญใหม่ยังทยอยเข้าตลาด และบันทึกกฎนี้บน Avalanche เมื่อคุณอนุมัติ`
            : `หยุด DCA ของ ${s} ตั้งแต่วันนี้จนถึง ${twoWeeksAfter} (2 สัปดาห์หลัง unlock ช่วงที่ความผันผวนมักกลับสู่ปกติ) และบันทึกกฎนี้บน Avalanche เมื่อคุณอนุมัติ`,
      };
    case "reduce_exposure":
      return {
        title: `เตือนให้ทบทวนสัดส่วน ${s}`,
        detail: `U-Bot จะเตือน${card.timing === "upcoming" && (card.daysUntil ?? 0) > 7 ? ` 7 วันก่อน ${date}` : "พรุ่งนี้"} ให้ทบทวนสัดส่วน ${s} ในพอร์ต (คุณตัดสินใจและทำรายการเอง) และบันทึกกฎนี้บน Avalanche เมื่อคุณอนุมัติ`,
      };
  }
}

function addNews(ctx: RunContext, res: Sourced<NewsItem[]>): { n: number; item: NewsItem }[] {
  const merged = ctx.news ? [...ctx.news.data] : [];
  const out: { n: number; item: NewsItem }[] = [];
  for (const item of res.data) {
    let cite = ctx.citations.find((c) => c.url === item.url && c.title === item.summary);
    if (!cite) {
      cite = { n: ctx.citations.length + 1, title: item.summary, url: item.url, source: item.source };
      ctx.citations.push(cite);
      merged.push(item);
    }
    out.push({ n: cite.n, item });
  }
  ctx.news = { ...res, data: merged };
  return out;
}

const VERDICT_EN = { ready: "passes U-Guard's checks", caution: "U-Guard flags things to look at", blocked: "blocked by U-Guard's checks" } as const;
const VERDICT_TH = { ready: "ผ่านการตรวจของ U-Guard", caution: "U-Guard มีเรื่องให้ดูก่อน", blocked: "ติดการตรวจของ U-Guard" } as const;
const r2 = (v: number) => Math.round(v * 100) / 100;

function ruleText(type: string, symbol: string, minLevel: string, days: number): { en: string; th: string } {
  const what = symbol === "*" ? "any token you hold" : symbol;
  const whatTh = symbol === "*" ? "ทุกเหรียญในพอร์ต" : symbol;
  if (type === "drift") return { en: "your portfolio drifts outside your target band", th: "พอร์ตเบี้ยวออกนอกกรอบเป้าที่คุณตั้ง" };
  if (type === "news") return { en: `negative news about ${what} (${minLevel} or worse)`, th: `ข่าวลบของ${whatTh} (ระดับ ${minLevel} ขึ้นไป)` };
  return { en: `${what} reaches ${minLevel} unlock risk within ${days} days`, th: `${whatTh} มีความเสี่ยง unlock ระดับ ${minLevel} ขึ้นไป ภายใน ${days} วัน` };
}

const WALLET_TOOLS = new Set<ToolName>([
  "get_portfolio",
  "propose_protection",
  "check_portfolio_drift",
  "stress_test_portfolio",
  "get_paper_trading",
  "list_alerts",
  "get_my_plan",
  "get_invest_plans",
  "get_wallet_activity",
  ...MCP_ONLY,
]);

/** The user's own wallet: a Sign-In with Ethereum session, else the app's configured wallet, else the approvals signer. */
async function ownWallet(ctx: RunContext): Promise<string | null> {
  const fromSession = ctx.userId.startsWith("wallet:") ? ctx.userId.slice("wallet:".length) : null;
  if (fromSession && ADDRESS_RE.test(fromSession)) return fromSession;
  if (config.avalanche.walletAddress && ADDRESS_RE.test(config.avalanche.walletAddress)) return config.avalanche.walletAddress;
  if (config.avalanche.demoPrivateKey) {
    const { privateKeyToAccount } = await import("viem/accounts");
    try {
      return privateKeyToAccount(config.avalanche.demoPrivateKey as `0x${string}`).address;
    } catch {
      return null;
    }
  }
  return null;
}

async function run(name: ToolName, input: Record<string, unknown>, ctx: RunContext): Promise<ToolOutput> {
  if (ctx.scope === "public" && WALLET_TOOLS.has(name)) {
    return { result: { error: "sign_in_required", note: "The user is signed out. Ask them to sign in to use their wallet." }, summary: "sign-in required" };
  }
  switch (name) {
    case "get_portfolio": {
      const holdings = await getHoldings(ctx.userId);
      ctx.holdings = holdings;
      holdings.forEach((h) => ctx.sources.add(h.source));
      return {
        result: holdings.map((h) => ({
          symbol: h.symbol,
          amount: h.amount,
          value_thb: Math.round(h.valueThb),
          data: h.source,
          price_as_of: asOfEn(h.asOf, ctx.now),
          price_as_of_th: asOfTh(h.asOf, ctx.now),
        })),
        summary: holdings.map((h) => h.symbol).join(", "),
      };
    }
    case "check_portfolio_drift": {
      const report = await checkDrift(ctx.userId, { locale: ctx.locale, now: ctx.now });
      ctx.drift = report;
      ctx.sources.add("sample"); // the demo wallet's amounts are sample data
      const off = report.rows.filter((r) => r.status === "over" || r.status === "under");
      return {
        result: {
          has_targets: report.hasTargets,
          band_pp: report.bandPp,
          total_drift_pct: report.totalDriftPct,
          portfolio_unlock_risk_score: report.portfolioRiskScore,
          weighted_dilution_6m_pct: report.weightedDilutionPct,
          largest_holding: report.concentration,
          rows: report.rows.map((r) => ({
            symbol: r.symbol,
            weight_pct: r.weightPct,
            target_pct: r.targetPct,
            drift_pp: r.driftPp,
            status: r.status,
            unlock_risk: r.riskLevel,
            unlock_score: r.riskScore,
            unlock_date: r.unlockDate ? r.unlockDate.slice(0, 10) : null,
            dilution_6m_pct: r.dilutionPct,
          })),
          summary_lines: report.lines,
          price_as_of: asOfEn(report.pricesAsOf, ctx.now),
          price_as_of_th: asOfTh(report.pricesAsOf, ctx.now),
          data: "sample",
        },
        summary: report.hasTargets ? `${report.totalDriftPct}% off target · ${off.length} token(s) outside the band` : "no targets set",
      };
    }
    case "get_token_market": {
      const sym = (input.symbol as string).toUpperCase();
      const q = await getQuote(sym);
      if (!q) return { result: { symbol: sym, found: false }, summary: `${sym}: no market data` };
      ctx.markets.set(sym, { symbol: sym, priceUsd: q.priceUsd, change24hPct: q.change24hPct, volume24hUsd: q.volume24hUsd, source: q.source });
      ctx.sources.add(q.source);
      return {
        result: {
          symbol: sym,
          price_usd: Number(q.priceUsd.toPrecision(5)),
          change_24h_pct: q.change24hPct === null ? null : Number(q.change24hPct.toFixed(2)),
          volume_24h_usd: Math.round(q.volume24hUsd),
          data: q.source,
        },
        summary: `${sym} $${q.priceUsd.toPrecision(4)}${q.change24hPct === null ? "" : ` (${q.change24hPct >= 0 ? "+" : ""}${q.change24hPct.toFixed(1)}%)`}`,
      };
    }
    case "stress_test_portfolio": {
      const report = await stressTest(ctx.userId, { locale: ctx.locale, now: ctx.now });
      ctx.stress = report;
      ctx.sources.add("sample"); // demo wallet amounts
      return {
        result: {
          total_thb: Math.round(report.totalThb),
          stablecoins_thb: Math.round(report.stableThb),
          scenarios: report.scenarios.map((x) => ({ scenario: x.label, basis: x.basis, impact_thb: x.impactThb, impact_pct_of_portfolio: Number(x.impactPct.toFixed(1)) })),
          protection_options: report.handles.map((h) => h.text),
          summary_lines: report.lines,
          data: "sample",
        },
        summary: report.scenarios.map((x) => `${x.id} ${Math.round(x.impactPct)}%`).join(" · "),
      };
    }
    case "lookup_token": {
      const { token, meta } = await findToken(input.symbol as string);
      if (!token) return { result: { found: false }, summary: `${input.symbol}: not in dataset` };
      const quote = await getQuote(token.symbol);
      const price = quote?.priceUsd ?? (token.circulatingSupply > 0 ? token.marketCap / token.circulatingSupply : 0);
      const circPct = token.maxSupply > 0 ? (token.circulatingSupply / token.maxSupply) * 100 : null;
      ctx.sources.add(meta.source);
      return {
        result: {
          found: true,
          name: token.name,
          symbol: token.symbol,
          price_usd: price,
          market_cap_usd: token.marketCap,
          fdv_usd: price * token.maxSupply,
          circulating_pct_of_max: circPct === null ? null : Number(circPct.toFixed(2)),
          latest_round: token.latestFundraisingRound,
          data: meta.source,
        },
        summary: `${token.symbol} mcap ${usd(token.marketCap)}${circPct === null ? "" : ` · ${circPct.toFixed(0)}% circulating`}`,
      };
    }
    case "get_unlock_schedule": {
      const { token } = await findToken(input.symbol as string);
      if (!token) return { result: { found: false }, summary: `${input.symbol}: not in dataset` };
      const days = input.days as number;
      const start = new Date(ctx.now).toISOString().slice(0, 10);
      const end = new Date(ctx.now + days * 86_400_000).toISOString().slice(0, 10);
      const events = await getUnlockEvents(token.id, start, end);
      ctx.sources.add(events.source);
      const rows = events.data.map((e) => ({
        date: e.unlockDate.slice(0, 10),
        type: e.cliffUnlocks ? "cliff" : "linear",
        amount: e.cliffUnlocks?.cliffAmount ?? e.linearUnlocks?.linearAmount ?? 0,
        recipients: (e.cliffUnlocks?.allocationBreakdown ?? e.linearUnlocks?.allocationBreakdown ?? []).map((a) => ({
          name: a.allocationName,
          category: a.standardAllocationName,
          amount: "cliffAmount" in a ? a.cliffAmount : (a.linearAmount ?? a.amount ?? null),
        })),
      }));
      return {
        result: { symbol: token.symbol, window_days: days, events: rows, data: events.source },
        summary: `${token.symbol}: ${rows.length} event(s) in ${days}d${rows[0] ? ` · next ${shortDate(rows[0].date)}` : ""}`,
      };
    }
    case "get_allocations": {
      const { token } = await findToken(input.symbol as string);
      if (!token) return { result: { found: false }, summary: `${input.symbol}: not in dataset` };
      const alloc = await getAllocations(token.id);
      ctx.sources.add(alloc.source);
      const rows = (alloc.data?.allocations ?? []).map((a) => ({
        name: a.allocationName,
        category: a.standardAllocationName,
        pct_of_supply: a.trackedAllocationPercentage,
        locked: a.allocationLockedAmount,
      }));
      return {
        result: { symbol: token.symbol, allocations: rows, data: alloc.source },
        summary: `${token.symbol}: ${rows.length} allocation buckets`,
      };
    }
    case "get_fundraising": {
      const { token } = await findToken(input.symbol as string);
      if (!token) return { result: { found: false }, summary: `${input.symbol}: not in dataset` };
      const fund = await getFundraising(token.id);
      ctx.sources.add(fund.source);
      const rounds = (fund.data?.fundingRounds ?? []).map((r) => ({
        round: r.fundingRound,
        date: r.fundingDate.slice(0, 10),
        raised_usd: r.amountRaised,
        valuation_usd: r.valuation,
        price_per_token: r.pricePerToken,
      }));
      return {
        result: { symbol: token.symbol, total_raised_usd: fund.data?.totalAmountRaised ?? null, rounds, data: fund.source },
        summary: `${token.symbol}: ${rounds.length} round(s)${fund.data?.totalAmountRaised ? ` · raised ${usd(fund.data.totalAmountRaised)}` : ""}`,
      };
    }
    case "assess_unlock_risk": {
      const sym = (input.symbol as string).toUpperCase();
      const res = await assessUnlockRisk(sym, (input.trade_amount_thb as number | null) ?? null, { now: ctx.now, locale: ctx.locale });
      if (!res.ok) {
        ctx.notes.set(res.symbol, res.reason);
        return {
          result: { symbol: res.symbol, rated: false, kind: res.kind, note: res.reason },
          summary: `${res.symbol}: ${res.kind === "no_vesting" ? "no vesting schedule" : "not in dataset"}`,
        };
      }
      const c = res.card;
      ctx.cards.set(c.symbol, c);
      ctx.sources.add(c.source.mode);
      return {
        result: {
          symbol: c.symbol,
          level: c.level,
          score: c.score,
          timing: c.timing,
          unlock_date: c.unlockDate ? c.unlockDate.slice(0, 10) : null,
          days_until: c.daysUntil,
          unlock_amount: Math.round(c.amount),
          unlock_value_usd: Math.round(c.valueUsd),
          pct_of_circulating: Number(c.pctOfCirculating.toFixed(2)),
          days_of_volume: c.daysOfVolume === null ? null : Number(c.daysOfVolume.toFixed(2)),
          recipients: c.breakdown.map((b) => ({ name: b.name, type: b.recipient, share_pct: Math.round(b.share * 100) })),
          investor_multiple: c.investorMultiple === null ? null : Number(c.investorMultiple.toFixed(1)),
          next_unlock: c.nextUnlock ? { date: c.nextUnlock.date.slice(0, 10), amount: c.nextUnlock.amount } : null,
          reasons: c.reasons,
          data: c.source.mode,
          as_of: asOfEn(c.source.asOf, ctx.now),
          as_of_th: asOfTh(c.source.asOf, ctx.now),
          stale: c.source.stale ?? false,
        },
        summary:
          c.level === "none"
            ? `${c.symbol}: no unlock in 30d`
            : `${c.symbol}: ${c.level.toUpperCase()} ${c.score}/100 · ${compact(c.amount, 2)} ${c.timing}`,
      };
    }
    case "propose_protection": {
      const symbol = (input.symbol as string).toUpperCase();
      let card = ctx.cards.get(symbol);
      // Stateless callers (MCP: one request per tool call) can't carry the card over from an
      // earlier assess_unlock_risk call, so score it here. The medium/high gate below still applies.
      if (!card) {
        const res = await assessUnlockRisk(symbol, null, { now: ctx.now, locale: ctx.locale });
        if (res.ok) {
          card = res.card;
          ctx.cards.set(card.symbol, card);
          ctx.sources.add(card.source.mode);
        }
      }
      if (!card || card.level === "low" || card.level === "none") {
        return {
          result: { created: false, note: "Call assess_unlock_risk first; proposals are only for medium or high risk." },
          summary: `${symbol}: proposal rejected (risk not medium/high)`,
        };
      }
      if (ctx.proposals.some((p) => p.symbol === symbol)) {
        return { result: { created: false, note: "A proposal for this token already exists." }, summary: `${symbol}: duplicate` };
      }
      const action = input.action as ProtectionAction;
      const proposal: Proposal = {
        id: randomUUID(),
        symbol,
        action,
        riskLevel: card.level,
        unlockDate: card.unlockDate,
        status: "pending",
        ...(ctx.locale === "th" ? protectionCopyTh(action, symbol, card) : protectionCopy(action, symbol, card)),
      };
      store.proposals.set(proposal.id, { proposal, ownerId: ctx.userId, createdAt: Date.now() });
      ctx.proposals.push(proposal);
      return {
        result: { created: true, proposal_id: proposal.id, status: "pending_user_approval", title: proposal.title },
        summary: `${symbol}: proposed ${action} (awaiting approval)`,
      };
    }
    case "get_market_news": {
      const res = await searchNews({
        query: input.query as string,
        symbols: (input.symbols as string[]).map((s) => s.toUpperCase()),
        days: input.days as number,
        now: ctx.now,
        limit: 4,
      });
      ctx.sources.add(res.source);
      const items = addNews(ctx, res);
      return {
        result: {
          items: items.map(({ n, item }) => ({
            cite: n,
            summary: item.summary,
            source: item.source,
            date: item.date ?? item.dateLabel ?? null,
            symbols: item.symbols,
          })),
          note: items.length === 0 ? "No relevant news found in this window." : undefined,
          data: res.source,
          as_of: res.asOf.slice(0, 10),
        },
        summary: `${items.length} article(s)${items[0] ? ` · ${items[0].item.source}` : ""}`,
      };
    }
    case "get_event_odds": {
      const res = await getEventOdds(input.topic as string);
      ctx.sources.add(res.source);
      const known = new Set((ctx.odds?.data ?? []).map((m) => m.id));
      ctx.odds = { ...res, data: [...(ctx.odds?.data ?? []), ...res.data.filter((m) => !known.has(m.id))] };
      return {
        result: {
          markets: res.data.map((m) => ({
            question: m.question,
            outcomes: m.outcomes.map((o) => ({ name: o.name, probability_pct: Math.round(o.probability * 100) })),
            provider: m.provider,
            reported_by: m.reportedBy?.name ?? null,
          })),
          note: res.data.length === 0 ? "No prediction market found for this topic." : undefined,
          data: res.source,
          as_of: res.asOf.slice(0, 10),
        },
        summary: `${res.data.length} market(s)`,
      };
    }
    case "get_market_pulse": {
      const res = await getMarketPulse();
      ctx.pulse = res;
      ctx.sources.add(res.source);
      const p = res.data;
      return {
        result: {
          btc_price_usd: p.btc?.priceUsd ?? null,
          btc_change_24h_pct: p.btc?.change24hPct ?? null,
          btc_price_date: p.btc?.date ?? null,
          sentiment: p.sentiment ? { value: p.sentiment.value, label: p.sentiment.label, date: p.sentiment.date } : null,
          etf_flows: p.etfFlows.map((f) => ({ asset: f.asset, period: f.label, net_usd: f.netUsd })),
          implied_7d_range: p.impliedMove
            ? { one_sigma_pct: Number(p.impliedMove.pct.toFixed(1)), low: Math.round(p.impliedMove.low), high: Math.round(p.impliedMove.high) }
            : null,
          data: res.source,
        },
        summary: p.btc ? `BTC ${usd(p.btc.priceUsd)}${p.sentiment ? ` · F&G ${p.sentiment.value}` : ""}` : "no data",
      };
    }
    case "get_event_calendar": {
      const events = await getEventCalendar(input.days as number, { now: ctx.now });
      ctx.calendar = events;
      return {
        result: { events: events.map((e) => ({ date: e.date, title: e.title, kind: e.kind, importance: e.importance })) },
        summary: `${events.length} event(s) in ${input.days}d`,
      };
    }
    case "draft_trade_plan": {
      // Imported here: trade.ts reaches the agent, which imports this file.
      const { draftTradePlan } = await import("../trade");
      const res = await draftTradePlan(
        {
          symbol: input.symbol as string,
          side: input.side as TradeSide,
          amountThb: input.amount_thb as number,
          orderType: input.order_type as "market" | "limit",
          limitPriceUsd: input.limit_price_usd as number | null,
          stopLossPct: (input.stop_loss_pct as number | null) ?? undefined,
          riskBudgetPct: (input.risk_budget_pct as number | null) ?? undefined,
        },
        ctx.userId,
        ctx.now,
        { explain: false, origin: ctx.channel },
      );
      if ("error" in res) return { result: { created: false, note: res.error }, summary: `${String(input.symbol).toUpperCase()}: no plan (${res.error})` };
      const p = res;
      ctx.sources.add(p.priceSource);
      if (p.card) ctx.cards.set(p.card.symbol, p.card);
      const side = p.side === "buy" ? "Buy" : "Sell";
      ctx.drafts.push({
        kind: "trade",
        id: p.id,
        title: `${side} ${thb(p.amountThb)} of ${p.symbol} (paper) · ${VERDICT_EN[p.verdict]}`,
        titleTh: `${p.side === "buy" ? "ซื้อ" : "ขาย"} ${p.symbol} ${thb(p.amountThb)} (จำลอง) · ${VERDICT_TH[p.verdict]}`,
        href: "/terminal/trade",
      });
      return {
        result: {
          created: true,
          plan_id: p.id,
          status: "pending_user_approval",
          approve_in: "U-Guard app → Trade → Plans waiting for you",
          symbol: p.symbol,
          side: p.side,
          order_type: p.orderType,
          amount_thb: p.amountThb,
          price_usd: p.priceUsd,
          price_as_of: asOfEn(p.priceAsOf, ctx.now),
          price_as_of_th: asOfTh(p.priceAsOf, ctx.now),
          price_stale: p.priceStale,
          qty: Number(p.qty.toFixed(6)),
          fee_thb: p.feeThb,
          stop_loss_pct: p.stopLossPct,
          stop_price_usd: Number(p.stopPriceUsd.toPrecision(6)),
          max_loss_thb: p.maxLossThb,
          risk_budget_pct: p.riskBudgetPct,
          max_size_in_budget_thb: p.maxSizeThb,
          portfolio_thb: p.portfolioThb,
          position_pct_after: Number(p.positionPctAfter.toFixed(1)),
          verdict: p.verdict,
          checks: p.checks.map((c) => ({ id: c.id, status: c.status, label: c.label, detail: c.detail })),
          what_if: p.scenarios.map((x) => ({ label: x.label, move_pct: Number(x.pct.toFixed(1)), pnl_thb: x.pnlThb, basis: x.basis })),
          unlock_risk: p.card ? { level: p.card.level, score: p.card.score } : null,
          summary: p.summary,
          data: p.priceSource,
          note: "Paper trading: no real order is sent. Only the user can approve this plan, in the app.",
        },
        summary: `${p.symbol}: ${p.side} ${thb(p.amountThb)} plan · ${p.verdict} (awaiting approval)`,
      };
    }
    case "get_paper_trading": {
      const { tradingSummary } = await import("../trade");
      const s = await tradingSummary(ctx.userId);
      return {
        result: {
          positions: s.positions.map((x) => ({ symbol: x.symbol, qty: Number(x.qty.toFixed(6)), cost_thb: x.costThb, value_thb: x.valueThb, pnl_thb: x.pnlThb })),
          orders: s.orders.slice(0, 10).map((o) => ({
            symbol: o.symbol,
            side: o.side,
            qty: Number(o.qty.toFixed(6)),
            amount_thb: o.amountThb,
            price_usd: o.priceUsd,
            stop_price_usd: Number(o.stopPriceUsd.toPrecision(6)),
            at: o.at,
            receipt: { chain: o.receipt.chain, mode: o.receipt.mode, tx: o.receipt.txHash },
            broker: o.broker ? { venue: o.broker.venue, ok: o.broker.ok, status: o.broker.status ?? null, note: o.broker.note } : null,
          })),
          pending_plans: s.pending.map((p) => ({ plan_id: p.id, symbol: p.symbol, side: p.side, amount_thb: p.amountThb, verdict: p.verdict, drafted_by: p.origin ?? "app", created_at: p.createdAt })),
          note: "Paper trading only: no real orders.",
        },
        summary: `${s.positions.length} position(s) · ${s.orders.length} order(s) · ${s.pending.length} pending`,
      };
    }
    case "get_invest_options": {
      const { investDefaults } = await import("../invest");
      const d = await investDefaults();
      ctx.sources.add(d.source);
      return {
        result: {
          questions: d.questions.map((q, i) => ({ n: i + 1, question: q.q, answers: q.a.map((text, j) => ({ value: j + 1, text })) })),
          scoring: "Add up the five answers (5-20): up to 9 conservative, up to 14 moderate, up to 17 growth, 18 or more aggressive",
          asset_classes: d.classes.map((c) => ({ id: c.id, name: c.name, example: c.example, risk_level: c.risk >= 9 ? "8+" : String(c.risk), fee_pct_year: c.feePct })),
          profiles: Object.fromEntries(
            Object.entries(d.profiles).map(([id, p]) => [id, { name: p.name, weights_pct: p.weights, crypto_max_pct: p.cryptoMax }]),
          ),
          data: d.source,
        },
        summary: `${d.questions.length} questions · ${d.classes.length} asset classes`,
      };
    }
    case "draft_invest_plan": {
      const { draftInvestPlan } = await import("../invest");
      const weights = input.weights as { id: string; pct: number }[] | null;
      const picks = input.crypto_picks as string[];
      const p = await draftInvestPlan(
        {
          answers: input.answers as number[],
          lumpSumThb: input.lump_sum_thb as number,
          monthlyThb: input.monthly_thb as number,
          dcaDay: input.dca_day as number,
          cryptoPicks: picks.length ? picks : undefined,
          weights: weights ? Object.fromEntries(weights.map((w) => [w.id, w.pct])) : undefined,
        },
        ctx.userId,
        ctx.now,
        ctx.channel,
      );
      ctx.sources.add(p.source);
      ctx.drafts.push({
        kind: "invest",
        id: p.id,
        title: `"${p.profileName}" investment plan · DCA ${thb(p.monthlyThb)}/month`,
        titleTh: `แผนลงทุนแบบ "${p.profileName}" · DCA เดือนละ ${thb(p.monthlyThb)}`,
        href: "/terminal/invest",
      });
      return {
        result: {
          created: true,
          plan_id: p.id,
          status: "pending_user_approval",
          approve_in: "U-Guard app → Invest → Plans waiting for you",
          profile: p.profile,
          profile_name: p.profileName,
          score: p.score,
          slices: p.slices.map((x) => ({ id: x.id, name: x.name, pct: x.pct, lump_thb: x.lumpThb, monthly_thb: x.monthlyThb })),
          crypto: p.crypto.map((c) => ({ symbol: c.symbol, pct_of_crypto: c.pctOfCrypto, unlock_risk: c.level, unlock_score: c.score, note: c.note })),
          checks: p.checks,
          dca: p.dca.map((x) => ({ date: x.date, amount_thb: x.amountThb, notes: x.notes })),
          average_risk_of_8: r2(p.weightedRisk),
          fees_pct_year: r2(p.feePctYear),
          summary: p.summary,
          data: p.source,
          note: "Educational model portfolio on sample data, not personal investment advice. Only the user can approve it, in the app.",
        },
        summary: `${p.profileName} (${p.score}/20) · ${p.checks.filter((c) => c.status === "warn").length} warning(s) (awaiting approval)`,
      };
    }
    case "list_alerts": {
      const rules = store.alerts.filter((r) => r.ownerId === ctx.userId);
      const events = store.alertEvents.filter((e) => e.ownerId === ctx.userId).slice(0, 10);
      const last = store.lastWatch.get(ctx.userId);
      const { quietStartHour: qs, quietEndHour: qe, maxPerDay } = config.watch;
      return {
        result: {
          rules: rules.map((r) => ({ id: r.id, type: r.type ?? "unlock", symbol: r.symbol, min_level: r.minLevel, days_before: r.daysBefore, channel: r.channel })),
          recent_alerts: events.map((e) => ({ type: e.type, symbol: e.symbol, severity: e.severity, title: e.title, sent_at: e.firedAt })),
          last_check: last ? { ran_at: last.ranAt, trigger: last.trigger, sent: last.fired.length, held_back: last.skipped.slice(0, 5) } : null,
          settings: { quiet_hours_bangkok: qs === qe ? null : `${qs}:00-${qe}:00, high severity only`, max_per_day: maxPerDay, repeats: "never the same alert twice; drift at most once a day" },
        },
        summary: `${rules.length} rule(s) · ${events.length} recent alert(s)`,
      };
    }
    case "get_my_plan": {
      const { buildPlan } = await import("../plan");
      const p = await buildPlan(ctx.userId, { now: ctx.now, locale: ctx.locale });
      return {
        result: {
          horizon_days: p.horizonDays,
          summary: p.summary,
          items: p.items.slice(0, 15).map((i) => ({ date: i.date, kind: i.kind, symbol: i.symbol, title: i.title, detail: i.detail, level: i.level })),
          open_decisions: p.decisions.length,
          total_thb: Math.round(p.totalThb),
        },
        summary: `${p.items.length} item(s) in ${p.horizonDays}d · ${p.decisions.length} open decision(s)`,
      };
    }
    case "get_upcoming_unlocks": {
      const feed = await marketUnlocks(ctx.now, { days: input.days as number });
      ctx.sources.add(feed.source);
      return {
        result: {
          window_days: input.days,
          unlocks: feed.upcoming.slice(0, 15).map((u) => ({
            symbol: u.symbol,
            date: u.date.slice(0, 10),
            what: u.summary,
            size: u.sizeNote,
            grade: u.level ?? null,
            link: u.url,
          })),
          data: feed.source,
          as_of: asOfEn(feed.asOf, ctx.now),
          note: feed.note,
        },
        summary: `${feed.upcoming.length} unlock(s) in ${input.days}d · ${feed.source}`,
      };
    }
    case "get_invest_plans": {
      const { myInvestPlans, pendingInvestPlans } = await import("../invest");
      const shape = (p: import("../types").InvestPlan) => ({
        plan_id: p.id,
        status: p.status,
        profile: p.profileName,
        monthly_thb: p.monthlyThb,
        lump_sum_thb: p.lumpSumThb,
        dca_day: p.dcaDay,
        weights: p.slices.filter((x) => x.pct > 0).map((x) => ({ name: x.name, pct: x.pct })),
        warnings: p.checks.filter((c) => c.status === "warn").map((c) => c.label),
        drafted_by: p.origin ?? "app",
      });
      const approved = myInvestPlans(ctx.userId).map(shape);
      const pending = pendingInvestPlans(ctx.userId).map(shape);
      return {
        result: { approved, pending, data: "sample" },
        summary: `${approved.length} approved · ${pending.length} waiting`,
      };
    }
    case "get_wallet_activity": {
      const address = (input.address as string | null) ?? (await ownWallet(ctx));
      if (!address) {
        return {
          result: { available: false, note: "No wallet to read: sign in with a wallet, or set WALLET_ADDRESS for the demo." },
          summary: "no wallet address",
        };
      }
      const a = await walletActivity(address, input.network as AvaxNetwork);
      return {
        result: {
          available: a.source === "live",
          network: a.network,
          address: a.address,
          native: a.native,
          tokens: a.tokens.slice(0, 10),
          transactions: a.transactions.slice(0, 8).map((t) => ({
            hash: t.hash,
            time: t.time,
            status: t.status,
            method: t.method,
            from: t.from,
            to: t.to,
            value_avax: t.valueAvax,
            transfers: t.transfers,
            explorer: t.explorerUrl,
          })),
          data: a.source === "live" ? "Avalanche Data API (live)" : "unavailable",
          note: a.note,
        },
        summary: a.source === "live" ? `${a.network}: ${a.native?.balance ?? "?"} AVAX · ${a.tokens.length} token(s) · ${a.transactions.length} tx` : `${a.network}: ${a.note}`,
      };
    }
    case "lookup_onchain": {
      const r = await lookupOnchain(input.id as string, input.network as AvaxNetwork);
      return {
        result: { ...r, data: r.source === "live" ? "Avalanche Data API (live)" : "unavailable" },
        summary: `${r.kind} ${String(input.id).slice(0, 10)}… · ${r.source}${r.note ? ` · ${r.note}` : ""}`,
      };
    }
    case "create_alert_rule": {
      if (!ctx.actingFor) {
        return {
          result: { created: false, error: "acting_for_user_required", note: "Alert rules belong to a user: call with the MCP key and X-UGuard-User." },
          summary: "no user: rule not saved",
        };
      }
      const type = input.type as "unlock" | "drift" | "news";
      const { rule, created } = addAlertRule(ctx.userId, {
        type,
        symbol: input.symbol as string,
        minLevel: input.min_level as "medium" | "high",
        daysBefore: input.days_before as number,
        channel: "ubot",
      });
      const text = ruleText(type, rule.symbol, rule.minLevel, rule.daysBefore);
      if (created) {
        ctx.drafts.push({ kind: "alert_rule", id: rule.id, title: `tell you when ${text.en}`, titleTh: `แจ้งเมื่อ${text.th}`, href: "/terminal/alerts" });
      }
      return {
        result: {
          created,
          rule: { id: rule.id, type: rule.type ?? "unlock", symbol: rule.symbol, min_level: rule.minLevel, days_before: rule.daysBefore },
          note: created
            ? "Saved. U-Guard checks rules on a timer and sends hits to the user's U-Bot inbox. The user can remove it on the Alerts page."
            : "This rule already exists.",
        },
        summary: `${type} ${rule.symbol} ≥ ${rule.minLevel}${created ? " saved" : " (exists)"}`,
      };
    }
  }
}

/** Validates and runs one tool call, recording it in the trace. Never throws. */
export async function executeTool(
  name: string,
  rawInput: unknown,
  ctx: RunContext,
): Promise<{ content: string; isError: boolean }> {
  const t0 = Date.now();
  const schema = INPUTS[name as ToolName];
  if (!schema) {
    ctx.trace.push({ kind: "tool", name, input: rawInput, summary: "unknown tool", ms: 0, ok: false });
    return { content: `Unknown tool: ${name}`, isError: true };
  }
  if (MCP_ONLY.has(name as ToolName) && ctx.channel !== "mcp") {
    ctx.trace.push({ kind: "tool", name, input: rawInput, summary: "MCP only", ms: 0, ok: false });
    return { content: `${name} is only available to U-Bot over MCP; the app has its own page for it.`, isError: true };
  }
  const parsed = schema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    ctx.trace.push({ kind: "tool", name, input: rawInput, summary: "invalid input", ms: 0, ok: false });
    return { content: `Invalid input: ${parsed.error.message}`, isError: true };
  }
  try {
    const out = await run(name as ToolName, parsed.data as Record<string, unknown>, ctx);
    const content = JSON.stringify(out.result);
    ctx.evidence.push(content);
    ctx.data.set(name, out.result);
    ctx.trace.push({ kind: "tool", name, input: parsed.data, summary: out.summary, ms: Date.now() - t0, ok: true });
    return { content, isError: false };
  } catch (err) {
    ctx.trace.push({ kind: "tool", name, input: parsed.data, summary: (err as Error).message, ms: Date.now() - t0, ok: false });
    return { content: `Tool failed: ${(err as Error).message}`, isError: true };
  }
}
