import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { message, selectedObject } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not set" },
        { status: 500 }
      );
    }

    const systemPrompt = `You are an astrophysics assistant for a 3D Space Explorer.
Currently selected object: ${selectedObject ? JSON.stringify(selectedObject) : "None"}.
Answer concisely and only cite coordinates or measurements from the selected object if provided.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: message }] }],
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error?.message ?? "API error" },
        { status: res.status }
      );
    }

    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ??
      "Sorry, I couldn't generate a response.";

    return NextResponse.json({ reply });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to reach Gemini API" },
      { status: 500 }
    );
  }
}
