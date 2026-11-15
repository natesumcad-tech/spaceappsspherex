import * as THREE from "three";
import type { PlanetKind } from "./landmarks";

// ── Seamless 3D value noise (sampled on the sphere so textures have no seams) ──
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function makeNoise(seed: number) {
  const rand = rng(seed);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const vals = new Float32Array(256).map(() => rand());
  const fade = (t: number) => t * t * (3 - 2 * t);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const noise = (x: number, y: number, z: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const X = xi & 255, Y = yi & 255, Z = zi & 255;
    const h = (i: number, j: number, k: number) => vals[p[p[p[(X + i) & 255] + ((Y + j) & 255)] + ((Z + k) & 255)]];
    const u = fade(xf), v = fade(yf), w = fade(zf);
    return lerp(
      lerp(lerp(h(0, 0, 0), h(1, 0, 0), u), lerp(h(0, 1, 0), h(1, 1, 0), u), v),
      lerp(lerp(h(0, 0, 1), h(1, 0, 1), u), lerp(h(0, 1, 1), h(1, 1, 1), u), v),
      w,
    );
  };
  return (x: number, y: number, z: number, octaves = 5) => {
    let sum = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise(x * f, y * f, z * f);
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  };
}

const fbmA = makeNoise(7);
const fbmB = makeNoise(42);

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function paintEquirect(w: number, painter: (x: number, y: number, z: number, lat: number, lon: number) => RGB | [number, number, number, number]) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = w / 2;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(c.width, c.height);
  for (let j = 0; j < c.height; j++) {
    const lat = (0.5 - (j + 0.5) / c.height) * Math.PI;
    for (let i = 0; i < c.width; i++) {
      const lon = ((i + 0.5) / c.width) * Math.PI * 2;
      const x = Math.cos(lat) * Math.cos(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.sin(lon);
      const col = painter(x, y, z, lat, lon);
      const k = (j * c.width + i) * 4;
      img.data[k] = col[0];
      img.data[k + 1] = col[1];
      img.data[k + 2] = col[2];
      img.data[k + 3] = col.length === 4 ? col[3] : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const PAINTERS: Record<PlanetKind, (x: number, y: number, z: number, lat: number, lon: number) => RGB> = {
  earth: (x, y, z, lat) => {
    const n = fbmA(x * 2.2 + 3, y * 2.2, z * 2.2, 6);
    const alat = Math.abs(lat) / (Math.PI / 2);
    if (alat > 0.86 || (n > 0.53 && alat > 0.7)) return [235, 240, 245];
    if (n < 0.53) return mix([8, 30, 80], [25, 85, 150], sstep(0.3, 0.53, n));
    const d = fbmB(x * 5, y * 5, z * 5, 4);
    const dry = sstep(0.2, 0.45, 1 - Math.abs(lat) / 0.9) * sstep(0.45, 0.65, d); // deserts near the tropics
    return mix(mix([40, 95, 45], [70, 110, 50], d), [190, 160, 110], dry);
  },
  moon: (x, y, z) => {
    const n = fbmA(x * 4, y * 4, z * 4, 6);
    const maria = sstep(0.42, 0.36, fbmB(x * 1.5, y * 1.5, z * 1.5, 3));
    const g = 120 + n * 90 - maria * 55;
    return [g, g, g * 0.97];
  },
  mars: (x, y, z, lat) => {
    const n = fbmA(x * 3, y * 3, z * 3, 6);
    const dark = sstep(0.5, 0.62, fbmB(x * 1.8, y * 1.8, z * 1.8, 4));
    let c = mix([190, 100, 55], [215, 140, 85], n);
    c = mix(c, [110, 55, 35], dark * 0.7);
    if (Math.abs(lat) > 1.36) c = mix(c, [240, 235, 230], sstep(1.36, 1.42, Math.abs(lat)));
    return c;
  },
  jupiter: (x, y, z, lat, lon) => {
    const turb = fbmA(x * 4, y * 4, z * 4, 5) - 0.5;
    const t = lat * 9 + turb * 1.6;
    const band = 0.5 + 0.5 * Math.sin(t * 1.7);
    let c = mix([215, 185, 150], [245, 235, 215], band);
    c = mix(c, [160, 110, 75], sstep(0.55, 0.85, 0.5 + 0.5 * Math.sin(t * 0.6 + 1)) * 0.6);
    // Great Red Spot
    const dl = (lat - -0.38) / 0.09, dn = (((lon - 2.2 + Math.PI) % (2 * Math.PI)) - Math.PI) / 0.2;
    const spot = Math.exp(-(dl * dl + dn * dn));
    return mix(c, [195, 95, 65], spot * 0.9);
  },
  mercury: (x, y, z) => {
    const n = fbmA(x * 5, y * 5, z * 5, 6);
    const crater = sstep(0.62, 0.7, fbmB(x * 9, y * 9, z * 9, 3));
    const g = 105 + n * 85 - crater * 35;
    return [g * 1.02, g * 0.95, g * 0.86];
  },
  venus: (x, y, z, lat) => {
    const swirl = fbmA(x * 2 + lat * 3, y * 6, z * 2, 5);
    return mix([226, 190, 120], [250, 232, 190], swirl);
  },
  uranus: (x, y, z, lat) => {
    const band = 0.5 + 0.5 * Math.sin(lat * 14 + fbmA(x * 2, y * 2, z * 2, 3) * 0.6);
    return mix([150, 215, 222], [178, 232, 236], band * 0.6);
  },
  neptune: (x, y, z, lat, lon) => {
    const band = 0.5 + 0.5 * Math.sin(lat * 10 + (fbmA(x * 3, y * 3, z * 3, 4) - 0.5) * 1.5);
    let c = mix([40, 80, 190], [70, 115, 220], band);
    const dl = (lat + 0.35) / 0.08, dn = ((((lon - 1.4) + Math.PI) % (2 * Math.PI)) - Math.PI) / 0.16;
    c = mix(c, [25, 45, 120], Math.exp(-(dl * dl + dn * dn)) * 0.8); // a dark storm spot
    return mix(c, [230, 240, 255], sstep(0.72, 0.8, fbmB(x * 6, y * 14, z * 6, 3)) * 0.5); // bright cloud streaks
  },
  saturn: (x, y, z, lat) => {
    const turb = fbmA(x * 3, y * 3, z * 3, 4) - 0.5;
    const t = lat * 10 + turb * 0.6;
    const band = 0.5 + 0.5 * Math.sin(t * 1.3);
    return mix([205, 180, 130], [240, 225, 185], band);
  },
};

const cache = new Map<string, THREE.Texture>();

function toTexture(canvas: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function planetTexture(kind: PlanetKind, width = 2048) {
  const key = `${kind}:${width}`;
  if (!cache.has(key)) cache.set(key, toTexture(paintEquirect(width, PAINTERS[kind])));
  return cache.get(key)!;
}

export function cloudTexture(width = 2048) {
  const key = `clouds:${width}`;
  if (!cache.has(key)) {
    const c = paintEquirect(width, (x, y, z) => {
      const n = fbmB(x * 3 + 9, y * 6, z * 3, 6);
      const a = sstep(0.56, 0.72, n) * 210;
      return [255, 255, 255, a];
    });
    cache.set(key, toTexture(c));
  }
  return cache.get(key)!;
}

/** Radial texture for Saturn's rings (u = 0 inner edge → 1 outer edge). */
export function ringTexture() {
  if (!cache.has("rings")) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 4;
    const ctx = c.getContext("2d")!;
    for (let i = 0; i < 512; i++) {
      const r = 1.24 + (i / 511) * (2.27 - 1.24); // in Saturn radii
      let a = 0.15;
      if (r > 1.53) a = 0.55 + 0.25 * fbmA(r * 40, 0, 0, 3); // B ring
      if (r > 1.95 && r < 2.03) a = 0.05; // Cassini division
      if (r >= 2.03) a = 0.45 + 0.2 * fbmA(r * 50, 1, 0, 3); // A ring
      if (r > 2.26) a *= 0.5;
      const shade = 190 + 50 * fbmB(r * 30, 0, 0, 2);
      ctx.fillStyle = `rgba(${shade},${shade * 0.92},${shade * 0.8},${a})`;
      ctx.fillRect(i, 0, 1, 4);
    }
    cache.set("rings", toTexture(c));
  }
  return cache.get("rings")!;
}

export function glowTexture() {
  if (!cache.has("glow")) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.15, "rgba(255,255,255,0.6)");
    g.addColorStop(0.4, "rgba(255,255,255,0.15)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    cache.set("glow", toTexture(c));
  }
  return cache.get("glow")!;
}
