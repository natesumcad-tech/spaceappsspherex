"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { LANDMARKS, type Landmark } from "@/lib/explorer/landmarks";
import { constellationFigure, type SkyData } from "@/lib/explorer/astro";

// ── Map layout (an original "region map" of the tour, read bottom → top) ──
const W = 1000;
const H = 1900;
const START: P = [330, 1832];

type P = [number, number];

const STOPS: Record<string, P> = {
  "spherex-orbit": [330, 1720],
  "night-sky": [680, 1640],
  orion: [760, 1440],
  "ursa-major": [470, 1420],
  scorpius: [230, 1300],
  crux: [560, 1230],
  moon: [800, 1060],
  mars: [540, 1050],
  jupiter: [270, 900],
  saturn: [640, 860],
  sirius: [800, 650],
  polaris: [500, 590],
  betelgeuse: [230, 520],
  "milky-way": [500, 230],
};

type Island = { key: Landmark["section"]; c: P; rx: number; ry: number; seed: number; fill: string; shade: string; light: string; banner: P; title: string };
const ISLANDS: Island[] = [
  { key: "Milky Way", c: [500, 230], rx: 270, ry: 150, seed: 5, fill: "#a487ec", shade: "#7356c0", light: "#c9b6f7", banner: [500, 96], title: "MILKY WAY" },
  { key: "Stars", c: [510, 580], rx: 400, ry: 150, seed: 4, fill: "#f59bb0", shade: "#c9677f", light: "#ffc9d6", banner: [770, 500], title: "NEARBY STARS" },
  { key: "Solar System", c: [520, 960], rx: 420, ry: 180, seed: 3, fill: "#f8cc80", shade: "#d49544", light: "#ffe6b8", banner: [830, 930], title: "SOLAR SYSTEM" },
  { key: "Constellations", c: [500, 1340], rx: 410, ry: 175, seed: 2, fill: "#7a82e2", shade: "#4c52a8", light: "#b3b9f6", banner: [810, 1262], title: "CONSTELLATIONS" },
  { key: "Near Earth", c: [500, 1715], rx: 360, ry: 140, seed: 1, fill: "#72d6a2", shade: "#3f9e72", light: "#b7f0d1", banner: [720, 1790], title: "EARTH & ORBIT" },
];
const SECTION_RING: Record<string, string> = Object.fromEntries(ISLANDS.map((i) => [i.key, i.shade]));

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Smooth closed "hand-drawn" blob around an ellipse (Catmull-Rom → cubic Bézier). */
function blobPath(c: P, rx: number, ry: number, seed: number, wobble = 0.12, n = 16) {
  const r = rng(seed);
  const pts: P[] = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (r() - 0.5) * 2 * wobble;
    return [c[0] + Math.cos(a) * rx * k, c[1] + Math.sin(a) * ry * k];
  });
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1: P = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: P = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + "Z";
}

/** Metro-style route: vertical then horizontal legs with rounded corners. */
function routePoints(): P[] {
  const stops = LANDMARKS.map((l) => STOPS[l.id]);
  const pts: P[] = [START];
  let prev = START;
  for (const s of stops) {
    if (Math.abs(prev[0] - s[0]) > 1 && Math.abs(prev[1] - s[1]) > 1) pts.push([prev[0], s[1]]);
    pts.push(s);
    prev = s;
  }
  return pts;
}

function roundedPath(pts: P[], r = 26) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const p1: P = [b[0] + ((a[0] - b[0]) / l1) * rr, b[1] + ((a[1] - b[1]) / l1) * rr];
    const p2: P = [b[0] + ((c[0] - b[0]) / l2) * rr, b[1] + ((c[1] - b[1]) / l2) * rr];
    d += `L${p1[0]},${p1[1]}Q${b[0]},${b[1]} ${p2[0]},${p2[1]}`;
  }
  const last = pts[pts.length - 1];
  return d + `L${last[0]},${last[1]}`;
}

