"use client";

import { useEffect, useRef, useState } from "react";
import { browserRecognition, listenEngine, type Recognition } from "./voice/listen";

/**
 * Ask by voice, tap to start and tap to stop: ElevenLabs Scribe when configured, otherwise the
 * browser's own recognition (Thai if the device is set to Thai, else English). The hands-free
 * conversation lives in voice/VoiceMode.tsx.
 */
export function MicButton({
  onText,
  onError,
  disabled,
}: {
  onText: (text: string) => void;
  onError: (message: string | null) => void;
  disabled?: boolean;
}) {
  const [engine, setEngine] = useState<"elevenlabs" | "browser" | "none" | null>(null);
  const [state, setState] = useState<"idle" | "recording" | "processing">("idle");
  const recorder = useRef<MediaRecorder | null>(null);
  const recognition = useRef<Recognition | null>(null);

  useEffect(() => {
    listenEngine().then(setEngine);
  }, []);

  async function startElevenLabs() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setState("processing");
      try {
        const form = new FormData();
        form.append("audio", new Blob(chunks, { type: rec.mimeType || "audio/webm" }), "question.webm");
        const res = await fetch("/api/stt", { method: "POST", body: form });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.text) throw new Error(body.error ?? "Couldn't hear that clearly. Try again.");
        onText(body.text);
      } catch (err) {
        onError((err as Error).message);
      } finally {
        setState("idle");
      }
    };
    recorder.current = rec;
    rec.start();
    setState("recording");
  }

  function startBrowser() {
    const Ctor = browserRecognition();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language?.toLowerCase().startsWith("th") ? "th-TH" : "en-US";
    rec.interimResults = false;
    rec.onresult = (e) => onText(e.results[0][0].transcript);
    rec.onerror = () => onError("Couldn't hear that clearly. Try again.");
    rec.onend = () => setState("idle");
    recognition.current = rec;
    rec.start();
    setState("recording");
  }

  async function toggle() {
    onError(null);
    if (state === "recording") {
      recorder.current?.stop();
      recognition.current?.stop();
      return;
    }
    try {
      if (engine === "elevenlabs") await startElevenLabs();
      else if (engine === "browser") startBrowser();
    } catch {
      onError("Couldn't open the mic. Check the microphone permission.");
      setState("idle");
    }
  }

  const unavailable = engine === "none";
  return (
    <button
      type="button"
      className={`btn mic ${state === "recording" ? "mic-on" : ""}`}
      onClick={toggle}
      disabled={disabled || unavailable || engine === null || state === "processing"}
      aria-pressed={state === "recording"}
      title={
        unavailable
          ? "This browser doesn't support voice input"
          : engine === "elevenlabs"
            ? "Ask by voice (ElevenLabs Scribe)"
            : "Ask by voice (browser speech recognition)"
      }
    >
      {state === "recording" ? "Stop" : state === "processing" ? "…" : "Speak"}
    </button>
  );
}
