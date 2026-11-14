"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LANDMARKS, SECTIONS, byId } from "@/lib/explorer/landmarks";
import type { Mode, SkyEngine } from "@/lib/explorer/engine";

const LANGS = [
  ["en", "English"],
  ["es", "Español"],
  ["fr", "Français"],
  ["zh", "中文"],
  ["hi", "हिन्दी"],
  ["ar", "العربية"],
] as const;

export default function Explorer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SkyEngine | null>(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("map");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [lang, setLang] = useState("en");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let engine: SkyEngine | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { SkyEngine } = await import("@/lib/explorer/engine");
        if (cancelled) return;
        engine = new SkyEngine(canvasRef.current!, labelsRef.current!, fadeRef.current!, {
          onModeChange: (m, id) => {
            setMode(m);
            setCurrentId(id);
            const url = new URL(window.location.href);
            if (m === "sphere" && id) url.searchParams.set("stop", id);
            else url.searchParams.delete("stop");
            window.history.replaceState(null, "", url);
          },
          onHover: setHoverId,
        });
        engineRef.current = engine;
        await engine.init("/data/sky.json");
        if (cancelled) return;
        setReady(true);
        if (window.innerWidth < 800) setPanelOpen(false);
        const stop = new URL(window.location.href).searchParams.get("stop");
        if (stop && byId(stop)) engine.select(stop);
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

  useEffect(() => engineRef.current?.setToggles(showLabels, showLines), [showLabels, showLines]);
  useEffect(() => engineRef.current?.setLanguage(lang), [lang]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const go = useCallback((id: string) => {
    engineRef.current?.select(id);
    if (window.innerWidth < 800) setPanelOpen(false);
  }, []);

  const exportPng = async () => {
    const e = engineRef.current;
    if (!e) return;
    const title = mode === "sphere" && current ? current.title : "Map of the tour";
    const blob = await e.exportPNG(`Planet X & SPHEREx Explorer · ${title}`);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `spherex-explorer-${mode === "sphere" && current ? current.id : "map"}.png`;
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

  const current = currentId ? byId(currentId) : null;
  const idx = current ? LANDMARKS.indexOf(current) : -1;
  const prev = idx >= 0 ? LANDMARKS[(idx - 1 + LANDMARKS.length) % LANDMARKS.length] : null;
  const next = idx >= 0 ? LANDMARKS[(idx + 1) % LANDMARKS.length] : null;
  const hover = hoverId ? byId(hoverId) : null;

  return (
    <div className="xp">
      <header className="xp-bar">
        <Link href="/" className="xp-home" aria-label="Back to home">
          ←
        </Link>
        <button className="xp-iconbtn" onClick={() => setPanelOpen((o) => !o)} aria-expanded={panelOpen} aria-controls="xp-panel">
          ☰ <span className="xp-hide-sm">Stops</span>
        </button>
        <div className="xp-title">
          <strong>Sky Explorer</strong>
          <span className="xp-hide-sm"> · Planet X & SPHEREx</span>
        </div>
        <div className="xp-seg" role="tablist" aria-label="View">
          <button role="tab" aria-selected={mode === "map"} onClick={() => engineRef.current?.showMap()} disabled={!ready}>
            Map
          </button>
          <button
            role="tab"
            aria-selected={mode === "sphere"}
            onClick={() => engineRef.current?.select(currentId ?? LANDMARKS[0].id)}
            disabled={!ready}
          >
            Sphere
          </button>
        </div>
        <div className="xp-tools">
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
          <button className="xp-iconbtn" onClick={share} disabled={!ready} title="Copy a link to this view">
            Share
          </button>
          <button className="xp-iconbtn primary" onClick={exportPng} disabled={!ready} title="Download this view as a PNG">
            PNG
          </button>
        </div>
      </header>

      <div className="xp-stage">
        <canvas ref={canvasRef} className="xp-canvas" />
        <div ref={labelsRef} className="xp-labels" aria-hidden="true" />
        <div ref={fadeRef} className="xp-fade" />

        {!ready && !error && <div className="xp-loading">Loading 25,000 stars…</div>}
        {error && <div className="xp-loading">{error}</div>}

        <aside id="xp-panel" className={`xp-panel ${panelOpen ? "open" : ""}`}>
          {SECTIONS.map((section) => (
            <div key={section} className="xp-section">
              <h2>{section}</h2>
              <ol>
                {LANDMARKS.filter((l) => l.section === section).map((l) => (
                  <li key={l.id}>
                    <button
                      className={`xp-stop ${l.id === currentId ? "active" : ""} ${l.id === hoverId ? "hover" : ""}`}
                      onClick={() => go(l.id)}
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

        {ready && mode === "map" && (
          <div className="xp-hint">
            {hover ? (
              <>
                <strong>{hover.title}</strong> · click to step inside
              </>
            ) : (
              <>Drag to move · right-drag to rotate · scroll to zoom · click a sphere to step inside</>
            )}
          </div>
        )}

        {ready && mode === "sphere" && current && (
          <section className="xp-card" aria-live="polite">
            <div className="xp-card-head">
              <div>
                <p className="xp-eyebrow">
                  Stop {idx + 1} of {LANDMARKS.length} · {current.section}
                </p>
                <h1>{current.title}</h1>
                <p className="xp-sub">{current.subtitle}</p>
              </div>
            </div>
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
            <div className="xp-nav">
              <button onClick={() => engineRef.current?.step(-1)}>← {prev?.title}</button>
              <button onClick={() => engineRef.current?.step(1)}>{next?.title} →</button>
            </div>
          </section>
        )}

        {ready && mode === "sphere" && (
          <>
            <div className="xp-hint top">Drag to look around · scroll or pinch to zoom</div>
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
