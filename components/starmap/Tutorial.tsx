"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** Remembered in a cookie (and browser storage as a backup) so the tour only plays once. */
const COOKIE = "sx_tour_done";
const STORE = "starmap.tour.v1";

export function tourDone() {
  if (typeof document === "undefined") return true;
  if (document.cookie.split("; ").some((c) => c.startsWith(`${COOKIE}=`))) return true;
  try {
    return localStorage.getItem(STORE) === "done";
  } catch {
    return false;
  }
}
function markTourDone() {
  document.cookie = `${COOKIE}=1; max-age=${60 * 60 * 24 * 365}; path=/; SameSite=Lax`;
  try {
    localStorage.setItem(STORE, "done");
  } catch {}
}

type Wait = "move" | "hover";
type Step = {
  /** CSS selector of the control to spotlight (none: a card in the middle of the screen). */
  target?: string;
  title: string;
  body: string;
  /** Something to try: the step notices when you do it. */
  wait?: { kind: Wait; prompt: string };
  place?: "center" | "top";
};

const STEPS: Step[] = [
  {
    title: "Welcome to the Sky Explorer",
    body: "This is the whole sky, built from NASA's SPHEREx telescope and streamed live from the IRSA archive. Here's a one-minute tour of what you can do.",
  },
  {
    title: "Move around",
    body: "Drag the map (or use W A S D) to pan, and scroll to zoom. Right-drag tilts the view.",
    wait: { kind: "move", prompt: "Try it: drag or scroll the map" },
    place: "top",
  },
  {
    target: "visible-landmark",
    title: "Landmarks",
    body: "Diamonds mark landmarks, and planets wear their names. Hover one for a summary; click it to fly there, then choose View in 360° to step inside.",
    wait: { kind: "hover", prompt: "Try it: hover over a diamond" },
  },
  {
    target: ".mv-search-btn",
    title: "Search",
    body: "Find any star, constellation, planet or landmark and fly straight to it. Shortcut: Ctrl + K.",
  },
  {
    target: ".mv-ask",
    title: "Ask the sky guide",
    body: "Ask questions in plain words, like “Where does SPHEREx look for ice?”, and the guide answers and can fly the map for you.",
  },
  {
    target: ".mv-top-row .mv-seg",
    title: "2D and 3D",
    body: "Switch between a flat star chart and a tilted 3D view.",
  },
  {
    target: ".mv-coord-form",
    title: "Exact coordinates",
    body: "Type a J2000 RA/Dec to jump to a precise spot, pick a benchmark target, or share a link to what you're looking at.",
  },
  {
    target: ".mv-blink-bar",
    title: "Blink: the Planet X tool",
    body: "SPHEREx photographs each patch of sky about six months apart. Flip between the passes, or compare them with B − A: stars stay put, but anything in our solar system shifts.",
  },
  {
    target: ".mv-minicard",
    title: "Overview and colors",
    body: "The minimap shows where you are (click it to jump). Below it, choose SPHEREx color, isolate a single infrared wavelength, or switch to 2MASS.",
  },
  {
    target: ".mv-timeline",
    title: "Timeline",
    body: "Slide through time and watch the stars drift over thousands of years.",
  },
  {
    target: ".mv-zoom",
    title: "Zoom and the galaxy",
    body: "＋ and − zoom, ⌂ takes you home, and ⊙ pulls all the way out to the Milky Way. The ? button replays this tour.",
  },
  {
    target: ".mv-actions",
    title: "Make it yours",
    body: "Drop your own waypoints with Shift + G, and choose what's shown (grid, names, lines) with the settings wrench.",
  },
  {
    title: "You're ready",
    body: "Explore freely, or try the Campaign tab for a guided story of SPHEREx and the hunt for Planet X.",
  },
];

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
 * First-visit walkthrough of the Sky Explorer: spotlights each control in turn, with a card that
 * explains it. Some steps ask you to try something and notice when you do.
 */
