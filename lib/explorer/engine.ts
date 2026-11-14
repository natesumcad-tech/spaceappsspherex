import * as THREE from "three";
import { MapControls } from "three/addons/controls/MapControls.js";
import { LANDMARKS, byId, type Landmark } from "./landmarks";
import {
  DEG,
  bvToKelvin,
  dirToYawPitch,
  galacticToRaDec,
  kelvinToRGB,
  radecToVec,
  yawPitchToDir,
  type SkyData,
} from "./astro";
import {
  cloudTexture,
  constellationBadge,
  galaxyBadge,
  glowTexture,
  planetTexture,
  ringTexture,
  skyThumbTexture,
} from "./textures";

export type Mode = "map" | "sphere";

export type EngineEvents = {
  onModeChange: (mode: Mode, id: string | null) => void;
  onHover: (id: string | null) => void;
};

type Label = {
  el: HTMLDivElement;
  mode: Mode;
  layer: "sky" | "fg" | "map";
  pos: () => THREE.Vector3;
  names?: Record<string, string>;
  id?: string;
};

type Tween = { start: number; ms: number; fn: (t: number) => void; done: () => void };

const SECTION_COLORS: Record<string, string> = {
  "Near Earth": "#5ec8ff",
  Constellations: "#9fb4ff",
  "Solar System": "#ffb547",
  Stars: "#ff7a6b",
  "Milky Way": "#c39bff",
};

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

