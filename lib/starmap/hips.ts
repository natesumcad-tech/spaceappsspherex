// IRSA sky surveys (HiPS) and the reprojection that lays their tiles onto the Star Map's flat grid.
//
// HiPS tiles are cut on the HEALPix grid. For every pixel of one of our map tiles we work out its
// RA/Dec, find which HEALPix tile and pixel holds that spot, and copy it across. The orientation of
// pixels inside a tile was checked against catalogue star positions (Orion) before using it here.

import { DEG, apply, precessionMatrix, radecToUnit, transpose, unitToRadec, xToRa } from "./coords";

const IRSA = "https://irsa.ipac.caltech.edu/data/hips";

export type Layer = {
  id: string;
  name: string;
  url: string;
  ext: "png" | "jpg";
  maxOrder: number;
  released: string;
  observed: string;
  /** "cube" layers hold one grayscale image per wavelength. */
  cube?: boolean;
  /** IRSA's release stamp, added to tile addresses so a re-published map is fetched fresh. */
  v?: string;
  /** Which part of the sky an overlay covers, so we never ask for tiles that don't exist. */
  region?: { plane: { lMin: number; lMax: number; bMax: number } } | { circle: { ra: number; dec: number; r: number } };
};

export const SPHEREX: Layer = {
  id: "spherex",
  name: "SPHEREx DR1",
  url: `${IRSA}/SPHEREx/spherex_allsky_cube`,
  ext: "png",
  maxOrder: 5,
  cube: true,
  // The release we last saw; the page checks IRSA for a newer one as it opens (/api/hips)
  released: "1 Nov 2026",
  observed: "24 Apr 2025 – 14 May 2026",
  v: "2026-11-01T01:58Z",
};

/** Wavelength (µm) of each of SPHEREx's 102 frames, from the DR1 HiPS metadata. */
export const SPHEREX_WL = [
  0.753, 0.771, 0.79, 0.809, 0.828, 0.848, 0.868, 0.889, 0.91, 0.932, 0.955, 0.978, 1.001, 1.025, 1.05, 1.075, 1.102, 1.113, 1.139, 1.167,
  1.195, 1.224, 1.254, 1.284, 1.315, 1.346, 1.378, 1.412, 1.446, 1.481, 1.517, 1.554, 1.592, 1.631, 1.656, 1.695, 1.735, 1.775, 1.818, 1.861,
  1.905, 1.949, 1.995, 2.041, 2.089, 2.139, 2.189, 2.24, 2.292, 2.345, 2.399, 2.445, 2.506, 2.575, 2.646, 2.719, 2.794, 2.871, 2.951, 3.033,
  3.118, 3.204, 3.293, 3.383, 3.476, 3.57, 3.667, 3.768, 3.833, 3.867, 3.901, 3.935, 3.97, 4.005, 4.04, 4.076, 4.112, 4.148, 4.184, 4.22,
  4.257, 4.294, 4.331, 4.368, 4.405, 4.435, 4.467, 4.5, 4.533, 4.566, 4.6, 4.635, 4.669, 4.704, 4.739, 4.773, 4.808, 4.843, 4.879, 4.915,
  4.951, 4.988,
];
/** Frames 50 and 51 (the dichroic channels) are blank in DR1. */
export const BLANK_FRAMES = new Set([50, 51]);
/** Default color view: blue 1.0 µm, green 2.2 µm, red 3.3 µm (glowing dust / PAH). */
export const SPHEREX_RGB: [number, number, number] = [62, 46, 12];

export const BASE_LAYERS: Layer[] = [
  SPHEREX,
  {
    id: "2mass",
    name: "2MASS color (J, H, K)",
    url: `${IRSA}/CDS/2MASS/Color`,
    ext: "jpg",
    maxOrder: 9,
    released: "Oct 2024",
    observed: "1 Jun 1997 – 1 Feb 2001",
  },
];

