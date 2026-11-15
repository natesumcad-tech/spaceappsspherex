/**
 * Real SPHEREx blink: find two SPHEREx exposures of the same patch of sky taken about six months
 * apart (one per sky survey pass), cut out the patch from each at NASA/IPAC IRSA, line both up on the
 * same north-up grid, and mark where the planets were on each date. Runs on the server (IRSA doesn't
 * allow browsers on other sites to fetch these files directly).
 */
import { findImage, makeWcs, skyToTan, tanToSky, type FitsImage } from "./fits";
import { planetPositions } from "../starmap/coords";

const SIA = "https://irsa.ipac.caltech.edu/SIA";
// Shorter wavelengths are sharper, and planets reflect sunlight there (beyond ~3 µm methane makes
// Uranus and Neptune go dark), so prefer them unless a longer one covers the field much better.
const BAND_PREFERENCE = ["D1", "D2", "D3", "D4", "D5", "D6"];

export type Exposure = { obsId: string; url: string; mjd: number; band: string; umMin: number; umMax: number; center: [number, number]; corners: [number, number][] };

export type BlinkBody = { name: string; x: number; y: number; inFrame: boolean };
export type BlinkPass = {
  date: string;
  mjd: number;
  obsId: string;
  band: string;
  umMin: number;
  umMax: number;
  /** n×n 8-bit brightness, base64. */
  img: string;
  /** Planets at this pass's date, in output pixels (may lie outside the frame). */
  bodies: BlinkBody[];
  /** Fraction of the frame this exposure actually covered. */
  coverage: number;
};
export type Blink = { ra: number; dec: number; size: number; n: number; passes: BlinkPass[]; diff: string; source: string };

const D = Math.PI / 180;
const unit = (ra: number, dec: number) => [Math.cos(dec * D) * Math.cos(ra * D), Math.cos(dec * D) * Math.sin(ra * D), Math.sin(dec * D)];
const sepDeg = (a: [number, number], b: [number, number]) => {
  const u = unit(...a), v = unit(...b);
  return Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))) / D;
};
const mjdToDate = (mjd: number) => new Date(Date.UTC(1858, 10, 17) + mjd * 864e5);
const mjdToYear = (mjd: number) => 2000 + (mjd - 51544.5) / 365.25;

/** All SPHEREx DR1 exposures covering a point. */
export async function findExposures(ra: number, dec: number, signal?: AbortSignal): Promise<Exposure[]> {
  const q = new URLSearchParams({ COLLECTION: "spherex_dr1", POS: `CIRCLE ${ra} ${dec} 0.002`, RESPONSEFORMAT: "VOTABLE", MAXREC: "3000" });
  let text = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`${SIA}?${q}`, { signal });
    text = await r.text();
    if (r.ok && text.includes("<VOTABLE")) break;
    if (attempt === 2) throw new Error(`IRSA search failed (${r.status})`);
    await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
  }
  const fields = [...text.matchAll(/<FIELD[^>]*name="([^"]+)"/g)].map((m) => m[1]);
  const ix = (n: string) => fields.indexOf(n);
  const out: Exposure[] = [];
  for (const tr of text.matchAll(/<TR>([\s\S]*?)<\/TR>/g)) {
    const cells = [...tr[1].matchAll(/<TD>([\s\S]*?)<\/TD>|<TD\s*\/>/g)].map((m) => (m[1] ?? "").trim());
    const region = cells[ix("s_region")]?.match(/-?\d+(\.\d+)?(e-?\d+)?/gi)?.map(Number) ?? [];
    // centre of the exposure's footprint (average of its corners on the sphere)
    let x = 0, y = 0, z = 0;
    for (let k = 0; k + 1 < region.length; k += 2) {
      const u = unit(region[k], region[k + 1]);
      x += u[0];
      y += u[1];
      z += u[2];
    }
    const cra = ((Math.atan2(y, x) / D) + 360) % 360, cdec = Math.atan2(z, Math.hypot(x, y)) / D;
    const corners: [number, number][] = [];
    for (let k = 0; k + 1 < region.length; k += 2) corners.push([region[k], region[k + 1]]);
    out.push({
      obsId: cells[ix("obs_id")],
      url: cells[ix("access_url")],
      mjd: Number(cells[ix("t_min")]),
      band: (cells[ix("energy_bandpassname")] ?? "").replace("SPHEREx-", ""),
      umMin: Number(cells[ix("em_min")]) * 1e6,
      umMax: Number(cells[ix("em_max")]) * 1e6,
      center: [cra, cdec],
      corners,
    });
  }
  return out.filter((e) => e.url && Number.isFinite(e.mjd));
}

