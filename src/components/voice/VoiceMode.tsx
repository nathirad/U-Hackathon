"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { speakable, speakAloud, stopSpeaking } from "../chat/speak";
import { Icon } from "../Icon";
import { BRANDS, BrandLogo } from "../logos";
import type { ChatMessage } from "../useAgentChat";
import { listenEngine, listenOnce, type ListenEngine } from "./listen";

// Full-screen voice conversation with U-Bot, in the style of ChatGPT's voice mode: an orb that
// grows with your voice while listening, breathes while U-Guard checks, and moves with U-Bot's
// voice while it answers; then the mic opens again. The answer comes from the same agent and
// tools as the chat (and lands in the chat thread), so voice changes how you ask, not what's checked.
// Ears: ElevenLabs Scribe; voice: ElevenLabs (eleven_v3). Without a key: the browser's own.

type Phase = "listening" | "thinking" | "speaking" | "paused";

const ELEVENLABS = BRANDS.find((b) => b.id === "elevenlabs")!;

export function VoiceMode({
  onClose,
  ask,
  messages,
  busy,
  error,
}: {
  onClose: () => void;
  /** Sends a question to the agent (the same path as typing it). */
  ask: (text: string) => void;
  messages: ChatMessage[];
  busy: boolean;
  error: string | null;
}) {
  const [phase, setPhase] = useState<Phase>("listening");
  const [muted, setMuted] = useState(false);
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [ears, setEars] = useState<ListenEngine | null>(null);
  const [voice, setVoice] = useState<"elevenlabs" | "browser" | null>(null);

  const orb = useRef<HTMLButtonElement | null>(null);
  const phaseRef = useRef<Phase>("listening");
  const mutedRef = useRef(false);
  const level = useRef({ value: 0, at: 0 });
  const listening = useRef<AbortController | null>(null);
  const answered = useRef<string | null>(null); // id of the last bot message already spoken (or on screen before)
  const quietRuns = useRef(0);
  const askRef = useRef(ask);
  askRef.current = ask;
  const lastId = useRef<string | null>(null);
  lastId.current = messages[messages.length - 1]?.id ?? null;

  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };
  const onLevel = useCallback((v: number) => {
    level.current = { value: v, at: performance.now() };
  }, []);

  const listen = useCallback(async () => {
    listening.current?.abort();
    const ac = new AbortController();
    listening.current = ac;
    setProblem(null);
    go("listening");
    try {
      const text = await listenOnce({ onLevel, signal: ac.signal });
      if (ac.signal.aborted) return;
      if (!text) {
        // Nobody spoke: try once more, then pause instead of keeping the mic open.
        quietRuns.current += 1;
        if (quietRuns.current >= 2) go("paused");
        else void listen();
        return;
      }
      quietRuns.current = 0;
      setHeard(text);
      setReply("");
      answered.current = lastId.current;
      go("thinking");
      askRef.current(text);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setProblem((err as Error).message);
      go("paused");
    }
  }, [onLevel]);

  const close = useCallback(() => {
    phaseRef.current = "paused";
    listening.current?.abort();
    stopSpeaking();
    onClose();
  }, [onClose]);

  // Open: answers already on screen are not read out; start listening.
  useEffect(() => {
    answered.current = lastId.current;
    listenEngine().then(setEars);
    void listen();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      listening.current?.abort();
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The agent answered: read it aloud, then listen again (unless muted or closed).
  useEffect(() => {
    if (phaseRef.current !== "thinking" || busy) return;
    const last = messages[messages.length - 1];
    if (last && last.role === "bot" && last.id !== answered.current) {
      answered.current = last.id;
      setReply(speakable(last.text));
      go("speaking");
      speakAloud(last.text, { onLevel }).then((used) => {
        if (used) setVoice(used);
        if (phaseRef.current !== "speaking") return;
        if (mutedRef.current) go("paused");
        else void listen();
      });
    } else if (error) {
      setProblem(error);
      go("paused");
    }
  }, [messages, busy, error, onLevel, listen]);

  // Safety net: a question that never got an answer (no error either) pauses after a minute.
  useEffect(() => {
    if (phase !== "thinking") return;
    const t = setTimeout(() => {
      if (phaseRef.current !== "thinking") return;
      setProblem("U-Bot didn't answer. Tap the orb to try again.");
      go("paused");
    }, 60_000);
    return () => clearTimeout(t);
  }, [phase]);

  // The orb follows the voice: mic level while listening, U-Bot's audio while speaking. The
  // browser's own voice reports no level, so it gets a gentle talking motion instead.
  useEffect(() => {
    let raf = 0;
    let cur = 0;
    const frame = (t: number) => {
      const p = phaseRef.current;
      let goal = p === "listening" || p === "speaking" ? level.current.value : 0;
      if (p === "speaking" && t - level.current.at > 300) goal = 0.3 + 0.22 * Math.sin(t / 150) * Math.sin(t / 410);
      cur += (goal - cur) * 0.18;
      orb.current?.style.setProperty("--level", cur.toFixed(3));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  function tapOrb() {
    if (phase === "speaking") {
      // Interrupt, like talking over someone: stop and listen.
      stopSpeaking();
      void listen();
    } else if (phase === "paused") {
      setMuted(false);
      mutedRef.current = false;
      quietRuns.current = 0;
      void listen();
    }
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    if (next && phase === "listening") {
      listening.current?.abort();
      go("paused");
    } else if (!next && phase === "paused") {
      quietRuns.current = 0;
      void listen();
    }
  }

  const status =
    phase === "listening"
      ? "Listening…"
      : phase === "thinking"
        ? "Checking unlocks, prices and news…"
        : phase === "speaking"
          ? "Tap the orb to interrupt"
          : problem
            ? "Paused"
            : "Paused · tap the orb to talk";
  const eleven = voice ? voice === "elevenlabs" : ears === "elevenlabs";
  const shown = reply.length > 260 ? `${reply.slice(0, 260).trimEnd()}…` : reply;

  return (
    <div className="vm" data-phase={phase} role="dialog" aria-modal="true" aria-label="Voice mode with U-Bot">
      <header className="vm-top">
        <span className="vm-title">
          <i aria-hidden="true" /> U-Bot voice
        </span>
        <span className="vm-engine">{ears === null ? "" : eleven ? "ElevenLabs Scribe · eleven_v3" : "Browser voice (no ElevenLabs key)"}</span>
      </header>

      <div className="vm-stage">
        <button
          ref={orb}
          type="button"
          className="vm-orb"
          onClick={tapOrb}
          aria-label={phase === "speaking" ? "Interrupt U-Bot" : phase === "paused" ? "Start talking" : status}
        />
        <p className="vm-status" aria-live="polite">
          {status}
        </p>
        <div className="vm-captions">
          {heard ? <p className="vm-you">“{heard}”</p> : <p className="vm-you dim">Ask in English or Thai: “Is ARB risky right now?”</p>}
          {phase === "speaking" && shown ? <p className="vm-reply">{shown}</p> : null}
          {problem ? <p className="vm-problem">{problem}</p> : null}
        </div>
      </div>

      <footer className="vm-controls">
        <button type="button" className="vm-btn" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? "Unmute the mic" : "Mute the mic"}>
          <Icon name={muted ? "micOff" : "mic"} size={24} />
        </button>
        <span className="vm-powered">{eleven ? <>Voice by <BrandLogo brand={ELEVENLABS} scale={0.85} /></> : "Not investment advice"}</span>
        <button type="button" className="vm-btn vm-end" onClick={close} aria-label="End voice mode">
          <Icon name="close" size={24} />
        </button>
      </footer>
    </div>
  );
}
