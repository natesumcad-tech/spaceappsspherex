// ─────────────────────────────────────────────────────────────
//  Edit this file to customise the site for your team.
//  Everything marked TODO is a placeholder.
// ─────────────────────────────────────────────────────────────

export const site = {
  teamName: "Team BigBang",
  projectName: "Sky Explorer",
  tagline:
    "Step inside the sky NASA's SPHEREx is mapping: real stars, planets and the Milky Way in 360°.",
  event: "NASA Space Apps Challenge",
  // TODO: link to your team page on spaceappschallenge.org
  teamPageUrl: "https://www.spaceappschallenge.org/2026/find-a-team/bigbang/",
  // TODO: link to your GitHub repo
  repoUrl: "https://github.com/natesumcad-tech/spaceappsspherex",
};

export const project = {
  challenge: "Planet X & SPHEREx",
  problem:
    "SPHEREx is mapping the entire sky in 102 infrared colors, but its data lives in archives built for astronomers. Most people never get to see what it is exploring, or why it matters.",
  solution:
    "Sky Explorer: an illustrated map of 14 landmarks you can step inside. Each stop is a 360° sphere built from real star data, with hover cards, WASD flight and links between stops, so anyone can explore the sky SPHEREx is mapping.",
  howItWorks: [
    "Pick a stop on the illustrated map, from Earth orbit out to the Milky Way",
    "Step inside a 360° sphere built from 25,700 real Hipparcos stars",
    "Hover the diamonds to learn, fly with WASD, and follow ↗ links to the next landmark",
  ],
  tools: ["Next.js", "three.js", "TypeScript", "Vercel", "Hipparcos star catalogue"],
};

export const team: { name: string; role: string }[] = [
  // TODO: replace with your teammates
  { name: "Nate", role: "Team lead · Web" },
  { name: "Curtis", role: "Full Stack" },
  { name: "Devansh", role: "Data & Sciences" },
  { name: "David", role: "Style & Presentation" },
];

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
