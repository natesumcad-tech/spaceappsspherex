import * as THREE from "three";
import { wheelPixels, ZoomExitGesture } from "./zoom-policy";
import { LANDMARKS, byId, type Hotspot, type Landmark } from "./landmarks";
import { DEG, bvToKelvin, dirToYawPitch, galacticToRaDec, kelvinToRGB, radecToVec, type SkyData } from "./astro";
import { cloudTexture, glowTexture, planetTexture, ringTexture } from "./textures";
import { SPHEREX_RGB, makeLoader, renderTile, type TileRequest } from "@/lib/starmap/hips";
import { constellationStop, starStop } from "./dynamic";
import { KeyState, isShiftToken } from "../starmap/keyState";

/** 3D constellations: 1 scene unit = 4 light-years. */
const LY_PER_UNIT = 4;
const PC_TO_LY = 3.2616;

/** Narrowest zoom (degrees across), so small things like galaxies can fill the screen. */
const FOV_MIN = 2.5;
const PATCH_PX = 1024;

export type NavMode = "look" | "orbit" | "fly";
/** What the movement controls need to show. Angles in radians; r in scene units. */
export type NavState = {
  mode: NavMode;
  canOrbit: boolean;
  canFly: boolean;
  az: number;
  el: number;
  r: number;
  rMin: number;
  rMax: number;
  away: boolean;
  /** Where you're looking (radians) and the zoom (degrees across), for the ring in Look / Free fly. */
  yaw: number;
  pitch: number;
  fov: number;
  fovMin: number;
};

export type EngineEvents = {
  onAsk?: (name: string) => void;
  /** Continued zoom-out past the close-up boundary returns to the sky map. */
  onExit?: () => void;
  /** Movement mode or orbit position changed. */
  onNav?: (s: NavState) => void;
  /** A portal (clickable constellation, star, galaxy…) inside a sphere was clicked. */
  onNavigate: (id: string) => void;
};

type Label = {
  /** Optional extra condition for showing the label. */
  when?: () => boolean;
  el: HTMLDivElement;
  layer: "sky" | "fg";
  pos: () => THREE.Vector3;
  names?: Record<string, string>;
  id?: string;
  link?: string;
};

type HotspotEl = {
  el: HTMLDivElement;
  pos: () => THREE.Vector3;
  /** For points on a spinning body: the surface normal, so the marker hides on the far side. */
  normal?: () => THREE.Vector3;
  sky: boolean;
};

// Things you can click inside a sphere to jump to another stop.

const POINT_VERT = /* glsl */ `
  attribute float size;
  attribute vec3 aColor;
  uniform float uScale;
  uniform float uAttenuate;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * uScale * mix(1.0, 300.0 / -mv.z, uAttenuate);
  }`;
