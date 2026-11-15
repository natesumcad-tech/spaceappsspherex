"use client";

import { useEffect, useRef } from "react";

/**
 * Where the arrow should point, in screen pixels. `top`/`bottom` are the target's edges (the arrow
 * hovers just above it, or below when there's no room). `behind` marks a point projected from behind
 * the camera, whose direction is reversed.
 */
export type ArrowSpot = { x: number; top: number; bottom: number; behind?: boolean; label?: string };

const M = 54; // keep the arrow this far inside the screen edges
// Pinned to the edge, it stays clear of the toolbars along the top and the timeline at the bottom
const EDGE = { top: 150, bottom: 120, side: 80 };

/**
 * Game-style quest arrow: a big glowing arrow bobbing over the destination, or, when the destination is
 * off screen, parked at the screen edge pointing the way, with how far it is.
 * `locate` is called every frame, so it should be cheap.
 */
export default function QuestArrow({ locate }: { locate: () => ArrowSpot | null }) {
  const root = useRef<HTMLDivElement>(null);
  const turn = useRef<HTMLDivElement>(null);
  const tag = useRef<HTMLSpanElement>(null);
  const locateRef = useRef(locate);
  locateRef.current = locate;

  useEffect(() => {
    let raf = 0;
    let last = "";
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = root.current, rot = turn.current, label = tag.current;
      if (!el || !rot || !label) return;
      const p = locateRef.current();
      if (!p) {
        if (last !== "off") (el.style.display = "none"), (last = "off");
        return;
      }
      const W = window.innerWidth, H = window.innerHeight;
      const onScreen = !p.behind && p.x > M && p.x < W - M && p.bottom > M && p.top < H - M;
      let x: number, y: number, deg: number, mode: string;
      if (onScreen) {
        // hover over it pointing down (or under it pointing up if it's right at the top)
        const under = p.top < 86;
        x = p.x;
        y = under ? p.bottom + 8 : p.top - 8;
        deg = under ? 180 : 0;
        mode = under ? "over under" : "over";
      } else {
        // pin to the screen edge, pointing toward it
        const cx = W / 2, cy = (EDGE.top + H - EDGE.bottom) / 2;
        let dx = p.x - cx, dy = (p.top + p.bottom) / 2 - cy;
        if (p.behind) [dx, dy] = [-dx, -dy];
        const hw = Math.max(40, W / 2 - EDGE.side), hh = Math.max(40, (H - EDGE.top - EDGE.bottom) / 2);
        const k = Math.min(hw / Math.max(1e-6, Math.abs(dx)), hh / Math.max(1e-6, Math.abs(dy)));
        x = cx + dx * k;
        y = cy + dy * k;
        deg = (Math.atan2(dy, dx) * 180) / Math.PI - 90; // the arrow is drawn pointing down
        mode = "edge";
      }
      const key = `${mode}|${x.toFixed(0)}|${y.toFixed(0)}|${deg.toFixed(0)}|${p.label ?? ""}`;
      if (key === last) return;
      last = key;
      el.style.display = "";
      el.className = `qa ${mode}`;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      rot.style.transform = `rotate(${deg.toFixed(1)}deg)`;
      label.textContent = mode === "edge" ? (p.label ?? "") : "";
      if (mode === "edge") {
        // the name sits on the screen side of the arrow, so it never runs off the edge
        const a = ((deg + 90) * Math.PI) / 180, ox = -Math.cos(a) * 62, oy = -Math.sin(a) * 50;
        label.style.transform = `translate(calc(-50% + ${ox.toFixed(0)}px), calc(-50% + ${oy.toFixed(0)}px))`;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={root} className="qa" style={{ display: "none" }} aria-hidden="true">
      <div ref={turn} className="qa-turn">
        <div className="qa-bob">
          <svg viewBox="0 0 48 60" width="48" height="60">
            <defs>
              <linearGradient id="qa-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fff2a8" />
                <stop offset="0.45" stopColor="#ffd23f" />
                <stop offset="1" stopColor="#f08a12" />
              </linearGradient>
            </defs>
            {/* chunky arrow pointing down: tip at the bottom centre */}
            <path d="M15 3 H33 V27 H45 L24 57 L3 27 H15 Z" fill="url(#qa-fill)" stroke="#3a2205" strokeWidth="3" strokeLinejoin="round" />
            <path d="M19 7 H24 V30" stroke="#fff" strokeOpacity=".7" strokeWidth="3" strokeLinecap="round" fill="none" />
          </svg>
        </div>
      </div>
      <span ref={tag} className="qa-tag" />
    </div>
  );
}
