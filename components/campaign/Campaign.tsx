"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import SiteTabs from "@/components/SiteTabs";
import Assistant, { type AssistantAction } from "@/components/starmap/Assistant";
import type { SkyData } from "@/lib/explorer/astro";
import type { StarMapViewer } from "@/lib/starmap/viewer";
import { CHAPTERS, COMING_SOON, type CampaignStop, type Chapter } from "@/lib/campaign/chapters";
import { hush, speak } from "@/lib/ui/speech";

const STORE = "campaign.progress.v1";
type Progress = { chapter: string; stop: number; line: number };
const loadProgress = (): Progress | null => {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "null");
  } catch {
    return null;
  }
};
const saveProgress = (p: Progress | null) => {
  try {
    if (p) localStorage.setItem(STORE, JSON.stringify(p));
    else localStorage.removeItem(STORE);
  } catch {}
};


type Phase = "menu" | "playing" | "done";

/**
 * The campaign: a guided, game-style tour. The map is locked; the guide flies you from landmark to
 * landmark, and each time you've read through a stop's dialogue you move on to the next one.
 */
export default function Campaign() {
  const stageRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<StarMapViewer | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  const [phase, setPhase] = useState<Phase>("menu");
  const [chapter, setChapter] = useState<Chapter>(CHAPTERS[0]);
  const [stopIdx, setStopIdx] = useState(0);
  const [line, setLine] = useState(0);
  const [shown, setShown] = useState(0); // characters of the current line typed out so far
  const [traveling, setTraveling] = useState<string | null>(null);
  const [arrival, setArrival] = useState(0); // bumps to replay the arrival title card
  const [voice, setVoice] = useState(false);
  const [notesOpen, setNotesOpen] = useState(true);
  const [askOpen, setAskOpen] = useState(false);
  const [draft, setDraft] = useState<{ id: number; text: string; send?: boolean } | null>(null);
  const [saved, setSaved] = useState<Progress | null>(null);

  const stop: CampaignStop = chapter.stops[stopIdx];
  const text = stop.lines[line] ?? "";
  const typing = shown < text.length;
  const lastLine = line === stop.lines.length - 1;
  const lastStop = stopIdx === chapter.stops.length - 1;

  // ── The map: the same SPHEREx sky as the Sky Explorer, but locked ──
  useEffect(() => {
    let viewer: StarMapViewer | null = null;
    let cancelled = false;
    (async () => {
      try {
        const [{ StarMapViewer }, sky] = await Promise.all([
          import("@/lib/starmap/viewer"),
          fetch("/data/sky.json").then((r) => r.json() as Promise<SkyData>),
        ]);
        if (cancelled) return;
        const noop = () => {};
        viewer = new StarMapViewer(stageRef.current!, overlayRef.current!, sky, {
          onView: noop,
          onHover: noop,
          onTravel: noop,
          onOverview: noop,
          onEnter: noop,
          onNear: noop,
        });
        viewer.setSettings({ grid: false, waypoints: false, descriptions: false });
        viewer.setLocked(true);
        viewer.invalidate();
        viewerRef.current = viewer;
        setReady(true);
      } catch {
        setError(true);
      }
    })();
    setSaved(loadProgress());
    return () => {
      cancelled = true;
      hush();
      viewer?.dispose();
      viewerRef.current = null;
    };
  }, []);

  /** Fly the locked map to a stop and put the marker on its landmark. */
  const flyToStop = useCallback((s: CampaignStop) => {
    const v = viewerRef.current;
    if (!v) return;
    if (s.target === "sky") {
      v.clearTargetMarker();
      v.flyTo(0, 0, s.zoom, true);
      return;
    }
    if ("planet" in s.target) {
      // a planet is wherever it is today, and already wears its name on the map
      const xy = v.planetXY(s.target.planet);
      if (!xy) return;
      v.clearTargetMarker();
      v.flyTo(xy[0], xy[1], s.zoom, true);
      return;
    }
    const { ra, dec } = s.target;
    const [x, y] = v.project(ra, dec);
    v.flyTo(x, y, s.zoom, true);
    v.setTargetMarker(ra, dec, s.marker ?? s.title, s.marker ?? s.title);
  }, []);

  /** Travel to a stop: the hyperspace flight plays, then its dialogue begins. */
  const goTo = useCallback(
    (ch: Chapter, i: number, startLine = 0) => {
      hush();
      const s = ch.stops[i];
      setTraveling(s.marker ?? s.title);
      flyToStop(s);
      setTimeout(() => {
        setChapter(ch);
        setStopIdx(i);
        setLine(startLine);
        setShown(0);
        setTraveling(null);
        setArrival((a) => a + 1);
      }, 1500);
    },
    [flyToStop],
  );

  const begin = (ch: Chapter, from?: Progress | null) => {
    setPhase("playing");
    setAskOpen(false);
    goTo(ch, from?.stop ?? 0, from?.line ?? 0);
  };

  // Type the current line out, a few letters at a time
  useEffect(() => {
    if (phase !== "playing" || traveling) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(text.length);
      return;
    }
    const t = setInterval(() => setShown((n) => (n >= text.length ? (clearInterval(t), n) : n + 2)), 26);
    return () => clearInterval(t);
  }, [phase, traveling, text, arrival]);

  // Narration and saved progress follow the dialogue
  useEffect(() => {
    if (phase !== "playing" || traveling) return;
    if (voice) speak(text);
    saveProgress({ chapter: chapter.id, stop: stopIdx, line });
  }, [phase, traveling, text, voice, chapter.id, stopIdx, line]);

  const advance = useCallback(() => {
    if (phase !== "playing" || traveling) return;
    if (typing) return setShown(text.length); // first click finishes the line
    if (!lastLine) {
      setLine((l) => l + 1);
      setShown(0);
    } else if (!lastStop) goTo(chapter, stopIdx + 1);
    else {
      hush();
      saveProgress(null);
      setSaved(null);
      setPhase("done");
    }
  }, [phase, traveling, typing, text.length, lastLine, lastStop, goTo, chapter, stopIdx]);

  const back = useCallback(() => {
    if (phase !== "playing" || traveling) return;
    if (line > 0) {
      setLine((l) => l - 1);
      setShown(Infinity);
    } else if (stopIdx > 0) goTo(chapter, stopIdx - 1, chapter.stops[stopIdx - 1].lines.length - 1);
  }, [phase, traveling, line, stopIdx, goTo, chapter]);

  // Keyboard: Space / Enter / → continue, ← go back
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea, select, button, a")) return;
      if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight") {
        e.preventDefault();
        advance();
      } else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, back]);

  // Clicking the landmark's marker reads the current line aloud
  useEffect(() => {
    const host = overlayRef.current?.parentElement;
    if (!host) return;
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest(".mv-reticle")) {
        setVoice(true);
        speak(text);
      }
    };
    host.addEventListener("click", onClick);
    return () => host.removeEventListener("click", onClick);
  }, [text]);

  const toggleVoice = () => {
    setVoice((on) => {
      if (on) hush();
      else speak(text);
      return !on;
    });
  };

  const ask = (q?: string) => {
    setAskOpen(true);
    if (q) setDraft({ id: Date.now(), text: q, send: true });
  };

  const getContext = () => ({
    page: "Campaign: a guided tour (the map is locked and steered by the tour)",
    chapter: `Chapter ${chapter.number}: ${chapter.title}`,
    stop: stop.title,
    landmark: stop.marker ?? null,
    narration_so_far: stop.lines.slice(0, line + 1).join(" "),
    field_notes: Object.fromEntries(stop.facts),
  });
  const runAction = (a: AssistantAction) =>
    a.name.startsWith("suggest") ? null : "The tour steers the map here. Open the Sky Explorer tab to fly anywhere yourself.";

  return (
    <div className="mv cp">
      <div ref={stageRef} className="mv-stage">
        <div ref={overlayRef} className="mv-overlay" />
      </div>

      <div className="mv-top-left cp-top">
        <SiteTabs active="campaign" />
        {phase === "playing" && (
          <button className="mv-glass cp-chip" onClick={() => (hush(), setPhase("menu"), setSaved(loadProgress()))} title="Back to the chapter list">
            <b>Chapter {chapter.number}</b> {chapter.title}
          </button>
        )}
      </div>

      {/* Chapter select */}
      {phase === "menu" && (
        <div className="cp-menu">
          <div className="mv-glass cp-menu-card">
            <span className="cp-eyebrow">Campaign</span>
            <h1>A guided tour of the infrared sky</h1>
            <p className="cp-lede">
              Sit back: the map flies itself. Read (or listen) through each stop, ask the guide anything, and move on to the next landmark when you&apos;re ready.
            </p>
            <ol className="cp-chapters">
              {CHAPTERS.map((ch) => {
                const resume = saved?.chapter === ch.id && (saved.stop > 0 || saved.line > 0) ? saved : null;
                return (
                  <li key={ch.id} className="cp-chapter">
                    <span className="cp-num">{ch.number}</span>
                    <div>
                      <h2>{ch.title}</h2>
                      <p>{ch.blurb}</p>
                      <small>
                        {ch.stops.length} stops · about {Math.round(ch.stops.reduce((n, s) => n + s.lines.length, 0) * 0.2)} minutes
                      </small>
                    </div>
                    <div className="cp-chapter-actions">
                      {resume && (
                        <button className="mv-primary" disabled={!ready} onClick={() => begin(ch, resume)}>
                          Continue · stop {resume.stop + 1}
                        </button>
                      )}
                      <button className={resume ? "mv-secondary" : "mv-primary"} disabled={!ready} onClick={() => begin(ch)}>
                        {resume ? "Start over" : ready ? "Begin ▸" : "Loading map…"}
                      </button>
                    </div>
                  </li>
                );
              })}
              {COMING_SOON.map((c) => (
                <li key={c.number} className="cp-chapter locked" aria-disabled="true">
                  <span className="cp-num">{c.number}</span>
                  <div>
                    <h2>{c.title}</h2>
                    <p>{c.blurb}</p>
                  </div>
                  <span className="cp-soon">Coming soon</span>
                </li>
              ))}
            </ol>
            {error && <p className="cp-error">The map couldn&apos;t load. Check your connection and refresh.</p>}
          </div>
        </div>
      )}

      {/* Arrival title card */}
      {phase === "playing" && !traveling && (
        <div className="cp-arrive" key={arrival} aria-hidden="true">
          <span>{stop.kicker}</span>
          <strong>{stop.title}</strong>
        </div>
      )}

      {/* Field notes */}
      {phase === "playing" && !traveling && (
        <aside className={`mv-glass cp-notes ${notesOpen ? "" : "closed"}`} aria-label="Field notes">
          <button className="cp-notes-head" onClick={() => setNotesOpen((o) => !o)} aria-expanded={notesOpen}>
            <span>Field notes</span>
            <i aria-hidden="true">{notesOpen ? "–" : "+"}</i>
          </button>
          {notesOpen && (
            <dl>
              {stop.facts.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </aside>
      )}

      {/* The dialogue box */}
      {phase === "playing" && (
        <section className="mv-glass cp-dialog" aria-live="polite">
          <header>
            <span className="cp-speaker">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <circle cx="12" cy="12" r="4" fill="currentColor" />
                <path d="M3 12a9 9 0 0 1 18 0M6.5 12a5.5 5.5 0 0 1 11 0" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              Mission guide
            </span>
            <span className="cp-where">{traveling ? "In transit" : stop.kicker}</span>
            <ol className="cp-dots" aria-label={`Stop ${stopIdx + 1} of ${chapter.stops.length}`}>
              {chapter.stops.map((s, i) => (
                <li key={s.id} className={i < stopIdx ? "past" : i === stopIdx ? "now" : ""} />
              ))}
            </ol>
          </header>

          <button className="cp-text" onClick={advance} disabled={!!traveling} aria-label={typing ? "Show the whole line" : "Continue"}>
            {traveling ? (
              <span className="cp-travel">Traveling to {traveling}…</span>
            ) : (
              <>
                {text.slice(0, shown)}
                <span className="cp-ghost" aria-hidden="true">
                  {text.slice(shown)}
                </span>
              </>
            )}
          </button>

          {!traveling && (
            <div className="cp-asks" aria-label="Questions you could ask">
              <span>Curious?</span>
              {stop.ask.map((q) => (
                <button key={q} className="cp-q" onClick={() => ask(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}
          <footer>
            <div className="cp-tools">
              <button className="cp-tool" onClick={back} disabled={!!traveling || (stopIdx === 0 && line === 0)} aria-label="Previous line">
                ◂
              </button>
              <button className={`cp-tool ${voice ? "on" : ""}`} onClick={toggleVoice} aria-pressed={voice} title="Read aloud">
                <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                  <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
                  {voice && <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />}
                </svg>
                {voice ? "Listening" : "Listen"}
              </button>
              <button className="cp-tool" onClick={() => ask()}>
                ✦ Ask the guide
              </button>
            </div>
            <button className="cp-next" onClick={advance} disabled={!!traveling}>
              {typing ? "Skip ▸▸" : !lastLine ? "Continue ▾" : lastStop ? "Finish chapter ✓" : "Next stop ▸"}
            </button>
          </footer>
        </section>
      )}

      {/* Chapter complete */}
      {phase === "done" && (
        <div className="cp-menu">
          <div className="mv-glass cp-menu-card cp-done">
            <span className="cp-eyebrow">Chapter {chapter.number} complete</span>
            <h1>You&apos;ve met SPHEREx.</h1>
            <p className="cp-lede">
              You know what it sees, why it was built, and how its six-month passes could catch something moving out past Neptune. Now go look for yourself.
            </p>
            <div className="cp-chapter-actions">
              <Link className="mv-primary" href="/map">
                Open the Sky Explorer →
              </Link>
              <button className="mv-secondary" onClick={() => begin(chapter)}>
                Replay chapter
              </button>
              <button className="mv-secondary" onClick={() => setPhase("menu")}>
                All chapters
              </button>
            </div>
          </div>
        </div>
      )}

      <Assistant draft={draft} open={askOpen} onClose={() => setAskOpen(false)} getContext={getContext} runAction={runAction} />
    </div>
  );
}
