import { CHAPTERS } from "@/lib/campaign/chapters";
import { STEPS, stepSpeech } from "@/lib/ui/tourSteps";

/**
 * Natural narration for the Campaign and the Sky Explorer tour, using Gemini text-to-speech.
 * GET /api/tts?t=<line> → audio/wav. Only our own script lines are read (so this can't be used as a
 * free voice service), and answers are cached by the CDN, so each line is generated about once.
 *
 * Uses the same GEMINI_API_KEY as the sky guide. Optional: GEMINI_TTS_MODEL, GEMINI_TTS_VOICE.
 */

const BASE = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com";
const MODELS = [process.env.GEMINI_TTS_MODEL, "gemini-2.5-flash-preview-tts", "gemini-2.5-flash-tts"].filter(Boolean) as string[];
const VOICE = process.env.GEMINI_TTS_VOICE || "Sulafat"; // a warm voice that suits a guide
const STYLE = "Read this aloud like a warm, friendly planetarium guide, at a relaxed pace:";

let allowed: Set<string> | null = null;
const scriptLines = () =>
  (allowed ??= new Set([...CHAPTERS.flatMap((c) => c.stops.flatMap((s) => s.lines)), ...STEPS.map(stepSpeech)]));

/** Wrap raw 16-bit PCM in a WAV header so every browser can play it. */
function wav(pcm: Buffer, rate: number, channels = 1) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * channels * 2, 28);
  h.writeUInt16LE(channels * 2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export async function GET(req: Request) {
  const text = new URL(req.url).searchParams.get("t") ?? "";
  if (!scriptLines().has(text)) return Response.json({ error: "unknown_line" }, { status: 404 });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: "not_configured" }, { status: 503 });

  for (const model of MODELS) {
    try {
      const res = await fetch(`${BASE}/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${STYLE}\n\n${text}` }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
          },
        }),
        signal: AbortSignal.timeout(25_000),
      });
      if (res.status === 404) continue; // that model name isn't offered: try the next
      if (!res.ok) return Response.json({ error: "tts_failed", status: res.status }, { status: 502 });
      const data = await res.json();
      const part = data?.candidates?.[0]?.content?.parts?.find((p: { inlineData?: { data?: string } }) => p.inlineData?.data)?.inlineData;
      if (!part?.data) return Response.json({ error: "no_audio" }, { status: 502 });
      const mime: string = part.mimeType ?? "";
      const body = mime.includes("wav") ? Buffer.from(part.data, "base64") : wav(Buffer.from(part.data, "base64"), Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000));
      return new Response(new Uint8Array(body), {
        headers: {
          "Content-Type": "audio/wav",
          // the same line always sounds the same: let the CDN and browser keep it
          "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
        },
      });
    } catch {
      return Response.json({ error: "tts_failed" }, { status: 502 });
    }
  }
  return Response.json({ error: "no_tts_model" }, { status: 502 });
}
