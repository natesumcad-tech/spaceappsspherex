// ─────────────────────────────────────────────────────────────
//  The site's text: project description, mission facts, sources and credits.
// ─────────────────────────────────────────────────────────────

export const site = {
  projectName: "Sky Explorer",
  tagline:
    "Step inside the sky NASA's SPHEREx is mapping: real stars, planets and the Milky Way in 360°.",
  event: "NASA Space Apps Challenge",
};

export const project = {
  challenge: "Planet X & SPHEREx",
  problem:
    "SPHEREx is mapping the entire sky in 102 infrared colors, but its data lives in archives built for astronomers. Most people never get to see what it is exploring, or why it matters.",
  solution:
    "Sky Explorer: a Google Maps-style map of the whole sky, streamed live from SPHEREx's real infrared data. Fly over it in 2D or 3D, switch between SPHEREx's 102 colors, step into 360° views of planets and constellations at their real distances, and blink two real SPHEREx passes taken six months apart to catch things that move: the same method you'd use to hunt for a Planet X.",
  howItWorks: [
    "Fly over the whole sky, streamed live from SPHEREx data at NASA/IPAC IRSA, from a single star out to the entire Milky Way",
    "Switch SPHEREx colors, jump to exact RA/Dec coordinates, and blink real exposures six months apart to spot moving objects",
    "Step into 360° views of planets, stars and constellations, and fly through them in 3D",
    "Learn by doing: a one-minute tour, an AI sky guide, and an optional rescue mission that teaches coordinates with real data",
  ],
  tools: ["Next.js", "three.js", "TypeScript", "Vercel", "SPHEREx DR1 (IRSA)", "HYG star catalogue", "JPL orbital elements", "SIMBAD", "Google Gemini"],
};

export const mission = {
  stats: [
    { value: "102", label: "infrared colors (spectral bands)" },
    { value: "0.75–5 µm", label: "wavelength coverage" },
    { value: "Every 6 mo", label: "full map of the sky" },
    { value: "450M+", label: "galaxies to be measured" },
  ],
  goals: [
    {
      title: "The first moments of the Universe",
      body: "By mapping the 3D positions of hundreds of millions of galaxies, SPHEREx looks for faint patterns left by cosmic inflation, the burst of expansion in the first fraction of a second after the Big Bang.",
    },
    {
      title: "The history of galaxies",
      body: "SPHEREx measures the total glow of all galaxies, including ones too faint to see on their own, to trace how much light galaxies have made across cosmic time.",
    },
    {
      title: "Water and ice in our galaxy",
      body: "Spectra of millions of stars behind dusty clouds reveal frozen water, carbon dioxide and other ices, which are ingredients for planets and possibly for life.",
    },
  ],
  facts: [
    ["Full name", "Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer"],
    ["Launched", "March 11, 2025 on a SpaceX Falcon 9 from Vandenberg Space Force Base"],
    ["Orbit", "Sun-synchronous polar orbit, about 700 km above Earth"],
    ["Telescope", "20 cm aperture, passively cooled behind three cone-shaped photon shields"],
    ["Survey", "Four all-sky maps over a two-year prime mission"],
    ["Managed by", "NASA JPL, with Caltech leading the science"],
  ],
};

export const resources = [
  { title: "SPHEREx mission page", url: "https://science.nasa.gov/mission/spherex/", note: "NASA Science" },
  { title: "SPHEREx at JPL", url: "https://www.jpl.nasa.gov/missions/spherex/", note: "Mission news & images" },
  { title: "SPHEREx data at IRSA", url: "https://irsa.ipac.caltech.edu/Missions/spherex.html", note: "Public data archive" },
  { title: "SPHEREx science team", url: "https://spherex.caltech.edu/", note: "Caltech" },
  { title: "NASA Space Apps Challenge", url: "https://www.spaceappschallenge.org/", note: "Hackathon home" },
];

/** Data sources, software and acknowledgments (shown in the Credits section). */
export const credits: { title: string; text: string; url?: string }[] = [
  {
    title: "SPHEREx",
    url: "https://science.nasa.gov/mission/spherex/",
    text: "This project uses data products from the Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx), a joint project of the Jet Propulsion Laboratory and the California Institute of Technology, funded by NASA. Images: SPHEREx Data Release 1 all-sky maps and Level 2 exposures.",
  },
  {
    title: "NASA/IPAC Infrared Science Archive (IRSA)",
    url: "https://irsa.ipac.caltech.edu/",
    text: "This research has made use of the NASA/IPAC Infrared Science Archive, which is funded by NASA and operated by the California Institute of Technology. All SPHEREx, 2MASS, Spitzer and MSX imagery is streamed from IRSA.",
  },
  {
    title: "2MASS, Spitzer and MSX",
    text: "2MASS is a joint project of the University of Massachusetts and IPAC/Caltech, funded by NASA and NSF. Spitzer was operated by JPL/Caltech for NASA. MSX data from the Midcourse Space Experiment, via IRSA.",
  },
  {
    title: "HYG star database v4.1",
    url: "https://github.com/astronexus/HYG-Database",
    text: "Star names, positions and distances by David Nash (astronexus), CC BY-SA 4.0. Derived from Hipparcos, Yale Bright Star and Gliese catalogues.",
  },
  {
    title: "d3-celestial",
    url: "https://github.com/ofrohn/d3-celestial",
    text: "Constellation lines and star catalogue data by Olaf Frohn, BSD-3-Clause license.",
  },
  {
    title: "SIMBAD",
    url: "https://simbad.cds.unistra.fr/",
    text: "This research has made use of the SIMBAD database, operated at CDS, Strasbourg, France (used by the sky guide to identify objects).",
  },
  {
    title: "Planet positions",
    text: "Computed from JPL's approximate Keplerian orbital elements (E. M. Standish). Good to a few arcminutes, so planet markers are drawn as rings.",
  },
  {
    title: "What's illustrated",
    text: "Planet and star surfaces in 360° views, Earth's globe, and the Milky Way's overall shape are illustrations, not photographs. Commander Ada Reyes and her ship in the rescue mission are fiction; every image and number she shows is real data.",
  },
  {
    title: "Software",
    text: "Built with Next.js, React, three.js and TypeScript, hosted on Vercel.",
  },
];

/** How AI was used to build and run the project (disclosed per Space Apps rules). */
export const aiUse: { title: string; text: string }[] = [
  {
    title: "Coding assistant",
    text: "Much of the code was built with help from an AI coding assistant (Anthropic's Claude), with the design directed and the results reviewed and tested by hand.",
  },
  {
    title: "Sky guide",
    text: "The in-app sky guide answers questions with Google Gemini, grounded in NASA reference text and SIMBAD lookups. Its answers can be wrong, and it says so.",
  },
  {
    title: "Data stays real",
    text: "No images or measurements are AI-generated. Every SPHEREx image comes straight from NASA/IPAC IRSA.",
  },
];