export const OVERLAYS: Layer[] = [
  {
    id: "glimpse",
    name: "Spitzer GLIMPSE360",
    url: `${IRSA}/Spitzer/GLIMPSE360`,
    ext: "jpg",
    maxOrder: 9,
    released: "Mar 2025",
    observed: "4 Sep 2006 – 1 May 2013",
    region: { plane: { lMin: 60, lMax: 270, bMax: 6 } },
  },
  {
    id: "sage",
    name: "Spitzer SAGE-LMC",
    url: `${IRSA}/Spitzer/SAGE-LMC`,
    ext: "png",
    maxOrder: 9,
    released: "Jul 2025",
    observed: "15 Jul 2005 – 9 Nov 2005",
    region: { circle: { ra: 80.89, dec: -69.76, r: 6 } },
  },
  {
    id: "msx",
    name: "MSX infrared",
    url: `${IRSA}/CDS/MSX/MSX_color`,
    ext: "png",
    maxOrder: 7,
    released: "May 2025",
    observed: "18 May 1996 – 20 Feb 1997",
    region: { plane: { lMin: -180, lMax: 180, bMax: 6 } },
  },
];

export const ALL_LAYERS = [...BASE_LAYERS, ...OVERLAYS];
export const layerById = (id: string) => ALL_LAYERS.find((l) => l.id === id)!;

export function tileUrl(layer: Layer, order: number, tile: number, frame = 0) {
  const dir = Math.floor(tile / 10000) * 10000;
  return `${layer.url}/Norder${order}/Dir${dir}/Npix${tile}${frame ? `_${frame}` : ""}.${layer.ext}${layer.v ? `?v=${encodeURIComponent(layer.v)}` : ""}`;
}

/** What /api/hips reports: the SPHEREx map IRSA currently publishes, and every survey's release date. */
export type LiveCatalog = {
  spherex?: { url: string; name: string; v: string; released: string; observed: string; maxOrder: number; wavelengths?: number[]; blank?: number[] };
  /** Release date by HiPS address. */
  layers?: Record<string, string>;
  checkedAt: string;
};

/** Point the map at the data IRSA publishes right now (called on the page and in the tile worker). */
export function applyLive(c: LiveCatalog) {
  const s = c.spherex;
  if (s) {
    Object.assign(SPHEREX, { url: s.url, name: s.name || SPHEREX.name, v: s.v, maxOrder: s.maxOrder || SPHEREX.maxOrder });
    if (s.released) SPHEREX.released = s.released;
    if (s.observed) SPHEREX.observed = s.observed;
    if (s.wavelengths?.length === SPHEREX_WL.length) s.wavelengths.forEach((w, i) => (SPHEREX_WL[i] = w));
    if (s.blank?.length) {
      BLANK_FRAMES.clear();
      s.blank.forEach((b) => BLANK_FRAMES.add(b));
    }
  }
  for (const l of ALL_LAYERS) if (l !== SPHEREX && c.layers?.[l.url]) l.released = c.layers[l.url];
}

// ── HEALPix (nested scheme) ──

/** Face number and in-face pixel coordinates for a direction, at resolution nside. */
export function faceXY(raDeg: number, decDeg: number, nside: number): [number, number, number] {
  const z = Math.sin(decDeg * DEG), za = Math.abs(z);
  let tt = ((raDeg * DEG) % (2 * Math.PI)) * (2 / Math.PI);
  if (tt < 0) tt += 4;
  if (za <= 2 / 3) {
    const t1 = nside * (0.5 + tt), t2 = nside * z * 0.75;
    const jp = Math.floor(t1 - t2), jm = Math.floor(t1 + t2);
    const ifp = Math.floor(jp / nside), ifm = Math.floor(jm / nside);
    const face = ifp === ifm ? ifp | 4 : ifp < ifm ? ifp : ifm + 8;
    return [face, jm & (nside - 1), nside - (jp & (nside - 1)) - 1];
  }
  const ntt = Math.min(3, Math.floor(tt)), tp = tt - ntt;
  const tmp = nside * Math.sqrt(3 * (1 - za));
  const jp = Math.min(Math.floor(tp * tmp), nside - 1), jm = Math.min(Math.floor((1 - tp) * tmp), nside - 1);
  return z > 0 ? [ntt, nside - jm - 1, nside - jp - 1] : [ntt + 8, jp, jm];
}

function interleave(x: number, y: number) {
  let r = 0;
  for (let b = 0; b < 12; b++) r += (((x >> b) & 1) << (2 * b)) + (((y >> b) & 1) << (2 * b + 1));
  return r;
}

// Galactic coordinates, for deciding where regional overlays exist
const G = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.44482963, 0.7469822445],
  [-0.867666149, -0.1980763734, 0.4559837762],
];
function galactic(ra: number, dec: number) {
  const v = radecToUnit(ra, dec);
  const g = apply(G, v);
  return { l: Math.atan2(g[1], g[0]) / DEG, b: Math.asin(Math.max(-1, Math.min(1, g[2]))) / DEG };
}

