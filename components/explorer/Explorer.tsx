"use client";

import { useEffect, useRef, useState } from "react";
import { LANDMARKS, SECTIONS, byId } from "@/lib/explorer/landmarks";
import type { NavMode, NavState, SkyEngine } from "@/lib/explorer/engine";
import type { SkyData } from "@/lib/explorer/astro";
import Collapsible from "@/components/ui/Collapsible";

const LANGS = [
  ["en", "English"],
  ["es", "Español"],
  ["fr", "Français"],
  ["zh", "中文"],
  ["hi", "हिन्दी"],
  ["ar", "العربية"],
] as const;


/**
 * The 360° sphere view, shown inside the Star Map page. The parent owns which stop is open
 * (`stopId`) and is told when the viewer wants another stop or wants to go back to the map.
 */
export default function SphereView({ stopId, onStop, onExit, onAsk }: { onAsk?: (name: string) => void; stopId: string; onStop: (id: string) => void; onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SkyEngine | null>(null);
  const shown = useRef<string | null>(null);
  const onAskRef = useRef(onAsk);
  onAskRef.current = onAsk;
  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleId, setVisibleId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [lang, setLang] = useState("en");
  const [toast, setToast] = useState<string | null>(null);
  const [nav, setNav] = useState<NavState | null>(null);
  const [hintHidden, setHintHidden] = useState(false);
  useEffect(() => {
    try {
      setHintHidden(localStorage.getItem("ui.hint.hidden") === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);
  const hideHint = () => {
    setHintHidden(true);
    try {
      localStorage.setItem("ui.hint.hidden", "1");
    } catch {
      /* storage unavailable */
    }
  };

  // Start the engine once
  useEffect(() => {
    let engine: SkyEngine | null = null;
    let cancelled = false;
    (async () => {
      try {
        const [{ SkyEngine }, data] = await Promise.all([
          import("@/lib/explorer/engine"),
          fetch("/data/sky.json").then((r) => r.json() as Promise<SkyData>),
        ]);
        if (cancelled) return;
        engine = new SkyEngine(canvasRef.current!, labelsRef.current!, fadeRef.current!, { onAsk: (name) => onAskRef.current?.(name), onNavigate: (id) => onStopRef.current(id), onNav: setNav, onExit: () => onExitRef.current() });
        engineRef.current = engine;
        engine.init(data);
        setReady(true);
      } catch (e) {
        console.error(e);
        setError("Your browser couldn't start the 3D view. Try a recent version of Chrome, Edge, Firefox or Safari.");
      }
    })();
    return () => {
      cancelled = true;
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Walk to whichever stop the parent asks for
  useEffect(() => {
    const engine = engineRef.current;
    if (!ready || !engine || shown.current === stopId || !byId(stopId)) return;
    shown.current = stopId;
    engine.enter(stopId, () => setVisibleId(stopId));
  }, [stopId, ready]);

  useEffect(() => engineRef.current?.setToggles(showLabels, showLines), [showLabels, showLines]);
  useEffect(() => engineRef.current?.setLanguage(lang), [lang]);

  // Keep hotspot cards from opening underneath the info card
  useEffect(() => {
    const card = document.querySelector<HTMLElement>(".xp-card");
    const stage = canvasRef.current?.parentElement;
    const engine = engineRef.current;
    if (!card || !stage || !engine) return;
    const measure = () => {
      const c = card.getBoundingClientRect(), st = stage.getBoundingClientRect();
      const side = c.width < st.width * 0.7;
      engine.safeArea = side ? { right: st.right - c.left + 8, bottom: 0 } : { right: 0, bottom: st.bottom - c.top + 8 };
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(card);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [visibleId]);

  // Esc goes back to the map
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onExit();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const current = visibleId ? byId(visibleId) : null;
  const idx = current ? LANDMARKS.indexOf(current) : -1;
  const prev = idx >= 0 ? LANDMARKS[(idx - 1 + LANDMARKS.length) % LANDMARKS.length] : null;
  const next = idx >= 0 ? LANDMARKS[(idx + 1) % LANDMARKS.length] : null;

  // Precache adjacent landmark assets during idle time for smoother transitions
  useEffect(() => {
    if (!ready) return;
    const targets = [prev, next].filter((l): l is NonNullable<typeof l> => Boolean(l));
    const run = () => {
      for (const lm of targets) {
        const imgUrl = (lm as { image?: string }).image;
        if (imgUrl) {
          const img = new Image();
          img.src = imgUrl;
        }
      }
    };
    const id = "requestIdleCallback" in window ? window.requestIdleCallback(run) : setTimeout(run, 300);
    return () => {
      if ("cancelIdleCallback" in window && typeof id === "number") window.cancelIdleCallback(id);
      else clearTimeout(id as ReturnType<typeof setTimeout>);
    };
  }, [ready, prev, next]);

  const exportImage = async (format: "png" | "jpg" | "webp") => {
    if (!current) return;
    const pngBlob = await engineRef.current!.exportPNG(`Planet X & SPHEREx · ${current.title}`);
    let outBlob: Blob = pngBlob;

    if (format !== "png") {
      const bitmap = await createImageBitmap(pngBlob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d")!;
      if (format === "jpg") {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const mime = format === "jpg" ? "image/jpeg" : "image/webp";
      outBlob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b ?? pngBlob), mime, 0.92)
      );
    }

    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(outBlob),
      download: `spherex-${current.id}.${format}`,
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    flash(`Saved ${format.toUpperCase()}`);
  };
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      flash("Link copied");
    } catch {
      flash("Copy the address bar to share this view");
    }
  };

  return (
    <div className="xp">
      <div className="xp-stage">
        <canvas ref={canvasRef} className="xp-canvas" />
        <div ref={labelsRef} className="xp-labels" />
        <div ref={fadeRef} className="xp-fade" style={{ opacity: 1 }} />
        {!ready && !error && <div className="xp-loading">Stepping inside…</div>}
        {error && <div className="xp-loading">{error}</div>}

        <div className="xp-toolbar">
          <button className="xp-iconbtn" onClick={() => setPanelOpen((o) => !o)} aria-expanded={panelOpen} aria-controls="xp-panel">
            ☰ <span className="xp-hide-sm">Stops</span>
          </button>
          <label className="xp-check xp-hide-sm">
            <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Labels
          </label>
          <label className="xp-check xp-hide-sm">
            <input type="checkbox" checked={showLines} onChange={(e) => setShowLines(e.target.checked)} /> Lines
          </label>
          <select className="xp-select" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Star name language">
            {LANGS.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
          <button className="xp-iconbtn xp-hide-sm" onClick={share} disabled={!ready}>
            Share
          </button>
          <select
            className="xp-iconbtn primary"
            aria-label="Export view as image"
            defaultValue=""
            disabled={!ready}
            onChange={(e) => {
              const fmt = e.target.value as "png" | "jpg" | "webp" | "";
              if (fmt) {
                exportImage(fmt);
                e.target.value = "";
              }
            }}
          >
            <option value="" disabled>
              Export ▾
            </option>
            <option value="png">Export PNG</option>
            <option value="jpg">Export JPG</option>
            <option value="webp">Export WEBP</option>
          </select>
        </div>

        <aside id="xp-panel" className={`xp-panel ${panelOpen ? "open" : ""}`}>
          {SECTIONS.map((section) => (
            <div key={section} className="xp-section">
              <h2>{section}</h2>
              <ol>
                {LANDMARKS.filter((l) => l.section === section).map((l) => (
                  <li key={l.id}>
                    <button
                      className={`xp-stop ${l.id === visibleId ? "active" : ""} ${l.id === hoverId ? "hover" : ""}`}
                      onClick={() => {
                        if (window.innerWidth < 1100) setPanelOpen(false);
                        onStop(l.id);
                      }}
                      onPointerEnter={() => setHoverId(l.id)}
                      onPointerLeave={() => setHoverId(null)}
                      disabled={!ready}
                    >
                      <span className="xp-num">{LANDMARKS.indexOf(l) + 1}</span>
                      <span>
                        <span className="xp-stop-title">{l.title}</span>
                        <span className="xp-stop-sub">{l.subtitle}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </aside>

        {ready && current && (
          <>
            <Collapsible
              id="sphere-info"
              className="xp-card"
              title={
                <>
                  <p className="xp-eyebrow">{idx >= 0 ? `Stop ${idx + 1} of ${LANDMARKS.length} · ${current.section}` : current.section}</p>
                  <h1>{current.title}</h1>
                </>
              }
            >
              <p className="xp-sub">{current.subtitle}</p>
              <p>{current.description}</p>
              <dl className="xp-facts">
                {current.facts.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="xp-spherex">
                <b>SPHEREx link:</b> {current.spherex}
              </p>
              {current.patch && <p className="xp-credit">Background imagery: real SPHEREx DR1 data (NASA/JPL-Caltech), streamed from IRSA and shown as a flat image.</p>}
              {(current.kind === "planet" || current.kind === "orbit") && <p className="xp-credit">Illustration: planet surfaces in these views are artist&apos;s impressions, not photographs.</p>}
              {current.kind === "star" && <p className="xp-credit">Illustration: the star&apos;s surface is an artist&apos;s impression.</p>}
              {current.kind === "galaxy" && <p className="xp-credit">Illustration of the galaxy&apos;s shape, not a photograph.</p>}
              {current.kind === "constellation" && <p className="xp-credit">Star positions and distances: HYG catalogue (real data).</p>}
              {prev && next && (
                <div className="xp-nav">
                  <button onClick={() => onStop(prev.id)}>← {prev.title}</button>
                  <button onClick={() => onStop(next.id)}>{next.title} →</button>
                </div>
              )}
              {onAsk && <button className="xp-back" onClick={() => onAsk(current.title)}>Ask about {current.title}</button>}
              <button className="xp-back" onClick={onExit}>
                Back to the map (Esc)
              </button>
            </Collapsible>
            {!hintHidden && (
            <div className="xp-hint top">
              {nav?.mode === "orbit" ? (
                <>
                  Drag or <kbd>A</kbd>
                  <kbd>D</kbd> to go around · <kbd>W</kbd>
                  <kbd>S</kbd> closer/farther · <kbd>Q</kbd>
                  <kbd>E</kbd> lower/higher · scroll to zoom
                </>
              ) : nav?.mode === "fly" ? (
                <>
                  <kbd>W</kbd>
                  <kbd>A</kbd>
                  <kbd>S</kbd>
                  <kbd>D</kbd> fly · <kbd>Q</kbd>
                  <kbd>E</kbd> down/up · <kbd>Shift</kbd> faster · drag to look · <kbd>R</kbd> back to start
                </>
              ) : (
                <>
                  Drag or <kbd>W</kbd>
                  <kbd>A</kbd>
                  <kbd>S</kbd>
                  <kbd>D</kbd> to look around · click a name with ↗ to travel there
                </>
              )}
              <span> · Scroll out fully to return to the map</span>
              <button className="xp-hint-x" onClick={hideHint} aria-label="Hide key hints">
                ×
              </button>
            </div>
            )}
            {nav && (
              <MoveControls nav={nav} engine={engineRef.current} constellation={current.kind === "constellation"} />
            )}
            <div className="xp-zoom">
              <button onClick={() => engineRef.current?.zoom(0.8)} aria-label="Zoom in">
                +
              </button>
              <button onClick={() => engineRef.current?.zoom(1.25)} aria-label="Zoom out">
                −
              </button>
            </div>
          </>
        )}
        {toast && <div className="xp-toast">{toast}</div>}
      </div>
    </div>
  );
}

// ───────────────────────── Movement controls ─────────────────────────

const MODES: [NavMode, string][] = [
  ["look", "Look"],
  ["orbit", "Orbit"],
  ["fly", "Free fly"],
];

/**
 * Mode switch, plus a ring and two sliders. In Orbit they travel around the object (ring = around,
 * height, distance); in Look and Free fly they turn you on the spot (ring = heading, height = tilt, zoom).
 */
function MoveControls({ nav, engine, constellation }: { nav: NavState; engine: SkyEngine | null; constellation: boolean }) {
  const ring = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const R = 50;
  // Wherever there's something to go around, the ring travels around it (switching to Orbit);
  // otherwise (and in Free fly) it turns you on the spot.
  const orbiting = nav.canOrbit && nav.mode !== "fly";
  const toAz = (e: React.PointerEvent) => {
    const r = ring.current!.getBoundingClientRect();
    return Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2)));
  };
  // Clockwise on the ring = turn right, which is a smaller yaw
  const setRing = (a: number) => (orbiting ? engine?.setOrbit({ az: a }) : engine?.setLook({ yaw: -a }));
  // Distance / zoom sliders are logarithmic
  const logR = (r: number) => Math.log(r / nav.rMin) / Math.log(nav.rMax / nav.rMin);
  const logF = (f: number) => 1 - Math.log(f / nav.fovMin) / Math.log(100 / nav.fovMin);
  const az = orbiting ? nav.az : -nav.yaw;
  const kx = 60 + Math.sin(az) * R, ky = 60 - Math.cos(az) * R;
  return (
    <Collapsible id="sphere-move" className="xp-move" title={<span className="cl-label">Move</span>} summary={MODES.find(([m]) => m === nav.mode)?.[1]}>
      <div className="xp-move-seg" role="radiogroup" aria-label="How to move">
        {MODES.filter(([m]) => m === "look" || (m === "orbit" ? nav.canOrbit : nav.canFly)).map(([m, label]) => (
          <button key={m} role="radio" aria-checked={nav.mode === m} onClick={() => engine?.setNavMode(m)}>
            {label}
          </button>
        ))}
      </div>
      {(
        <div className="xp-ring-row">
          <svg
            ref={ring}
            viewBox="0 0 120 120"
            className={`xp-ring ${nav.mode === "orbit" ? "on" : ""}`}
            role="slider"
            aria-label={orbiting ? "Travel around" : "Turn around"}
            aria-valuemin={-180}
            aria-valuemax={180}
            aria-valuenow={Math.round((az * 180) / Math.PI)}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setRing(az - 0.15);
              if (e.key === "ArrowRight") setRing(az + 0.15);
            }}
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture(e.pointerId);
              dragging.current = true;
              setRing(toAz(e));
            }}
            onPointerMove={(e) => dragging.current && setRing(toAz(e))}
            onPointerUp={() => (dragging.current = false)}
            onPointerCancel={() => (dragging.current = false)}
          >
            <circle cx="60" cy="60" r={R} className="xp-ring-track" />
            {Array.from({ length: 24 }, (_, i) => {
              const a = (i / 24) * Math.PI * 2;
              return <line key={i} x1={60 + Math.sin(a) * (R - 5)} y1={60 - Math.cos(a) * (R - 5)} x2={60 + Math.sin(a) * (R + 5)} y2={60 - Math.cos(a) * (R + 5)} className="xp-ring-tick" />;
            })}
            <circle cx="60" cy="60" r="9" className="xp-ring-core" />
            <line x1="60" y1="60" x2={kx} y2={ky} className="xp-ring-arm" />
            <circle cx={kx} cy={ky} r="9" className="xp-ring-knob" />
          </svg>
          <div className="xp-sliders">
            <label>
              <span>{orbiting ? "Height" : "Tilt"}</span>
              <input
                type="range"
                min={-85}
                max={85}
                value={Math.round(((orbiting ? nav.el : nav.pitch) * 180) / Math.PI)}
                onChange={(e) => {
                  const v = (+e.target.value * Math.PI) / 180;
                  if (orbiting) engine?.setOrbit({ el: v });
                  else engine?.setLook({ pitch: v });
                }}
              />
            </label>
            <label>
              <span>{orbiting ? "Distance" : "Zoom"}</span>
              <input
                type="range"
                min={0}
                max={1000}
                value={Math.round((orbiting ? logR(nav.r) : logF(nav.fov)) * 1000)}
                onChange={(e) => {
                  const t = +e.target.value / 1000;
                  if (orbiting) engine?.setOrbit({ r: nav.rMin * Math.pow(nav.rMax / nav.rMin, t) });
                  else engine?.setLook({ fov: nav.fovMin * Math.pow(100 / nav.fovMin, 1 - t) });
                }}
              />
            </label>
          </div>
        </div>
      )}
      {constellation && (
        <p className="xp-move-note">
          {nav.away
            ? "You've left the Sun: these stars are at their real distances, so the familiar shape has come apart."
            : "From Earth these stars look like a flat pattern. Orbit or fly away to see their real distances."}
        </p>
      )}
    </Collapsible>
  );
}
