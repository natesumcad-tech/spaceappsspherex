"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { STEPS, type Step } from "@/lib/ui/tourSteps";
import { topSlot } from "@/lib/ui/placement";

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

/** A planet (or else a constellation) label near the middle of the screen, not hidden under a panel: things with a 3D view. */
function find3D(): HTMLElement | null {
  const w = window.innerWidth, h = window.innerHeight;
  for (const sel of [".mv-overlay .mv-planet.link", ".mv-overlay .mv-con.link"]) {
    let best: HTMLElement | null = null, bestD = Infinity;
    document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      if (el.style.display === "none") return;
      const r = el.getBoundingClientRect();
      if (!r.width || r.left < 40 || r.right > w - 40 || r.top < 180 || r.bottom > h - 160) return;
      const d = Math.hypot(r.left - w / 2, r.top - h / 2);
      if (d < bestD) (best = el), (bestD = d);
    });
    if (best) return best;
  }
  return null;
}

/** 360° views you can fly around in 3D (a landmark's "sky" view is a flat image). */
const IS_3D = ["constellation", "planet", "star", "galaxy", "orbit"];

function findOne(sel: string): HTMLElement | null {
  const el = sel === "visible-3d" ? find3D() : document.querySelector<HTMLElement>(sel);
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
  // A planet's element is just an anchor point: its dot and name are what you see
  const parts = els.flatMap((e) => (e.matches(".mv-planet") ? [...e.querySelectorAll<HTMLElement>(":scope > i, :scope > span")] : [e]));
  const rs = (parts.length ? parts : els).map((e) => e.getBoundingClientRect()).filter((r) => r.width || r.height);
  if (!rs.length) return null;
  const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top));
  return { left: l, top: t, width: Math.max(...rs.map((r) => r.right)) - l, height: Math.max(...rs.map((r) => r.bottom)) - t };
}
type Box = NonNullable<ReturnType<typeof targetRect>>;

/** A gently curved arrow from the edge of the card to the edge of the highlighted control (null if they touch). */
function arrowPath(card: { l: number; t: number; r: number; b: number }, target: Box, gap: number) {
  const T = { l: target.left - gap, t: target.top - gap, r: target.left + target.width + gap, b: target.top + target.height + gap };
  const tx = (T.l + T.r) / 2, ty = (T.t + T.b) / 2;
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  let x1: number, y1: number, x2: number, y2: number;
  if (T.t >= card.b + 8) [x1, y1, x2, y2] = [clamp(tx, card.l + 28, card.r - 28), card.b, clamp(tx, T.l + 6, T.r - 6), T.t];
  else if (T.b <= card.t - 8) [x1, y1, x2, y2] = [clamp(tx, card.l + 28, card.r - 28), card.t, clamp(tx, T.l + 6, T.r - 6), T.b];
  else if (T.l >= card.r + 8) [x1, y1, x2, y2] = [card.r, clamp(ty, card.t + 24, card.b - 24), T.l, clamp(ty, T.t + 4, T.b - 4)];
  else if (T.r <= card.l - 8) [x1, y1, x2, y2] = [card.l, clamp(ty, card.t + 24, card.b - 24), T.r, clamp(ty, T.t + 4, T.b - 4)];
  else return null;
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 28) return null;
  // bow the line a little, towards the middle of the screen (never off its edge), like a hand-drawn pointer
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, bow = Math.min(60, len * 0.18);
  let nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
  const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  if (Math.hypot(mx - nx * bow - cx, my - ny * bow - cy) < Math.hypot(mx + nx * bow - cx, my + ny * bow - cy)) [nx, ny] = [-nx, -ny];
  return `M${x1.toFixed(1)},${y1.toFixed(1)} Q${(mx + nx * bow).toFixed(1)},${(my + ny * bow).toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
}

/**
 * First-visit walkthrough of the Sky Explorer: a small card at the top of the screen while a soft
 * spotlight picks out each control. Steps that ask you to try something move on by themselves.
 */
export default function Tutorial({
  open,
  hidden,
  mode,
  inSphere,
  sphereKind,
  onClose,
}: {
  open: boolean;
  /** In a 360° view or the galaxy view: the tour waits (showing a hint inside 360°). */
  hidden: boolean;
  mode: "2d" | "3d";
  inSphere: boolean;
  /** What kind of 360° view is open (to tell 3D scenes from flat images). */
  sphereKind: string | null;
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
      while (n > 0 && n < STEPS.length - 1 && STEPS[n].target && STEPS[n].target !== "visible-3d" && !selectors(STEPS[n]).some(findOne)) n += to >= i ? 1 : -1;
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

  // 360° step: done the moment they step inside a 3D one
  const in3D = inSphere && IS_3D.includes(sphereKind ?? "");
  useEffect(() => {
    if (open && in3D && STEPS[i].wait?.kind === "sphere") setDid(true);
  }, [open, in3D, i]);

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
      in3D || did ? (
        <div className="tour-banner" role="status">
          <span className="tour-check" aria-hidden="true">✓</span>
          You&apos;re inside in 3D! Fly with W A S D, then scroll out or press Esc to finish the tour.
        </div>
      ) : (
        <div className="tour-banner" role="status">
          <span className="tour-check muted" aria-hidden="true">i</span>
          This one&apos;s a flat SPHEREx image. Press Esc and try a planet or constellation to fly around in 3D.
        </div>
      )
    ) : null;

  const pad = 6;
  const W = typeof window !== "undefined" ? window.innerWidth : 1280;
  // The card lives at the top, in the free gap between the controls. If the spotlight is up there
  // too, it slides beside it, and only drops below it when there's no room to the side.
  const slot = typeof window !== "undefined" ? topSlot(430) : { left: (W - 430) / 2, top: 14, width: 430 };
  const cw = slot.width;
  let left = slot.left, top = slot.top;
  // (too close to fit an arrow counts as overlapping)
  const overlaps = (l: number) => !!rect && rect.top < top + cardH + 10 && rect.left - pad - 48 < l + cw && rect.left + rect.width + pad + 48 > l;
  if (rect && overlaps(left)) {
    // leave room for the arrow between the card and what it points at
    const right = rect.left + rect.width + pad + 64, leftSide = rect.left - pad - 64 - cw;
    if (right + cw <= W - 12) left = right;
    else if (leftSide >= 12) left = leftSide;
    else top = rect.top + rect.height + pad + 52;
  }
  const progress = i === 0 ? 0 : last ? 1 : (i - (did ? 0 : 1)) / count;
  const arrow = rect && cardH ? arrowPath({ l: left, t: top, r: left + cw, b: top + cardH }, rect, pad + 5) : null;
  const other = modeFrom === "2d" ? "3D" : "2D", back = modeFrom === "2d" ? "2D" : "3D";

  return (
    <div className={`tour ${step.wait ? "trying" : ""}`}>
      {rect ? (
        <div className={`tour-spot ${step.target === "visible-3d" ? "follow" : ""}`} style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} aria-hidden="true" />
      ) : (
        !step.wait && <div className="tour-dim" aria-hidden="true" />
      )}

      {arrow && (
        <svg className="tour-arrow" aria-hidden="true">
          <defs>
            <marker id="tour-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 L2.5,5 z" fill="#f7efdf" />
            </marker>
          </defs>
          <path className="tour-arrow-shadow" d={arrow} />
          <path className="tour-arrow-line" d={arrow} markerEnd="url(#tour-head)" />
        </svg>
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
                <button className="tour-go" onClick={finish} ref={focusQuietly}>
                  Start exploring
                </button>
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
