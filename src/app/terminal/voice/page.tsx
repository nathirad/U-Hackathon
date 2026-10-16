"use client";

import { useState } from "react";
import { ChatThread } from "@/components/ChatThread";
import { Icon } from "@/components/Icon";
import { useAgentChat } from "@/components/useAgentChat";
import { VoiceMode } from "@/components/voice/VoiceMode";

// The voice assistant: a full-screen spoken conversation with U-Bot (ElevenLabs Scribe listens,
// eleven_v3 speaks), opened on arrival and waiting for a tap on the orb. Closing it shows what
// was said, with the same risk cards and sources as the chat, and a button to talk again.
export default function VoicePage() {
  const { messages, busy, error, ask, scan, questionFor } = useAgentChat();
  const [open, setOpen] = useState(true);

  const send = (t: string) => {
    if (/^scan\b|สแกน/i.test(t)) scan();
    else ask(t);
  };

  return (
    <div className="voice-page">
      <header className="voice-page-head">
        <div>
          <h1>Voice assistant</h1>
          <p className="note">Talk with U-Bot hands-free. It checks unlocks, prices and news with the same tools as the chat, and you still approve every action.</p>
        </div>
        <button type="button" className="btn btn-primary voice-page-start" onClick={() => setOpen(true)}>
          <Icon name="mic" size={18} /> Start talking
        </button>
      </header>
      {messages.length > 1 ? (
        <section className="agent-chat" aria-label="What was said">
          <ChatThread messages={messages} busy={busy} questionFor={questionFor} />
        </section>
      ) : (
        <p className="note">Your conversation will show here, with the risk cards and sources behind each answer.</p>
      )}
      {open ? <VoiceMode onClose={() => setOpen(false)} ask={send} messages={messages} busy={busy} error={error} startPaused /> : null}
    </div>
  );
}
