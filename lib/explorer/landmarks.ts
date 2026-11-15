export type PlanetKind = "earth" | "moon" | "mars" | "jupiter" | "saturn" | "mercury" | "venus" | "uranus" | "neptune";

/** Where a hotspot sits inside a sphere. */
export type HotspotAnchor =
  | { sky: [number, number] } // RA, Dec (degrees) on the celestial sphere
  | { body: [number, number] } // latitude, longitude (degrees) on the stop's planet or star; spins with it
  /** A named point the view provides: rings, cassini, sun, companion, limb, clouds, galaxy-centre, sun-marker, or fig-<hip> (a star of a 3D constellation). */
  | { anchor: string };

/** A small diamond marker that expands into an info card on hover. */
export type Hotspot = { title: string; body: string; at: HotspotAnchor; link?: string };

export type Landmark = {
  id: string;
  section: "Near Earth" | "Constellations" | "Solar System" | "Stars" | "Milky Way" | "Deep sky" | "Your waypoints";
  kind: "orbit" | "sky" | "constellation" | "planet" | "star" | "galaxy";
  title: string;
  subtitle: string;
  description: string;
  facts: [string, string][];
  spherex: string;
  /** Initial look direction (RA/Dec, degrees). Constellations use their catalogue center instead. */
  look?: [number, number];
  fov?: number;
  /** Constellation to highlight (IAU abbreviation as in the catalogue). */
  constellation?: string;
  planet?: PlanetKind;
  star?: { color: string; companion?: string };
  hotspots?: Hotspot[];
  /** Real SPHEREx DR1 imagery wrapped into the sphere, centred on ra/dec, `fov` degrees across. */
  patch?: { ra: number; dec: number; fov: number };
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
    hotspots: [
      { title: "Atmosphere", at: { anchor: "limb" }, body: "That thin blue glow is all the air we have. About 90% of it lies within 16 km of the ground." },
      { title: "Clouds", at: { anchor: "clouds" }, body: "Weather happens in the lowest layer of the atmosphere. SPHEREx flies far above it, so clouds never block its view." },
      { title: "The Sun", at: { anchor: "sun" }, body: "SPHEREx's cone-shaped shields block heat and light from the Sun and Earth, keeping its telescope cold enough to see faint infrared light." },
    ],
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
    hotspots: [
      { title: "The Pleiades", at: { sky: [56.75, 24.12] }, body: "The Seven Sisters: a cluster of young, hot stars about 444 light-years away, born together from the same cloud." },
      { title: "Andromeda Galaxy", at: { sky: [10.68, 41.27] }, body: "Our nearest big neighbor galaxy, about 2.5 million light-years away. It is the most distant thing most people can see without a telescope." },
    ],
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
    hotspots: [
      { title: "Rigel", at: { sky: [78.634, -8.202] }, body: "A blue supergiant about 860 light-years away, tens of thousands of times more luminous than the Sun." },
      { title: "Orion's Belt", at: { sky: [84.053, -1.202] }, body: "Alnitak, Alnilam and Mintaka: three bright stars in a row. Follow their line southeast to find Sirius, the brightest star in the sky." , link: "sirius" },
      { title: "Orion Nebula (M42)", at: { sky: [83.822, -5.391] }, body: "A stellar nursery about 1,300 light-years away where new stars are forming right now. You can see it as a fuzzy patch in Orion's sword." },
    ],
    patch: { ra: 83.8, dec: 0, fov: 40 },
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
    hotspots: [
      { title: "Pointer stars", at: { sky: [165.7, 59.1] }, body: "Draw a line from Merak through Dubhe and keep going about five times as far: you reach Polaris, the North Star.", link: "polaris" },
      { title: "Mizar & Alcor", at: { sky: [201.1, 54.95] }, body: "A famous naked-eye double star in the Dipper's handle, long used as an eyesight test." },
    ],
    patch: { ra: 170, dec: 56, fov: 46 },
  },
  {
    id: "scorpius",
    section: "Constellations",
    kind: "constellation",
    title: "Scorpius",
    subtitle: "Constellation · toward the galactic center",
    description:
      "A curling scorpion with the red supergiant Antares as its heart. Scorpius sits along the brightest part of the Milky Way, near the direction of our galaxy's center.",
    facts: [
      ["Heart", "Antares (red supergiant)"],
      ["Neighbours", "Sagittarius, Ophiuchus"],
      ["Best seen", "June to August"],
    ],
    spherex:
      "This crowded, dusty direction is prime territory for measuring ices in front of thousands of background stars.",
    constellation: "Sco",
    fov: 55,
    hotspots: [
      { title: "Antares", at: { sky: [247.35, -26.43] }, body: "A red supergiant whose name means \"rival of Mars\" because of its red color." },
      { title: "Toward the galactic center", at: { sky: [266.42, -29.0] }, body: "Just east of the scorpion's tail lies the center of our galaxy, hidden behind thick clouds of dust.", link: "milky-way" },
    ],
    patch: { ra: 252, dec: -30, fov: 40 },
  },
  {
    id: "crux",
    section: "Constellations",
    kind: "constellation",
    title: "Crux, the Southern Cross",
    subtitle: "Constellation · southern sky",
    description:
      "The smallest of the 88 constellations and one of the most famous. It appears on the flags of Australia, New Zealand, Brazil and others, and helps travelers find south.",
    facts: [
      ["Rank by size", "Smallest (88th)"],
      ["Next to", "the Coalsack dark nebula"],
      ["Points toward", "South celestial pole"],
    ],
    spherex: "Dark clouds like the Coalsack block visible light, but infrared light gets through.",
    constellation: "Cru",
    fov: 40,
    hotspots: [
      { title: "Acrux", at: { sky: [186.65, -63.1] }, body: "The brightest star in the Southern Cross. Through a telescope it splits into a multiple star system." },
      { title: "The Coalsack", at: { sky: [192.5, -62.5] }, body: "A dark cloud of dust about 600 light-years away that blocks the starlight behind it. Infrared light can shine through dust like this." },
    ],
    patch: { ra: 187, dec: -60, fov: 26 },
  },
  {
    id: "moon",
    section: "Solar System",
    kind: "planet",
    title: "The Moon",
    subtitle: "Earth's natural satellite",
    description:
      "Our nearest neighbor, about 384,000 km away. The same side always faces Earth. Look around and you'll find Earth hanging in the black sky.",
    facts: [
      ["Diameter", "3,474 km"],
      ["Distance", "≈ 384,400 km"],
      ["Light travel time", "≈ 1.3 seconds"],
    ],
    spherex: "Like SPHEREx, the Moon orbits Earth, but about 550 times farther out.",
    look: [70, 15],
    fov: 60,
    planet: "moon",
    hotspots: [
      { title: "Craters", at: { body: [30, 60] }, body: "With no air or weather to erase them, the Moon's craters record billions of years of impacts." },
      { title: "The Sun", at: { anchor: "sun" }, body: "Sunlight reaching the Moon left the Sun about 8 minutes ago. Moonlight is just reflected sunlight." },
    ],
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
    hotspots: [
      { title: "Polar ice cap", at: { body: [82, 0] }, body: "Water ice, topped in winter by a layer of frozen carbon dioxide (dry ice)." },
      { title: "Red dust", at: { body: [5, 200] }, body: "Iron-rich dust gives Mars its color: the planet is literally rusty." },
    ],
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
    hotspots: [
      { title: "Great Red Spot", at: { body: [-21.8, 126] }, body: "A storm wider than Earth that astronomers have watched for more than 150 years." },
      { title: "Cloud belts", at: { body: [18, 30] }, body: "Dark belts and light zones are bands of clouds pushed around by winds faster than 400 km/h." },
    ],
  },
  {
    id: "saturn",
    section: "Solar System",
    kind: "planet",
    title: "Saturn",
    subtitle: "Ringed gas giant · 6th from the Sun",
    description:
      "Saturn's rings stretch hundreds of thousands of kilometers wide but are mostly only tens of meters thick. They are made largely of chunks of water ice.",
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
    hotspots: [
      { title: "The rings", at: { anchor: "rings" }, body: "Billions of chunks of water ice, from grains of dust to pieces the size of houses, all orbiting Saturn." },
      { title: "Cassini Division", at: { anchor: "cassini" }, body: "A gap about 4,800 km wide between the two brightest rings, shaped by the gravity of Saturn's moon Mimas." },
    ],
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
    hotspots: [
      { title: "Sirius B", at: { anchor: "companion" }, body: "A white dwarf about the size of Earth but nearly as massive as the Sun. A teaspoon of it would weigh several tonnes." },
      { title: "Hot surface", at: { body: [20, 40] }, body: "Sirius's surface is close to 10,000 °C, nearly twice as hot as the Sun's, which is why it shines blue-white." },
    ],
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
    hotspots: [
      { title: "A pulsing star", at: { body: [15, 30] }, body: "Polaris is a Cepheid variable: it swells and shrinks slightly, brightening and dimming every few days." },
      { title: "Kochab & Pherkad", at: { sky: [225.0, 73.0] }, body: "The two \"guardians of the pole\" at the end of the Little Dipper's bowl, circling Polaris all night." },
    ],
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
    hotspots: [
      { title: "Boiling surface", at: { body: [20, 40] }, body: "Betelgeuse's surface churns with giant convection cells, vastly bigger than the ones on the Sun." },
      { title: "The Great Dimming", at: { body: [-35, 300] }, body: "In 2019–2020 a cloud of dust puffed out over its southern half, and the star dimmed by more than half." },
    ],
  },
  {
    id: "milky-way",
    section: "Milky Way",
    kind: "galaxy",
    title: "The Milky Way galaxy",
    subtitle: "Our home galaxy, seen from outside",
    description:
      "A barred spiral galaxy about 100,000 light-years across, holding hundreds of billions of stars. The Sun sits in a quiet spot about 26,000 light-years from the center. (Artist's model: no one has seen it from outside.)",
    facts: [
      ["Diameter", "≈ 100,000 light-years"],
      ["Stars", "100–400 billion"],
      ["Sun to center", "≈ 26,000 light-years"],
    ],
    spherex:
      "SPHEREx maps hundreds of millions of galaxies beyond our own to build a 3D map of the Universe.",
    look: [0, 0],
    fov: 70,
    hotspots: [
      { title: "Sagittarius A*", at: { anchor: "galaxy-centre" }, body: "A supermassive black hole at the galaxy's heart, about 4 million times the mass of the Sun." },
      { title: "The Sun's orbit", at: { anchor: "sun-marker" }, body: "The Sun and its planets take about 230 million years to circle the galactic center once.", link: "night-sky" },
    ],
  },
];

