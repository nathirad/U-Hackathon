// Every external integration is optional: a missing key switches that piece to its
// labelled fallback, so the demo always runs end to end.

function env(name: string, fallback = ""): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : fallback;
}

type AgentProvider = "auto" | "openai" | "anthropic" | "rules";

/** AGENT_PROVIDER wins; the older AGENT_MODE still works (offline = rules, claude = Claude only). */
function agentProvider(): AgentProvider {
  const provider = env("AGENT_PROVIDER");
  if (provider) return provider as AgentProvider;
  const legacy = env("AGENT_MODE", "auto");
  return legacy === "offline" ? "rules" : legacy === "claude" ? "anthropic" : "auto";
}

export const config = {
  agent: {
    // auto = OpenAI-compatible LLM if LLM_API_KEY is set, else Claude if ANTHROPIC_API_KEY (or the
    // Vercel AI Gateway) is set, else the deterministic rules engine. Any LLM error falls back to rules
    // with a visible note, unless AGENT_MODE=claude asks to surface the error instead.
    provider: agentProvider(),
    strict: env("AGENT_MODE") === "claude",
    maxTurns: Number(env("AGENT_MAX_TURNS", "8")),
  },
  // Any OpenAI-compatible Chat Completions endpoint: Gemini, OpenAI, Typhoon, Groq,
  // OpenRouter, Vercel AI Gateway, a local Ollama...
  llm: {
    baseUrl: env("LLM_BASE_URL").replace(/\/+$/, ""),
    apiKey: env("LLM_API_KEY"),
    model: env("LLM_MODEL"),
    label: env("LLM_LABEL", "LLM"),
    timeoutMs: Number(env("LLM_TIMEOUT_MS", "25000")),
  },
  anthropic: {
    apiKey: env("ANTHROPIC_API_KEY"),
    model: env("ANTHROPIC_MODEL", "claude-opus-5-5"),
    effort: env("AGENT_EFFORT", "low") as "low" | "medium" | "high",
  },
  // Optional: route Claude through Vercel AI Gateway (Anthropic Messages API compatible).
  gateway: {
    kind: env("AI_GATEWAY", "none") as "none" | "vercel",
    apiKey: env("AI_GATEWAY_API_KEY"),
    baseUrl: "https://ai-gateway.vercel.sh",
    // Gateway model ids look like "anthropic/<model>"; check the exact id in the gateway's model list.
    model: env("AI_GATEWAY_MODEL", "anthropic/claude-opus-5.5"),
  },
  tokenomist: {
    apiKey: env("TOKENOMIST_API_KEY"),
    baseUrl: env("TOKENOMIST_BASE_URL", "https://api.tokenomist.ai"),
  },
  market: {
    source: env("MARKET_SOURCE", "fixture") as "live" | "fixture",
  },
  intel: {
    news: env("NEWS_SOURCE", "fixture") as "live" | "rss" | "fixture", // rss = news feeds + curated snapshot; live = GDELT
    odds: env("ODDS_SOURCE", "fixture") as "live" | "fixture",
  },
  elevenlabs: {
    apiKey: env("ELEVENLABS_API_KEY"),
    voiceId: env("ELEVENLABS_VOICE_ID"),
    modelId: env("ELEVENLABS_MODEL_ID", "eleven_v3"),
    sttModelId: env("ELEVENLABS_STT_MODEL_ID", "scribe_v1"),
  },
  avalanche: {
    rpcUrl: env("AVALANCHE_RPC_URL", "https://api.avax-test.network/ext/bc/C/rpc"),
    walletAddress: env("WALLET_ADDRESS"),
    demoPrivateKey: env("DEMO_PRIVATE_KEY"),
  },
  ubot: {
    adapter: env("UBOT_ADAPTER", "mock") as "mock" | "webhook",
    webhookUrl: env("UBOT_WEBHOOK_URL"),
    apiKey: env("UBOT_API_KEY"),
  },
  auth: {
    secret: env("AUTH_SECRET"),
    demoLogin: env("DEMO_LOGIN", "true") !== "false",
    // Shared = everyone who taps "demo" is the same demo-user (the laptop stage demo: U-Bot over MCP
    // acts for demo-user). On Vercel each visitor gets their own demo account unless DEMO_SHARED=true.
    demoShared: env("DEMO_SHARED", process.env.VERCEL ? "false" : "true") !== "false",
    dataDir: env("DATA_DIR", "data/runtime"),
  },
  mcp: {
    apiKey: env("MCP_API_KEY"),
  },
  // Alert watcher: quiet hours (Bangkok time; only high-severity alerts go out) and a daily cap
  // per user. Vercel Cron calls /api/watch with "Authorization: Bearer $CRON_SECRET".
  watch: {
    cronSecret: env("CRON_SECRET"),
    quietStartHour: Number(env("WATCH_QUIET_START", "22")),
    quietEndHour: Number(env("WATCH_QUIET_END", "7")),
    maxPerDay: Number(env("WATCH_MAX_PER_DAY", "5")),
  },
  // Unlocks further out than this are outside the watch window (Keyrock: price pressure
  // typically starts ~30 days before an unlock).
  watchWindowDays: 30,
  // A cliff that already happened keeps counting for this long (pressure fades ~2 weeks after).
  postUnlockDays: 14,
  isProd: process.env.NODE_ENV === "production",
};

/**
 * Current time. DEMO_NOW (ISO date) freezes the clock, e.g. to rehearse tomorrow's demo
 * today: DEMO_NOW=2026-10-16T07:00:00Z
 */
export function now(): number {
  const fixed = env("DEMO_NOW");
  const t = fixed ? Date.parse(fixed) : NaN;
  return Number.isFinite(t) ? t : Date.now();
}
