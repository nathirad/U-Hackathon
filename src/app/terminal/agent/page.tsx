"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Avatar, topLevel } from "@/components/Avatar";
import { ChatThread } from "@/components/ChatThread";
import { DataBadge } from "@/components/DataBadge";
import { Icon } from "@/components/Icon";
import { MicButton } from "@/components/MicButton";
import { primeAudio } from "@/components/chat/speak";
import { TracePanel } from "@/components/TracePanel";
import { useAgentChat } from "@/components/useAgentChat";
import { VoiceMode } from "@/components/voice/VoiceMode";

const SUGGESTIONS = [
  "Should I buy 5,000 THB of ARB now?",
  "Scan my portfolio",
  "How risky is my portfolio?",
  "Is AVAX worrying?",
  "What's in the news for my coins?",
  "Explain FDV simply",
];

function AgentInner() {
  const params = useSearchParams();
  const { messages, busy, error, setError, levels, last, ask, scan, checkScreenshot, questionFor } = useAgentChat();
  const [input, setInput] = useState("");
  const asked = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Voice mode: a full-screen spoken conversation (components/voice/VoiceMode.tsx).
  const [voiceOpen, setVoiceOpen] = useState(false);

  // A question passed from the home page or the ⌘K search runs once on arrival.
  useEffect(() => {
    const q = params.get("q");
    if (q && !asked.current) {
      asked.current = true;
      ask(q);
    }
  }, [params, ask]);

  const send = (t: string) => {
    setInput("");
    if (/^scan\b|สแกน/i.test(t)) scan();
    else ask(t);
  };

  const handleFile = (file?: File | null) => {
    if (!file) return;
    checkScreenshot(file, input.trim() || undefined);
    setInput("");
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          handleFile(file);
          return;
        }
      }
    }
  };

  return (
    <div className="agent-layout">
      <section className="agent-chat" aria-label="Chat with U-Bot">
        <div className="chat-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar size={32} thinking={busy} level={topLevel(Object.values(levels))} />
            <div>
              <p>U-Bot · with the U-Guard check</p>
              <span>{busy ? "U-Guard is calling its tools…" : "U-Bot talks, U-Guard checks the risk, you decide · not investment advice"}</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <DataBadge
              status="LIVE"
              source={last?.engine ?? "U-Bot Agent"}
              label="Inference"
            />
            <button
              type="button"
              className="btn btn-sm voice-toggle"
              onClick={() => {
                primeAudio(); // inside the tap, so U-Bot's voice can play and be measured
                setVoiceOpen(true);
              }}
              title="Talk with U-Bot hands-free: speak, hear the answer, speak again"
            >
              <Icon name="mic" size={16} /> Voice mode
            </button>
          </div>
        </div>
        <ChatThread messages={messages} busy={busy} questionFor={questionFor} />
        {error && <p className="error" style={{ padding: "0 14px" }}>{error}</p>}
        <div className="chips">
          <button
            type="button"
            className="chip"
            style={{ borderColor: "var(--teal)", color: "var(--teal)" }}
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            title="Upload a trading signal, chart or portfolio screenshot to check"
          >
            📸 Check Signal Screenshot
          </button>
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip" onClick={() => send(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            type="file"
            ref={fileInput}
            accept="image/png,image/jpeg,image/webp,image/gif"
            style={{ display: "none" }}
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="btn"
            style={{ padding: "0 10px", display: "inline-flex", alignItems: "center", gap: 4 }}
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            title="Upload screenshot or paste image (Cmd+V)"
          >
            <Icon name="image" size={16} />
          </button>
          <label htmlFor="agent-ask" className="sr-only">Ask U-Bot</label>
          <input
            id="agent-ask"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            placeholder="Ask a question or paste screenshot (Cmd+V)…"
            autoComplete="off"
            maxLength={500}
          />
          <MicButton onText={send} onError={setError} disabled={busy} />
          <button className="btn btn-primary" type="submit" disabled={busy || !input.trim()}>Send</button>
        </form>
      </section>
      <aside style={{ display: "grid", gap: 16 }}>
        <TracePanel last={last} />
      </aside>
      {voiceOpen ? <VoiceMode onClose={() => setVoiceOpen(false)} ask={send} messages={messages} busy={busy} error={error} /> : null}
    </div>
  );
}

export default function AgentPage() {
  return (
    <Suspense fallback={<p className="note">Loading…</p>}>
      <AgentInner />
    </Suspense>
  );
}
