/**
 * Just enough FITS + WCS to use SPHEREx Level-2 cutouts from IRSA: read the IMAGE extension (32-bit
 * floats) and its TAN-SIP world coordinate system, and map sky positions to pixels.
 */

export type Header = Record<string, string | number>;
export type FitsImage = { header: Header; width: number; height: number; data: Float32Array };

const BLOCK = 2880;

function parseHeader(bytes: Uint8Array, start: number): { header: Header; end: number } | null {
  const header: Header = {};
  const dec = new TextDecoder("latin1");
  for (let pos = start; pos + 80 <= bytes.length; pos += 80) {
    const card = dec.decode(bytes.subarray(pos, pos + 80));
    const key = card.slice(0, 8).trim();
    if (key === "END") return { header, end: Math.ceil((pos + 80 - start) / BLOCK) * BLOCK + start };
    if (card[8] !== "=") continue;
    let v = card.slice(10).trim();
    if (v.startsWith("'")) v = v.slice(1, v.indexOf("'", 1)).trim();
    else v = v.split("/")[0].trim();
    const n = Number(v);
    header[key] = v !== "" && Number.isFinite(n) && !/^[TF]$/.test(v) ? n : v;
  }
  return null; // header not complete yet
}

/** How many bytes of the stream are needed to hold the extension named `name` (or null if not known yet). */
export function findImage(bytes: Uint8Array, name = "IMAGE"): FitsImage | "need-more" | null {
  let pos = 0;
  while (pos < bytes.length) {
    const h = parseHeader(bytes, pos);
    if (!h) return "need-more";
    const { header, end } = h;
    const bitpix = Number(header.BITPIX), naxis = Number(header.NAXIS ?? 0);
    let count = naxis ? 1 : 0;
    for (let k = 1; k <= naxis; k++) count *= Number(header[`NAXIS${k}`]);
    const size = (Math.abs(bitpix) / 8) * count + Number(header.PCOUNT ?? 0);
    const dataEnd = end + Math.ceil(size / BLOCK) * BLOCK;
    if (String(header.EXTNAME ?? "").trim() === name) {
      if (bytes.length < end + size) return "need-more";
      if (bitpix !== -32 || naxis !== 2) return null;
      const w = Number(header.NAXIS1), hgt = Number(header.NAXIS2);
      const view = new DataView(bytes.buffer, bytes.byteOffset + end, w * hgt * 4);
      const data = new Float32Array(w * hgt);
      for (let i = 0; i < data.length; i++) data[i] = view.getFloat32(i * 4, false); // FITS is big-endian
      return { header, width: w, height: hgt, data };
    }
    pos = dataEnd;
  }
  return "need-more";
}

const D = Math.PI / 180;

/** Sky (deg) → gnomonic intermediate coordinates (deg) about (ra0, dec0): x east, y north. */
export function skyToTan(ra: number, dec: number, ra0: number, dec0: number): [number, number] | null {
  const da = (ra - ra0) * D, d = dec * D, d0 = dec0 * D;
  const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(da);
  if (cosc <= 0.05) return null; // behind the projection
  return [(Math.cos(d) * Math.sin(da)) / cosc / D, (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(da)) / cosc / D];
}

/** Gnomonic intermediate coordinates (deg) about (ra0, dec0) → sky (deg). */
export function tanToSky(x: number, y: number, ra0: number, dec0: number): [number, number] {
  const xi = x * D, eta = y * D, d0 = dec0 * D;
  const rho = Math.hypot(xi, eta);
  if (rho < 1e-12) return [ra0, dec0];
  const c = Math.atan(rho), sc = Math.sin(c), cc = Math.cos(c);
  const dec = Math.asin(cc * Math.sin(d0) + (eta * sc * Math.cos(d0)) / rho);
  const ra = ra0 * D + Math.atan2(xi * sc, rho * Math.cos(d0) * cc - eta * Math.sin(d0) * sc);
  return [(((ra / D) % 360) + 360) % 360, dec / D];
}

/** A TAN-SIP world coordinate system: sky → pixel (0-based x, y as stored in the data array). */
export function makeWcs(h: Header) {
  const n = (k: string, d = 0) => (typeof h[k] === "number" ? (h[k] as number) : d);
  const ra0 = n("CRVAL1"), dec0 = n("CRVAL2"), cx = n("CRPIX1"), cy = n("CRPIX2");
  const c1 = n("CDELT1", 1), c2 = n("CDELT2", 1);
  // CD = PC × CDELT (or CD given directly)
  const m11 = h.CD1_1 !== undefined ? n("CD1_1") : n("PC1_1", 1) * c1;
  const m12 = h.CD1_2 !== undefined ? n("CD1_2") : n("PC1_2", 0) * c1;
  const m21 = h.CD2_1 !== undefined ? n("CD2_1") : n("PC2_1", 0) * c2;
  const m22 = h.CD2_2 !== undefined ? n("CD2_2") : n("PC2_2", 1) * c2;
  const det = m11 * m22 - m12 * m21;
  const poly = (prefix: string) => {
    const order = n(`${prefix}_ORDER`, 0);
    const terms: [number, number, number][] = [];
    for (let p = 0; p <= order; p++) for (let q = 0; q <= order - p; q++) {
      const v = h[`${prefix}_${p}_${q}`];
      if (typeof v === "number" && v !== 0) terms.push([p, q, v]);
    }
    return (u: number, v: number) => terms.reduce((s, [p, q, c]) => s + c * u ** p * v ** q, 0);
  };
  const AP = poly("AP"), BP = poly("BP");
  return {
    /** Pixel (0-based) of a sky position, or null if it's far outside the projection. */
    toPixel(ra: number, dec: number): [number, number] | null {
      const t = skyToTan(ra, dec, ra0, dec0);
      if (!t) return null;
      const U = (m22 * t[0] - m12 * t[1]) / det, V = (-m21 * t[0] + m11 * t[1]) / det;
      return [U + AP(U, V) + cx - 1, V + BP(U, V) + cy - 1];
    },
  };
}