const POINT_FRAG = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor, a * a);
  }`;

const STAR_VERT = /* glsl */ `
  varying vec3 vNormal; varying vec3 vPos; varying vec3 vView;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPos = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const STAR_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uTime;
  varying vec3 vNormal; varying vec3 vPos; varying vec3 vView;
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  void main() {
    float mu = clamp(dot(vNormal, vView), 0.0, 1.0);
    float n = noise(vPos * 6.0 + uTime * 0.15) * 0.6 + noise(vPos * 15.0 - uTime * 0.1) * 0.4;
    vec3 c = uColor * (0.6 + 0.55 * n) * (0.35 + 0.85 * pow(mu, 0.5));
    c = mix(c, vec3(1.0), 0.3 * pow(mu, 2.0));
    gl_FragColor = vec4(c, 1.0);
  }`;

const ATMO_FRAG = /* glsl */ `
  varying vec3 vNormal; varying vec3 vView;
  void main() {
    float rim = pow(1.0 - abs(dot(vNormal, vView)), 2.5);
    gl_FragColor = vec4(vec3(0.35, 0.6, 1.0) * rim * 1.6, rim);
  }`;

function pointsMaterial(scale: number, attenuate = false) {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: { value: scale }, uAttenuate: { value: attenuate ? 1 : 0 } },
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function pointCloud(pos: Float32Array, col: Float32Array, size: Float32Array, mat: THREE.Material) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
  return new THREE.Points(geo, mat);
}

function gaussian(rand = Math.random) {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

const FLY_KEYS = new Set([
  "w", "a", "s", "d", "q", "e",
  "arrowup", "arrowdown", "arrowleft", "arrowright",
  "shiftleft", "shiftright", "shift",
]);

export class SkyEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(70, 1, 0.01, 6000);
  private sky!: SkyData;

  private skyGroup = new THREE.Group();
  /** Real SPHEREx imagery for the current sphere, wrapped onto the inside of the sky. */
  private patchGroup = new THREE.Group();
  private patchMat: THREE.MeshBasicMaterial | null = null;
  private patchGen = 0;
  private worker: Worker | null = null;
  private patchLoad: ReturnType<typeof makeLoader> | null = null;
  private starsMat = pointsMaterial(1);
  private mwMat = pointsMaterial(1);
  private allLines!: THREE.LineSegments;
  private highlight = new THREE.Group();
  private fg = new THREE.Group();
  private spinners: { obj: THREE.Object3D; speed: number }[] = [];
  private starUniforms: { uTime: { value: number } }[] = [];
  /** Solid bodies in the current sphere: you can't fly into them and sky labels behind them are hidden. */
  private occluders: { center: THREE.Vector3; radius: number }[] = [];

  private labels: Label[] = [];
  private hotspots: HotspotEl[] = [];
  /** Named points in the current sphere that hotspots can attach to. */
  private anchors: Record<string, () => THREE.Vector3> = {};
  private body: THREE.Object3D | null = null;
  private lookTarget: { yaw: number; pitch: number } | null = null;
  private visibleLabels: { x: number; y: number; text: string; cls: string }[] = [];
  private raf = 0;
  private clock = new THREE.Clock();
  private ro: ResizeObserver;
  private cleanup: (() => void)[] = [];

  active = false;
  current: Landmark | null = null;
  private busy = false;
  private lang = "en";
  showLabels = true;
  showLines = true;
  /** Screen space covered by page UI (the info card), so hotspot cards open away from it. */
  safeArea = { right: 0, bottom: 0 };

  // Look & fly state
  private yaw = 0;
  private pitch = 0;
  private fov = 70;
  private zoomExit = new ZoomExitGesture();
  private vel = { yaw: 0, pitch: 0 };
  private keys = new KeyState();
  private flyRadius = 0;
  private flySpeed = 0;

  // Movement: look around on the spot, orbit a pivot with the ring, or fly freely
  private navMode: NavMode = "look";
  private pivot: THREE.Vector3 | null = null;
  private orbit = { az: 0, el: 0, r: 10 };
  private rRange = { min: 1, max: 100 };
  private navKey = "";
  /** 3D constellation: real star positions (from HYG distances). */
  private con3d: { stars: { pos: THREE.Vector3; absMag: number }[]; size: THREE.BufferAttribute; col: THREE.BufferAttribute; base: number[][]; mat: THREE.ShaderMaterial; home: number } | null = null;
  /** 1 at the Sun (the view everyone knows), → 0 as you fly away from it. */
  private homeK = 1;
  private patchFade = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private labelLayer: HTMLDivElement,
    private fadeEl: HTMLDivElement,
    private events: EngineEvents,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.cam.rotation.order = "YXZ";
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement!);
    this.bindInput();
  }

  init(sky: SkyData) {
    this.sky = sky;
    this.buildSky();
    this.resize();
    this.loop();
  }

  dispose() {
    this.active = false;
    ++this.patchGen; // reject any pending cutout result after leaving
    this.patchLoad = null;
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      const drawable = object as THREE.Mesh;
      if (drawable.geometry) geometries.add(drawable.geometry);
      if (drawable.material) {
        const list = Array.isArray(drawable.material) ? drawable.material : [drawable.material];
        list.forEach((material) => materials.add(material));
      }
    });
    // Cutout textures belong to this engine; procedural planet textures are shared caches.
    this.patchGroup.children.forEach((object) => {
      ((object as THREE.Mesh).material as THREE.MeshBasicMaterial).map?.dispose();
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    cancelAnimationFrame(this.raf);
    this.worker?.terminate();
    this.ro.disconnect();
    this.cleanup.forEach((f) => f());
    this.renderer.dispose();
    this.labelLayer.innerHTML = "";
  }

  /** Can WASD fly in the current sphere? (Otherwise WASD looks around.) */
  get canFly() {
    return this.flyRadius > 0;
  }

  // ───────────────────────────── Sky (shared by every sphere) ─────────────────────────────

  private buildSky() {
    const n = this.sky.stars.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
    const v = new THREE.Vector3();
    this.sky.stars.forEach(([ra, dec, mag, bv], i) => {
      radecToVec(ra, dec, 900, v).toArray(pos, i * 3);
      const [r, g, b] = kelvinToRGB(bvToKelvin(bv));
      const bright = THREE.MathUtils.clamp(0.3 + (7.5 - mag) / 5.5, 0.3, 1.4);
      col.set([r * bright, g * bright, b * bright], i * 3);
      size[i] = Math.max(1.6, (7.8 - mag) * 1.15);
    });
    this.skyGroup.add(pointCloud(pos, col, size, this.starsMat));
    this.skyGroup.add(this.buildMilkyWayBand());

    const seg: number[] = [];
    for (const c of this.sky.constellations)
      for (const line of c.lines)
        for (let k = 0; k < line.length - 1; k++)
          seg.push(...radecToVec(line[k][0], line[k][1], 880).toArray(), ...radecToVec(line[k + 1][0], line[k + 1][1], 880).toArray());
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
    this.allLines = new THREE.LineSegments(lgeo, new THREE.LineBasicMaterial({ color: 0x5f86d6, transparent: true, opacity: 0.32, depthWrite: false }));
    this.skyGroup.add(this.allLines, this.highlight, this.patchGroup);
    this.scene.add(this.skyGroup, this.fg, new THREE.AmbientLight(0xffffff, 0.06));

    // Sky labels live in the sky group's frame, which rides along with the camera (stars are "at infinity").
    const skyPos = (local: THREE.Vector3) => () => local.clone().applyQuaternion(this.skyGroup.quaternion).add(this.skyGroup.position);
    for (const s of this.sky.named) {
      const [ra, dec, mag] = this.sky.stars[s.i];

      this.addLabel("sky", "lbl lbl-star", s.names, skyPos(radecToVec(ra, dec, 860)), { link: starStop(this.sky, s), when: () => mag <= 1.65 || this.fov <= 35 });
    }
    for (const c of this.sky.constellations) {
      // All 88 constellations, each a portal to its own 360° view
      this.addLabel("sky", "lbl lbl-con", c.names, skyPos(radecToVec(c.center[0], c.center[1], 860)), { id: c.id, link: constellationStop(this.sky, c) });
    }
    const gc = galacticToRaDec(0, 0);
    this.addLabel("sky", "lbl lbl-con", { en: "Milky Way center" }, skyPos(radecToVec(gc.ra, gc.dec + 6, 860)), { link: "milky-way" });
  }

  /** The Milky Way as a glowing band of faint particles along the galactic plane. */
  private buildMilkyWayBand() {
    const N = 60000;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);
    const v = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      let l = Math.random() < 0.55 ? gaussian() * 55 : Math.random() * 360 - 180;
      l = ((l % 360) + 360) % 360;
      const ld = l > 180 ? l - 360 : l;
      let b = gaussian() * (3 + 6 * Math.exp(-((ld / 25) ** 2)));
      // The Great Rift: dark dust lane from Cygnus to Sagittarius
      if (ld > -10 && ld < 80 && b > -1.5 && b < 3 && Math.random() < 0.65) b += (Math.random() < 0.5 ? -1 : 1) * 4;
      const { ra, dec } = galacticToRaDec(l, b);
      radecToVec(ra, dec, 950, v).toArray(pos, i * 3);
      const warm = Math.exp(-((ld / 40) ** 2));
      const k = 0.05 + 0.05 * warm;
      col.set([k * (0.8 + 0.2 * warm), k * (0.82 + 0.05 * warm), k * (1 - 0.25 * warm)], i * 3);
      size[i] = 4 + Math.random() * 6;
    }
    return pointCloud(pos, col, size, this.mwMat);
  }

  private setHighlight(conId?: string) {
    this.highlight.clear();
    const con = conId && this.sky.constellations.find((c) => c.id === conId);
    if (!con) return;
    const seg: number[] = [];
    for (const line of con.lines)
      for (let k = 0; k < line.length - 1; k++)
        seg.push(...radecToVec(line[k][0], line[k][1], 870).toArray(), ...radecToVec(line[k + 1][0], line[k + 1][1], 870).toArray());
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
    this.highlight.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.95 })));
  }

  // ───────────────────────────── Building each sphere ─────────────────────────────

  private buildPanorama(lm: Landmark) {
    this.zoomExit.reset();
    this.fg.clear();
    this.spinners = [];
    this.starUniforms = [];
    this.occluders = [];
    this.labels.filter((l) => l.layer === "fg").forEach((l) => l.el.remove());
    this.labels = this.labels.filter((l) => l.layer !== "fg");
    this.hotspots.forEach((h) => h.el.remove());
    this.hotspots = [];
    this.anchors = {};
    this.body = null;
    this.lookTarget = null;
    this.cam.position.set(0, 0, 0);
    this.pivot = null;
    this.con3d = null;
    this.homeK = 1;
    this.navMode = ["planet", "star", "orbit", "galaxy"].includes(lm.kind) ? "fly" : "look";

    // Point the sky so the landmark sits comfortably in front of you, north still up.
    let ra = lm.look?.[0] ?? 0, dec = lm.look?.[1] ?? 0;
    if (lm.kind === "constellation") [ra, dec] = this.sky.constellations.find((c) => c.id === lm.constellation)!.center;
    const target = radecToVec(ra, dec);
    const desired = radecToVec(ra, lm.kind === "orbit" ? dec : THREE.MathUtils.clamp(dec, -20, 20));
    this.skyGroup.quaternion.setFromUnitVectors(target, desired);
    // The SPHEREx image normally rides along with the (infinitely far) sky. In a landmark's view you
    // can fly toward it, so there it's fixed in space instead, lined up with the sky from the start.
    if (lm.kind === "sky" && lm.patch) {
      this.scene.add(this.patchGroup);
      this.patchGroup.quaternion.copy(this.skyGroup.quaternion);
    } else {
      this.skyGroup.add(this.patchGroup);
      this.patchGroup.quaternion.identity();
    }
    this.patchGroup.position.set(0, 0, 0);

    const yp = dirToYawPitch(desired);
    this.yaw = yp.yaw;
    this.pitch = lm.kind === "orbit" ? -14 * DEG : yp.pitch;
    this.fov = lm.fov ?? 70;
    this.vel = { yaw: 0, pitch: 0 };

    const galaxy = lm.kind === "galaxy";
    this.skyGroup.visible = !galaxy;
    this.setHighlight(lm.constellation);
    this.allLines.visible = this.showLines && ["sky", "constellation", "star"].includes(lm.kind);

    // How far WASD lets you fly from where you start
    this.flyRadius = { orbit: 0.6, planet: 9, star: 9, galaxy: 140, sky: 0, constellation: 0 }[lm.kind];
    this.flySpeed = { orbit: 0.12, planet: 1.6, star: 1.6, galaxy: 22, sky: 0, constellation: 0 }[lm.kind];

    const right = new THREE.Vector3().crossVectors(desired, new THREE.Vector3(0, 1, 0)).normalize();
    const sunDir = desired.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 115 * DEG).add(new THREE.Vector3(0, 0.25, 0)).normalize();

    if (lm.kind === "orbit") this.buildOrbitView(desired, right);
    if (lm.kind === "planet") this.buildPlanetView(lm, desired, sunDir);
    if (lm.kind === "star") this.buildStarView(lm, desired, right);
    if (galaxy) this.buildGalaxyView(desired);
    if (lm.kind === "constellation") this.buildConstellation3D(lm.constellation!);
    this.buildPatch(lm.patch);
    if (this.pivot) {
      const rel = this.cam.position.clone().sub(this.pivot);
      this.orbit = { az: Math.atan2(rel.x, rel.z), el: Math.asin(THREE.MathUtils.clamp(rel.y / (rel.length() || 1), -1, 1)), r: THREE.MathUtils.clamp(rel.length(), this.rRange.min, this.rRange.max) };
    }
    // A landmark's SPHEREx image hangs ~860 units out: let people fly up toward it and around in front of it
    if (lm.kind === "sky" && lm.patch && !this.flyRadius) {
      this.flyRadius = 640;
      this.flySpeed = 150;
    }
    // Start in free fly wherever there's something to fly to (Earth starts circling the globe)
    if (lm.kind === "planet" && lm.planet === "earth" && this.pivot) this.navMode = "orbit";
    else if (this.flyRadius > 0) this.navMode = "fly";
    this.navKey = "";
    this.fg.updateMatrixWorld(true);
    lm.hotspots?.forEach((h) => this.addHotspot(h));
  }

  /**
   * Wraps a SPHEREx DR1 cutout (fetched from IRSA and reprojected in a worker) onto a flat panel
   * tangent to the sky at the patch center, so it lines up exactly with the stars. Edges fade out.
   */
  private buildPatch(patch: Landmark["patch"]) {
    const gen = ++this.patchGen;
    for (const m of this.patchGroup.children as THREE.Mesh[]) {
      (m.material as THREE.MeshBasicMaterial).map?.dispose();
      (m.material as THREE.Material).dispose();
      m.geometry.dispose();
    }
    this.patchGroup.clear();
    this.patchMat = null;
    if (!patch) return;
    const req: TileRequest = {
      id: gen,
      x0: 0,
      y0: 0,
      w: patch.fov,
      h: patch.fov,
      W: PATCH_PX,
      H: PATCH_PX,
      years: 0,
      base: "spherex",
      frames: [...SPHEREX_RGB],
      overlays: [],
      light: true,
      detail: 1,
      gnomonic: patch,
    };
    const done = (px: Uint8ClampedArray | null) => {
      if (!px || gen !== this.patchGen) return;
      // Circular vignette so the patch melts into the surrounding sky
      for (let y = 0; y < PATCH_PX; y++)
        for (let x = 0; x < PATCH_PX; x++) {
          const r = Math.hypot(x - PATCH_PX / 2, y - PATCH_PX / 2) / (PATCH_PX / 2);
          const a = r < 0.72 ? 1 : r > 1 ? 0 : 1 - ((r - 0.72) / 0.28) ** 2 * (3 - (2 * (r - 0.72)) / 0.28);
          px[(y * PATCH_PX + x) * 4 + 3] = Math.max(0, Math.min(255, a * 255));
        }
      const tex = new THREE.DataTexture(new Uint8Array(px.buffer), PATCH_PX, PATCH_PX, THREE.RGBAFormat);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      tex.needsUpdate = true;
      const R = 860, size = 2 * R * Math.tan((patch.fov / 2) * DEG);
      const C = radecToVec(patch.ra, patch.dec);
      const E = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), C).normalize(); // east
      const N = new THREE.Vector3().crossVectors(C, E).normalize(); // north
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      // Seen from inside, east is on the left: local x = west, y = north, facing the center.
      mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(E.clone().negate(), N, C.clone().negate()));
      mesh.position.copy(C).multiplyScalar(R);
      mesh.renderOrder = -1; // stars and lines draw over it
      this.patchGroup.add(mesh);
      this.patchMat = mat;
      this.patchFade = 0;
    };
    if (typeof Worker !== "undefined" && !this.worker) {
      try {
        this.worker = new Worker(new URL("../starmap/tile.worker.ts", import.meta.url), { type: "module" });
        this.worker.onmessage = (e: MessageEvent<{ id: number; px?: Uint8ClampedArray }>) => done(e.data.id === this.patchGen ? (e.data.px ?? null) : null);
        this.worker.onerror = () => (this.worker = null);
      } catch {
        this.worker = null;
      }
    }
    if (this.worker) this.worker.postMessage(req);
    else {
      this.patchLoad ??= makeLoader(40e6);
      renderTile(req, this.patchLoad).then((r) => done(r.px), () => done(null));
    }
  }

  private setPivot(p: THREE.Vector3, rMin: number, rMax: number) {
    this.pivot = p.clone();
    this.rRange = { min: rMin, max: rMax };
  }

  /**
   * Places the constellation's stars at their real distances (HYG), joined by its figure lines.
   * From the Sun it looks exactly like the familiar pattern; orbit or fly away and it comes apart.
   */
  private buildConstellation3D(conId: string) {
    const con = this.sky.constellations.find((c) => c.id === conId);
    if (!con) return;
    const stars = this.sky.stars;
    // Match each figure vertex to the nearest catalogue star
    const match = new Map<string, number>();
    const nearest = (ra: number, dec: number) => {
      const key = `${ra},${dec}`;
      if (match.has(key)) return match.get(key)!;
      const v = radecToVec(ra, dec);
      let best = -1, bd = Math.cos(0.25 * DEG);
      const w = new THREE.Vector3();
      for (let i = 0; i < stars.length; i++) {
        if (stars[i][2] > 6.5) continue;
        const d = radecToVec(stars[i][0], stars[i][1], 1, w).dot(v);
        if (d > bd) [bd, best] = [d, i];
      }
      match.set(key, best);
      return best;
    };
    const idx = new Set<number>();
    for (const line of con.lines) for (const [ra, dec] of line) {
      const i = nearest(ra, dec);
      if (i >= 0) idx.add(i);
    }
    const named = this.sky.named.filter((n) => n.con === conId && stars[n.i][2] <= 3.5);
    named.forEach((n) => idx.add(n.i));
    const list = [...idx];
    const known = list.map((i) => stars[i][4]).filter((d) => d > 0).sort((a, b) => a - b);
    if (!known.length) return; // no distances: stay a flat pattern
    const median = known[Math.floor(known.length / 2)];

    const group = new THREE.Group();
    group.quaternion.copy(this.skyGroup.quaternion); // same orientation as the sky
    const local = new Map<number, THREE.Vector3>();
    const recs = list.map((i) => {
      const [ra, dec, mag, bv, dpc] = stars[i];
      const pc = dpc > 0 ? dpc : median;
      const p = radecToVec(ra, dec, (pc * PC_TO_LY) / LY_PER_UNIT);
      local.set(i, p);
      return { i, p, absMag: mag - 5 * Math.log10(pc / 10), rgb: kelvinToRGB(bvToKelvin(bv)) };
    });
    const pos = new Float32Array(recs.length * 3), col = new Float32Array(recs.length * 3), size = new Float32Array(recs.length);
    recs.forEach((r, k) => r.p.toArray(pos, k * 3));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const colAttr = new THREE.BufferAttribute(col, 3), sizeAttr = new THREE.BufferAttribute(size, 1);
    geo.setAttribute("aColor", colAttr);
    geo.setAttribute("size", sizeAttr);
    const mat = pointsMaterial(this.renderer.getPixelRatio());
    const pts = new THREE.Points(geo, mat);
    pts.renderOrder = 10;
    group.add(pts);

    const seg: number[] = [];
    for (const line of con.lines)
      for (let k = 0; k < line.length - 1; k++) {
        const a = local.get(nearest(line[k][0], line[k][1])), b = local.get(nearest(line[k + 1][0], line[k + 1][1]));
        if (a && b) seg.push(...a.toArray(), ...b.toArray());
      }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
    const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.85, depthWrite: false }));
    lines.renderOrder = 9;
    group.add(lines);

    // The Sun, so you can see where "here" is once you leave it
    const sun = this.glowSprite("#ffe28a", 3, new THREE.Vector3());
    group.add(sun);
    this.fg.add(group);
    group.updateMatrixWorld(true);

    const world = recs.map((r) => group.localToWorld(r.p.clone()));
    this.con3d = { stars: recs.map((r, k) => ({ pos: world[k], absMag: r.absMag })), size: sizeAttr, col: colAttr, base: recs.map((r) => r.rgb), mat, home: 0 };
    const centroid = world.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(world.length);
    const extent = Math.max(...world.map((w) => w.distanceTo(centroid)));
    this.con3d.home = centroid.length();
    this.setPivot(centroid, Math.max(4, extent * 0.35), centroid.length() * 2.2 + extent);
    this.flyRadius = centroid.length() + extent * 3;
    this.flySpeed = Math.max(8, centroid.length() * 0.35);

    // Names with real distances; hotspots can attach to these stars (anchor "fig-<hip>")
    for (const n of named) {
      const k = recs.findIndex((r) => r.i === n.i);
      if (k < 0) continue;
      const dpc = stars[n.i][4];
      const lyText = dpc > 0 ? ` · ${Math.round(dpc * PC_TO_LY).toLocaleString()} ly` : "";
      const w = world[k];
      this.addLabel("fg", "lbl lbl-3d", { en: `${n.names.en}${lyText}` }, () => w, { when: () => this.homeK < 0.85 });
      this.anchors[`fig-${n.hip}`] = () => w;
    }
    this.addLabel("fg", "lbl lbl-fg", { en: "Sun · Earth is here" }, () => new THREE.Vector3(0, 0, 0), { when: () => this.homeK < 0.6 });
  }

  /** Current movement state, for the on-screen controls. */
  get nav(): NavState {
    return {
      mode: this.navMode,
      canOrbit: !!this.pivot,
      canFly: this.flyRadius > 0,
      az: this.orbit.az,
      el: this.orbit.el,
      r: this.orbit.r,
      rMin: this.rRange.min,
      rMax: this.rRange.max,
      away: this.homeK < 0.5,
      yaw: this.yaw,
      pitch: this.pitch,
      fov: this.fov,
      fovMin: FOV_MIN,
    };
  }

  /** Turn and zoom on the spot (the ring and sliders in Look / Free fly). */
  setLook(p: { yaw?: number; pitch?: number; fov?: number }) {
    this.lookTarget = null;
    this.vel = { yaw: 0, pitch: 0 };
    if (p.yaw !== undefined) this.yaw = p.yaw;
    if (p.pitch !== undefined) this.pitch = THREE.MathUtils.clamp(p.pitch, -89 * DEG, 89 * DEG);
    if (p.fov !== undefined) this.fov = THREE.MathUtils.clamp(p.fov, FOV_MIN, 100);
  }

  setNavMode(mode: NavMode) {
    this.zoomExit.reset();
    if (mode === "orbit") {
      if (!this.pivot) return;
      const rel = this.cam.position.clone().sub(this.pivot);
      const len = rel.length();
      if (len > 1e-3) this.orbit = { az: Math.atan2(rel.x, rel.z), el: Math.asin(THREE.MathUtils.clamp(rel.y / len, -1, 1)), r: THREE.MathUtils.clamp(len, this.rRange.min, this.rRange.max) };
    }
    if (mode === "fly" && !this.flyRadius) return;
    this.navMode = mode;
    this.vel = { yaw: 0, pitch: 0 };
    this.lookTarget = null;
  }

  /** Move around the pivot (switches to orbit mode). */
  setOrbit(p: { az?: number; el?: number; r?: number }) {
    if (!this.pivot) return;
    if (this.navMode !== "orbit") this.setNavMode("orbit");
    if (p.az !== undefined) this.orbit.az = p.az;
    if (p.el !== undefined) this.orbit.el = THREE.MathUtils.clamp(p.el, -85 * DEG, 85 * DEG);
    if (p.r !== undefined) this.orbit.r = THREE.MathUtils.clamp(p.r, this.rRange.min, this.rRange.max);
  }

  private glowSprite(color: string, scale: number, pos: THREE.Vector3, opacity = 1) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
    sp.scale.setScalar(scale);
    sp.position.copy(pos);
    return sp;
  }

  private addSun(dir: THREE.Vector3, intensity = 3) {
    const pos = dir.clone().multiplyScalar(800);
    this.fg.add(this.glowSprite("#ffcf8a", 300, pos), this.glowSprite("#fff6e0", 70, pos));
    this.addFgLabel("Sun", pos);
    this.anchors.sun = () => pos;
    const light = new THREE.DirectionalLight(0xffffff, intensity);
    light.position.copy(dir.clone().multiplyScalar(50));
    this.fg.add(light);
  }

  private planetMesh(kind: Parameters<typeof planetTexture>[0], radius: number) {
    return new THREE.Mesh(new THREE.SphereGeometry(radius, 128, 96), new THREE.MeshStandardMaterial({ map: planetTexture(kind, 1024), roughness: 1, metalness: 0 }));
  }

  private makeRings(planetRadius: number) {
    const inner = 1.24 * planetRadius, outer = 2.27 * planetRadius;
    const geo = new THREE.RingGeometry(inner, outer, 160, 1);
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (Math.hypot(p.getX(i), p.getY(i)) - inner) / (outer - inner), 0.5);
    const ring = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: ringTexture(), transparent: true, side: THREE.DoubleSide, roughness: 1, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    return ring;
  }

  private buildOrbitView(desired: THREE.Vector3, right: THREE.Vector3) {
    const earth = new THREE.Group();
    earth.position.set(0, -1.11, 0); // 700 km above a unit-radius Earth
    earth.rotation.set(0.35, 0, 1.15); // tip the globe so we fly over the mid-latitudes, not the pole
    const body = this.planetMesh("earth", 1);
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.006, 128, 96), new THREE.MeshStandardMaterial({ map: cloudTexture(1024), transparent: true, depthWrite: false }));
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1.035, 128, 96),
      new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: ATMO_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    earth.add(body, clouds, atmo);
    this.fg.add(earth);
    this.addEquator(earth, 1);
    this.occluders.push({ center: earth.position.clone(), radius: 1.02 });
    this.setPivot(earth.position, 1.25, 6);
    this.spinners.push({ obj: body, speed: 0.01 }, { obj: clouds, speed: 0.013 });
    this.addSun(desired.clone().multiplyScalar(0.5).add(right.clone().multiplyScalar(0.6)).add(new THREE.Vector3(0, 0.35, 0)).normalize(), 1.8);
    this.addFgLabel("Earth", desired.clone().multiplyScalar(0.45).add(new THREE.Vector3(0, -0.55, 0)), "spherex-orbit");
    const up = new THREE.Vector3(0, 1, 0);
    const limb = desired.clone().multiplyScalar(0.9).add(up.clone().multiplyScalar(0.45)).normalize().multiplyScalar(1.03).add(earth.position);
    const cloud = desired.clone().multiplyScalar(0.35).add(right.clone().multiplyScalar(-0.25)).add(up).normalize().add(earth.position);
    this.anchors.limb = () => limb;
    this.anchors.clouds = () => cloud;
  }

  private buildPlanetView(lm: Landmark, desired: THREE.Vector3, sunDir: THREE.Vector3) {
    const dist = ({ moon: 3.6, mars: 4, jupiter: 4.4, saturn: 6.5, earth: 4 } as Record<string, number>)[lm.planet!] ?? 4;
    const tilt = new THREE.Group();
    tilt.position.copy(desired).multiplyScalar(dist);
    tilt.lookAt(0, 0, 0);
    tilt.rotateZ(0.25);
    tilt.rotateX(lm.planet === "saturn" ? 0.5 : 0.2);
    const body = this.planetMesh(lm.planet!, 1);
    tilt.add(body);
    if (lm.planet === "saturn") tilt.add(this.makeRings(1));
    this.addEquator(tilt, 1);
    this.fg.add(tilt);
    this.body = body;
    // Ring anchors sit on the side of the rings facing you (the tilt group's +z points at the camera).
    this.anchors.rings = () => tilt.localToWorld(new THREE.Vector3(1.55, 0, 0.75));
    this.anchors.cassini = () => tilt.localToWorld(new THREE.Vector3(-1.6, 0, 1.17));
    this.occluders.push({ center: tilt.position.clone(), radius: 1 });
    this.setPivot(tilt.position, lm.planet === "saturn" ? 2.7 : 1.5, 20);
    this.spinners.push({ obj: body, speed: lm.planet === "jupiter" || lm.planet === "saturn" ? 0.08 : 0.03 });
    this.addSun(sunDir);
    this.addFgLabel(lm.title, () => tilt.position.clone().add(new THREE.Vector3(0, 1.25, 0)));

    if (lm.planet === "earth") this.decorateEarth(tilt, desired);

    if (lm.planet === "moon") {
      // Earth hanging in the lunar sky (enlarged so you can find it). Click it to fly around the whole Earth.
      const earthDir = desired.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 40 * DEG).add(new THREE.Vector3(0, 0.3, 0)).normalize();
      const earth = this.planetMesh("earth", 0.12);
      earth.position.copy(earthDir.multiplyScalar(5));
      this.fg.add(earth);
      this.spinners.push({ obj: earth, speed: 0.2 });
      this.addFgLabel("Earth", earth.position.clone().add(new THREE.Vector3(0, 0.22, 0)), "earth");
    }
  }

  /** The whole Earth: clouds, a glowing atmosphere, the Moon, and SPHEREx circling in low orbit. */
  private decorateEarth(tilt: THREE.Group, desired: THREE.Vector3) {
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.006, 128, 96), new THREE.MeshStandardMaterial({ map: cloudTexture(1024), transparent: true, depthWrite: false }));
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1.035, 128, 96),
      new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: ATMO_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    tilt.add(clouds, atmo);
    this.spinners.push({ obj: clouds, speed: 0.04 });
    this.occluders[this.occluders.length - 1].radius = 1.03;

    // SPHEREx: a tiny bright dot on a polar orbit (drawn well above scale so you can see it)
    const orbitPlane = new THREE.Group();
    orbitPlane.rotation.z = Math.PI / 2;
    tilt.add(orbitPlane);
    const craft = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff2d6 }));
    craft.position.set(1.16, 0, 0);
    orbitPlane.add(craft, this.glowSprite("#ffe9c2", 0.16, craft.position));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.0025, 6, 160), new THREE.MeshBasicMaterial({ color: 0xf7efdf, transparent: true, opacity: 0.35 }));
    ring.rotation.x = Math.PI / 2;
    orbitPlane.add(ring);
    this.spinners.push({ obj: orbitPlane, speed: 0.35 });
    this.addFgLabel("SPHEREx", () => craft.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.1, 0)), "spherex-orbit");

    // The Moon, off to one side (much closer than in reality, so it fits in the view)
    const right = new THREE.Vector3().crossVectors(desired, new THREE.Vector3(0, 1, 0)).normalize();
    const moon = this.planetMesh("moon", 0.27);
    moon.position.copy(tilt.position).add(right.multiplyScalar(-3.4)).add(new THREE.Vector3(0, 0.9, 0)).add(desired.clone().multiplyScalar(1.5));
    this.fg.add(moon);
    this.occluders.push({ center: moon.position.clone(), radius: 0.27 });
    this.spinners.push({ obj: moon, speed: 0.02 });
    this.addFgLabel("The Moon", moon.position.clone().add(new THREE.Vector3(0, 0.42, 0)), "moon");

    // Hotspot anchors on the side facing you
    const toCam = tilt.position.clone().negate().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    this.anchors.limb = () => tilt.position.clone().add(toCam.clone().multiplyScalar(0.55).add(up.clone().multiplyScalar(0.85)).normalize().multiplyScalar(1.035));
    this.anchors.clouds = () => tilt.position.clone().add(toCam.clone().add(new THREE.Vector3().crossVectors(toCam, up).multiplyScalar(0.5)).normalize().multiplyScalar(1.01));
  }

  private buildStarView(lm: Landmark, desired: THREE.Vector3, right: THREE.Vector3) {
    const color = new THREE.Color(lm.star!.color);
    const dist = { betelgeuse: 3, sirius: 6, polaris: 4.5 }[lm.id] ?? 5;
    const uniforms = { uColor: { value: color }, uTime: { value: 0 } };
    this.starUniforms.push(uniforms);
    const star = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.ShaderMaterial({ uniforms, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG }));
    star.position.copy(desired).multiplyScalar(dist);
    this.fg.add(star, this.glowSprite(lm.star!.color, 5.2, star.position, 0.85));
    const axis = new THREE.Group();
    axis.position.copy(star.position);
    this.fg.add(axis);
    this.addEquator(axis, 1);
    this.body = star;
    this.occluders.push({ center: star.position.clone(), radius: 1 });
    this.setPivot(star.position, 1.6, 25);
    this.spinners.push({ obj: star, speed: 0.02 });
    this.addFgLabel(lm.title, star.position.clone().add(new THREE.Vector3(0, 1.35, 0)));

    if (lm.star!.companion) {
      const pos = desired.clone().multiplyScalar(dist).add(right.clone().multiplyScalar(2.4)).add(new THREE.Vector3(0, 0.6, 0));
      const dwarf = new THREE.Mesh(new THREE.SphereGeometry(0.05, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      dwarf.position.copy(pos);
      this.fg.add(dwarf, this.glowSprite("#dfe8ff", 0.5, pos));
      this.anchors.companion = () => pos;
    }
  }

  /** Artist's model of the Milky Way: a barred spiral seen from outside. 1 unit ≈ 1,000 light-years. */
  private buildGalaxyView(desired: THREE.Vector3) {
    const N = 90000;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);
    const rand = Math.random;
    const set = (i: number, x: number, y: number, z: number, c: [number, number, number], s: number) => {
      pos.set([x, y, z], i * 3);
      col.set(c, i * 3);
      size[i] = s;
    };
    let i = 0;
    for (; i < 16000; i++) {
      const x = gaussian() * 6.5, y = gaussian() * 2.6, z = gaussian() * 1.6, rot = 0.45; // central bar & bulge
      set(i, x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot), z, [0.16, 0.12, 0.07], 2.6 + rand() * 2);
    }
    const pitch = 1 / Math.tan(13 * DEG);
    for (; i < 76000; i++) {
      const arm = i % 4; // four logarithmic spiral arms
      const r = 4.5 + Math.pow(rand(), 0.9) * 45;
      const theta = arm * (Math.PI / 2) + Math.log(r / 4.5) * pitch * 0.5 + gaussian() * (0.12 + 3 / r);
      const spread = gaussian() * (0.6 + r * 0.04);
      const hot = rand() < 0.03;
      set(
        i,
        Math.cos(theta) * r + Math.cos(theta + Math.PI / 2) * spread,
        Math.sin(theta) * r + Math.sin(theta + Math.PI / 2) * spread,
        gaussian() * 0.5,
        hot ? [0.35, 0.12, 0.2] : [0.07, 0.085, 0.12],
        hot ? 3 : 1.6 + rand() * 2.2,
      );
    }
    for (; i < N; i++) {
      const r = -Math.log(1 - rand() * 0.98) * 12, t = rand() * Math.PI * 2; // diffuse disk
      set(i, Math.cos(t) * r, Math.sin(t) * r, gaussian() * 0.8, [0.05, 0.05, 0.06], 1.5 + rand() * 1.5);
    }
    const disk = pointCloud(pos, col, size, pointsMaterial(this.renderer.getPixelRatio() * 0.35, true));
    const galaxy = new THREE.Group();
    galaxy.add(disk);
    galaxy.position.copy(desired).multiplyScalar(105).add(new THREE.Vector3(0, -22, 0));
    galaxy.lookAt(0, 0, 0);
    galaxy.rotateX(-0.95);
    this.fg.add(galaxy);
    this.setPivot(galaxy.position, 25, 260);
    this.spinners.push({ obj: disk, speed: 0.004 });

    const marker = this.glowSprite("#ffe28a", 6, new THREE.Vector3(Math.cos(2.4) * 26, Math.sin(2.4) * 26, 0)); // the Sun, ~26,000 ly out
    disk.add(marker);
    this.addFgLabel("You are here", () => marker.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 5, 0)));
    this.anchors["sun-marker"] = () => marker.getWorldPosition(new THREE.Vector3());
    this.anchors["galaxy-centre"] = () => galaxy.getWorldPosition(new THREE.Vector3());

    const M = 2500; // distant galaxies
    const bp = new Float32Array(M * 3), bc = new Float32Array(M * 3), bs = new Float32Array(M);
    for (let k = 0; k < M; k++) {
      new THREE.Vector3(gaussian(), gaussian(), gaussian()).normalize().multiplyScalar(1500).toArray(bp, k * 3);
      const b = 0.25 + rand() * 0.6;
      bc.set([b, b * 0.95, b * 1.05], k * 3);
      bs[k] = 1.2 + rand() * 2;
    }
    this.fg.add(pointCloud(bp, bc, bs, pointsMaterial(this.renderer.getPixelRatio())));
  }

  // ───────────────────────────── Labels & portals ─────────────────────────────

  private addLabel(layer: Label["layer"], cls: string, names: Record<string, string>, pos: () => THREE.Vector3, opts: { id?: string; link?: string; when?: () => boolean } = {}) {
    const el = document.createElement("div");
    el.className = cls;
    el.style.display = "none";
    if (opts.link) {
      el.classList.add("lbl-link");
      el.title = `Go to ${byId(opts.link)?.title}`;
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", `Explore ${names.en}`);
      const navigate = () => { if (this.current?.id !== opts.link) this.events.onNavigate(opts.link!); };
      el.addEventListener("pointerdown", e => e.stopPropagation());
      el.addEventListener("click", navigate);
      el.addEventListener("keydown", e => {
        if (e.target !== el) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(); }
      });
    }
    this.labelLayer.appendChild(el);
    const label: Label = { el, layer, pos, names, id: opts.id, link: opts.link, when: opts.when };
    this.setLabelText(label);
    this.labels.push(label);
  }

  private setLabelText(l: Label) {
    const text = l.names?.[this.lang] ?? l.names?.en ?? "";
    l.el.replaceChildren();
    if (l.link) {
      const diamond = document.createElement("i");
      diamond.className = "lbl-diamond";
      l.el.appendChild(diamond);
    }
    l.el.appendChild(document.createTextNode(text));
    if (l.link && this.events.onAsk) {
      const ask = document.createElement("button");
      ask.className = "lbl-ask";
      ask.textContent = `Ask about ${text}`;
      ask.addEventListener("click", e => { e.stopPropagation(); this.events.onAsk?.(text); });
      l.el.appendChild(ask);
    }
  }

  /**
   * A glowing equator around a body. `parent` sits at the body's centre with its local y axis along the
   * body's spin axis (bodies spin about y), so the ring stays put while the surface turns beneath it.
   */
  private addEquator(parent: THREE.Object3D, r: number) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r * 1.004, r * 0.0055, 6, 220),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85 }),
    );
    ring.rotation.x = Math.PI / 2;
    parent.add(ring);
    const tmp = new THREE.Vector3();
    // the label rides the ring, a little to the side of the point nearest you
    this.addLabel("fg", "lbl lbl-fg lbl-eq", { en: "Equator", es: "Ecuador" }, () => {
      parent.updateMatrixWorld();
      parent.worldToLocal(tmp.copy(this.cam.position));
      const a = Math.atan2(tmp.z, tmp.x) + 0.55;
      return parent.localToWorld(new THREE.Vector3(Math.cos(a) * r * 1.06, 0, Math.sin(a) * r * 1.06));
    });
  }

  private addFgLabel(text: string, pos: THREE.Vector3 | (() => THREE.Vector3), link?: string) {
    this.addLabel("fg", "lbl lbl-fg", { en: text }, typeof pos === "function" ? pos : () => pos, { link });
  }

  /** A small diamond that expands into a card on hover (or tap). */
  private addHotspot(h: Hotspot) {
    const at = h.at;
    let pos: (() => THREE.Vector3) | undefined;
    let normal: (() => THREE.Vector3) | undefined;
    let sky = false;
    if ("sky" in at) {
      const local = radecToVec(at.sky[0], at.sky[1], 860);
      pos = () => local.clone().applyQuaternion(this.skyGroup.quaternion).add(this.skyGroup.position);
      sky = true;
    } else if ("body" in at) {
      const body = this.body;
      if (!body) return;
      // Same mapping three.js uses for sphere UVs, so the marker sits on the matching texture feature.
      const lat = at.body[0] * DEG, lon = at.body[1] * DEG;
      const local = new THREE.Vector3(-Math.cos(lon) * Math.cos(lat), Math.sin(lat), Math.sin(lon) * Math.cos(lat)).multiplyScalar(1.01);
      pos = () => body.localToWorld(local.clone());
      normal = () => body.localToWorld(local.clone()).sub(body.getWorldPosition(new THREE.Vector3()));
    } else pos = this.anchors[at.anchor];
    if (!pos) return;

    const el = document.createElement("div");
    el.className = "hs";
    el.tabIndex = 0;
    el.style.display = "none";
    const mark = document.createElement("span");
    mark.className = "hs-mark";
    const card = document.createElement("div");
    card.className = "hs-card";
    const title = document.createElement("strong");
    title.textContent = this.tr(h.title);
    const body = document.createElement("p");
    body.textContent = this.tr(h.body);
    const actions = document.createElement("div");
    actions.className = "hs-actions";
    const look = document.createElement("button");
    look.textContent = this.tr("Look closer");
    const p = pos;
    look.addEventListener("click", (e) => {
      e.stopPropagation();
      this.lookAtPoint(p());
    });
    actions.appendChild(look);
    if (h.link && h.link !== this.current?.id) {
      const go = document.createElement("button");
      go.textContent = this.tr("Go to {name} ↗", { name: this.tr(byId(h.link)?.title ?? "stop") });
      go.addEventListener("click", (e) => {
        e.stopPropagation();
        this.events.onNavigate(h.link!);
      });
      actions.appendChild(go);
    }
    card.append(title, body, actions);
    el.append(mark, card);
    // Touch screens have no hover: tap the diamond to open or close the card.
    mark.addEventListener("click", () => el.classList.toggle("open"));
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.labelLayer.appendChild(el);
    this.hotspots.push({ el, pos, normal, sky });
  }

  /** Smoothly turn (and zoom) toward a point. */
  lookAtPoint(p: THREE.Vector3) {
    const { yaw, pitch } = dirToYawPitch(p.clone().sub(this.cam.position));
    let y = yaw;
    while (y - this.yaw > Math.PI) y -= Math.PI * 2;
    while (y - this.yaw < -Math.PI) y += Math.PI * 2;
    this.lookTarget = { yaw: y, pitch };
    this.vel = { yaw: 0, pitch: 0 };
    this.fov = THREE.MathUtils.clamp(this.fov * 0.6, FOV_MIN, 100);
  }

  /** Translates the info points' text (set by the page for the interface language). */
  tr: (text: string, vars?: Record<string, string>) => string = (text, vars) => (vars ? Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), text) : text);

  setLanguage(lang: string) {
    this.lang = lang;
    this.labels.forEach((l) => this.setLabelText(l));
  }

  private isOccluded(p: THREE.Vector3) {
    const dir = p.clone().sub(this.cam.position).normalize();
    return this.occluders.some(({ center, radius }) => {
      const rel = center.clone().sub(this.cam.position);
      return dir.angleTo(rel) < Math.asin(Math.min(1, (radius * 1.05) / rel.length()));
    });
  }

  private updateLabels() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const v = new THREE.Vector3();
    this.visibleLabels = [];
    for (const l of this.labels) {
      let show = this.active && this.showLabels && (!l.when || l.when());
      if (show && l.layer === "sky" && this.homeK < 0.35) show = false;
      if (show && l.layer === "sky") {
        const isCon = l.el.classList.contains("lbl-con");
        show = this.skyGroup.visible && (!isCon || this.allLines.visible || !!l.link || l.id === this.current?.constellation);
      }
      if (show) {
        v.copy(l.pos());
        if (l.layer === "sky" && this.isOccluded(v)) show = false;
      }
      if (show) {
        v.project(this.cam);
        show = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      }
      if (!show) {
        if (l.el.style.display !== "none") l.el.style.display = "none";
        continue;
      }
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      l.el.style.display = "";
      l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      this.visibleLabels.push({ x, y, text: l.el.textContent ?? "", cls: l.el.className });
    }
    for (const hs of this.hotspots) {
      let show = this.active;
      if (show) {
        v.copy(hs.pos());
        if (hs.sky && (!this.skyGroup.visible || this.homeK < 0.35 || this.isOccluded(v))) show = false;
        if (show && hs.normal && hs.normal().dot(this.cam.position.clone().sub(v)) <= 0) show = false; // far side
      }
      if (show) {
        v.project(this.cam);
        show = v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1;
      }
      if (!show) {
        if (hs.el.style.display !== "none") {
          hs.el.style.display = "none";
          hs.el.classList.remove("open");
        }
        continue;
      }
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      hs.el.style.display = "";
      hs.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      hs.el.classList.toggle("flip", x > w - this.safeArea.right - 290);
      hs.el.classList.toggle("up", y > h - this.safeArea.bottom - 190);
    }
  }

  // ───────────────────────────── Navigation ─────────────────────────────

  async fade(to: 0 | 1) {
    this.fadeEl.style.opacity = String(to);
    await new Promise((r) => setTimeout(r, 320));
  }

  /** Step into a landmark's sphere (fades through black). */
  async enter(id: string, onBlack?: () => void) {
    const lm = byId(id);
    if (!lm || this.busy) return;
    this.busy = true;
    await this.fade(1);
    onBlack?.();
    this.current = lm;
    this.buildPanorama(lm);
    this.labels.forEach((l) => this.setLabelText(l));
    this.active = true;
    this.keys.clear();
    await this.fade(0);
    this.busy = false;
  }

  /** Leave the sphere (the page shows the map). Resolves while the screen is black. */
  async leave() {
    if (this.busy) return;
    await this.fade(1);
    this.active = false;
    this.keys.clear();
    this.updateLabels();
  }

  step(delta: 1 | -1) {
    const i = LANDMARKS.findIndex((l) => l.id === this.current?.id);
    return this.enter(LANDMARKS[(i + delta + LANDMARKS.length) % LANDMARKS.length].id);
  }

  private scrollZoom(delta: number, sensitivity = 0.0012) {
    const orbiting = this.navMode === "orbit" && !!this.pivot;
    const value = orbiting ? this.orbit.r : this.fov;
    const max = orbiting ? this.rRange.max : 100;
    const atBoundary = value >= max * 0.999;
    if (this.zoomExit.update(delta, atBoundary, performance.now())) {
      this.events.onExit?.();
      return;
    }
    const next = THREE.MathUtils.clamp(value * Math.exp(delta * sensitivity), orbiting ? this.rRange.min : FOV_MIN, max);
    if (orbiting) this.orbit.r = next;
    else this.fov = next;
  }

  zoom(factor: number) {
    this.fov = THREE.MathUtils.clamp(this.fov * factor, FOV_MIN, 100);
  }

  resetView() {
    if (this.current) this.buildPanorama(this.current);
  }

  setToggles(labels: boolean, lines: boolean) {
    this.showLabels = labels;
    this.showLines = lines;
    if (this.current) this.allLines.visible = lines && ["sky", "constellation", "star"].includes(this.current.kind);
  }

  // ───────────────────────────── Export ─────────────────────────────

  /** Renders the current view (with its labels and a caption) to a PNG blob. */
  async exportPNG(caption: string): Promise<Blob> {
    this.render();
    const src = this.renderer.domElement;
    const dpr = this.renderer.getPixelRatio();
    const out = document.createElement("canvas");
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext("2d")!;
    ctx.drawImage(src, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const l of this.visibleLabels) {
      const big = l.cls.includes("lbl-fg");
      ctx.font = `${big ? 600 : 500} ${big ? 14 : 12}px system-ui, sans-serif`;
      ctx.fillStyle = l.cls.includes("lbl-con") ? "rgba(159,180,255,0.85)" : "rgba(235,240,255,0.95)";
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = 4;
      ctx.fillText(l.text.replace(" ↗", ""), l.x, l.y);
    }
    const w = out.width / dpr, h = out.height / dpr;
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(5,8,22,0.75)";
    ctx.fillRect(0, h - 40, w, 40);
    ctx.textAlign = "left";
    ctx.fillStyle = "#e8ecff";
    ctx.font = "600 14px system-ui, sans-serif";
    ctx.fillText(caption, 16, h - 20);
    ctx.textAlign = "right";
    ctx.fillStyle = "#9aa6cf";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("Star data: Hipparcos / HYG via d3-celestial", w - 16, h - 20);
    return new Promise((resolve) => out.toBlob((b) => resolve(b!), "image/png"));
  }

  // ───────────────────────────── Input & loop ─────────────────────────────

  private bindInput() {
    const c = this.canvas;
    const down = (e: PointerEvent) => {
      if (!this.active) return;
      this.lookTarget = null;
      this.hotspots.forEach((h) => h.el.classList.remove("open"));
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const move = (e: PointerEvent) => {
      const p = this.pointers.get(e.pointerId);
      if (!p || !this.active) return;
      if (this.pointers.size === 2) {
        p.x = e.clientX;
        p.y = e.clientY;
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDist && d > 0) {
          const delta = Math.log(this.pinchDist / d) / 0.0012;
          this.scrollZoom(Math.max(-160, Math.min(160, delta)));
        }
        this.pinchDist = d;
        return;
      }
      if (this.navMode === "orbit") {
        // Drag to swing around the object
        this.orbit.az -= (e.clientX - p.x) * 0.006;
        this.orbit.el = THREE.MathUtils.clamp(this.orbit.el + (e.clientY - p.y) * 0.006, -85 * DEG, 85 * DEG);
        p.x = e.clientX;
        p.y = e.clientY;
        return;
      }
      // Grab-and-drag like Street View: the sky follows your cursor.
      const k = (this.fov * DEG) / c.clientHeight;
      const dy = (e.clientX - p.x) * k, dp = (e.clientY - p.y) * k;
      this.yaw += dy;
      this.pitch = THREE.MathUtils.clamp(this.pitch + dp, -89 * DEG, 89 * DEG);
      this.vel = { yaw: dy, pitch: dp };
      p.x = e.clientX;
      p.y = e.clientY;
    };
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinchDist = 0;
    };
    const wheel = (e: WheelEvent) => {
      if (!this.active || this.busy) return;
      e.preventDefault();
      const delta = wheelPixels(e.deltaY, e.deltaMode, c.clientHeight);
      this.scrollZoom(delta, e.ctrlKey ? 0.006 : 0.0012);
    };
    const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable]");
    const keydown = (e: KeyboardEvent) => {
      if (!this.active || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const { token } = this.keys.keydown(e, FLY_KEYS);
      if (token) {
        if (!isShiftToken(token)) e.preventDefault();
        return;
      }
      if (!e.repeat && (e.code === "KeyR" || e.key.toLowerCase() === "r")) this.resetView();
    };
    const keyup = (e: KeyboardEvent) => {
      this.keys.keyup(e);
    };
    const blur = () => this.keys.clear();
    const onVisibility = () => {
      if (document.hidden) this.keys.clear();
    };

    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("wheel", wheel, { passive: false });
    this.labelLayer.addEventListener("wheel", wheel, { passive: false }); // labels sit over the canvas: scrolling on them still zooms
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", onVisibility);
    this.cleanup.push(() => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
      c.removeEventListener("wheel", wheel);
      this.labelLayer.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", onVisibility);
    });
  }

  /**
   * Look: WASD and arrows turn on the spot. Orbit: A/D go around, W/S closer/farther, Q/E down/up.
   * Free fly: WASD move, Q/E down/up, arrows (or drag) look.
   */
  private applyKeys(dt: number) {
    const has = (k: string) => this.keys.has(k);
    const look = 70 * DEG * dt * (this.fov / 70);
    if (this.navMode === "orbit") {
      const sp = dt * 1.1 * (this.keys.shift ? 2.5 : 1);
      if (has("a") || has("arrowleft")) this.orbit.az -= sp;
      if (has("d") || has("arrowright")) this.orbit.az += sp;
      if (has("e")) this.orbit.el = Math.min(this.orbit.el + sp * 0.7, 85 * DEG);
      if (has("q")) this.orbit.el = Math.max(this.orbit.el - sp * 0.7, -85 * DEG);
      if (has("w") || has("arrowup")) this.orbit.r = Math.max(this.rRange.min, this.orbit.r * Math.exp(-sp));
      if (has("s") || has("arrowdown")) this.orbit.r = Math.min(this.rRange.max, this.orbit.r * Math.exp(sp));
      return;
    }
    const fly = this.navMode === "fly" && this.flyRadius > 0;
    if (has("arrowleft") || (!fly && has("a"))) this.yaw += look;
    if (has("arrowright") || (!fly && has("d"))) this.yaw -= look;
    if (has("arrowup") || (!fly && has("w"))) this.pitch = Math.min(this.pitch + look, 89 * DEG);
    if (has("arrowdown") || (!fly && has("s"))) this.pitch = Math.max(this.pitch - look, -89 * DEG);
    if (!fly) return;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.cam.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.cam.quaternion);
    const move = new THREE.Vector3();
    if (has("w")) move.add(forward);
    if (has("s")) move.sub(forward);
    if (has("d")) move.add(right);
    if (has("a")) move.sub(right);
    if (has("e")) move.y += 1;
    if (has("q")) move.y -= 1;
    if (!move.lengthSq()) return;
    this.lookTarget = null;
    move.normalize().multiplyScalar(this.flySpeed * dt * (this.keys.shift ? 3 : 1));
    const p = this.cam.position.add(move);
    if (p.length() > this.flyRadius) p.setLength(this.flyRadius);
    for (const o of this.occluders) {
      const rel = p.clone().sub(o.center);
      const min = o.radius * 1.15;
      if (rel.length() < min) p.copy(o.center).add(rel.setLength(min));
    }
  }

  private resize() {
    const p = this.canvas.parentElement!;
    this.renderer.setSize(p.clientWidth, p.clientHeight, false);
    this.cam.aspect = p.clientWidth / Math.max(1, p.clientHeight);
    this.cam.updateProjectionMatrix();
  }

  private render() {
    this.renderer.render(this.scene, this.cam);
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (!this.active) {
      this.updateLabels();
      return;
    }
    const t = this.clock.elapsedTime;
    for (const s of this.spinners) s.obj.rotation.y += s.speed * dt;
    for (const u of this.starUniforms) u.uTime.value = t;
    if (this.patchMat && this.patchFade < 1) this.patchFade = Math.min(1, this.patchFade + dt * 1.5);

    this.applyKeys(dt);
    if (this.navMode === "orbit" && this.pivot) {
      const { az, el, r } = this.orbit;
      this.cam.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(r).add(this.pivot);
      const want = dirToYawPitch(this.pivot.clone().sub(this.cam.position));
      let dy = want.yaw - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * 0.3; // ease in, so switching to orbit never jumps
      this.pitch += (want.pitch - this.pitch) * 0.3;
      this.vel = { yaw: 0, pitch: 0 };
    }
    if (this.lookTarget) {
      this.yaw += (this.lookTarget.yaw - this.yaw) * 0.12;
      this.pitch += (this.lookTarget.pitch - this.pitch) * 0.12;
      if (Math.abs(this.lookTarget.yaw - this.yaw) + Math.abs(this.lookTarget.pitch - this.pitch) < 0.002) this.lookTarget = null;
    }
    if (!this.pointers.size) {
      this.yaw += this.vel.yaw;
      this.pitch = THREE.MathUtils.clamp(this.pitch + this.vel.pitch, -89 * DEG, 89 * DEG);
      this.vel.yaw *= 0.9;
      this.vel.pitch *= 0.9;
    }
    this.cam.rotation.set(this.pitch, this.yaw, 0);
    this.skyGroup.position.copy(this.cam.position); // stars are infinitely far away

    // Leaving the Sun: the flat sky pattern (lines, labels, SPHEREx patch) no longer applies, so fade it
    this.homeK = this.con3d ? THREE.MathUtils.clamp(1 - this.cam.position.length() / (0.12 * this.con3d.home), 0, 1) : 1;
    (this.allLines.material as THREE.LineBasicMaterial).opacity = 0.32 * this.homeK;
    for (const h of this.highlight.children) ((h as THREE.LineSegments).material as THREE.LineBasicMaterial).opacity = 0.95 * this.homeK;
    if (this.patchMat) this.patchMat.opacity = this.patchFade * (0.25 + 0.75 * this.homeK);
    if (this.con3d) {
      // Each star's brightness as seen from where you are now (real absolute magnitudes)
      const { stars, size, col, base } = this.con3d;
      for (let k = 0; k < stars.length; k++) {
        const ly = Math.max(0.05, stars[k].pos.distanceTo(this.cam.position) * LY_PER_UNIT);
        const m = stars[k].absMag + 5 * Math.log10(ly / PC_TO_LY / 10);
        size.setX(k, THREE.MathUtils.clamp((7.5 - m) * 1.5, 2.5, 40));
        const b = THREE.MathUtils.clamp(0.5 + (6 - m) / 5, 0.5, 1.6);
        col.setXYZ(k, base[k][0] * b, base[k][1] * b, base[k][2] * b);
      }
      size.needsUpdate = true;
      col.needsUpdate = true;
      this.con3d.mat.uniforms.uScale.value = this.renderer.getPixelRatio() * THREE.MathUtils.clamp(Math.sqrt(70 / this.cam.fov), 0.85, 1.8);
    }
    const ns = this.nav;
    const key = `${ns.mode}|${ns.canOrbit}|${ns.canFly}|${ns.az.toFixed(2)}|${ns.el.toFixed(2)}|${ns.r.toFixed(1)}|${ns.away}|${ns.yaw.toFixed(2)}|${ns.pitch.toFixed(2)}|${ns.fov.toFixed(0)}`;
    if (key !== this.navKey) {
      this.navKey = key;
      this.events.onNav?.(ns);
    }
    if (Math.abs(this.cam.fov - this.fov) > 0.01) {
      this.cam.fov += (this.fov - this.cam.fov) * 0.2;
      this.cam.updateProjectionMatrix();
    }
    const pr = this.renderer.getPixelRatio();
    this.starsMat.uniforms.uScale.value = pr * THREE.MathUtils.clamp(Math.sqrt(70 / this.cam.fov), 0.85, 1.8);
    this.mwMat.uniforms.uScale.value = pr * Math.sqrt(70 / this.cam.fov);
    this.render();
    this.updateLabels();
  };
}
