import { planetPositions } from "@/lib/starmap/coords";
import sky from "@/public/data/sky.json";
import { PRESET_WAYPOINTS } from "@/lib/starmap/data";

export function separationDeg(ra: number, dec: number, otherRa: number, otherDec: number) {
  const r = Math.PI / 180;
  const a = Math.sin((dec - otherDec) * r / 2) ** 2 + Math.cos(dec * r) * Math.cos(otherDec * r) * Math.sin((ra - otherRa) * r / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(Math.min(1, a))) / r;
}
export async function identifyPosition(ra: number, dec: number, year: number) {
  const local = [
    ...planetPositions(year).map(p => ({ name: p.name, kind: p.name === "Sun" ? "Star (the Sun)" : "Planet", ra: p.ra, dec: p.dec, description: "Approximate Solar System position for the app's selected timeline, not a precision ephemeris." })),
    ...PRESET_WAYPOINTS.map(w => ({ name: w.title, kind: w.kind, ra: w.ra, dec: w.dec, description: w.description })),
    ...sky.named.map(s => ({ name: s.names.en, kind: "Named star", ra: sky.stars[s.i][0], dec: sky.stars[s.i][1], description: "Named star in the app's Hipparcos/HYG-based sky catalogue." })),
  ].map(o => ({ ...o, separation_arcsec: separationDeg(ra, dec, o.ra, o.dec) * 3600 }))
    .filter(o => o.separation_arcsec <= 180).sort((a, b) => a.separation_arcsec - b.separation_arcsec).slice(0, 3);
  const query = `SELECT TOP 3 main_id, otype, ra, dec, DISTANCE(POINT('ICRS', ra, dec), POINT('ICRS', ${ra}, ${dec})) AS separation FROM basic WHERE CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', ${ra}, ${dec}, 0.02)) = 1 ORDER BY separation`;
  const url = new URL("https://simbad.cfa.harvard.edu/simbad/sim-tap/sync");
  url.search = new URLSearchParams({ request: "doQuery", lang: "adql", format: "json", query }).toString();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(7000), next: { revalidate: 86400 } });
    if (!response.ok) throw new Error("Catalogue unavailable");
    const result = await response.json();
    const rows: unknown[][] = Array.isArray(result.data) ? result.data : [];
    const matches = rows.filter(row => typeof row[0] === "string" && [row[2], row[3], row[4]].every(v => typeof v === "number" && Number.isFinite(v)))
      .slice(0, 3).map(row => ({ name: row[0], kind: row[1], ra: row[2], dec: row[3], separation_arcsec: Number(row[4]) * 3600 }));
    return { local, matches, remoteStatus: "available", url: url.toString(), search_radius_arcsec: 72 };
  } catch {
    return { local, matches: [], remoteStatus: "unavailable", url: url.toString(), search_radius_arcsec: 72 };
  }
}
