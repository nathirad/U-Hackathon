import { anthropicConfigured, anthropicModel } from "@/lib/agent/providers/anthropic";
import { openAIConfigured } from "@/lib/agent/providers/openai-compatible";
import { brokerName } from "@/lib/broker";
import { config, now } from "@/lib/config";
import { getQuote } from "@/lib/market";
import { sharedStoreEnabled } from "@/lib/store";
import { listTokens, trackedTokens } from "@/lib/tokenomist";
import { sttEnabled, voiceConfigured } from "@/lib/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Where each piece of data comes from right now, so "why isn't it updating?" has an answer.
// Booleans and modes only: never a key or its length.
export async function GET() {
  const [tokens, arb, tracked] = await Promise.all([listTokens(), getQuote("ARB"), trackedTokens()]);
  // Which model answers the chat, in the same order the agent tries them (AGENT_PROVIDER=auto).
  const p = config.agent.provider;
  const llm =
    p === "rules"
      ? "rules engine (AGENT_PROVIDER=rules)"
      : (p === "auto" || p === "openai") && openAIConfigured()
        ? `${config.llm.label} · ${config.llm.model} (OpenAI-compatible)`
        : (p === "auto" || p === "anthropic") && anthropicConfigured()
          ? `Claude · ${anthropicModel()}`
          : "rules engine: no LLM key (set ANTHROPIC_API_KEY or LLM_API_KEY)";
  return Response.json({
    now: new Date(now()).toISOString(),
    clockFrozen: Boolean(process.env.DEMO_NOW),
    tokenomist: {
      keySet: Boolean(config.tokenomist.apiKey),
      mode: tokens.source,
      tokens: tokens.data.length,
      asOf: tokens.asOf,
      problem: tokens.warning ?? null,
      scoredInFull: tracked.data.map((t) => t.symbol.toUpperCase()),
    },
    prices: { setting: config.market.source, mode: arb?.source ?? null, asOf: arb?.asOf ?? null, stale: arb?.stale ?? false },
    news: config.intel.news,
    odds: config.intel.odds,
    agent: llm,
    voice: {
      speech: voiceConfigured() ? `ElevenLabs · ${config.elevenlabs.modelId}` : "browser voice (no ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID)",
      listening: sttEnabled() ? "ElevenLabs Scribe" : "browser speech recognition",
    },
    avalancheData: { keySet: Boolean(process.env.AVALANCHE_DATA_API_KEY), wallet: Boolean(config.avalanche.walletAddress), fujiSigner: Boolean(config.avalanche.demoPrivateKey) },
    sharedStore: sharedStoreEnabled,
    broker: brokerName(),
  });
}
