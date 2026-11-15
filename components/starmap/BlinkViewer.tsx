"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Blink } from "@/lib/spherex/blink";
import { useLang, useT } from "@/lib/i18n";

export type FeaturedBlink = Blink & { title?: string; story?: string };
type Mode = "blink" | "a" | "b" | "diff";

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const day = (iso: string, locale = "en-US") => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const um = (a: number, b: number) => `${a.toFixed(2)}–${b.toFixed(2)} µm`;

/** Paint 8-bit brightness (0 = not covered) as a warm infrared tint, or a difference as orange/cyan. */
function paint(px: Uint8Array, n: number, diff: boolean) {
  const img = new ImageData(n, n);
  for (let k = 0; k < px.length; k++) {
    const v = px[k], o = k * 4;
    if (v === 0) {
      img.data.set([12, 11, 9, 255], o); // no data here
    } else if (!diff) {
      const t = (v - 1) / 254;
      img.data.set([Math.min(255, 22 + 255 * t * 1.05), Math.min(255, 18 + 238 * t), Math.min(255, 16 + 205 * t ** 1.15), 255], o);
    } else {
      const d = (v - 128) / 127; // + appeared in the later pass, − was only in the earlier one
      const a = Math.min(1, Math.abs(d) * 2.2);
      img.data.set(d >= 0 ? [40 + 60 * a, 40 + 190 * a, 44 + 200 * a, 255] : [44 + 210 * a, 40 + 120 * a, 36 + 20 * a, 255], o);
    }
  }
  return img;
}

/**
 * Blinks two real SPHEREx exposures of the same spot taken about six months apart. Stars stay put;
 * anything in our solar system appears to jump. Planets are ringed where their orbits put them.
 */
