"use client";

import Link from "next/link";
import SiteTabs from "@/components/SiteTabs";
import "./infrared-isolation.css";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { SkyData } from "@/lib/explorer/astro";
import { EPOCHS, NOW_INDEX, PASTELS, PRESET_WAYPOINTS, epochYear, planetsValid, type Waypoint } from "@/lib/starmap/data";
import { raToX } from "@/lib/starmap/coords";
import { BASE_LAYERS, BLANK_FRAMES, OVERLAYS, SPHEREX_WL, layerById } from "@/lib/starmap/hips";
import { createPortal } from "react-dom";
import { DEFAULT_SETTINGS, type MapHover, type Settings, type StarMapViewer, type View } from "@/lib/starmap/viewer";
import SphereView from "@/components/explorer/Explorer";
import Collapsible from "@/components/ui/Collapsible";
import { byId } from "@/lib/explorer/landmarks";
import { constellationStop, starStop, waypointStop } from "@/lib/explorer/dynamic";
import Assistant, { type AssistantAction } from "./Assistant";
import CoordSearchBar from "./CoordSearchBar";
import BlinkPlayer, { type CompareMode } from "./BlinkPlayer";

const STORE_WP = "starmap.waypoints.v1";
const STORE_SETTINGS = "starmap.settings.v1";

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode etc. */
  }
}

const fmt = (n: number, d = 1) => (Math.abs(n) < 0.05 && d === 1 ? "0.0" : n.toFixed(d));
const raHMS = (ra: number) => {
  const h = ra / 15, hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return `${hh}h ${String(mm).padStart(2, "0")}m`;
};

