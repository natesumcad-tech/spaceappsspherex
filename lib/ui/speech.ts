/**
 * Narration for the Campaign and the Sky Explorer tour.
 *
 * Lines are spoken with a natural Gemini voice (via /api/tts, which only reads our own scripts and is
 * cached by the CDN). If that isn't available, it falls back to the best voice the browser has.
 */

let el: HTMLAudioElement | null = null;
let token = 0; // bumps on every speak/hush, so a slow download never talks over a newer line
let remote = true; // set false once the server says natural voices aren't available
let failures = 0;
const clips = new Map<string, Promise<string>>(); // text → object URL of its audio

const audio = () => (el ??= new Audio());

function clip(text: string) {
  let p = clips.get(text);
  if (!p) {
    p = fetch(`/api/tts?t=${encodeURIComponent(text)}`).then(async (r) => {
      if (r.status === 503) remote = false; // no key on this deployment
      if (!r.ok) {
        if (++failures >= 2 && r.status !== 404) remote = false; // keeps failing (quota?): use the browser voice
        throw new Error(`tts ${r.status}`);
      }
      failures = 0;
      return URL.createObjectURL(await r.blob());
    });
    p.catch(() => clips.delete(text));
    clips.set(text, p);
  }
  return p;
}

/** Fetch a line's audio ahead of time, so it starts straight away when it's needed. */
export function preload(text: string) {
  if (remote && typeof window !== "undefined") clip(text).catch(() => {});
}

/** Call from a click: lets audio downloaded later play without another tap (Safari). */
export function unlockAudio() {
  if (typeof window === "undefined") return;
  const a = audio();
  // a tiny silent WAV
  a.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
  a.play().catch(() => {});
}

export async function speak(text: string) {
  if (typeof window === "undefined") return;
  hush();
  const mine = token;
  if (remote) {
    try {
      const url = await clip(text);
      if (mine !== token) return;
      const a = audio();
      a.src = url;
      await a.play();
      return;
    } catch {
      if (mine !== token) return;
    }
  }
  browserSpeak(text);
}

export function hush() {
  token++;
  if (el) el.pause();
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}

// ── Fallback: the browser's own voices, best first ──
const PREFERRED = [
  /natural/i, // Edge: "Microsoft Aria Online (Natural)", "Jenny", "Guy"…
  /google us english|google uk english female/i, // Chrome
  /premium|enhanced/i, // Apple's downloaded high-quality voices
  /^(ava|zoe|samantha|allison|serena|karen|daniel)\b/i, // decent built-in Apple voices
];

function bestVoice() {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
  for (const re of PREFERRED) {
    const v = voices.find((x) => re.test(x.name) && x.lang.toLowerCase().startsWith("en-us")) ?? voices.find((x) => re.test(x.name));
    if (v) return v;
  }
  return voices.find((v) => v.lang.toLowerCase().startsWith("en-us")) ?? voices[0];
}

function browserSpeak(text: string) {
  const ss = window.speechSynthesis;
  if (!ss) return;
  const say = () => {
    const u = new SpeechSynthesisUtterance(text);
    const v = bestVoice();
    if (v) u.voice = v;
    u.rate = 0.95;
    ss.speak(u);
  };
  // Voices load asynchronously the first time
  if (ss.getVoices().length) say();
  else ss.addEventListener("voiceschanged", say, { once: true });
}
