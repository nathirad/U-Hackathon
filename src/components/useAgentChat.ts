"use client";

import { useCallback, useState } from "react";
import { ensureSession } from "@/components/EnsureSession";
import { engineLabel } from "@/lib/format";
import type { AgentResult, ChatTurn, RiskLevel, TraceStep } from "@/lib/types";

export interface ChatMessage {
  id: string;
  role: "user" | "bot";
  text: string;
  result?: AgentResult;
  push?: boolean;
  screenshot?: {
    previewUrl?: string;
    kind: string;
    claims: string[];
    summary: string;
    engine: string;
  };
}

export interface LastRun {
  trace: TraceStep[];
  engine: string; // "Claude", the LLM's model name, or "Offline agent"
  ms: number;
  note?: string;
  result: AgentResult;
}

export const WELCOME: ChatMessage = {
  id: "welcome",
  role: "bot",
  text: "Hi, I'm U-Guard. Before you buy or hold a token, I check whether a large batch is about to unlock into the market. Type a token or tap an example below. You can ask in English or Thai.",
};

/** Chat state shared by the U-topia phone view (/app) and the terminal's AI Agent page. */
export function useAgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<Record<string, RiskLevel>>({});
  const [last, setLast] = useState<LastRun | null>(null);

  const absorb = useCallback((result: AgentResult, ms: number) => {
    setLast({ trace: result.trace, engine: engineLabel(result), ms, note: result.note, result });
    setLevels((prev) => ({ ...prev, ...Object.fromEntries(result.cards.map((c) => [c.symbol, c.level])) }));
  }, []);

  const ask = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy) return;
      setError(null);
      const history: ChatTurn[] = messages
        .filter((m) => m.id !== "welcome")
        .slice(-8)
        .map((m) => ({ role: m.role === "user" ? "user" : "assistant", text: m.text }));
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text: message }]);
      setBusy(true);
      const t0 = performance.now();
      try {
        await ensureSession(); // wallet questions and proposals need the (demo) account
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, history }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "U-Guard can't answer right now. Try again.");
        const result = body as AgentResult;
        absorb(result, Math.round(performance.now() - t0));
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "bot", text: result.reply, result }]);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, absorb],
  );

  const scan = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const t0 = performance.now();
    try {
      await ensureSession();
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: "en" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "The scan failed. Try again.");
      const result = body as AgentResult & { pushed: boolean };
      absorb(result, Math.round(performance.now() - t0));
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "bot", text: result.reply, result, push: result.pushed }]);
      if (result.pushed) window.dispatchEvent(new Event("ubot:inbox")); // refresh the header bell
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [busy, absorb]);

  const checkScreenshot = useCallback(
    async (file: File, typedSymbols?: string) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      const previewUrl = URL.createObjectURL(file);
      const userMsgId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        {
          id: userMsgId,
          role: "user",
          text: typedSymbols ? `Screenshot: check ${typedSymbols}` : `Checking screenshot (${file.name})…`,
          screenshot: { previewUrl, kind: "upload", claims: [], summary: file.name, engine: "" },
        },
      ]);
      const t0 = performance.now();
      try {
        await ensureSession();
        const form = new FormData();
        form.append("image", file);
        if (typedSymbols) form.append("symbols", typedSymbols);
        const locale = navigator.language?.toLowerCase().startsWith("th") ? "th" : "en";
        form.append("lang", locale);

        const res = await fetch("/api/screenshot", {
          method: "POST",
          body: form,
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to analyze screenshot.");

        if (body.needsSymbols) {
          const reason = body.visionError ? `(${body.visionError})` : "";
          const tip =
            locale === "th"
              ? `อ่านภาพไม่พบสัญลักษณ์เหรียญ ${reason} พิมพ์ชื่อเหรียญ (เช่น ARB) เพื่อเช็กได้เลย`
              : `No token ticker was found in the image ${reason}. Type the ticker below to check it.`;
          setMessages((prev) => [
            ...prev,
            { id: crypto.randomUUID(), role: "bot", text: tip },
          ]);
          return;
        }

        const result = body.result as AgentResult;
        absorb(result, Math.round(performance.now() - t0));
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "bot",
            text: result.reply,
            result,
            screenshot: body.read
              ? {
                  previewUrl,
                  kind: body.read.kind,
                  claims: body.read.claims,
                  summary: body.read.summary,
                  engine: body.read.engine,
                }
              : undefined,
          },
        ]);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [busy, absorb],
  );

  /** The user message that led to bot message i (for the PDF report title). */
  const questionFor = useCallback(
    (i: number) => (messages[i - 1]?.role === "user" ? messages[i - 1].text : "Portfolio scan"),
    [messages],
  );

  return { messages, busy, error, setError, levels, last, ask, scan, checkScreenshot, questionFor };
}
