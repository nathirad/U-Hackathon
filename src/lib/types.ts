// Shared types between the agent (server) and the UI (client).

/** live = fetched now · snapshot = real data captured on `asOf` · sample = illustrative demo data */
/** Language of the user's message. Replies, proposal copy and risk reasons follow it. */
export type Locale = "en" | "th";

export type DataSource = "live" | "snapshot" | "sample";

export interface Sourced<T> {
  data: T;
  source: DataSource;
  asOf: string;
  warning?: string;
  /** true when a live source failed and this is the last good copy, not fresh data */
  stale?: boolean;
}

export interface SourceRef {
  name: string;
  url: string;
}

export type RecipientClass = "team" | "investor" | "community" | "reserve" | "ecosystem" | "other";

export type RiskLevel = "high" | "medium" | "low" | "none";

/** upcoming = cliff ahead · recent = cliff just happened · continuous = linear release · none = nothing in window */
export type UnlockTiming = "upcoming" | "recent" | "continuous" | "none";

export interface RecipientSlice {
  name: string;
  recipient: RecipientClass;
  amount: number;
  valueUsd: number;
  share: number; // 0..1 of this unlock's value
}

export interface RiskCard {
  symbol: string;
  name: string;
  level: RiskLevel;
  score: number; // 0..100, computed in code (never by the LLM)
  timing: UnlockTiming;
  unlockDate: string | null; // cliff date, or window start for continuous unlocks
  daysUntil: number | null; // negative once the unlock has passed
  windowDays: number | null; // continuous unlocks only
  amount: number;
  valueUsd: number;
  pctOfCirculating: number;
  daysOfVolume: number | null;
  breakdown: RecipientSlice[];
  investorMultiple: number | null;
  nextUnlock: { date: string; amount: number } | null; // the following cliff, for context
  headline: string; // one-line summary
  reasons: string[]; // short English lines, generated deterministically
  plain: string; // beginner explanation
  factors: { time: number; size: number; liquidity: number; recipient: number; investorBonus: number };
  tradeAmountThb?: number;
  source: { provider: "Tokenomist"; mode: DataSource; asOf: string; stale?: boolean };
}

export type ProtectionAction = "price_alert" | "reduce_exposure" | "pause_buying";

export interface Proposal {
  id: string;
  symbol: string;
  action: ProtectionAction;
  title: string;
  detail: string;
  riskLevel: RiskLevel;
  unlockDate: string | null;
  status: "pending" | "approved" | "declined";
}

export type TraceKind = "guard" | "plan" | "tool" | "llm" | "reflect";

export interface TraceStep {
  kind: TraceKind;
  name: string; // tool name, provider name, or guard/check name
  input?: unknown;
  summary: string;
  ms: number;
  ok: boolean;
}

export type AgentProvider = "openai" | "anthropic" | "rules";

export type AnswerMode = "beginner" | "pro";

export interface NewsItem {
  id: string;
  summary: string;
  source: string;
  url: string;
  date: string | null; // report or event date (YYYY-MM-DD)
  dateLabel?: string;
  symbols: string[];
  topics: string[];
  sentiment?: "positive" | "negative" | "neutral" | null;
  relevance?: number;
  image?: string; // cover image from the publisher's feed
}

export interface OddsMarket {
  id: string;
  question: string;
  outcomes: { name: string; probability: number }[];
  provider: string;
  url: string;
  reportedBy?: SourceRef;
  endDate: string | null;
  volumeUsd: number | null;
}

export interface MarketPulse {
  btc: { priceUsd: number; change24hPct: number | null; date: string; source: SourceRef } | null;
  sentiment: { value: number; label: string; date: string; source: SourceRef } | null;
  etfFlows: { asset: string; label: string; netUsd: number; source: SourceRef }[];
  impliedMove: {
    asset: string;
    days: number;
    pct: number; // one standard deviation, in percent
    low: number;
    high: number;
    source: SourceRef;
  } | null;
}

export interface CalendarEvent {
  date: string; // YYYY-MM-DD
  title: string;
  kind: "macro" | "unlock";
  importance: "high" | "medium" | "low";
  symbol?: string;
  source: SourceRef;
}

export interface ComplianceReport {
  status: "pass" | "fixed" | "rewritten" | "replaced";
  issues: string[];
}

export interface Citation {
  n: number;
  title: string;
  url: string;
  source: string;
}

// ─── Portfolio drift (weights vs the user's own target mix) ───

export interface DriftRow {
  symbol: string;
  valueThb: number;
  weightPct: number;
  targetPct: number | null;
  driftPp: number | null; // weight − target, percentage points
  status: "over" | "under" | "ok" | "no_target";
  riskLevel: RiskLevel | null;
  riskScore: number;
  unlockDate: string | null;
  dilutionPct: number; // 6-month dilution of this holding
}

export interface DriftReport {
  hasTargets: boolean;
  bandPp: number;
  rows: DriftRow[];
  totalThb: number;
  totalDriftPct: number; // ½ Σ |weight − target|
  portfolioRiskScore: number; // Σ weight × unlock risk score, 0..100
  weightedDilutionPct: number;
  concentration: { symbol: string; weightPct: number } | null;
  lines: string[]; // up to 3 plain-language lines, deterministic
  pricesAsOf: string | null; // oldest price behind the weights, for "prices as of …"
}

