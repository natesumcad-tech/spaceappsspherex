"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import {
  BENCHMARK_TARGETS,
  formatDecDMS,
  formatRaHMS,
  parseRaDec,
  type BenchmarkTarget,
} from "@/lib/starmap/coordSearch";

export interface CoordSearchHandle {
  updateCenter: (ra: number, dec: number) => void;
}

interface CoordSearchBarProps {
  initialRa?: number;
  initialDec?: number;
  hasMarker: boolean;
  nasaPanelOpen?: boolean;
  onToggleNasaPanel?: () => void;
  onJump: (ra: number, dec: number, fov?: number, label?: string) => void;
  onClearMarker: () => void;
  onShareLink: () => Promise<void> | void;
}

const CoordSearchBar = forwardRef<CoordSearchHandle, CoordSearchBarProps>(function CoordSearchBar(
  {
    initialRa = 0,
    initialDec = 0,
    hasMarker,
    nasaPanelOpen = false,
    onToggleNasaPanel,
    onJump,
    onClearMarker,
    onShareLink,
  },
  ref,
) {
  const [query, setQuery] = useState("");
  const [openPresets, setOpenPresets] = useState(false);
  const [copied, setCopied] = useState(false);

  const raHmsRef = useRef<HTMLElement>(null);
  const decDmsRef = useRef<HTMLElement>(null);
  const decDegRef = useRef<HTMLElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      updateCenter(ra: number, dec: number) {
        if (raHmsRef.current) raHmsRef.current.textContent = formatRaHMS(ra);
        if (decDmsRef.current) decDmsRef.current.textContent = formatDecDMS(dec);
        if (decDegRef.current) {
          decDegRef.current.textContent = `(${ra.toFixed(3)}°, ${dec >= 0 ? "+" : ""}${dec.toFixed(3)}°)`;
        }
      },
    }),
    [],
  );

  const trimmed = query.trim();
  const parsed = trimmed ? parseRaDec(trimmed) : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed || !parsed.ok) return;
    onJump(parsed.coord.ra, parsed.coord.dec, 1.5);
    setOpenPresets(false);
  };

  const selectPreset = (t: BenchmarkTarget) => {
    setQuery(t.coordText);
    setOpenPresets(false);
    onJump(t.ra, t.dec, t.fov, t.name);
  };

  return (
    <div className="mv-coord-search">
      <form className="mv-coord-form" onSubmit={submit}>
        <input
          type="text"
          className="mv-coord-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpenPresets(true)}
          placeholder="RA / Dec (e.g. 17h 57m 48.5s +04° 41' 36&quot; or 269.452, +4.693)"
          aria-label="Search J2000 RA and Dec coordinates"
        />
        <button
          type="submit"
          className="mv-coord-btn"
          disabled={!parsed || !parsed.ok}
        >
          Go
        </button>
        <button
          type="button"
          className="mv-coord-btn mv-coord-presets-btn"
          onClick={() => setOpenPresets((v) => !v)}
          aria-expanded={openPresets}
          title="SPHEREx benchmark targets"
        >
          Targets ▾
        </button>
        <button
          type="button"
          className="mv-coord-btn"
          onClick={async () => {
            await onShareLink();
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }}
          title="Copy shareable URL with RA, Dec, band, and zoom"
        >
          {copied ? "Copied!" : "Share a link"}
        </button>
        {onToggleNasaPanel && (
          <button
            type="button"
            className={`mv-coord-btn mv-nasa-trigger ${nasaPanelOpen ? "on" : ""}`}
            onClick={onToggleNasaPanel}
            aria-expanded={nasaPanelOpen}
            title="Live NASA SPHEREx spectrum, WISE survey & Gaia DR3 proper-motion inspector"
          >
            Live NASA Data
          </button>
        )}
        {hasMarker && (
          <button
            type="button"
            className="mv-coord-btn"
            onClick={() => {
              onClearMarker();
              setQuery("");
            }}
            title="Clear target reticle"
          >
            ✕
          </button>
        )}
      </form>

      {parsed && !parsed.ok && (
        <div className="mv-coord-feedback error">{parsed.error}</div>
      )}
      {parsed && parsed.ok && (
        <div className="mv-coord-feedback ok">
          J2000: {formatRaHMS(parsed.coord.ra)}, {formatDecDMS(parsed.coord.dec)} ({parsed.coord.ra.toFixed(3)}°, {parsed.coord.dec >= 0 ? "+" : ""}{parsed.coord.dec.toFixed(3)}°)
        </div>
      )}

      <div className="mv-coord-center">
        <span>Center J2000:</span>
        <code ref={raHmsRef}>{formatRaHMS(initialRa)}</code>
        <code ref={decDmsRef}>{formatDecDMS(initialDec)}</code>
        <code ref={decDegRef} className="mv-coord-dec">({initialRa.toFixed(3)}°, {initialDec >= 0 ? "+" : ""}{initialDec.toFixed(3)}°)</code>
      </div>

      {openPresets && (
        <div className="mv-coord-presets">
          <div className="mv-coord-presets-title">SPHEREx Benchmark Targets</div>
          <div className="mv-coord-pills">
            {BENCHMARK_TARGETS.map((t) => (
              <button
                key={t.name}
                type="button"
                className="mv-coord-pill"
                onClick={() => selectPreset(t)}
              >
                <span className="mv-coord-pill-name">
                  {t.name} <small className="mv-coord-pill-note">· {t.note}</small>
                </span>
                <span className="mv-coord-pill-pos">{t.coordText}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default CoordSearchBar;
