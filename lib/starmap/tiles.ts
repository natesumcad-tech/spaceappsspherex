import type { SkyData } from "@/lib/explorer/astro";
import { EQ_TO_GAL, DEG, bvToCss, mul, precessionMatrix, projector, transpose, xToRa } from "./coords";

/**
 * Every catalogue star placed on the map's coordinate plane for one epoch, bucketed into a
 * 2°×2° grid so a tile only looks at the stars that can land on it.
 */
export class StarField {
  x: Float32Array;
  y: Float32Array;
  mag: Float32Array;
  color: string[];
  private bins: Int32Array[];
  static BIN = 2;

  constructor(sky: SkyData, years: number) {
    const n = sky.stars.length;
    const proj = projector(years);
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.mag = new Float32Array(n);
    this.color = new Array(n);
    const cols = 360 / StarField.BIN, rows = 180 / StarField.BIN;
    const lists: number[][] = Array.from({ length: cols * rows }, () => []);
    sky.stars.forEach(([ra, dec, mag, bv], i) => {
      const [x, y] = proj(ra, dec);
      this.x[i] = x;
      this.y[i] = y;
      this.mag[i] = mag;
      this.color[i] = bvToCss(bv);
      lists[this.bin(x, y)].push(i); // stars arrive sorted by brightness, so each bin is too
    });
    this.bins = lists.map((l) => Int32Array.from(l));
  }

  private bin(x: number, y: number) {
    const cols = 360 / StarField.BIN, rows = 180 / StarField.BIN;
    const bx = Math.min(cols - 1, Math.max(0, Math.floor((x + 180) / StarField.BIN)));
    const by = Math.min(rows - 1, Math.max(0, Math.floor((y + 90) / StarField.BIN)));
    return by * cols + bx;
  }

  /** Calls `fn` for each star brighter than `maxMag` inside the box. */
  query(x0: number, x1: number, y0: number, y1: number, maxMag: number, fn: (i: number) => void) {
    const B = StarField.BIN, cols = 360 / B, rows = 180 / B;
    const bx0 = Math.max(0, Math.floor((x0 + 180) / B)), bx1 = Math.min(cols - 1, Math.floor((x1 + 180) / B));
    const by0 = Math.max(0, Math.floor((y0 + 90) / B)), by1 = Math.min(rows - 1, Math.floor((y1 + 90) / B));
    for (let by = by0; by <= by1; by++)
      for (let bx = bx0; bx <= bx1; bx++) {
        const list = this.bins[by * cols + bx];
        for (let k = 0; k < list.length; k++) {
          const i = list[k];
          if (this.mag[i] > maxMag) break;
          const x = this.x[i], y = this.y[i];
          if (x >= x0 && x <= x1 && y >= y0 && y <= y1) fn(i);
        }
      }
  }
}

export type RenderOpts = { glow: boolean; years: number };

const GLOW_RES = 64;
let glowCanvas: HTMLCanvasElement | null = null;

/** Faintest stars drawn at each zoom level (fewer stars when zoomed out = cheaper tiles). */
export const magLimitFor = (pixelsPerDeg: number) => (pixelsPerDeg < 6 ? 5 : pixelsPerDeg < 12 ? 6 : pixelsPerDeg < 30 ? 6.8 : 7.5);

/**
 * Paints the map region [x0, x0+w] × [y0, y0+h] (degrees) into a canvas of W×H pixels:
 * a soft Milky Way glow computed from galactic coordinates, then the stars.
 */
export function renderRegion(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, W: number, H: number, field: StarField, opts: RenderOpts) {
  ctx.fillStyle = "#0b1030";
  ctx.fillRect(0, 0, W, H);

  if (opts.glow) {
    // Low-resolution glow, scaled up smoothly: it's a soft gradient so 64 px is plenty.
    glowCanvas ??= Object.assign(document.createElement("canvas"), { width: GLOW_RES, height: GLOW_RES });
    const g = glowCanvas.getContext("2d")!;
    const img = g.createImageData(GLOW_RES, GLOW_RES);
    const m = mul(EQ_TO_GAL, transpose(precessionMatrix(opts.years))); // of-date equatorial → galactic
    for (let py = 0; py < GLOW_RES; py++) {
      const dec = (y0 + h - ((py + 0.5) / GLOW_RES) * h) * DEG;
      const cd = Math.cos(dec), sd = Math.sin(dec);
      for (let px = 0; px < GLOW_RES; px++) {
        const ra = xToRa(x0 + ((px + 0.5) / GLOW_RES) * w) * DEG;
        const vx = cd * Math.cos(ra), vy = cd * Math.sin(ra), vz = sd;
        const gx = m[0][0] * vx + m[0][1] * vy + m[0][2] * vz;
        const gy = m[1][0] * vx + m[1][1] * vy + m[1][2] * vz;
        const gz = m[2][0] * vx + m[2][1] * vy + m[2][2] * vz;
        const l = Math.atan2(gy, gx) / DEG, b = Math.asin(Math.max(-1, Math.min(1, gz))) / DEG;
        const width = 4 + 7 * Math.exp(-((l / 35) ** 2));
        let I = Math.exp(-((b / width) ** 2)) * (0.35 + 0.65 * Math.exp(-((l / 70) ** 2)));
        if (l > -10 && l < 75) I *= 1 - 0.55 * Math.exp(-(((b - 1.5) / 2.2) ** 2)); // the Great Rift
        const bulge = 0.6 * Math.exp(-((l / 12) ** 2 + (b / 9) ** 2));
        const k = (py * GLOW_RES + px) * 4;
        img.data[k] = Math.min(255, 11 + I * 62 + bulge * 95);
        img.data[k + 1] = Math.min(255, 16 + I * 56 + bulge * 72);
        img.data[k + 2] = Math.min(255, 48 + I * 100 + bulge * 50);
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(glowCanvas, 0, 0, W, H);
  }

  const ppd = W / w; // pixels per degree
  const maxMag = magLimitFor(ppd);
  const sizeK = 0.22 * Math.sqrt(ppd / 8.5);
  const margin = 12 / ppd;
  field.query(x0 - margin, x0 + w + margin, y0 - margin, y0 + h + margin, maxMag, (i) => {
    const px = ((field.x[i] - x0) / w) * W, py = ((y0 + h - field.y[i]) / h) * H;
    const mag = field.mag[i];
    const r = Math.min(10, Math.max(0.55, (7.8 - mag) * sizeK));
    const alpha = Math.max(0.3, Math.min(1, (maxMag + 0.8 - mag) / 2.5));
    if (opts.glow && mag < 2.5) {
      const halo = ctx.createRadialGradient(px, py, 0, px, py, r * 4);
      halo.addColorStop(0, field.color[i].replace("rgb", "rgba").replace(")", ",0.45)"));
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(px - r * 4, py - r * 4, r * 8, r * 8);
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = field.color[i];
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}

/** The whole map as one small image, used by the side minimap. */
export function renderOverview(field: StarField, opts: RenderOpts, W = 1024) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = W / 2;
  renderRegion(c.getContext("2d")!, -180, -90, 360, 180, W, W / 2, field, opts);
  return c;
}