export default function BlinkViewer({
  data,
  loading,
  error,
  onClose,
  onRetry,
  onFeatured,
  onData,
}: {
  data: FeaturedBlink | null;
  loading: { label: string; since: number } | null;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
  onFeatured: () => void;
  onData: (ra: number, dec: number) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const loc = lang === "es" ? "es-ES" : "en-US";
  const [mode, setMode] = useState<Mode>("blink");
  const [frame, setFrame] = useState(0);
  const [fast, setFast] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);

  const frames = useMemo(() => {
    if (!data) return null;
    const n = data.n;
    return { a: paint(b64(data.passes[0].img), n, false), b: paint(b64(data.passes[1].img), n, false), d: paint(b64(data.diff), n, true) };
  }, [data]);

  useEffect(() => {
    setMode("blink");
    setFrame(0);
  }, [data]);

  // Flip between the passes
  useEffect(() => {
    if (mode !== "blink" || !data) return;
    const t = setInterval(() => setFrame((f) => 1 - f), fast ? 380 : 800);
    return () => clearInterval(t);
  }, [mode, fast, data]);

  // Tell the rest of the page someone watched a real blink (the rescue mission listens)
  useEffect(() => {
    if (data && frame === 1) window.dispatchEvent(new CustomEvent("spherex-blink", { detail: { featured: !!data.title } }));
  }, [data, frame]);

  const shown: 0 | 1 | "diff" = mode === "diff" ? "diff" : mode === "a" ? 0 : mode === "b" ? 1 : (frame as 0 | 1);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !frames || !data) return;
    c.width = c.height = data.n;
    c.getContext("2d")!.putImageData(shown === "diff" ? frames.d : shown === 0 ? frames.a : frames.b, 0, 0);
  }, [frames, shown, data]);

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setElapsed(Math.round((performance.now() - loading.since) / 1000)), 500);
    return () => clearInterval(t);
  }, [loading]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Planets: ring them where they are in this pass; if one was here in the other pass but has left, point to it
  const overlay = useMemo(() => {
    if (!data || shown === "diff") return [];
    const n = data.n, scale = data.size / n;
    const here = data.passes[shown].bodies, other = data.passes[1 - shown].bodies;
    const out: { kind: "ring" | "gone"; name: string; x: number; y: number; angle?: number; moved?: number }[] = [];
    for (const b of here) {
      const o = other.find((x) => x.name === b.name);
      if (b.inFrame) out.push({ kind: "ring", name: b.name, x: b.x, y: b.y });
      else if (o?.inFrame) {
        const c = (n - 1) / 2, dx = b.x - c, dy = b.y - c, ang = Math.atan2(dy, dx);
        const k = Math.min((c - 22) / Math.abs(Math.cos(ang) || 1e-6), (c - 22) / Math.abs(Math.sin(ang) || 1e-6));
        out.push({ kind: "gone", name: b.name, x: c + Math.cos(ang) * k, y: c + Math.sin(ang) * k, angle: ang, moved: Math.hypot(b.x - o.x, b.y - o.y) * scale });
      }
    }
    return out;
  }, [data, shown]);

  const pass = data && shown !== "diff" ? data.passes[shown] : null;

  return (
    <div className="bk-wrap" role="dialog" aria-label={t("Blink · real SPHEREx passes")}>
      <div className="bk-card">
        <div className="bk-head">
          <div>
            <span className="bk-kicker">{t("Blink · real SPHEREx passes")}</span>
            <h2>{t(data?.title ?? (data ? "This patch of sky, six months apart" : "Blink two SPHEREx passes"))}</h2>
          </div>
          <button className="bk-x" onClick={onClose} aria-label={t("Close the blink viewer")}>
            ×
          </button>
        </div>

        {loading && (
          <div className="bk-state">
            <div className="bk-spin" aria-hidden="true" />
            <p>
              {loading.label}
              <br />
              <small>{t("Asking NASA/IPAC IRSA for SPHEREx exposures of this spot · {s}s (usually 20–40 s)", { s: elapsed })}</small>
            </p>
          </div>
        )}

        {error && !loading && (
          <div className="bk-state">
            <p>{t(error)}</p>
            <div className="bk-row">
              <button className="bk-btn" onClick={onRetry}>
                {t("Try again")}
              </button>
              <button className="bk-btn dark" onClick={onFeatured}>
                {t("Show the featured blink")}
              </button>
            </div>
          </div>
        )}

        {data && !loading && (
          <>
            {data.story && <p className="bk-story">{t(data.story)}</p>}
            <div className="bk-stage">
              <canvas ref={canvas} className="bk-canvas" />
              <svg className="bk-marks" viewBox={`0 0 ${data.n} ${data.n}`} aria-hidden="true">
                {overlay.map((m) =>
                  m.kind === "ring" ? (
                    <g key={m.name}>
                      <circle cx={m.x} cy={m.y} r={data.n * 0.055} className="bk-ring" />
                      <text x={m.x + data.n * 0.065} y={m.y + 4} className="bk-label">
                        {m.name}
                      </text>
                    </g>
                  ) : (
                    <g key={m.name} transform={`translate(${m.x} ${m.y}) rotate(${((m.angle ?? 0) * 180) / Math.PI})`}>
                      <path d="M-14 0 L8 0 M1 -7 L9 0 L1 7" className="bk-gone" />
                    </g>
                  ),
                )}
              </svg>
              {overlay
                .filter((m) => m.kind === "gone")
                .map((m) => (
                  <span key={m.name} className={`bk-gone-label ${m.x > data.n / 2 ? "right" : ""}`} style={{ left: `${(m.x / data.n) * 100}%`, top: `${(m.y / data.n) * 100}%` }}>
                    {t("{name} has moved {deg}° this way", { name: t(m.name), deg: lang === "es" ? m.moved!.toFixed(1).replace(".", ",") : m.moved!.toFixed(1) })}
                  </span>
                ))}
              <span className="bk-stamp">{shown === "diff" ? t("Difference: later − earlier") : day(pass!.date, loc)}</span>
            </div>

            <div className="bk-controls" role="group" aria-label={t("What to show")}>
              {(
                [
                  ["blink", mode === "blink" && frame === 0 ? "▶ Blinking" : "▶ Blink"],
                  ["a", day(data.passes[0].date, loc)],
                  ["b", day(data.passes[1].date, loc)],
                  ["diff", t("Difference")],
                ] as [Mode, string][]
              ).map(([m, label]) => (
                <button key={m} className={`bk-seg ${mode === m ? "on" : ""}`} onClick={() => setMode(m)} aria-pressed={mode === m}>
                  {m === "blink" ? (mode === "blink" ? t("⏸ Blinking") : t("▶ Blink")) : label}
                </button>
              ))}
              <button className="bk-seg" onClick={() => setFast((f) => !f)} title={t("Blink speed")}>
                {fast ? "2×" : "1×"}
              </button>
            </div>

            <p className="bk-note">
              {shown === "diff"
                ? t("Orange: only in the earlier pass (something left). Cyan: only in the later one (something arrived). Most stars cancel out; leftover specks are faint stars and noise that differ between the two exposures.")
                : t("Stars stay put between passes. Anything in our solar system shifts, because Earth has moved halfway around the Sun. A Planet X far beyond Neptune would shift too, just less.")}
            </p>
            <dl className="bk-meta">
              {data.passes.slice(0, 2).map((p, k) => (
                <div key={k}>
                  <dt>{k === 0 ? t("Earlier pass") : t("Later pass")}</dt>
                  <dd>
                    {day(p.date, loc)} · {um(p.umMin, p.umMax)}
                  </dd>
                </div>
              ))}
              <div>
                <dt>{t("Field")}</dt>
                <dd>
                  {t("{size}° wide at RA {ra}h, Dec {dec}°", { size: data.size.toFixed(1), ra: (data.ra / 15).toFixed(2), dec: `${data.dec >= 0 ? "+" : "−"}${Math.abs(data.dec).toFixed(2)}` })}
                </dd>
              </div>
            </dl>
            <p className="bk-source">
              <b>{t("Real data")}</b> {t("SPHEREx DR1 Level 2 images (NASA/JPL-Caltech) from NASA/IPAC IRSA · planet positions from their orbits (JPL elements) ·")}{" "}
              <button className="bk-link" onClick={() => onData(data.ra, data.dec)}>
                {t("download these images")}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
