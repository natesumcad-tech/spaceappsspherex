"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { hush, preload, speak, unlockAudio } from "@/lib/ui/speech";
import { STEPS, stepSpeech } from "@/lib/ui/tourSteps";

/** Remembered in a cookie (and browser storage as a backup) so the tour only plays once. */
const COOKIE = "sx_tour_done_v2"; // bump the version to show the tour to everyone again
const STORE = "starmap.tour.v2";

export function tourDone() {
  if (typeof document === "undefined") return true;
  if (document.cookie.split("; ").some((c) => c.startsWith(`${COOKIE}=`))) return true;
  try {
    return localStorage.getItem(STORE) === "done";
  } catch {
    return false;
  }
}
/** Testing helper: forget that this browser has seen the tour. */
export function resetTour() {
  document.cookie = `${COOKIE}=; max-age=0; path=/; SameSite=Lax`;
  try {
    localStorage.removeItem(STORE);
  } catch {}
}
function markTourDone() {
  document.cookie = `${COOKIE}=1; max-age=${60 * 60 * 24 * 365}; path=/; SameSite=Lax`;
  try {
    localStorage.setItem(STORE, "done");
  } catch {}
}


/** The first visible diamond near the middle of the screen (not hidden under a panel). */
function findLandmark(): HTMLElement | null {
  const w = window.innerWidth, h = window.innerHeight;
  let best: HTMLElement | null = null, bestD = Infinity;
  document.querySelectorAll<HTMLElement>(".mv-overlay .mv-wp, .mv-overlay .mv-planet").forEach((el) => {
    if (el.style.display === "none") return;
    const r = el.getBoundingClientRect();
    if (!r.width || r.left < 40 || r.right > w - 40 || r.top < 160 || r.bottom > h - 200) return;
    const d = Math.hypot(r.left - w / 2, r.top - h / 2);
    if (d < bestD) (best = el), (bestD = d);
  });
  return best;
}