export type TileRequest = {
  id: number;
  x0: number;
  y0: number;
  w: number;
  h: number;
  W: number;
  H: number;
  years: number;
  base: string;
  /** For the SPHEREx cube: one frame (single wavelength) or three frames [red, green, blue]. */
  frames: number[];
  /** IRSA release the request was made for (part of the cache key only). */
  rev?: string;
  overlays: string[];
  light: boolean;
  detail: number;
  /** Rows top-first (for 2D canvases). Default is bottom-first, as WebGL textures expect. */
  topDown?: boolean;
  /**
   * Instead of a flat map region: a camera-style view of the sky centred on ra/dec, `fov` degrees
   * across, as seen from inside the celestial sphere (east on the left). Used by the 360° views.
   * `w` should equal `fov` so the resolution maths matches.
   */
  gnomonic?: { ra: number; dec: number; fov: number };
};

/**
 * A decoded tile: 1 channel for grayscale (the SPHEREx cube), 4 for color surveys.
 * `null` = the survey has no tile there; `undefined` = the download failed and should be retried.
 */
export type Decoded = { data: Uint8Array | Uint8ClampedArray; ch: 1 | 4 } | null | undefined;

/**
 * Reprojects the requested part of the map from HiPS tiles. `load` fetches and decodes one tile
 * (and should cache). Returns RGBA pixels, top row first.
 */
