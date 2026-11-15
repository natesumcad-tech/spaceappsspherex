"use client";

import { useEffect, useState } from "react";

export type CompareMode = "normal" | "subtract" | "add";

export const SPHEREX_PASSES = [
  { id: 0, label: "Pass 1 · Apr 2025", short: "2025.3" },
  { id: 1, label: "Pass 2 · Oct 2025", short: "2025.8" },
  { id: 2, label: "Pass 3 · Apr 2026", short: "2026.3" },
  { id: 3, label: "Pass 4 · Oct 2026", short: "2026.8" },
];

interface BlinkPlayerProps {
  fov: number;
  onFovChange: (fov: number) => void;
  compareMode: CompareMode;
  onCompareModeChange: (mode: CompareMode) => void;
  passIndex: number;
  onPassChange: (index: number) => void;
}

export default function BlinkPlayer({
  fov,
  onFovChange,
  compareMode,
  onCompareModeChange,
  passIndex,
  onPassChange,
}: BlinkPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [fast, setFast] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      onPassChange((passIndex + 1) % SPHEREX_PASSES.length);
    }, fast ? 450 : 900);
    return () => clearInterval(id);
  }, [playing, fast, passIndex, onPassChange]);

  return (
    <div className="mv-blink-bar">
      <div className="mv-blink-row">
        <span className="mv-blink-title">6-Mo Time-Series</span>
        <button
          type="button"
          className="mv-coord-btn"
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? "⏸ Pause" : "▶ Blink"}
        </button>
        <button
          type="button"
          className="mv-coord-btn"
          onClick={() => setFast((f) => !f)}
          title="Toggle blink speed"
        >
          {fast ? "2×" : "1×"}
        </button>
        <span className="mv-blink-pass">{SPHEREX_PASSES[passIndex].label}</span>
      </div>

      <div className="mv-blink-row">
        <div className="mv-blink-passes">
          {SPHEREX_PASSES.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`mv-blink-step ${passIndex === p.id ? "active" : ""}`}
              onClick={() => {
                setPlaying(false);
                onPassChange(p.id);
              }}
            >
              {p.short}
            </button>
          ))}
        </div>

        <div className="mv-blink-compare">
          {(["normal", "subtract", "add"] as CompareMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`mv-blink-step ${compareMode === m ? "active" : ""}`}
              onClick={() => onCompareModeChange(m)}
              title={
                m === "subtract"
                  ? "Epoch B − Epoch A (isolate movers & variables)"
                  : m === "add"
                  ? "Epoch B + Epoch A (coadd)"
                  : "Standard view"
              }
            >
              {m === "subtract" ? "B − A" : m === "add" ? "B + A" : "Normal"}
            </button>
          ))}
        </div>
      </div>

      <div className="mv-blink-row">
        <label className="mv-blink-fov">
          <span>FOV: {fov < 2 ? `${fov.toFixed(1)}°` : `${fov.toFixed(0)}°`}</span>
          <input
            type="range"
            min={0.3}
            max={60}
            step={0.1}
            value={Math.min(60, Math.max(0.3, fov))}
            onChange={(e) => onFovChange(Number(e.target.value))}
          />
        </label>
      </div>
    </div>
  );
}
