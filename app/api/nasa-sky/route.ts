import { NextResponse } from "next/server";

export interface GaiaLiveStar {
  id: string;
  ra: number;
  dec: number;
  mag: number;
  parallaxMas: number | null;
  distLy: number | null;
  pmRa: number;
  pmDec: number;
  pmTotal: number;
  bpRp: number | null;
}

const cache = new Map<string, { at: number; stars: GaiaLiveStar[] }>();
const TTL_MS = 5 * 60 * 1000;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ra = Number(searchParams.get("ra"));
  const dec = Number(searchParams.get("dec"));
  const radius = Math.min(1.0, Math.max(0.02, Number(searchParams.get("radius")) || 0.15));

  if (!Number.isFinite(ra) || !Number.isFinite(dec) || dec < -90 || dec > 90) {
    return NextResponse.json({ error: "Invalid ra/dec" }, { status: 400 });
  }

  const normRa = ((ra % 360) + 360) % 360;
  const key = `${normRa.toFixed(3)}_${dec.toFixed(3)}_${radius.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ source: "Gaia DR3 (TAP)", cached: true, stars: hit.stars });
  }

  const adql = `SELECT TOP 30 source_id, ra, dec, parallax, pmra, pmdec, phot_g_mean_mag, bp_rp
FROM gaiadr3.gaia_source
WHERE CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', ${normRa.toFixed(5)}, ${dec.toFixed(5)}, ${radius.toFixed(4)})) = 1
  AND phot_g_mean_mag IS NOT NULL
ORDER BY phot_g_mean_mag ASC`;

  const url =
    "https://gea.esac.esa.int/tap-server/tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY=" +
    encodeURIComponent(adql);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(7500) });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Gaia TAP HTTP ${res.status}`, stars: [] },
        { status: 502 },
      );
    }
    const json: { data?: unknown[][] } = await res.json();
    const rows = Array.isArray(json.data) ? json.data : [];

    const stars: GaiaLiveStar[] = rows.map((r) => {
      const id = String(r[0] ?? "");
      const sRa = Number(r[1] ?? 0);
      const sDec = Number(r[2] ?? 0);
      const plx = r[3] !== null && r[3] !== undefined ? Number(r[3]) : null;
      const pmRa = r[4] !== null && r[4] !== undefined ? Number(r[4]) : 0;
      const pmDec = r[5] !== null && r[5] !== undefined ? Number(r[5]) : 0;
      const mag = Number(r[6] ?? 20);
      const bpRp = r[7] !== null && r[7] !== undefined ? Number(r[7]) : null;
      const pmTotal = Math.hypot(pmRa, pmDec);
      const distLy = plx && plx > 0.1 ? Math.round((3261.56 / plx) * 10) / 10 : null;
      return {
        id,
        ra: sRa,
        dec: sDec,
        mag: Math.round(mag * 100) / 100,
        parallaxMas: plx !== null ? Math.round(plx * 100) / 100 : null,
        distLy,
        pmRa: Math.round(pmRa * 10) / 10,
        pmDec: Math.round(pmDec * 10) / 10,
        pmTotal: Math.round(pmTotal * 10) / 10,
        bpRp: bpRp !== null ? Math.round(bpRp * 100) / 100 : null,
      };
    });

    // Sort high-proper-motion movers (>50 mas/yr) first, then brightest
    stars.sort((a, b) => {
      const aFast = a.pmTotal >= 50 ? 1 : 0;
      const bFast = b.pmTotal >= 50 ? 1 : 0;
      if (aFast !== bFast) return bFast - aFast;
      if (aFast && bFast) return b.pmTotal - a.pmTotal;
      return a.mag - b.mag;
    });

    cache.set(key, { at: Date.now(), stars });
    return NextResponse.json({ source: "Gaia DR3 (TAP)", cached: false, stars });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to reach Gaia TAP", stars: [] },
      { status: 502 },
    );
  }
}