/** How much of a size×size field around (ra, dec) an exposure's footprint covers (0…1, sampled on a grid). */
function fieldCoverage(e: Exposure, ra: number, dec: number, size: number) {
  const poly = e.corners.map(([r, d]) => skyToTan(r, d, ra, dec)).filter((p): p is [number, number] => !!p);
  if (poly.length < 3) return 0;
  const inside = (x: number, y: number) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  let n = 0, hit = 0;
  for (let a = -0.5; a <= 0.5001; a += 0.125)
    for (let b = -0.5; b <= 0.5001; b += 0.125) {
      n++;
      if (inside(a * size, b * size)) hit++;
    }
  return hit / n;
}

/** Group exposures into survey passes (a gap of more than ~6 weeks starts a new one). */
export function passes(exps: Exposure[]) {
  const sorted = [...exps].sort((a, b) => a.mjd - b.mjd);
  const groups: Exposure[][] = [];
  for (const e of sorted) {
    const g = groups[groups.length - 1];
    if (g && e.mjd - g[g.length - 1].mjd < 40) g.push(e);
    else groups.push([e]);
  }
  return groups;
}

/** Download a cutout, reading only as far as the IMAGE extension (the file carries several more). */
async function fetchCutout(url: string, ra: number, dec: number, size: number, signal?: AbortSignal): Promise<FitsImage> {
  let r: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    r = await fetch(`${url}?center=${ra.toFixed(5)},${dec.toFixed(5)}&size=${size.toFixed(4)}`, { signal });
    if (r.ok && r.body) break;
    if (attempt < 2) await new Promise((res) => setTimeout(res, 2000 * (attempt + 1))); // IRSA sometimes needs a moment
  }
  if (!r || !r.ok || !r.body) throw new Error(`IRSA cutout failed (${r?.status})`);
  const reader = r.body.getReader();
  let buf = new Uint8Array(1 << 20), len = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (value) {
      if (len + value.length > buf.length) {
        const bigger = new Uint8Array(Math.max(buf.length * 2, len + value.length));
        bigger.set(buf.subarray(0, len));
        buf = bigger;
      }
      buf.set(value, len);
      len += value.length;
      const img = findImage(buf.subarray(0, len));
      if (img && img !== "need-more") {
        reader.cancel().catch(() => {});
        return img;
      }
      if (img === null) break;
    }
    if (done) break;
  }
  throw new Error("No image in the IRSA cutout");
}

/** Resample a cutout onto an n×n north-up, east-left grid centred on (ra, dec). NaN where not covered. */
function resample(img: FitsImage, ra: number, dec: number, size: number, n: number) {
  const wcs = makeWcs(img.header);
  const s = size / n, c = (n - 1) / 2;
  const out = new Float32Array(n * n);
  const { width: W, height: H, data } = img;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const [r, d] = tanToSky((c - i) * s, (c - j) * s, ra, dec);
      const p = wcs.toPixel(r, d);
      let v = NaN;
      if (p) {
        const x = p[0], y = p[1], x0 = Math.floor(x), y0 = Math.floor(y);
        if (x0 >= 0 && y0 >= 0 && x0 + 1 < W && y0 + 1 < H) {
          const fx = x - x0, fy = y - y0, k = y0 * W + x0;
          const a = data[k], b = data[k + 1], cc = data[k + W], dd = data[k + W + 1];
          if (Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(cc) && Number.isFinite(dd))
            v = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + cc * (1 - fx) * fy + dd * fx * fy;
          else v = [a, b, cc, dd].find(Number.isFinite) ?? NaN;
        }
      }
      // FITS rows run upward; our row j=0 is the top (north), so the sky mapping above already flips it
      out[j * n + i] = v;
    }
  return out;
}

/** Background-subtract and asinh-stretch to 0…1 (NaN stays NaN). */
function stretch(v: Float32Array) {
  const sample: number[] = [];
  const step = Math.max(1, Math.floor(v.length / 40000));
  for (let k = 0; k < v.length; k += step) if (Number.isFinite(v[k])) sample.push(v[k]);
  if (sample.length < 50) return { out: new Float32Array(v.length).fill(NaN), coverage: 0 };
  sample.sort((a, b) => a - b);
  const q = (f: number) => sample[Math.min(sample.length - 1, Math.floor(f * sample.length))];
  const bg = q(0.5);
  const sigma = Math.max(1e-6, 1.4826 * (q(0.75) - q(0.25)) / 1.349);
  const top = Math.max(q(0.997) - bg, 25 * sigma);
  const soft = 1.5 * sigma, norm = Math.asinh(top / soft);
  const out = new Float32Array(v.length);
  let covered = 0;
  for (let k = 0; k < v.length; k++) {
    if (!Number.isFinite(v[k])) {
      out[k] = NaN;
      continue;
    }
    covered++;
    out[k] = Math.max(0, Math.min(1, Math.asinh((v[k] - bg) / soft) / norm));
  }
  return { out, coverage: covered / v.length };
}

