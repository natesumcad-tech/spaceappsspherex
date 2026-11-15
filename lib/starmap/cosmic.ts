import * as THREE from "three";
import type { SkyData } from "@/lib/explorer/astro";
import { bvToKelvin, kelvinToRGB } from "@/lib/explorer/astro";
import { DEG, EQ_TO_GAL, apply, radecToUnit } from "./coords";

// The zoomed-out view: the Milky Way and nearby galaxies in real 3D (1 scene unit = 1 light-year,
// the Sun at the origin, galactic coordinates with the galactic north pole up). Zoom in on the Sun
// and the stars of the constellations resolve out of it; zoom far enough and the page hands over to the sky map.

export type Galaxy = {
  id: string;
  name: string;
  kind: string;
  ra: number;
  dec: number;
  /** Distance from the Sun and diameter, light-years. */
  dist: number;
  size: number;
  description: string;
  /** Waypoint id with a 360° view, if any. */
  wp?: string;
};

export const GALAXIES: Galaxy[] = [
  { id: "lmc", name: "Large Magellanic Cloud", kind: "Satellite galaxy", ra: 80.894, dec: -69.756, dist: 160_000, size: 14_000, wp: "lmc", description: "The Milky Way's biggest satellite galaxy, full of star-forming clouds." },
  { id: "smc", name: "Small Magellanic Cloud", kind: "Satellite galaxy", ra: 13.187, dec: -72.829, dist: 200_000, size: 7_000, wp: "smc", description: "A dwarf galaxy being stretched by the Milky Way and the Large Magellanic Cloud." },
  { id: "m31", name: "Andromeda Galaxy", kind: "Spiral galaxy", ra: 10.685, dec: 41.269, dist: 2_500_000, size: 150_000, wp: "m31", description: "The nearest big galaxy. It and the Milky Way are heading for a merger in about 4–5 billion years." },
  { id: "m33", name: "Triangulum Galaxy", kind: "Spiral galaxy", ra: 23.462, dec: 30.66, dist: 2_730_000, size: 60_000, wp: "m33", description: "The third-largest member of our Local Group of galaxies." },
  { id: "ngc253", name: "Sculptor Galaxy", kind: "Starburst galaxy", ra: 11.888, dec: -25.288, dist: 11_400_000, size: 90_000, description: "A dusty spiral forming stars unusually fast." },
  { id: "m81", name: "Bode's Galaxy (M81)", kind: "Spiral galaxy", ra: 148.888, dec: 69.065, dist: 11_800_000, size: 90_000, description: "A grand spiral and the heart of a nearby galaxy group." },
  { id: "m82", name: "Cigar Galaxy (M82)", kind: "Starburst galaxy", ra: 148.97, dec: 69.68, dist: 11_500_000, size: 37_000, description: "Stirred up by M81, it is forming stars about ten times faster than the Milky Way." },
  { id: "cena", name: "Centaurus A", kind: "Active galaxy", ra: 201.365, dec: -43.019, dist: 12_000_000, size: 60_000, wp: "cena", description: "A giant galaxy with a supermassive black hole firing jets far into space." },
  { id: "m101", name: "Pinwheel Galaxy (M101)", kind: "Spiral galaxy", ra: 210.802, dec: 54.349, dist: 21_000_000, size: 170_000, wp: "m101", description: "A huge face-on spiral; SPHEREx tutorials map its glowing dust." },
  { id: "m51", name: "Whirlpool Galaxy (M51)", kind: "Interacting galaxy", ra: 202.47, dec: 47.195, dist: 23_000_000, size: 76_000, wp: "m51", description: "A spiral tugging on a small companion galaxy." },
  { id: "m104", name: "Sombrero Galaxy (M104)", kind: "Spiral galaxy", ra: 189.998, dec: -11.623, dist: 31_000_000, size: 50_000, wp: "m104", description: "An edge-on spiral with a bright bulge and a dark lane of dust." },
  { id: "m87", name: "M87", kind: "Giant elliptical galaxy", ra: 187.706, dec: 12.391, dist: 53_500_000, size: 120_000, description: "Home of the first black hole ever imaged, in 2019, at the heart of the Virgo Cluster." },
];