export interface AgentResult {
  requestId: string;
  reply: string;
  cards: RiskCard[];
  drift?: DriftReport | null;
  stress?: import("./stress").StressReport | null;
  markets?: { symbol: string; priceUsd: number; change24hPct: number | null; volume24hUsd: number; source: DataSource }[];
  news: Sourced<NewsItem[]> | null;
  odds: Sourced<OddsMarket[]> | null;
  pulse: Sourced<MarketPulse> | null;
  calendar: CalendarEvent[] | null;
  proposals: Proposal[];
  trace: TraceStep[];
  citations: Citation[];
  provider: AgentProvider;
  model: string | null;
  compliance: ComplianceReport;
  note?: string; // e.g. why we fell back to the rules engine
  /** Where the user acts on this message, e.g. a plan U-Bot drafted over MCP. */
  links?: { label: string; href: string }[];
  usage?: { inputTokens: number; outputTokens: number };
  ms: number;
  now: string; // the agent's clock (DEMO_NOW when set), ISO
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface Holding {
  symbol: string;
  name: string;
  amount: number;
  priceUsd: number;
  valueUsd: number;
  valueThb: number;
  source: DataSource;
  asOf?: string; // when the price was observed
}

export interface ProtectionReceipt {
  proposalId: string;
  mode: "onchain" | "simulated";
  chain: string;
  txHash: string | null;
  explorerUrl: string | null;
  memo: string;
  note?: string;
}

// ─── Trade plans (paper trading) ───

export type TradeSide = "buy" | "sell";

/** One U-Guard check on a trade plan. warn = worth a second look; block = cannot be placed as asked. */
export interface TradeCheck {
  id: "unlock" | "size" | "concentration" | "chase" | "balance" | "stablecoin";
  status: "ok" | "warn" | "block";
  label: string;
  detail: string;
}

/** What-if rows. Each is arithmetic on the plan, or a dated historical average, never a price forecast. */
export interface TradeScenario {
  label: string;
  pct: number;
  priceUsd: number;
  pnlThb: number;
  basis: string;
}

export interface TradePlan {
  id: string;
  symbol: string;
  name: string;
  side: TradeSide;
  orderType: "market" | "limit";
  amountThb: number;
  priceUsd: number; // fill price for the plan: the quote, or the limit price
  quotePriceUsd: number;
  usdThb: number;
  qty: number;
  feeThb: number;
  stopLossPct: number;
  stopPriceUsd: number;
  maxLossThb: number;
  riskBudgetPct: number;
  maxSizeThb: number; // largest buy whose stop-loss stays inside the risk budget
  portfolioThb: number;
  positionPctAfter: number;
  checks: TradeCheck[];
  scenarios: TradeScenario[];
  verdict: "ready" | "caution" | "blocked";
  summary: string[]; // 3 short Thai lines
  card: RiskCard | null;
  agent: { reply: string; engine: string; trace: TraceStep[] } | null;
  priceSource: DataSource;
  priceAsOf: string;
  priceStale: boolean;
  createdAt: string;
  status: "pending" | "approved" | "declined";
  /** Drafted on the app's own page, or by U-Bot over MCP (still approved only in the app). */
  origin?: "app" | "mcp";
}

export interface PaperOrder {
  id: string;
  planId: string;
  symbol: string;
  side: TradeSide;
  qty: number;
  priceUsd: number;
  amountThb: number;
  feeThb: number;
  stopPriceUsd: number;
  at: string;
  receipt: ProtectionReceipt;
  /** Set when BROKER=alpaca-paper: what the paper broker did with the approved order. */
  broker?: BrokerFill;
}

export interface BrokerFill {
  venue: "alpaca-paper";
  ok: boolean;
  orderId?: string;
  status?: string;
  note: string;
}

// ─── Invest plans (model portfolios the user adjusts and approves) ───

export type InvestProfile = "conservative" | "moderate" | "growth" | "aggressive";

export interface InvestSlice {
  id: string;
  name: string;
  example: string;
  risk: number; // Thai SEC 1-8 scale; 9 = crypto (8+)
  pct: number;
  lumpThb: number;
  monthlyThb: number;
  color: string;
}

export interface InvestCheck {
  status: "ok" | "warn";
  label: string;
  detail: string;
}

export interface InvestPlan {
  id: string;
  profile: InvestProfile;
  profileName: string;
  score: number; // 5..20 from the five answers
  answers?: number[]; // the five answers, so the page can recalculate a plan U-Bot drafted
  lumpSumThb: number;
  monthlyThb: number;
  dcaDay: number;
  slices: InvestSlice[];
  crypto: { symbol: string; pctOfCrypto: number; level: RiskLevel; score: number | null; note: string }[];
  checks: InvestCheck[];
  dca: { date: string; amountThb: number; notes: string[] }[];
  weightedRisk: number;
  feePctYear: number;
  summary: string[];
  source: DataSource;
  createdAt: string;
  status: "pending" | "approved" | "declined";
  origin?: "app" | "mcp";
  receipt?: ProtectionReceipt;
}