export default function StarMapApp() {
  const stageRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<StarMapViewer | null>(null);
  const minimapRef = useRef<MinimapHandle>(null);
  const readoutRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<"2d" | "3d">("2d");
  const viewRef = useRef<View | null>(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [custom, setCustom] = useState<Waypoint[]>([]);
  const [hover, setHover] = useState<MapHover | null>(null);
  const [epoch, setEpoch] = useState(NOW_INDEX);
  const [showSettings, setShowSettings] = useState(false);
  const [adding, setAdding] = useState<{ x: number; y: number } | null>(null);
  const [travel, setTravel] = useState<string | null>(null);
  const [centerCoord, setCenterCoord] = useState({ ra: 0, dec: 0 });
  const [hasMarker, setHasMarker] = useState(false);
  const [fovDeg, setFovDeg] = useState(10);
  const [compareMode, setCompareMode] = useState<CompareMode>("normal");
  const [passIndex, setPassIndex] = useState(0);
  const [help, setHelp] = useState(true);
  const [sphere, setSphere] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [nearStop, setNearStop] = useState<string | null>(null);
  const sphereRef = useRef<string | null>(null);
  sphereRef.current = sphere;
  const skyRef = useRef<SkyData | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setUrl = (stop: string | null) => {
    const url = new URL(window.location.href);
    if (stop) url.searchParams.set("stop", stop);
    else url.searchParams.delete("stop");
    window.history.replaceState(null, "", url);
  };

  /** Where a sphere stop sits on the map (its waypoint, or the planet's current position). */
  const stopXY = useCallback((stop: string): [number, number] | null => {
    const v = viewerRef.current;
    if (!v) return null;
    const wp = PRESET_WAYPOINTS.find((w) => w.stop === stop);
    if (wp) return v.project(wp.ra, wp.dec);
    const planet = v.planetXY(stop);
    if (planet) return planet;
    const lm = byId(stop); // generated views know where they look
    const at = lm?.patch ?? (lm?.look ? { ra: lm.look[0], dec: lm.look[1] } : null);
    return at ? v.project(at.ra, at.dec) : null;
  }, []);

  /** Step inside a sphere: dive into its spot on the map, then the 360° view fades in. */
  const enterSphere = useCallback(
    async (stop: string) => {
      const v = viewerRef.current;
      if (!v || !byId(stop)) return;
      setHover(null);
      setAdding(null);
      const at = stopXY(stop);
      if (sphereRef.current) {
        if (at) v.setTarget(at[0], at[1]); // keep the map underneath in step
      } else if (at) {
        v.flyTo(at[0], at[1], 4, false);
        await new Promise((r) => setTimeout(r, 1100));
      }
      v.setEnabled(false);
      setSphere(stop);
      setUrl(stop);
    },
    [stopXY],
  );
  const enterRef = useRef(enterSphere);
  enterRef.current = enterSphere;

  /** Back to the map, right where that sphere sits. */
  const exitSphere = useCallback(() => {
    if (!sphereRef.current) return;
    setClosing(true);
    setTimeout(() => {
      setSphere(null);
      setClosing(false);
      setUrl(null);
      viewerRef.current?.setEnabled(true);
      const d = viewRef.current?.d ?? 14;
      if (d < 14) viewerRef.current?.zoomBy(14 / d); // ease back out to see the neighborhood
    }, 350);
  }, []);


  // Load settings & custom waypoints saved in this browser
  useEffect(() => {
    setSettings({ ...DEFAULT_SETTINGS, ...load(STORE_SETTINGS, {}) });
    setCustom(load<Waypoint[]>(STORE_WP, []));
    if (window.innerWidth < 800) setHelp(false);
  }, []);

  const overCard = useRef(false);
  const hoverWp = useCallback((h: MapHover | null) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (!h && overCard.current) return; // still reading the card
    if (h) setHover(h);
    else
      hideTimer.current = setTimeout(() => {
        setHover(null);
        viewerRef.current?.clearCard();
      }, 280);
  }, []);

  // Start the viewer
  useEffect(() => {
    let viewer: StarMapViewer | null = null;
    let cancelled = false;
    (async () => {
      try {
        const [{ StarMapViewer }, sky] = await Promise.all([
          import("@/lib/starmap/viewer"),
          fetch("/data/sky.json").then((r) => r.json() as Promise<SkyData>),
        ]);
        if (cancelled) return;
        skyRef.current = sky;
        viewer = new StarMapViewer(stageRef.current!, overlayRef.current!, sky, {
          onView: (v: View) => {
            viewRef.current = v;
            minimapRef.current?.draw(v);
            if (readoutRef.current) {
              const ra = (((-v.x % 360) + 360) % 360);
              setCenterCoord({ ra, dec: v.y });
              setFovDeg(Math.max(0.3, Math.min(60, v.radius * 2)));
              readoutRef.current.innerHTML =
                `<span><b>x</b> ${fmt(v.x)}°</span><span><b>y</b> ${fmt(v.y)}°</span>` +
                `<span><b>RA</b> ${raHMS(ra)}</span><span><b>Dec</b> ${fmt(v.y)}°</span>` +
                `<span><b>View</b> ${v.radius * 2 < 2 ? `${fmt(v.radius * 120, 0)}′` : `${fmt(v.radius * 2, 0)}°`}</span><span><b>Tilt</b> ${fmt((v.phi * 180) / Math.PI, 0)}°</span>`;
            }
            if (loadingRef.current) {
              loadingRef.current.style.opacity = v.loading ? "1" : "0";
              loadingRef.current.textContent = `Loading IRSA tiles · ${v.loading}`;
            }
            if (v.mode !== modeRef.current) {
              modeRef.current = v.mode;
              setMode(v.mode);
            }
          },
          onHover: hoverWp,
          onTravel: (wp) => {
            setTravel(wp.title);
            setTimeout(() => setTravel(null), 1800);
          },
          onOverview: (c) => minimapRef.current?.setImage(c),
          onEnter: (stop) => enterRef.current(stop),
          onNear: setNearStop,
        });
        viewerRef.current = viewer;
        viewer.invalidate();
        setReady(true);
        // Old /explore links and shared ?stop= links open that sphere straight away
        // Make sure views for waypoints exist before following a shared link to one
        [...PRESET_WAYPOINTS, ...load<Waypoint[]>(STORE_WP, [])].forEach(waypointStop);
        const urlParams = new URL(window.location.href).searchParams;
        const stop = urlParams.get("stop");
        if (stop && byId(stop)) setTimeout(() => enterRef.current(stop), 300);
        else {
          const raQ = Number(urlParams.get("ra"));
          const decQ = Number(urlParams.get("dec"));
          const fovQ = Number(urlParams.get("fov")) || 1.5;
          if (urlParams.has("ra") && urlParams.has("dec") && Number.isFinite(raQ) && Number.isFinite(decQ)) {
            const [tx, ty] = viewer.project(raQ, decQ);
            const dEnd = Math.max(0.5, (fovQ / 2) / Math.tan((40 / 2) * (Math.PI / 180)));
            setTimeout(() => {
              viewer?.flyTo(tx, ty, dEnd, false);
              viewer?.setTargetMarker(raQ, decQ);
              setHasMarker(true);
            }, 200);
          }
        }
      } catch (e) {
        console.error(e);
        setError("Your browser couldn't start the 3D map. Try a recent version of Chrome, Edge, Firefox or Safari.");
      }
    })();
    return () => {
      cancelled = true;
      viewer?.dispose();
      viewerRef.current = null;
    };
  }, [hoverWp]);

  // Push state into the viewer
  useEffect(() => {
    viewerRef.current?.setSettings(settings);
    save(STORE_SETTINGS, settings);
  }, [settings, ready]);
  useEffect(() => {
    viewerRef.current?.setWaypoints([...PRESET_WAYPOINTS, ...custom]);
    minimapRef.current?.setWaypoints([...PRESET_WAYPOINTS, ...custom]);
    save(STORE_WP, custom);
  }, [custom, ready]);
  useEffect(() => {
    const y = epochYear(EPOCHS[epoch]);
    viewerRef.current?.setEpoch(y - 2000, planetsValid(y));
  }, [epoch, ready]);

  // Shift+G: drop a custom waypoint where you're looking (or under the mouse)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea, select")) return;
      if (sphereRef.current) return; // the sphere view has its own keys
      if (e.shiftKey && e.key.toLowerCase() === "g" && viewerRef.current) {
        e.preventDefault();
        const p = viewerRef.current.pointOfInterest();
        setAdding({ x: p.x, y: p.y });
      } else if (e.key === "Escape") {
        setAdding(null);
        setShowSettings(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const set = (k: keyof Settings, v: Settings[keyof Settings]) => setSettings((s) => ({ ...s, [k]: v }));

  // ── The sky guide (AI assistant): what it can see, and the actions it can take ──
  const latest = useRef({ epoch, settings, custom, hover });
  latest.current = { epoch, settings, custom, hover };

  const assistantContext = () => {
    const v = viewRef.current, viewer = viewerRef.current;
    if (!v || !viewer) return {};
    const { epoch: e, settings: st, custom: cu, hover: hv } = latest.current;
    const [ra, dec] = viewer.toRadec(v.x, v.y);
    const inView = [...PRESET_WAYPOINTS, ...cu]
      .map((w) => {
        const [x, y] = viewer.project(w.ra, w.dec);
        return { w, d: Math.hypot(x - v.x, y - v.y) };
      })
      .filter((o) => o.d < Math.max(5, v.radius))
      .sort((a, b) => a.d - b.d)
      .slice(0, 12)
      .map((o) => o.w.title);
    return {
      map_center: { ra_deg: +ra.toFixed(2), dec_deg: +dec.toFixed(2) },
      field_of_view_deg: +(v.radius * 2).toFixed(1),
      view: sphereRef.current ? "360° view" : v.mode,
      in_360_view_of: sphereRef.current ? byId(sphereRef.current)?.title : null,
      timeline: EPOCHS[e].label,
      imagery: st.layer === "2mass" ? "2MASS" : st.band >= 0 ? `SPHEREx ${SPHEREX_WL[st.band].toFixed(2)} µm` : "SPHEREx color",
      hovering: hv?.wp?.title ?? hv?.planet ?? null,
      places_in_view: inView,
    };
  };

  const runAction = (a: AssistantAction): string | null => {
    const viewer = viewerRef.current, sky = skyRef.current;
    if (!viewer || !sky) return null;
    const norm = (t: unknown) => String(t ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const open = !!a.args.open_360;
    const go = (stop: string | null, x: number, y: number, d: number, label: string) => {
      if (open && stop) {
        enterSphere(stop);
        return `◎ Opened ${label} in 360°`;
      }
      const fly = () => viewer.flyTo(x, y, d, false);
      if (sphereRef.current) {
        exitSphere();
        setTimeout(fly, 450);
      } else fly();
      return `✈ Flew to ${label}`;
    };
    switch (a.name) {
      case "show_place": {
        const id = String(a.args.id);
        const wp = [...PRESET_WAYPOINTS, ...latest.current.custom].find((w) => w.id === id);
        if (wp) {
          const [x, y] = viewer.project(wp.ra, wp.dec);
          return go(waypointStop(wp), x, y, 14, wp.title);
        }
        const lm = byId(id), at = stopXY(id);
        return lm && at ? go(id, at[0], at[1], 10, lm.title) : null;
      }
      case "show_constellation": {
        const n = norm(a.args.name);
        const c = sky.constellations.find((k) => norm(k.id) === n || Object.values(k.names).some((nm) => norm(nm) === n));
        if (!c) return `Couldn't find a constellation called “${a.args.name}”`;
        const [x, y] = viewer.project(c.center[0], c.center[1]);
        return go(constellationStop(sky, c), x, y, 20, c.names.en);
      }
      case "show_star": {
        const n = norm(a.args.name);
        const s = sky.named.find((k) => Object.values(k.names).some((nm) => norm(nm) === n));
        if (!s) return `Couldn't find a star called “${a.args.name}” on the map`;
        const [ra, dec] = sky.stars[s.i];
        const [x, y] = viewer.project(ra, dec);
        return go(starStop(sky, s), x, y, 10, s.names.en);
      }
      case "show_sky_position": {
        const ra = Number(a.args.ra_deg), dec = Number(a.args.dec_deg);
        if (!Number.isFinite(ra) || !Number.isFinite(dec) || Math.abs(dec) > 90) return null;
        const [x, y] = viewer.project(((ra % 360) + 360) % 360, dec);
        return go(null, x, y, 12, String(a.args.label ?? "that spot"));
      }
      case "set_timeline": {
        const i = EPOCHS.findIndex((e) => e.label === a.args.epoch);
        if (i < 0) return null;
        setEpoch(i);
        return `⧗ Timeline set to ${EPOCHS[i].label}`;
      }
      case "set_imagery": {
        if (a.args.layer === "2mass") {
          set("layer", "2mass");
          return "Imagery: 2MASS";
        }
        set("layer", "spherex");
        if (a.args.layer === "spherex-wavelength" && Number.isFinite(Number(a.args.wavelength_um))) {
          const um = Number(a.args.wavelength_um);
          let best = 0;
          SPHEREX_WL.forEach((w, i) => {
            if (!BLANK_FRAMES.has(i) && Math.abs(w - um) < Math.abs(SPHEREX_WL[best] - um)) best = i;
          });
          set("band", best);
          return `Imagery: SPHEREx ${SPHEREX_WL[best].toFixed(2)} µm`;
        }
        set("band", -1);
        return "Imagery: SPHEREx color";
      }
      case "set_view": {
        if (sphereRef.current) exitSphere();
        viewer.set2D(a.args.mode === "2d");
        return a.args.mode === "2d" ? "View: 2D" : "View: 3D";
      }
      default:
        return null;
    }
  };

  // "/" opens the guide
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || (e.target as HTMLElement)?.closest?.("input, textarea, select")) return;
      e.preventDefault();
      setAskOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const all = [...PRESET_WAYPOINTS, ...custom];
  const ep = EPOCHS[epoch];

  return (
    <div className={`mv ${sphere ? "in-sphere" : ""}`}>
      <div ref={stageRef} className="mv-stage">
        <div ref={overlayRef} className="mv-overlay" />
      </div>

      {!ready && !error && <div className="mv-loading">Laying out the sky…</div>}
      {error && <div className="mv-loading">{error}</div>}

      {/* Top-left: title & 2D/3D */}
      <div className="mv-top-left">
        <SiteTabs active="explorer" />
        <CoordSearchBar
          centerRa={centerCoord.ra}
          centerDec={centerCoord.dec}
          hasMarker={hasMarker}
          onJump={(ra, dec, fov = 1.5, label) => {
            const v = viewerRef.current;
            if (!v) return;
            const [x, y] = v.project(ra, dec);
            const dEnd = Math.max(0.5, (fov / 2) / Math.tan((40 / 2) * (Math.PI / 180)));
            v.flyTo(x, y, dEnd, false);
            v.setTargetMarker(ra, dec, label);
            setHasMarker(true);
            const url = new URL(window.location.href);
            url.searchParams.set("ra", ra.toFixed(4));
            url.searchParams.set("dec", dec.toFixed(4));
            url.searchParams.set("fov", String(fov));
            window.history.replaceState(null, "", url);
          }}
          onClearMarker={() => {
            viewerRef.current?.clearTargetMarker();
            setHasMarker(false);
            const url = new URL(window.location.href);
            url.searchParams.delete("ra");
            url.searchParams.delete("dec");
            url.searchParams.delete("fov");
            window.history.replaceState(null, "", url);
          }}
          onShareLink={async () => {
            const url = new URL(window.location.href);
            url.searchParams.set("ra", centerCoord.ra.toFixed(4));
            url.searchParams.set("dec", centerCoord.dec.toFixed(4));
            url.searchParams.set("fov", fovDeg.toFixed(2));
            url.searchParams.set("band", settings.layer);
            window.history.replaceState(null, "", url);
            try {
              await navigator.clipboard.writeText(url.toString());
            } catch {
              /* ignore clipboard errors */
            }
          }}
        />
        <BlinkPlayer
          fov={fovDeg}
          onFovChange={(nextFov) => {
            setFovDeg(nextFov);
            const v = viewerRef.current;
            if (!v) return;
            const [x, y] = v.project(centerCoord.ra, centerCoord.dec);
            const dEnd = Math.max(0.5, (nextFov / 2) / Math.tan((40 / 2) * (Math.PI / 180)));
            v.flyTo(x, y, dEnd, false);
          }}
          compareMode={compareMode}
          onCompareModeChange={(mode) => {
            setCompareMode(mode);
            if (stageRef.current) {
              stageRef.current.style.filter =
                mode === "subtract"
                  ? "invert(1) contrast(1.45) hue-rotate(180deg)"
                  : mode === "add"
                  ? "brightness(1.28) contrast(1.18)"
                  : "";
            }
          }}
          passIndex={passIndex}
          onPassChange={(idx) => {
            setPassIndex(idx);
            if (stageRef.current && compareMode === "normal") {
              const b = [1, 1.08, 0.94, 1.12][idx] ?? 1;
              stageRef.current.style.filter = `brightness(${b})`;
            }
          }}
        />
        <div className="mv-glass mv-seg" role="tablist" aria-label="View mode">
          <button
            role="tab"
            aria-selected={!sphere && mode === "2d"}
            onClick={() => {
              exitSphere();
              viewerRef.current?.set2D(true);
            }}
          >
            2D
          </button>
          <button
            role="tab"
            aria-selected={!sphere && mode === "3d"}
            onClick={() => {
              exitSphere();
              viewerRef.current?.set2D(false);
            }}
          >
            3D
          </button>
        </div>
        <button className={`mv-glass mv-ask ${askOpen ? "on" : ""}`} onClick={() => setAskOpen((o) => !o)} aria-expanded={askOpen} title="Ask the sky guide (/)">
          ✦ Ask
        </button>
      </div>

      {/* Top-right: actions, minimap, readout */}
      <div className="mv-top-right">
        <div className="mv-actions">
          <button
            className="mv-glass mv-pill"
            onClick={() => {
              const p = viewerRef.current?.pointOfInterest();
              if (p) setAdding({ x: p.x, y: p.y });
            }}
            title="Add a waypoint (Shift+G)"
          >
            + Waypoint <kbd>⇧G</kbd>
          </button>
          <button className="mv-wrench" onClick={() => setShowSettings(true)} aria-label="Settings" title="Settings">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3.6 17.2a1.6 1.6 0 0 0 2.3 2.3l5.7-5.7a4 4 0 0 0 5.2-5.4l-2.5 2.5-2.2-.4-.4-2.2 2.5-2.5z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <Collapsible id="map-overview" className="mv-glass mv-minicard" title={<span className="cl-label">Overview</span>} summary={layerById(settings.layer).name}>
          <Minimap ref={minimapRef} onMove={(x, y) => viewerRef.current?.setTarget(x, y)} />
          <div ref={readoutRef} className="mv-readout" />
          <ImageryControl settings={settings} set={set} />
        </Collapsible>
        <div ref={loadingRef} className="mv-glass mv-loadpill" aria-live="polite" />
      </div>

      {/* Zoom & home */}
      <div className="mv-zoom">
        <button className="mv-glass" onClick={() => viewerRef.current?.zoomBy(0.7)} aria-label="Zoom in">
          +
        </button>
        <button className="mv-glass" onClick={() => viewerRef.current?.zoomBy(1.4)} aria-label="Zoom out">
          −
        </button>
        <button className="mv-glass" onClick={() => viewerRef.current?.home()} aria-label="Back to the origin" title="Back to the origin (H)">
          ⌂
        </button>
      </div>

      {/* Controls help */}
      <Collapsible id="map-controls" className="mv-glass mv-help" title={<span className="cl-label">Controls</span>} defaultOpen={help}>
        {(
          <ul>
            <li><b>Pan</b> middle-drag · left-drag · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></li>
            <li><b>Orbit</b> <kbd>Shift</kbd> + middle-drag · right-drag · <kbd>Q</kbd><kbd>E</kbd> <kbd>R</kbd><kbd>F</kbd></li>
            <li><b>Zoom</b> scroll · <kbd>Z</kbd><kbd>X</kbd></li>
            <li><b>2D / 3D</b> <kbd>T</kbd> · tilt near flat to snap to 2D</li>
            <li><b>360° view</b> click any diamond, planet, star or constellation name to fly there, then click it again</li>
            <li><b>Waypoint</b> <kbd>Shift</kbd>+<kbd>G</kbd> · <b>Home</b> <kbd>H</kbd></li>
          </ul>
        )}
      </Collapsible>

      {/* The summary card pops out of the hovered diamond or planet (rendered inside the viewer's card host) */}
      {hover &&
        settings.descriptions &&
        viewerRef.current &&
        createPortal(
          <div
            className="mv-pop"
            key={hover.wp?.id ?? hover.planet}
            onPointerEnter={() => {
              overCard.current = true;
              if (hideTimer.current) clearTimeout(hideTimer.current);
            }}
            onPointerLeave={() => {
              overCard.current = false;
              hoverWp(null);
            }}
          >
            {hover.wp ? (
              <WaypointDetails
                wp={hover.wp}
                viewer={viewerRef.current}
                near={waypointStop(hover.wp) === nearStop}
                onStep={enterSphere}
                imaged={`${layerById(settings.layer).name}: ${layerById(settings.layer).observed}`}
                onDelete={(id) => setCustom((c) => c.filter((w) => w.id !== id))}
              />
            ) : (
              <PlanetDetails
                hover={hover}
                near={hover.stop === nearStop}
                onStep={enterSphere}
                onTravel={() => viewerRef.current?.flyTo(hover.x, hover.y, 10, false)}
              />
            )}
          </div>,
          viewerRef.current.cardHost,
        )}

      {/* Add-waypoint panel (Shift+G) */}
      <aside className={`mv-glass mv-addcard ${adding ? "open" : ""}`} aria-hidden={!adding}>
        {adding && (
          <AddWaypoint
            at={adding}
            toRadec={(x, y) => viewerRef.current?.toRadec(x, y) ?? [0, 0]}
            onCancel={() => setAdding(null)}
            onSave={(wp) => {
              setCustom((c) => [...c, wp]);
              setAdding(null);
            }}
          />
        )}
      </aside>

      {/* Timeline */}
      <Collapsible
        id="map-timeline"
        className="mv-glass mv-timeline"
        title={
          <div className="mv-tl-head">
            <span className="cl-label">Timeline</span>
            <strong>{ep.label}</strong>
          </div>
        }
      >
        <p className="mv-tl-note">
          {ep.note}
          {!planetsValid(epochYear(ep)) && settings.planets && <em> Planets hidden: too far from today to calculate reliably.</em>}
        </p>
        <Timeline value={epoch} onChange={setEpoch} />
      </Collapsible>

      {travel && !sphere && <div className="mv-travel">Traveling to {travel}…</div>}

      <Assistant open={askOpen} onClose={() => setAskOpen(false)} getContext={assistantContext} runAction={runAction} />

      {/* The 360° sphere opens right here, over the map */}
      {sphere && (
        <div className={`mv-sphere ${closing ? "closing" : ""}`}>
          <SphereView stopId={sphere} onStop={enterSphere} onExit={exitSphere} />
        </div>
      )}

      {/* Settings window */}
      <SettingsWindow
        open={showSettings}
        settings={settings}
        set={set}
        custom={custom}
        setCustom={setCustom}
        onClose={() => setShowSettings(false)}
        count={all.length}
      />
    </div>
  );
}

// ───────────────────────── Waypoint details ─────────────────────────

function WaypointDetails({
  wp,
  viewer,
  imaged,
  near,
  onStep,
  onDelete,
}: {
  wp: Waypoint;
  viewer: StarMapViewer | null;
  imaged: string;
  near: boolean;
  onStep: (stop: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      <span className="mv-kind" style={wp.color ? { background: wp.color } : undefined}>
        {wp.kind}
      </span>
      <h2>{wp.title}</h2>
      <p>{wp.description}</p>
      {wp.significance && (
        <p className="mv-sig">
          <b>Why it matters:</b> {wp.significance}
        </p>
      )}
      <dl>
        <div className="wide">
          <dt>Image taken</dt>
          <dd>{imaged}</dd>
        </div>
        <div className="wide">
          <dt>{wp.custom ? "Added" : "Recorded"}</dt>
          <dd>{wp.date || "—"}</dd>
        </div>
        <div>
          <dt>Map x, y</dt>
          <dd>
            {fmt(raToX(wp.ra))}°, {fmt(wp.dec)}°
          </dd>
        </div>
        <div>
          <dt>RA, Dec</dt>
          <dd>
            {raHMS(wp.ra)}, {fmt(wp.dec)}°
          </dd>
        </div>
      </dl>
      <div className="mv-wp-actions">
        {near ? (
          <button className="mv-primary" onClick={() => onStep(waypointStop(wp))}>
            View in 360° ↗
          </button>
        ) : (
          <button className="mv-primary" onClick={() => viewer?.travelTo(wp)}>
            Travel here
          </button>
        )}
        {!near && <span className="mv-hint360">then click the diamond again for 360°</span>}
        {wp.custom && (
          <button className="mv-secondary" onClick={() => onDelete(wp.id)}>
            Delete
          </button>
        )}
      </div>
    </>
  );
}

/** The hover card for a planet or the Sun: its 360° stop's summary. */
function PlanetDetails({ hover, near, onStep, onTravel }: { hover: MapHover; near: boolean; onStep: (stop: string) => void; onTravel: () => void }) {
  const lm = hover.stop ? byId(hover.stop) : null;
  if (!lm) return null;
  return (
    <>
      <span className="mv-kind">{lm.subtitle}</span>
      <h2>{lm.title}</h2>
      <p>{lm.description}</p>
      <dl>
        {lm.facts.slice(0, 2).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        <div className="wide">
          <dt>Position today</dt>
          <dd>
            Map {fmt(hover.x)}°, {fmt(hover.y)}°
          </dd>
        </div>
      </dl>
      <div className="mv-wp-actions">
        {near ? (
          <button className="mv-primary" onClick={() => onStep(lm.id)}>
            View in 360° ↗
          </button>
        ) : (
          <button className="mv-primary" onClick={onTravel}>
            Travel here
          </button>
        )}
        {!near && <span className="mv-hint360">then click it again for 360°</span>}
      </div>
    </>
  );
}

function AddWaypoint({ at, toRadec, onCancel, onSave }: { at: { x: number; y: number }; toRadec: (x: number, y: number) => [number, number]; onCancel: () => void; onSave: (wp: Waypoint) => void }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("My waypoint");
  const [description, setDescription] = useState("");
  const [significance, setSignificance] = useState("");
  const [date, setDate] = useState(() => new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }));
  const [color, setColor] = useState(PASTELS[0]);
  const [ra, dec] = toRadec(at.x, at.y);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onSave({ id: `u-${Date.now()}`, title: title.trim(), kind: kind.trim() || "My waypoint", ra, dec, description: description.trim(), significance: significance.trim(), date: date.trim(), color, custom: true });
      }}
    >
      <div className="mv-add-head">
        <h2>New waypoint</h2>
        <button type="button" className="mv-close" onClick={onCancel} aria-label="Close">
          ×
        </button>
      </div>
      <p className="mv-add-pos">
        At x {fmt(at.x)}°, y {fmt(at.y)}° · RA {raHMS(ra)}, Dec {fmt(dec)}°
      </p>
      <label>
        Name
        <input ref={first} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. My favorite star" required maxLength={60} />
      </label>
      <label>
        Type
        <input value={kind} onChange={(e) => setKind(e.target.value)} maxLength={40} />
      </label>
      <label>
        Description
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={280} placeholder="What's here?" />
      </label>
      <label>
        Why it matters
        <textarea value={significance} onChange={(e) => setSignificance(e.target.value)} rows={2} maxLength={200} />
      </label>
      <label>
        Date
        <input value={date} onChange={(e) => setDate(e.target.value)} maxLength={40} />
      </label>
      <fieldset>
        <legend>Color</legend>
        <div className="mv-swatches">
          {PASTELS.map((c) => (
            <button type="button" key={c} className={c === color ? "on" : ""} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Color ${c}`} aria-pressed={c === color} />
          ))}
        </div>
      </fieldset>
      <div className="mv-wp-actions">
        <button type="submit" className="mv-primary" disabled={!title.trim()}>
          Add waypoint
        </button>
        <button type="button" className="mv-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ───────────────────────── Imagery (which IRSA data you're looking at) ─────────────────────────

function ImageryControl({ settings, set }: { settings: Settings; set: (k: keyof Settings, v: Settings[keyof Settings]) => void }) {
  const mode = settings.layer === "2mass" ? "2mass" : settings.band >= 0 ? "band" : "color";
  const [band, setBand] = useState(settings.band >= 0 ? settings.band : 46);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const available = SPHEREX_WL.map((_, i) => i).filter((i) => !BLANK_FRAMES.has(i));
  const cancelPending = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => {
    if (settings.band >= 0) setBand(settings.band);
  }, [settings.band]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const isolate = (b: number, deferred = false) => {
    cancelPending();
    setBand(b);
    const apply = () => {
      set("layer", "spherex");
      set("overlays", []);
      set("band", b);
      timer.current = null;
    };
    if (deferred) timer.current = setTimeout(apply, 180);
    else apply();
  };
  const switchMode = (layer: Settings["layer"], b: number) => {
    cancelPending();
    set("layer", layer);
    set("band", b);
  };
  const stepBand = (direction: number) => {
    const index = available.indexOf(band);
    const next = available[Math.max(0, Math.min(available.length - 1, index + direction))];
    isolate(next);
  };

  return (
    <div className="mv-imagery">
      <div className="mv-imagery-seg" role="radiogroup" aria-label="Map imagery">
        <button role="radio" aria-checked={mode === "color"} onClick={() => switchMode("spherex", -1)}>SPHEREx color</button>
        <button role="radio" aria-checked={mode === "band"} onClick={() => isolate(band)}>Isolate infrared</button>
        <button role="radio" aria-checked={mode === "2mass"} onClick={() => switchMode("2mass", -1)}>2MASS</button>
      </div>
      <div className="mv-ir-presets" role="group" aria-label="Isolate an infrared layer">
        {[12, 46, 62].map((frame) => (
          <button key={frame} type="button" aria-pressed={mode === "band" && settings.band === frame && settings.overlays.length === 0}
            onClick={() => isolate(frame)} title={`Isolate ${SPHEREX_WL[frame].toFixed(3)} micrometers`}>
            {SPHEREX_WL[frame].toFixed(1)} µm
          </button>
        ))}
      </div>
      {mode === "band" && (
        <div className="mv-ir-isolation">
          <p className="mv-ir-status" aria-live="polite">
            {settings.overlays.length ? "Overlay blend active" : "Infrared layer isolated"} · {SPHEREX_WL[settings.band].toFixed(3)} µm
          </p>
          <label className="mv-band">
            <span><b>{SPHEREX_WL[band].toFixed(3)} µm</b> · channel {band + 1} of 102</span>
            <input type="range" min={0} max={available.length - 1} value={Math.max(0, available.indexOf(band))}
              onChange={(e) => isolate(available[Number(e.target.value)], true)} aria-label="SPHEREx wavelength"
              aria-valuetext={`${SPHEREX_WL[band].toFixed(3)} micrometers, channel ${band + 1}`} />
          </label>
          <label className="mv-ir-select">Choose a wavelength
            <select value={band} onChange={(e) => isolate(Number(e.target.value))}>
              {SPHEREX_WL.map((w, i) => <option key={i} value={i} disabled={BLANK_FRAMES.has(i)}>
                {w.toFixed(3)} µm · channel {i + 1}{BLANK_FRAMES.has(i) ? " — no DR1 data" : ""}
              </option>)}
            </select>
          </label>
          <div className="mv-ir-steps">
            <button type="button" disabled={band === available[0]} onClick={() => stepBand(-1)}>← Previous</button>
            <button type="button" disabled={band === available[available.length - 1]} onClick={() => stepBand(1)}>Next →</button>
          </div>
          {settings.overlays.length > 0 && <button type="button" className="mv-ir-clear" onClick={() => isolate(band)}>Remove overlays and isolate</button>}
          <p className="mv-imagery-note">One wavelength only; survey overlays are removed. Display colors are artificial. Channels 51–52 have no DR1 data.</p>
        </div>
      )}
      {mode === "color" && <p className="mv-imagery-note">Blue 1.0 µm · green 2.2 µm · red 3.3 µm. Use the presets above to isolate one layer.</p>}
    </div>
  );
}

// ───────────────────────── Minimap ─────────────────────────

type MinimapHandle = { draw: (v: View) => void; setImage: (c: HTMLCanvasElement) => void; setWaypoints: (w: Waypoint[]) => void };


const Minimap = forwardRef<MinimapHandle, { onMove: (x: number, y: number) => void }>(function Minimap({ onMove }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLCanvasElement | null>(null);
  const wps = useRef<Waypoint[]>([]);
  const view = useRef<View | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const paint = useCallback(() => {
    const c = canvas.current, v = view.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (img.current) ctx.drawImage(img.current, 0, 0, w, h);
    else {
      ctx.fillStyle = "#0b1030";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (const wp of wps.current) {
      const x = ((raToX(wp.ra) + 180) / 360) * w, y = ((90 - wp.dec) / 180) * h;
      ctx.fillStyle = wp.color ?? "rgba(255,255,255,0.85)";
      ctx.fillRect(x - 1.5, y - 1, 3, 2);
    }
    if (!v) return;
    const cx = ((v.x + 180) / 360) * w, cy = ((90 - v.y) / 180) * h;
    const r = Math.max(5, (v.radius / 360) * w);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    ctx.setLineDash([]);
    // heading tick: which way is "up" on screen
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - Math.sin(v.theta) * r, cy - Math.cos(v.theta) * r);
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  useImperativeHandle(ref, () => ({
    draw: (v) => {
      view.current = v;
      paint();
    },
    setImage: (c) => {
      img.current = c;
      paint();
    },
    setWaypoints: (w) => {
      wps.current = w;
      paint();
    },
  }));

  const toMap = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 360 - 180, 90 - ((e.clientY - r.top) / r.height) * 180] as const;
  };

  return (
    <canvas
      ref={canvas}
      className="mv-minimap"
      aria-label="Overview map: drag the circle to move"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        const [x, y] = toMap(e);
        const v = view.current;
        // Grab the circle where you clicked it; click elsewhere to jump there.
        drag.current = v && Math.hypot(x - v.x, y - v.y) < Math.max(v.radius, 6) ? { dx: v.x - x, dy: v.y - y } : { dx: 0, dy: 0 };
        onMove(x + drag.current.dx, y + drag.current.dy);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const [x, y] = toMap(e);
        onMove(x + drag.current.dx, y + drag.current.dy);
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    />
  );
});

// ───────────────────────── Timeline ─────────────────────────

function Timeline({ value, onChange }: { value: number; onChange: (i: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [dragPos, setDragPos] = useState<number | null>(null);
  const n = EPOCHS.length;
  const pos = dragPos ?? value / (n - 1);
  const nearest = Math.round(pos * (n - 1));

  const fromEvent = (e: React.PointerEvent) => {
    const r = track.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };

  return (
    <div className="mv-tl">
      <div
        ref={track}
        className="mv-tl-track"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          setDragPos(fromEvent(e));
        }}
        onPointerMove={(e) => dragPos !== null && setDragPos(fromEvent(e))}
        onPointerUp={() => {
          if (dragPos === null) return;
          setDragPos(null);
          onChange(nearest); // snap to the closest date
        }}
      >
        <div className="mv-tl-fill" style={{ width: `${pos * 100}%` }} />
        {EPOCHS.map((ep, i) => (
          <button
            key={ep.label}
            className={`mv-tl-mark ${i === nearest ? "on" : ""}`}
            style={{ left: `${(i / (n - 1)) * 100}%` }}
            onClick={() => onChange(i)}
            tabIndex={-1}
          >
            <span>{ep.label}</span>
          </button>
        ))}
        <div
          className={`mv-tl-handle ${dragPos !== null ? "dragging" : ""}`}
          style={{ left: `${pos * 100}%` }}
          role="slider"
          tabIndex={0}
          aria-label="Date"
          aria-valuemin={0}
          aria-valuemax={n - 1}
          aria-valuenow={value}
          aria-valuetext={EPOCHS[value].label}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") onChange(Math.max(0, value - 1));
            if (e.key === "ArrowRight") onChange(Math.min(n - 1, value + 1));
          }}
        />
      </div>
    </div>
  );
}

// ───────────────────────── Settings window ─────────────────────────

const TOGGLES: [keyof Settings, string, string][] = [
  ["glow", "Light", "Brighter display, so faint dust and galaxies stand out"],
  ["lines", "Constellation mapping", "Stick-figure lines joining each constellation"],
  ["names", "Names", "Constellation, star and planet names"],
  ["descriptions", "Descriptions", "Detail cards that slide in when you hover a waypoint"],
  ["waypoints", "Waypoints", "The white markers you can click to fast travel"],
  ["planets", "Planets", "The Sun and planets at the date on the timeline"],
  ["grid", "Grid pattern", "RA / Dec grid lines, with the axes through the origin"],
];

function SettingsWindow({
  open,
  settings,
  set,
  custom,
  setCustom,
  onClose,
  count,
}: {
  open: boolean;
  settings: Settings;
  set: (k: keyof Settings, v: Settings[keyof Settings]) => void;
  custom: Waypoint[];
  setCustom: (w: Waypoint[]) => void;
  onClose: () => void;
  count: number;
}) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className={`mv-settings ${open ? "open" : ""}`} aria-hidden={!open} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mv-settings-panel" role="dialog" aria-modal="true" aria-label="Settings">
        <div className="mv-settings-head">
          <h2>Settings</h2>
          <button className="mv-primary" onClick={onClose}>
            Done
          </button>
        </div>

        <section>
          <h3>Map imagery from IRSA</h3>
          <p className="mv-note">Live tiles from NASA/IPAC&apos;s Infrared Science Archive, its most recent releases first.</p>
          {BASE_LAYERS.map((l) => (
            <label key={l.id} className="mv-toggle">
              <span>
                <b>{l.name}</b>
                <small>
                  Released {l.released} · observed {l.observed}
                </small>
              </span>
              <input type="radio" name="mv-base" checked={settings.layer === l.id} onChange={() => set("layer", l.id as Settings["layer"])} />
              <i aria-hidden="true" />
            </label>
          ))}
          <h3 className="mv-subhead">Extra layers (where they have data)</h3>
          {OVERLAYS.map((l) => (
            <label key={l.id} className="mv-toggle">
              <span>
                <b>{l.name}</b>
                <small>
                  Released {l.released} · observed {l.observed}
                </small>
              </span>
              <input
                type="checkbox"
                checked={settings.overlays.includes(l.id)}
                onChange={(e) => set("overlays", e.target.checked ? [...settings.overlays, l.id] : settings.overlays.filter((x) => x !== l.id))}
              />
              <i aria-hidden="true" />
            </label>
          ))}
        </section>

        <section>
          <h3>Display</h3>
          {TOGGLES.map(([k, label, hint]) => (
            <label key={k} className="mv-toggle">
              <span>
                <b>{label}</b>
                <small>{hint}</small>
              </span>
              <input type="checkbox" checked={settings[k] as boolean} onChange={(e) => set(k, e.target.checked)} />
              <i aria-hidden="true" />
            </label>
          ))}
        </section>

        <section>
          <h3>Performance</h3>
          <p className="mv-note">The map only draws tiles near what you can see, and uses less detail as you zoom out.</p>
          <div className="mv-seg-row">
            {(["low", "auto", "high"] as const).map((q) => (
              <button key={q} className={settings.quality === q ? "on" : ""} onClick={() => set("quality", q)}>
                {q === "auto" ? "Auto" : q === "low" ? "Battery saver" : "High detail"}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>Controls</h3>
          <ul className="mv-keys">
            <li><span>Pan</span><span>Middle-drag, left-drag, or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrows</span></li>
            <li><span>Orbit</span><span><kbd>Shift</kbd> + middle-drag, right-drag, or <kbd>Q</kbd><kbd>E</kbd> (turn) <kbd>R</kbd><kbd>F</kbd> (tilt)</span></li>
            <li><span>Zoom</span><span>Scroll wheel, pinch, or <kbd>Z</kbd><kbd>X</kbd></span></li>
            <li><span>2D / 3D</span><span><kbd>T</kbd>, or tilt to nearly flat and let go to snap</span></li>
            <li><span>New waypoint</span><span><kbd>Shift</kbd> + <kbd>G</kbd></span></li>
            <li><span>Back to origin</span><span><kbd>H</kbd></span></li>
          </ul>
        </section>

        <section>
          <h3>Your waypoints</h3>
          <p className="mv-note">
            {custom.length} of {count} waypoints are yours. They&apos;re saved in this browser; export them to share or add to the team database.
          </p>
          <div className="mv-seg-row">
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(custom, null, 2)], { type: "application/json" });
                const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "star-map-waypoints.json" });
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 4000);
              }}
              disabled={!custom.length}
            >
              Export
            </button>
            <button onClick={() => file.current?.click()}>Import</button>
            <button onClick={() => custom.length && confirm("Delete all your waypoints?") && setCustom([])} disabled={!custom.length}>
              Clear mine
            </button>
          </div>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const list = JSON.parse(await f.text()) as Waypoint[];
                const ok = list.filter((w) => typeof w.ra === "number" && typeof w.dec === "number" && w.title);
                setCustom([...custom, ...ok.map((w, i) => ({ ...w, id: `u-${Date.now()}-${i}`, custom: true }))]);
              } catch {
                alert("That file isn't a waypoint list.");
              }
              e.target.value = "";
            }}
          />
        </section>

        <section>
          <h3>About the data</h3>
          <p className="mv-note">
            The map is SPHEREx Data Release 1 (NASA/JPL-Caltech, served by IRSA), streamed as HiPS tiles and laid onto a grid by RA/Dec starting from the
            origin (RA 0h, Dec 0°). Very bright cores that DR1 leaves blank (saturated pixels) are shown as white. Constellation lines and names come from the Hipparcos-based d3-celestial catalogue; star distances for the 3D constellations come from the HYG database v4.1 (CC BY-SA 4.0). The timeline shifts the sky by
            precession (a simplified model), and planets use NASA JPL&apos;s approximate orbital elements.
          </p>
        </section>
      </div>
    </div>
  );
}
