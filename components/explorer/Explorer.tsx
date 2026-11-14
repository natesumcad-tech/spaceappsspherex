"use client";

import { useEffect, useRef, useState } from "react";
import { LANDMARKS, SECTIONS, byId } from "@/lib/explorer/landmarks";
import type { SkyEngine } from "@/lib/explorer/engine";
import type { SkyData } from "@/lib/explorer/astro";

const LANGS = [
  ["en", "English"],
  ["es", "Español"],
  ["fr", "Français"],
  ["zh", "中文"],
  ["hi", "हिन्दी"],
  ["ar", "العربية"],
] as const;

const FLY_KINDS = ["orbit", "planet", "star", "galaxy"];

/**
 * The 360° sphere view, shown inside the Star Map page. The parent owns which stop is open
 * (`stopId`) and is told when the viewer wants another stop or wants to go back to the map.
 */
export default function SphereView({ stopId, onStop, onExit }: { stopId: string; onStop: (id: string) => void; onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SkyEngine | null>(null);
  const shown = useRef<string | null>(null);
  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleId, setVisibleId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [lang, setLang] = useState("en");
  const [toast, setToast] = useState<string | null>(null);

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
        engine = new SkyEngine(canvasRef.current!, labelsRef.current!, fadeRef.current!, { onNavigate: (id) => onStopRef.current(id) });
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
  const canFly = !!current && FLY_KINDS.includes(current.kind);

  const exportPng = async () => {
    if (!current) return;
    const blob = await engineRef.current!.exportPNG(`Planet X & SPHEREx · ${current.title}`);
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `spherex-${current.id}.png` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    flash("Image saved");
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
          <button className="xp-iconbtn primary" onClick={exportPng} disabled={!ready}>
            PNG
          </button>
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
            <section className="xp-card" aria-live="polite">
              <p className="xp-eyebrow">{idx >= 0 ? `Stop ${idx + 1} of ${LANDMARKS.length} · ${current.section}` : current.section}</p>
              <h1>{current.title}</h1>
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
              {current.patch && <p className="xp-credit">Background imagery: SPHEREx DR1 (NASA/JPL-Caltech), streamed from IRSA.</p>}
              {prev && next && (
                <div className="xp-nav">
                  <button onClick={() => onStop(prev.id)}>← {prev.title}</button>
                  <button onClick={() => onStop(next.id)}>{next.title} →</button>
                </div>
              )}
              <button className="xp-back" onClick={onExit}>
                Back to the map (Esc)
              </button>
            </section>
            <div className="xp-hint top">
              {canFly ? (
                <>
                  <kbd>W</kbd>
                  <kbd>A</kbd>
                  <kbd>S</kbd>
                  <kbd>D</kbd> fly · <kbd>Q</kbd>
                  <kbd>E</kbd> down/up · <kbd>Shift</kbd> faster · <kbd>R</kbd> reset · drag to look
                </>
              ) : (
                <>
                  Drag or <kbd>W</kbd>
                  <kbd>A</kbd>
                  <kbd>S</kbd>
                  <kbd>D</kbd> to look around · click a name with ↗ to travel there
                </>
              )}
            </div>
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
