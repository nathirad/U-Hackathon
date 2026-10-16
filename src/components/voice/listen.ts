// Listening for voice mode: records one spoken question and returns its text. ElevenLabs Scribe
// when /api/stt is configured, else the browser's own recognition. Reports the mic level (0–1)
// so the orb can move with the speaker, and stops by itself ~1.4 s after they go quiet.

export type ListenEngine = "elevenlabs" | "browser" | "none";

// Minimal typing for the browser's (prefixed) Web Speech recognition API.
export interface Recognition {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e?: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

export function browserRecognition(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

let engine: Promise<ListenEngine> | null = null;
/** Which engine listens on this device (asked once per page load). */
export function listenEngine(): Promise<ListenEngine> {
  engine ??= fetch("/api/stt")
    .then((r) => r.json())
    .then((b: { enabled?: boolean }) => (b.enabled ? "elevenlabs" : browserRecognition() ? "browser" : "none"))
    .catch(() => (browserRecognition() ? "browser" : "none"));
  return engine;
}

const LOUD = 0.04; // RMS above this counts as speech
const QUIET_MS = 1400; // stop this long after the speaker goes quiet
const MAX_SPEECH_MS = 15_000;
const MAX_WAIT_MS = 20_000; // nobody spoke: give up and let the caller pause

/** Mic level meter on a stream. Calls `onLevel` every frame; returns a stop function. */
function meter(stream: MediaStream, onFrame: (rms: number) => void): () => void {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return () => undefined;
  const ctx = new Ctx();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);
  let raf = 0;
  const tick = () => {
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += ((v - 128) / 128) ** 2;
    onFrame(Math.sqrt(sum / buf.length));
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    ctx.close().catch(() => undefined);
  };
}

/**
 * Listens for one question. Resolves with the text, or "" when nobody spoke. Rejects with an
 * Error the user can read (no mic permission, Scribe failed), or an AbortError when cancelled.
 */
export async function listenOnce(opts: { onLevel?: (level: number) => void; signal?: AbortSignal } = {}): Promise<string> {
  const which = await listenEngine();
  if (which === "none") throw new Error("This browser can't listen. Type your question instead.");
  if (opts.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    if (which === "elevenlabs") throw new Error("Couldn't open the mic. Check the microphone permission.");
    // Browser recognition opens the mic itself; the orb just won't follow the voice.
  }
  return which === "elevenlabs" ? withScribe(stream!, opts) : withBrowser(stream, opts);
}

function withScribe(stream: MediaStream, { onLevel, signal }: { onLevel?: (l: number) => void; signal?: AbortSignal }): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    const started = Date.now();
    let heard = false;
    let heardAt = 0;
    let quietSince = 0;
    let cancelled = false;
    const stopMeter = meter(stream, (rms) => {
      onLevel?.(Math.min(1, rms * 7));
      if (rec.state !== "recording") return;
      const now = Date.now();
      if (rms > LOUD) {
        if (!heard) heardAt = now;
        heard = true;
        quietSince = 0;
      } else if (heard && !quietSince) quietSince = now;
      if ((heard && quietSince && now - quietSince > QUIET_MS) || (heard && now - heardAt > MAX_SPEECH_MS) || (!heard && now - started > MAX_WAIT_MS)) rec.stop();
    });
    const onAbort = () => {
      cancelled = true;
      if (rec.state === "recording") rec.stop();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = async () => {
      stopMeter();
      stream.getTracks().forEach((t) => t.stop());
      signal?.removeEventListener("abort", onAbort);
      onLevel?.(0);
      if (cancelled) return reject(new DOMException("Cancelled", "AbortError"));
      if (!heard) return resolve("");
      try {
        const form = new FormData();
        form.append("audio", new Blob(chunks, { type: rec.mimeType || "audio/webm" }), "question.webm");
        const res = await fetch("/api/stt", { method: "POST", body: form, signal });
        const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
        if (!res.ok) throw new Error(body.error ?? "Couldn't hear that clearly. Try again.");
        resolve((body.text ?? "").trim());
      } catch (err) {
        reject((err as Error).name === "AbortError" ? err : new Error((err as Error).message));
      }
    };
    rec.start();
  });
}

function withBrowser(stream: MediaStream | null, { onLevel, signal }: { onLevel?: (l: number) => void; signal?: AbortSignal }): Promise<string> {
  return new Promise((resolve, reject) => {
    const rec = new (browserRecognition()!)();
    rec.lang = navigator.language?.toLowerCase().startsWith("th") ? "th-TH" : "en-US";
    rec.interimResults = false;
    let text = "";
    let failed: string | null = null;
    let cancelled = false;
    const stopMeter = stream ? meter(stream, (rms) => onLevel?.(Math.min(1, rms * 7))) : () => undefined;
    const onAbort = () => {
      cancelled = true;
      rec.stop();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    rec.onresult = (e) => {
      text = e.results[0]?.[0]?.transcript ?? "";
    };
    rec.onerror = (e) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") failed = "Couldn't open the mic. Check the microphone permission.";
    };
    rec.onend = () => {
      stopMeter();
      stream?.getTracks().forEach((t) => t.stop());
      signal?.removeEventListener("abort", onAbort);
      onLevel?.(0);
      if (cancelled) reject(new DOMException("Cancelled", "AbortError"));
      else if (failed) reject(new Error(failed));
      else resolve(text.trim());
    };
    rec.start();
  });
}
