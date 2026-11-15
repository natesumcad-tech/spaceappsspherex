"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export type CompareMode = "normal" | "subtract" | "add";

export interface BlinkPlayerHandle {
  updateFov: (fov: number) => void;
}

export const SPHEREX_PASSES = [
  { id: 0, label: "Pass 1 · Apr 2025", short: "2025.3" },
  { id: 1, label: "Pass 2 · Oct 2025", short: "2025.8" },
  { id: 2, label: "Pass 3 · Apr 2026", short: "2026.3" },
  { id: 3, label: "Pass 4 · Oct 2026", short: "2026.8" },
];

interface BlinkPlayerProps {
  initialFov?: number;
  onFovChange: (fov: number) => void;
  compareMode: CompareMode;
  onCompareModeChange: (mode: CompareMode) => void;
  passIndex: number;
  onPassChange: (index: number) => void;
}

const BlinkPlayer = forwardRef<BlinkPlayerHandle, BlinkPlayerProps>(function BlinkPlayer(
  {
    initialFov = 10,
    onFovChange,
    compareMode,
    onCompareModeChange,
    passIndex,
    onPassChange,
  },
  ref,
) {
  const [playing, setPlaying] = useState(false);
  const [fast, setFast] = useState(false);
  const fovLabelRef = useRef<HTMLSpanElement>(null);
  const fovInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      updateFov(fov: number) {
        const clamped = Math.min(60, Math.max(0.3, fov));
        if (fovLabelRef.current) {
          fovLabelRef.current.textContent = `FOV: ${clamped < 2 ? `${clamped.toFixed(1)}°` : `${clamped.toFixed(0)}°`}`;
        }
        if (fovInputRef.current && document.activeElement !== fovInputRef.current) {
          fovInputRef.current.value = String(clamped);
        }
      },
    }),
    [],
  );

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      onPassChange((passIndex + 1) % SPHEREX_PASSES.length);
    }, fast ? 450 : 900);
    return () => clearInterval(id);
  }, [playing, fast, passIndex, onPassChange]);

  const initClamped = Math.min(60, Math.max(0.3, initialFov));

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
          <span ref={fovLabelRef}>FOV: {initClamped < 2 ? `${initClamped.toFixed(1)}°` : `${initClamped.toFixed(0)}°`}</span>
          <input
            ref={fovInputRef}
            type="range"
            min={0.3}
            max={60}
            step={0.1}
            defaultValue={initClamped}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (fovLabelRef.current) {
                fovLabelRef.current.textContent = `FOV: ${v < 2 ? `${v.toFixed(1)}°` : `${v.toFixed(0)}°`}`;
              }
              onFovChange(v);
            }}
          />
        </label>
      </div>
    </div>
  );
});

export default BlinkPlayer;
