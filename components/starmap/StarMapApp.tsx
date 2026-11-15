"use client";

import Link from "next/link";
import SiteTabs from "@/components/SiteTabs";
import "./infrared-isolation.css";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { SkyData } from "@/lib/explorer/astro";
import { EPOCHS, NOW_INDEX, PASTELS, PRESET_WAYPOINTS, epochYear, planetsValid, type Waypoint } from "@/lib/starmap/data";
import { planetDistance, planetPositions, raToX } from "@/lib/starmap/coords";
import { BASE_LAYERS, BLANK_FRAMES, OVERLAYS, SPHEREX_WL, layerById, type LiveCatalog } from "@/lib/starmap/hips";
import { createPortal } from "react-dom";
import { DEFAULT_SETTINGS, type MapHover, type Settings, type StarMapViewer, type View } from "@/lib/starmap/viewer";
import SphereView from "@/components/explorer/Explorer";
import Collapsible from "@/components/ui/Collapsible";
import { byId } from "@/lib/explorer/landmarks";
import { constellationStop, starStop, waypointStop } from "@/lib/explorer/dynamic";
import Assistant, { type AssistantAction } from "./Assistant";
import Search, { type SearchItem } from "./Search";
import type { CosmicView, Galaxy } from "@/lib/starmap/cosmic";
import CoordSearchBar from "./CoordSearchBar";
import BlinkPlayer from "./BlinkPlayer";
import BlinkViewer, { type FeaturedBlink } from "./BlinkViewer";
import DataPanel from "./DataPanel";
import Tutorial, { tourDone } from "./Tutorial";
import Quest, { loadQuest } from "./Quest";
import { LangSwitch, addTranslations, translate, useLang, useT, useTV } from "@/lib/i18n";

