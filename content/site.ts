// ─────────────────────────────────────────────────────────────
//  Edit this file to customise the site for your team.
//  Everything marked TODO is a placeholder.
// ─────────────────────────────────────────────────────────────

export const site = {
  teamName: "Team SPHEREx Explorers", // TODO: your Space Apps team name
  projectName: "Mapping the Colors of the Cosmos", // TODO: your project title
  tagline:
    "Exploring NASA's SPHEREx all-sky survey: 102 colors of infrared light, every point on the sky.",
  event: "NASA Space Apps Challenge",
  // TODO: link to your team page on spaceappschallenge.org
  teamPageUrl: "https://www.spaceappschallenge.org/",
  // TODO: link to your GitHub repo
  repoUrl: "https://github.com/natesumcad-tech/spaceappsspherex",
};

export const project = {
  challenge: "TODO: name of the Space Apps challenge you picked",
  problem:
    "TODO: one or two sentences on the problem you are solving. What question about SPHEREx data, or about the sky, does your project answer?",
  solution:
    "TODO: what you built. For example: an interactive tool that pulls SPHEREx spectral images from IRSA and lets anyone explore the infrared spectrum of any point on the sky.",
  howItWorks: [
    "TODO: step 1, e.g. fetch SPHEREx Quick Release images from NASA/IPAC IRSA",
    "TODO: step 2, e.g. extract a 102-band spectrum at the chosen coordinates",
    "TODO: step 3, e.g. visualise it and flag water-ice and CO₂ absorption features",
  ],
  tools: ["Next.js", "TypeScript", "Vercel", "SPHEREx data (IRSA)"], // TODO
};

export const team: { name: string; role: string }[] = [
  // TODO: replace with your teammates
  { name: "Nate", role: "Team lead · Web" },
  { name: "Teammate 2", role: "Data & science" },
  { name: "Teammate 3", role: "Design" },
  { name: "Teammate 4", role: "Presentation" },
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