export async function renderTile(req: TileRequest, load: (url: string) => Promise<Decoded>): Promise<{ px: Uint8ClampedArray; partial: boolean }> {
  let partial = false;
  const { W, H } = req;
  const n = W * H;
  const out = new Uint8ClampedArray(n * 4);
  const ppd = W / req.w;
  const m = req.years ? transpose(precessionMatrix(req.years)) : null; // of-date → J2000 (the surveys are J2000)

  // Pass 1: where on the sky is each pixel?
  const ra = new Float64Array(n), dec = new Float64Array(n);
  if (req.gnomonic) {
    const g = req.gnomonic, a = g.ra * DEG, d0 = g.dec * DEG, t = Math.tan((g.fov / 2) * DEG);
    const C = [Math.cos(d0) * Math.cos(a), Math.cos(d0) * Math.sin(a), Math.sin(d0)];
    const E = [-Math.sin(a), Math.cos(a), 0]; // east
    const N = [-Math.sin(d0) * Math.cos(a), -Math.sin(d0) * Math.sin(a), Math.cos(d0)]; // north
    for (let py = 0; py < H; py++) {
      const v = (req.topDown ? 0.5 - (py + 0.5) / H : (py + 0.5) / H - 0.5) * 2 * t;
      for (let px = 0; px < W; px++) {
        const u = ((px + 0.5) / W - 0.5) * 2 * t; // screen right = west, seen from inside
        const x = C[0] - u * E[0] + v * N[0], y = C[1] - u * E[1] + v * N[1], z = C[2] - u * E[2] + v * N[2];
        const l = Math.hypot(x, y, z);
        ra[py * W + px] = ((Math.atan2(y, x) / DEG) % 360 + 360) % 360;
        dec[py * W + px] = Math.asin(z / l) / DEG;
      }
    }
  } else for (let py = 0; py < H; py++) {
    const y = req.topDown ? req.y0 + req.h - ((py + 0.5) / H) * req.h : req.y0 + ((py + 0.5) / H) * req.h;
    for (let px = 0; px < W; px++) {
      const x = req.x0 + ((px + 0.5) / W) * req.w;
      let r = xToRa(x), d = y;
      if (m) [r, d] = unitToRadec(apply(m, radecToUnit(r, d)));
      ra[py * W + px] = r;
      dec[py * W + px] = d;
    }
  }

  const sample = async (layer: Layer, frames: number[], into: (i: number, rgb: [number, number, number]) => void) => {
    // Pick the HEALPix order whose pixels best match this tile's pixels (fewer, smaller tiles when zoomed out).
    const want = Math.ceil(Math.log2(((58.63 * ppd) / 512) * req.detail));
    const order = Math.max(0, Math.min(layer.maxOrder, want));
    const nt = 2 ** order, nside = nt * 512;
    const tid = new Int32Array(n), col = new Uint16Array(n), row = new Uint16Array(n);
    const need = new Set<number>();
    for (let i = 0; i < n; i++) {
      const [face, ix, iy] = faceXY(ra[i], dec[i], nside);
      const t = face * nt * nt + interleave(ix >> 9, iy >> 9);
      tid[i] = t;
      col[i] = iy & 511;
      row[i] = ix & 511;
      need.add(t);
    }
    const tiles = new Map<number, Decoded[]>();
    await Promise.all(
      [...need].map(async (t) => {
        const imgs = await Promise.all(frames.map((f) => load(tileUrl(layer, order, t, f))));
        if (imgs.some((d) => d === undefined)) partial = true; // a download failed: draw what we have, retry later
        tiles.set(t, imgs);
      }),
    );
    const rgb: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const imgs = tiles.get(tid[i])!;
      const p = row[i] * 512 + col[i];
      if (imgs.length === 3) {
        // three grayscale frames → R, G, B
        for (let c = 0; c < 3; c++) rgb[c] = imgs[c] ? imgs[c]!.data[p * imgs[c]!.ch] : -1;
        if (rgb[0] < 0 && rgb[1] < 0 && rgb[2] < 0) continue;
        rgb[0] = Math.max(0, rgb[0]);
        rgb[1] = Math.max(0, rgb[1]);
        rgb[2] = Math.max(0, rgb[2]);
        // DR1 leaves saturated pixels blank (0). If one band is blank where another is near-saturated, show it as saturated.
        const hi = Math.max(rgb[0], rgb[1], rgb[2]);
        if (hi >= 150) for (let c = 0; c < 3; c++) if (rgb[c] === 0) rgb[c] = 255;
        rgb[0] *= 1.08;
        rgb[2] *= 0.95;
      } else {
        const img = imgs[0];
        if (!img) continue;
        const k = p * img.ch;
        rgb[0] = img.data[k];
        rgb[1] = img.data[img.ch === 4 ? k + 1 : k];
        rgb[2] = img.data[img.ch === 4 ? k + 2 : k];
      }
      into(i, rgb);
    }
  };

  const base = BASE_LAYERS.find((l) => l.id === req.base) ?? SPHEREX;
  const tint = base.cube && req.frames.length === 1 ? wavelengthTint(SPHEREX_WL[req.frames[0]]) : null;
  const gain = req.light ? 1.2 : 1;
  await sample(base, base.cube ? req.frames : [0], (i, c) => {
    const k = i * 4;
    if (tint) {
      out[k] = c[0] * tint[0] * gain;
      out[k + 1] = c[0] * tint[1] * gain;
      out[k + 2] = c[0] * tint[2] * gain;
    } else {
      out[k] = c[0] * gain;
      out[k + 1] = c[1] * gain;
      out[k + 2] = c[2] * gain;
    }
  });

  if (base.cube) fillSaturated(out, W, H);

  for (const id of req.overlays) {
    const layer = OVERLAYS.find((l) => l.id === id);
    if (!layer || !overlayCovers(layer, req)) continue;
    await sample(layer, [0], (i, c) => {
      const a = Math.min(1, Math.max(c[0], c[1], c[2]) / 70) * 0.9; // empty (black) areas stay transparent
      if (a <= 0.02) return;
      const k = i * 4;
      out[k] = out[k] * (1 - a) + c[0] * a;
      out[k + 1] = out[k + 1] * (1 - a) + c[1] * a;
      out[k + 2] = out[k + 2] * (1 - a) + c[2] * a;
    });
  }
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  return { px: out, partial };
}

/** Only ask an overlay for tiles near where it actually has data. */
function overlayCovers(layer: Layer, req: TileRequest) {
  if (!layer.region) return true;
  const pts: [number, number][] = [];
  for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4; b++) pts.push([xToRa(req.x0 + (a / 4) * req.w), req.y0 + (b / 4) * req.h]);
  if ("plane" in layer.region) {
    const { lMin, lMax, bMax } = layer.region.plane;
    return pts.some(([r, d]) => {
      const { l, b } = galactic(r, d);
      const lw = l < lMin ? l + 360 : l;
      return Math.abs(b) < bMax + req.h && lw >= lMin - req.w && lw <= lMax + req.w;
    });
  }
  const { ra, dec, r } = layer.region.circle;
  const c = radecToUnit(ra, dec);
  return pts.some(([pr, pd]) => {
    const v = radecToUnit(pr, pd);
    return Math.acos(Math.min(1, v[0] * c[0] + v[1] * c[1] + v[2] * c[2])) / DEG < r + Math.max(req.w, req.h);
  });
}

