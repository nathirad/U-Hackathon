"use client";

import { useEffect, useRef } from "react";
import { Avatar, topLevel } from "@/components/Avatar";
import { DriftCardView, ProposalCardView, RiskCardView, StressCardView } from "@/components/Cards";
import { openReport } from "@/lib/report";
import type { ChatMessage } from "./useAgentChat";

/** The message list: user bubbles, U-Guard answers with risk cards, proposals and a PDF button. */
export function ChatThread({
  messages,
  busy,
  questionFor,
  className = "chat-log",
}: {
  messages: ChatMessage[];
  busy: boolean;
  questionFor: (i: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [messages, busy]);

  return (
    <div className={className} ref={ref} aria-live="polite">
      {messages.map((m, i) =>
        m.role === "user" ? (
          <div key={m.id} className="msg msg-user">
            {m.screenshot?.previewUrl && (
              <img
                src={m.screenshot.previewUrl}
                alt="Uploaded Screenshot"
                style={{ maxWidth: 220, maxHeight: 160, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", marginBottom: 6, display: "block" }}
              />
            )}
            <div className="bubble">{m.text}</div>
          </div>
        ) : (
          <div key={m.id} className="msg msg-bot">
            <Avatar size={26} level={topLevel(m.result?.cards.map((c) => c.level) ?? [])} />
            <div className="msg-stack">
              {m.push && <span className="push-tag">U-BOT ALERT</span>}
              {m.screenshot && (
                <div style={{ padding: "8px 12px", background: "var(--surface-2, rgba(255,255,255,0.04))", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, margin: "6px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--teal)" }}>
                    <span>📸 Signal Screenshot Check ({m.screenshot.kind})</span>
                    {m.screenshot.engine && <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>{m.screenshot.engine}</span>}
                  </div>
                  {m.screenshot.summary && <p style={{ margin: "4px 0", color: "var(--text-2)" }}>{m.screenshot.summary}</p>}
                  {m.screenshot.claims.length > 0 && (
                    <div style={{ marginTop: 6, borderLeft: "2px solid var(--amber)", paddingLeft: 8 }}>
                      <span style={{ fontSize: 11, color: "var(--amber)", textTransform: "uppercase", letterSpacing: 0.5 }}>Unverified Claim in Image:</span>
                      {m.screenshot.claims.map((c, ci) => (
                        <p key={ci} style={{ margin: "2px 0", fontStyle: "italic", color: "var(--text)" }}>"{c}"</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="bubble">{m.text}</div>
              {m.result?.drift && <DriftCardView drift={m.result.drift} />}
              {m.result?.cards.map((c) => <RiskCardView key={c.symbol} card={c} />)}
              {m.result?.drift && <DriftCardView drift={m.result.drift} />}
              {m.result?.stress && <StressCardView stress={m.result.stress} />}
              {m.result?.proposals.map((p) => <ProposalCardView key={p.id} proposal={p} />)}
              {m.result && m.result.cards.length > 0 && (
                <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => openReport(questionFor(i), m.result!)}>
                  Save as PDF
                </button>
              )}
            </div>
          </div>
        ),
      )}
      {busy && (
        <div className="msg msg-bot">
          <Avatar size={26} thinking />
          <div className="bubble note">Fetching the latest data and scoring the risk…</div>
        </div>
      )}
    </div>
  );
}
