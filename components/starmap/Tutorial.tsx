"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { STEPS, type Step } from "@/lib/ui/tourSteps";

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

/** The visible diamond or planet nearest the middle of the screen (not hidden under a panel). */
function findLandmark(): HTMLElement | null {
  const w = window.innerWidth, h = window.innerHeight;
  let best: HTMLElement | null = null, bestD = Infinity;
  document.querySelectorAll<HTMLElement>(".mv-overlay .mv-wp, .mv-overlay .mv-planet").forEach((el) => {
    if (el.style.display === "none") return;
    const r = el.getBoundingClientRect();
    if (!r.width || r.left < 40 || r.right > w - 40 || r.top < 180 || r.bottom > h - 160) return;
    const d = Math.hypot(r.left - w / 2, r.top - h / 2);
    if (d < bestD) (best = el), (bestD = d);
  });
  return best;
}

function findOne(sel: string): HTMLElement | null {
  const el = sel === "visible-landmark" ? findLandmark() : document.querySelector<HTMLElement>(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight ? el : null;
}
/** Focus a button without letting the browser scroll anything to reveal it. */
const focusQuietly = (el: HTMLButtonElement | null) => el?.focus({ preventScroll: true });
const selectors = (s: Step) => (s.target ? (Array.isArray(s.target) ? s.target : [s.target]) : []);

/** One box around all of a step's controls. */
function targetRect(els: HTMLElement[]) {
  if (!els.length) return null;
  const rs = els.map((e) => e.getBoundingClientRect());
  const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top));
  return { left: l, top: t, width: Math.max(...rs.map((r) => r.right)) - l, height: Math.max(...rs.map((r) => r.bottom)) - t };
}
type Box = NonNullable<ReturnType<typeof targetRect>>;