function segDist(p: P, a: P, b: P) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Scatter decorations inside an island, keeping clear of the route and the stops. */
function scatter(island: Island, count: number, route: P[], seed: number, clearance = 46) {
  const r = rng(seed);
  const out: P[] = [];
  for (let tries = 0; out.length < count && tries < count * 40; tries++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.86;
    const p: P = [island.c[0] + Math.cos(a) * island.rx * d, island.c[1] + Math.sin(a) * island.ry * d];
    if (Object.values(STOPS).some((s) => Math.hypot(s[0] - p[0], s[1] - p[1]) < 78)) continue;
    if (route.some((pt, i) => i > 0 && segDist(p, route[i - 1], pt) < clearance)) continue;
    if (Math.hypot(island.banner[0] - p[0], island.banner[1] - p[1]) < 90) continue;
    if (out.some((o) => Math.hypot(o[0] - p[0], o[1] - p[1]) < 34)) continue;
    out.push(p);
  }
  return out;
}

const sparkle = (x: number, y: number, s: number) =>
  `M${x},${y - s}Q${x + s * 0.18},${y - s * 0.18} ${x + s},${y}Q${x + s * 0.18},${y + s * 0.18} ${x},${y + s}Q${x - s * 0.18},${y + s * 0.18} ${x - s},${y}Q${x - s * 0.18},${y - s * 0.18} ${x},${y - s}Z`;

// ── Stop badge icons (drawn inside a circle of radius 28) ──
function BadgeIcon({ lm, sky }: { lm: Landmark; sky: SkyData | null }) {
  const clip = `clip-${lm.id}`;
  let body: React.ReactNode = null;
  if (lm.kind === "orbit")
    body = (
      <>
        <rect x={-30} y={-30} width={60} height={60} fill="#3b8ee0" />
        <path d="M-22,-10 q8,-12 20,-6 q6,8 -4,12 q-10,2 -8,12 q-8,2 -10,-6Z M4,6 q10,-6 18,2 q2,10 -8,14 q-12,-2 -10,-16Z" fill="#5ec46f" />
        <path d="M-14,-20 q6,-4 12,0 q6,-2 8,3 h-22Z" fill="#fff" opacity={0.85} />
      </>
    );
  else if (lm.kind === "sky") {
    const r = rng(9);
    body = (
      <>
        <rect x={-30} y={-30} width={60} height={60} fill="#101a48" />
        {Array.from({ length: 22 }, (_, i) => (
          <circle key={i} cx={(r() - 0.5) * 54} cy={(r() - 0.5) * 54} r={0.6 + r() * 1.6} fill="#fff" />
        ))}
        <path d="M-16,8 L-6,2 L4,4 L12,-6 L20,-2" stroke="#9fd0ff" strokeWidth={1.6} fill="none" />
      </>
    );
  } else if (lm.kind === "constellation") {
    const con = sky?.constellations.find((c) => c.id === lm.constellation);
    const fig = con ? constellationFigure(con) : [];
    body = (
      <>
        <rect x={-30} y={-30} width={60} height={60} fill="#141c52" />
        {fig.map((line, i) => (
          <polyline key={i} points={line.map(([x, y]) => `${x * 20},${y * 20}`).join(" ")} stroke="#b9d4ff" strokeWidth={1.8} fill="none" strokeLinejoin="round" />
        ))}
        {fig.flat().map(([x, y], i) => (
          <circle key={`s${i}`} cx={x * 20} cy={y * 20} r={1.8} fill="#fff" />
        ))}
      </>
    );
  } else if (lm.kind === "planet") {
    const p = lm.planet;
    if (p === "moon")
      body = (
        <>
          <rect x={-30} y={-30} width={60} height={60} fill="#b8bcc6" />
          <circle cx={-8} cy={-6} r={7} fill="#9b9faa" />
          <circle cx={10} cy={8} r={5} fill="#9b9faa" />
          <circle cx={-4} cy={14} r={3.5} fill="#9b9faa" />
          <circle cx={12} cy={-12} r={3} fill="#a7abb5" />
        </>
      );
    if (p === "mars")
      body = (
        <>
          <rect x={-30} y={-30} width={60} height={60} fill="#dc6a3f" />
          <path d="M-24,4 q12,-8 22,0 q8,6 20,-2 v10 q-14,6 -22,0 q-10,-6 -20,2Z" fill="#a9472b" />
          <ellipse cx={0} cy={-25} rx={14} ry={6} fill="#fff" />
        </>
      );
    if (p === "jupiter")
      body = (
        <>
          <rect x={-30} y={-30} width={60} height={60} fill="#ecd0a8" />
          {[-18, -6, 6, 17].map((y, i) => (
            <rect key={y} x={-30} y={y} width={60} height={i % 2 ? 5 : 7} fill={i % 2 ? "#d9a877" : "#c08a5c"} />
          ))}
          <ellipse cx={8} cy={9} rx={7} ry={4} fill="#c4553a" />
        </>
      );
    if (p === "saturn")
      body = (
        <>
          <rect x={-30} y={-30} width={60} height={60} fill="#20184a" />
          <circle r={14} fill="#ebd29b" />
          <rect x={-14} y={-4} width={28} height={4} fill="#d6b57a" />
          <ellipse rx={27} ry={7} fill="none" stroke="#f3dfae" strokeWidth={3.5} transform="rotate(-18)" />
        </>
      );
  } else if (lm.kind === "star")
    body = (
      <>
        <rect x={-30} y={-30} width={60} height={60} fill="#1b1238" />
        <circle r={22} fill={lm.star!.color} opacity={0.3} />
        <circle r={lm.id === "betelgeuse" ? 17 : 13} fill={lm.star!.color} />
        <circle cx={-4} cy={-4} r={4} fill="#fff" opacity={0.7} />
      </>
    );
  else if (lm.kind === "galaxy")
    body = (
      <>
        <rect x={-30} y={-30} width={60} height={60} fill="#1c1446" />
        <path d="M0,0 C10,-14 26,-6 20,8 M0,0 C-10,14 -26,6 -20,-8" stroke="#d9c8ff" strokeWidth={4} fill="none" strokeLinecap="round" />
        <circle r={7} fill="#fff1c9" />
      </>
    );
  return (
    <>
      <clipPath id={clip}>
        <circle r={28} />
      </clipPath>
      <g clipPath={`url(#${clip})`}>{body}</g>
    </>
  );
}

