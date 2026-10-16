// Tool-use loop over any OpenAI-compatible Chat Completions endpoint: Gemini
// (generativelanguage.googleapis.com/v1beta/openai), OpenAI, Typhoon (api.opentyphoon.ai/v1),
// Groq, OpenRouter, Vercel AI Gateway, a local Ollama... Switching model = changing env.
// Plain fetch keeps it dependency-free and avoids provider-specific SDK quirks.

import { config } from "../../config";
import type { AnswerMode, ChatTurn } from "../../types";
import { MODE_NOTE, SYSTEM_PROMPT_WITH_KNOWLEDGE } from "../prompt";
import { AGENT_TOOL_SPECS, executeTool, type RunContext } from "../tools";

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface Msg {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface Completion {
  model?: string;
  choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Strict-style schemas → portable ones: nullable unions become optional plain types. */
function portable(schema: (typeof AGENT_TOOL_SPECS)[number]["input_schema"]) {
  const properties: Record<string, unknown> = {};
  const required = [...schema.required];
  for (const [key, prop] of Object.entries(schema.properties)) {
    const p = prop as { anyOf?: { type: string }[]; description?: string };
    if (p.anyOf) {
      const nonNull = p.anyOf.find((a) => a.type !== "null");
      properties[key] = { ...(nonNull ?? { type: "string" }), description: p.description };
      required.splice(required.indexOf(key), 1);
    } else {
      properties[key] = prop;
    }
  }
  return { type: "object", properties, required };
}

const TOOLS = AGENT_TOOL_SPECS.map((t) => ({
  type: "function" as const,
  function: { name: t.name, description: t.description, parameters: portable(t.input_schema) },
}));

export function openAIConfigured(): boolean {
  return Boolean(config.llm.baseUrl && config.llm.apiKey && config.llm.model);
}

async function complete(messages: Msg[], toolChoice: "auto" | "none"): Promise<Completion> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.llm.apiKey}` },
      body: JSON.stringify({ model: config.llm.model, messages, tools: TOOLS, tool_choice: toolChoice }),
      signal: AbortSignal.timeout(config.llm.timeoutMs),
      cache: "no-store",
    });
    if (res.ok) return (await res.json()) as Completion;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 1) {
      throw new Error(`${config.llm.label} ${res.status}: ${(await res.text()).slice(0, 160)}`);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
}

function parseArgs(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { __invalid_json: raw.slice(0, 200) };
  }
}

export interface LlmRun {
  reply: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  /** One extra turn asking the model to fix a reply that failed the compliance check. */
  rewrite: (issues: string[]) => Promise<string>;
}

export async function runOpenAICompatible(args: {
  message: string;
  history: ChatTurn[];
  mode: AnswerMode;
  ctx: RunContext;
}): Promise<LlmRun> {
  const { ctx } = args;
  const messages: Msg[] = [
    { role: "system", content: SYSTEM_PROMPT_WITH_KNOWLEDGE },
    { role: "system", content: MODE_NOTE[args.mode] },
    ...args.history.map((t): Msg => ({ role: t.role, content: t.text })),
    { role: "user", content: args.message },
  ];
  const usage = { inputTokens: 0, outputTokens: 0 };
  let model = config.llm.model;

  const step = async (toolChoice: "auto" | "none") => {
    const t0 = Date.now();
    const body = await complete(messages, toolChoice);
    model = body.model ?? model;
    usage.inputTokens += body.usage?.prompt_tokens ?? 0;
    usage.outputTokens += body.usage?.completion_tokens ?? 0;
    const msg = body.choices?.[0]?.message ?? {};
    const calls = msg.tool_calls ?? [];
    ctx.trace.push({
      kind: "llm",
      name: `${config.llm.label} · ${model}`,
      summary: `${calls.length ? `planned ${calls.length} tool call(s)` : "wrote the answer"} · ${body.usage?.prompt_tokens ?? "?"} in / ${body.usage?.completion_tokens ?? "?"} out tokens`,
      ms: Date.now() - t0,
      ok: true,
    });
    return { content: msg.content ?? "", calls };
  };

  let reply = "";
  for (let turn = 0; turn < config.agent.maxTurns; turn++) {
    const { content, calls } = await step("auto");
    if (calls.length === 0) {
      reply = content;
      break;
    }
    messages.push({ role: "assistant", content: content || null, tool_calls: calls });
    const results = await Promise.all(calls.map((c) => executeTool(c.function.name, parseArgs(c.function.arguments), ctx)));
    results.forEach((r, i) => messages.push({ role: "tool", tool_call_id: calls[i].id, content: r.content }));
  }
  if (!reply) {
    // Turn budget spent while still calling tools: ask for the answer without tools.
    reply = (await step("none")).content;
  }
  messages.push({ role: "assistant", content: reply });

  return {
    reply: reply.trim(),
    get model() {
      return model;
    },
    usage,
    rewrite: async (issues) => {
      messages.push({
        role: "user",
        content: `Rewrite your last answer. It broke these rules: ${issues.join("; ")}. Use only facts and numbers from the tool results, give no buy/sell/hold advice and no price predictions, and keep it to 5 short lines.`,
      });
      return (await step("none")).content.trim();
    },
  };
}
