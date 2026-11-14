// Builds public/data/sky.json from the d3-celestial star catalog
// (Hipparcos/HYG-derived data, BSD-3-Clause). Run: npm run build:sky
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const SRC = "node_modules/d3-celestial/data";
const read = (f) => JSON.parse(readFileSync(`${SRC}/${f}`, "utf8"));
const LANGS = ["en", "es", "fr", "zh", "hi", "ar", "ja", "de", "ru"];
const MAG_LIMIT = 7.5;
const r = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const toRa = (lon) => r((lon + 360) % 360, 3);

const names = read("starnames.json");
const stars = read("stars.8.json")
  .features.filter((f) => f.properties.mag <= MAG_LIMIT)
  .sort((a, b) => a.properties.mag - b.properties.mag);

const starRows = [];
const named = [];
for (const f of stars) {
  const [lon, lat] = f.geometry.coordinates;
  const row = [toRa(lon), r(lat, 3), r(f.properties.mag), r(parseFloat(f.properties.bv) || 0.6)];
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
    source: "d3-celestial (Hipparcos / HYG catalogue). RA/Dec in degrees, J2000.",
    columns: ["ra", "dec", "mag", "bv"],
    stars: starRows,
    named,
    constellations,
  }),
);
console.log(`stars: ${starRows.length}, named: ${named.length}, constellations: ${constellations.length}`);
