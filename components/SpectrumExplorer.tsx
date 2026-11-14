"use client";

import { useMemo, useState } from "react";

// SPHEREx focal plane: 6 detector arrays × 17 bands = 102 bands.
// [start µm, end µm, resolving power R]
const ARRAYS: [number, number, number][] = [
  [0.75, 1.09, 39],
  [1.1, 1.62, 41],
  [1.63, 2.41, 41],
  [2.42, 3.82, 35],
  [3.83, 4.41, 110],
  [4.42, 5.0, 130],
];

type Band = { c: number; w: number; array: number };

const BANDS: Band[] = ARRAYS.flatMap(([lo, hi, R], array) => {
  const out: Band[] = [];
  const step = Math.log(hi / lo) / 17;
  for (let i = 0; i < 17; i++) {
    const c = lo * Math.exp(step * (i + 0.5));
    out.push({ c, w: c / R, array });
  }
  return out;
});

const gauss = (x: number, mu: number, sigma: number) =>
  Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma));

// Simple toy model of a star-forming galaxy, rest frame, arbitrary units.
const LINES = [
  { name: "[O II]", rest: 0.3727, amp: 0.9 },
  { name: "Hβ", rest: 0.4861, amp: 0.5 },
  { name: "[O III]", rest: 0.5007, amp: 1.1 },
  { name: "Hα", rest: 0.6563, amp: 2.2 },
  { name: "Paα", rest: 1.875, amp: 0.35 },
];

function galaxyRest(l: number) {
  let f = Math.exp(-((Math.log(l / 0.9)) ** 2) / (2 * 0.75 ** 2));
  if (l < 0.4) f *= 0.55; // 4000 Å break
  f *= 1 - 0.12 * gauss(l, 2.3, 0.04); // CO absorption from cool stars
  f += 0.18 * gauss(l, 3.3, 0.025); // PAH dust emission
  for (const ln of LINES) f += ln.amp * gauss(l, ln.rest, ln.rest * 0.0025);
  return f;
}

const ICES = [
  { name: "H₂O ice", at: 3.05, width: 0.12, depth: 0.55 },
  { name: "CO₂ ice", at: 4.27, width: 0.018, depth: 0.7 },
  { name: "CO ice", at: 4.67, width: 0.012, depth: 0.45 },
];

// Background star seen through a cold, icy cloud.
function icyStar(l: number, thickness: number) {
  const T = 3500;
  const x = 14388 / (l * T);
  let f = 1 / (l ** 5 * (Math.exp(x) - 1));
  f *= Math.exp(-0.35 * thickness / l); // dust reddening
  for (const ice of ICES)
    f *= 1 - thickness * ice.depth * gauss(l, ice.at, ice.width);
  return f;
}

// Plot geometry (log-scaled x axis)
const W = 820;
const H = 340;
const M = { l: 44, r: 16, t: 28, b: 64 };
const XMIN = 0.65;
const XMAX = 5.3;
const x = (l: number) =>
  M.l + ((Math.log(l) - Math.log(XMIN)) / (Math.log(XMAX) - Math.log(XMIN))) * (W - M.l - M.r);
const TICKS = [0.75, 1, 1.5, 2, 3, 4, 5];
const ARRAY_COLORS = ["#7c9cff", "#5ec8ff", "#4fe0c0", "#b6e05a", "#ffb547", "#ff7a6b"];

