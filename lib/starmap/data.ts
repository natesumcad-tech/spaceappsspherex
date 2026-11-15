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
    stop: "night-sky",
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
    description: "Our nearest large neighbor galaxy, about 2.5 million light-years away.",
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
    title: "Galactic center",
    kind: "Supermassive black hole",
    ra: 266.417,
    dec: -29.008,
    description: "Sagittarius A*, a black hole about 4 million times the mass of the Sun, hidden behind thick dust.",
    significance: "The center our whole galaxy orbits. Infrared light can see through the dust that blocks visible light.",
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
    stop: "spherex-orbit",
    significance:
      "SPHEREx observes around the ecliptic poles most often, building its deepest maps here. This patch is blank in the DR1 all-sky map; IRSA serves the deep-field images as a separate collection (spherex_dr1_deep).",
    date: "SPHEREx launched 11 Mar 2025",
  },
  {
    id: "sep",
    title: "South ecliptic pole",
    kind: "SPHEREx deep field",
    ra: 90,
    dec: -66.561,
    description: "The southern counterpart, close to the Large Magellanic Cloud.",
    significance:
      "SPHEREx's second deep field, visited again and again to see fainter objects. The dark oval here is real: it's blank in the DR1 all-sky map, and IRSA serves the deep-field images separately (spherex_dr1_deep).",
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

// Three more waypoints so every constellation stop can be reached from the map
PRESET_WAYPOINTS.push(
  {
    id: "dipper",
    title: "The Big Dipper",
    kind: "Asterism in Ursa Major",
    ra: 178.457,
    dec: 53.695,
    description: "Seven bright stars shaped like a ladle, part of the Great Bear.",
    significance: "Its two end stars point to Polaris, which has guided travelers for centuries.",
    date: "Recognized since antiquity",
    stop: "ursa-major",
  },
  {
    id: "antares",
    title: "Antares",
    kind: "Red supergiant",
    ra: 247.352,
    dec: -26.432,
    description: "The red heart of Scorpius, a giant star hundreds of times wider than the Sun.",
    significance: "Its name means \"rival of Mars\" for its color. It sits beside dusty star-forming clouds.",
    date: "Named by ancient Greek astronomers",
    stop: "scorpius",
  },
  {
    id: "crux",
    title: "The Southern Cross",
    kind: "Constellation",
    ra: 187.2,
    dec: -60.0,
    description: "The smallest constellation, and one of the most famous in the southern sky.",
    significance: "It points toward the south celestial pole, and appears on several national flags.",
    date: "Charted as its own constellation in the late 1500s",
    stop: "crux",
  },
);

// More notable places: nebulae, galaxies, clusters and dark clouds
PRESET_WAYPOINTS.push(
  { id: "m57", title: "Ring Nebula", kind: "Planetary nebula", ra: 283.396, dec: 33.029, description: "A glowing ring of gas puffed off by a dying Sun-like star, about 2,300 light-years away.", significance: "A preview of the Sun's own fate, billions of years from now.", date: "Discovered 1779" },
  { id: "m51", title: "Whirlpool Galaxy", kind: "Interacting spiral galaxy", ra: 202.47, dec: 47.195, description: "A face-on spiral galaxy about 23 million light-years away, tugging on a smaller companion.", significance: "Its spiral arms were the first ever seen in a galaxy, sketched by Lord Rosse in 1845.", date: "Discovered by Messier, 1773" },
  { id: "m33", title: "Triangulum Galaxy", kind: "Spiral galaxy", ra: 23.462, dec: 30.66, description: "The third-largest galaxy in our Local Group, about 2.7 million light-years away.", significance: "Under very dark skies it is one of the most distant things you can see without a telescope.", date: "Catalogued by Messier, 1764" },
  { id: "m8", title: "Lagoon Nebula", kind: "Star-forming nebula", ra: 270.904, dec: -24.387, description: "A huge cloud of glowing gas where new stars are forming, about 4,000 light-years away in Sagittarius.", significance: "Under dark skies it shows as a hazy patch to the naked eye.", date: "Catalogued by Messier, 1764" },
  { id: "m16", title: "Eagle Nebula", kind: "Star-forming nebula", ra: 274.7, dec: -13.807, description: "A young star cluster still wrapped in the cloud it formed from, about 7,000 light-years away.", significance: "Home of the Pillars of Creation, made famous by the Hubble Space Telescope in 1995.", date: "Discovered 1745–46" },
  { id: "m20", title: "Trifid Nebula", kind: "Nebula", ra: 270.675, dec: -22.971, description: "A nebula split into three lobes by dark dust lanes, about 4,000–5,000 light-years away.", significance: "It combines a glowing red nebula, a blue reflection nebula and dark dust in one view.", date: "Catalogued by Messier, 1764" },
  { id: "helix", title: "Helix Nebula", kind: "Planetary nebula", ra: 337.411, dec: -20.837, description: "One of the closest planetary nebulae, about 650 light-years away: the shed outer layers of a dying star.", significance: "On the sky it spans about half the width of the full Moon.", date: "Discovered before 1824" },
  { id: "omegacen", title: "Omega Centauri", kind: "Globular cluster", ra: 201.697, dec: -47.48, description: "The biggest globular cluster of the Milky Way, packing about 10 million stars, some 17,000 light-years away.", significance: "It may be the leftover core of a small galaxy the Milky Way swallowed.", date: "Listed as a star by Ptolemy, c. 150 CE" },
  { id: "47tuc", title: "47 Tucanae", kind: "Globular cluster", ra: 6.024, dec: -72.081, description: "A dense ball of very old stars about 15,000 light-years away, beside the Small Magellanic Cloud on the sky.", significance: "The second-brightest globular cluster in the sky.", date: "Catalogued by Lacaille, 1751" },
  { id: "smc", title: "Small Magellanic Cloud", kind: "Satellite galaxy", ra: 13.187, dec: -72.829, description: "A dwarf galaxy orbiting the Milky Way, about 200,000 light-years away.", significance: "It is being stretched by the gravity of the Milky Way and the Large Magellanic Cloud.", date: "Known to southern-hemisphere peoples for millennia" },
  { id: "m44", title: "Beehive Cluster", kind: "Open star cluster", ra: 130.1, dec: 19.67, description: "A swarm of about 1,000 stars roughly 600 light-years away in Cancer.", significance: "Galileo saw it break up into stars with one of the first telescopes, in 1610.", date: "Known since antiquity" },
  { id: "m13", title: "Hercules Cluster", kind: "Globular cluster", ra: 250.423, dec: 36.461, description: "Several hundred thousand stars packed into a ball about 22,000 light-years away.", significance: "In 1974 the Arecibo radio telescope beamed a message toward it.", date: "Discovered by Halley, 1714" },
  { id: "m104", title: "Sombrero Galaxy", kind: "Spiral galaxy", ra: 189.998, dec: -11.623, description: "An edge-on spiral galaxy with a bright bulge and a dark dust lane, about 30 million light-years away.", significance: "Its dust lane glows in infrared light, showing where its stars are forming.", date: "Discovered by Méchain, 1781" },
  { id: "m101", title: "Pinwheel Galaxy", kind: "Spiral galaxy", ra: 210.802, dec: 54.349, description: "A big face-on spiral galaxy about 21 million light-years away.", significance: "IRSA's SPHEREx tutorials use M101 to map glowing dust at 3.3 µm across its spiral arms.", date: "Discovered by Méchain, 1781" },
  { id: "rhooph", title: "Rho Ophiuchi clouds", kind: "Molecular cloud", ra: 246.8, dec: -24.4, description: "One of the closest star-forming clouds to Earth, about 450 light-years away.", significance: "Its dense, cold cores are full of ices: a key kind of target for SPHEREx's ice survey.", date: "Named for the star Rho Ophiuchi" },
  { id: "taurusmc", title: "Taurus Molecular Cloud", kind: "Molecular cloud", ra: 68.0, dec: 26.0, description: "A dark, dusty cloud about 450 light-years away where low-mass stars like the Sun are forming.", significance: "Starlight shining through it reveals frozen water and CO₂: exactly the ices SPHEREx measures.", date: "Dark clouds charted by Barnard, early 1900s" },
  { id: "ngc7000", title: "North America Nebula", kind: "Emission nebula", ra: 314.75, dec: 44.33, description: "A glowing cloud shaped like the North American continent, about 2,200 light-years away in Cygnus.", significance: "Dark dust lanes form its 'Gulf of Mexico'; infrared light sees through them.", date: "Discovered by William Herschel, 1786" },
  { id: "rosette", title: "Rosette Nebula", kind: "Emission nebula", ra: 97.98, dec: 4.95, description: "A rose-shaped cloud around a young star cluster, about 5,000 light-years away.", significance: "Winds from its hot young stars have blown a hollow in its center.", date: "Catalogued in the 1800s" },
  { id: "horsehead", title: "Horsehead Nebula", kind: "Dark nebula", ra: 85.245, dec: -2.458, description: "A dark cloud of dust shaped like a horse's head, about 1,400 light-years away in Orion.", significance: "Dark in visible light, its dust glows in the infrared.", date: "Spotted on a photograph by Williamina Fleming, 1888" },
  { id: "cena", title: "Centaurus A", kind: "Active galaxy", ra: 201.365, dec: -43.019, description: "A giant galaxy about 12 million light-years away, crossed by a dusty band and powered by a supermassive black hole.", significance: "It is probably the result of two galaxies merging.", date: "Discovered by James Dunlop, 1826" },
  { id: "cygx1", title: "Cygnus X-1", kind: "Black hole system", ra: 299.59, dec: 35.202, description: "A black hole about 21 times the Sun's mass pulling gas from a giant companion star, about 7,000 light-years away.", significance: "The first object widely accepted as a black hole.", date: "X-ray source found 1964" },
  { id: "barnard", title: "Barnard's Star", kind: "Red dwarf star", ra: 269.452, dec: 4.693, description: "A small red dwarf just 6 light-years away, too faint to see without a telescope.", significance: "It moves across our sky faster than any other star.", date: "Motion measured by Barnard, 1916" },
);

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