/** Pastel-ish color for a single wavelength: blue at 0.75 µm through to rose at 5 µm. */
export function wavelengthTint(um: number): [number, number, number] {
  const t = Math.min(1, Math.max(0, (um - 0.75) / 4.25));
  const stops: [number, number, number][] = [
    [0.62, 0.72, 1.25],
    [0.7, 1.15, 1.05],
    [1.2, 1.05, 0.7],
    [1.3, 0.75, 0.85],
  ];
  const s = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(s)), f = s - i;
  return [0, 1, 2].map((c) => stops[i][c] + (stops[i + 1][c] - stops[i][c]) * f) as [number, number, number];
}

/** Turns decoded RGBA pixels into a compact tile (one channel when the image is grayscale). */
export function compact(rgba: Uint8ClampedArray): Decoded {
  let gray = true;
  for (let i = 0; i < rgba.length; i += 4 * 97) if (rgba[i] !== rgba[i + 1] || rgba[i] !== rgba[i + 2]) { gray = false; break; }
  if (!gray) return { data: rgba, ch: 4 };
  const g = new Uint8Array(rgba.length / 4);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = rgba[i];
  return { data: g, ch: 1 };
}

/** Fetch + decode with a small LRU cache. Works in a worker (OffscreenCanvas) or on the page. */
export function makeLoader(maxBytes = 120e6, maxConcurrent = 8) {
  const cache = new Map<string, Promise<Decoded>>();
  let active = 0;
  const waiting: (() => void)[] = [];
  const slot = () => (active < maxConcurrent ? (active++, Promise.resolve()) : new Promise<void>((r) => waiting.push(() => (active++, r()))));
  const release = () => {
    active--;
    waiting.shift()?.();
  };
  const sizes = new Map<string, number>();
  let bytes = 0;
  const canvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(512, 512) : Object.assign(document.createElement("canvas"), { width: 512, height: 512 });
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  return (url: string): Promise<Decoded> => {
    const hit = cache.get(url);
    if (hit) {
      cache.delete(url); // refresh LRU position
      cache.set(url, hit);
      return hit;
    }
    const p = (async (): Promise<Decoded> => {
      await slot();
      try {
        const res = await fetch(url, { mode: "cors" });
        if (res.status === 404) return null; // no data there (regional surveys)
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const bmp = await createImageBitmap(await res.blob());
        ctx.clearRect(0, 0, 512, 512);
        ctx.drawImage(bmp, 0, 0, 512, 512);
        bmp.close();
        const d = compact(ctx.getImageData(0, 0, 512, 512).data);
        const size = d ? d.data.length : 0;
        sizes.set(url, size);
        bytes += size;
        for (const [k] of cache) {
          if (bytes <= maxBytes) break;
          if (k === url) continue;
          bytes -= sizes.get(k) ?? 0;
          sizes.delete(k);
          cache.delete(k);
        }
        return d;
      } catch {
        cache.delete(url); // network hiccup: forget it so a later request retries
        return undefined;
      } finally {
        release();
      }
    })();
    cache.set(url, p);
    return p;
  };
}

/**
 * The SPHEREx DR1 map leaves the cores of very bright objects blank. Fill blank pixels that are
 * surrounded by near-saturated ones from their neighbors, so bright cores show as white, not black.
 */
function fillSaturated(px: Uint8ClampedArray, W: number, H: number) {
  for (let pass = 0; pass < 12; pass++) {
    const src = px.slice();
    let changed = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const k = (y * W + x) * 4;
        if (src[k] || src[k + 1] || src[k + 2]) continue;
        let n = 0, r = 0, g = 0, b = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if ((!dx && !dy) || x + dx < 0 || x + dx >= W || y + dy < 0 || y + dy >= H) continue;
            const q = k + (dy * W + dx) * 4;
            if (src[q] + src[q + 1] + src[q + 2] >= 600) {
              n++;
              r += src[q];
              g += src[q + 1];
              b += src[q + 2];
            }
          }
        const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
        if (n >= (edge ? 2 : 3)) {
          px[k] = r / n;
          px[k + 1] = g / n;
          px[k + 2] = b / n;
          changed++;
        }
      }
    if (!changed) break;
  }
}
