// Speaks a reply aloud and resolves when it has finished: ElevenLabs via /api/voice, or the
// browser's own voice when /api/voice answers 204 (no key). Used by voice mode, which listens
// again only after U-Bot has stopped talking. With `onLevel` the ElevenLabs audio also reports its
// loudness (0–1) every frame, so the voice-mode orb moves with U-Bot's voice.

let current: { audio?: HTMLAudioElement; url?: string; stopMeter?: () => void } = {};
let audioCtx: AudioContext | null = null;

/** Opens the audio context during a tap (browsers start it suspended otherwise). Voice mode calls this. */
export function primeAudio(): void {
  if (typeof window === "undefined") return;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  audioCtx ??= new Ctx();
  audioCtx.resume().catch(() => undefined);
}

/** Routes the audio through an analyser. Only when the context runs: a suspended one would mute it. */
function meterAudio(audio: HTMLAudioElement, onLevel: (level: number) => void): (() => void) | undefined {
  if (!audioCtx || audioCtx.state !== "running") return undefined;
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  const source = audioCtx.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(audioCtx.destination);
  const buf = new Uint8Array(analyser.fftSize);
  let raf = 0;
  const tick = () => {
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += ((v - 128) / 128) ** 2;
    onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 5));
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    source.disconnect();
    analyser.disconnect();
    onLevel(0);
  };
}

export function speakable(text: string): string {
  return text
    .replace(/\[\d+\]/g, "")
    .replace(/\((sample data|ข้อมูลตัวอย่าง)\)/gi, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>]/g, "")
    .trim();
}

export function stopSpeaking(): void {
  current.stopMeter?.();
  current.audio?.pause();
  if (current.url) URL.revokeObjectURL(current.url);
  current = {};
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

/**
 * Reads text aloud; resolves when done, stopped, or after a time limit (some browsers never fire
 * "end"), with the voice that spoke: "elevenlabs", "browser", or null when nothing was said.
 */
export async function speakAloud(text: string, opts: { onLevel?: (level: number) => void } = {}): Promise<"elevenlabs" | "browser" | null> {
  stopSpeaking();
  const clean = speakable(text).slice(0, 1200);
  if (!clean) return null;
  const limit = new Promise<void>((r) => setTimeout(r, Math.min(90_000, 4000 + clean.length * 90)));
  try {
    const res = await fetch("/api/voice", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: clean }) });
    if (res.status === 200) {
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      const stopMeter = opts.onLevel ? meterAudio(audio, opts.onLevel) : undefined;
      current = { audio, url, stopMeter };
      const ended = new Promise<void>((r) => {
        audio.onended = () => r();
        audio.onerror = () => r();
        audio.onpause = () => r();
      });
      await audio.play();
      await Promise.race([ended, limit]);
      stopMeter?.();
      return "elevenlabs";
    }
  } catch {
    // fall back to the browser voice below
  }
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = /[\u0E00-\u0E7F]/.test(clean) ? "th-TH" : "en-US";
  u.rate = 1.02;
  const ended = new Promise<void>((r) => {
    u.onend = () => r();
    u.onerror = () => r();
  });
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  await Promise.race([ended, limit]);
  return "browser";
}
