// 360° views for everything on the map: every waypoint (yours too), every constellation and every
// bright named star gets a view, created on demand. Hand-made tour stops are used where they exist.

import { registerLandmark } from "./landmarks";
import { bvToKelvin, type SkyData } from "./astro";
import type { Waypoint } from "@/lib/starmap/data";

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

/** The 360° view for any of the 88 constellations. */
export function constellationStop(con: SkyData["constellations"][number]): string {
  if (TOUR_CONSTELLATIONS[con.id]) return TOUR_CONSTELLATIONS[con.id];
  const name = con.names.en;
  const stars = new Set(con.lines.flat().map(([ra, dec]) => `${ra},${dec}`)).size;
  const [ra, dec] = con.center;
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
      ["Surface (est.)", `≈ ${(Math.round(k / 100) * 100).toLocaleString()} K`],
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
