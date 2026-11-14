import { NextResponse } from "next/server";
import { PRESET_WAYPOINTS, EPOCHS } from "@/lib/starmap/data";
import { LANDMARKS, EXTRA_LANDMARKS } from "@/lib/explorer/landmarks";

// Sky Explorer assistant: answers questions and drives the map through function calls
// (fly somewhere, open a 360° view, change the date or imagery). Uses Google's Gemini API.
// Set GEMINI_API_KEY in the environment (Vercel → Settings → Environment Variables). GEMINI_MODEL is optional.

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
/** Optional: route requests through a proxy or a local test server. */
const BASE = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com";
const MAX_TURNS = 14;
const MAX_CHARS = 1500;

type Msg = { role: "user" | "model"; text: string };

const PLACES = [
  ...PRESET_WAYPOINTS.map((w) => `${w.id}: ${w.title} (${w.kind})`),
  ...LANDMARKS.map((l) => `${l.id}: ${l.title} (360° tour stop)`),
  ...EXTRA_LANDMARKS.map((l) => `${l.id}: ${l.title}`),
];
const PLACE_IDS = [...PRESET_WAYPOINTS.map((w) => w.id), ...LANDMARKS.map((l) => l.id), ...EXTRA_LANDMARKS.map((l) => l.id)];

const SYSTEM = `You are the guide inside "Sky Explorer", a web app built for the NASA Space Apps Challenge (Planet X & SPHEREx).
The app shows a 2D/3D map of the whole sky made from NASA SPHEREx Data Release 1 imagery (102 infrared bands, 0.75–5 µm,
observed 24 Apr 2025 – 14 May 2026, served by NASA/IPAC's IRSA). Users can open 360° views of places, orbit planets and
stars, fly around constellations built from real star distances, scroll a timeline from 12,000 BCE to 14,000 CE, and drop waypoints.

How to help:
- Help people find things and understand them. Be warm, accurate and brief: under 110 words, plain text, no markdown.
- When someone wants to see or go somewhere, call the matching function AND reply with a short sentence about it.
  Use show_place for anything in the place list, show_constellation / show_star for those, and show_sky_position
  with J2000 RA/Dec in degrees for any other object you are confident about. Set open_360 true only if they ask to step inside / see it in 360°.
- If a request is ambiguous, ask one short clarifying question instead of guessing.
- Always call suggest_followups with 2–3 short follow-up questions the user might ask next (under 8 words each).
- Say so if you are not sure of a fact. Never invent SPHEREx results or data that the app does not show.

Places you can show (id: name):
${PLACES.join("\n")}

Timeline dates: ${EPOCHS.map((e) => e.label).join(", ")}.`;

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "show_place",
        description: "Fly the map to a place from the place list; optionally open its 360° view.",
        parameters: {
          type: "OBJECT",
          properties: { id: { type: "STRING", enum: PLACE_IDS }, open_360: { type: "BOOLEAN" } },
          required: ["id"],
        },
      },
      {
        name: "show_constellation",
        description: "Fly to one of the 88 IAU constellations by its English/Latin name; optionally open its 360° view (3D from real star distances).",
        parameters: { type: "OBJECT", properties: { name: { type: "STRING" }, open_360: { type: "BOOLEAN" } }, required: ["name"] },
      },
      {
        name: "show_star",
        description: "Fly to a bright named star (e.g. Vega, Arcturus, Antares); optionally open its 360° view.",
        parameters: { type: "OBJECT", properties: { name: { type: "STRING" }, open_360: { type: "BOOLEAN" } }, required: ["name"] },
      },
      {
        name: "show_sky_position",
        description: "Fly to any sky position given in J2000 right ascension and declination (degrees).",
        parameters: {
          type: "OBJECT",
          properties: { ra_deg: { type: "NUMBER" }, dec_deg: { type: "NUMBER" }, label: { type: "STRING" } },
          required: ["ra_deg", "dec_deg", "label"],
        },
      },
      {
        name: "set_timeline",
        description: "Move the timeline to show how the sky and planets looked at another date.",
        parameters: { type: "OBJECT", properties: { epoch: { type: "STRING", enum: EPOCHS.map((e) => e.label) } }, required: ["epoch"] },
      },
      {
        name: "set_imagery",
        description: "Change the map imagery: SPHEREx color, a single SPHEREx wavelength (0.75–5 µm), or 2MASS.",
        parameters: {
          type: "OBJECT",
          properties: { layer: { type: "STRING", enum: ["spherex-color", "spherex-wavelength", "2mass"] }, wavelength_um: { type: "NUMBER" } },
          required: ["layer"],
        },
      },
      {
        name: "set_view",
        description: "Switch the map between flat 2D and tilted 3D.",
        parameters: { type: "OBJECT", properties: { mode: { type: "STRING", enum: ["2d", "3d"] } }, required: ["mode"] },
      },
      {
        name: "suggest_followups",
        description: "Offer 2–3 short follow-up questions as tappable suggestions.",
        parameters: { type: "OBJECT", properties: { questions: { type: "ARRAY", items: { type: "STRING" } } }, required: ["questions"] },
      },
    ],
  },
];

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  let body: { messages?: Msg[]; context?: unknown; message?: string; selectedObject?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Accept the conversation, or a single message (the earlier format)
  const messages: Msg[] = (body.messages ?? (body.message ? [{ role: "user" as const, text: body.message }] : []))
    .filter((m) => (m.role === "user" || m.role === "model") && typeof m.text === "string" && m.text.trim())
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, text: m.text.slice(0, MAX_CHARS) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const context = JSON.stringify(body.context ?? body.selectedObject ?? {}).slice(0, 3000);

  try {
    const res = await fetch(`${BASE}/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: `${SYSTEM}\n\nWhat the user is looking at right now (JSON): ${context}` }] },
        contents: messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
        tools: TOOLS,
        generationConfig: { temperature: 0.4, maxOutputTokens: 700 },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Gemini error", res.status, data?.error?.message);
      return NextResponse.json({ error: "upstream", detail: data?.error?.message ?? `HTTP ${res.status}` }, { status: 502 });
    }
    const parts: { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }[] = data?.candidates?.[0]?.content?.parts ?? [];
    const reply = parts
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    const actions = parts.filter((p) => p.functionCall).map((p) => ({ name: p.functionCall!.name, args: p.functionCall!.args ?? {} }));
    return NextResponse.json({ reply, actions });
  } catch (e) {
    console.error("Gemini request failed", e);
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
