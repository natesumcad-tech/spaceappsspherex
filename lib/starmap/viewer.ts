import * as THREE from "three";
import { discardDetailedTile } from "../explorer/zoom-policy";
import type { SkyData } from "@/lib/explorer/astro";
import { DEG, MAP_H, MAP_W, planetPositions, projector, unprojector } from "./coords";
import { SPHEREX, SPHEREX_RGB, applyLive, layerById, makeLoader, renderTile, type LiveCatalog, type TileRequest } from "./hips";
import { constellationStop, starStop, waypointStop } from "@/lib/explorer/dynamic";
import type { Waypoint } from "./data";
import { KeyState, isShiftToken } from "./keyState";

export type Settings = {
  /** Base imagery: the SPHEREx DR1 cube or 2MASS color. */
  layer: "spherex" | "2mass";
  /** SPHEREx frame (0–101) for a single wavelength, or -1 for the three-color view. */
  band: number;
  /** Extra IRSA surveys drawn on top where they have data. */
  overlays: string[];
  glow: boolean;
  lines: boolean;
  names: boolean;
  descriptions: boolean;
  waypoints: boolean;
  grid: boolean;
  planets: boolean;
  quality: "auto" | "high" | "low";
};
export const DEFAULT_SETTINGS: Settings = {
  layer: "spherex",
  band: -1,
  overlays: [],
  glow: true,
  lines: true,
  names: true,
  descriptions: true,
  waypoints: true,
  grid: true,
  planets: true,
  quality: "auto",
};

/** What's being hovered on the map; the summary card pops out of it. */
export type MapHover = { wp?: Waypoint; planet?: string; object?: string; stop?: string; x: number; y: number };

export type View = { x: number; y: number; d: number; phi: number; theta: number; radius: number; mode: "2d" | "3d"; tiles: number; loading: number };

type Events = {
  onView: (v: View) => void;
  /** Hovering a waypoint diamond or a planet (null when the pointer leaves). */
  onHover: (h: MapHover | null) => void;
  onTravel: (wp: Waypoint) => void;
  onOverview: (c: HTMLCanvasElement) => void;
  /** A waypoint or planet you're already close to was clicked: open its 360° view. */
  onEnter: (stop: string) => void;
  /** Kept scrolling out at the widest view: zoom out to the galaxies. */
  onZoomOutLimit?: () => void;
  /** The landmark you're close enough to step into changed (null = none). */
  onNear: (stop: string | null) => void;
};

/** The few words the map itself writes, per language. */
const UI = {
  en: {
    labelSuffix: ": travel, explore or ask a question",
    view360: "View in 360°",
    waypoint: "Waypoint",
    destination: "Destination",
    planets: {} as Record<string, string>,
  },
  es: {
    labelSuffix: ": viajar, explorar o preguntar",
    view360: "Ver en 360°",
    waypoint: "Punto de interés",
    destination: "Destino",
    planets: { Sun: "Sol", Mercury: "Mercurio", Venus: "Venus", Mars: "Marte", Jupiter: "Júpiter", Saturn: "Saturno", Uranus: "Urano", Neptune: "Neptuno", Earth: "Tierra" } as Record<string, string>,
  },
};

/** How close (camera distance, and offset from the center of the view) counts as "arrived". */
const NEAR_D = 22;

const PLANET_STOPS: Record<string, string> = {
  Sun: "sun",
  Mercury: "mercury",
  Venus: "venus",
  Mars: "mars",
  Jupiter: "jupiter",
  Saturn: "saturn",
  Uranus: "uranus",
  Neptune: "neptune",
  Earth: "earth",
};

/**
 * Earth can't appear in its own sky, so the map shows it where you'd see it from the Sun:
 * exactly opposite the Sun (it drifts around the sky over the year, like the planets).
 */
function withEarth(list: ReturnType<typeof planetPositions>) {
  const sun = list.find((p) => p.name === "Sun");
  return sun ? [...list, { name: "Earth", ra: (sun.ra + 180) % 360, dec: -sun.dec, color: "#6fa8dc" }] : list;
}

type TileEntry = { mesh: THREE.Mesh; tex: THREE.DataTexture | null; px: number; version: string; used: number; L: number; retryAt?: number };
type Tween = { start: number; ms: number; step: (t: number) => void; done?: () => void };
type Overlay = {
  el: HTMLElement; x: number; y: number; kind: "con" | "star" | "planet" | "wp"; minD?: number; maxD?: number; wp?: Waypoint; stop?: string;
  /** What was last written to the page, so unchanged labels cost nothing per frame. */
  shown?: boolean; sx?: number; sy?: number; op?: number; isNear?: boolean;
};

const ROOT = 30; // level-0 tile size in degrees (12 × 6 tiles)
const LMAX = 8; // deepest level: 30 / 2⁸ ≈ 0.12° tiles, so zooming in stays sharp
const MAX_TILES = 96; // never draw more than this many tiles at once
const CACHE_CAP = 200; // textures kept in memory
const PHI_MAX = 72 * DEG; // tilt limit: you can never get under the baseplate
const SNAP_PHI = 12 * DEG; // let go of an orbit this close to top-down and it snaps to 2D
const D_MIN = 0.3; // zoom right in: about 13 arcminutes across the screen
const D_MAX = 260;
/** Zoomed in this close on a landmark, continued scrolling in opens its 360° view. */
const ENTER_360_D = 2.2;
const FOV = 40;
const PLATE_DEPTH = 0.6;
const EDGE_FADE = 10; // degrees over which the map dissolves into the black void at its edges

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const CAM_KEYS = new Set([
  "w", "a", "s", "d", "q", "e", "r", "f", "z", "x", "=", "-",
  "arrowup", "arrowdown", "arrowleft", "arrowright",
  "shiftleft", "shiftright", "shift",
]);

