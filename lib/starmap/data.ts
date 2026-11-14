// Preset waypoints and timeline epochs for the Star Map.

export type Waypoint = {
  id: string;
  title: string;
  kind: string;
  /** J2000 coordinates (degrees). */
  ra: number;
  dec: number;
  description: string;
  significance: string;
  /** When it was first recorded, imaged or created. */
  date: string;
  color?: string;
  /** A Sky Explorer stop to step inside. */
  stop?: string;
  custom?: boolean;
};

export const PRESET_WAYPOINTS: Waypoint[] = [
  {
    id: "origin",
    title: "The origin",
    kind: "Reference point",
    ra: 0,
    dec: 0,
    description: "RA 0h, Dec 0°: where the Sun crosses the celestial equator heading north each March. Every coordinate on this map is measured from here.",
    significance: "The March equinox is the zero point of the sky's coordinate system, like Greenwich on Earth.",
    date: "Epoch J2000.0 (1 Jan 2000)",
  },
  {
    id: "m42",
    title: "Orion Nebula",
    kind: "Star-forming nebula",
    ra: 83.822,
    dec: -5.391,
    description: "A glowing cloud about 1,300 light-years away where hundreds of new stars are being born.",
    significance: "The nearest large stellar nursery, and full of the dust and ices SPHEREx studies.",
    date: "First recorded 1610",
    stop: "orion",
  },
  {
    id: "m31",
    title: "Andromeda Galaxy",
    kind: "Spiral galaxy",
    ra: 10.685,
    dec: 41.269,
    description: "Our nearest large neighbour galaxy, about 2.5 million light-years away.",
    significance: "The most distant object most people can see without a telescope.",
    date: "First recorded 964 CE",
  },
  {
    id: "m45",
    title: "The Pleiades",
    kind: "Open star cluster",
    ra: 56.75,
    dec: 24.117,
    description: "The Seven Sisters: a family of young, hot stars about 444 light-years away.",
    significance: "Known to cultures all over the world for thousands of years.",
    date: "Sketched by Galileo, 1610",
  },
  {
    id: "m1",
    title: "Crab Nebula",
    kind: "Supernova remnant",
    ra: 83.633,
    dec: 22.015,
    description: "The expanding wreckage of a star that exploded, with a spinning neutron star at its heart.",
    significance: "The explosion was bright enough to be seen in daylight on Earth.",
    date: "Supernova seen 1054 CE",
  },
  {
    id: "sgra",
    title: "Galactic centre",
    kind: "Supermassive black hole",
    ra: 266.417,
    dec: -29.008,
    description: "Sagittarius A*, a black hole about 4 million times the mass of the Sun, hidden behind thick dust.",
    significance: "The centre our whole galaxy orbits. Infrared light can see through the dust that blocks visible light.",
    date: "Radio source found 1974",
    stop: "milky-way",
  },
  {
    id: "nep",
    title: "North ecliptic pole",
    kind: "SPHEREx deep field",
    ra: 270,
    dec: 66.561,
    description: "The point directly above the plane of Earth's orbit, in the constellation Draco.",
    significance: "SPHEREx observes the sky around the ecliptic poles most often, building its deepest maps here.",
    date: "SPHEREx launched 11 Mar 2025",
  },
  {
    id: "sep",
    title: "South ecliptic pole",
    kind: "SPHEREx deep field",
    ra: 90,
    dec: -66.561,
    description: "The southern counterpart, close to the Large Magellanic Cloud.",
    significance: "SPHEREx's second deep field: repeated visits let it see fainter objects here than anywhere else.",
    date: "SPHEREx launched 11 Mar 2025",
  },
  {
    id: "lmc",
    title: "Large Magellanic Cloud",
    kind: "Satellite galaxy",
    ra: 80.894,
    dec: -69.756,
    description: "A small galaxy orbiting the Milky Way, about 160,000 light-years away.",
    significance: "Visible to the naked eye from the Southern Hemisphere as a detached piece of the Milky Way.",
    date: "Recorded 964 CE",
  },
  {
    id: "polaris",
    title: "Polaris",
    kind: "Pole star",
    ra: 37.955,
    dec: 89.264,
    description: "Today's North Star, less than a degree from the north celestial pole.",
    significance: "Drag the timeline: the pole wanders, and Polaris was not always the pole star.",
    date: "Pole star since the Middle Ages",
    stop: "polaris",
  },
  {
    id: "vega",
    title: "Vega",
    kind: "Bright star",
    ra: 279.235,
    dec: 38.784,
    description: "A brilliant blue-white star 25 light-years away.",
    significance: "Vega was the pole star around 12,000 BCE and will be again around 13,700 CE. It was also the first star ever photographed.",
    date: "First star photographed, 1850",
  },
  {
    id: "betelgeuse",
    title: "Betelgeuse",
    kind: "Red supergiant",
    ra: 88.793,
    dec: 7.407,
    description: "A dying giant star in Orion, hundreds of times wider than the Sun.",
    significance: "It dimmed dramatically in 2019–2020 after puffing out a cloud of dust.",
    date: "Great Dimming 2019–2020",
    stop: "betelgeuse",
  },
  {
    id: "sirius",
    title: "Sirius",
    kind: "Brightest star",
    ra: 101.287,
    dec: -16.716,
    description: "The brightest star in the night sky, 8.6 light-years away, with a white-dwarf companion.",
    significance: "Ancient Egyptians tracked its yearly return to time the flooding of the Nile.",
    date: "Companion Sirius B seen 1862",
    stop: "sirius",
  },
  {
    id: "etacar",
    title: "Eta Carinae",
    kind: "Unstable giant star",
    ra: 161.265,
    dec: -59.685,
    description: "One of the most massive stars known, wrapped in a dusty two-lobed nebula.",
    significance: "In the 1840s it briefly became the second-brightest star in the sky.",
    date: "Great Eruption 1843",
  },
];

export type Epoch = { label: string; year: number; note: string };

/** Snap points on the timeline (astronomical years: 0 = 1 BCE). */
export const EPOCHS: Epoch[] = [
  { label: "12,000 BCE", year: -11999, note: "Vega sits near the north celestial pole: it was the pole star." },
  { label: "3000 BCE", year: -2999, note: "Thuban in Draco is the pole star, around the time the first Egyptian pyramids were built." },
  { label: "1 CE", year: 1, note: "The equinox has drifted from Aries toward Pisces." },
  { label: "1609", year: 1609, note: "Galileo turns a telescope to the sky for the first time." },
  { label: "1900", year: 1900, note: "Photography is transforming astronomy." },
  { label: "Now", year: 0, note: "Today's sky. SPHEREx is mapping all of it in 102 colors." },
  { label: "3000 CE", year: 3000, note: "The pole drifts toward Gamma Cephei, the pole star around 4000 CE." },
  { label: "14,000 CE", year: 14000, note: "Vega is the pole star again." },
];
export const NOW_INDEX = 5;

/** The current date as a fractional year. */
export function currentYear() {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), 0, 1);
  return now.getUTCFullYear() + (now.getTime() - start) / (365.25 * 864e5);
}

export const epochYear = (e: Epoch) => (e.label === "Now" ? currentYear() : e.year);

/** Planet positions use JPL's simplified elements, so they're only shown within a few thousand years. */
export const planetsValid = (year: number) => year > -3000 && year < 3001;

export const PASTELS = ["#ffb3c7", "#ffd3a8", "#fff1a8", "#b8f0cf", "#a8e6ff", "#b9c4ff", "#d9b8ff", "#ffc2ec"];