function gaussian(rand = Math.random) {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

export class SkyEngine {
  private renderer: THREE.WebGLRenderer;
  private mapScene = new THREE.Scene();
  private panoScene = new THREE.Scene();
  private mapCam = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  private panoCam = new THREE.PerspectiveCamera(70, 1, 0.01, 5000);
  private controls: MapControls;
  private sky!: SkyData;

  private skyGroup = new THREE.Group();
  private starsMat = pointsMaterial(1);
  private mwMat = pointsMaterial(1);
  private allLines!: THREE.LineSegments;
  private highlight = new THREE.Group();
  private fg = new THREE.Group();
  private spinners: { obj: THREE.Object3D; speed: number }[] = [];
  private mapSpinners: { obj: THREE.Object3D; speed: number }[] = [];
  private starUniforms: { uTime: { value: number } }[] = [];
  /** Solid bodies in the current sphere; sky labels behind them are hidden. */
  private occluders: { center: THREE.Vector3; radius: number }[] = [];

  private nodes: { id: string; pos: THREE.Vector3; group: THREE.Group; hit: THREE.Mesh }[] = [];
  private pathMat!: THREE.ShaderMaterial;

  private labels: Label[] = [];
  private visibleLabels: { x: number; y: number; text: string; cls: string }[] = [];
  private tweens: Tween[] = [];
  private raf = 0;
  private clock = new THREE.Clock();
  private ro: ResizeObserver;
  private cleanup: (() => void)[] = [];

  mode: Mode = "map";
  current: Landmark | null = null;
  private hovered: string | null = null;
  private busy = false;
  private lang = "en";
  showLabels = true;
  showLines = true;

  // Panorama look state
  private yaw = 0;
  private pitch = 0;
  private fov = 70;
  private vel = { yaw: 0, pitch: 0 };
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private downAt = { x: 0, y: 0 };

  constructor(
    private canvas: HTMLCanvasElement,
    private labelLayer: HTMLDivElement,
    private fadeEl: HTMLDivElement,
    private events: EngineEvents,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.panoCam.rotation.order = "YXZ";

    this.controls = new MapControls(this.mapCam, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = 1.35;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 140;

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement!);
    this.bindInput();
  }

  async init(skyUrl: string) {
    const res = await fetch(skyUrl);
    this.sky = await res.json();
    this.buildSky();
    this.buildMap();
    this.resize();
    this.loop();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.cleanup.forEach((f) => f());
    this.controls.dispose();
    this.renderer.dispose();
    this.labelLayer.innerHTML = "";
  }

  // ───────────────────────────── Sky (shared by every sphere) ─────────────────────────────

  private buildSky() {
    const n = this.sky.stars.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const v = new THREE.Vector3();
    this.sky.stars.forEach(([ra, dec, mag, bv], i) => {
      radecToVec(ra, dec, 900, v).toArray(pos, i * 3);
      const [r, g, b] = kelvinToRGB(bvToKelvin(bv));
      const bright = THREE.MathUtils.clamp(0.3 + (7.5 - mag) / 5.5, 0.3, 1.4);
      col.set([r * bright, g * bright, b * bright], i * 3);
      size[i] = Math.max(1.6, (7.8 - mag) * 1.15);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
    const stars = new THREE.Points(geo, this.starsMat);
    stars.name = "stars";
    this.skyGroup.add(stars);

    this.skyGroup.add(this.buildMilkyWayBand());

    // Constellation stick figures
    const seg: number[] = [];
    for (const c of this.sky.constellations)
      for (const line of c.lines)
        for (let k = 0; k < line.length - 1; k++) {
          seg.push(...radecToVec(line[k][0], line[k][1], 880).toArray(), ...radecToVec(line[k + 1][0], line[k + 1][1], 880).toArray());
        }
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
    this.allLines = new THREE.LineSegments(
      lgeo,
      new THREE.LineBasicMaterial({ color: 0x5f86d6, transparent: true, opacity: 0.32, depthWrite: false }),
    );
    this.skyGroup.add(this.allLines);
    this.skyGroup.add(this.highlight);
    this.panoScene.add(this.skyGroup);
    this.panoScene.add(this.fg);
    this.panoScene.add(new THREE.AmbientLight(0xffffff, 0.06));

    // Labels: bright named stars and constellation names (in the sky group's frame)
    for (const s of this.sky.named) {
      const [ra, dec, mag] = this.sky.stars[s.i];
      if (mag > 1.65) continue;
      const local = radecToVec(ra, dec, 860);
      this.addLabel("sphere", "sky", "lbl lbl-star", s.names, () => local.clone().applyQuaternion(this.skyGroup.quaternion));
    }
    for (const c of this.sky.constellations) {
      if (c.rank > 2) continue;
      const local = radecToVec(c.center[0], c.center[1], 860);
      this.addLabel("sphere", "sky", "lbl lbl-con", c.names, () => local.clone().applyQuaternion(this.skyGroup.quaternion), c.id);
    }
  }

  /** The Milky Way as a glowing band of faint particles along the galactic plane. */
  private buildMilkyWayBand() {
    const N = 60000;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const size = new Float32Array(N);
    const v = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      let l = Math.random() < 0.55 ? gaussian() * 55 : Math.random() * 360 - 180;
      l = ((l % 360) + 360) % 360;
      const ld = l > 180 ? l - 360 : l;
      const thick = 3 + 6 * Math.exp(-((ld / 25) ** 2));
      let b = gaussian() * thick;
      // The Great Rift: dark dust lane from Cygnus to Sagittarius
      if (ld > -10 && ld < 80 && b > -1.5 && b < 3 && Math.random() < 0.65) b += (Math.random() < 0.5 ? -1 : 1) * 4;
      const { ra, dec } = galacticToRaDec(l, b);
      radecToVec(ra, dec, 950, v).toArray(pos, i * 3);
      const warm = Math.exp(-((ld / 40) ** 2));
      const k = 0.05 + 0.05 * warm;
      col.set([k * (0.8 + 0.2 * warm), k * (0.82 + 0.05 * warm), k * (1 - 0.25 * warm)], i * 3);
      size[i] = 4 + Math.random() * 6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
    const band = new THREE.Points(geo, this.mwMat);
    band.name = "milkyway";
    return band;
  }

  private setHighlight(conId?: string) {
    this.highlight.clear();
    if (!conId) return;
    const con = this.sky.constellations.find((c) => c.id === conId);
    if (!con) return;
    const seg: number[] = [];
    for (const line of con.lines)
      for (let k = 0; k < line.length - 1; k++)
        seg.push(...radecToVec(line[k][0], line[k][1], 870).toArray(), ...radecToVec(line[k + 1][0], line[k + 1][1], 870).toArray());
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
    this.highlight.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.95 })));
  }

  // ───────────────────────────── Map (overview of all spheres) ─────────────────────────────

  private buildMap() {
    const s = this.mapScene;
    s.background = new THREE.Color(0x050816);
    s.fog = new THREE.Fog(0x050816, 70, 190);
    s.add(new THREE.AmbientLight(0xffffff, 0.45));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(30, 50, 20);
    s.add(sun);

    const grid = new THREE.GridHelper(220, 88, 0x1d2b55, 0x111a36);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.6;
    s.add(grid);

    // Background stars
    const bg = new Float32Array(4000 * 3);
    const bc = new Float32Array(4000 * 3);
    const bs = new Float32Array(4000);
    for (let i = 0; i < 4000; i++) {
      const v = new THREE.Vector3(gaussian(), Math.abs(gaussian()) + 0.15, gaussian()).normalize().multiplyScalar(600);
      v.toArray(bg, i * 3);
      const b = 0.3 + Math.random() * 0.7;
      bc.set([b, b, b], i * 3);
      bs[i] = 1 + Math.random() * 2.5;
    }
    const bgeo = new THREE.BufferGeometry();
    bgeo.setAttribute("position", new THREE.BufferAttribute(bg, 3));
    bgeo.setAttribute("aColor", new THREE.BufferAttribute(bc, 3));
    bgeo.setAttribute("size", new THREE.BufferAttribute(bs, 1));
    const bgMat = pointsMaterial(this.renderer.getPixelRatio());
    bgMat.fog = false;
    s.add(new THREE.Points(bgeo, bgMat));

    // Lay the stops out on a spiral that winds outward from Earth
    // Archimedean spiral with equal spacing between stops
    let theta = 0.6;
    const positions = LANDMARKS.map((_, i) => {
      const r = 8 + 1.8 * theta;
      const p = new THREE.Vector3(Math.cos(theta) * r, 2.2 + Math.sin(i * 1.3) * 0.5, Math.sin(theta) * r);
      theta += 7 / r;
      return p;
    });

    // Glowing path with pulses travelling outward
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 2.2, 0), ...positions]);
    this.pathMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main(){ float p = smoothstep(0.85, 1.0, fract(vUv.x * 14.0 - uTime * 0.35));
        gl_FragColor = vec4(mix(vec3(0.25,0.55,0.9), vec3(0.85,0.97,1.0), p), 0.55 + 0.45 * p); }`,
      transparent: true,
    });
    s.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 600, 0.07, 8), this.pathMat));

    // "You start here" Earth marker at the centre of the spiral
    const home = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.8, 48), new THREE.MeshBasicMaterial({ color: 0x5ec8ff, side: THREE.DoubleSide }));
    home.rotation.x = -Math.PI / 2;
    home.position.set(0, 0.02, 0);
    s.add(home);

    LANDMARKS.forEach((lm, i) => {
      const pos = positions[i];
      const group = new THREE.Group();
      group.position.copy(pos);
      const { radius, hit } = this.buildNode(lm, group);
      s.add(group);

      const color = new THREE.Color(SECTION_COLORS[lm.section]);
      const pin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, pos.y, 6),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 }),
      );
      pin.position.set(pos.x, pos.y / 2, pos.z);
      s.add(pin);
      const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.9, radius * 1.05, 48), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(pos.x, 0.02, pos.z);
      s.add(ring);

      this.nodes.push({ id: lm.id, pos, group, hit });
      const labelPos = pos.clone().add(new THREE.Vector3(0, radius + 0.7, 0));
      const el = this.addLabel("map", "map", "lbl lbl-map", { en: `${i + 1}. ${lm.title}` }, () => labelPos, lm.id);
      el.style.setProperty("--accent", SECTION_COLORS[lm.section]);
    });

    this.mapCam.position.set(0, 40, 44);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  private buildNode(lm: Landmark, group: THREE.Group) {
    let radius = 1;
    const glow = (color: string, scale: number) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.scale.setScalar(scale);
      group.add(sp);
    };
    switch (lm.kind) {
      case "orbit":
      case "planet": {
        const sizes: Record<string, number> = { earth: 1.1, moon: 0.7, mars: 0.8, jupiter: 1.5, saturn: 1.25 };
        radius = sizes[lm.planet!];
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), new THREE.MeshStandardMaterial({ map: planetTexture(lm.planet!, 512), roughness: 1 }));
        group.add(mesh);
        this.mapSpinners.push({ obj: mesh, speed: 0.15 });
        if (lm.planet === "saturn") group.add(this.makeRings(radius, 0.45));
        break;
      }
      case "sky": {
        radius = 1.2;
        group.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), new THREE.MeshBasicMaterial({ map: skyThumbTexture(this.sky) })));
        glow("#5ec8ff", 4);
        break;
      }
      case "constellation": {
        radius = 1;
        group.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), new THREE.MeshStandardMaterial({ color: 0x0b1530, emissive: 0x0a1840, roughness: 0.4 })));
        const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: constellationBadge(this.sky, lm.constellation!), depthTest: false, transparent: true }));
        badge.scale.setScalar(1.9);
        badge.renderOrder = 5;
        group.add(badge);
        break;
      }
      case "star": {
        radius = lm.id === "betelgeuse" ? 1.2 : 0.85;
        group.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), new THREE.MeshBasicMaterial({ color: lm.star!.color })));
        glow(lm.star!.color, radius * 5);
        break;
      }
      case "galaxy": {
        radius = 2.6;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: galaxyBadge(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        sp.scale.setScalar(7);
        group.add(sp);
        break;
      }
    }
    const hit = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.15, 16, 12), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.id = lm.id;
    group.add(hit);
    return { radius, hit };
  }

  private makeRings(planetRadius: number, tilt: number) {
    const inner = 1.24 * planetRadius, outer = 2.27 * planetRadius;
    const geo = new THREE.RingGeometry(inner, outer, 160, 1);
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getY(i));
      uv.setXY(i, (r - inner) / (outer - inner), 0.5);
    }
    const ring = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ map: ringTexture(), transparent: true, side: THREE.DoubleSide, roughness: 1, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2 + tilt;
    return ring;
  }

  // ───────────────────────────── Spheres (360° panoramas) ─────────────────────────────

  private buildPanorama(lm: Landmark) {
    this.fg.clear();
    this.spinners = [];
    this.starUniforms = [];
    this.occluders = [];
    this.labels.filter((l) => l.layer === "fg").forEach((l) => l.el.remove());
    this.labels = this.labels.filter((l) => l.layer !== "fg");

    // Point the sky so the landmark sits comfortably in front of you, north still up.
    let ra = lm.look?.[0] ?? 0, dec = lm.look?.[1] ?? 0;
    if (lm.kind === "constellation") [ra, dec] = this.sky.constellations.find((c) => c.id === lm.constellation)!.center;
    const target = radecToVec(ra, dec);
    const desiredDec = lm.kind === "orbit" ? dec : THREE.MathUtils.clamp(dec, -20, 20);
    const desired = radecToVec(ra, desiredDec);
    this.skyGroup.quaternion.setFromUnitVectors(target, desired);

    const yp = dirToYawPitch(desired);
    this.yaw = yp.yaw;
    this.pitch = lm.kind === "orbit" ? -14 * DEG : yp.pitch;
    this.fov = lm.fov ?? 70;
    this.vel = { yaw: 0, pitch: 0 };

    const galaxy = lm.kind === "galaxy";
    this.skyGroup.visible = !galaxy;
    this.setHighlight(lm.constellation);
    this.allLines.visible = this.showLines && (lm.kind === "sky" || lm.kind === "constellation" || lm.kind === "star");

    const right = new THREE.Vector3().crossVectors(desired, new THREE.Vector3(0, 1, 0)).normalize();
    const sunDir = desired.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 115 * DEG).add(new THREE.Vector3(0, 0.25, 0)).normalize();

    if (lm.kind === "orbit") this.buildOrbitView(desired, right);
    if (lm.kind === "planet") this.buildPlanetView(lm, desired, sunDir);
    if (lm.kind === "star") this.buildStarView(lm, desired, right);
    if (galaxy) this.buildGalaxyView(desired);
  }

  private addSun(dir: THREE.Vector3, withLight = true, intensity = 3) {
    const pos = dir.clone().multiplyScalar(800);
    for (const [scale, color] of [[300, "#ffcf8a"], [70, "#fff6e0"]] as const) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.scale.setScalar(scale);
      sp.position.copy(pos);
      this.fg.add(sp);
    }
    this.addFgLabel("Sun", pos);
    if (withLight) {
      const light = new THREE.DirectionalLight(0xffffff, intensity);
      light.position.copy(dir.clone().multiplyScalar(50));
      this.fg.add(light);
    }
  }

  private planetMesh(kind: Parameters<typeof planetTexture>[0], radius: number) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 128, 96), new THREE.MeshStandardMaterial({ map: planetTexture(kind, 1024), roughness: 1, metalness: 0 }));
    mesh.userData.pano = true;
    return mesh;
  }

  private buildOrbitView(desired: THREE.Vector3, right: THREE.Vector3) {
    const earth = new THREE.Group();
    earth.position.set(0, -1.11, 0); // 700 km above a unit-radius Earth
    earth.rotation.set(0.35, 0, 1.15); // tip the globe so we fly over the mid-latitudes, not the pole
    const body = this.planetMesh("earth", 1);
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.006, 128, 96), new THREE.MeshStandardMaterial({ map: cloudTexture(1024), transparent: true, depthWrite: false }));
    clouds.userData.pano = true;
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1.035, 128, 96),
      new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: ATMO_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    earth.add(body, clouds, atmo);
    this.fg.add(earth);
    this.occluders.push({ center: earth.position.clone(), radius: 1 });
    this.spinners.push({ obj: body, speed: 0.01 }, { obj: clouds, speed: 0.013 });
    const sunDir = desired.clone().multiplyScalar(0.5).add(right.clone().multiplyScalar(0.6)).add(new THREE.Vector3(0, 0.35, 0)).normalize();
    this.addSun(sunDir, true, 1.8);
    this.addFgLabel("Earth", desired.clone().multiplyScalar(0.45).add(new THREE.Vector3(0, -0.55, 0)));
  }

  private buildPlanetView(lm: Landmark, desired: THREE.Vector3, sunDir: THREE.Vector3) {
    const dist = { moon: 3.6, mars: 4, jupiter: 4.4, saturn: 6.5, earth: 4 }[lm.planet!];
    const tilt = new THREE.Group();
    tilt.position.copy(desired).multiplyScalar(dist);
    tilt.lookAt(0, 0, 0);
    tilt.rotateZ(0.25);
    tilt.rotateX(lm.planet === "saturn" ? 0.5 : 0.2);
    const body = this.planetMesh(lm.planet!, 1);
    tilt.add(body);
    if (lm.planet === "saturn") {
      const rings = this.makeRings(1, 0);
      rings.rotation.x = -Math.PI / 2;
      tilt.add(rings);
    }
    this.fg.add(tilt);
    this.occluders.push({ center: tilt.position.clone(), radius: lm.planet === "saturn" ? 1.6 : 1 });
    this.spinners.push({ obj: body, speed: lm.planet === "jupiter" || lm.planet === "saturn" ? 0.08 : 0.03 });
    this.addSun(sunDir);
    this.addFgLabel(lm.title, tilt.position.clone().add(new THREE.Vector3(0, 1.25, 0)));

    if (lm.planet === "moon") {
      // Earth hanging in the lunar sky (enlarged so you can find it)
      const earthDir = desired.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 40 * DEG).add(new THREE.Vector3(0, 0.3, 0)).normalize();
      const earth = this.planetMesh("earth", 0.12);
      earth.position.copy(earthDir.multiplyScalar(5));
      this.fg.add(earth);
      this.spinners.push({ obj: earth, speed: 0.2 });
      this.addFgLabel("Earth", earth.position.clone().add(new THREE.Vector3(0, 0.22, 0)));
    }
  }

  private buildStarView(lm: Landmark, desired: THREE.Vector3, right: THREE.Vector3) {
    const color = new THREE.Color(lm.star!.color);
    const dist = { betelgeuse: 3, sirius: 6, polaris: 4.5 }[lm.id] ?? 5;
    const uniforms = { uColor: { value: color }, uTime: { value: 0 } };
    this.starUniforms.push(uniforms);
    const star = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.ShaderMaterial({ uniforms, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG }));
    star.position.copy(desired).multiplyScalar(dist);
    star.userData.pano = true;
    this.fg.add(star);
    this.occluders.push({ center: star.position.clone(), radius: 1 });
    this.spinners.push({ obj: star, speed: 0.02 });
    const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 }));
    corona.scale.setScalar(5.2);
    corona.position.copy(star.position);
    this.fg.add(corona);
    this.addFgLabel(lm.title, star.position.clone().add(new THREE.Vector3(0, 1.35, 0)));

    if (lm.star!.companion) {
      const pos = desired.clone().multiplyScalar(dist).add(right.clone().multiplyScalar(2.4)).add(new THREE.Vector3(0, 0.6, 0));
      const dwarf = new THREE.Mesh(new THREE.SphereGeometry(0.05, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      dwarf.position.copy(pos);
      const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: "#dfe8ff", blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      g.scale.setScalar(0.5);
      g.position.copy(pos);
      this.fg.add(dwarf, g);
      this.addFgLabel(lm.star!.companion, pos.clone().add(new THREE.Vector3(0, 0.2, 0)));
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
      // Central bar and bulge
      const x = gaussian() * 6.5, y = gaussian() * 2.6, z = gaussian() * 1.6;
      const rot = 0.45;
      set(i, x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot), z, [0.16, 0.12, 0.07], 2.6 + rand() * 2);
    }
    const pitch = 1 / Math.tan(13 * DEG);
    for (; i < 76000; i++) {
      // Four logarithmic spiral arms
      const arm = i % 4;
      const r = 4.5 + Math.pow(rand(), 0.9) * 45;
      const theta = arm * (Math.PI / 2) + Math.log(r / 4.5) * pitch * 0.5 + gaussian() * (0.12 + 3 / r);
      const spread = gaussian() * (0.6 + r * 0.04);
      const x = Math.cos(theta) * r + Math.cos(theta + Math.PI / 2) * spread;
      const y = Math.sin(theta) * r + Math.sin(theta + Math.PI / 2) * spread;
      const hot = rand() < 0.03;
      const c: [number, number, number] = hot ? [0.35, 0.12, 0.2] : [0.07, 0.085, 0.12];
      set(i, x, y, gaussian() * 0.5, c, hot ? 3 : 1.6 + rand() * 2.2);
    }
    for (; i < N; i++) {
      // Diffuse disk
      const r = -Math.log(1 - rand() * 0.98) * 12;
      const t = rand() * Math.PI * 2;
      set(i, Math.cos(t) * r, Math.sin(t) * r, gaussian() * 0.8, [0.05, 0.05, 0.06], 1.5 + rand() * 1.5);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
    const mat = pointsMaterial(this.renderer.getPixelRatio() * 0.35, true);
    const galaxy = new THREE.Group();
    galaxy.add(new THREE.Points(geo, mat));
    galaxy.position.copy(desired).multiplyScalar(105).add(new THREE.Vector3(0, -22, 0));
    galaxy.lookAt(0, 0, 0);
    galaxy.rotateX(-0.95);
    galaxy.userData.pano = true;
    this.fg.add(galaxy);
    this.spinners.push({ obj: galaxy.children[0], speed: 0.004 });

    // Sun marker, about 26,000 ly from the centre
    const sunLocal = new THREE.Vector3(Math.cos(2.4) * 26, Math.sin(2.4) * 26, 0);
    const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: "#ffe28a", blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    marker.scale.setScalar(6);
    marker.position.copy(sunLocal);
    galaxy.children[0].add(marker);
    this.addFgLabel("Sun · you are here", () => marker.getWorldPosition(new THREE.Vector3()));
    this.addFgLabel("Galactic centre", () => galaxy.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 4, 0)));

    // Distant galaxies in the background
    const M = 2500;
    const bp = new Float32Array(M * 3), bc = new Float32Array(M * 3), bs = new Float32Array(M);
    for (let k = 0; k < M; k++) {
      new THREE.Vector3(gaussian(), gaussian(), gaussian()).normalize().multiplyScalar(1500).toArray(bp, k * 3);
      const b = 0.25 + rand() * 0.6;
      bc.set([b, b * 0.95, b * 1.05], k * 3);
      bs[k] = 1.2 + rand() * 2;
    }
    const bgeo = new THREE.BufferGeometry();
    bgeo.setAttribute("position", new THREE.BufferAttribute(bp, 3));
    bgeo.setAttribute("aColor", new THREE.BufferAttribute(bc, 3));
    bgeo.setAttribute("size", new THREE.BufferAttribute(bs, 1));
    this.fg.add(new THREE.Points(bgeo, pointsMaterial(this.renderer.getPixelRatio())));
  }

  // ───────────────────────────── Labels ─────────────────────────────

  private addLabel(mode: Mode, layer: Label["layer"], cls: string, names: Record<string, string>, pos: () => THREE.Vector3, id?: string) {
    const el = document.createElement("div");
    el.className = cls;
    el.textContent = names[this.lang] ?? names.en;
    el.style.display = "none";
    if (id && layer === "map") {
      el.dataset.id = id;
      el.addEventListener("click", () => this.select(id));
    }
    this.labelLayer.appendChild(el);
    this.labels.push({ el, mode, layer, pos, names, id });
    return el;
  }

  private addFgLabel(text: string, pos: THREE.Vector3 | (() => THREE.Vector3)) {
    const fn = typeof pos === "function" ? pos : () => pos;
    this.addLabel("sphere", "fg", "lbl lbl-fg", { en: text }, fn);
  }

  setLanguage(lang: string) {
    this.lang = lang;
    for (const l of this.labels) if (l.names && l.layer === "sky") l.el.textContent = l.names[lang] ?? l.names.en;
  }

  private isOccluded(p: THREE.Vector3) {
    const dir = p.clone().normalize();
    return this.occluders.some(({ center, radius }) => {
      const d = center.length();
      return dir.angleTo(center) < Math.asin(Math.min(1, (radius * 1.05) / d));
    });
  }

  private updateLabels() {
    const cam = this.mode === "map" ? this.mapCam : this.panoCam;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const v = new THREE.Vector3();
    this.visibleLabels = [];
    for (const l of this.labels) {
      let show = l.mode === this.mode && (this.showLabels || l.layer === "map");
      if (show && l.layer === "sky") show = this.skyGroup.visible && (l.el.classList.contains("lbl-star") || this.allLines.visible || l.id === this.current?.constellation);
      if (show) {
        v.copy(l.pos());
        if (l.layer === "sky" && this.isOccluded(v)) show = false;
      }
      if (show) {
        v.project(cam);
        show = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      }
      if (!show) {
        if (l.el.style.display !== "none") l.el.style.display = "none";
        continue;
      }
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      l.el.style.display = "";
      l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      l.el.classList.toggle("is-hover", !!l.id && l.id === this.hovered);
      this.visibleLabels.push({ x, y, text: l.el.textContent ?? "", cls: l.el.className });
    }
  }

  // ───────────────────────────── Navigation ─────────────────────────────

  private tween(ms: number, fn: (t: number) => void) {
    return new Promise<void>((done) => this.tweens.push({ start: performance.now(), ms, fn, done }));
  }

  private async fade(to: 0 | 1) {
    this.fadeEl.style.opacity = String(to);
    await new Promise((r) => setTimeout(r, 320));
  }

  /** Go to a landmark: fly in on the map, or cross-fade between spheres. */
  async select(id: string) {
    const lm = byId(id);
    if (!lm || this.busy) return;
    this.busy = true;
    if (this.mode === "map") {
      const node = this.nodes.find((n) => n.id === id)!;
      const fromPos = this.mapCam.position.clone(), fromTarget = this.controls.target.clone();
      const toPos = node.pos.clone().add(this.mapCam.position.clone().sub(node.pos).setLength(3.2));
      this.controls.enabled = false;
      await this.tween(1100, (t) => {
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        this.mapCam.position.lerpVectors(fromPos, toPos, e);
        this.controls.target.lerpVectors(fromTarget, node.pos, e);
        this.mapCam.lookAt(this.controls.target);
      });
    }
    await this.fade(1);
    this.current = lm;
    this.buildPanorama(lm);
    this.mode = "sphere";
    this.controls.enabled = false;
    this.events.onModeChange("sphere", id);
    await this.fade(0);
    this.busy = false;
  }

  async showMap() {
    if (this.busy || this.mode === "map") return;
    this.busy = true;
    await this.fade(1);
    this.mode = "map";
    const node = this.nodes.find((n) => n.id === this.current?.id);
    if (node) {
      this.controls.target.copy(node.pos);
      this.mapCam.position.copy(node.pos).add(new THREE.Vector3(0, 10, 14));
    }
    this.controls.enabled = true;
    this.controls.update();
    this.events.onModeChange("map", this.current?.id ?? null);
    await this.fade(0);
    this.busy = false;
  }

  step(delta: 1 | -1) {
    const i = LANDMARKS.findIndex((l) => l.id === this.current?.id);
    const next = LANDMARKS[(i + delta + LANDMARKS.length) % LANDMARKS.length];
    return this.select(next.id);
  }

  zoom(factor: number) {
    if (this.mode === "sphere") this.fov = THREE.MathUtils.clamp(this.fov * factor, 15, 100);
    else {
      const d = this.mapCam.position.clone().sub(this.controls.target);
      d.setLength(THREE.MathUtils.clamp(d.length() * factor, this.controls.minDistance, this.controls.maxDistance));
      this.mapCam.position.copy(this.controls.target).add(d);
    }
  }

  setToggles(labels: boolean, lines: boolean) {
    this.showLabels = labels;
    this.showLines = lines;
    if (this.current && this.mode === "sphere")
      this.allLines.visible = lines && ["sky", "constellation", "star"].includes(this.current.kind);
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
      const big = l.cls.includes("lbl-fg") || l.cls.includes("lbl-map");
      ctx.font = `${big ? 600 : 500} ${big ? 14 : 12}px system-ui, sans-serif`;
      ctx.fillStyle = l.cls.includes("lbl-con") ? "rgba(159,180,255,0.85)" : "rgba(235,240,255,0.95)";
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = 4;
      ctx.fillText(l.text, l.x, l.y);
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
    const raycaster = new THREE.Raycaster();
    const pick = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, this.mapCam);
      const hit = raycaster.intersectObjects(this.nodes.map((n) => n.hit))[0];
      return (hit?.object.userData.id as string | undefined) ?? null;
    };

    const down = (e: PointerEvent) => {
      this.downAt = { x: e.clientX, y: e.clientY };
      if (this.mode !== "sphere") return;
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const move = (e: PointerEvent) => {
      if (this.mode === "map") {
        if (e.buttons) return;
        const id = pick(e);
        if (id !== this.hovered) {
          this.hovered = id;
          c.style.cursor = id ? "pointer" : "";
          this.events.onHover(id);
        }
        return;
      }
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      if (this.pointers.size === 2) {
        p.x = e.clientX;
        p.y = e.clientY;
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDist) this.fov = THREE.MathUtils.clamp(this.fov * (this.pinchDist / d), 15, 100);
        this.pinchDist = d;
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
      const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y);
      if (this.mode === "map" && moved < 6 && e.button === 0) {
        const id = pick(e);
        if (id) this.select(id);
      }
    };
    const wheel = (e: WheelEvent) => {
      if (this.mode !== "sphere") return;
      e.preventDefault();
      this.fov = THREE.MathUtils.clamp(this.fov * (1 + e.deltaY * 0.0012), 15, 100);
    };
    const key = (e: KeyboardEvent) => {
      if (this.mode !== "sphere" || (e.target as HTMLElement)?.closest?.("input, textarea, select")) return;
      const s = 3 * DEG;
      if (e.key === "ArrowLeft") this.yaw += s;
      else if (e.key === "ArrowRight") this.yaw -= s;
      else if (e.key === "ArrowUp") this.pitch = Math.min(this.pitch + s, 89 * DEG);
      else if (e.key === "ArrowDown") this.pitch = Math.max(this.pitch - s, -89 * DEG);
      else return;
      e.preventDefault();
    };

    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keydown", key);
    this.cleanup.push(() => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
      c.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", key);
    });
  }

  private resize() {
    const p = this.canvas.parentElement!;
    const w = p.clientWidth, h = p.clientHeight;
    this.renderer.setSize(w, h, false);
    for (const cam of [this.mapCam, this.panoCam]) {
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
  }

  private render() {
    if (this.mode === "map") this.renderer.render(this.mapScene, this.mapCam);
    else this.renderer.render(this.panoScene, this.panoCam);
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;
    const now = performance.now();
    this.tweens = this.tweens.filter((tw) => {
      const k = Math.min(1, (now - tw.start) / tw.ms);
      tw.fn(k);
      if (k >= 1) tw.done();
      return k < 1;
    });

    for (const s of this.mode === "map" ? this.mapSpinners : this.spinners) s.obj.rotation.y += s.speed * dt;
    for (const u of this.starUniforms) u.uTime.value = t;
    this.pathMat.uniforms.uTime.value = t;

    if (this.mode === "sphere") {
      if (!this.pointers.size) {
        this.yaw += this.vel.yaw;
        this.pitch = THREE.MathUtils.clamp(this.pitch + this.vel.pitch, -89 * DEG, 89 * DEG);
        this.vel.yaw *= 0.9;
        this.vel.pitch *= 0.9;
      }
      this.panoCam.rotation.set(this.pitch, this.yaw, 0);
      if (Math.abs(this.panoCam.fov - this.fov) > 0.01) {
        this.panoCam.fov += (this.fov - this.panoCam.fov) * 0.2;
        this.panoCam.updateProjectionMatrix();
      }
      const pr = this.renderer.getPixelRatio();
      this.starsMat.uniforms.uScale.value = pr * THREE.MathUtils.clamp(Math.sqrt(70 / this.panoCam.fov), 0.85, 1.8);
      this.mwMat.uniforms.uScale.value = pr * Math.sqrt(70 / this.panoCam.fov);
    } else {
      this.controls.update();
      for (const n of this.nodes) {
        const s = n.id === this.hovered ? 1.15 : 1;
        n.group.scale.lerp(new THREE.Vector3(s, s, s), 0.2);
      }
    }
    this.render();
    this.updateLabels();
  };

  /** Direction the panorama camera faces (for sharing a view). */
  get lookDirection() {
    return yawPitchToDir(this.yaw, this.pitch);
  }
}