export type StarMapHandle = {
  flyTo: (id: string) => Promise<void>;
  focus: (id: string | null) => void;
  exportPNG: () => Promise<Blob>;
};

type Props = {
  sky: SkyData | null;
  currentId: string | null;
  hoverId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
};

const StarMap = forwardRef<StarMapHandle, Props>(function StarMap({ sky, currentId, hoverId, onHover, onSelect }, ref) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 0.5 });
  const [animating, setAnimating] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const drag = useRef<{ pointers: Map<number, P>; moved: number; pinch: number; stop: string | null }>({ pointers: new Map(), moved: 0, pinch: 0, stop: null });

  const size = () => {
    const el = wrapRef.current!;
    return { w: el.clientWidth, h: el.clientHeight };
  };
  const limits = useCallback(() => {
    const { w, h } = size();
    return { min: Math.min(w / W, h / H) * 0.95, max: 3 };
  }, []);

  /** Keep the map on screen (centre it on any axis where it is smaller than the viewport). */
  const clampView = useCallback((v: { x: number; y: number; k: number }) => {
    const { w, h } = size();
    const { min, max } = limits();
    const k = Math.min(max, Math.max(min, v.k));
    const mw = W * k, mh = H * k, m = 80;
    const x = mw + 2 * m < w ? (w - mw) / 2 : Math.min(m, Math.max(w - mw - m, v.x));
    const y = mh + 2 * m < h ? (h - mh) / 2 : Math.min(m, Math.max(h - mh - m, v.y));
    return { x, y, k };
  }, [limits]);

  const centerOn = useCallback((p: P, k: number) => {
    const { w, h } = size();
    return clampView({ x: w / 2 - p[0] * k, y: h / 2 - p[1] * k, k });
  }, [clampView]);

  // Initial view: fit the width and start at the bottom, at Earth.
  useEffect(() => {
    const { w } = size();
    setView(centerOn(currentId ? STOPS[currentId] : [500, 1640], Math.max(limits().min, Math.min(1.1, (w / W) * 0.95))));
    const ro = new ResizeObserver(() => setView((v) => clampView(v)));
    ro.observe(wrapRef.current!);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    flyTo: (id) =>
      new Promise<void>((resolve) => {
        setAnimating(true);
        setView(centerOn(STOPS[id], Math.max(1.6, viewRef.current.k)));
        setTimeout(() => {
          setAnimating(false);
          resolve();
        }, 650);
      }),
    focus: (id) => {
      if (id) setView(centerOn(STOPS[id], Math.max(1.1, Math.min(viewRef.current.k, 1.4))));
    },
    exportPNG: async () => {
      const clone = svgRef.current!.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("width", String(W * 2));
      clone.setAttribute("height", String(H * 2));
      clone.setAttribute("viewBox", `0 0 ${W} ${H}`);
      clone.querySelector("[data-viewport]")?.removeAttribute("transform");
      clone.querySelectorAll("[data-ui]").forEach((n) => n.remove());
      const xml = new XMLSerializer().serializeToString(clone);
      const img = new Image();
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
      await img.decode();
      const c = document.createElement("canvas");
      c.width = W * 2;
      c.height = H * 2;
      c.getContext("2d")!.drawImage(img, 0, 0);
      return new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
    },
  }));

  // ── Pan / zoom ──
  const onPointerDown = (e: React.PointerEvent) => {
    const d = drag.current;
    d.pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (d.pointers.size === 1) {
      d.moved = 0;
      d.stop = (e.target as Element).closest("[data-stop]")?.getAttribute("data-stop") ?? null;
    }
    if (d.pointers.size === 2) {
      const [a, b] = [...d.pointers.values()];
      d.pinch = Math.hypot(a[0] - b[0], a[1] - b[1]);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const p = d.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p[0], dy = e.clientY - p[1];
    p[0] = e.clientX;
    p[1] = e.clientY;
    d.moved += Math.abs(dx) + Math.abs(dy);
    // Only capture the pointer once it's really a drag, so taps still reach the stops.
    const el = e.currentTarget as Element;
    if (d.moved > 6 && !el.hasPointerCapture(e.pointerId)) el.setPointerCapture(e.pointerId);
    if (d.pointers.size === 2) {
      const [a, b] = [...d.pointers.values()];
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const r = wrapRef.current!.getBoundingClientRect();
      zoomAt((a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top, dist / (d.pinch || dist));
      d.pinch = dist;
      return;
    }
    setView((v) => clampView({ ...v, x: v.x + dx, y: v.y + dy }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    const tap = d.pointers.size === 1 && d.moved < 8 && e.type === "pointerup";
    d.pointers.delete(e.pointerId);
    if (tap && d.stop) onSelect(d.stop);
    d.stop = null;
  };

  const zoomAt = (mx: number, my: number, factor: number) =>
    setView((v) => {
      const k = Math.min(limits().max, Math.max(limits().min, v.k * factor));
      return clampView({ k, x: mx - (mx - v.x) * (k / v.k), y: my - (my - v.y) * (k / v.k) });
    });

  useEffect(() => {
    const el = wrapRef.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Static artwork (computed once) ──
  const art = useMemo(() => {
    const route = routePoints();
    const r = rng(77);
    const bgSparkles = Array.from({ length: 140 }, () => [r() * W, r() * H, 2 + r() * 6, r()] as const).filter(
      ([x, y]) => !ISLANDS.some((i) => ((x - i.c[0]) / (i.rx + 20)) ** 2 + ((y - i.c[1]) / (i.ry + 20)) ** 2 < 1),
    );
    const deco = {
      trees: scatter(ISLANDS[4], 22, route, 11),
      mountains: scatter(ISLANDS[3], 12, route, 12, 54),
      constSparkles: scatter(ISLANDS[3], 16, route, 13, 30),
      craters: scatter(ISLANDS[2], 16, route, 14, 40),
      starBursts: scatter(ISLANDS[1], 20, route, 15, 34),
    };
    return { route, path: roundedPath(route), bgSparkles, deco };
  }, []);

  const constFigures = useMemo(() => {
    if (!sky) return [];
    // Faint dotted constellation figures painted on the Constellations island
    const picks: [string, P, number][] = [["Cas", [300, 1210], 46], ["Leo", [660, 1330], 50], ["Cyg", [890, 1380], 40], ["Lyr", [140, 1390], 26]];
    return picks.map(([id, c, s]) => {
      const con = sky.constellations.find((x) => x.id === id);
      return { id, lines: con ? constellationFigure(con).map((l) => l.map(([x, y]) => [c[0] + x * s, c[1] + y * s] as P)) : [] };
    });
  }, [sky]);

  return (
    <div
      ref={wrapRef}
      className="sm-wrap"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <svg ref={svgRef} className="sm-svg" width="100%" height="100%" role="img" aria-label="Illustrated map of the tour">
        <defs>
          <linearGradient id="sm-space" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1a1446" />
            <stop offset="0.5" stopColor="#1d2a62" />
            <stop offset="1" stopColor="#173a6e" />
          </linearGradient>
          <pattern id="sm-dots" width="26" height="26" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="3" r="1.3" fill="#ffffff" opacity="0.08" />
          </pattern>
        </defs>
        <g
          data-viewport
          transform={`translate(${view.x},${view.y}) scale(${view.k})`}
          style={{ transition: animating ? "transform 0.6s cubic-bezier(.65,0,.35,1)" : "none" }}
        >
          {/* Space */}
          <rect width={W} height={H} rx={40} fill="url(#sm-space)" />
          <rect width={W} height={H} rx={40} fill="url(#sm-dots)" />
          {art.bgSparkles.map(([x, y, s, t], i) => (
            <path key={i} d={sparkle(x, y, s)} fill={t > 0.8 ? "#ffe9a8" : "#ffffff"} opacity={0.35 + t * 0.5} />
          ))}

          {/* Floating decorations in space */}
          <g transform="translate(905,300)">
            <circle r={30} fill="#5fc4c9" />
            <rect x={-30} y={-6} width={60} height={8} fill="#48a6ab" />
            <ellipse rx={52} ry={12} fill="none" stroke="#bff0f0" strokeWidth={5} transform="rotate(-15)" />
          </g>
          <g transform="translate(85,420)">
            <circle r={20} fill="#ee8f6a" />
            <circle cx={-6} cy={-5} r={5} fill="#d36f4c" />
          </g>
          <g transform="translate(925,770)" data-planet-x>
            <circle r={26} fill="#2c2f5c" stroke="#8d93d6" strokeWidth={3} strokeDasharray="6 6" />
            <text y={9} textAnchor="middle" fontSize={26} fontWeight={800} fill="#c3c8ff">?</text>
            <text y={50} textAnchor="middle" fontSize={14} fontWeight={700} fill="#c3c8ff">Planet X?</text>
          </g>
          <g transform="translate(70,960)">
            {Array.from({ length: 12 }, (_, i) => (
              <rect key={i} x={-4} y={-58} width={8} height={18} rx={4} fill="#ffd66b" transform={`rotate(${i * 30})`} />
            ))}
            <circle r={36} fill="#ffcb3d" />
            <circle r={26} fill="#ffe17a" />
            <text y={64} textAnchor="middle" fontSize={14} fontWeight={700} fill="#ffe17a">Sun</text>
          </g>
          <g transform="translate(880,1560) rotate(-28)">
            <path d="M0,-9 L-90,-3 L-90,3 L0,9Z" fill="#bfe8ff" opacity={0.45} />
            <circle r={11} fill="#e6f6ff" />
          </g>
          <g transform="translate(125,1640)">
            <rect x={-26} y={-5} width={52} height={10} rx={3} fill="#9fd8ff" />
            <path d="M-16,-6 L-22,-38 L22,-38 L16,-6Z" fill="#e9eef8" />
            <path d="M-12,-8 L-17,-30 L17,-30 L12,-8Z" fill="#c9d3e6" />
            <path d="M-8,-10 L-11,-22 L11,-22 L8,-10Z" fill="#aebbd6" />
            <text y={28} textAnchor="middle" fontSize={14} fontWeight={700} fill="#e9eef8">SPHEREx</text>
          </g>

          {/* Islands */}
          {ISLANDS.map((i) => (
            <g key={i.key}>
              <path d={blobPath([i.c[0], i.c[1] + 14], i.rx, i.ry, i.seed)} fill={i.shade} />
              <path d={blobPath(i.c, i.rx, i.ry, i.seed)} fill={i.fill} stroke={i.light} strokeWidth={8} />
            </g>
          ))}

          {/* Island details */}
          <ellipse cx={520} cy={1780} rx={70} ry={26} fill="#5bc0ec" stroke="#b9ecff" strokeWidth={4} />
          <ellipse cx={850} cy={1690} rx={40} ry={18} fill="#5bc0ec" stroke="#b9ecff" strokeWidth={4} />
          {art.deco.trees.map(([x, y], i) => (
            <g key={i} transform={`translate(${x},${y})`}>
              <ellipse cy={10} rx={11} ry={4} fill="#3f9e72" />
              <circle r={11} fill="#3fae6e" />
              <circle cx={-3} cy={-3} r={5} fill="#7fdc9f" />
            </g>
          ))}
          <g transform="translate(790,1705)">
            <rect x={-26} y={-4} width={52} height={22} fill="#f0f4ff" />
            <path d="M-26,-4 A26,26 0 0 1 26,-4Z" fill="#ffffff" />
            <rect x={-4} y={-28} width={8} height={24} fill="#7b86b8" />
          </g>
          <g transform="translate(235,1795)">
            <path d="M0,-44 C10,-30 10,-10 8,6 L-8,6 C-10,-10 -10,-30 0,-44Z" fill="#f4f6ff" />
            <circle cy={-20} r={5} fill="#5ec8ff" />
            <path d="M-8,0 L-16,12 L-8,8Z M8,0 L16,12 L8,8Z" fill="#ef4056" />
            <path d="M-5,8 L0,22 L5,8Z" fill="#ffb547" />
          </g>

          {art.deco.mountains.map(([x, y], i) => (
            <g key={i} transform={`translate(${x},${y})`}>
              <path d="M-24,14 L0,-22 L24,14Z" fill="#5a61c4" />
              <path d="M-8,-10 L0,-22 L8,-10 L3,-7 L0,-11 L-4,-7Z" fill="#e7e9ff" />
            </g>
          ))}
          {art.deco.constSparkles.map(([x, y], i) => (
            <path key={i} d={sparkle(x, y, 5 + (i % 3) * 2)} fill="#e7e9ff" opacity={0.85} />
          ))}
          {constFigures.map((f) => (
            <g key={f.id} opacity={0.55}>
              {f.lines.map((l, i) => (
                <polyline key={i} points={l.map((p) => p.join(",")).join(" ")} stroke="#e7e9ff" strokeWidth={2.5} strokeDasharray="2 6" strokeLinecap="round" fill="none" />
              ))}
              {f.lines.flat().map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={3.5} fill="#fff" />
              ))}
            </g>
          ))}

          <path d="M120,1010 Q520,960 940,1000" fill="none" stroke="#ffe6b8" strokeWidth={3} strokeDasharray="10 10" opacity={0.7} />
          <path d="M110,1090 Q520,1040 940,1100" fill="none" stroke="#ffe6b8" strokeWidth={3} strokeDasharray="10 10" opacity={0.5} />
          {Array.from({ length: 26 }, (_, i) => {
            const x = 330 + i * 18 + ((i * 37) % 11), y = 972 + ((i * 53) % 23) - 11;
            return Math.abs(x - 540) < 50 ? null : <ellipse key={i} cx={x} cy={y} rx={4 + (i % 3)} ry={3 + (i % 2)} fill="#b9895a" />;
          })}
          <text x={590} y={1008} fontSize={12} fontWeight={700} fill="#a8743f" textAnchor="middle">asteroid belt</text>
          {art.deco.craters.map(([x, y], i) => (
            <g key={i}>
              <ellipse cx={x} cy={y} rx={14 + (i % 3) * 4} ry={8 + (i % 3) * 2} fill="#e3ad62" />
              <ellipse cx={x} cy={y - 2} rx={10 + (i % 3) * 4} ry={5 + (i % 3) * 2} fill="#d49544" />
            </g>
          ))}

          {art.deco.starBursts.map(([x, y], i) => (
            <path key={i} d={sparkle(x, y, 7 + (i % 4) * 3)} fill={["#ffffff", "#ffe08a", "#bcd6ff", "#ffd0dc"][i % 4]} />
          ))}

          <g transform="translate(500,230)">
            {[0, 1, 2, 3].map((a) => (
              <path
                key={a}
                d="M0,0 C40,-50 130,-40 150,20 C160,60 120,90 90,80"
                fill="none"
                stroke="#e3d6ff"
                strokeWidth={14}
                strokeLinecap="round"
                opacity={0.5}
                transform={`rotate(${a * 90}) scale(1.1,0.55)`}
              />
            ))}
            <ellipse rx={70} ry={40} fill="#fff1c9" opacity={0.5} />
          </g>

          {/* Region banners */}
          {ISLANDS.map((i) => (
            <g key={i.title} transform={`translate(${i.banner[0]},${i.banner[1]})`}>
              <rect x={-i.title.length * 6.6 - 16} y={-17} width={i.title.length * 13.2 + 32} height={34} rx={17} fill="#ffffff" stroke={i.shade} strokeWidth={3} />
              <text y={6} textAnchor="middle" fontSize={16} fontWeight={800} letterSpacing={1.5} fill={i.shade}>
                {i.title}
              </text>
            </g>
          ))}

          {/* Route */}
          <path d={art.path} fill="none" stroke="#ffffff" strokeWidth={22} strokeLinecap="round" strokeLinejoin="round" />
          <path d={art.path} fill="none" stroke="#ef4056" strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
          <path d={art.path} fill="none" stroke="#ffd1d8" strokeWidth={3} strokeDasharray="2 18" strokeLinecap="round" className="sm-flow" />
          <g transform={`translate(${START[0]},${START[1]})`}>
            <rect x={-14} y={-14} width={28} height={28} rx={4} transform="rotate(45)" fill="#4e7bff" stroke="#fff" strokeWidth={4} />
            <text y={40} textAnchor="middle" fontSize={13} fontWeight={800} fill="#ffffff">START</text>
          </g>

          {/* Stops */}
          {LANDMARKS.map((lm, n) => {
            const [x, y] = STOPS[lm.id];
            const active = lm.id === currentId;
            const hover = lm.id === hoverId;
            const label = `${n + 1}. ${lm.title}`;
            const lw = label.length * 7.4 + 22;
            return (
              <g
                key={lm.id}
                transform={`translate(${x},${y})`}
                className={`sm-stop ${hover ? "hover" : ""}`}
                data-stop={lm.id}
                onPointerEnter={() => onHover(lm.id)}
                onPointerLeave={() => onHover(null)}
                role="button"
                tabIndex={0}
                aria-label={`Stop ${n + 1}: ${lm.title}`}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(lm.id)}
              >
                {active && <circle r={46} fill="none" stroke="#ffe17a" strokeWidth={5} className="sm-pulse" data-ui />}
                <g className="sm-badge">
                  <circle cy={5} r={36} fill="rgba(0,0,0,0.25)" />
                  <circle r={36} fill="#ffffff" />
                  <circle r={31} fill="none" stroke={SECTION_RING[lm.section]} strokeWidth={5} />
                  <BadgeIcon lm={lm} sky={sky} />
                  <circle cx={-28} cy={-28} r={13} fill="#ef4056" stroke="#fff" strokeWidth={3} />
                  <text x={-28} y={-23.5} textAnchor="middle" fontSize={13} fontWeight={800} fill="#fff">
                    {n + 1}
                  </text>
                </g>
                <g transform="translate(0,58)">
                  <rect x={-lw / 2} y={-14} width={lw} height={28} rx={14} fill={hover || active ? "#1d2457" : "#ffffff"} stroke={SECTION_RING[lm.section]} strokeWidth={2.5} />
                  <text y={5} textAnchor="middle" fontSize={13.5} fontWeight={700} fill={hover || active ? "#ffffff" : "#1d2457"}>
                    {label}
                  </text>
                </g>
                {active && (
                  <g transform="translate(0,-62)" data-ui>
                    <rect x={-52} y={-15} width={104} height={26} rx={13} fill="#ffe17a" />
                    <text y={3} textAnchor="middle" fontSize={12} fontWeight={800} fill="#1d2457">
                      YOU ARE HERE
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
});

export default StarMap;
