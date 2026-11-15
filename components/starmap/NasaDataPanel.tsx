"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import {
  SPHEREX_WL,
  sampleSpherexSpectrum,
  type SpherexLiveSpectrum,
} from "@/lib/starmap/hips";
import { formatDecDMS, formatRaHMS } from "@/lib/starmap/coordSearch";
import type { Settings } from "@/lib/starmap/viewer";
import type { GaiaLiveStar } from "@/app/api/nasa-sky/route";

export interface NasaDataPanelHandle {
  inspectAt: (ra: number, dec: number) => void;
}

interface NasaDataPanelProps {
  open: boolean;
  onClose: () => void;
  getCenter: () => { ra: number; dec: number };
  currentLayer: Settings["layer"];
  currentBand: number;
  onSelectLayer: (layer: Settings["layer"]) => void;
  onSelectBand: (frame: number) => void;
  onJump: (ra: number, dec: number, fov?: number, label?: string) => void;
  gaiaOverlayActive: boolean;
  onApplyGaiaOverlay: (stars: GaiaLiveStar[], active: boolean) => void;
}

const NasaDataPanel = forwardRef<NasaDataPanelHandle, NasaDataPanelProps>(function NasaDataPanel(
  {
    open,
    onClose,
    getCenter,
    currentLayer,
    currentBand,
    onSelectLayer,
    onSelectBand,
    onJump,
    gaiaOverlayActive,
    onApplyGaiaOverlay,
  },
  ref,
) {
  const [target, setTarget] = useState<{ ra: number; dec: number } | null>(null);
  const [spectrum, setSpectrum] = useState<SpherexLiveSpectrum | null>(null);
  const [specLoading, setSpecLoading] = useState(false);
  const [full100, setFull100] = useState(false);

  const [gaiaStars, setGaiaStars] = useState<GaiaLiveStar[]>([]);
  const [gaiaLoading, setGaiaLoading] = useState(false);
  const [gaiaError, setGaiaError] = useState<string | null>(null);

  const runQuery = useCallback(
    async (ra: number, dec: number, wantFull100: boolean) => {
      const normRa = ((ra % 360) + 360) % 360;
      setTarget({ ra: normRa, dec });
      setSpecLoading(true);
      setGaiaLoading(true);
      setGaiaError(null);

      // 1. Live NASA/IPAC IRSA SPHEREx DR1 Norder5 Cube Spectrum + 6-Array Coadds + Flags
      sampleSpherexSpectrum(normRa, dec, wantFull100)
        .then((res) => setSpectrum(res))
        .catch(() => setSpectrum(null))
        .finally(() => setSpecLoading(false));

      // 2. Live Gaia DR3 TAP Cross-Match (Parallaxes + Proper Motions)
      try {
        const res = await fetch(
          `/api/nasa-sky?ra=${normRa.toFixed(5)}&dec=${dec.toFixed(5)}&radius=0.15`,
        );
        const data = await res.json();
        if (!res.ok) {
          setGaiaError(data?.error || `HTTP ${res.status}`);
          setGaiaStars([]);
        } else {
          const stars: GaiaLiveStar[] = Array.isArray(data.stars) ? data.stars : [];
          setGaiaStars(stars);
          if (gaiaOverlayActive) {
            onApplyGaiaOverlay(stars, true);
          }
        }
      } catch {
        setGaiaError("Could not reach Gaia DR3 TAP");
        setGaiaStars([]);
      } finally {
        setGaiaLoading(false);
      }
    },
    [gaiaOverlayActive, onApplyGaiaOverlay],
  );

  useImperativeHandle(
    ref,
    () => ({
      inspectAt(ra: number, dec: number) {
        if (open) {
          void runQuery(ra, dec, full100);
        }
      },
    }),
    [open, full100, runQuery],
  );

  useEffect(() => {
    if (open) {
      const { ra, dec } = getCenter();
      void runQuery(ra, dec, full100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const pts = spectrum?.points ?? [];
  const maxIntensity = Math.max(40, ...pts.map((p) => p.intensity));
  const chartW = 360;
  const chartH = 92;
  const wlMin = 0.75;
  const wlMax = 5.0;

  const toX = (wl: number) => 8 + ((wl - wlMin) / (wlMax - wlMin)) * (chartW - 16);
  const toY = (val: number) => chartH - 14 - (val / maxIntensity) * (chartH - 24);
  const poly = pts.map((p) => `${toX(p.wl).toFixed(1)},${toY(p.intensity).toFixed(1)}`).join(" ");

  return (
    <aside className="mv-glass mv-nasa-panel" aria-label="Live NASA & Astronomical Datasets">
      <div className="mv-nasa-head">
        <div>
          <span className="mv-nasa-kicker">NASA/IPAC IRSA · ESA Gaia DR3</span>
          <h3>Live Multi-Mission Inspector</h3>
        </div>
        <div className="mv-nasa-head-btns">
          <button
            type="button"
            className="mv-coord-btn"
            onClick={() => {
              const { ra, dec } = getCenter();
              void runQuery(ra, dec, full100);
            }}
            title="Sample live IRSA SPHEREx cube & Gaia DR3 at current map center"
          >
            ↻ Sample Center
          </button>
          <button type="button" className="mv-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
      </div>

      {target && (
        <div className="mv-nasa-coords">
          <span>Target J2000:</span>
          <code>{formatRaHMS(target.ra)}</code>
          <code>{formatDecDMS(target.dec)}</code>
          <span>
            ({target.ra.toFixed(3)}°, {target.dec >= 0 ? "+" : ""}
            {target.dec.toFixed(3)}°)
          </span>
          {spectrum && (
            <span className="mv-nasa-tile">
              Norder{spectrum.healpixOrder} · Npix{spectrum.healpixTile}
            </span>
          )}
        </div>
      )}

      {/* Multi-Telescope Base Survey Switcher (SPHEREx / WISE / 2MASS) */}
      <div className="mv-nasa-section">
        <div className="mv-nasa-sec-title">Multi-Telescope Survey Layer (IRSA HiPS)</div>
        <div className="mv-nasa-surveys" role="group" aria-label="Base infrared survey">
          <button
            type="button"
            className={currentLayer === "spherex" && currentBand < 0 ? "on" : ""}
            onClick={() => {
              onSelectLayer("spherex");
              onSelectBand(-1);
            }}
          >
            SPHEREx DR1 (0.75–5 µm)
          </button>
          <button
            type="button"
            className={currentLayer === "allwise" ? "on" : ""}
            onClick={() => onSelectLayer("allwise")}
          >
            AllWISE / WISE (3.4–22 µm)
          </button>
          <button
            type="button"
            className={currentLayer === "2mass" ? "on" : ""}
            onClick={() => onSelectLayer("2mass")}
          >
            2MASS (J/H/K)
          </button>
        </div>
      </div>

      {/* Live On-the-Fly SPHEREx DR1 Spectrum */}
      <div className="mv-nasa-section">
        <div className="mv-nasa-sec-row">
          <span className="mv-nasa-sec-title">
            On-the-Fly SPHEREx Spectrum {specLoading ? "· sampling IRSA…" : `(${pts.length} bands)`}
          </span>
          <button
            type="button"
            className="mv-nasa-mini-btn"
            disabled={specLoading}
            onClick={() => {
              const next = !full100;
              setFull100(next);
              const pos = target ?? getCenter();
              void runQuery(pos.ra, pos.dec, next);
            }}
          >
            {full100 ? "Fast 28ch" : "Full 100ch"}
          </button>
        </div>

        <svg
          className="mv-nasa-chart"
          viewBox={`0 0 ${chartW} ${chartH}`}
          role="img"
          aria-label="SPHEREx infrared spectrum from 0.75 to 5.0 micrometers"
        >
          {/* Dichroic gap at 2.42 µm (frames 50-51) */}
          <rect
            x={toX(2.39)}
            y={6}
            width={Math.max(3, toX(2.46) - toX(2.39))}
            height={chartH - 20}
            className="mv-nasa-gap"
          />
          {pts.length > 1 && <polyline points={poly} className="mv-nasa-line" />}
          {pts.map((p) => {
            const cx = toX(p.wl);
            const cy = toY(p.intensity);
            const selected = currentLayer === "spherex" && currentBand === p.frame;
            return (
              <circle
                key={p.frame}
                cx={cx}
                cy={cy}
                r={selected ? 4 : 2.3}
                className={`mv-nasa-pt ${selected ? "on" : ""}`}
                onClick={() => onSelectBand(p.frame)}
              >
                <title>
                  Ch {p.frame + 1} · {p.wl.toFixed(3)} µm · DN {p.intensity} (click to isolate band)
                </title>
              </circle>
            );
          })}
          <text x={8} y={chartH - 2} className="mv-nasa-axis">
            0.75 µm
          </text>
          <text x={toX(2.42) - 18} y={chartH - 2} className="mv-nasa-axis">
            2.4 µm split
          </text>
          <text x={chartW - 42} y={chartH - 2} className="mv-nasa-axis">
            5.0 µm
          </text>
        </svg>

        {/* 6 Detector Array Coadds */}
        {spectrum && (
          <div className="mv-nasa-coadds">
            {spectrum.coadds.map((arr) => {
              const active =
                currentLayer === "spherex" && currentBand === arr.representativeFrame;
              const pct = Math.min(100, Math.round((arr.meanIntensity / 255) * 100));
              return (
                <button
                  key={arr.id}
                  type="button"
                  className={`mv-nasa-coadd ${active ? "on" : ""}`}
                  onClick={() => onSelectBand(arr.representativeFrame)}
                  title={`Click to isolate ${arr.name} center band (${SPHEREX_WL[arr.representativeFrame].toFixed(2)} µm)`}
                >
                  <div className="mv-nasa-coadd-top">
                    <b>{arr.name}</b>
                    <span>{arr.meanIntensity}</span>
                  </div>
                  <small>{arr.range}</small>
                  <div className="mv-nasa-bar">
                    <div style={{ width: `${pct}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Contamination & Saturation Metadata Flags */}
        {spectrum && (
          <div className="mv-nasa-flags">
            {spectrum.flags.map((f) => (
              <span key={f.code} className={`mv-nasa-flag ${f.severity}`} title={f.label}>
                <b>{f.code}</b> {f.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Live Gaia DR3 Proper Motion & Distance Cross-Match */}
      <div className="mv-nasa-section">
        <div className="mv-nasa-sec-row">
          <span className="mv-nasa-sec-title">
            Gaia DR3 Sources (9′ cone) {gaiaLoading ? "· querying TAP…" : `(${gaiaStars.length})`}
          </span>
          <button
            type="button"
            className={`mv-nasa-mini-btn ${gaiaOverlayActive ? "on" : ""}`}
            disabled={!gaiaStars.length && !gaiaOverlayActive}
            onClick={() => onApplyGaiaOverlay(gaiaStars, !gaiaOverlayActive)}
          >
            {gaiaOverlayActive ? "✓ Plotted on Map" : "Plot on Map"}
          </button>
        </div>

        {gaiaError && <div className="mv-nasa-empty">{gaiaError}</div>}
        {!gaiaError && !gaiaLoading && gaiaStars.length === 0 && (
          <div className="mv-nasa-empty">No bright Gaia DR3 sources within 9 arcmin.</div>
        )}

        {gaiaStars.length > 0 && (
          <div className="mv-nasa-table-wrap">
            <table className="mv-nasa-table">
              <thead>
                <tr>
                  <th>Gaia DR3 ID</th>
                  <th>G mag</th>
                  <th>Dist</th>
                  <th>PM (mas/yr)</th>
                </tr>
              </thead>
              <tbody>
                {gaiaStars.slice(0, 10).map((s) => {
                  const fast = s.pmTotal >= 50;
                  return (
                    <tr
                      key={s.id}
                      className={fast ? "fast" : ""}
                      onClick={() =>
                        onJump(s.ra, s.dec, 0.8, `Gaia ${s.id.slice(-6)} (${s.pmTotal} mas/yr)`)
                      }
                      title="Click to fly to this Gaia DR3 source"
                    >
                      <td>…{s.id.slice(-8)}</td>
                      <td>{s.mag.toFixed(1)}</td>
                      <td>{s.distLy ? `${s.distLy} ly` : "—"}</td>
                      <td>
                        {s.pmTotal.toFixed(1)} {fast ? "⚡" : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </aside>
  );
});

export default NasaDataPanel;