export default function SpectrumExplorer() {
  const [mode, setMode] = useState<"galaxy" | "ice">("galaxy");
  const [z, setZ] = useState(0.5);
  const [thick, setThick] = useState(0.8);

  const { path, points, labels } = useMemo(() => {
    const f = (lObs: number) =>
      mode === "galaxy" ? galaxyRest(lObs / (1 + z)) : icyStar(lObs, thick);

    const N = 900;
    const samples: [number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const l = XMIN * Math.exp((i / N) * Math.log(XMAX / XMIN));
      samples.push([l, f(l)]);
    }
    const bandFlux = BANDS.map((b) => {
      let s = 0;
      const k = 24;
      for (let i = 0; i < k; i++) s += f(b.c - b.w / 2 + (b.w * (i + 0.5)) / k);
      return s / k;
    });
    const ymax = Math.max(...samples.map((s) => s[1]), ...bandFlux) * 1.08;
    const y = (v: number) => H - M.b - (v / ymax) * (H - M.t - M.b);

    const path = samples
      .map(([l, v], i) => `${i ? "L" : "M"}${x(l).toFixed(1)},${y(v).toFixed(1)}`)
      .join("");
    const points = BANDS.map((b, i) => ({ ...b, px: x(b.c), py: y(bandFlux[i]) }));

    const labels =
      mode === "galaxy"
        ? LINES.map((ln) => ({ name: ln.name, l: ln.rest * (1 + z) }))
        : ICES.map((ice) => ({ name: ice.name, l: ice.at }));
    return {
      path,
      points,
      labels: labels.filter((lb) => lb.l > XMIN && lb.l < XMAX),
    };
  }, [mode, z, thick]);

  const ha = 0.6563 * (1 + z);
  const haBand = BANDS.findIndex((b) => Math.abs(ha - b.c) <= b.w / 2 + 1e-9);
  const caption =
    mode === "galaxy"
      ? ha < 0.75
        ? `At redshift z = ${z.toFixed(2)}, the bright Hα line (red light at 0.656 µm) hasn't stretched into SPHEREx's range yet.`
        : ha > 5
          ? `At z = ${z.toFixed(2)}, Hα has been stretched beyond 5 µm, past SPHEREx's reddest band.`
          : `At z = ${z.toFixed(2)}, the light has traveled for ${lookback(z)} and Hα has stretched to ${ha.toFixed(2)} µm${haBand >= 0 ? `, landing in band ${haBand + 1} of 102` : ""}. Its position gives the galaxy's distance, which is how SPHEREx builds a 3D map.`
      : `Starlight passing through a cold cloud is absorbed at the exact wavelengths of each ice. SPHEREx will measure these dips toward millions of stars to take a census of our galaxy's water and CO₂ ice.`;

  return (
    <div className="explorer">
      <div className="explorer-controls">
        <div className="segmented" role="tablist" aria-label="Spectrum type">
          <button role="tab" aria-selected={mode === "galaxy"} onClick={() => setMode("galaxy")}>
            Distant galaxy
          </button>
          <button role="tab" aria-selected={mode === "ice"} onClick={() => setMode("ice")}>
            Icy cloud
          </button>
        </div>
        {mode === "galaxy" ? (
          <label className="slider">
            <span>
              Redshift <b>z = {z.toFixed(2)}</b>
            </span>
            <input type="range" min={0} max={3} step={0.01} value={z} onChange={(e) => setZ(+e.target.value)} />
          </label>
        ) : (
          <label className="slider">
            <span>
              Ice thickness <b>{Math.round(thick * 100)}%</b>
            </span>
            <input type="range" min={0} max={1} step={0.01} value={thick} onChange={(e) => setThick(+e.target.value)} />
          </label>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="explorer-plot" role="img" aria-label="Simulated spectrum with SPHEREx band measurements">
        {ARRAYS.map(([lo, hi], i) => (
          <g key={i}>
            <rect x={x(lo)} y={H - M.b + 22} width={x(hi) - x(lo)} height={6} rx={3} fill={ARRAY_COLORS[i]} opacity={0.85} />
          </g>
        ))}
        <text x={x(0.75)} y={H - 10} className="axis-note">
          SPHEREx's 6 detector arrays (17 bands each)
        </text>
        <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} className="axis" />
        {TICKS.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={M.t} y2={H - M.b} className="grid" />
            <text x={x(t)} y={H - M.b + 16} textAnchor="middle" className="tick">
              {t}
            </text>
          </g>
        ))}
        <text x={W - M.r} y={H - M.b + 16} textAnchor="end" className="tick">
          µm
        </text>
        <text x={M.l - 10} y={M.t - 10} className="axis-note">
          Brightness
        </text>

        {labels.map((lb, i) => (
          <g key={lb.name}>
            <line x1={x(lb.l)} x2={x(lb.l)} y1={M.t} y2={H - M.b} className="line-marker" />
            {/* stagger labels so close lines (like Hβ and [O III]) don't overlap */}
            <text x={x(lb.l) + 4} y={M.t + 10 + (i % 2) * 14} className="line-label">
              {lb.name}
            </text>
          </g>
        ))}

        <path d={path} className="spectrum" />
        {points.map((p, i) => (
          <circle key={i} cx={p.px} cy={p.py} r={3.2} fill={ARRAY_COLORS[p.array]} className="band-dot">
            <title>{`Band ${i + 1}: ${p.c.toFixed(3)} µm`}</title>
          </circle>
        ))}
      </svg>

      <div className="explorer-legend">
        <span>
          <i className="key-line" /> True spectrum (what a perfect instrument would see)
        </span>
        <span>
          <i className="key-dot" /> What SPHEREx measures: 102 band brightnesses
        </span>
      </div>
      <p className="explorer-caption" aria-live="polite">
        {caption}
      </p>
      <p className="fine-print">Toy model for illustration. Band layout follows SPHEREx's published design.</p>
    </div>
  );
}

// Rough lookback time for a flat ΛCDM universe (H0=70, Ωm=0.3).
function lookback(z: number) {
  const H0 = 70 / 977.8; // per Gyr
  const steps = 400;
  let t = 0;
  for (let i = 0; i < steps; i++) {
    const zz = (z * (i + 0.5)) / steps;
    t += 1 / ((1 + zz) * Math.sqrt(0.3 * (1 + zz) ** 3 + 0.7));
  }
  const gyr = ((t * z) / steps) / H0;
  return gyr < 1 ? `${Math.round(gyr * 1000)} million years` : `${gyr.toFixed(1)} billion years`;
}
