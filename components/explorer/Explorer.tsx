"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LANDMARKS, SECTIONS, byId } from "@/lib/explorer/landmarks";
import type { SkyEngine } from "@/lib/explorer/engine";
import type { SkyData } from "@/lib/explorer/astro";
import StarMap, { type StarMapHandle } from "./StarMap";

const LANGS = [
  ["en", "English"],
  ["es", "Español"],
  ["fr", "Français"],
  ["zh", "中文"],
  ["hi", "हिन्दी"],
  ["ar", "العربية"],
] as const;

const FLY_KINDS = ["orbit", "planet", "star", "galaxy"];

export default function Explorer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SkyEngine | null>(null);
  const mapRef = useRef<StarMapHandle>(null);
  const busy = useRef(false);

  const [sky, setSky] = useState<SkyData | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"map" | "sphere">("map");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [lang, setLang] = useState("en");
  const [toast, setToast] = useState<string | null>(null);

  const setUrl = (id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("stop", id);
    else url.searchParams.delete("stop");
    window.history.replaceState(null, "", url);
  };

  /** Step into a sphere (from the map, the list, a portal, or prev/next). */
  const enterSphere = useCallback(async (id: string, fromMap = false) => {
    const engine = engineRef.current;
    if (!engine || busy.current) return;
    busy.current = true;
    if (fromMap) await mapRef.current?.flyTo(id);
    setCurrentId(id);
    setUrl(id);
    await engine.enter(id, () => setMode("sphere"));
    busy.current = false;
  }, []);

  const backToMap = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || busy.current) return;
    busy.current = true;
    await engine.leave();
    setMode("map");
    setUrl(null);
    mapRef.current?.focus(engine.current?.id ?? null);
    await engine.fade(0);
    busy.current = false;
  }, []);

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
        setSky(data);
        engine = new SkyEngine(canvasRef.current!, labelsRef.current!, fadeRef.current!, {
          onNavigate: (id) => enterSphere(id),
        });
        engineRef.current = engine;
        engine.init(data);
        setReady(true);
        if (window.innerWidth >= 1100) setPanelOpen(true);
        const stop = new URL(window.location.href).searchParams.get("stop");
        if (stop && byId(stop)) enterSphere(stop);
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
  }, [enterSphere]);

  useEffect(() => engineRef.current?.setToggles(showLabels, showLines), [showLabels, showLines]);

  // Tell the engine where the info card sits so hotspot cards don't open underneath it.
  useEffect(() => {
    const card = document.querySelector<HTMLElement>(".xp-card");
    const stage = canvasRef.current?.parentElement;
    const engine = engineRef.current;
    if (!card || !stage || !engine) return;
    const measure = () => {
      const c = card.getBoundingClientRect(), st = stage.getBoundingClientRect();
      const side = c.width < st.width * 0.7; // desktop: card on the right; phone: card along the bottom
      engine.safeArea = side ? { right: st.right - c.left + 8, bottom: 0 } : { right: 0, bottom: st.bottom - c.top + 8 };
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(card);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [mode, currentId]);
  useEffect(() => engineRef.current?.setLanguage(lang), [lang]);

  // Esc goes back to the map
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && mode === "sphere" && backToMap();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, backToMap]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const pick = (id: string) => {
    if (window.innerWidth < 1100) setPanelOpen(false);
    enterSphere(id, mode === "map");
  };

  const current = currentId ? byId(currentId) : null;
  const idx = current ? LANDMARKS.indexOf(current) : -1;
  const prev = idx >= 0 ? LANDMARKS[(idx - 1 + LANDMARKS.length) % LANDMARKS.length] : null;
  const next = idx >= 0 ? LANDMARKS[(idx + 1) % LANDMARKS.length] : null;
  const canFly = !!current && FLY_KINDS.includes(current.kind);

  const exportPng = async () => {
    const blob =
      mode === "sphere" && current
        ? await engineRef.current!.exportPNG(`Planet X & SPHEREx Explorer · ${current.title}`)
        : await mapRef.current!.exportPNG();
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
          <button role="tab" aria-selected={mode === "map"} onClick={backToMap} disabled={!ready}>
            Map
          </button>
          <button role="tab" aria-selected={mode === "sphere"} onClick={() => mode === "map" && pick(currentId ?? LANDMARKS[0].id)} disabled={!ready}>
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
        <div ref={labelsRef} className="xp-labels" />

        <div className={`xp-map ${mode === "map" ? "" : "hidden"}`} aria-hidden={mode !== "map"}>
          <StarMap ref={mapRef} sky={sky} currentId={currentId} hoverId={hoverId} onHover={setHoverId} onSelect={pick} />
          {ready && <div className="xp-hint">Drag to move · scroll or pinch to zoom · tap a stop to step inside</div>}
        </div>

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
                      onClick={() => pick(l.id)}
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

        {ready && mode === "sphere" && current && (
          <>
            <section className="xp-card" aria-live="polite">
              <p className="xp-eyebrow">
                Stop {idx + 1} of {LANDMARKS.length} · {current.section}
              </p>
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
              <div className="xp-nav">
                <button onClick={() => prev && enterSphere(prev.id)}>← {prev?.title}</button>
                <button onClick={() => next && enterSphere(next.id)}>{next?.title} →</button>
              </div>
              <button className="xp-back" onClick={backToMap}>
                Back to map (Esc)
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