/**
 * First-visit walkthrough of the Sky Explorer: a small card at the top of the screen while a soft
 * spotlight picks out each control. Steps that ask you to try something move on by themselves.
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
  const [rect, setRect] = useState<Box | null>(null);
  const [did, setDid] = useState(false);
  const [cardH, setCardH] = useState(0);
  const [modeFrom, setModeFrom] = useState<"2d" | "3d">("2d"); // the view the 2D/3D step started in
  const [modeChanges, setModeChanges] = useState(0);
  const lastMode = useRef(mode);
  const card = useRef<HTMLDivElement>(null);

  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const count = STEPS.length - 2; // the welcome and closing cards aren't numbered

  const finish = useCallback(() => {
    markTourDone();
    setI(0);
    onClose();
  }, [onClose]);

  // Skip steps whose control isn't on screen (small screens hide some panels)
  const go = useCallback(
    (to: number) => {
      let n = to;
      while (n > 0 && n < STEPS.length - 1 && STEPS[n].target && STEPS[n].target !== "visible-landmark" && !selectors(STEPS[n]).some(findOne)) n += to >= i ? 1 : -1;
      setDid(false);
      setModeChanges(0);
      setI(Math.max(0, Math.min(STEPS.length - 1, n)));
    },
    [i],
  );

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

  // Keep the spotlight on its control(s) as panels move and the map animates
  useEffect(() => {
    if (!open || hidden) return;
    let raf = 0, els: HTMLElement[] = [], lastFind = 0;
    const tick = (t: number) => {
      if (t - lastFind > 250 || els.some((e) => !e.isConnected || e.style.display === "none")) {
        lastFind = t;
        els = selectors(step).map(findOne).filter((e): e is HTMLElement => !!e);
      }
      const r = targetRect(els);
      setRect((p) => (!r || !p ? r : Math.abs(r.left - p.left) + Math.abs(r.top - p.top) + Math.abs(r.width - p.width) + Math.abs(r.height - p.height) < 1 ? p : r));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, hidden, step]);

  useEffect(() => {
    if (card.current) setCardH(card.current.offsetHeight);
  }, [i, did, open, hidden, modeChanges]);

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

  // Done it: a beat to see the tick, then on to the next step
  useEffect(() => {
    if (!did || !open || hidden) return; // back on the map first (after a 360° view)
    const t = setTimeout(() => go(i + 1), 900);
    return () => clearTimeout(t);
  }, [did, open, hidden, go, i]);

  // Keyboard: Enter / → next (when there's nothing to try), ← back; Esc only skips from the first card
  useEffect(() => {
    if (!open || hidden) return; // Esc inside a 360° view leaves the view, not the tour
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea, select, button, a")) return;
      if (e.key === "Escape" && i === 0) finish();
      else if ((e.key === "Enter" || e.key === "ArrowRight") && !step.wait) last ? finish() : go(i + 1);
      else if (e.key === "ArrowLeft" && i > 1) go(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hidden, finish, go, i, last, step.wait]);

  if (!open) return null;
  if (hidden)
    return step.wait?.kind === "sphere" && inSphere ? (
      <div className="tour-banner" role="status">
        <span className="tour-check" aria-hidden="true">✓</span>
        You&apos;re in a 360° view. Look around, then scroll out or press Esc to finish the tour.
      </div>
    ) : null;

  const pad = 6;
  const W = typeof window !== "undefined" ? window.innerWidth : 1280;
  const cw = Math.min(430, W - 24);
  // The card lives at the top centre. If the spotlight is up there too, it slides beside it,
  // and only drops below it when there's no room to the side.
  let left = (W - cw) / 2, top = 14;
  const overlaps = (l: number) => !!rect && rect.top < 14 + cardH + 10 && rect.left - pad < l + cw && rect.left + rect.width + pad > l;
  if (rect && overlaps(left)) {
    const right = rect.left + rect.width + pad + 12, leftSide = rect.left - pad - 12 - cw;
    if (right + cw <= W - 12) left = right;
    else if (leftSide >= 12) left = leftSide;
    else top = rect.top + rect.height + pad + 12;
  }
  const progress = i === 0 ? 0 : last ? 1 : (i - (did ? 0 : 1)) / count;
  const other = modeFrom === "2d" ? "3D" : "2D", back = modeFrom === "2d" ? "2D" : "3D";

  return (
    <div className={`tour ${step.wait ? "trying" : ""}`}>
      {rect ? (
        <div className="tour-spot" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} aria-hidden="true" />
      ) : (
        !step.wait && <div className="tour-dim" aria-hidden="true" />
      )}

      <div ref={card} className="tour-card" style={{ top, left, width: cw }} role="dialog" aria-labelledby="tour-title" aria-describedby="tour-body">
        <div className="tour-bar" aria-hidden="true">
          <span style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="tour-inner" key={i}>
          <div className="tour-meta">
            <span>{i === 0 ? "Quick tour" : last ? "Done" : `Step ${i} of ${count}`}</span>
            {i === 0 && (
              <button className="tour-link" onClick={finish}>
                Skip tutorial
              </button>
            )}
          </div>
          <h2 id="tour-title">{step.title}</h2>
          <p id="tour-body">{step.body}</p>

          <div className="tour-foot">
            {step.wait?.kind === "modes" ? (
              <div className="tour-task">
                <span className={`tour-chip ${modeChanges >= 1 ? "ok" : ""}`}>{modeChanges >= 1 ? "✓" : "1"} Switch to {other}</span>
                <span className={`tour-chip ${modeChanges >= 2 ? "ok" : ""}`}>{modeChanges >= 2 ? "✓" : "2"} Back to {back}</span>
              </div>
            ) : step.wait ? (
              <div className="tour-task">
                <span className={`tour-chip ${did ? "ok" : "live"}`}>{did ? "✓ Nice!" : step.wait.prompt}</span>
              </div>
            ) : (
              <span />
            )}
            <div className="tour-actions">
              {i > 1 && (
                <button className="tour-ghost" onClick={() => go(i - 1)} aria-label="Previous step">
                  Back
                </button>
              )}
              {last ? (
                <>
                  <Link className="tour-ghost" href="/campaign" onClick={markTourDone}>
                    Try the Campaign
                  </Link>
                  <button className="tour-go" onClick={finish} ref={focusQuietly}>
                    Start exploring
                  </button>
                </>
              ) : (
                !step.wait && (
                  <button className="tour-go" onClick={() => go(i + 1)} ref={focusQuietly}>
                    {i === 0 ? "Start tour" : "Next"}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