const toB64 = (u8: Uint8Array) => Buffer.from(u8).toString("base64");

/** Where the planets were on a date, in output pixels. */
function bodiesAt(mjd: number, ra: number, dec: number, size: number, n: number): BlinkBody[] {
  const s = size / n, c = (n - 1) / 2;
  return planetPositions(mjdToYear(mjd))
    .filter((p) => p.name !== "Sun" && sepDeg([p.ra, p.dec], [ra, dec]) < 20)
    .map((p) => {
      const t = skyToTan(p.ra, p.dec, ra, dec)!;
      const x = c - t[0] / s, y = c - t[1] / s;
      return { name: p.name, x, y, inFrame: x >= 0 && y >= 0 && x < n && y < n };
    });
}

/** Build a two-pass blink of the sky around (ra, dec), `size` degrees across. */
export async function makeBlink(ra: number, dec: number, size = 0.6, n = 360, perPass = 2, signal?: AbortSignal): Promise<Blink> {
  const exps = await findExposures(ra, dec, signal);
  const groups = passes(exps);
  if (groups.length < 2) throw new Error(groups.length ? "SPHEREx has imaged this spot only once so far" : "No SPHEREx images cover this spot yet");
  // Pick the color (detector band) whose exposures cover the field best in every pass, then in each
  // pass the exposure that covers most of it (ties: the one most centred on the spot)
  const score = (e: Exposure) => fieldCoverage(e, ra, dec, size) - sepDeg(e.center, [ra, dec]) * 1e-3;
  const use = groups.slice(0, 3);
  const bandScore = (b: string) => Math.min(...use.map((g) => Math.max(-1, ...g.filter((e) => e.band === b).map(score))));
  const pref = (b: string) => bandScore(b) - 0.08 * BAND_PREFERENCE.indexOf(b);
  const band = [...BAND_PREFERENCE].sort((a, b) => pref(b) - pref(a))[0];
  // Each pass: the best-covering exposure, plus a few more of the same color to fill any gaps
  const chosen = use.map((g) => {
    const pool = g.filter((e) => e.band === band);
    const ranked = (pool.length ? pool : g).slice().sort((x, y) => score(y) - score(x));
    return fieldCoverage(ranked[0], ra, dec, size) > 0.97 ? ranked.slice(0, 1) : ranked.slice(0, perPass);
  });
  const cut = Math.min(3.4, size * 1.45); // a little extra so the corners survive the rotation
  const imgs = await Promise.all(chosen.map((list) => Promise.all(list.map((e) => fetchCutout(e.url, ra, dec, cut, signal)))));
  const stretched = imgs.map((list) => {
    // line each exposure up, take out its own sky background, then fill gaps from the next one
    const layers = list.map((img) => {
      const v = resample(img, ra, dec, size, n);
      const finite = Array.from(v.filter(Number.isFinite)).sort((x, y) => x - y);
      const bg = finite.length ? finite[finite.length >> 1] : 0;
      return v.map((x) => x - bg);
    });
    const merged = layers[0].slice();
    for (const layer of layers.slice(1)) for (let k = 0; k < merged.length; k++) if (!Number.isFinite(merged[k])) merged[k] = layer[k];
    return stretch(merged);
  });
  const u8 = (f: Float32Array) => Uint8Array.from(f, (v) => (Number.isFinite(v) ? Math.round(v * 254) + 1 : 0)); // 0 = not covered
  const [a, b] = stretched;
  const diff = new Uint8Array(n * n);
  for (let k = 0; k < diff.length; k++) {
    const va = a.out[k], vb = b.out[k];
    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue; // 0 = not covered by both
    // keep only real changes: small differences are noise (the two passes have different grain)
    const d = vb - va, t = 0.12, kept = Math.sign(d) * Math.max(0, Math.abs(d) - t) / (1 - t);
    diff[k] = Math.max(1, Math.min(255, Math.round(128 + kept * 127)));
  }
  return {
    ra,
    dec,
    size,
    n,
    source: "SPHEREx DR1 Level 2 images, NASA/IPAC IRSA",
    diff: toB64(diff),
    passes: chosen.map((list, k) => {
      const e = list[0];
      const mjd = Number(imgs[k][0].header["MJD-AVG"] ?? imgs[k][0].header["MJD-OBS"] ?? e.mjd);
      return {
        date: mjdToDate(mjd).toISOString(),
        mjd,
        obsId: list.map((x) => x.obsId).join(", "),
        band: e.band,
        umMin: e.umMin,
        umMax: e.umMax,
        img: toB64(u8(stretched[k].out)),
        bodies: bodiesAt(mjd, ra, dec, size, n),
        coverage: stretched[k].coverage,
      };
    }),
  };
}