function findTarget(sel?: string): HTMLElement | null {
  if (!sel) return null;
  const el = sel === "visible-landmark" ? findLandmark() : document.querySelector<HTMLElement>(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight ? el : null;
}

/**
 * First-visit walkthrough of the Sky Explorer, in the same game-style dialogue box as the Campaign:
 * the guide spotlights each control in turn, and some steps wait for you to try the thing.
 */
export default function Tutorial({
  open,
  hidden,
  mode,
  inSphere,
  onClose,
}: {
  open: boolean;
  /** In a 360° view or the galaxy view: the tour waits (showing a hint inside 360°). */
  hidden: boolean;
  mode: "2d" | "3d";
  inSphere: boolean;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [did, setDid] = useState(false);
  const [shown, setShown] = useState(0); // characters typed out so far
  const [voice, setVoice] = useState(false);
  const [modeFrom, setModeFrom] = useState<"2d" | "3d">("2d"); // the view the 2D/3D step started in
  const [modeChanges, setModeChanges] = useState(0);
  const lastMode = useRef(mode);
  const targetRef = useRef<HTMLElement | null>(null);

  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const text = step.body;
  const typing = shown < text.length;
  const locked = !!step.wait && !did; // every "try it" step has to be done

  const finish = useCallback(() => {
    hush();
    markTourDone();
    setI(0);
    onClose();
  }, [onClose]);

  // Skip steps whose control isn't on screen (small screens hide some panels)
  const go = useCallback(
    (to: number) => {
      let n = to;
      while (n > 0 && n < STEPS.length - 1 && STEPS[n].target && STEPS[n].target !== "visible-landmark" && !findTarget(STEPS[n].target)) n += to >= i ? 1 : -1;
      setDid(false);
      setModeChanges(0);
      setShown(0);
      setI(Math.max(0, Math.min(STEPS.length - 1, n)));
    },
    [i],
  );

  /** Click / Enter: finish typing the line first, then move on (unless the step still needs doing). */
  const advance = useCallback(() => {
    if (typing) return setShown(text.length);
    if (last) return finish();
    if (!locked) go(i + 1);
  }, [typing, text.length, last, finish, locked, go, i]);

  // Type the line out
  useEffect(() => {
    if (!open || hidden) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setShown(text.length);
    const t = setInterval(() => setShown((n) => (n >= text.length ? (clearInterval(t), n) : n + 2)), 22);
    return () => clearInterval(t);
  }, [open, hidden, text]);

  // Read aloud (and fetch the next step's audio while this one plays)
  useEffect(() => {
    if (!open || hidden || !voice) return;
    speak(stepSpeech(step));
    if (STEPS[i + 1]) preload(stepSpeech(STEPS[i + 1]));
  }, [open, hidden, voice, step, i]);
  useEffect(() => () => hush(), []);

  // 2D/3D step: switch one way, then back
  useEffect(() => {
    setModeFrom(lastMode.current);
  }, [i]);
  useEffect(() => {
    if (mode === lastMode.current) return;
    lastMode.current = mode;
    if (!open || hidden || STEPS[i].wait?.kind !== "modes") return;
    setModeChanges((n) => {
      if (n + 1 >= 2) setDid(true);
      return n + 1;
    });
  }, [mode, open, hidden, i]);

  // 360° step: done the moment they step inside one
  useEffect(() => {
    if (open && inSphere && STEPS[i].wait?.kind === "sphere") setDid(true);
  }, [open, inSphere, i]);

  // Follow the spotlighted control as panels move and the map animates
  useEffect(() => {
    if (!open || hidden) return;
    let raf = 0;
    targetRef.current = findTarget(step.target);
    const tick = () => {
      if (step.target && (!targetRef.current || !targetRef.current.isConnected || targetRef.current.style.display === "none")) targetRef.current = findTarget(step.target);
      const r = targetRef.current?.getBoundingClientRect() ?? null;
      setRect((prev) => (r && prev && Math.abs(r.left - prev.left) < 0.5 && Math.abs(r.top - prev.top) < 0.5 && Math.abs(r.width - prev.width) < 0.5 && Math.abs(r.height - prev.height) < 0.5 ? prev : r));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [open, hidden, step.target, i]);

  // "Try it" steps: notice when the visitor does the thing
  useEffect(() => {
    if (!open || hidden || !step.wait || did || (step.wait.kind !== "move" && step.wait.kind !== "hover")) return;
    const stage = document.querySelector<HTMLElement>(".mv-stage");
    let moved = 0;
    const ok = () => setDid(true);
    const onDown = (e: PointerEvent) => {
      moved = e.buttons ? 1 : 0;
    };
    const onMove = (e: PointerEvent) => {
      if (e.buttons && ++moved > 6) ok();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key.length === 1 && "wasdqe".includes(e.key.toLowerCase())) ok();
    };
    const onOver = (e: Event) => {
      if ((e.target as HTMLElement).closest?.(".mv-wp, .mv-planet")) ok();
    };
    if (step.wait.kind === "move") {
      stage?.addEventListener("pointerdown", onDown);
      stage?.addEventListener("pointermove", onMove);
      stage?.addEventListener("wheel", ok);
      window.addEventListener("keydown", onKey);
    } else document.addEventListener("pointerover", onOver);
    return () => {
      stage?.removeEventListener("pointerdown", onDown);
      stage?.removeEventListener("pointermove", onMove);
      stage?.removeEventListener("wheel", ok);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerover", onOver);
    };
  }, [open, hidden, step.wait, did]);

  // Done it: give them a moment to see it worked, then move on
  useEffect(() => {
    if (!did || !open || hidden) return; // back on the map first (after a 360° view)
    const t = setTimeout(() => go(i + 1), 1300);
    return () => clearTimeout(t);
  }, [did, open, hidden, go, i]);

  // Keyboard: Enter / → continue, ← back, Esc skips the tour
  useEffect(() => {
    if (!open || hidden) return; // Esc inside a 360° view leaves the view, not the tour
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea, select, button, a")) return;
      if (e.key === "Escape") finish();
      else if (e.key === "Enter" || e.key === "ArrowRight") advance();
      else if (e.key === "ArrowLeft") go(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hidden, finish, advance, go, i]);

  if (!open) return null;
  if (hidden)
    return step.wait?.kind === "sphere" && inSphere ? (
      <div className="tut-banner" role="status">
        <b>Tour</b> You&apos;re inside a 360° view! Drag to look around, then scroll out or press Esc to return to the map.
      </div>
    ) : null;

  const pad = 8;
  const interactive = !!step.wait;
  // The box sits at the bottom, like the Campaign's, unless the spotlight is down there
  const w = typeof window !== "undefined" ? window.innerWidth : 1280, h = typeof window !== "undefined" ? window.innerHeight : 800;
  const half = Math.min(430, (w - 32) / 2);
  const atTop = !!rect && rect.bottom > h - 240 && rect.left < w / 2 + half && rect.right > w / 2 - half;
  const other = modeFrom === "2d" ? "3D" : "2D", back = modeFrom === "2d" ? "2D" : "3D";
  const count = STEPS.length - 2;

  return (
    <div className={`tut ${interactive ? "interactive" : ""}`}>
      {rect ? (
        <div className="tut-spot" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} aria-hidden="true" />
      ) : (
        !interactive && <div className="tut-dim" aria-hidden="true" />
      )}

      <section className={`mv-glass cp-dialog tut-dialog ${atTop ? "at-top" : ""}`} role="dialog" aria-label="Sky Explorer tour" aria-live="polite">
        <header>
          <span className="cp-speaker">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <circle cx="12" cy="12" r="4" fill="currentColor" />
              <path d="M3 12a9 9 0 0 1 18 0M6.5 12a5.5 5.5 0 0 1 11 0" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            Sky guide
          </span>
          <span className="cp-where">
            {i === 0 ? "Quick tour" : last ? "Tour complete" : `Tour · ${i} of ${count}`} · {step.title}
          </span>
          <ol className="cp-dots" aria-hidden="true">
            {STEPS.slice(1, -1).map((_, k) => (
              <li key={k} className={k + 1 < i || last ? "past" : k + 1 === i ? "now" : ""} />
            ))}
          </ol>
          {!last && (
            <button className="tut-skip" onClick={finish}>
              Skip tour
            </button>
          )}
        </header>

        <button className="cp-text" onClick={advance} aria-label={typing ? "Show the whole line" : "Continue"}>
          {text.slice(0, shown)}
          <span className="cp-ghost" aria-hidden="true">
            {text.slice(shown)}
          </span>
        </button>

        {step.wait?.kind === "modes" ? (
          <ul className={`tut-checks ${did ? "done" : ""}`}>
            <li className={modeChanges >= 1 ? "ok" : ""}>Switch to {other}</li>
            <li className={modeChanges >= 2 ? "ok" : ""}>Switch back to {back}</li>
          </ul>
        ) : (
          step.wait && <p className={`tut-try ${did ? "done" : ""}`}>{did ? "Nice! That's it." : step.wait.prompt}</p>
        )}

        <footer>
          <div className="cp-tools">
            <button className="cp-tool" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous step">
              ◂
            </button>
            <button
              className={`cp-tool ${voice ? "on" : ""}`}
              onClick={() => {
                if (voice) hush();
                else unlockAudio(); // let audio play later, after it downloads (Safari wants a tap first)
                setVoice(!voice);
              }}
              aria-pressed={voice}
              title="Read aloud"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
                {voice && <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />}
              </svg>
              {voice ? "Listening" : "Listen"}
            </button>
            {last && (
              <Link className="cp-tool" href="/campaign" onClick={markTourDone}>
                Open the Campaign ▸
              </Link>
            )}
          </div>
          <button className="cp-next" onClick={advance} disabled={!typing && locked}>
            {typing ? "Skip ▸▸" : i === 0 ? "Show me around ▸" : last ? "Start exploring ✓" : locked ? "Try it to continue" : "Next ▸"}
          </button>
        </footer>
      </section>
    </div>
  );
}
