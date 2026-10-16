// Claude via the official Anthropic SDK (native API: prompt caching, effort, server-side
// refusal fallbacks). Optional: used when AGENT_PROVIDER=anthropic (or AGENT_MODE=claude), or in
// auto mode when only ANTHROPIC_API_KEY or the Vercel AI Gateway is set. Claude is never routed
// through the OpenAI-compatible shim. Manual loop (not the beta tool runner) so every step lands
// in the Agent Trace and approval stays outside the loop: the agent can only *propose*.

import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config";
import type { AnswerMode, ChatTurn } from "../../types";
import { MODE_NOTE, SYSTEM_PROMPT_WITH_KNOWLEDGE } from "../prompt";
import { AGENT_TOOL_SPECS, executeTool, type RunContext } from "../tools";
import type { LlmRun } from "./openai-compatible";

// Models that accept server-side refusal fallbacks in the `"default"` form. Claude Haiku 5.5
// has no server-side fallback, so the parameter is omitted for it.
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

// AI_GATEWAY=vercel sends the same Messages API calls through Vercel AI Gateway.
const viaGateway = config.gateway.kind === "vercel" && Boolean(config.gateway.apiKey);

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= viaGateway
    ? new Anthropic({ apiKey: config.gateway.apiKey, baseURL: config.gateway.baseUrl, timeout: 60_000, maxRetries: 1 })
    : new Anthropic({ apiKey: config.anthropic.apiKey, timeout: 60_000, maxRetries: 1 });
  return client;
}

/** The same client (direct or via the gateway), for the screenshot reader in lib/vision.ts. */
export const anthropicClient = getClient;

export function anthropicLabel(): string {
  return viaGateway ? "Claude · via Vercel AI Gateway" : "Claude";
}

export function anthropicModel(): string {
  return viaGateway ? config.gateway.model : config.anthropic.model;
}

const TOOLS: Anthropic.Beta.BetaTool[] = AGENT_TOOL_SPECS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.input_schema,
  strict: true,
}));

export function anthropicConfigured(): boolean {
  return viaGateway || Boolean(config.anthropic.apiKey);
}

const COPY = {
  en: {
    refusal: "Sorry, I can't help with that. Ask me about unlocks, news or market odds for a token.",
    empty: "Checked. The details are in the cards below.",
  },
  th: {
    refusal: "ขออภัย เรื่องนี้ U-Guard ช่วยไม่ได้ ลองถามเรื่องความเสี่ยงจากการปลดล็อกเหรียญดูนะ",
    empty: "ตรวจสอบเรียบร้อย ดูรายละเอียดในการ์ดด้านล่างได้เลย",
  },
};

export async function runAnthropic(args: { message: string; history: ChatTurn[]; mode: AnswerMode; ctx: RunContext }): Promise<LlmRun> {
  const { ctx } = args;
  const model = anthropicModel();
  const copy = COPY[ctx.locale];
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...args.history.map((t) => ({ role: t.role, content: t.text }) as Anthropic.Beta.BetaMessageParam),
    {
      role: "user",
      content: [
        { type: "text", text: args.message },
        { type: "text", text: `(${MODE_NOTE[args.mode]})` },
      ],
    },
  ];
  const usage = { inputTokens: 0, outputTokens: 0 };
  let servedBy = model;

  const step = async (allowTools: boolean) => {
    const t0 = Date.now();
    const response = await getClient().beta.messages.create({
      model,
      max_tokens: 16000,
      system: [{ type: "text", text: SYSTEM_PROMPT_WITH_KNOWLEDGE, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      tool_choice: allowTools ? { type: "auto" } : { type: "none" },
      messages,
      output_config: { effort: config.anthropic.effort },
      // On a safety decline, the API retries on Anthropic's recommended fallback model. Sent only
      // to the Anthropic API directly; the gateway has its own model fallbacks.
      ...(!viaGateway && FALLBACK_MODELS.has(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    servedBy = response.model;
    usage.inputTokens += response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0);
    usage.outputTokens += response.usage.output_tokens;
    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    ctx.trace.push({
      kind: "llm",
      name: `${anthropicLabel()} · ${response.model}`,
      summary: `${toolUses.length ? `planned ${toolUses.length} tool call(s)` : "wrote the answer"} · cache read ${response.usage.cache_read_input_tokens ?? 0} tokens`,
      ms: Date.now() - t0,
      ok: response.stop_reason !== "refusal",
    });
    // Append the full content (thinking blocks included) unchanged.
    messages.push({ role: "assistant", content: response.content });
    return { response, toolUses, text };
  };

  let reply = "";
  for (let turn = 0; turn < config.agent.maxTurns; turn++) {
    const { response, toolUses, text } = await step(true);
    if (response.stop_reason === "refusal") {
      reply = copy.refusal;
      break;
    }
    // A long server-side turn was paused: send the content back as-is and let it continue.
    if (response.stop_reason === "pause_turn") continue;
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      reply = text;
      break;
    }
    const results = await Promise.all(
      toolUses.map(async (call): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        const out = await executeTool(call.name, call.input, ctx);
        return { type: "tool_result", tool_use_id: call.id, content: out.content, is_error: out.isError };
      }),
    );
    messages.push({ role: "user", content: results });
  }
  if (!reply) reply = (await step(false)).text || copy.empty;

  return {
    reply,
    get model() {
      return servedBy;
    },
    usage,
    rewrite: async (issues) => {
      messages.push({
        role: "user",
        content: `Rewrite your last answer. It broke these rules: ${issues.join("; ")}. Use only facts and numbers from the tool results, give no buy/sell/hold advice and no price predictions, and keep it to 5 short lines.`,
      });
      return (await step(false)).text;
    },
  };
}