export default function Tutorial({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [did, setDid] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const [cardPos, setCardPos] = useState<{ left: number; top: number } | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);

  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const finish = useCallback(() => {
    markTourDone();
    setI(0);
    onClose();
  }, [onClose]);

  // Skip steps whose control isn't on screen (small screens hide some panels)
  const go = useCallback((to: number) => {
    let n = to;
    while (n > 0 && n < STEPS.length - 1 && STEPS[n].target && STEPS[n].target !== "visible-landmark" && !findTarget(STEPS[n].target)) n += to >= i ? 1 : -1;
    setDid(false);
    setI(Math.max(0, Math.min(STEPS.length - 1, n)));
  }, [i]);

  useEffect(() => {
    if (open) {
      setI(0);
      setDid(false);
    }
  }, [open]);

  // Follow the spotlighted control as panels move and the map animates
  useEffect(() => {
    if (!open) return;
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
  }, [open, step.target, i]);

  // Place the card beside the spotlight, inside the screen
  useLayoutEffect(() => {
    const c = card.current;
    if (!open || !c) return;
    const w = window.innerWidth, h = window.innerHeight, cw = c.offsetWidth, ch = c.offsetHeight, m = 14;
    if (!rect) {
      setCardPos({ left: (w - cw) / 2, top: step.place === "top" ? Math.min(150, h * 0.2) : (h - ch) / 2 });
      return;
    }
    const clampX = (x: number) => Math.max(m, Math.min(w - cw - m, x));
    const clampY = (y: number) => Math.max(m, Math.min(h - ch - m, y));
    const pad = 12;
    let pos: { left: number; top: number };
    if (rect.bottom + pad + ch < h - m) pos = { left: clampX(rect.left + rect.width / 2 - cw / 2), top: rect.bottom + pad };
    else if (rect.top - pad - ch > m) pos = { left: clampX(rect.left + rect.width / 2 - cw / 2), top: rect.top - pad - ch };
    else if (rect.right + pad + cw < w - m) pos = { left: rect.right + pad, top: clampY(rect.top + rect.height / 2 - ch / 2) };
    else pos = { left: clampX(rect.left - pad - cw), top: clampY(rect.top + rect.height / 2 - ch / 2) };
    setCardPos((p) => (p && Math.abs(p.left - pos.left) < 0.5 && Math.abs(p.top - pos.top) < 0.5 ? p : pos));
  }, [open, rect, i, step.place]);

  // "Try it" steps: notice when the visitor does the thing
  useEffect(() => {
    if (!open || !step.wait || did) return;
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
  }, [open, step.wait, did]);

  // Done it: give them a moment to see it worked, then move on
  useEffect(() => {
    if (!did || !open) return;
    const t = setTimeout(() => go(i + 1), 1300);
    return () => clearTimeout(t);
  }, [did, open, go, i]);

  // Esc skips the tour, arrows step through it
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea, select")) return;
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight" && !step.wait) go(i + 1);
      else if (e.key === "ArrowLeft") go(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish, go, i, step.wait]);

  if (!open) return null;
  const pad = 8;
  const interactive = !!step.wait;

  return (
    <div className={`tut ${interactive ? "interactive" : ""}`} role="dialog" aria-modal={!interactive} aria-labelledby="tut-title">
      {rect ? (
        <div
          className="tut-spot"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
          aria-hidden="true"
        />
      ) : (
        !interactive && <div className="tut-dim" aria-hidden="true" />
      )}
      <div
        ref={card}
        className={`tut-card ${step.target ? "" : "solo"}`}
        style={cardPos ? { left: cardPos.left, top: cardPos.top } : { visibility: "hidden" }}
        key={i}
      >
        <div className="tut-head">
          <span className="tut-count">
            {i === 0 ? "Quick tour" : last ? "All set" : `${i} of ${STEPS.length - 2}`}
          </span>
          {!last && (
            <button className="tut-skip" onClick={finish}>
              Skip tour
            </button>
          )}
        </div>
        <h2 id="tut-title">{step.title}</h2>
        <p>{step.body}</p>
        {step.wait && <p className={`tut-try ${did ? "done" : ""}`}>{did ? "Nice! That's it." : step.wait.prompt}</p>}
        <div className="tut-actions">
          {i > 0 && !last && (
            <button className="mv-secondary" onClick={() => go(i - 1)}>
              Back
            </button>
          )}
          {last ? (
            <>
              <Link className="mv-secondary" href="/campaign" onClick={markTourDone}>
                Open the Campaign
              </Link>
              <button className="mv-primary" onClick={finish} autoFocus>
                Start exploring
              </button>
            </>
          ) : (
            <button className="mv-primary" onClick={() => go(i + 1)} autoFocus>
              {i === 0 ? "Show me around" : step.wait && !did ? "Skip this step" : "Next"}
            </button>
          )}
        </div>
        <ol className="tut-dots" aria-hidden="true">
          {STEPS.slice(1, -1).map((_, k) => (
            <li key={k} className={k + 1 < i ? "past" : k + 1 === i ? "now" : ""} />
          ))}
        </ol>
      </div>
    </div>
  );
}
