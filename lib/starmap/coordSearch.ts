export interface ParsedCoord {
  ra: number; // decimal degrees [0, 360)
  dec: number; // decimal degrees [-90, 90]
}

export interface BenchmarkTarget {
  name: string;
  note: string;
  coordText: string;
  ra: number;
  dec: number;
  fov: number;
}

export function formatRaHMS(raDeg: number): string {
  const norm = ((raDeg % 360) + 360) % 360;
  const totalSec = (norm / 15) * 3600;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${s.toFixed(1).padStart(4, "0")}s`;
}

export function formatDecDMS(decDeg: number): string {
  const sign = decDeg < 0 ? "-" : "+";
  const abs = Math.abs(decDeg);
  const totalSec = abs * 3600;
  const d = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${sign}${String(d).padStart(2, "0")}° ${String(m).padStart(2, "0")}' ${s.toFixed(0).padStart(2, "0")}"`;
}

/**
 * Parse J2000 RA/Dec from:
 * - Sexagesimal HMS/DMS: `17h 57m 48.5s +04° 41' 36"`, `17:57:48.5, +04:41:36`
 * - Decimal degrees: `269.452, +4.693`, `269.452 -4.693`
 */
export function parseRaDec(raw: string): { ok: true; coord: ParsedCoord } | { ok: false; error: string } {
  const input = raw.trim();
  if (!input) return { ok: false, error: "Enter RA / Dec coordinates" };

  // Sexagesimal: 3 parts for RA, 3 parts for Dec
  const sexa = input.match(
    /^\s*(\d{1,2})\s*[h:\s]\s*(\d{1,2})\s*[m:\s]\s*(\d{1,2}(?:\.\d+)?)\s*s?\s*[,;\s]+\s*([+-]?\d{1,2})\s*[°d:\s]\s*(\d{1,2})\s*['′m:\s]\s*(\d{1,2}(?:\.\d+)?)\s*["″s]?\s*$/i
  );
  if (sexa) {
    const [, rh, rm, rs, ddStr, dm, ds] = sexa;
    const h = Number(rh), m = Number(rm), s = Number(rs);
    const dSign = ddStr.startsWith("-") ? -1 : 1;
    const d = Math.abs(Number(ddStr)), dmN = Number(dm), dsN = Number(ds);
    if (h >= 24 || m >= 60 || s >= 60) return { ok: false, error: "RA must be 00h–23h 59m 59s" };
    if (d > 90 || dmN >= 60 || dsN >= 60 || (d === 90 && (dmN > 0 || dsN > 0))) {
      return { ok: false, error: "Dec must be between -90° and +90°" };
    }
    const ra = (h + m / 60 + s / 3600) * 15;
    const dec = dSign * (d + dmN / 60 + dsN / 3600);
    return { ok: true, coord: { ra, dec } };
  }

  // Short sexagesimal with an explicit "h": `4h 32m +26`, `4h32m, +26° 30'`, `5h55m10s +7°24'25"`
  const short = input.match(
    /^\s*(\d{1,2}(?:\.\d+)?)\s*h\s*(?:(\d{1,2}(?:\.\d+)?)\s*m)?\s*(?:(\d{1,2}(?:\.\d+)?)\s*s)?\s*[,;]?\s*([+\-−]?)\s*(\d{1,2}(?:\.\d+)?)\s*(?:°|d)?\s*(?:(\d{1,2}(?:\.\d+)?)\s*['′m])?\s*(?:(\d{1,2}(?:\.\d+)?)\s*["″s]?)?\s*$/i
  );
  if (short) {
    const [, rh, rm = "0", rs = "0", sign, dd, dm = "0", ds = "0"] = short;
    const ra = (Number(rh) + Number(rm) / 60 + Number(rs) / 3600) * 15;
    const dec = (sign === "-" || sign === "−" ? -1 : 1) * (Number(dd) + Number(dm) / 60 + Number(ds) / 3600);
    if (!(ra >= 0 && ra < 360) || Number(rm) >= 60 || Number(rs) >= 60) return { ok: false, error: "RA must be 00h–23h 59m 59s" };
    if (!(Math.abs(dec) <= 90) || Number(dm) >= 60 || Number(ds) >= 60) return { ok: false, error: "Dec must be between -90° and +90°" };
    return { ok: true, coord: { ra, dec } };
  }

  // Decimal degrees: two numbers separated by comma or whitespace
  const decMatch = input.match(/^\s*([+-]?\d+(?:\.\d+)?)\s*[,;\s]+\s*([+-]?\d+(?:\.\d+)?)\s*$/);
  if (decMatch) {
    const ra = Number(decMatch[1]);
    const dec = Number(decMatch[2]);
    if (!Number.isFinite(ra) || ra < 0 || ra >= 360) {
      return { ok: false, error: "Decimal RA must be 0° to < 360°" };
    }
    if (!Number.isFinite(dec) || dec < -90 || dec > 90) {
      return { ok: false, error: "Decimal Dec must be -90° to +90°" };
    }
    return { ok: true, coord: { ra, dec } };
  }

  return { ok: false, error: "Use HMS/DMS (17h 57m 48.5s +04° 41' 36\") or decimal (269.452, +4.693)" };
}

export const BENCHMARK_TARGETS: BenchmarkTarget[] = [
  { name: "Barnard's Star", note: "high proper motion", coordText: "17h 57m 48.5s, +04° 41' 36\"", ra: 269.452083, dec: 4.693333, fov: 1.5 },
  { name: "Epsilon Indi B", note: "nearby brown dwarf motion", coordText: "22h 04m 10.5s, -56° 46' 58\"", ra: 331.04375, dec: -56.782778, fov: 1.5 },
  { name: "WISE 0855", note: "coldest known brown dwarf", coordText: "08h 55m 10.8s, -07° 14' 43\"", ra: 133.795, dec: -7.245278, fov: 1.5 },
  { name: "RW Aurigae", note: "variable young star", coordText: "05h 07m 49.5s, +30° 24' 05\"", ra: 76.95625, dec: 30.401389, fov: 1.5 },
  { name: "R Draconis", note: "long-period variable star", coordText: "16h 32m 31.9s, +66° 45' 18\"", ra: 248.132917, dec: 66.755, fov: 1.5 },
];
