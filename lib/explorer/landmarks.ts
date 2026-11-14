export type PlanetKind = "earth" | "moon" | "mars" | "jupiter" | "saturn";

export type Landmark = {
  id: string;
  section: "Near Earth" | "Constellations" | "Solar System" | "Stars" | "Milky Way";
  kind: "orbit" | "sky" | "constellation" | "planet" | "star" | "galaxy";
  title: string;
  subtitle: string;
  description: string;
  facts: [string, string][];
  spherex: string;
  /** Initial look direction (RA/Dec, degrees). Constellations use their catalogue centre instead. */
  look?: [number, number];
  fov?: number;
  /** Constellation to highlight (IAU abbreviation as in the catalogue). */
  constellation?: string;
  planet?: PlanetKind;
  star?: { color: string; companion?: string };
};

// The tour runs outward from Earth: each stop is a "sphere" you can step into and look around.
export const LANDMARKS: Landmark[] = [
  {
    id: "spherex-orbit",
    section: "Near Earth",
    kind: "orbit",
    title: "SPHEREx's view of Earth",
    subtitle: "Low Earth orbit · about 700 km up",
    description:
      "This is home base for NASA's SPHEREx telescope. It circles Earth in a polar, sun-synchronous orbit, scanning strips of sky as it goes. Turn around to see the stars it is mapping.",
    facts: [
      ["Altitude", "≈ 700 km"],
      ["One orbit", "≈ 99 minutes"],
      ["Launched", "March 11, 2025"],
      ["Full-sky map", "every ~6 months"],
    ],
    spherex: "SPHEREx splits the light of every point on the sky into 102 infrared colors.",
    look: [0, 0],
    fov: 75,
    planet: "earth",
  },
  {
    id: "night-sky",
    section: "Near Earth",
    kind: "sky",
    title: "The night sky",
    subtitle: "Every star brighter than magnitude 7.5",
    description:
      "Each dot is a real star from the Hipparcos catalogue, placed at its true position and colored by its temperature. Faint lines join the 88 official constellations. The glowing band is the Milky Way.",
    facts: [
      ["Stars shown", "≈ 25,700"],
      ["Constellations", "88"],
      ["Data", "Hipparcos / HYG catalogue"],
      ["Coordinates", "RA/Dec, J2000"],
    ],
    spherex: "SPHEREx maps this entire sphere, not just the stars you can see, in 102 infrared colors.",
    look: [85, 0],
    fov: 95,
  },
  {
    id: "orion",
    section: "Constellations",
    kind: "constellation",
    title: "Orion, the Hunter",
    subtitle: "Constellation · best seen December to March",
    description:
      "One of the most recognizable patterns in the sky, visible from almost everywhere on Earth. Three stars make his belt, red Betelgeuse is his shoulder and blue-white Rigel is his foot.",
    facts: [
      ["Brightest stars", "Rigel, Betelgeuse"],
      ["Belt", "Alnitak, Alnilam, Mintaka"],
      ["Famous nebula", "Orion Nebula (M42)"],
    ],
    spherex:
      "Orion's star-forming clouds are full of dust and frozen molecules: exactly the ices SPHEREx is surveying.",
    constellation: "Ori",
    fov: 55,
  },
  {
    id: "ursa-major",
    section: "Constellations",
    kind: "constellation",
    title: "Ursa Major & the Big Dipper",
    subtitle: "Constellation · northern sky",
    description:
      "The Great Bear contains the Big Dipper, seven bright stars shaped like a ladle. Follow the two stars at the end of the bowl and they point to Polaris, the North Star.",
    facts: [
      ["Pointer stars", "Dubhe & Merak"],
      ["Size", "3rd largest constellation"],
      ["Points to", "Polaris"],
    ],
    spherex:
      "SPHEREx revisits the sky near the ecliptic poles most often. The north ecliptic pole lies just next door, in Draco.",
    constellation: "UMa",
    fov: 70,
  },
  {
    id: "scorpius",
    section: "Constellations",
    kind: "constellation",
    title: "Scorpius",
    subtitle: "Constellation · toward the galactic centre",
    description:
      "A curling scorpion with the red supergiant Antares as its heart. Scorpius sits along the brightest part of the Milky Way, near the direction of our galaxy's centre.",
    facts: [
      ["Heart", "Antares (red supergiant)"],
      ["Neighbours", "Sagittarius, Ophiuchus"],
      ["Best seen", "June to August"],
    ],
    spherex:
      "This crowded, dusty direction is prime territory for measuring ices in front of thousands of background stars.",
    constellation: "Sco",
    fov: 55,
  },
  {
    id: "crux",
    section: "Constellations",
    kind: "constellation",
    title: "Crux, the Southern Cross",
    subtitle: "Constellation · southern sky",
    description:
      "The smallest of the 88 constellations and one of the most famous. It appears on the flags of Australia, New Zealand, Brazil and others, and helps travellers find south.",
    facts: [
      ["Rank by size", "Smallest (88th)"],
      ["Next to", "the Coalsack dark nebula"],
      ["Points toward", "South celestial pole"],
    ],
    spherex: "Dark clouds like the Coalsack block visible light, but infrared light gets through.",
    constellation: "Cru",
    fov: 40,
  },
  {
    id: "moon",
    section: "Solar System",
    kind: "planet",
    title: "The Moon",
    subtitle: "Earth's natural satellite",
    description:
      "Our nearest neighbour, about 384,000 km away. The same side always faces Earth. Look around and you'll find Earth hanging in the black sky.",
    facts: [
      ["Diameter", "3,474 km"],
      ["Distance", "≈ 384,400 km"],
      ["Light travel time", "≈ 1.3 seconds"],
    ],
    spherex: "Like SPHEREx, the Moon orbits Earth, but about 550 times farther out.",
    look: [70, 15],
    fov: 60,
    planet: "moon",
  },
  {
    id: "mars",
    section: "Solar System",
    kind: "planet",
    title: "Mars",
    subtitle: "The red planet · 4th from the Sun",
    description:
      "A cold desert world colored by iron oxide dust, with polar ice caps, giant volcanoes and canyons longer than any on Earth.",
    facts: [
      ["Diameter", "6,779 km"],
      ["Distance from Sun", "≈ 1.52 AU"],
      ["Day length", "24 h 37 min"],
    ],
    spherex:
      "SPHEREx's all-sky scans also catch solar-system objects like asteroids and comets, measuring their infrared colors.",
    look: [120, 0],
    fov: 60,
    planet: "mars",
  },
  {
    id: "jupiter",
    section: "Solar System",
    kind: "planet",
    title: "Jupiter",
    subtitle: "Gas giant · largest planet",
    description:
      "More than twice as massive as all the other planets combined. Its colored cloud bands and the Great Red Spot, a storm wider than Earth, swirl in its atmosphere.",
    facts: [
      ["Diameter", "139,820 km"],
      ["Distance from Sun", "≈ 5.2 AU"],
      ["Famous storm", "Great Red Spot"],
    ],
    spherex: "Behind Jupiter: the Pleiades star cluster in Taurus, one of the many fields SPHEREx sweeps across.",
    look: [56.8, 24],
    fov: 60,
    planet: "jupiter",
  },
  {
    id: "saturn",
    section: "Solar System",
    kind: "planet",
    title: "Saturn",
    subtitle: "Ringed gas giant · 6th from the Sun",
    description:
      "Saturn's rings stretch hundreds of thousands of kilometres wide but are mostly only tens of metres thick. They are made largely of chunks of water ice.",
    facts: [
      ["Diameter", "116,460 km"],
      ["Distance from Sun", "≈ 9.5 AU"],
      ["Rings made of", "mostly water ice"],
    ],
    spherex:
      "Water ice absorbs infrared light near 3 µm. SPHEREx looks for this same fingerprint in clouds across our galaxy.",
    look: [280, -20],
    fov: 60,
    planet: "saturn",
  },
  {
    id: "sirius",
    section: "Stars",
    kind: "star",
    title: "Sirius",
    subtitle: "Brightest star in the night sky · 8.6 light-years",
    description:
      "A hot blue-white star about twice the mass of the Sun and some 25 times more luminous. It has a faint companion, Sirius B, a white dwarf: the leftover core of a dead star.",
    facts: [
      ["Distance", "8.6 light-years"],
      ["Brightness", "magnitude −1.46"],
      ["Constellation", "Canis Major"],
    ],
    spherex: "SPHEREx measures the infrared spectra of more than 100 million stars like this one in our galaxy.",
    look: [101.287, -16.716],
    fov: 60,
    constellation: "CMa",
    star: { color: "#cfdcff", companion: "Sirius B (white dwarf)" },
  },
  {
    id: "polaris",
    section: "Stars",
    kind: "star",
    title: "Polaris, the North Star",
    subtitle: "Yellow supergiant · about 430 light-years",
    description:
      "Polaris sits less than one degree from the north celestial pole, so it barely moves as the sky turns. It is a pulsating Cepheid variable star.",
    facts: [
      ["Distance", "≈ 430 light-years"],
      ["Type", "Yellow supergiant, Cepheid"],
      ["Constellation", "Ursa Minor"],
    ],
    spherex: "Cepheids like Polaris helped astronomers measure distances across the Universe.",
    look: [37.95, 89.26],
    fov: 60,
    constellation: "UMi",
    star: { color: "#fff0d2" },
  },
  {
    id: "betelgeuse",
    section: "Stars",
    kind: "star",
    title: "Betelgeuse",
    subtitle: "Red supergiant · roughly 550 light-years",
    description:
      "A dying giant star so large that, put in place of the Sun, it would reach beyond the orbit of Mars. In 2019–2020 it dimmed dramatically after puffing out a cloud of dust.",
    facts: [
      ["Distance", "≈ 550 light-years (uncertain)"],
      ["Size", "hundreds of times the Sun"],
      ["Constellation", "Orion"],
    ],
    spherex: "Dust made by dying stars like Betelgeuse seeds the clouds where new stars, and ices, form.",
    look: [88.793, 7.407],
    fov: 60,
    constellation: "Ori",
    star: { color: "#ff9a5c" },
  },
  {
    id: "milky-way",
    section: "Milky Way",
    kind: "galaxy",
    title: "The Milky Way galaxy",
    subtitle: "Our home galaxy, seen from outside",
    description:
      "A barred spiral galaxy about 100,000 light-years across, holding hundreds of billions of stars. The Sun sits in a quiet spot about 26,000 light-years from the centre. (Artist's model: no one has seen it from outside.)",
    facts: [
      ["Diameter", "≈ 100,000 light-years"],
      ["Stars", "100–400 billion"],
      ["Sun to centre", "≈ 26,000 light-years"],
    ],
    spherex:
      "SPHEREx maps hundreds of millions of galaxies beyond our own to build a 3D map of the Universe.",
    look: [0, 0],
    fov: 70,
  },
];

export const SECTIONS = ["Near Earth", "Constellations", "Solar System", "Stars", "Milky Way"] as const;

export const byId = (id: string) => LANDMARKS.find((l) => l.id === id);
