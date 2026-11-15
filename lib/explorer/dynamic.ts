// 360° views for everything on the map: every waypoint (yours too), every constellation and every
// bright named star gets a view, created on demand. Hand-made tour stops are used where they exist.

import { registerLandmark } from "./landmarks";
import { bvToKelvin, type SkyData } from "./astro";
import { PRESET_WAYPOINTS, type Waypoint } from "@/lib/starmap/data";
import type { Hotspot } from "./landmarks";

const hms = (ra: number) => {
  const h = ra / 15, hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return `${hh}h ${String(mm).padStart(2, "0")}m`;
};
const deg = (d: number) => `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}°`;

/** How much sky to show around each deep-sky waypoint (degrees across). */
const PATCH_FOV: Record<string, number> = {
  origin: 40,
  m31: 8,
  m45: 6,
  m1: 4,
  sgra: 14,
  nep: 24,
  sep: 24,
  lmc: 14,
  vega: 12,
  etacar: 8,
  m57: 2.5,
  m51: 3,
  m33: 4,
  m8: 4,
  m16: 4,
  m20: 3,
  helix: 3,
  omegacen: 3,
  "47tuc": 3,
  smc: 8,
  m44: 4,
  m13: 3,
  m104: 3,
  m101: 4,
  rhooph: 10,
  taurusmc: 14,
  ngc7000: 6,
  rosette: 4,
  horsehead: 3,
  cena: 3,
  cygx1: 4,
  barnard: 4,
};

const TOUR_CONSTELLATIONS: Record<string, string> = { Ori: "orion", UMa: "ursa-major", Sco: "scorpius", Cru: "crux" };
const TOUR_STARS: Record<number, string> = { 32349: "sirius", 11767: "polaris", 27989: "betelgeuse" };

/** The 360° view for a waypoint: its tour stop if it has one, otherwise a view built from its data. */
export function waypointStop(wp: Waypoint): string {
  if (wp.stop) return wp.stop;
  const fov = PATCH_FOV[wp.id] ?? 14;
  return registerLandmark({
    id: `wp-${wp.id}`,
    section: wp.custom ? "Your waypoints" : "Deep sky",
    kind: "sky",
    title: wp.title,
    subtitle: wp.kind,
    description: wp.description || "A spot you marked on the map.",
    facts: [
      ["RA (J2000)", hms(wp.ra)],
      ["Dec (J2000)", deg(wp.dec)],
      [wp.custom ? "Added" : "Recorded", wp.date || "—"],
      ["Imagery", "SPHEREx DR1"],
    ],
    spherex:
      wp.significance ||
      "The glowing patch in front of you is real SPHEREx data: this spot as SPHEREx saw it between April 2025 and May 2026.",
    look: [wp.ra, wp.dec],
    fov: Math.max(3, fov * 1.25),
    patch: { ra: wp.ra, dec: wp.dec, fov },
    hotspots: [{ title: wp.title, body: wp.description || wp.kind, at: { sky: [wp.ra, wp.dec] } }],
  });
}

const angle = (ra1: number, d1: number, ra2: number, d2: number) => {
  const r = Math.PI / 180;
  const c = Math.sin(d1 * r) * Math.sin(d2 * r) + Math.cos(d1 * r) * Math.cos(d2 * r) * Math.cos((ra1 - ra2) * r);
  return Math.acos(Math.min(1, Math.max(-1, c))) / r;
};

/** The 360° view for any of the 88 constellations. */
export function constellationStop(sky: SkyData, con: SkyData["constellations"][number]): string {
  if (TOUR_CONSTELLATIONS[con.id]) return TOUR_CONSTELLATIONS[con.id];
  const name = con.names.en;
  const stars = new Set(con.lines.flat().map(([ra, dec]) => `${ra},${dec}`)).size;
  const [ra, dec] = con.center;

  // A diamond on each named star (it rides along with the star in 3D), and on deep-sky waypoints in view
  const hotspots: Hotspot[] = [];
  for (const n of sky.named) {
    if (n.con !== con.id || sky.stars[n.i][2] > 3.5) continue;
    const [, , mag, bv, dpc] = sky.stars[n.i];
    const [kind] = STAR_KIND(bvToKelvin(bv));
    const far = dpc > 0 ? ` about ${Math.round(dpc * 3.2616).toLocaleString("en-US")} light-years away` : "";
    hotspots.push({
      title: n.names.en,
      body: `${kind[0].toUpperCase()}${kind.slice(1)},${far}, shining at magnitude ${mag.toFixed(2)}. Orbit or fly away to see how far it sits from its neighbors.`,
      at: { anchor: `fig-${n.hip}` },
      link: starStop(sky, n),
    });
  }
  for (const wp of PRESET_WAYPOINTS)
    if (angle(wp.ra, wp.dec, ra, dec) < 22)
      hotspots.push({ title: wp.title, body: wp.description, at: { sky: [wp.ra, wp.dec] }, link: waypointStop(wp) });
  return registerLandmark({
    id: `con-${con.id}`,
    section: "Constellations",
    kind: "constellation",
    title: name,
    subtitle: "Constellation",
    description: `${name} is one of the 88 constellations astronomers use to divide up the sky. The highlighted lines join its brightest stars into its traditional figure.`,
    facts: [
      ["Center RA", hms(ra)],
      ["Center Dec", deg(dec)],
      ["Stars in the figure", String(stars)],
      ["Imagery", "SPHEREx DR1"],
    ],
    spherex: `Behind the lines is SPHEREx's own picture of ${name}: every star, dust cloud and galaxy here was measured in 102 infrared colors.`,
    constellation: con.id,
    fov: 70,
    patch: { ra, dec, fov: 48 },
    hotspots,
  });
}

const STAR_KIND = (k: number) =>
  k > 20000
    ? ["a very hot blue star", "#b8c8ff"]
    : k > 9000
      ? ["a hot blue-white star", "#d4defe"]
      : k > 7000
        ? ["a white star", "#f4f4ff"]
        : k > 5500
          ? ["a yellow star, like the Sun", "#fff1d0"]
          : k > 3600
            ? ["a cool orange star", "#ffc98a"]
            : ["a cool red star", "#ff9a6a"];

/** The 360° view for a bright named star. */
export function starStop(sky: SkyData, s: SkyData["named"][number]): string {
  if (TOUR_STARS[s.hip]) return TOUR_STARS[s.hip];
  const [ra, dec, mag, bv] = sky.stars[s.i];
  const k = bvToKelvin(bv);
  const [kind, color] = STAR_KIND(k);
  const con = sky.constellations.find((c) => c.id === s.con)?.names.en ?? s.con;
  const name = s.names.en;
  return registerLandmark({
    id: `star-${s.hip}`,
    section: "Stars",
    kind: "star",
    title: name,
    subtitle: `Star in ${con} · magnitude ${mag.toFixed(2)}`,
    description: `${name} is ${kind} and one of the brightest stars in the night sky, in the constellation ${con}. Its color comes from the temperature of its surface.`,
    facts: [
      ["Brightness", `magnitude ${mag.toFixed(2)}`],
      ["Surface (est.)", `≈ ${(Math.round(k / 100) * 100).toLocaleString("en-US")} K`],
      ["Constellation", con],
      ["Hipparcos no.", String(s.hip)],
    ],
    spherex: "SPHEREx measures a 102-color infrared spectrum of more than 100 million stars like this one, revealing what they and their surroundings are made of.",
    look: [ra, dec],
    fov: 60,
    constellation: s.con,
    star: { color },
  });
}