export class StarMapViewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 2000);
  private tileGroup = new THREE.Group();
  private tiles = new Map<string, TileEntry>();
  private queue = new Map<string, { L: number; i: number; j: number; pri: number }>();
  private lines = new THREE.Group();
  private grid = new THREE.Group();
  private extraImages = new THREE.Group();
  private overlays: Overlay[] = [];
  private pivot: HTMLDivElement;
  /** The hover card lives in here; it rides along with whatever you're hovering. */
  readonly cardHost: HTMLDivElement;
  private cardAt: { x: number; y: number } | null = null;
  private warp: HTMLCanvasElement;
  private ro: ResizeObserver;
  private cleanup: (() => void)[] = [];

  // Camera state: a target on the plane, a distance, a tilt (phi, 0 = straight down) and a heading (theta).
  private target = new THREE.Vector2(0, 0);
  private d = 70;
  private phi = 0;
  private theta = 0;

  private settings: Settings = { ...DEFAULT_SETTINGS };
  private years = 0;
  private planetsOn = true;
  private worker: Worker | null = null;
  private fallbackLoad: ReturnType<typeof makeLoader> | null = null;
  private reqId = 0;
  private pending = new Map<number, { key: string; version: string; L: number; i: number; j: number } | { overview: true; version: string }>();
  private inflight = new Map<string, string>(); // tile key → version being fetched
  private overviewVersion = "";
  private version = "";
  private waypoints: Waypoint[] = [];

  private raf = 0;
  private inFrame = false;
  private dirty = true;
  private tweens: Tween[] = [];
  private keys = new KeyState();
  private keyVel = { x: 0, y: 0 };
  private drag: { mode: "pan" | "orbit"; x: number; y: number; anchor: THREE.Vector2 | null; id: number } | null = null;
  private touches = new Map<number, { x: number; y: number }>();
  /** Two-finger gesture: zoom, twist and move together (anchored between the fingers), or tilt. */
  private pinch = { dist: 0, ang: 0, mx: 0, my: 0, mode: "" as "" | "transform" | "tilt", acc: 0, ay: 0, by: 0 };
  /** Recent one-finger tap, for double-tap to zoom. */
  private tap = { t: 0, x: 0, y: 0, downAt: 0, moved: false, lastT: 0, lastX: 0, lastY: 0 };
  private lastTime = performance.now();
  private cursor: THREE.Vector2 | null = null;
  private warpT = 0;
  private stars: { a: number; r: number; v: number; c: string }[] = [];
  private reticlePos: { ra: number; dec: number } | null = null;
  private reticle = document.createElement("div");
  private visibleTiles = 0;
  private wantedTileKeys = new Set<string>();

  constructor(
    private container: HTMLElement,
    private overlayLayer: HTMLElement,
    private sky: SkyData,
    private events: Events,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    // 1.5× is sharp on retina screens at about half the pixels of 2× (the map is mostly soft imagery)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = "mv-canvas";
    container.prepend(this.renderer.domElement);

    this.pivot = document.createElement("div");
    this.pivot.className = "mv-pivot";
    overlayLayer.appendChild(this.pivot);
    this.cardHost = document.createElement("div");
    this.cardHost.className = "mv-cardhost";
    this.cardHost.style.display = "none";
    overlayLayer.appendChild(this.cardHost);
    this.warp = document.createElement("canvas");
    this.warp.className = "mv-warp";
    this.warp.style.display = "none";
    container.appendChild(this.warp);

    this.scene.fog = new THREE.Fog(0x000000, 200, 400); // distance fades to the black background
    this.buildPlate();
    this.scene.add(this.tileGroup, this.grid, this.lines, this.extraImages);
    this.startWorker();
    this.rebuildEpochLayers();
    this.buildGrid();
    this.loadImageManifest();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.bindInput();
    this.resize();
    this.requestOverview();
  }

  // ───────────────────────── IRSA tiles (background worker) ─────────────────────────

  private startWorker() {
    try {
      this.worker = new Worker(new URL("./tile.worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (e: MessageEvent<{ id: number; px?: Uint8ClampedArray; partial?: boolean }>) =>
        this.onResult(e.data.id, e.data.px ?? null, !!e.data.partial);
      this.worker.onerror = () => {
        this.worker = null; // fall back to the page thread
        this.fallbackLoad = makeLoader(60e6);
      };
    } catch {
      this.fallbackLoad = makeLoader(60e6);
    }
  }

  private send(req: TileRequest) {
    if (this.worker) this.worker.postMessage(req);
    else {
      this.fallbackLoad ??= makeLoader(60e6);
      renderTile(req, this.fallbackLoad).then(
        (r) => this.onResult(req.id, r.px, r.partial),
        () => this.onResult(req.id, null, true),
      );
    }
  }

  /** Which IRSA release the tiles come from (changes when IRSA re-publishes the map). */
  private liveRev = SPHEREX.v ?? "";
  /** Use the SPHEREx map IRSA publishes right now; tiles already on screen stay until the new ones arrive. */
  setLive(c: LiveCatalog) {
    applyLive(c);
    this.worker?.postMessage({ live: c });
    const rev = c.spherex?.v ?? "";
    if (rev === this.liveRev) return;
    this.liveRev = rev;
    this.requestOverview();
    this.invalidate();
  }

  private imagery() {
    const s = this.settings;
    return {
      rev: this.liveRev,
      base: s.layer,
      frames: s.layer === "spherex" ? (s.band >= 0 ? [s.band] : [...SPHEREX_RGB]) : [0],
      overlays: s.overlays,
      light: s.glow,
      detail: s.quality === "high" ? 1.5 : s.quality === "low" ? 0.6 : 1,
    };
  }

  private requestOverview() {
    const version = `${this.years.toFixed(2)}|${JSON.stringify(this.imagery())}`;
    if (version === this.overviewVersion) return;
    this.overviewVersion = version;
    const id = ++this.reqId;
    this.pending.set(id, { overview: true, version });
    this.send({ id, x0: -180, y0: -90, w: 360, h: 180, W: 768, H: 384, years: this.years, ...this.imagery(), overlays: [], topDown: true });
  }

  private onResult(id: number, px: Uint8ClampedArray | null, partial = false) {
    const job = this.pending.get(id);
    this.pending.delete(id);
    if (!job) return;
    if ("overview" in job) {
      if (!px || job.version !== this.overviewVersion) return;
      if (partial) {
        this.overviewVersion = ""; // some downloads failed: redraw the overview again shortly
        setTimeout(() => this.requestOverview(), 3000);
      }
      const c = Object.assign(document.createElement("canvas"), { width: 768, height: 384 });
      c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(px), 768, 384), 0, 0);
      this.events.onOverview(c);
      return;
    }
    if (this.inflight.get(job.key) === job.version) this.inflight.delete(job.key);
    if (!px || job.version !== this.version || !this.wantedTileKeys.has(job.key)) {
      this.invalidate();
      return;
    }
    // Uploading a tile to the graphics card is the expensive part: queue it, and the frame loop
    // uploads a couple per frame, so a burst of arrivals never freezes a frame.
    this.uploads.push({ key: job.key, L: job.L, i: job.i, j: job.j, px, version: partial ? `${job.version}|partial` : job.version, partial });
    this.invalidate();
  }

  private uploads: { key: string; L: number; i: number; j: number; px: Uint8ClampedArray; version: string; partial: boolean }[] = [];
  private drainUploads(max: number) {
    let n = 0;
    while (this.uploads.length && n < max) {
      const u = this.uploads.shift()!;
      if (!u.version.startsWith(this.version) || !this.wantedTileKeys.has(u.key)) continue; // scrolled away meanwhile
      this.uploadTile(u.key, u.L, u.i, u.j, u.px, u.version);
      n++;
      if (u.partial) {
        // Some downloads failed: keep what arrived, and try this tile again shortly.
        this.tiles.get(u.key)!.retryAt = performance.now() + 2500;
        setTimeout(() => this.invalidate(), 2600);
      }
    }
    return this.uploads.length > 0;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.cleanup.forEach((f) => f());
    for (const t of this.tiles.values()) this.disposeTile(t);
    this.worker?.terminate();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.warp.remove();
    this.overlayLayer.innerHTML = "";
  }

  // ───────────────────────── Scene ─────────────────────────

  /**
   * The map sits on a black baseplate, and its edges dissolve into the black void: four soft
   * gradient strips lie over the borders, so there's no hard edge from any angle.
   */
  private buildPlate() {
    const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(MAP_W, PLATE_DEPTH, MAP_H), black);
    plate.position.y = -PLATE_DEPTH / 2 - 0.002;
    plate.renderOrder = 0;
    this.scene.add(plate);

    const c = Object.assign(document.createElement("canvas"), { width: 256, height: 4 });
    const ctx = c.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(0.35, "rgba(0,0,0,0.75)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 4);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const strip = (len: number, cx: number, cy: number, rot: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(EDGE_FADE, len), mat);
      m.rotation.set(-Math.PI / 2, 0, rot);
      m.position.set(cx, 0.004, -cy);
      m.renderOrder = 15; // over the imagery, under lines and labels
      this.scene.add(m);
    };
    const h = EDGE_FADE / 2;
    strip(MAP_H, -180 + h, 0, 0); // west edge: dark side outward
    strip(MAP_H, 180 - h, 0, Math.PI); // east edge
    strip(MAP_W, 0, 90 - h, -Math.PI / 2); // north edge
    strip(MAP_W, 0, -90 + h, Math.PI / 2); // south edge
  }

  // ───────────────────────── Measurement grid (Desmos-style) ─────────────────────────
  // Minor and major lines whose spacing adapts to the zoom, bold axes through the origin, and a
  // number on every major line, along the axes or pinned to the screen edge.

  private gridMinor = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xf2e6d0, transparent: true, opacity: 0.1, depthWrite: false, fog: false }));
  private gridMajor = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xf2e6d0, transparent: true, opacity: 0.32, depthWrite: false, fog: false }));
  private gridAxes = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xf7efdf, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
  private gridKey = "";
  private gridLabels: HTMLDivElement[] = [];
  private gridLabelLayer!: HTMLDivElement;
  private gridInfo = { major: 10, minor: 2, bounds: [0, 0, 0, 0] as [number, number, number, number] };

  private buildGrid() {
    this.grid.add(this.gridMinor, this.gridMajor, this.gridAxes);
    this.grid.position.y = 0.012;
    this.gridMinor.renderOrder = this.gridMajor.renderOrder = 20;
    this.gridAxes.renderOrder = 22;
    this.grid.visible = this.settings.grid;
    this.gridLabelLayer = document.createElement("div");
    this.gridLabelLayer.className = "mv-gridlabels";
    this.overlayLayer.prepend(this.gridLabelLayer);
  }

  /** Major spacing in a 1–2–5 sequence; minor lines split it in 5 (or 4 for a "2"). */
  private static gridSteps(span: number) {
    const raw = span / 8;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    const [k, div] = m < 1.5 ? [1, 5] : m < 3.5 ? [2, 4] : m < 7.5 ? [5, 5] : [10, 5];
    const major = Math.min(30, k * p);
    return { major, minor: major / (major === 30 ? 6 : div) };
  }

  /** The part of the map you can see (map degrees), from rays through the screen edges. */
  private visibleBounds(): [number, number, number, number] {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const R = this.renderRadius;
    for (let a = -1; a <= 1; a += 0.5)
      for (let b = -1; b <= 1; b += 0.5) {
        let p = this.pickNDC(a, b);
        if (!p || p.distanceTo(this.target) > R) {
          const ray = new THREE.Raycaster();
          ray.setFromCamera(new THREE.Vector2(a, b), this.camera);
          const h = new THREE.Vector2(ray.ray.direction.x, -ray.ray.direction.z);
          p = h.lengthSq() < 1e-6 ? this.target.clone() : this.target.clone().add(h.normalize().multiplyScalar(R));
        }
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y);
        y1 = Math.max(y1, p.y);
      }
    return [Math.max(-180, x0), Math.min(180, x1), Math.max(-90, y0), Math.min(90, y1)];
  }

  private updateGrid() {
    const b = this.visibleBounds();
    // Size the grid from what fits on screen (the shorter side), so it reads like Desmos at every zoom
    const span = Math.max(1e-3, Math.min(Math.max(b[1] - b[0], b[3] - b[2]), this.d * 2 * Math.tan((FOV / 2) * DEG) * Math.max(1, this.camera.aspect)));
    const { major, minor } = StarMapViewer.gridSteps(span);
    const snap = (v: number, s: number, f: (n: number) => number) => f(v / s) * s;
    const gb: [number, number, number, number] = [
      Math.max(-180, snap(b[0], major, Math.floor)),
      Math.min(180, snap(b[1], major, Math.ceil)),
      Math.max(-90, snap(b[2], major, Math.floor)),
      Math.min(90, snap(b[3], major, Math.ceil)),
    ];
    this.gridInfo = { major, minor, bounds: b };
    const key = `${major}|${gb.join(",")}`;
    if (key === this.gridKey) return;
    this.gridKey = key;
    const mi: number[] = [], ma: number[] = [], ax: number[] = [];
    const eps = minor * 1e-3;
    const nX = Math.round((gb[1] - gb[0]) / minor), nY = Math.round((gb[3] - gb[2]) / minor);
    if (nX > 600 || nY > 600) return;
    for (let i = 0; i <= nX; i++) {
      const x = gb[0] + i * minor;
      const isMajor = Math.abs(x / major - Math.round(x / major)) < eps / major;
      const isAxis = Math.abs(x) < eps;
      (isAxis ? ax : isMajor ? ma : mi).push(x, 0, -gb[2], x, 0, -gb[3]);
    }
    for (let j = 0; j <= nY; j++) {
      const y = gb[2] + j * minor;
      const isMajor = Math.abs(y / major - Math.round(y / major)) < eps / major;
      const isAxis = Math.abs(y) < eps;
      (isAxis ? ax : isMajor ? ma : mi).push(gb[0], 0, -y, gb[1], 0, -y);
    }
    const set = (l: THREE.LineSegments, pts: number[]) => {
      l.geometry.dispose();
      l.geometry = new THREE.BufferGeometry();
      l.geometry.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    };
    set(this.gridMinor, mi);
    set(this.gridMajor, ma);
    set(this.gridAxes, ax);
  }

  private static fmtTick(v: number, step: number) {
    const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    const s = Math.abs(v) < step * 1e-6 ? "0" : v.toFixed(dec);
    return `${s.replace("-", "−")}°`;
  }

  /** Numbers on the major lines: along the axes when they're in view, else pinned to the screen edges. */
  private obstacles: { l: number; r: number; t: number; b: number }[] = [];
  private gridLabelState: { cls: string; text: string; tf: string; on: boolean }[] = [];
  private obstaclesAt = 0;
  private updateGridLabels() {
    const layer = this.gridLabelLayer;
    if (!this.settings.grid || !this.enabled) {
      layer.style.display = "none";
      return;
    }
    layer.style.display = "";
    const { major, bounds: b } = this.gridInfo;
    const w = this.vw, h = this.vh;
    const v = new THREE.Vector3();
    const pad = (b[1] - b[0]) * 0.04, padY = (b[3] - b[2]) * 0.06;
    // Anchor rows/columns: the axis if visible, otherwise just inside the bottom / left of the view
    const yAnchor = THREE.MathUtils.clamp(0, b[2] + padY, b[3] - padY);
    const xAnchor = THREE.MathUtils.clamp(0, b[0] + pad, b[1] - pad);
    const items: { text: string; x: number; y: number; cls: string }[] = [];
    // Panels on screen: numbers hop just clear of them instead of hiding underneath
    // (measured a few times a second, not every frame: measuring forces the page to re-lay itself out)
    const tNow = performance.now();
    if (tNow - this.obstaclesAt > 300) {
      this.obstaclesAt = tNow;
      const cr = this.container.getBoundingClientRect();
      this.obstacles = [...document.querySelectorAll<HTMLElement>(".mv-glass, .mv-blink-bar, .mv-coord-form, .mv-wrench, .mv-cardhost .mv-pop")]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({ l: r.left - cr.left - 4, r: r.right - cr.left + 4, t: r.top - cr.top - 4, b: r.bottom - cr.top + 4 }));
    }
    const obstacles = this.obstacles;
    const pinRight = xAnchor > b[0] + (b[1] - b[0]) / 2; // y numbers sit on the side the axis is on
    const push = (wx: number, wy: number, text: string, cls: string) => {
      v.set(wx, 0, -wy).project(this.camera);
      if (v.z > 1 || Math.abs(v.x) > 0.97 || Math.abs(v.y) > 0.97) return;
      let x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      const tw = text.length * 6.6 + 8;
      for (let pass = 0; pass < 3; pass++) {
        const hit = obstacles.find((o) =>
          cls === "gx" || cls === "g0" ? x + tw / 2 > o.l && x - tw / 2 < o.r && y + 18 > o.t && y < o.b : y + 8 > o.t && y - 8 < o.b && (pinRight ? x - tw - 6 < o.r && x > o.l : x + tw + 6 > o.l && x < o.r),
        );
        if (!hit) break;
        if (cls === "gx" || cls === "g0") y = hit.t - 20; // hop above the panel, keeping the line's x
        else x = pinRight ? hit.l - 2 : hit.r + 2; // hop beside the panel, keeping the line's y
      }
      if (x < 0 || x > w || y < 0 || y > h - 12) return;
      items.push({ text, x, y, cls: cls === "gy" && pinRight ? "gy right" : cls });
    };
    const xs = Math.ceil(b[0] / major), xe = Math.floor(b[1] / major);
    const ys = Math.ceil(b[2] / major), ye = Math.floor(b[3] / major);
    if (xe - xs > 60 || ye - ys > 60) return;
    for (let i = xs; i <= xe; i++) if (i !== 0) push(i * major, yAnchor, StarMapViewer.fmtTick(i * major, major), "gx");
    for (let j = ys; j <= ye; j++) if (j !== 0) push(xAnchor, j * major, StarMapViewer.fmtTick(j * major, major), "gy");
    if (Math.abs(xAnchor) < 1e-9 && Math.abs(yAnchor) < 1e-9) push(0, 0, "0", "g0");
    while (this.gridLabels.length < items.length) {
      const el = document.createElement("div");
      layer.appendChild(el);
      this.gridLabels.push(el);
    }
    this.gridLabels.forEach((el, k) => {
      const it = items[k];
      const last = this.gridLabelState[k] ?? (this.gridLabelState[k] = { cls: "", text: "", tf: "", on: true });
      if (!it) {
        if (last.on) el.style.display = "none";
        last.on = false;
        return;
      }
      if (!last.on) el.style.display = "";
      last.on = true;
      const cls = `mv-gl ${it.cls}`, tf = `translate(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px)`;
      if (cls !== last.cls) el.className = last.cls = cls;
      if (it.text !== last.text) el.textContent = last.text = it.text;
      if (tf !== last.tf) el.style.transform = last.tf = tf;
    });
  }

  /** Constellation lines, labels, planets and waypoints all move with the epoch on the timeline. */
  private rebuildEpochLayers() {
    const proj = projector(this.years);
    this.lines.clear();
    const seg: number[] = [];
    for (const c of this.sky.constellations)
      for (const line of c.lines)
        for (let k = 0; k < line.length - 1; k++) {
          const [x1, y1] = proj(line[k][0], line[k][1]);
          const [x2, y2] = proj(line[k + 1][0], line[k + 1][1]);
          if (Math.abs(x1 - x2) > 90) continue; // don't draw across the map's left/right seam
          seg.push(x1, 0, -y1, x2, 0, -y2);
        }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
    const ls = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xc9c2ff, transparent: true, opacity: 0.55, depthWrite: false }));
    ls.renderOrder = 21;
    this.lines.add(ls);
    this.lines.position.y = 0.02;
    this.lines.visible = this.settings.lines;

    // Overlays (DOM, positioned after each render)
    this.overlays.filter((o) => o.kind !== "wp").forEach((o) => o.el.remove());
    this.overlays = this.overlays.filter((o) => o.kind === "wp");
    for (const c of this.sky.constellations) {
      const [x, y] = proj(c.center[0], c.center[1]);
      const el = this.addOverlay("con", c.names.en, x, y, { maxD: c.rank <= 2 ? D_MAX : 160 }, (c.names as Record<string, string>)[this.lang] ?? c.names.en);
      this.makeEnterable(el, constellationStop(this.sky, c), x, y, 20);
    }
    for (const s of this.sky.named) {
      const [ra, dec, mag] = this.sky.stars[s.i];

      const [x, y] = proj(ra, dec);
      const el = this.addOverlay("star", s.names.en, x, y, { maxD: mag > 1.6 ? 22 : 70 }, (s.names as Record<string, string>)[this.lang] ?? s.names.en);
      this.makeEnterable(el, starStop(this.sky, s), x, y, 10);
    }
    if (this.planetsOn)
      for (const p of withEarth(planetPositions(this.years + 2000))) {
        const [x, y] = proj(p.ra, p.dec);
        const el = this.addOverlay("planet", p.name, x, y, {}, UI[this.lang].planets[p.name] ?? p.name);
        el.style.setProperty("--pc", p.color);
        const stop = PLANET_STOPS[p.name];
        if (stop) {
          this.makeEnterable(el, stop, x, y, 10);

        }
      }
    this.placeWaypoints();
  }

  /** Street View style: the first click flies you there; once you've arrived, a second click steps inside. */
  /** `width`: how far the hovered label reaches to the right, so the card opens just past it. */
  private hover(h: MapHover, width = 0) {
    this.cardAt = { x: h.x, y: h.y };
    this.cardHost.style.setProperty("--off", `${Math.max(18, width + 4)}px`);
    this.events.onHover(h);
    this.invalidate();
  }

  /** Hide the hover card (the page calls this once the card has closed). */
  clearCard() {
    this.cardAt = null;
    this.cardHost.style.display = "none";
  }

  private makeEnterable(el: HTMLElement, stop: string, x: number, y: number, flyD: number) {
    const o = this.overlays[this.overlays.length - 1];
    o.stop = stop;
    el.classList.add("link");
    el.title = "Click to travel · hover or focus when zoomed in to ask about this object";
    const object = el.textContent ?? "this object";
    const prompt = () => {
      if (this.d <= NEAR_D) this.hover({ object, stop, x, y }, el.offsetWidth);
    };
    el.addEventListener("pointerenter", prompt);
    el.addEventListener("focus", prompt);
    el.addEventListener("pointerleave", () => this.events.onHover(null));
    el.addEventListener("blur", () => this.events.onHover(null));
    el.addEventListener("pointerdown", e => e.stopPropagation());
    el.insertAdjacentHTML("beforeend", `<em class="mv-360">${UI[this.lang].view360}</em>`);
    el.addEventListener("click", () => (el.classList.contains("near") ? this.events.onEnter(stop) : this.flyTo(x, y, flyD, false)));
  }

  /** `name` is the English name (kept on the element for matching); the label shows it in the chosen language. */
  private addOverlay(kind: Overlay["kind"], name: string, x: number, y: number, o: { maxD?: number; minD?: number }, shown = name) {
    const text = shown;
    const el = document.createElement("button");
    el.type = "button";
    el.className = `mv-ov mv-${kind} mv-object`;
    el.dataset.name = name;
    el.setAttribute("aria-label", `${text}${UI[this.lang].labelSuffix}`);
    el.appendChild(document.createElement("i"));
    const caption = document.createElement("span");
    caption.textContent = text;
    el.appendChild(caption);
    el.style.display = "none";
    this.overlayLayer.appendChild(el);
    this.overlays.push({ el, x, y, kind, ...o });
    return el;
  }

  setWaypoints(list: Waypoint[]) {
    this.waypoints = list;
    this.placeWaypoints();
  }

  private placeWaypoints() {
    this.overlays.filter((o) => o.kind === "wp").forEach((o) => o.el.remove());
    this.overlays = this.overlays.filter((o) => o.kind !== "wp");
    const proj = projector(this.years);
    for (const wp of this.waypoints) {
      const [x, y] = proj(wp.ra, wp.dec);
      const el = document.createElement("button");
      el.className = `mv-ov mv-wp${wp.custom ? " custom" : ""}`;
      el.appendChild(document.createElement("i")); // the diamond itself (the button carries the screen position)
      const stop = waypointStop(wp); // every waypoint has a 360° view
      el.insertAdjacentHTML("beforeend", `<em class="mv-360">${UI[this.lang].view360}</em>`);
      el.dataset.name = wp.title;
      el.setAttribute("aria-label", `${UI[this.lang].waypoint}: ${this.tr(wp.title)}`);
      if (wp.color) el.style.setProperty("--wc", wp.color);
      el.style.display = "none";
      el.addEventListener("pointerenter", () => this.hover({ wp, stop: waypointStop(wp), x, y }));
      el.addEventListener("pointerleave", () => this.events.onHover(null));
      el.addEventListener("focus", () => this.hover({ wp, stop: waypointStop(wp), x, y }));
      el.addEventListener("blur", () => this.events.onHover(null));
      el.addEventListener("pointerdown", (e) => e.stopPropagation());
      // Street View style: the first click flies you there, a second click (once you've arrived) steps inside.
      el.addEventListener("click", () => (el.classList.contains("near") ? this.events.onEnter(stop) : this.travelTo(wp)));
      this.overlayLayer.appendChild(el);
      this.overlays.push({ el, x, y, kind: "wp", wp, stop });
    }
    this.invalidate();
  }

  /** Optional real images with coordinates: list them in /data/map-images.json and they're placed by RA/Dec. */
  private async loadImageManifest() {
    try {
      const res = await fetch("/data/map-images.json");
      if (!res.ok) return;
      const list: { src: string; ra: number; dec: number; widthDeg: number; heightDeg: number }[] = await res.json();
      const proj = projector(0);
      const loader = new THREE.TextureLoader();
      for (const img of list) {
        const [x, y] = proj(img.ra, img.dec);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(img.widthDeg, img.heightDeg), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95 }));
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x, 0.005, -y);
        mesh.renderOrder = 10;
        mesh.visible = false;
        mesh.userData = { src: img.src, loaded: false, loader };
        this.extraImages.add(mesh);
      }
      this.invalidate();
    } catch {
      /* no manifest: nothing to add */
    }
  }

  // ───────────────────────── Public controls ─────────────────────────

  /** Label language for star, constellation and planet names ("en", "es", …). */
  private lang: keyof typeof UI = "en";
  /** Translates waypoint names (set by the page). */
  private tr: (text: string) => string = (text) => text;
  setLanguage(lang: string, tr?: (text: string) => string) {
    if (tr) this.tr = tr;
    const l = (lang in UI ? lang : "en") as keyof typeof UI;
    if (l === this.lang) return;
    this.lang = l;
    this.rebuildEpochLayers();
    this.invalidate();
  }

  setSettings(s: Partial<Settings>) {
    const prev = this.settings;
    this.settings = { ...prev, ...s };
    this.lines.visible = this.settings.lines;
    this.grid.visible = this.settings.grid;
    this.requestOverview();
    this.invalidate();
  }

  /** Move the whole sky to another epoch (years relative to 2000). */
  setEpoch(years: number, showPlanets: boolean) {
    this.years = years;
    this.planetsOn = showPlanets;
    this.rebuildEpochLayers();
    this.requestOverview();
    this.invalidate();
  }

  /** J2000 RA/Dec of a map point at the current epoch (for saving custom waypoints). */
  toRadec(x: number, y: number) {
    return unprojector(this.years)(x, y);
  }

  setTarget(x: number, y: number) {
    this.target.set(clamp(x, -180, 180), clamp(y, -90, 90));
    this.invalidate();
  }

  /** The point on the map under the mouse (or the center of the view). */
  pointOfInterest() {
    return (this.cursor ?? this.target).clone();
  }

  set2D(on: boolean) {
    const from = { phi: this.phi, theta: this.theta };
    const toPhi = on ? 0 : 50 * DEG;
    const toTheta = on ? Math.round(this.theta / (Math.PI * 2)) * Math.PI * 2 : this.theta;
    this.animate(700, (t) => {
      const e = ease(t);
      this.phi = from.phi + (toPhi - from.phi) * e;
      this.theta = from.theta + (toTheta - from.theta) * e;
    });
  }

  zoomBy(factor: number) {
    const from = this.d, to = clamp(this.d * factor, D_MIN, D_MAX);
    this.animate(250, (t) => (this.d = from + (to - from) * ease(t)));
  }

  home() {
    this.flyTo(0, 0, 70, true);
  }

  /**
   * Leaving a 360° view — the stepping-inside flight played backwards: the map waits right on top of
   * the spot (hidden under the fading sphere), then flies back out with the same hyperspace streaks.
   */
  pullOut(toD = 14, ms = 1100, delay = 0) {
    this.tweens = [];
    if (this.pullTimer) clearTimeout(this.pullTimer);
    this.lockedUntil = performance.now() + delay + ms;
    const from = clamp(Math.min(this.d, 1.1), D_MIN, D_MAX), to = Math.max(toD, from);
    this.d = from;
    this.invalidate();
    this.pullTimer = setTimeout(() => {
      this.pullTimer = null;
      this.startWarp();
      this.animate(ms, (t) => {
        this.d = Math.exp(Math.log(from) + (Math.log(to) - Math.log(from)) * ease(t));
        this.warpT = Math.sin(Math.PI * t);
      }, () => (this.warpT = 0));
    }, delay);
  }
  private pullTimer: ReturnType<typeof setTimeout> | null = null;
  private lockedUntil = 0;

  /** Coming down from the galaxy view: start at the widest view and settle in on the origin. */
  arriveFromSpace() {
    this.tweens = [];
    this.target.set(0, 0);
    this.phi = 0;
    this.d = D_MAX;
    this.animate(1500, (t) => (this.d = D_MAX + (70 - D_MAX) * (1 - Math.pow(1 - t, 3))));
  }

  travelTo(wp: Waypoint) {
    const [x, y] = projector(this.years)(wp.ra, wp.dec);
    this.events.onTravel(wp);
    this.flyTo(x, y, 14, false);
  }

  /** Place a subtle target reticle at J2000 (ra, dec) in degrees. */
  setTargetMarker(ra: number, dec: number, label?: string) {
    this.reticlePos = { ra, dec };
    this.reticle.className = "mv-reticle";
    this.reticle.replaceChildren();
    const diamond = document.createElement("span");
    diamond.className = "mv-reticle-ring";
    const caption = document.createElement("span");
    caption.className = "mv-reticle-label";
    caption.textContent = UI[this.lang].destination;
    this.reticle.append(diamond, caption);
    this.reticle.title = `${label ?? UI[this.lang].destination} · J2000 RA ${ra.toFixed(8)}°, Dec ${dec.toFixed(8)}°`;
    this.reticle.setAttribute("role", "img");
    this.reticle.setAttribute("aria-label", this.reticle.title);
    if (!this.reticle.parentElement) this.pivot.parentElement?.appendChild(this.reticle);
    this.dirty = true;
  }

  clearTargetMarker() {
    this.reticlePos = null;
    this.reticle.style.display = "none";
    this.dirty = true;
  }

  /** Fast travel with a hyperspace effect: pull back, streak across, drop in. */
  flyTo(x: number, y: number, dEnd: number, flat: boolean) {
    this.tweens = []; // A newer destination replaces any earlier camera flight or pull-out.
    const from = { x: this.target.x, y: this.target.y, d: this.d, phi: this.phi };
    const dist = Math.hypot(x - from.x, y - from.y);
    const ms = 900 + Math.min(900, dist * 5);
    const lift = Math.min(140, dist * 0.6);
    this.startWarp();
    this.animate(ms, (t) => {
      const e = ease(t);
      this.target.set(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
      this.d = from.d + (dEnd - from.d) * e + lift * Math.sin(Math.PI * e);
      if (flat) this.phi = from.phi * (1 - e);
      this.warpT = Math.sin(Math.PI * t);
    }, () => {
      this.target.set(x, y);
      this.d = dEnd;
      if (flat) this.phi = 0;
      this.warpT = 0;
    });
  }

  private animate(ms: number, step: (t: number) => void, done?: () => void) {
    this.tweens.push({ start: performance.now(), ms, step, done });
    this.invalidate();
  }

  /** While a sphere is open the map sits idle and ignores the mouse and keyboard. */
  private enabled = true;
  setEnabled(on: boolean) {
    this.enabled = on;
    this.keys.clear();
    this.keyVel.x = 0;
    this.keyVel.y = 0;
    this.drag = null;
    if (on) this.invalidate();
  }

  /** Where a J2000 RA/Dec lands on the map at the current epoch. */
  project(ra: number, dec: number) {
    return projector(this.years)(ra, dec);
  }

  private scratch = new THREE.Vector3();
  /** Where an RA/Dec lands on screen, in pixels from the map's top-left (may be off screen). */
  screenOf(ra: number, dec: number) {
    const [x, y] = this.project(ra, dec);
    const v = this.scratch.set(x, 0, -y).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.vw, y: (-v.y * 0.5 + 0.5) * this.vh, behind: v.z > 1 };
  }

  /** Map position of a planet right now (for flying to it before stepping inside). */
  planetXY(name: string) {
    const p = withEarth(planetPositions(this.years + 2000)).find((q) => q.name.toLowerCase() === name);
    return p ? this.project(p.ra, p.dec) : null;
  }

  /** Ask for a frame. Nothing is drawn unless something changed. */
  invalidate() {
    this.dirty = true;
    if (!this.raf && !this.inFrame) {
      this.lastTime = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  // ───────────────────────── Camera ─────────────────────────

  private updateCamera() {
    this.d = clamp(this.d, D_MIN, D_MAX);
    this.phi = clamp(this.phi, 0, PHI_MAX);
    const tx = this.target.x, tz = -this.target.y;
    const sp = Math.sin(this.phi), cp = Math.cos(this.phi), st = Math.sin(this.theta), ct = Math.cos(this.theta);
    this.camera.position.set(tx + this.d * sp * st, this.d * cp, tz + this.d * sp * ct);
    // "Up" is the horizontal forward direction: north stays up in 2D, and there's never any roll in 3D.
    this.camera.up.set(-st, 0, -ct);
    this.camera.lookAt(tx, 0, tz);
    this.camera.near = Math.max(0.05, this.d * 0.02);
    this.camera.far = this.d * 6 + this.renderRadius * 3 + 50;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  /** How far around the target we bother drawing anything; beyond it the map fades into the fog. */
  private get renderRadius() {
    return clamp(this.d * (1.4 + 3 * Math.sin(this.phi)), 12, 320);
  }

  private pickNDC(nx: number, ny: number): THREE.Vector2 | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const { origin, direction } = ray.ray;
    if (direction.y > -1e-4) return null;
    const t = -origin.y / direction.y;
    return new THREE.Vector2(origin.x + direction.x * t, -(origin.z + direction.z * t));
  }

  private pickClient(cx: number, cy: number) {
    const r = this.container.getBoundingClientRect();
    return this.pickNDC(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  }

  // ───────────────────────── Tiles ─────────────────────────

  private get tilePx() {
    return this.settings.quality === "low" ? 128 : 256;
  }

  /** Works out which tiles the camera can see, at what detail, and shows them (or a stand-in). Returns true if work is left. */
  private updateTiles(): boolean {
    const version = `${this.years.toFixed(2)}|${JSON.stringify(this.imagery())}|${this.tilePx}`;
    this.version = version;
    const R = this.renderRadius;

    // Footprint of the view on the plane (a 5×5 grid of rays, clipped to the render radius)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let a = -1; a <= 1; a += 0.5)
      for (let b = -1; b <= 1; b += 0.5) {
        let p = this.pickNDC(a, b);
        if (!p || p.distanceTo(this.target) > R) {
          const ray = new THREE.Raycaster();
          ray.setFromCamera(new THREE.Vector2(a, b), this.camera);
          const h = new THREE.Vector2(ray.ray.direction.x, -ray.ray.direction.z);
          p = h.lengthSq() < 1e-6 ? this.target.clone() : this.target.clone().add(h.normalize().multiplyScalar(R));
        }
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
    minX = Math.max(-180, minX - 2);
    maxX = Math.min(180, maxX + 2);
    minY = Math.max(-90, minY - 2);
    maxY = Math.min(90, maxY + 2);

    // Quadtree: split a tile while it would cover more than one tile's worth of screen pixels.
    const cam = this.camera.position;
    const camX = cam.x, camY = -cam.z, camH = cam.y;
    const H = this.vh;
    const q = this.settings.quality === "high" ? 1.6 : this.settings.quality === "low" ? 0.6 : Math.min(window.devicePixelRatio || 1, 1.5);
    let threshold = ((this.tilePx / H) * FOV * DEG) / q;
    let wanted: { L: number; i: number; j: number; dist: number }[] = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      wanted = [];
      const visit = (L: number, i: number, j: number) => {
        const s = ROOT / 2 ** L, x0 = i * s, y0 = j * s;
        if (x0 > maxX || x0 + s < minX || y0 > maxY || y0 + s < minY) return;
        const nx = clamp(this.target.x, x0, x0 + s), ny = clamp(this.target.y, y0, y0 + s);
        if (Math.hypot(nx - this.target.x, ny - this.target.y) > R) return; // beyond the fog
        const cx = clamp(camX, x0, x0 + s), cy = clamp(camY, y0, y0 + s);
        const dist = Math.hypot(cx - camX, cy - camY, camH);
        // Level 0 is only a quick stand-in: its 30° tiles look blotchy when seen at an angle.
        if (L === 0 || (L < LMAX && s / dist > threshold)) {
          for (let k = 0; k < 4; k++) visit(L + 1, i * 2 + (k & 1), j * 2 + (k >> 1));
        } else wanted.push({ L, i, j, dist });
      };
      for (let i = -6; i < 6; i++) for (let j = -3; j < 3; j++) visit(0, i, j);
      if (wanted.length <= MAX_TILES) break;
      threshold *= 1.5; // too many tiles: drop detail rather than frame rate
    }

    this.wantedTileKeys = new Set(wanted.flatMap((t) => [
      `${t.L}/${t.i}/${t.j}`, `0/${t.i >> t.L}/${t.j >> t.L}`,
    ]));
    const maxWantedLevel = Math.max(0, ...wanted.map((t) => t.L));
    const now = performance.now();
    const show = new Set<string>();
    this.queue.clear();
    for (const t of wanted) {
      const key = `${t.L}/${t.i}/${t.j}`;
      const entry = this.tiles.get(key);
      if (entry && entry.version === version) {
        show.add(key);
        continue;
      }
      this.queue.set(key, { L: t.L, i: t.i, j: t.j, pri: t.L * 4 + t.dist / Math.max(1, this.d) });
      if (entry) {
        show.add(key); // an older version keeps the spot warm while the new one renders
        continue;
      }
      // Stand in with the nearest ready ancestor
      for (let L = t.L - 1, i = t.i, j = t.j; L >= 0; L--) {
        i = Math.floor(i / 2);
        j = Math.floor(j / 2);
        const k = `${L}/${i}/${j}`;
        if (this.tiles.has(k)) {
          show.add(k);
          break;
        }
      }
    }

    // Always fetch the coarse level-0 tile under every visible tile first: it's cheap and acts as a
    // blurry stand-in while the detailed tiles load, so the map never shows holes.
    for (const t of wanted) {
      const i0 = t.i >> t.L, j0 = t.j >> t.L, k0 = `0/${i0}/${j0}`;
      const e0 = this.tiles.get(k0);
      if (t.L > 0 && (!e0 || e0.version !== version) && !this.queue.has(k0)) this.queue.set(k0, { L: 0, i: i0, j: j0, pri: -100 + t.dist / Math.max(1, this.d) });
    }

    // Ask the worker for the most important missing tiles, a few at a time.
    const order = [...this.queue.entries()].sort((a, b) => a[1].pri - b[1].pri);
    for (const [key, t] of order) {
      if (this.inflight.size >= 6) break;
      if (this.inflight.get(key) === version) continue;
      if ((this.tiles.get(key)?.retryAt ?? 0) > performance.now()) continue;
      const s = ROOT / 2 ** t.L, id = ++this.reqId;
      this.inflight.set(key, version);
      this.pending.set(id, { key, version, L: t.L, i: t.i, j: t.j });
      const px = this.pixelsFor(t.L);
      this.send({ id, x0: t.i * s, y0: t.j * s, w: s, h: s, W: px, H: px, years: this.years, ...this.imagery() });
    }

    for (const [key, e] of this.tiles) {
      const vis = show.has(key);
      e.mesh.visible = vis;
      if (vis) e.used = now;
    }
    this.visibleTiles = show.size;
    // The quadtree has already returned to the distance-appropriate normal detail.
    // Release unused close-up textures now, even when the cache is below its cap.
    for (const [key, entry] of this.tiles) {
      if (discardDetailedTile(entry.L, maxWantedLevel, show.has(key))) {
        this.disposeTile(entry);
        this.tiles.delete(key);
      }
    }
    this.evict(show);
    return false; // tiles arrive asynchronously and request their own frame
  }

  /**
   * Resolution scaling: once you zoom past the finest data a survey has, ask for a smaller tile that
   * matches the data and let the GPU smooth it, instead of rendering big blocky pixels.
   */
  private pixelsFor(L: number) {
    const s = ROOT / 2 ** L, ppd = this.tilePx / s;
    const im = this.imagery();
    const finest = Math.max(layerById(im.base).maxOrder, ...im.overlays.map((o) => layerById(o).maxOrder));
    const want = Math.ceil(Math.log2(((58.63 * ppd) / 512) * im.detail));
    const extra = want - finest;
    return extra > 0 ? Math.max(32, this.tilePx >> extra) : this.tilePx;
  }

  private uploadTile(key: string, L: number, i: number, j: number, px: Uint8ClampedArray, version: string) {
    const s = ROOT / 2 ** L, size = Math.round(Math.sqrt(px.length / 4));
    let e = this.tiles.get(key);
    if (!e) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(i * s + s / 2, 0, -(j * s + s / 2));
      mesh.renderOrder = 1 + L; // finer tiles draw over their stand-ins
      mesh.material.depthWrite = false;
      this.tileGroup.add(mesh);
      e = { mesh, tex: null, px: size, version, used: performance.now(), L };
      this.tiles.set(key, e);
    }
    const tex = new THREE.DataTexture(new Uint8Array(px.buffer), size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy()); // 4× keeps tilted tiles crisp; 16× costs up to 16 lookups per pixel
    tex.needsUpdate = true;
    e.tex?.dispose();
    e.tex = tex;
    (e.mesh.material as THREE.MeshBasicMaterial).map = tex;
    (e.mesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
    e.version = version;
  }

  private evict(show: Set<string>) {
    if (this.tiles.size <= CACHE_CAP) return;
    const old = [...this.tiles.entries()].filter(([k, e]) => !show.has(k) && e.L > 0).sort((a, b) => a[1].used - b[1].used);
    for (const [k, e] of old.slice(0, this.tiles.size - CACHE_CAP)) {
      this.disposeTile(e);
      this.tiles.delete(k);
    }
  }

  private disposeTile(e: TileEntry) {
    this.tileGroup.remove(e.mesh);
    e.mesh.geometry.dispose();
    (e.mesh.material as THREE.Material).dispose();
    e.tex?.dispose();
  }

  private updateImages() {
    const R = this.renderRadius;
    for (const m of this.extraImages.children as THREE.Mesh[]) {
      const near = Math.hypot(m.position.x - this.target.x, -m.position.z - this.target.y) < R;
      m.visible = near;
      if (near && !m.userData.loaded) {
        m.userData.loaded = true;
        (m.userData.loader as THREE.TextureLoader).load(m.userData.src, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          (m.material as THREE.MeshBasicMaterial).map = tex;
          (m.material as THREE.MeshBasicMaterial).needsUpdate = true;
          this.invalidate();
        });
      }
    }
  }

  // ───────────────────────── Overlays ─────────────────────────

  private nearStop: string | null = null;

  private updateOverlays() {
    const w = this.vw, h = this.vh;
    const R = this.renderRadius;
    const v = new THREE.Vector3();
    const s = this.settings;

    // Which landmark (if any) have you arrived at? Zoomed in, and it's near the middle of the view.
    let near: Overlay | null = null, nd = Infinity;
    if (this.d <= NEAR_D)
      for (const o of this.overlays) {
        if (!o.stop || (o.kind === "wp" && !s.waypoints) || (o.kind === "planet" && !(s.planets && s.names))) continue;
        if ((o.kind === "con" || o.kind === "star") && !s.names) continue;
        // Waypoints win ties, then planets and stars, then constellation centers
        const dd = Math.hypot(o.x - this.target.x, o.y - this.target.y) * (o.kind === "wp" ? 0.5 : o.kind === "con" ? 1.5 : 1);
        if (dd <= Math.max(1.2, this.d * 0.14) && dd < nd) [near, nd] = [o, dd];
      }
    const nearStop = near?.stop ?? null;
    if (nearStop !== this.nearStop) {
      this.nearStop = nearStop;
      this.events.onNear(nearStop);
    }

    for (const o of this.overlays) {
      const isNear = o === near;
      if (o.stop && o.isNear !== isNear) {
        o.isNear = isNear;
        o.el.classList.toggle("near", isNear);
      }
      let show =
        o.kind === "wp" ? s.waypoints : o.kind === "planet" ? s.planets && s.names : s.names && this.d <= (o.maxD ?? D_MAX) && this.d >= (o.minD ?? 0);
      const dist = Math.hypot(o.x - this.target.x, o.y - this.target.y);
      if (show) show = dist < R;
      if (show) {
        v.set(o.x, 0, -o.y).project(this.camera);
        show = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      }
      if (!show) {
        if (o.shown !== false) {
          o.shown = false;
          o.el.style.display = "none";
        }
        continue;
      }
      // Only touch the page when something visibly changed (a label rewritten every frame is what makes
      // a page with hundreds of them stutter)
      const x = Math.round((v.x * 0.5 + 0.5) * w * 2) / 2, y = Math.round((-v.y * 0.5 + 0.5) * h * 2) / 2;
      if (o.shown !== true) {
        o.shown = true;
        o.el.style.display = "";
      }
      if (x !== o.sx || y !== o.sy) {
        o.sx = x;
        o.sy = y;
        o.el.style.transform = `translate(${x}px, ${y}px)`;
      }
      const op = Math.round(clamp(1 - (dist - R * 0.6) / (R * 0.4), 0, 1) * 20) / 20; // fade with the fog
      if (op !== o.op) {
        o.op = op;
        o.el.style.opacity = String(op);
      }
    }
    // The hover card follows the thing it describes, opening away from the screen edges
    if (this.cardAt) {
      v.set(this.cardAt.x, 0, -this.cardAt.y).project(this.camera);
      const on = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      this.cardHost.style.display = on ? "" : "none";
      if (on) {
        const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
        this.cardHost.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        this.cardHost.classList.toggle("flip", x > w - 360);
        this.cardHost.classList.toggle("up", y > h - 470); // leave room for the timeline
      }
    }
    // Green pivot dot while orbiting
    if (this.drag?.mode === "orbit") {
      v.set(this.target.x, 0, -this.target.y).project(this.camera);
      this.pivot.style.display = "block";
      this.pivot.style.transform = `translate(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px)`;
    } else this.pivot.style.display = "none";

    // Target reticle marker for coordinate search
    if (this.reticlePos) {
      const [markerX, markerY] = this.project(this.reticlePos.ra, this.reticlePos.dec);
      v.set(markerX, 0, -markerY).project(this.camera);
      const on = v.z > -1 && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      this.reticle.style.display = on ? "block" : "none";
      if (on) {
        this.reticle.style.transform = `translate(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px)`;
      }
    } else this.reticle.style.display = "none";
  }

  // ───────────────────────── Hyperspace ─────────────────────────

  private startWarp() {
    const cols = ["#ffffff", "#e6e0ff", "#ffd6e8", "#d6e6ff", "#fff1c9"];
    this.stars = Array.from({ length: 260 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random() * 0.4, v: 0.4 + Math.random() * 1.2, c: cols[(Math.random() * cols.length) | 0] }));
  }

  private drawWarp(dt: number) {
    const c = this.warp;
    if (this.warpT <= 0.001) {
      // Effect over: reset the bitmap and take the layer out of the page entirely.
      if (c.style.display !== "none") {
        c.width = c.width;
        c.style.display = "none";
      }
      return;
    }
    c.style.display = "";
    const ctx = c.getContext("2d")!;
    const w = c.clientWidth, h = c.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== Math.round(w * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const I = this.warpT, cx = w / 2, cy = h / 2, R = Math.hypot(w, h) / 2;
    ctx.fillStyle = `rgba(20, 16, 60, ${0.35 * I})`;
    ctx.fillRect(0, 0, w, h);
    ctx.lineCap = "round";
    for (const s of this.stars) {
      s.r += s.v * dt * (0.6 + 3 * I);
      if (s.r > 1.2) s.r = Math.random() * 0.15;
      const len = 0.02 + 0.35 * I * s.r;
      const r0 = s.r * R, r1 = (s.r + len) * R;
      ctx.strokeStyle = s.c;
      ctx.globalAlpha = Math.min(1, I * 1.4) * Math.min(1, s.r * 3);
      ctx.lineWidth = 1 + 2 * s.r;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(s.a) * r0, cy + Math.sin(s.a) * r0);
      ctx.lineTo(cx + Math.cos(s.a) * r1, cy + Math.sin(s.a) * r1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ───────────────────────── Input ─────────────────────────

  private bindInput() {
    const el = this.renderer.domElement;
    const onDown = (e: PointerEvent) => {
      if (!this.enabled) return;
      if (e.pointerType === "touch") {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        el.setPointerCapture(e.pointerId);
        if (this.touches.size === 1) Object.assign(this.tap, { downAt: performance.now(), x: e.clientX, y: e.clientY, moved: false });
        else this.tap.moved = true; // a second finger: not a tap
        if (this.touches.size === 1) this.drag = { mode: "pan", x: e.clientX, y: e.clientY, anchor: this.pickClient(e.clientX, e.clientY), id: e.pointerId };
        else this.startPinch();
        return;
      }
      // Fusion 360 style: middle = pan, Shift + middle = orbit. Also: left = pan, right or Shift + left = orbit.
      if (e.button === 1) e.preventDefault();
      const orbit = e.button === 2 || (e.shiftKey && (e.button === 1 || e.button === 0));
      if (e.button > 2) return;
      el.setPointerCapture(e.pointerId);
      this.drag = { mode: orbit ? "orbit" : "pan", x: e.clientX, y: e.clientY, anchor: orbit ? null : this.pickClient(e.clientX, e.clientY), id: e.pointerId };
      this.tweens = this.tweens.filter((t) => t.ms < 400); // grabbing the map cancels a fly-to
      this.invalidate();
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" && this.touches.has(e.pointerId)) {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (Math.hypot(e.clientX - this.tap.x, e.clientY - this.tap.y) > 10) this.tap.moved = true;
        if (this.touches.size >= 2) return this.movePinch();
      }
      if (!this.drag || this.drag.id !== e.pointerId) {
        this.cursor = this.pickClient(e.clientX, e.clientY);
        return;
      }
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      if (this.drag.mode === "orbit") {
        this.theta -= dx * 0.006;
        this.phi = clamp(this.phi - dy * 0.006, 0, PHI_MAX);
        if (this.phi < 3 * DEG) this.phi = 0; // gentle magnet toward top-down
      } else if (this.drag.anchor) {
        this.updateCamera();
        const p = this.pickClient(e.clientX, e.clientY);
        if (p) this.setTarget(this.target.x + this.drag.anchor.x - p.x, this.target.y + this.drag.anchor.y - p.y);
      }
      this.invalidate();
    };
    const onUp = (e: PointerEvent) => {
      const wasTouch = e.pointerType === "touch" && this.touches.has(e.pointerId);
      this.touches.delete(e.pointerId);
      if (wasTouch && this.touches.size === 0 && !this.tap.moved && performance.now() - this.tap.downAt < 350) this.onTap(e.clientX, e.clientY);
      if (this.touches.size === 1) {
        // lifted one of two fingers: carry on panning with the other
        const [id, t] = [...this.touches.entries()][0];
        this.drag = { mode: "pan", x: t.x, y: t.y, anchor: this.pickClient(t.x, t.y), id };
      }
      if (this.drag?.mode === "orbit" && this.phi > 0 && this.phi < SNAP_PHI) {
        const from = this.phi;
        this.animate(350, (t) => (this.phi = from * (1 - ease(t)))); // snap into the flat 2D view
      }
      if (this.drag?.id === e.pointerId || this.touches.size === 0) this.drag = null;
      this.invalidate();
    };
    let pushOut = 0;
    let pushIn = 0;
    const onWheel = (e: WheelEvent) => {
      if (!this.enabled) return;
      e.preventDefault();
      if (performance.now() < this.lockedUntil) return; // the leftover scrolls that left a 360° view don't hijack its cutscene
      // Already as far out as the sky map goes? A few more scrolls out and we leave for the galaxies.
      if (e.deltaY > 0 && this.d >= D_MAX * 0.98) {
        pushOut += e.deltaY;
        if (pushOut > 400) {
          pushOut = 0;
          this.events.onZoomOutLimit?.();
          return;
        }
      } else if (e.deltaY < 0) pushOut = 0;
      // Zoomed right in on a landmark? Keep scrolling in and you step inside its 360° view.
      if (e.deltaY < 0 && this.nearStop && this.d <= ENTER_360_D) {
        pushIn -= e.deltaY;
        if (pushIn > 260) {
          pushIn = 0;
          this.events.onEnter(this.nearStop);
          return;
        }
      } else if (e.deltaY > 0) pushIn = 0;
      const before = this.pickClient(e.clientX, e.clientY);
      const k = e.ctrlKey ? 0.01 : 0.0015; // ctrl+wheel = trackpad pinch
      this.d = clamp(this.d * Math.exp(e.deltaY * k), D_MIN, D_MAX);
      this.updateCamera();
      const after = this.pickClient(e.clientX, e.clientY);
      if (before && after) this.setTarget(this.target.x + before.x - after.x, this.target.y + before.y - after.y); // zoom toward the cursor
      this.invalidate();
    };
    const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable]");
    const onKey = (e: KeyboardEvent) => {
      if (!this.enabled || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const { token, added } = this.keys.keydown(e, CAM_KEYS);
      if (token) {
        if (!isShiftToken(token)) {
          e.preventDefault();
          if (e.repeat) return;
          if (added) {
            if (this.tweens.length) {
              this.tweens = [];
              this.warpT = 0;
            }
            this.invalidate();
          }
        }
        return;
      }
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (e.code === "KeyT" || k === "t") this.set2D(this.phi > 0);
      else if (e.code === "KeyH" || k === "h" || e.key === "Home") this.home();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      this.keys.keyup(e);
    };
    const prevent = (e: Event) => e.preventDefault();
    const onBlur = () => {
      this.keys.clear();
      this.keyVel.x = 0;
      this.keyVel.y = 0;
    };
    const onVisibility = () => {
      if (document.hidden) onBlur();
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("pointerleave", () => (this.cursor = null));
    this.container.addEventListener("wheel", onWheel, { passive: false }); // whole map area, so waypoints and labels don't block zooming
    el.addEventListener("contextmenu", prevent);
    el.addEventListener("mousedown", (e) => e.button === 1 && e.preventDefault()); // stop middle-click autoscroll
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    this.cleanup.push(() => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    });
  }

  private startPinch() {
    const [a, b] = [...this.touches.values()];
    this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, mode: "", acc: 0, ay: a.y, by: b.y };
    this.drag = null;
    this.tweens = this.tweens.filter((t) => t.ms < 400);
  }
  private movePinch() {
    const [a, b] = [...this.touches.values()];
    const P = this.pinch;
    const dist = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    let dAng = ang - P.ang;
    if (dAng > Math.PI) dAng -= 2 * Math.PI;
    if (dAng < -Math.PI) dAng += 2 * Math.PI;
    // Decide what the gesture is once the fingers have moved a little: both sliding up/down together
    // without spreading or turning is a tilt; anything else is zoom + twist + move.
    if (!P.mode) {
      P.acc += Math.abs(my - P.my) + Math.abs(dist - P.dist) + Math.abs(dAng) * 60;
      if (P.acc > 12) {
        const dyA = a.y - P.ay, dyB = b.y - P.by;
        P.mode = Math.sign(dyA) === Math.sign(dyB) && Math.abs(dyA) > 6 && Math.abs(dyB) > 6 && Math.abs(dist - P.dist) < 10 ? "tilt" : "transform";
      }
    }
    if (P.mode === "tilt") {
      this.phi = clamp(this.phi - (my - P.my) * 0.006, 0, PHI_MAX);
    } else if (P.mode === "transform") {
      const before = this.pickClient(P.mx, P.my); // the spot that was between the fingers…
      if (P.dist) this.d = clamp(this.d * (P.dist / dist), D_MIN, D_MAX);
      this.theta += dAng; // twisting the fingers clockwise turns the map clockwise
      this.updateCamera();
      const after = this.pickClient(mx, my); // …stays between them
      if (before && after) this.setTarget(this.target.x + before.x - after.x, this.target.y + before.y - after.y);
    }
    Object.assign(P, { dist, ang, mx, my });
    if (P.mode) {
      P.ay = a.y;
      P.by = b.y;
    }
    this.invalidate();
  }

  /** Double-tap with one finger: zoom in on that spot. */
  private onTap(x: number, y: number) {
    const now = performance.now(), T = this.tap;
    if (now - T.lastT < 400 && Math.hypot(x - T.lastX, y - T.lastY) < 40) {
      T.lastT = 0;
      const p = this.pickClient(x, y);
      if (p) {
        const from = { x: this.target.x, y: this.target.y, d: this.d };
        const to = { x: from.x + (p.x - from.x) * 0.5, y: from.y + (p.y - from.y) * 0.5, d: clamp(from.d * 0.5, D_MIN, D_MAX) };
        this.animate(320, (t) => {
          const e = ease(t);
          this.setTarget(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
          this.d = from.d + (to.d - from.d) * e;
        });
      }
      return;
    }
    Object.assign(T, { lastT: now, lastX: x, lastY: y });
  }

  private applyKeys(dt: number) {
    const safeDt = clamp(dt, 0.004, 0.05);
    const has = (...k: string[]) => this.keys.has(...k);
    const st = Math.sin(this.theta), ct = Math.cos(this.theta);
    const boost = this.keys.shift ? 2 : 1;
    const speed = this.d * 0.85 * boost;
    let mx = 0, my = 0;
    if (has("w", "arrowup")) my += 1;
    if (has("s", "arrowdown")) my -= 1;
    if (has("d", "arrowright")) mx += 1;
    if (has("a", "arrowleft")) mx -= 1;
    if (mx && my) {
      const inv = 1 / Math.SQRT2;
      mx *= inv;
      my *= inv;
    }

    const hasMoveInput = mx !== 0 || my !== 0;
    const goalVx = (mx * ct - my * st) * speed;
    const goalVy = (mx * st + my * ct) * speed;
    const blend = 1 - Math.exp(-(hasMoveInput ? 32 : 18) * safeDt);
    this.keyVel.x += (goalVx - this.keyVel.x) * blend;
    this.keyVel.y += (goalVy - this.keyVel.y) * blend;

    const moving = hasMoveInput || Math.hypot(this.keyVel.x, this.keyVel.y) > 0.0015 * this.d;
    if (moving) {
      this.target.set(
        clamp(this.target.x + this.keyVel.x * safeDt, -180, 180),
        clamp(this.target.y + this.keyVel.y * safeDt, -90, 90),
      );
    } else {
      this.keyVel.x = 0;
      this.keyVel.y = 0;
    }

    let rotated = false;
    if (has("q")) { this.theta += 1.2 * safeDt; rotated = true; }
    if (has("e")) { this.theta -= 1.2 * safeDt; rotated = true; }
    if (has("r")) { this.phi = clamp(this.phi + 0.9 * safeDt, 0, PHI_MAX); rotated = true; }
    if (has("f")) { this.phi = clamp(this.phi - 0.9 * safeDt, 0, PHI_MAX); rotated = true; }
    if (has("z", "=")) { this.d = clamp(this.d * Math.exp(-1.6 * boost * safeDt), D_MIN, D_MAX); rotated = true; }
    if (has("x", "-")) { this.d = clamp(this.d * Math.exp(1.6 * boost * safeDt), D_MIN, D_MAX); rotated = true; }
    return moving || rotated || this.keys.hasActiveMotion;
  }

  // ───────────────────────── Frame loop (on demand) ─────────────────────────

  /** The map's size, measured on resize (reading it every frame forces the page to re-lay itself out). */
  private vw = 1;
  private vh = 1;
  private resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.vw = w || 1;
    this.vh = h || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / Math.max(1, h);
    this.invalidate();
  }

  private tilesAt = 0;

  /** Moving fast (more than about half a screen per second)? Then go lighter until it calms down. */
  private fast = false;
  private calmSince = 0;
  private lastPos = { x: 0, y: 0, d: 1 };
  private trackMotion(now: number, dt: number) {
    const radius = this.d * Math.tan((FOV / 2) * DEG);
    const moved = Math.hypot(this.target.x - this.lastPos.x, this.target.y - this.lastPos.y) + Math.abs(Math.log(this.d / this.lastPos.d)) * radius;
    this.lastPos = { x: this.target.x, y: this.target.y, d: this.d };
    const speed = dt > 0 ? moved / dt / Math.max(1e-6, radius) : 0;
    if (speed > 0.5) {
      this.calmSince = 0;
      // (No resolution or detail switching here: resizing the canvas and swapping every tile for a
      // coarser one each time you start or stop moving was what made the first moment of a key press stutter.)
      this.fast = true;
    } else if (this.fast) {
      this.calmSince ||= now;
      if (now - this.calmSince > 180) {
        this.fast = false;
        this.tilesAt = 0; // re-plan right away
      }
    }
  }

  private frame = () => {
    this.raf = 0;
    this.inFrame = true;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    let busy = false;
    if (this.tweens.length) {
      this.tweens = this.tweens.filter((tw) => {
        const k = Math.min(1, (now - tw.start) / tw.ms);
        tw.step(k);
        if (k >= 1) tw.done?.();
        return k < 1;
      });
      busy = true;
    }
    if (!this.tweens.length) this.warpT = 0; // an interrupted fly-to never leaves the streaks behind
    if (this.applyKeys(dt)) busy = true;
    this.trackMotion(now, dt);
    if (this.fast) busy = true; // keep drawing until we've switched back to full detail
    if (this.drainUploads(this.fast ? 1 : 3)) busy = true;

    this.updateCamera();
    const R = this.renderRadius;
    const fog = this.scene.fog as THREE.Fog;
    const camDist = this.camera.position.distanceTo(new THREE.Vector3(this.target.x, 0, -this.target.y));
    // Fade fully to black before the edge of what we load, so the distance melts into the background.
    fog.near = camDist + R * 0.15;
    fog.far = camDist + R * 0.8;

    // Re-planning which tiles to show is the heaviest per-frame job: while the camera is moving it's
    // plenty to do it ~14 times a second (the last plan stays on screen in between)
    if (!(busy || this.drag) || now - this.tilesAt > 70) {
      this.tilesAt = now;
      if (this.updateTiles()) busy = true;
    }
    this.updateImages();
    if (this.settings.grid) this.updateGrid();
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
    this.updateOverlays();
    this.updateGridLabels();
    if (this.warpT > 0 || this.tweens.length) {
      this.drawWarp(dt);
      busy = true;
    } else this.drawWarp(0);

    this.events.onView({
      x: this.target.x,
      y: this.target.y,
      d: this.d,
      phi: this.phi,
      theta: this.theta,
      radius: this.d * Math.tan((FOV / 2) * DEG) * (1 + 0.9 * Math.sin(this.phi)),
      mode: this.phi < 0.5 * DEG ? "2d" : "3d",
      tiles: this.visibleTiles,
      loading: this.inflight.size,
    });
    this.inFrame = false;
    if ((busy || this.drag || this.dirty) && !this.raf) {
      this.raf = requestAnimationFrame(this.frame);
    }
  };
}
