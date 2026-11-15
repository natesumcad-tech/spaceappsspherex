"use client";

import "./assistant.css";
import { useEffect, useRef, useState } from "react";

export type AssistantAction = { name: string; args: Record<string, unknown> };
type Source = { id: number; title: string; url: string };
type Msg = { role: "user" | "model"; text: string; notes?: string[]; sources?: Source[]; sourceUnavailable?: boolean };

const STARTERS = ["Take me to the Andromeda Galaxy", "Where does SPHEREx look for ice?", "Show me Orion in 3D", "What am I looking at?"];

/**
 * The Sky Explorer guide: a chat panel that answers questions, asks follow-ups, and drives the map
 * (the server turns requests into actions like "fly to M31" or "open Saturn in 360°").
 */
export default function Assistant({
  open,
  onClose,
  getContext,
  runAction,
  draft,
}: {
  draft?: { id: number; text: string } | null;
  open: boolean;
  onClose: () => void;
  getContext: () => unknown;
  runAction: (a: AssistantAction) => string | null;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>(STARTERS);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => field.current?.focus(), 50);
  }, [open]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (draft) { setInput(draft.text); field.current?.focus(); }
  }, [draft]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    const history: Msg[] = [...messages, { role: "user", text: q }];
    setMessages(history);
    setInput("");
    setSuggestions([]);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.map(({ role, text }) => ({ role, text })), context: getContext() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          data.error === "not_configured"
            ? "I'm not switched on yet: this site needs a Gemini API key. Add GEMINI_API_KEY in Vercel (Settings → Environment Variables) and redeploy."
            : data.error === "timeout"
              ? "The AI service is taking too long to respond. Please try again."
              : "I couldn't reach the AI service just now. Please try again in a moment.";
        setMessages((m) => [...m, { role: "model", text: msg }]);
        return;
      }
      const notes: string[] = [];
      let next: string[] = data.followups ?? [];
      for (const a of (data.actions ?? []) as AssistantAction[]) {
        if (a.name === "suggest_followups") next = ((a.args.questions as string[]) ?? []).filter((x) => typeof x === "string").slice(0, 3);
        else {
          const note = runAction(a);
          if (note) notes.push(note);
        }
      }
      setMessages((m) => [...m, { role: "model", text: data.reply || (notes.length ? "Here you go." : "Sorry, I don't have an answer for that."), notes, sources: data.sources, sourceUnavailable: data.sourceStatus === "unavailable" }]);
      setSuggestions(next);
    } catch {
      setMessages((m) => [...m, { role: "model", text: "I couldn't reach the AI service just now. Please try again in a moment." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside className={`mv-glass mv-ai ${open ? "open" : ""}`} aria-hidden={!open} aria-label="Sky guide">
      <div className="mv-ai-head">
        <span className="cl-label">✦ Sky guide</span>
        <span className="mv-ai-model">Gemini</span>
        {messages.length > 0 && (
          <button
            className="mv-ai-link"
            disabled={loading}
            onClick={() => {
              setMessages([]);
              setSuggestions(STARTERS);
            }}
          >
            New chat
          </button>
        )}
        <button className="cl-toggle" onClick={onClose} aria-label="Close the guide">
          ×
        </button>
      </div>

      <div ref={list} className="mv-ai-list" aria-live="polite">
        {messages.length === 0 && (
          <p className="mv-ai-intro">
            Ask me to find anything in the sky, explain what you&apos;re looking at, or take you somewhere. I can fly the map, change the date
            and open 360° views. Ask follow-up questions here; mission answers can cite NASA, JPL and the SPHEREx archive.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`mv-ai-msg ${m.role}`}>
            <p>{m.text}</p>
            {m.sources && m.sources.length > 0 && <div className="mv-ai-sources" aria-label="NASA sources">{m.sources.map(source => <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer">[{source.id}] {source.title} ↗</a>)}</div>}
            {m.sourceUnavailable && <p className="mv-ai-fine">Live NASA resources are temporarily unavailable. This answer has not been checked against them.</p>}
            {m.notes?.map((n) => (
              <span key={n} className="mv-ai-note">
                {n}
              </span>
            ))}
          </div>
        ))}
        {loading && (
          <div className="mv-ai-msg model">
            <p className="mv-ai-dots">
              <i />
              <i />
              <i />
            </p>
          </div>
        )}
      </div>

      {suggestions.length > 0 && !loading && (
        <div className="mv-ai-chips">
          {suggestions.map((s) => (
            <button key={s} onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="mv-ai-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          ref={field}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
            if (e.key === "Escape") {
              e.stopPropagation();
              onClose();
            }
          }}
          rows={1}
          maxLength={600}
          placeholder={messages.length ? "Ask a follow-up question…" : "Ask about anything in the sky…"}
          aria-label="Ask the sky guide"
        />
        <button type="submit" className="mv-primary" disabled={!input.trim() || loading}>
          Ask
        </button>
      </form>
      <p className="mv-ai-fine">AI answers can be wrong. Check important facts with NASA sources.</p>
    </aside>
  );
}