export const SECTIONS = ["Near Earth", "Constellations", "Solar System", "Stars", "Milky Way"] as const;

/** Planets and the Sun beyond the 14-stop tour, opened from the map. */
export const EXTRA_LANDMARKS: Landmark[] = [
  {
    id: "earth",
    section: "Solar System",
    kind: "planet",
    title: "Earth",
    subtitle: "Our home planet · third from the Sun",
    description:
      "The only world known to have life: a rocky planet wrapped in a thin layer of air, with about 71% of its surface covered by water. Drag to circle it, scroll to move closer or farther, and find the Moon and SPHEREx nearby. (The globe is an illustration. On the sky map, Earth is drawn opposite the Sun, where you'd see it from the Sun.)",
    facts: [
      ["Diameter", "12,742 km"],
      ["Distance from the Sun", "≈ 150 million km"],
      ["One day", "≈ 24 hours"],
      ["Moons", "1"],
    ],
    spherex: "SPHEREx circles Earth about 700 km up, over the poles, once every ~99 minutes, mapping the sky from above the air.",
    look: [0, 0],
    fov: 60,
    planet: "earth",
    hotspots: [
      { title: "Atmosphere", at: { anchor: "limb" }, body: "That thin blue glow is all the air we have. About 90% of it lies within 16 km of the ground." },
      { title: "Clouds", at: { anchor: "clouds" }, body: "Clouds cover about two-thirds of Earth at any moment. They reflect sunlight and help set the planet's temperature." },
      { title: "The Sun", at: { anchor: "sun" }, body: "Sunlight takes about 8 minutes and 20 seconds to reach Earth." },
    ],
  },
  {
    id: "sun",
    section: "Solar System",
    kind: "star",
    title: "The Sun",
    subtitle: "Our star · 8.3 light-minutes away",
    description:
      "An ordinary yellow star about 4.6 billion years old, and the source of almost all the energy on Earth. Over a million Earths would fit inside it.",
    facts: [
      ["Diameter", "≈ 1.39 million km"],
      ["Surface", "≈ 5,500 °C"],
      ["Light travel time", "≈ 8 min 20 s"],
    ],
    spherex: "SPHEREx's cone-shaped shields block the Sun's heat so its telescope stays cold enough to see faint infrared light.",
    look: [230, -15],
    fov: 60,
    star: { color: "#ffd98a" },
  },
  {
    id: "mercury",
    section: "Solar System",
    kind: "planet",
    title: "Mercury",
    subtitle: "Smallest planet · closest to the Sun",
    description: "A scorched, cratered world with almost no atmosphere. Days are hot enough to melt lead; nights are colder than −170 °C.",
    facts: [
      ["Diameter", "4,879 km"],
      ["Distance from Sun", "≈ 0.39 AU"],
      ["One year", "88 Earth days"],
    ],
    spherex:
      "Mercury never strays far from the Sun in our sky, while SPHEREx looks away from the Sun to stay cold, so Mercury is almost never in its view.",
    look: [210, -10],
    fov: 60,
    planet: "mercury",
  },
  {
    id: "venus",
    section: "Solar System",
    kind: "planet",
    title: "Venus",
    subtitle: "Earth's cloudy twin · 2nd from the Sun",
    description: "Almost the same size as Earth, but wrapped in thick clouds of sulfuric acid over a crushing, oven-hot carbon-dioxide atmosphere.",
    facts: [
      ["Diameter", "12,104 km"],
      ["Distance from Sun", "≈ 0.72 AU"],
      ["Surface", "≈ 465 °C"],
    ],
    spherex: "At a few infrared wavelengths, heat from Venus's surface glows through the clouds, letting scientists map what visible light can't see.",
    look: [200, -5],
    fov: 60,
    planet: "venus",
  },
  {
    id: "uranus",
    section: "Solar System",
    kind: "planet",
    title: "Uranus",
    subtitle: "Ice giant · tipped on its side",
    description: "An ice giant that rolls around the Sun on its side, tilted about 98°, so each pole gets 42 years of daylight then 42 years of night.",
    facts: [
      ["Diameter", "50,724 km"],
      ["Distance from Sun", "≈ 19.2 AU"],
      ["Tilt", "≈ 98°"],
    ],
    spherex: "Methane in Uranus's air absorbs red and infrared light, which is why the planet looks blue-green.",
    look: [55, 20],
    fov: 60,
    planet: "uranus",
  },
  {
    id: "neptune",
    section: "Solar System",
    kind: "planet",
    title: "Neptune",
    subtitle: "Ice giant · farthest planet",
    description: "A deep-blue ice giant with the fastest winds in the Solar System, roaring at up to about 2,000 km/h.",
    facts: [
      ["Diameter", "49,244 km"],
      ["Distance from Sun", "≈ 30.1 AU"],
      ["Found", "1846, predicted by math"],
    ],
    spherex:
      "Neptune was found by predicting where an unseen planet must be: the original 'Planet X' hunt, a story today's search for a distant ninth planet echoes.",
    look: [0, -2],
    fov: 60,
    planet: "neptune",
  },
];

// Views created on the fly (waypoints, constellations, stars) live here alongside the tour.
const registry = new Map<string, Landmark>(EXTRA_LANDMARKS.map((l) => [l.id, l]));
export function registerLandmark(lm: Landmark) {
  registry.set(lm.id, lm);
  return lm.id;
}

export const byId = (id: string) => LANDMARKS.find((l) => l.id === id) ?? registry.get(id);
