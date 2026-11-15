/**
 * "Signal from the Dark": an optional rescue mission in the Sky Explorer.
 *
 * Commander Ada Reyes and the survey ship Wren are fiction. Everything else is real: the images are
 * SPHEREx data cut live from IRSA, star distances and positions come from the HYG/Hipparcos catalogue,
 * and planet positions and distances are computed from JPL orbital elements for today's date.
 */

export type StarInfo = { ra: number; dec: number; mag: number; ly: number | null };
export type PlanetInfo = { ra: number; dec: number; sunAU: number; earthAU: number };

export type MissionCtx = {
  star: (name: string) => StarInfo | null;
  planet: (name: string) => PlanetInfo | null;
  /** Wavelength (µm) of the single SPHEREx color on the map, if one is chosen. */
  bandUm: number | null;
  /** What the player read off for Betelgeuse, once they have. */
  reading: { ra: number; dec: number; offDeg: number } | null;
};

/** A real image to show with a line: a SPHEREx cutout centred on ra/dec, `fov` degrees across. */
export type Cut = { ra: number; dec: number; fov: number; caption: string };
export type Line = { text: string; image?: Cut; facts?: [string, string][] };

export type Check =
  | { kind: "click"; type: "star" | "planet"; name: string }
  | { kind: "report"; star: string }
  | { kind: "goto"; ra: number; dec: number; radius: number }
  | { kind: "band" }
  | { kind: "sphere"; stop: string };

export type MissionStep = {
  id: string;
  objective: string;
  hint: string;
  check: Check;
  /** A control to make glow while this objective is active. */
  glow?: string;
  intro: (c: MissionCtx) => Line[];
  success: (c: MissionCtx) => Line[];
};

const hms = (ra: number) => {
  const h = ra / 15, hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return mm === 60 ? `${hh + 1}h 00m` : `${hh}h ${String(mm).padStart(2, "0")}m`;
};
const dms = (d: number) => `${d < 0 ? "−" : "+"}${Math.abs(d).toFixed(1)}°`;
const lyText = (ly: number | null) => (ly ? `≈ ${Math.round(ly).toLocaleString()} light-years` : "unknown");
const fmt1 = (n: number) => n.toFixed(1);

/** The fuel cloud the commander transmits coordinates for (the Taurus Molecular Cloud). */
export const FUEL = { ra: 68.0, dec: 26.0 };