const MW = { id: "milky-way", name: "Milky Way", kind: "Our galaxy", size: 100_000, dist: 0, description: "Our home galaxy: a barred spiral of 100–400 billion stars. The Sun is about 26,000 light-years from its center." };

const SUN_TO_CENTER = 26_000;
const HOME_DIST = 125_000;
/**
 * "Home" framing: at the Milky Way's scale the camera looks at the galaxy's centre; as you zoom
 * in toward the Sun the view slides over to it, so diving in always lands on the Sun.
 */
const homeTarget = (d: number, out = new THREE.Vector3()) => {
  const t = THREE.MathUtils.clamp((d - 20_000) / (HOME_DIST - 20_000), 0, 1);
  return out.set(SUN_TO_CENTER * t * t * (3 - 2 * t), 0, 0);
};
const ENTER_SKY = 1_200; // zoom closer than this to the Sun and the sky map takes over
const D_MIN = 400;
const D_MAX = 90_000_000;

const gaussian = () => {
  let u = 0;
  while (!u) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
};

/** Galactic (x toward the centre, y toward l = 90°, z north) → three.js (y up). */
const g2t = (g: [number, number, number], out = new THREE.Vector3()) => out.set(g[0], g[2], -g[1]);
/** RA/Dec + distance → scene position. */
export const radecDist = (ra: number, dec: number, d: number) => g2t(apply(EQ_TO_GAL, radecToUnit(ra, dec)).map((c) => c * d) as [number, number, number]);

const VERT = /* glsl */ `
  attribute float size; attribute vec3 aColor;
  uniform float uK; uniform float uMax; uniform float uAlpha;
  varying vec3 vColor; varying float vA;
  void main() {
    vColor = aColor; vA = uAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(size * uK / -mv.z, 1.0, uMax);
  }`;
const FRAG = /* glsl */ `
  varying vec3 vColor; varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor, a * a * vA);
  }`;
