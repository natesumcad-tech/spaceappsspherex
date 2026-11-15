// Builds public/data/sky.json from the d3-celestial star catalog
// (Hipparcos/HYG-derived data, BSD-3-Clause). Run: npm run build:sky
//
// Star distances come from the HYG database v4.1 (CC BY-SA 4.0, https://codeberg.org/astronexus/hyg).
// Download hygdata_v41.csv and point HYG_CSV at it:  HYG_CSV=path/to/hygdata_v41.csv npm run build:sky
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const SRC = "node_modules/d3-celestial/data";
const read = (f) => JSON.parse(readFileSync(`${SRC}/${f}`, "utf8"));
const LANGS = ["en", "es", "fr", "zh", "hi", "ar", "ja", "de", "ru"];
const MAG_LIMIT = 7.5;
const r = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const toRa = (lon) => r((lon + 360) % 360, 3);

/** HYG distances in parsecs, keyed by Hipparcos number. */
const distByHip = new Map();
const hygPath = process.env.HYG_CSV;
if (hygPath && existsSync(hygPath)) {
  const lines = readFileSync(hygPath, "utf8").split("\n");
  const cols = lines[0].split(",").map((c) => c.replace(/"/g, ""));
  const H = cols.indexOf("hip"), D = cols.indexOf("dist");
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    const hip = f[H], d = parseFloat(f[D]);
    if (hip && d > 0 && d < 100000) distByHip.set(Number(hip), d); // HYG uses 100000 for "unknown"
  }
  console.log(`HYG distances: ${distByHip.size}`);
} else console.warn("HYG_CSV not set: stars will have no distances (3D constellation views need them).");

const names = read("starnames.json");
const stars = read("stars.8.json")
  .features.filter((f) => f.properties.mag <= MAG_LIMIT)
  .sort((a, b) => a.properties.mag - b.properties.mag);

const starRows = [];
const named = [];
for (const f of stars) {
  const [lon, lat] = f.geometry.coordinates;
  const dist = distByHip.get(Number(f.id));
  const row = [toRa(lon), r(lat, 3), r(f.properties.mag), r(parseFloat(f.properties.bv) || 0.6), dist ? r(dist, 1) : 0];
  starRows.push(row);
  const n = names[f.id];
  if (n && n.name && f.properties.mag <= 3) {
    const loc = { en: n.name };
    for (const l of LANGS) if (n[l]) loc[l] = n[l].replace(/[‎‏]/g, "").trim();
    named.push({ hip: f.id, i: starRows.length - 1, names: loc, con: n.c });
  }
}

const conInfo = Object.fromEntries(read("constellations.json").features.map((f) => [f.id, f]));
const constellations = read("constellations.lines.json").features.map((f) => {
  const info = conInfo[f.id];
  const loc = {};
  for (const l of LANGS) if (info.properties[l]) loc[l] = info.properties[l].replace(/ /g, " ");
  loc.en = info.properties.name; // official IAU (Latin) name, e.g. Gemini rather than "Twins"
  return {
    id: f.id,
    names: loc,
    rank: Number(info.properties.rank),
    center: [toRa(info.geometry.coordinates[0]), info.geometry.coordinates[1]],
    lines: f.geometry.coordinates.map((line) => line.map(([lon, lat]) => [toRa(lon), r(lat, 3)])),
  };
});

mkdirSync("public/data", { recursive: true });
writeFileSync(
  "public/data/sky.json",
  JSON.stringify({
    source: "d3-celestial (Hipparcos / HYG catalogue). RA/Dec in degrees, J2000. Distances (parsecs, 0 = unknown): HYG v4.1, CC BY-SA 4.0.",
    columns: ["ra", "dec", "mag", "bv", "dist_pc"],
    stars: starRows,
    named,
    constellations,
  }),
);
console.log(`stars: ${starRows.length}, named: ${named.length}, constellations: ${constellations.length}`);