const STORE_WP = "starmap.waypoints.v1";
/** How long after the tutorial (or landing, for returning visitors) the optional mission is offered. */
const QUEST_DELAY = 7000;
const STORE_SETTINGS = "starmap.settings.v2"; // v2: the measurement grid is on by default

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
  const t = useT();
  const tv = useTV();
  const { lang } = useLang();
  const langRef = useRef(lang);
  langRef.current = lang;
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
  /** Run `fn` at most every `ms` per key, always finishing with a last call once things settle. */
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const throttles = useRef(new Map<string, { at: number; timer: ReturnType<typeof setTimeout> | null }>());
  const throttle = (key: string, ms: number, fn: () => void) => {
    const t = throttles.current.get(key) ?? { at: 0, timer: null };
    throttles.current.set(key, t);
    const now = performance.now();
    if (now - t.at >= ms) {
      t.at = now;
      if (t.timer) clearTimeout(t.timer);
      t.timer = null;
      fn();
    } else if (!t.timer)
      t.timer = setTimeout(() => {
        t.timer = null;
        t.at = performance.now();
        fn();
      }, ms - (now - t.at));
  };
  // Blink: two real SPHEREx passes of one spot
  const [blinkOpen, setBlinkOpen] = useState(false);
  const [blinkData, setBlinkData] = useState<FeaturedBlink | null>(null);
  const [blinkLoading, setBlinkLoading] = useState<{ label: string; since: number } | null>(null);
  const [blinkError, setBlinkError] = useState<string | null>(null);
  const blinkReq = useRef<AbortController | null>(null);
  const blinkLast = useRef<"here" | "featured">("here");
  const [dataAt, setDataAt] = useState<{ ra: number; dec: number } | null>(null); // "Get the real data" panel
  const [help, setHelp] = useState(true);
  const [sphere, setSphere] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [nearStop, setNearStop] = useState<string | null>(null);
  const sphereRef = useRef<string | null>(null);
  sphereRef.current = sphere;
  const skyRef = useRef<SkyData | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [assistantDraft, setAssistantDraft] = useState<{ id: number; text: string } | null>(null);
  const askAbout = (name: string) => {
    setAssistantDraft(previous => ({ id: (previous?.id ?? 0) + 1, text: `Tell me about ${name}. What can SPHEREx help us learn about it?` }));
    setAskOpen(true);
  };

  // ── Zoomed out: the galaxies (CosmicView). The tool opens here; dive into the Sun to reach the sky map ──
  const cosmicStageRef = useRef<HTMLDivElement>(null);
  const cosmicLabelsRef = useRef<HTMLDivElement>(null);
  const cosmicRef = useRef<CosmicView | null>(null);
  const cosmicHudRef = useRef<HTMLDivElement>(null);
  const [cosmic, setCosmic] = useState(true);
  const [intro, setIntro] = useState(false);
  const [tour, setTour] = useState(false);
  const [questOpen, setQuestOpen] = useState(false);
  /** The SPHEREx map IRSA publishes right now (null until checked, or if IRSA didn't answer). */
  const [live, setLive] = useState<LiveCatalog | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false); // phones: coordinates and Blink live behind a button
  const questTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (questTimer.current && clearTimeout(questTimer.current)), []);
  // The page is a fixed, full-screen map: if focusing something ever scrolls it, snap straight back
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const reset = () => (el.scrollLeft || el.scrollTop) && el.scrollTo(0, 0);
    el.addEventListener("scroll", reset);
    return () => el.removeEventListener("scroll", reset);
  }, []);
  const cosmicOn = useRef(true);
  const [galaxy, setGalaxy] = useState<(Pick<Galaxy, "name" | "kind" | "size" | "dist" | "description"> & { wp?: string }) | null>(null);

  const leaveCosmic = useCallback((goHome = true) => {
    if (!cosmicOn.current) return;
    cosmicOn.current = false;
    setCosmic(false);
    setIntro(false);
    setGalaxy(null);
    cosmicRef.current?.setActive(false);
    viewerRef.current?.setEnabled(true);
    if (goHome) viewerRef.current?.arriveFromSpace();
  }, []);
  const goCosmic = useCallback(() => {
    if (cosmicOn.current || !cosmicRef.current) return;
    cosmicOn.current = true;
    setCosmic(true);
    viewerRef.current?.setEnabled(false);
    cosmicRef.current.setActive(true);
    cosmicRef.current.pullBack();
  }, []);
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

  const overCard = useRef(false);
  /** Step inside a sphere: dive into its spot on the map, then the 360° view fades in. */
  const enterSphere = useCallback(
    async (stop: string) => {
      const v = viewerRef.current;
      if (!v || !byId(stop)) return;
      setHover(null);
      overCard.current = false;
      v.clearCard();
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
  const quietUntil = useRef(0); // no hover cards while the exit cutscene plays
  const leaving = useRef(false);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The cutscene's iris has closed: drop the 360° view for good. */
  const finishExit = useCallback(() => {
    if (!leaving.current) return;
    if (finishTimer.current) clearTimeout(finishTimer.current);
    finishTimer.current = null;
    setSphere(null);
    setClosing(false);
    leaving.current = false;
  }, []);
  const exitSphere = useCallback(() => {
    if (!sphereRef.current || leaving.current) return;
    leaving.current = true;
    // Cutscene — stepping inside, played backwards: the 360° view darkens, fades to the map,
    // and the map flies back out of the spot with the hyperspace streaks
    const quick = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setClosing(true);
    setUrl(null);
    quietUntil.current = performance.now() + (quick ? 500 : 1900);
    viewerRef.current?.setEnabled(true);
    viewerRef.current?.pullOut(14, quick ? 400 : 1100, quick ? 0 : 300);
    if (finishTimer.current) clearTimeout(finishTimer.current);
    finishTimer.current = setTimeout(finishExit, quick ? 350 : 1100); // fallback if the animation never reports
  }, [finishExit]);


  // First visit: once the opening cutscene has landed on the sky map, offer the guided tour (only ever once)
  const tourOffered = useRef(false);
  useEffect(() => {
    if (tourOffered.current || !ready || cosmic || sphere || intro) return;
    tourOffered.current = true;
    if (tourDone()) {
      // Seen the tour before: offer the optional mission once (or pick an unfinished one back up)
      const q = loadQuest();
      if (q.offered && !(q.started && !q.done)) return;
      const t = setTimeout(() => setQuestOpen(true), QUEST_DELAY);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setTour(true), 1400);
    return () => clearTimeout(t);
  }, [ready, cosmic, sphere, intro]);

  // Real data for the mission: catalogue stars and today's planet positions
  const questStar = useCallback((name: string) => {
    const sky = skyRef.current;
    const n = sky?.named.find((k) => k.names.en.toLowerCase() === name.toLowerCase());
    if (!sky || !n) return null;
    const [ra, dec, mag, , pc] = sky.stars[n.i];
    return { ra, dec, mag, ly: pc > 0 ? pc * 3.2616 : null };
  }, []);
  const questPlanet = useCallback((name: string) => {
    const now = new Date();
    const year = now.getUTCFullYear() + (now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / (365.25 * 864e5);
    const p = planetPositions(year).find((q) => q.name.toLowerCase() === name.toLowerCase());
    if (!p) return null;
    const cap = name[0].toUpperCase() + name.slice(1).toLowerCase();
    return { ra: p.ra, dec: p.dec, ...planetDistance(cap, year) };
  }, []);

  /** Load a blink (live from IRSA through our server, or the featured example saved with the site). */
  const runBlink = async (url: string, label: string) => {
    blinkReq.current?.abort();
    const ctl = new AbortController();
    blinkReq.current = ctl;
    setBlinkOpen(true);
    setBlinkData(null);
    setBlinkError(null);
    setBlinkLoading({ label, since: performance.now() });
    try {
      const r = await fetch(url, { signal: ctl.signal });
      const j = await r.json().catch(() => ({ error: "The blink service didn't answer properly." }));
      if (ctl.signal.aborted) return;
      if (!r.ok || j.error) setBlinkError(j.error ?? translate(langRef.current, "Something went wrong ({status}).", { status: r.status }));
      else setBlinkData(j);
    } catch {
      if (!ctl.signal.aborted) setBlinkError("Couldn't reach the blink service. Check your connection and try again.");
    } finally {
      if (blinkReq.current === ctl) setBlinkLoading(null);
    }
  };
  const blinkHere = () => {
    blinkLast.current = "here";
    const { ra, dec } = centerCoord;
    const size = Math.min(1.2, Math.max(0.3, fovDeg * 0.8));
    const fmt2 = (v: number) => v.toFixed(2);
    runBlink(`/api/blink?ra=${ra.toFixed(3)}&dec=${dec.toFixed(3)}&size=${size.toFixed(2)}`, t("Finding SPHEREx passes at RA {ra}h, Dec {dec}°…", { ra: fmt2(ra / 15), dec: fmt2(dec) }));
  };
  const blinkFeatured = () => {
    blinkLast.current = "featured";
    runBlink("/blink/neptune-saturn-2025.json", t("Loading Neptune and Saturn, June vs December 2025…"));
    // take the map there too, so the blink matches what's on screen
    const v = viewerRef.current;
    if (v) {
      if (cosmicOn.current) leaveCosmic(false);
      const [x, y] = v.project(2.07, -1.03);
      v.flyTo(x, y, Math.max(0.5, 0.8 / Math.tan(20 * (Math.PI / 180))), false);
    }
  };
  const closeBlink = () => {
    blinkReq.current?.abort();
    setBlinkOpen(false);
    setBlinkLoading(null);
  };

  // Load settings & custom waypoints saved in this browser
  useEffect(() => {
    // Modest devices (e.g. school Chromebooks) start in low quality so the map stays smooth; any choice
    // the visitor saves in Settings wins.
    const saved = load<Partial<Settings>>(STORE_SETTINGS, {});
    const nav = navigator as Navigator & { deviceMemory?: number };
    const modest = (nav.hardwareConcurrency || 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
    setSettings({ ...DEFAULT_SETTINGS, ...(modest && !saved.quality ? { quality: "low" as const } : {}), ...saved });
    setCustom(load<Waypoint[]>(STORE_WP, []));
    if (window.innerWidth < 800) setHelp(false);
  }, []);

  const hoverWp = useCallback((h: MapHover | null) => {
    if (h && performance.now() < quietUntil.current) return;
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
        // Star and constellation names in Spanish, from the catalogue (used by the 360° views and cards)
        const es: Record<string, string> = {};
        for (const n of [...sky.named, ...sky.constellations]) if ((n.names as Record<string, string>).es) es[n.names.en] = (n.names as Record<string, string>).es;
        addTranslations("es", es);
        viewer = new StarMapViewer(stageRef.current!, overlayRef.current!, sky, {
          onView: (v: View) => {
            viewRef.current = v;
            // The map calls this every frame while moving: keep the page's own work light
            throttle("minimap", 50, () => minimapRef.current?.draw(viewRef.current!));
            throttle("readout", 100, () => {
              const cur = viewRef.current!;
              const [ra, dec] = viewerRef.current?.toRadec(cur.x, cur.y) ?? [0, 0];
              const L = (k: string) => translate(langRef.current, k);
              const html =
                `<span><b>${L("Center x")}</b> ${fmt(cur.x)}°</span><span><b>${L("Center y")}</b> ${fmt(cur.y)}°</span>` +
                `<span><b>J2000 RA</b> ${raHMS(ra)}</span><span><b>Dec</b> ${fmt(dec)}°</span>` +
                `<span><b>${L("View")}</b> ${cur.radius * 2 < 2 ? `${fmt(cur.radius * 120, 0)}′` : `${fmt(cur.radius * 2, 0)}°`}</span><span><b>${L("Tilt")}</b> ${fmt((cur.phi * 180) / Math.PI, 0)}°</span>`;
              if (readoutRef.current && readoutRef.current.innerHTML !== html) readoutRef.current.innerHTML = html;
            });
            // React state re-renders the whole page, so while the map moves do it at most once a second,
            // then once more as soon as the view settles
            const hud = () => {
              const cur = viewRef.current!;
              const [ra, dec] = viewerRef.current?.toRadec(cur.x, cur.y) ?? [0, 0];
              setCenterCoord((p) => (Math.abs(p.ra - ra) < 1e-5 && Math.abs(p.dec - dec) < 1e-5 ? p : { ra, dec }));
              const f = Math.max(0.3, Math.min(60, cur.radius * 2));
              setFovDeg((p) => (Math.abs(p - f) < 1e-4 ? p : f));
            };
            throttle("hud", 1000, hud);
            if (settleTimer.current) clearTimeout(settleTimer.current);
            settleTimer.current = setTimeout(hud, 160);
            if (loadingRef.current) {
              const text = `${translate(langRef.current, "Loading IRSA tiles")} · ${v.loading}`, op = v.loading ? "1" : "0";
              if (loadingRef.current.style.opacity !== op) loadingRef.current.style.opacity = op;
              if (v.loading && loadingRef.current.textContent !== text) loadingRef.current.textContent = text;
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
          onZoomOutLimit: () => goCosmic(),
        });
        viewerRef.current = viewer;
        viewer.setLanguage(langRef.current, (s) => translate(langRef.current, s));
        viewer.invalidate();

        const { CosmicView } = await import("@/lib/starmap/cosmic");
        if (cancelled) return;
        const cv = new CosmicView(cosmicStageRef.current!, cosmicLabelsRef.current!, sky, {
          onEnterSky: () => leaveCosmic(true),
          onSelect: (g) => setGalaxy(g ? { ...g } : null),
          onIntroEnd: () => setIntro(false),
          onView: (v) => {
            const el = cosmicHudRef.current;
            if (!el) return;
            const d = v.dist >= 1e6 ? `${(v.dist / 1e6).toFixed(1)} million ly` : `${Math.round(v.dist).toLocaleString()} ly`;
            el.innerHTML = `<b>${v.scale}</b><span>${d} from ${v.targetName === "Sun" ? "the Sun" : v.targetName}</span>`;
          },
        });
        cosmicRef.current = cv;
        setReady(true);
        // Old /explore links and shared ?stop= links open that sphere straight away
        // Make sure views for waypoints exist before following a shared link to one
        [...PRESET_WAYPOINTS, ...load<Waypoint[]>(STORE_WP, [])].forEach(waypointStop);
        const urlParams = new URL(window.location.href).searchParams;
        const stop = urlParams.get("stop");
        const raQ = Number(urlParams.get("ra"));
        const decQ = Number(urlParams.get("dec"));
        const fovQ = Number(urlParams.get("fov")) || 1.5;
        if (stop && byId(stop)) {
          leaveCosmic(false); // shared links go straight to their 360° view
          setTimeout(() => enterRef.current(stop), 300);
        } else if (urlParams.has("ra") && urlParams.has("dec") && Number.isFinite(raQ) && Number.isFinite(decQ)) {
          leaveCosmic(false); // coordinate links go straight to that spot on the sky map
          const [tx, ty] = viewer.project(raQ, decQ);
          const dEnd = Math.max(0.5, (fovQ / 2) / Math.tan((40 / 2) * (Math.PI / 180)));
          setTimeout(() => {
            viewer?.flyTo(tx, ty, dEnd, false);
            viewer?.setTargetMarker(raQ, decQ);
            setHasMarker(true);
          }, 200);
        } else {
          viewer.setEnabled(false);
          cv.setActive(true); // first visit: open on the Milky Way, then glide into the Sun and onto the sky map
          cv.playIntro();
          setIntro(true);
        }
      } catch (e) {
        console.error(e);
        setError(translate(langRef.current, "Your browser couldn't start the 3D map. Try a recent version of Chrome, Edge, Firefox or Safari."));
      }
    })();
    return () => {
      cancelled = true;
      cosmicRef.current?.dispose();
      cosmicRef.current = null;
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
      map_xy: { x: +v.x.toFixed(4), y: +v.y.toFixed(4), description: "Current epoch map degrees; not J2000 RA/Dec" },
      map_center: { ra_deg: +ra.toFixed(2), dec_deg: +dec.toFixed(2) },
      field_of_view_deg: +(v.radius * 2).toFixed(1),
      view: sphereRef.current ? "360° view" : v.mode,
      in_360_view_of: sphereRef.current ? byId(sphereRef.current)?.title : null,
      timeline: EPOCHS[e].label,
      imagery: st.layer === "2mass" ? "2MASS" : st.band >= 0 ? `SPHEREx ${SPHEREX_WL[st.band].toFixed(2)} µm` : "SPHEREx color",
      hovering: hv?.wp?.title ?? hv?.object ?? hv?.planet ?? null,
      places_in_view: inView,
      ...(langRef.current === "es" ? { reply_language: "Spanish (es)" } : {}),
    };
  };

  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (navigationTimer.current) clearTimeout(navigationTimer.current); }, []);

  const runAction = (a: AssistantAction): string | null => {
    const viewer = viewerRef.current, sky = skyRef.current;
    if (!viewer || !sky) return null;
    const norm = (t: unknown) => String(t ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const open = !!a.args.open_360;
    if (cosmicOn.current && a.name !== "set_timeline" && a.name !== "set_imagery") leaveCosmic(false);
    const go = (stop: string | null, x: number, y: number, d: number, label: string) => {
      if (navigationTimer.current) clearTimeout(navigationTimer.current);
      const [ra, dec] = viewer.toRadec(x, y);
      viewer.setTargetMarker(ra, dec, label);
      setHasMarker(true);
      if (open && stop) {
        enterSphere(stop);
        return translate(langRef.current, "◎ Opened {name} in 360°", { name: translate(langRef.current, label) });
      }
      const fly = () => viewer.flyTo(x, y, d, false);
      if (sphereRef.current) {
        exitSphere();
        navigationTimer.current = setTimeout(fly, 1700);
      } else fly();
      return translate(langRef.current, "✈ Flew to {name}", { name: translate(langRef.current, label) });
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
        if (!c) return translate(langRef.current, "Couldn't find a constellation called “{name}”", { name: String(a.args.name) });
        const [x, y] = viewer.project(c.center[0], c.center[1]);
        return go(constellationStop(sky, c), x, y, 20, c.names.en);
      }
      case "show_star": {
        const n = norm(a.args.name);
        const s = sky.named.find((k) => Object.values(k.names).some((nm) => norm(nm) === n));
        if (!s) return translate(langRef.current, "Couldn't find a star called “{name}” on the map", { name: String(a.args.name) });
        const [ra, dec] = sky.stars[s.i];
        const [x, y] = viewer.project(ra, dec);
        return go(starStop(sky, s), x, y, 10, s.names.en);
      }
      case "show_map_position": {
        const x = Number(a.args.x), y = Number(a.args.y);
        if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 180 || Math.abs(y) > 90) return "Map x must be between -180° and 180°, and y between -90° and 90°.";
        const [ra, dec] = viewer.toRadec(x, y);
        viewer.setTargetMarker(ra, dec, String(a.args.label ?? "Requested map position"));
        setHasMarker(true);
        return go(null, x, y, 0.3 / (2 * Math.tan(20 * Math.PI / 180)), String(a.args.label ?? "that map position"));
      }
      case "show_sky_position": {
        const ra = Number(a.args.ra_deg), dec = Number(a.args.dec_deg);
        if (!Number.isFinite(ra) || !Number.isFinite(dec) || Math.abs(dec) > 90) return null;
        const [x, y] = viewer.project(((ra % 360) + 360) % 360, dec);
        viewer.setTargetMarker(((ra % 360) + 360) % 360, dec, String(a.args.label ?? "Requested sky position"));
        setHasMarker(true);
        return go(null, x, y, 0.3 / (2 * Math.tan(20 * Math.PI / 180)), String(a.args.label ?? "that spot"));
      }
      case "set_timeline": {
        const i = EPOCHS.findIndex((e) => e.label === a.args.epoch);
        if (i < 0) return null;
        setEpoch(i);
        return translate(langRef.current, "⧗ Timeline set to {when}", { when: translate(langRef.current, EPOCHS[i].label) });
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
        return translate(langRef.current, "Imagery: SPHEREx color");
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

  // ── Search: every named star, all 88 constellations, the Sun and planets, and every waypoint ──
  const searchItems = useMemo<SearchItem[]>(() => {
    const sky = skyRef.current;
    if (!sky) return [];
    const nm = (names: Record<string, string>) => names[lang] ?? names.en;
    const conName = (id: string) => { const c = sky.constellations.find((c) => c.id === id); return c ? nm(c.names) : id; };
    const out: SearchItem[] = [];
    const wpTitles = new Set([...PRESET_WAYPOINTS, ...custom].map((w) => w.title.toLowerCase()));
    for (const n of sky.named) {
      if (wpTitles.has(n.names.en.toLowerCase())) continue; // listed once, as its waypoint
      const mag = sky.stars[n.i][2];
      out.push({ id: n.names.en, name: nm(n.names), kind: "Star", sub: `${conName(n.con)} · mag ${mag.toFixed(1)}`, alt: Object.values(n.names) });
    }
    for (const c of sky.constellations)
      out.push({ id: c.id, name: nm(c.names), kind: "Constellation", sub: c.id, alt: [c.id, ...Object.values(c.names)] });
    for (const id of ["sun", "mercury", "venus", "earth", "moon", "mars", "jupiter", "saturn", "uranus", "neptune"]) {
      const lm = byId(id);
      if (lm) out.push({ id, name: lm.title, kind: "Planet", sub: lm.subtitle, alt: [t(lm.title)] });
    }
    for (const w of [...PRESET_WAYPOINTS, ...custom])
      out.push({ id: w.id, name: w.title, kind: w.custom ? "Your waypoint" : "Place", sub: w.kind, alt: [w.id] });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, custom, lang]);

  const pickSearch = (it: SearchItem) => {
    if (it.id === "moon") {
      // The Moon has no fixed spot on the map: open its 360° view
      if (cosmicOn.current) leaveCosmic(false);
      enterSphere("moon");
      return;
    }
    const action: AssistantAction =
      it.kind === "Star"
        ? { name: "show_star", args: { name: it.id } }
        : it.kind === "Constellation"
          ? { name: "show_constellation", args: { name: it.id } }
          : { name: "show_place", args: { id: it.id } };
    runAction(action);
  };

  // Follow the dataset: ask which SPHEREx map IRSA publishes now, on load and every 30 minutes. A new
  // release or a re-published map swaps in by itself (tiles, dates, wavelengths).
  useEffect(() => {
    if (!ready) return;
    const check = () =>
      fetch("/api/hips")
        .then((r) => (r.ok ? r.json() : null))
        .then((c: LiveCatalog | null) => {
          if (!c?.spherex) return;
          viewerRef.current?.setLive(c);
          setLive(c);
        })
        .catch(() => {});
    check();
    const t = setInterval(check, 30 * 60 * 1000);
    return () => clearInterval(t);
  }, [ready]);

  // Map labels follow the language too
  useEffect(() => {
    viewerRef.current?.setLanguage(lang, (s) => translate(lang, s));
  }, [lang, ready]);

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
    <div ref={rootRef} role="main" aria-label={t("Sky Explorer: an interactive map of the infrared sky")} className={`mv ${toolsOpen ? "tools-open" : ""} ${sphere && !closing ? "in-sphere" : ""} ${cosmic ? "in-cosmic" : ""}`}>
      <div ref={stageRef} className="mv-stage">
        <div ref={overlayRef} className="mv-overlay" />
      </div>

      {/* Zoomed out: the Milky Way and nearby galaxies */}
      <div ref={cosmicStageRef} className={`cv-stage ${cosmic ? "on" : ""}`} aria-hidden={!cosmic}>
        <div ref={cosmicLabelsRef} className="cv-labels" />
      </div>
      {cosmic && ready && (
        <>
          {intro && (
            <button className="mv-glass cv-skip" onClick={() => cosmicRef.current?.skipIntro()}>
              {t("Skip intro →")}
            </button>
          )}
          <div className={`mv-glass cv-hud ${intro ? "intro" : ""}`}>
            <div ref={cosmicHudRef} className="cv-scale" />
            <p>{t("Drag to turn · scroll to zoom. Zoom into the Sun to see its constellations.")}</p>
            <p className="cv-note">{t("The Milky Way here is an illustration of its shape; the nearby stars are real (HYG catalogue).")}</p>
            <button className="mv-primary" onClick={() => cosmicRef.current?.dive()}>
              {t("Zoom into the Sun ↓")}
            </button>
          </div>
          {galaxy && (
            <aside className="mv-glass cv-card" aria-live="polite">
              <span className="mv-kind">{t(galaxy.kind)}</span>
              <h2>{t(galaxy.name)}</h2>
              <p>{t(galaxy.description)}</p>
              <dl>
                <div>
                  <dt>{t("Distance")}</dt>
                  <dd>{galaxy.dist ? (galaxy.dist >= 1e6 ? `${lang === "es" ? `${(galaxy.dist / 1e6).toFixed(1).replace(".", ",")} millones de años luz` : `${(galaxy.dist / 1e6).toFixed(1)} million ly`}` : `${(galaxy.dist / 1000).toFixed(0)},000 ly`) : t("We're inside it")}</dd>
                </div>
                <div>
                  <dt>{t("Size")}</dt>
                  <dd>≈ {galaxy.size.toLocaleString(lang === "es" ? "es-ES" : "en-US")} {lang === "es" ? "años luz" : "ly"}</dd>
                </div>
              </dl>
              <div className="mv-wp-actions">
                {galaxy.wp && (
                  <button
                    className="mv-primary"
                    onClick={() => {
                      const wp = PRESET_WAYPOINTS.find((w) => w.id === galaxy.wp);
                      leaveCosmic(false);
                      if (wp) enterSphere(waypointStop(wp));
                    }}
                  >
                    {t("View in 360° ↗")}
                  </button>
                )}
                <button className="mv-secondary" onClick={() => cosmicRef.current?.flyHome()}>
                  {t("Back to the Milky Way")}
                </button>
              </div>
            </aside>
          )}
        </>
      )}

      {!ready && !error && <div className="mv-loading">{t("Laying out the sky…")}</div>}
      {error && <div className="mv-loading">{error}</div>}

      {/* Top-left: title & 2D/3D */}
      <div className="mv-top-left">
        <div className="mv-top-row">
          <SiteTabs active="explorer" />
        <div className="mv-glass mv-seg" role="tablist" aria-label={t("View mode")}>
          <button
            role="tab"
            aria-selected={!sphere && !cosmic && mode === "2d"}
            onClick={() => {
              exitSphere();
              leaveCosmic(false);
              viewerRef.current?.set2D(true);
            }}
          >
            2D
          </button>
          <button
            role="tab"
            aria-selected={!sphere && !cosmic && mode === "3d"}
            onClick={() => {
              exitSphere();
              leaveCosmic(false);
              viewerRef.current?.set2D(false);
            }}
          >
            3D
          </button>
        </div>
        <button className={`mv-glass mv-ask ${askOpen ? "on" : ""}`} onClick={() => setAskOpen((o) => !o)} aria-expanded={askOpen} title={t("Ask the sky guide (/)")}>
          {t("✦ Ask")}
        </button>
        <Search items={searchItems} onPick={pickSearch} />
        <button className={`mv-glass mv-tools-btn ${toolsOpen ? "on" : ""}`} onClick={() => setToolsOpen((o) => !o)} aria-expanded={toolsOpen} aria-label={t("Coordinates and Blink tools")}>
          {t("Tools")}
        </button>
        </div>
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
          onBlinkHere={() => blinkHere()}
          onFeatured={() => blinkFeatured()}
        />
      </div>

      {/* Top-right: actions, minimap, readout */}
      <div className="mv-top-right">
        <div className="mv-actions">
          <LangSwitch className="mv-glass" />
          <button
            className="mv-glass mv-pill"
            onClick={() => {
              const p = viewerRef.current?.pointOfInterest();
              if (p) setAdding({ x: p.x, y: p.y });
            }}
            title={t("Add a waypoint (Shift+G)")}
          >
            {t("+ Waypoint")} <kbd>⇧G</kbd>
          </button>
          <button className="mv-wrench" onClick={() => setShowSettings(true)} aria-label={t("Settings")} title={t("Settings")}>
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
        <Collapsible id="map-overview" closedOnSmall className="mv-glass mv-minicard" title={<span className="cl-label">{t("Overview")}</span>} summary={t(layerById(settings.layer).name)}>
          <Minimap ref={minimapRef} onMove={(x, y) => viewerRef.current?.setTarget(x, y)} />
          <button className="mv-data-btn" onClick={() => setDataAt({ ...centerCoord })} title={t("The real SPHEREx images of the middle of your view, ready to download")}>
            {t("⇩ Get the real data here")}
          </button>
          <div ref={readoutRef} className="mv-readout" title={t("These are view-center coordinates. Scrolling zooms toward your cursor, which can shift the center. Share J2000 RA/Dec for a fixed sky position.")} />
          <ImageryControl settings={settings} set={set} />
          {live?.spherex && (
            <p className="mv-live" title={t("Checked against NASA/IPAC IRSA's live catalogue at {time}. When IRSA publishes new SPHEREx data, this map switches to it automatically.", { time: new Date(live.checkedAt).toLocaleTimeString(lang === "es" ? "es-ES" : "en-US", { hour: "2-digit", minute: "2-digit" }) })}>
              <i aria-hidden="true" /> {t("Live from IRSA · {name} updated {date}", { name: live.spherex.name, date: live.spherex.released })}
            </p>
          )}
        </Collapsible>
        <div ref={loadingRef} className="mv-glass mv-loadpill" aria-live="polite" />
      </div>

      {/* Zoom & home */}
      <div className="mv-zoom">
        <button className="mv-glass" onClick={goCosmic} aria-label={t("Zoom out to the galaxies")} title={t("Zoom out to the galaxies")}>
          ⊙
        </button>
        <button className="mv-glass" onClick={() => viewerRef.current?.zoomBy(0.7)} aria-label={t("Zoom in")}>
          +
        </button>
        <button className="mv-glass" onClick={() => viewerRef.current?.zoomBy(1.4)} aria-label={t("Zoom out")}>
          −
        </button>
        <button className="mv-glass" onClick={() => viewerRef.current?.home()} aria-label={t("Back to the origin")} title={t("Back to the origin (H)")}>
          ⌂
        </button>
        <button className="mv-glass mv-tour-btn" onClick={() => setTour(true)} aria-label={t("Show the tour again")} title={t("Show the tour again")}>
          ?
        </button>
        <button className="mv-glass mv-quest-btn" onClick={() => setQuestOpen(true)} aria-label={t("Rescue mission")} title={t("Rescue mission (optional)")}>
          <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
            <circle cx="12" cy="13" r="2" fill="currentColor" />
            <path d="M8.5 9.5a5 5 0 0 0 0 7M15.5 9.5a5 5 0 0 1 0 7M5.6 6.6a9 9 0 0 0 0 12.8M18.4 6.6a9 9 0 0 1 0 12.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <Tutorial open={tour} hidden={!!sphere || cosmic} mode={mode} inSphere={!!sphere} sphereKind={sphere ? (byId(sphere)?.kind ?? null) : null} onClose={() => {
          setTour(false);
          // then, after a few seconds of exploring on their own, offer the optional mission
          if (questTimer.current) clearTimeout(questTimer.current);
          if (!loadQuest().offered) questTimer.current = setTimeout(() => setQuestOpen(true), QUEST_DELAY);
        }}
      />
      {blinkOpen && (
        <BlinkViewer
          data={blinkData}
          loading={blinkLoading}
          error={blinkError}
          onClose={closeBlink}
          onRetry={() => (blinkLast.current === "featured" ? blinkFeatured() : blinkHere())}
          onFeatured={blinkFeatured}
          onData={(ra, dec) => setDataAt({ ra, dec })}
        />
      )}
      {dataAt && <DataPanel ra={dataAt.ra} dec={dataAt.dec} onClose={() => setDataAt(null)} />}
      <Quest
        open={questOpen}
        hidden={cosmic || tour || blinkOpen}
        sphere={sphere}
        center={centerCoord}
        bandUm={settings.layer === "spherex" && settings.band >= 0 ? SPHEREX_WL[settings.band] : null}
        star={questStar}
        planet={questPlanet}
        onCenter={(name) => runAction({ name: "show_star", args: { name } })}
        toScreen={(ra, dec) => viewerRef.current?.screenOf(ra, dec) ?? null}
        onClose={() => setQuestOpen(false)}
      />

      {/* Controls help */}
      <Collapsible id="map-controls" closedOnSmall className="mv-glass mv-help" title={<span className="cl-label">{t("Controls")}</span>} defaultOpen={help}>
        {(
          <>
          <ul className="mv-touch-help">
            <li><b>{t("Move")}</b> {t("drag with one finger")}</li>
            <li><b>{t("Zoom")}</b> {t("pinch · double-tap to zoom in")}</li>
            <li><b>{t("Rotate")}</b> {t("twist two fingers")}</li>
            <li><b>{t("Tilt into 3D")}</b> {t("slide two fingers up or down")}</li>
            <li><b>{t("360° view")}</b> {t("tap any planet, star or constellation name to fly there, then tap it again")}</li>
          </ul>
          <ul className="mv-key-help">
            <li><b>{t("Pan")}</b> {t("middle-drag · left-drag ·")} <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></li>
            <li><b>{t("Orbit")}</b> <kbd>{t("Shift")}</kbd> {t("+ middle-drag · right-drag ·")} <kbd>Q</kbd><kbd>E</kbd> <kbd>R</kbd><kbd>F</kbd></li>
            <li><b>{t("Zoom")}</b> {t("scroll ·")} <kbd>Z</kbd><kbd>X</kbd></li>
            <li><b>2D / 3D</b> <kbd>T</kbd> {t("· tilt near flat to snap to 2D")}</li>
            <li><b>{t("360° view")}</b> {t("click any diamond, planet, star or constellation name to fly there, then click it again (or keep zooming in)")}</li>
            <li><b>{t("Waypoint")}</b> <kbd>{t("Shift")}</kbd>+<kbd>G</kbd> · <b>{t("Home")}</b> <kbd>H</kbd></li>
          </ul>
          </>
        )}
      </Collapsible>

      {/* The summary card pops out of the hovered diamond or planet (rendered inside the viewer's card host) */}
      {hover &&
        settings.descriptions &&
        viewerRef.current &&
        createPortal(
          <div
            className="mv-pop"
            key={hover.wp?.id ?? hover.stop ?? hover.planet}
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
                onData={(ra, dec) => setDataAt({ ra, dec })}
              />
            ) : (
              <PlanetDetails
                hover={hover}
                near={hover.stop === nearStop}
                onStep={enterSphere}
                onTravel={() => viewerRef.current?.flyTo(hover.x, hover.y, 10, false)}
              />
            )}
            <button className="mv-primary" onClick={() => askAbout(hover.wp?.title ?? hover.object ?? hover.planet ?? "this object")}>{t("Ask about {name}", { name: t(hover.wp?.title ?? hover.object ?? hover.planet ?? "this object") })}</button>
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
        closedOnSmall
        className="mv-glass mv-timeline"
        title={
          <div className="mv-tl-head">
            <span className="cl-label">{t("Timeline")}</span>
            <strong>{t(ep.label)}</strong>
          </div>
        }
      >
        <p className="mv-tl-note">
          {t(ep.note)}
          {!planetsValid(epochYear(ep)) && settings.planets && <em> {t("Planets hidden: too far from today to calculate reliably.")}</em>}
        </p>
        <Timeline value={epoch} onChange={setEpoch} />
      </Collapsible>

      {travel && !sphere && <div className="mv-travel">{t("Traveling to {name}…", { name: t(travel) })}</div>}

      <Assistant draft={assistantDraft} open={askOpen} onClose={() => setAskOpen(false)} getContext={assistantContext} runAction={runAction} />

      {/* The 360° sphere opens right here, over the map */}
      {sphere && (
        <>
          <div className={`mv-sphere ${closing ? "closing" : ""}`} onAnimationEnd={(e) => e.animationName === "mv-sphere-out" && finishExit()}>
            <SphereView onAsk={askAbout} stopId={sphere} onStop={enterSphere} onExit={exitSphere} />
          </div>
        </>
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
  onData,
}: {
  wp: Waypoint;
  viewer: StarMapViewer | null;
  imaged: string;
  near: boolean;
  onStep: (stop: string) => void;
  onDelete: (id: string) => void;
  onData: (ra: number, dec: number) => void;
}) {
  const t = useT();
  return (
    <>
      <span className="mv-kind" style={wp.color ? { background: wp.color } : undefined}>
        {t(wp.kind)}
      </span>
      <h2>{t(wp.title)}</h2>
      <p>{t(wp.description)}</p>
      {wp.significance && (
        <p className="mv-sig">
          <b>{t("Why it matters:")}</b> {t(wp.significance)}
        </p>
      )}
      <dl>
        <div className="wide">
          <dt>{t("Image taken")}</dt>
          <dd>{imaged}</dd>
        </div>
        <div className="wide">
          <dt>{t(wp.custom ? "Added" : "Recorded")}</dt>
          <dd>{wp.date || "—"}</dd>
        </div>
        <div>
          <dt>{t("Map x, y")}</dt>
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
        <button className="mv-primary" onClick={() => onStep(waypointStop(wp))}>
          {t("View in 360° ↗")}
        </button>
        {!near && (
          <button className="mv-secondary" onClick={() => viewer?.travelTo(wp)}>
            {t("Travel here")}
          </button>
        )}
        <button className="mv-secondary" onClick={() => onData(wp.ra, wp.dec)} title={t("Download the real SPHEREx images of this spot")}>
          {t("Real data")}
        </button>
        {wp.custom && (
          <button className="mv-secondary" onClick={() => onDelete(wp.id)}>
            {t("Delete")}
          </button>
        )}
      </div>
    </>
  );
}

/** The hover card for a planet or the Sun: its 360° stop's summary. */
function PlanetDetails({ hover, near, onStep, onTravel }: { hover: MapHover; near: boolean; onStep: (stop: string) => void; onTravel: () => void }) {
  const t = useT();
  const tv = useTV();
  const lm = hover.stop ? byId(hover.stop) : null;
  if (!lm) return null;
  return (
    <>
      <span className="mv-kind">{t(lm.subtitle)}</span>
      <h2>{t(lm.title)}</h2>
      <p>{t(lm.description)}</p>
      <dl>
        {lm.facts.slice(0, 2).map(([k, v]) => (
          <div key={k}>
            <dt>{t(k)}</dt>
            <dd>{tv(v)}</dd>
          </div>
        ))}
        <div className="wide">
          <dt>{t("Position today")}</dt>
          <dd>
            {t("Map")} {fmt(hover.x)}°, {fmt(hover.y)}°
          </dd>
        </div>
      </dl>
      <div className="mv-wp-actions">
        <button className="mv-primary" onClick={() => onStep(lm.id)}>
          {t("View in 360° ↗")}
        </button>
        {!near && (
          <button className="mv-secondary" onClick={onTravel}>
            {t("Travel here")}
          </button>
        )}
      </div>
    </>
  );
}

function AddWaypoint({ at, toRadec, onCancel, onSave }: { at: { x: number; y: number }; toRadec: (x: number, y: number) => [number, number]; onCancel: () => void; onSave: (wp: Waypoint) => void }) {
  const t = useT();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState(() => t("My waypoint"));
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
        <h2>{t("New waypoint")}</h2>
        <button type="button" className="mv-close" onClick={onCancel} aria-label={t("Close")}>
          ×
        </button>
      </div>
      <p className="mv-add-pos">
        {t("At")} x {fmt(at.x)}°, y {fmt(at.y)}° · RA {raHMS(ra)}, Dec {fmt(dec)}°
      </p>
      <label>
        {t("Name")}
        <input ref={first} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("e.g. My favorite star")} required maxLength={60} />
      </label>
      <label>
        {t("Object type")}
        <input value={kind} onChange={(e) => setKind(e.target.value)} maxLength={40} />
      </label>
      <label>
        {t("Description")}
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={280} placeholder={t("What's here?")} />
      </label>
      <label>
        {t("Why it matters")}
        <textarea value={significance} onChange={(e) => setSignificance(e.target.value)} rows={2} maxLength={200} />
      </label>
      <label>
        {t("Date")}
        <input value={date} onChange={(e) => setDate(e.target.value)} maxLength={40} />
      </label>
      <fieldset>
        <legend>{t("Color")}</legend>
        <div className="mv-swatches">
          {PASTELS.map((c) => (
            <button type="button" key={c} className={c === color ? "on" : ""} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Color ${c}`} aria-pressed={c === color} />
          ))}
        </div>
      </fieldset>
      <div className="mv-wp-actions">
        <button type="submit" className="mv-primary" disabled={!title.trim()}>
          {t("Add waypoint")}
        </button>
        <button type="button" className="mv-secondary" onClick={onCancel}>
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}

// ───────────────────────── Imagery (which IRSA data you're looking at) ─────────────────────────

function ImageryControl({ settings, set }: { settings: Settings; set: (k: keyof Settings, v: Settings[keyof Settings]) => void }) {
  const t = useT();
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
      <div className="mv-imagery-seg" role="radiogroup" aria-label={t("Map imagery")}>
        <button role="radio" aria-checked={mode === "color"} onClick={() => switchMode("spherex", -1)}>{t("SPHEREx color")}</button>
        <button role="radio" aria-checked={mode === "band"} onClick={() => isolate(band)}>{t("Isolate infrared")}</button>
        <button role="radio" aria-checked={mode === "2mass"} onClick={() => switchMode("2mass", -1)}>2MASS</button>
      </div>
      <div className="mv-ir-presets" role="group" aria-label={t("Isolate an infrared layer")}>
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
            {t(settings.overlays.length ? "Overlay blend active" : "Infrared layer isolated")} · {SPHEREX_WL[settings.band].toFixed(3)} µm
          </p>
          <label className="mv-band">
            <span><b>{SPHEREX_WL[band].toFixed(3)} µm</b> · {t("channel {n} of 102", { n: band + 1 })}</span>
            <input type="range" min={0} max={available.length - 1} value={Math.max(0, available.indexOf(band))}
              onChange={(e) => isolate(available[Number(e.target.value)], true)} aria-label={t("SPHEREx wavelength")}
              aria-valuetext={`${SPHEREX_WL[band].toFixed(3)} micrometers, channel ${band + 1}`} />
          </label>
          <label className="mv-ir-select">{t("Choose a wavelength")}
            <select value={band} onChange={(e) => isolate(Number(e.target.value))}>
              {SPHEREX_WL.map((w, i) => <option key={i} value={i} disabled={BLANK_FRAMES.has(i)}>
                {w.toFixed(3)} µm · {t("channel {n}", { n: i + 1 })}{BLANK_FRAMES.has(i) ? ` — ${t("no DR1 data")}` : ""}
              </option>)}
            </select>
          </label>
          <div className="mv-ir-steps">
            <button type="button" disabled={band === available[0]} onClick={() => stepBand(-1)}>{t("← Previous")}</button>
            <button type="button" disabled={band === available[available.length - 1]} onClick={() => stepBand(1)}>{t("Next →")}</button>
          </div>
          {settings.overlays.length > 0 && <button type="button" className="mv-ir-clear" onClick={() => isolate(band)}>{t("Remove overlays and isolate")}</button>}
          <p className="mv-imagery-note">{t("One wavelength only; survey overlays are removed. Display colors are artificial. Channels 51–52 have no DR1 data.")}</p>
        </div>
      )}
      {mode === "color" && <p className="mv-imagery-note">{t("Blue 1.0 µm · green 2.2 µm · red 3.3 µm. Use the presets above to isolate one layer.")}</p>}
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
      aria-label={useT()("Overview map: drag the circle to move")}
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
  const t = useT();
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
            <span>{t(ep.label)}</span>
          </button>
        ))}
        <div
          className={`mv-tl-handle ${dragPos !== null ? "dragging" : ""}`}
          style={{ left: `${pos * 100}%` }}
          role="slider"
          tabIndex={0}
          aria-label={t("Date")}
          aria-valuemin={0}
          aria-valuemax={n - 1}
          aria-valuenow={value}
          aria-valuetext={t(EPOCHS[value].label)}
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
  ["grid", "Measurement grid", "Graph-paper lines with labeled degrees that adapt as you zoom, and bold axes through the origin"],
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
  const t = useT();
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className={`mv-settings ${open ? "open" : ""}`} aria-hidden={!open} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mv-settings-panel" role="dialog" aria-modal="true" aria-label={t("Settings")}>
        <div className="mv-settings-head">
          <h2>{t("Settings")}</h2>
          <button className="mv-primary" onClick={onClose}>
            {t("Done")}
          </button>
        </div>

        <section className="mv-lang-sec">
          <h3>{t("Language / Idioma")}</h3>
          <LangSwitch />
        </section>

        <section>
          <h3>{t("Map imagery from IRSA")}</h3>
          <p className="mv-note">{t("Live tiles from NASA/IPAC's Infrared Science Archive, its most recent releases first.")}</p>
          {BASE_LAYERS.map((l) => (
            <label key={l.id} className="mv-toggle">
              <span>
                <b>{l.name}</b>
                <small>
                  {t("Released {r} · observed {o}", { r: l.released, o: l.observed })}
                </small>
              </span>
              <input type="radio" name="mv-base" checked={settings.layer === l.id} onChange={() => set("layer", l.id as Settings["layer"])} />
              <i aria-hidden="true" />
            </label>
          ))}
          <h3 className="mv-subhead">{t("Extra layers (where they have data)")}</h3>
          {OVERLAYS.map((l) => (
            <label key={l.id} className="mv-toggle">
              <span>
                <b>{l.name}</b>
                <small>
                  {t("Released {r} · observed {o}", { r: l.released, o: l.observed })}
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
          <h3>{t("Display")}</h3>
          {TOGGLES.map(([k, label, hint]) => (
            <label key={k} className="mv-toggle">
              <span>
                <b>{t(label)}</b>
                <small>{t(hint)}</small>
              </span>
              <input type="checkbox" checked={settings[k] as boolean} onChange={(e) => set(k, e.target.checked)} />
              <i aria-hidden="true" />
            </label>
          ))}
        </section>

        <section>
          <h3>{t("Performance")}</h3>
          <p className="mv-note">{t("The map only draws tiles near what you can see, and uses less detail as you zoom out.")}</p>
          <div className="mv-seg-row">
            {(["low", "auto", "high"] as const).map((q) => (
              <button key={q} className={settings.quality === q ? "on" : ""} onClick={() => set("quality", q)}>
                {t(q === "auto" ? "Auto" : q === "low" ? "Battery saver" : "High detail")}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>{t("Controls")}</h3>
          <ul className="mv-keys">
            <li><span>{t("Pan")}</span><span>{t("Middle-drag, left-drag, or")} <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> {t("/ arrows")}</span></li>
            <li><span>{t("Orbit")}</span><span><kbd>{t("Shift")}</kbd> {t("+ middle-drag, right-drag, or")} <kbd>Q</kbd><kbd>E</kbd> {t("(turn)")} <kbd>R</kbd><kbd>F</kbd> {t("(tilt)")}</span></li>
            <li><span>{t("Zoom")}</span><span>{t("Scroll wheel, pinch, or")} <kbd>Z</kbd><kbd>X</kbd></span></li>
            <li><span>2D / 3D</span><span><kbd>T</kbd>{t(", or tilt to nearly flat and let go to snap")}</span></li>
            <li><span>{t("New waypoint")}</span><span><kbd>{t("Shift")}</kbd> + <kbd>G</kbd></span></li>
            <li><span>{t("Back to origin")}</span><span><kbd>H</kbd></span></li>
          </ul>
        </section>

        <section>
          <h3>{t("Your waypoints")}</h3>
          <p className="mv-note">
            {t("{mine} of {count} waypoints are yours. They're saved in this browser; export them to share or add to the team database.", { mine: custom.length, count })}
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
              {t("Export")}
            </button>
            <button onClick={() => file.current?.click()}>{t("Import")}</button>
            <button onClick={() => custom.length && confirm(t("Delete all your waypoints?")) && setCustom([])} disabled={!custom.length}>
              {t("Clear mine")}
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
                alert(t("That file isn't a waypoint list."));
              }
              e.target.value = "";
            }}
          />
        </section>

        <section>
          <h3>{t("About the data")}</h3>
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