const mat = (k: number, max: number) =>
  new THREE.ShaderMaterial({
    uniforms: { uK: { value: k }, uMax: { value: max }, uAlpha: { value: 1 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

function cloud(pos: number[], col: number[], size: number[], m: THREE.Material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aColor", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("size", new THREE.Float32BufferAttribute(size, 1));
  return new THREE.Points(g, m);
}

/** A spiral galaxy made of particles, in its own plane (x, z), radius `r` light-years. */
function spiralGalaxy(r: number, n: number, tint: [number, number, number], bar = 0) {
  const pos: number[] = [], col: number[] = [], size: number[] = [];
  const k = r / 50;
  for (let i = 0; i < n * 0.18; i++) {
    const x = gaussian() * 6.5 * k, z = gaussian() * (bar ? 2.6 : 5) * k, y = gaussian() * 1.6 * k;
    const c = Math.cos(bar), s = Math.sin(bar);
    pos.push(x * c - z * s, y, x * s + z * c);
    col.push(0.2, 0.15, 0.09);
    size.push(2.2 * k);
  }
  const pitch = 1 / Math.tan(13 * DEG);
  for (let i = 0; i < n * 0.65; i++) {
    const arm = i % 4, rr = 4.5 + Math.pow(Math.random(), 0.9) * 45;
    const th = arm * (Math.PI / 2) + Math.log(rr / 4.5) * pitch * 0.5 + gaussian() * (0.12 + 3 / rr);
    const sp = gaussian() * (0.6 + rr * 0.04);
    const hot = Math.random() < 0.04;
    pos.push((Math.cos(th) * rr + Math.cos(th + Math.PI / 2) * sp) * k, gaussian() * 0.5 * k, (Math.sin(th) * rr + Math.sin(th + Math.PI / 2) * sp) * k);
    col.push(...(hot ? [0.4, 0.16, 0.24] : tint));
    size.push((hot ? 2.4 : 1.6) * k);
  }
  for (let i = 0; i < n * 0.17; i++) {
    const rr = -Math.log(1 - Math.random() * 0.98) * 12 * k, t = Math.random() * Math.PI * 2;
    pos.push(Math.cos(t) * rr, gaussian() * 0.8 * k, Math.sin(t) * rr);
    col.push(0.06, 0.06, 0.08);
    size.push(1.4 * k);
  }
  return { pos, col, size };
}

/** A small glowing galaxy sprite, for galaxies seen from far away. */
let glowTex: THREE.Texture | null = null;
function galaxyTexture() {
  if (glowTex) return glowTex;
  const c = Object.assign(document.createElement("canvas"), { width: 128, height: 128 });
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,244,220,1)");
  g.addColorStop(0.15, "rgba(230,220,255,0.75)");
  g.addColorStop(0.5, "rgba(170,160,255,0.18)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

export type CosmicEvents = {
  /** Zoomed in on the Sun: time to show the sky map. */
  onEnterSky: () => void;
  onSelect: (g: Galaxy | typeof MW | null) => void;
  onView: (v: { dist: number; scale: string; targetName: string }) => void;
  /** The intro ended because the user took the controls. */
  onIntroEnd?: () => void;
};

export class CosmicView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(50, 1, 1, 3e8);
  private target = new THREE.Vector3();
  private targetName = "Sun";
  /** Following the home framing (galaxy centre far out, the Sun up close). */
  private home = true;
  private az = 2.4;
  private el = 0.7;
  /** Opening view: the whole Milky Way fills the screen. */
  dist = HOME_DIST;
  private active = false;
  private raf = 0;
  private tween: { from: { t: THREE.Vector3; d: number }; to: { t: THREE.Vector3; d: number }; start: number; ms: number } | null = null;
  private drag: { x: number; y: number } | null = null;
  /** Lower `prio` wins when labels would overlap. */
  private labels: { el: HTMLElement; pos: THREE.Vector3; min?: number; max?: number; prio: number; w?: number }[] = [];
  private starMat = mat(2_000, 4);
  private lineMat = new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0, depthWrite: false });
  private mwMat = mat(150_000, 3.5);
  private ro: ResizeObserver;
  private cleanup: (() => void)[] = [];
  private entered = false;

  constructor(
    private container: HTMLElement,
    private labelLayer: HTMLElement,
    private sky: SkyData,
    private events: CosmicEvents,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.domElement.className = "cv-canvas";
    container.prepend(this.renderer.domElement);
    this.build();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.bind();
    this.resize();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.cleanup.forEach((f) => f());
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.forEach((l) => l.el.remove());
  }

  // ───────────────────────── Scene ─────────────────────────

  private build() {
    // The Milky Way: centre 26,000 ly away toward galactic longitude 0
    const mw = spiralGalaxy(50_000, 90_000, [0.08, 0.095, 0.13], 0.45);
    const mwPts = cloud(mw.pos, mw.col, mw.size, this.mwMat);
    mwPts.position.set(SUN_TO_CENTER, 0, 0);
    mwPts.rotation.y = 0.5;
    this.scene.add(mwPts);

    // Nearby galaxies: particle disks for the two big Local Group spirals, glowing sprites for the rest
    for (const g of GALAXIES) {
      const p = radecDist(g.ra, g.dec, g.dist);
      if (g.id === "m31" || g.id === "m33") {
        const s = spiralGalaxy(g.size / 2, g.id === "m31" ? 40_000 : 15_000, [0.08, 0.09, 0.12]);
        const pts = cloud(s.pos, s.col, s.size, mat(150_000, 3));
        pts.position.copy(p);
        pts.rotation.set(g.id === "m31" ? 1.3 : 0.9, 0.6, 0.3);
        this.scene.add(pts);
      }
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: galaxyTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: g.id === "m31" || g.id === "m33" ? 0.35 : 0.9 }));
      sp.scale.setScalar(g.size * 1.4);
      sp.position.copy(p);
      this.scene.add(sp);
      this.addLabel(g.name, p, () => this.select(g), "cv-gal", { min: HOME_DIST * 1.4, max: g.dist * 40, prio: 10 + Math.log10(g.dist) - g.size / 1e6 }); // only once you zoom out past the Milky Way
    }
    this.addLabel("Milky Way", new THREE.Vector3(SUN_TO_CENTER, 0, 0), () => this.select(MW), "cv-gal cv-mw", { min: 20_000, max: 6_000_000, prio: 1 });

    // Every catalogue star with a distance, at its real position: a tiny cloud around the Sun
    const pos: number[] = [], col: number[] = [], size: number[] = [];
    for (const [ra, dec, mag, bv, dpc] of this.sky.stars) {
      if (!dpc) continue;
      const ly = dpc * 3.2616;
      const v = radecDist(ra, dec, ly);
      pos.push(v.x, v.y, v.z);
      const [r, g, b] = kelvinToRGB(bvToKelvin(bv));
      const absMag = mag - 5 * Math.log10(dpc / 10);
      const k = THREE.MathUtils.clamp(0.4 + (4 - absMag) / 8, 0.3, 1.4);
      col.push(r * k, g * k, b * k);
      size.push(THREE.MathUtils.clamp(3 - absMag / 3, 1, 5));
    }
    this.scene.add(cloud(pos, col, size, this.starMat));

    // The constellation figures in 3D (vertices matched to catalogue stars by direction)
    const bins = new Map<string, number[]>();
    const key = (ra: number, dec: number) => `${Math.floor(ra / 2)},${Math.floor((dec + 90) / 2)}`;
    this.sky.stars.forEach(([ra, dec, mag], i) => {
      if (mag > 6.5) return;
      const k = key(ra, dec);
      bins.get(k)?.push(i) ?? bins.set(k, [i]);
    });
    const nearest = (ra: number, dec: number) => {
      const u = radecToUnit(ra, dec);
      let best = -1, bd = Math.cos(0.25 * DEG);
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++)
          for (const i of bins.get(`${Math.floor(ra / 2) + a},${Math.floor((dec + 90) / 2) + b}`) ?? []) {
            const s = this.sky.stars[i], w = radecToUnit(s[0], s[1]);
            const d = u[0] * w[0] + u[1] * w[1] + u[2] * w[2];
            if (d > bd) [bd, best] = [d, i];
          }
      return best;
    };
    const seg: number[] = [];
    for (const c of this.sky.constellations) {
      const pts: THREE.Vector3[] = [];
      for (const line of c.lines) {
        const vs = line.map(([ra, dec]) => {
          const i = nearest(ra, dec);
          const dpc = i >= 0 ? this.sky.stars[i][4] : 0;
          return dpc ? radecDist(ra, dec, dpc * 3.2616) : null;
        });
        for (let k = 0; k < vs.length - 1; k++) if (vs[k] && vs[k + 1]) seg.push(...vs[k]!.toArray(), ...vs[k + 1]!.toArray());
        vs.forEach((v) => v && pts.push(v));
      }
      if (pts.length && c.rank <= 2) {
        const mid = pts.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(pts.length);
        this.addLabel(c.names.en, mid, null, "cv-con", { max: 9_000, prio: 50 });
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
    this.scene.add(new THREE.LineSegments(lg, this.lineMat));

    // The Sun
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: galaxyTexture(), color: 0xffe28a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, sizeAttenuation: false }));
    sun.scale.setScalar(0.035);
    this.scene.add(sun);
    this.addLabel("Sun · you are here", new THREE.Vector3(), () => this.dive(), "cv-sun", { prio: 0, max: 300_000 });
    this.labels.sort((a, b) => a.prio - b.prio);
  }

  private addLabel(text: string, pos: THREE.Vector3, onClick: (() => void) | null, cls: string, o: { min?: number; max?: number; prio?: number } = {}) {
    const el = document.createElement(onClick ? "button" : "div");
    el.className = `cv-label ${cls}`;
    el.textContent = text;
    el.style.display = "none";
    if (onClick) el.addEventListener("click", onClick);
    this.labelLayer.appendChild(el);
    this.labels.push({ el, pos, min: o.min, max: o.max, prio: o.prio ?? 20 });
  }

  // ───────────────────────── Navigation ─────────────────────────

  setActive(on: boolean) {
    this.active = on;
    this.renderer.domElement.style.pointerEvents = on ? "auto" : "none";
    this.labelLayer.style.display = on ? "" : "none";
    if (on) {
      this.entered = false;
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(this.loop);
    }
  }

  /** Arrive from the sky map: start just outside the Sun's neighborhood and pull back. */
  pullBack() {
    this.target.set(0, 0, 0);
    this.targetName = "Sun";
    this.home = true;
    this.dist = ENTER_SKY * 1.6;
    this.animateTo(homeTarget(HOME_DIST), HOME_DIST, 2200);
  }

  /** Back to the opening view: the whole Milky Way. */
  flyHome() {
    this.events.onSelect(null);
    this.targetName = "Sun";
    this.home = true;
    this.animateTo(homeTarget(HOME_DIST), HOME_DIST, 1400);
  }

  /** Zoom smoothly into the Sun until the sky map takes over. */
  private introOn = false;
  /** The user grabbed the controls mid-intro: stop the cutscene where it is. */
  private cancelIntro() {
    if (!this.introOn) return;
    this.introOn = false;
    if (this.introTimer) clearTimeout(this.introTimer);
    this.introTimer = null;
    this.tween = null;
    this.events.onIntroEnd?.();
  }

  dive(ms = 2200) {
    this.events.onSelect(null);
    this.targetName = "Sun";
    this.home = true;
    this.animateTo(new THREE.Vector3(), ENTER_SKY * 0.8, ms);
  }

  /** Opening cutscene: hold on the Milky Way, then glide into the Sun (the sky map takes over at the end). */
  playIntro(holdMs = 1000, diveMs = 3200) {
    this.introOn = true;
    this.introTimer = setTimeout(() => {
      this.introTimer = null;
      this.dive(diveMs);
    }, holdMs);
  }
  private introTimer: ReturnType<typeof setTimeout> | null = null;
  /** Skip straight to the end of the intro. */
  skipIntro() {
    this.introOn = false;
    if (this.introTimer) clearTimeout(this.introTimer);
    this.introTimer = null;
    this.tween = null;
    this.target.set(0, 0, 0);
    this.dist = ENTER_SKY * 0.8;
  }

  select(g: Galaxy | typeof MW) {
    this.events.onSelect(g);
    this.home = false;
    const p = g.dist ? radecDist((g as Galaxy).ra, (g as Galaxy).dec, g.dist) : new THREE.Vector3(SUN_TO_CENTER, 0, 0);
    this.targetName = g.name;
    this.animateTo(p, g.size * 3.2, 1600);
  }

  private animateTo(t: THREE.Vector3, d: number, ms: number) {
    this.tween = { from: { t: this.target.clone(), d: this.dist }, to: { t: t.clone(), d }, start: performance.now(), ms };
  }

  zoomBy(f: number) {
    this.tween = null;
    this.dist = THREE.MathUtils.clamp(this.dist * f, this.targetName === "Sun" ? ENTER_SKY * 0.7 : D_MIN, D_MAX);
  }

  // ───────────────────────── Input & loop ─────────────────────────

  private bind() {
    const c = this.renderer.domElement;
    const down = (e: PointerEvent) => {
      this.cancelIntro();
      c.setPointerCapture(e.pointerId);
      this.drag = { x: e.clientX, y: e.clientY };
      this.tween = null;
    };
    const move = (e: PointerEvent) => {
      if (!this.drag) return;
      this.az -= (e.clientX - this.drag.x) * 0.005;
      this.el = THREE.MathUtils.clamp(this.el + (e.clientY - this.drag.y) * 0.005, -1.45, 1.45);
      this.drag = { x: e.clientX, y: e.clientY };
    };
    const up = () => (this.drag = null);
    const wheel = (e: WheelEvent) => {
      if (this.active) this.cancelIntro();
      if (!this.active) return;
      e.preventDefault();
      this.zoomBy(Math.exp(e.deltaY * (e.ctrlKey ? 0.012 : 0.0032)));
    };
    const key = (e: KeyboardEvent) => {
      if (this.active && !(e.target as HTMLElement)?.closest?.("input, textarea, select")) this.cancelIntro();
      if (!this.active || (e.target as HTMLElement)?.closest?.("input, textarea, select")) return;
      const k = e.key.toLowerCase();
      if (k === "z" || k === "=" || k === "+") this.zoomBy(0.8);
      else if (k === "x" || k === "-") this.zoomBy(1.25);
      else if (k === "a" || k === "arrowleft") this.az += 0.08;
      else if (k === "d" || k === "arrowright") this.az -= 0.08;
      else if (k === "w" || k === "arrowup") this.el = Math.min(1.45, this.el + 0.06);
      else if (k === "s" || k === "arrowdown") this.el = Math.max(-1.45, this.el - 0.06);
      else return;
      e.preventDefault();
    };
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    this.container.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keydown", key);
    this.cleanup.push(() => window.removeEventListener("keydown", key));
  }

  private resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.cam.aspect = w / Math.max(1, h);
    this.cam.updateProjectionMatrix();
  }

  private scaleName() {
    const d = this.dist;
    return d < 9_000 ? "Our stellar neighborhood" : d < 400_000 ? "The Milky Way" : d < 8_000_000 ? "The Local Group" : "Nearby galaxies";
  }

  private loop = () => {
    if (!this.active) return;
    this.raf = requestAnimationFrame(this.loop);
    if (this.tween) {
      const k = Math.min(1, (performance.now() - this.tween.start) / this.tween.ms);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.target.lerpVectors(this.tween.from.t, this.tween.to.t, e);
      // move through distance logarithmically, so zooms across millions of light-years feel even
      this.dist = Math.exp(Math.log(this.tween.from.d) + (Math.log(this.tween.to.d) - Math.log(this.tween.from.d)) * e);
      if (k >= 1) this.tween = null;
    } else if (this.home) homeTarget(this.dist, this.target);
    const ce = Math.cos(this.el);
    this.cam.position.set(Math.sin(this.az) * ce, Math.sin(this.el), Math.cos(this.az) * ce).multiplyScalar(this.dist).add(this.target);
    this.cam.lookAt(this.target);
    this.cam.near = Math.max(1, this.dist * 0.002);
    this.cam.far = this.dist * 50 + 2e8;
    this.cam.updateProjectionMatrix();

    // The constellation stars stand out as you approach, and fade into the Sun's glow as you leave
    const sunDist = this.cam.position.length();
    const near = THREE.MathUtils.clamp(1 - Math.log10(sunDist / 6_000) / 1.2, 0, 1);
    this.starMat.uniforms.uAlpha.value = 0.15 + 0.85 * near;
    this.starMat.uniforms.uK.value = THREE.MathUtils.clamp(sunDist / 4, 300, 4_000);
    this.lineMat.opacity = THREE.MathUtils.clamp(1 - Math.log10(sunDist / 2_500) / 0.8, 0, 0.22); // faint: from out here they only hint at the figures
    this.mwMat.uniforms.uAlpha.value = THREE.MathUtils.clamp(Math.log10(sunDist / 1_500) / 1.2, 0.15, 1);

    this.renderer.render(this.scene, this.cam);

    const w = this.container.clientWidth, h = this.container.clientHeight, v = new THREE.Vector3();
    const placed: [number, number, number, number][] = []; // screen boxes already taken
    for (const l of this.labels) {
      const camD = this.cam.position.distanceTo(l.pos);
      let show = (l.min === undefined || this.dist >= l.min) && (l.max === undefined || camD <= l.max);
      if (show) {
        v.copy(l.pos).project(this.cam);
        show = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      }
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      if (show) {
        // Skip a label that would sit on top of a more important one
        const lw = (l.w ||= l.el.offsetWidth || l.el.textContent!.length * 7 + 18), lh = 22;
        const box: [number, number, number, number] = [x - lw / 2 - 3, y - lh * 1.5 - 3, x + lw / 2 + 3, y - lh * 0.5 + 3];
        if (placed.some((p) => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1])) show = false;
        else placed.push(box);
      }
      if (!show) {
        if (l.el.style.display !== "none") l.el.style.display = "none";
        continue;
      }
      l.el.style.display = "";
      if (!l.w) l.w = l.el.offsetWidth;
      l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
    this.events.onView({ dist: this.dist, scale: this.scaleName(), targetName: this.targetName });

    if (!this.entered && this.targetName === "Sun" && this.dist < ENTER_SKY) {
      this.entered = true;
      this.events.onEnterSky();
    }
  };
}

export { MW };