export const MISSION: MissionStep[] = [
  {
    id: "polaris",
    objective: "Find Polaris, the North Star",
    hint: "Polaris sits near the very top of the map (Dec ≈ +89°). Search for it with the magnifying glass, or zoom in up there, then click its name.",
    check: { kind: "click", type: "star", name: "Polaris" },
    intro: () => [
      { text: "…static… This is Commander Ada Reyes of the survey ship Wren. Can anyone hear me?" },
      { text: "We were following SPHEREx's sky maps to chase a lead on Planet X when our power failed, somewhere out past Neptune. Our navigation computer is dead." },
      { text: "Your screen shows the same SPHEREx sky we use. I need you to be my eyes. First, a navigation fix: find me Polaris." },
    ],
    success: (c) => {
      const s = c.star("Polaris");
      return [
        {
          text: "Polaris! It sits almost exactly above Earth's north pole, so it barely moves through the night. Sailors have steered by it for centuries.",
          image: s ? { ra: s.ra, dec: s.dec, fov: 2.5, caption: "SPHEREx · around Polaris" } : undefined,
          facts: s ? [["Distance", lyText(s.ly)], ["Position", `RA ${hms(s.ra)}, Dec ${dms(s.dec)}`]] : undefined,
        },
      ];
    },
  },
  {
    id: "betelgeuse",
    objective: "Read me Betelgeuse's coordinates",
    hint: "Search for Betelgeuse (or find Orion) and click it: that puts it in the middle of the map. The “Center J2000” line under the coordinate bar shows the RA and Dec of the middle. Type them in below.",
    check: { kind: "report", star: "Betelgeuse" },
    intro: () => [
      { text: "Next: my star tracker has locked onto a red giant, but its readout is fried. It must be Betelgeuse, Orion's shoulder." },
      { text: "Find it, put it in the middle of your map, and read me its coordinates: right ascension (RA) and declination (Dec). They're the sky's longitude and latitude." },
    ],
    success: (c) => {
      const s = c.star("Betelgeuse");
      const r = c.reading;
      return [
        {
          text: "Locked on. Betelgeuse is a red supergiant: put it where our Sun is and it would swallow the orbits of Mercury, Venus, Earth and Mars.",
          image: s ? { ra: s.ra, dec: s.dec, fov: 3, caption: "SPHEREx · Betelgeuse in infrared" } : undefined,
          facts: [
            ...(s ? ([["Catalogue position", `RA ${hms(s.ra)}, Dec ${dms(s.dec)}`], ["Distance", lyText(s.ly)]] as [string, string][]) : []),
            ...(r ? ([["Your reading was off by", `${fmt1(r.offDeg)}°`]] as [string, string][]) : []),
          ],
        },
      ];
    },
  },
  {
    id: "fuel",
    objective: "Jump to RA 4h 32m, Dec +26° with the coordinate bar",
    hint: "Click the “RA / Dec” box at the top left, type 4h32m +26, and press Go.",
    check: { kind: "goto", ra: FUEL.ra, dec: FUEL.dec, radius: 3 },
    glow: ".mv-coord-form",
    intro: () => [
      { text: "Bad news: a micrometeorite cracked our water tanks, and water is our fuel." },
      { text: "Out here, water is frozen onto dust in cold clouds, and SPHEREx maps exactly where. My chart shows one at RA 4h 32m, Dec +26°." },
      { text: "Type those coordinates into the coordinate bar at the top left and jump there." },
    ],
    success: () => [
      {
        text: "That's it: the Taurus Molecular Cloud, about 450 light-years away. New stars like our Sun are being born inside it.",
        image: { ra: FUEL.ra, dec: FUEL.dec, fov: 8, caption: "SPHEREx · Taurus Molecular Cloud" },
        facts: [
          ["Ices inside", "water, carbon dioxide, carbon monoxide"],
          ["Why SPHEREx cares", "its ice survey measures them in millions of stars' light"],
        ],
      },
    ],
  },
  {
    id: "infrared",
    objective: "Switch the map to a single SPHEREx color",
    hint: "In the Overview panel (top right), press Isolate infrared or one of the µm buttons.",
    check: { kind: "band" },
    glow: ".mv-minicard",
    intro: () => [
      { text: "To see the ice, we need to look the way SPHEREx does: in infrared. Pick a single SPHEREx color in the Overview panel." },
      { text: "Water ice soaks up light near 3 micrometers. Every one of SPHEREx's 102 colors shows the cloud a little differently." },
    ],
    success: (c) => [
      {
        text: "There, see how the dust looks different in just one color? Stacked together, those 102 colors tell SPHEREx how much ice is in the way. Tanks are filling. Thank you!",
        facts: c.bandUm ? [["Color you picked", `${c.bandUm.toFixed(2)} µm (infrared)`], ["SPHEREx range", "0.75 – 5.0 µm in 102 colors"]] : [["SPHEREx range", "0.75 – 5.0 µm in 102 colors"]],
      },
    ],
  },
  {
    id: "neptune",
    objective: "Find Neptune, our last beacon ping",
    hint: "Planets are labeled on the map. Search for Neptune if you can't spot it, then click its name.",
    check: { kind: "click", type: "planet", name: "Neptune" },
    intro: () => [
      { text: "We have fuel, but we're drifting. Our last beacon ping came from near Neptune." },
      { text: "Neptune is on your map right now, among the stars. Find it and click it." },
    ],
    success: (c) => {
      const n = c.planet("Neptune");
      return [
        {
          text: "There it is. Neptune is where your map says it is today, worked out from its real orbit.",
          image: n ? { ra: n.ra, dec: n.dec, fov: 6, caption: "SPHEREx · Neptune's patch of sky" } : undefined,
          facts: n
            ? [
                ["Distance from the Sun", `${fmt1(n.sunAU)} AU`],
                ["Its light reaches Earth in", `${fmt1((n.earthAU * 499) / 3600)} hours`],
              ]
            : undefined,
        },
        { text: "Between SPHEREx's six-month passes, Neptune shifts against the stars. A hidden Planet X, much farther out, would shift too, just less. That's how you'd catch one." },
      ];
    },
  },
  {
    id: "rescue",
    objective: "Step inside Neptune's 360° view to reach the Wren",
    hint: "Click Neptune again (or its View in 360° button) once you've arrived.",
    check: { kind: "sphere", stop: "neptune" },
    intro: () => [{ text: "We're in orbit around it. Step inside Neptune's 360° view and you'll find us." }],
    success: () => [
      { text: "Wren to Earth: we see you! Navigation's back, tanks are full, and we're coming home." },
      { text: "You navigated by the stars, read real coordinates, found fuel with SPHEREx data and tracked us past Neptune. Thank you, explorer." },
    ],
  },
];
