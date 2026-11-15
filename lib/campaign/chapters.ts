/**
 * The guided campaign: chapters of stops. At each stop the map flies to a landmark and the guide
 * talks you through it, one line at a time, like dialogue in a game.
 */

export type CampaignStop = {
  id: string;
  /** Short title shown when you arrive. */
  title: string;
  /** Small label above the title. */
  kicker: string;
  /** Where the map flies: J2000 RA/Dec (degrees), a planet's current position, or the whole sky. */
  target: { ra: number; dec: number } | { planet: string } | "sky";
  /** How far to fly in (map camera distance: smaller is closer; the whole-sky view is about 70). */
  zoom: number;
  /** Name on the marker over the landmark. */
  marker?: string;
  lines: string[];
  /** "Field notes" beside the map. */
  facts: [string, string][];
  /** Suggested questions for the AI guide. */
  ask: string[];
};

export type Chapter = {
  id: string;
  number: number;
  title: string;
  blurb: string;
  stops: CampaignStop[];
};

export const CHAPTERS: Chapter[] = [
  {
    id: "meet-spherex",
    number: 1,
    title: "Meet SPHEREx",
    blurb: "The telescope behind the Planet X & SPHEREx challenge: what it sees, why it was built, and how it could catch a hidden planet.",
    stops: [
      {
        id: "briefing",
        kicker: "Mission briefing",
        title: "Welcome aboard",
        target: "sky",
        zoom: 70,
        lines: [
          "Welcome aboard, cadet. I'm your mission guide, and this is the sky as NASA's SPHEREx telescope sees it.",
          "Everything behind this box is real infrared data, streamed live from NASA/IPAC's Infrared Science Archive, IRSA.",
          "Your NASA Space Apps challenge is called Planet X and SPHEREx. Before we hunt for anything, you need to know your telescope.",
          "Click this box, or press Space, to keep going. Press the speaker to hear me read aloud, and ask a question whenever you're curious.",
        ],
        facts: [
          ["Challenge", "Planet X & SPHEREx"],
          ["Your map", "SPHEREx images from NASA/IPAC IRSA"],
          ["Chapter", "1 of the campaign"],
        ],
        ask: ["What is the Planet X & SPHEREx challenge about?", "What is IRSA?"],
      },
      {
        id: "telescope",
        kicker: "Stop 1 · The telescope",
        title: "The whole sky in 102 colors",
        target: { ra: 266.417, dec: -29.008 },
        zoom: 45,
        marker: "Galactic center",
        lines: [
          "SPHEREx stands for Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer. Quite a mouthful.",
          "It launched on March 11, 2025, on a SpaceX Falcon 9 rocket from Vandenberg Space Force Base in California.",
          "From a polar orbit around Earth, it sweeps across the entire sky, and maps all of it every six months.",
          "Most cameras take pictures in three colors. SPHEREx splits infrared light into 102 colors, from 0.75 to 5 micrometers: light far too red for your eyes.",
          "To see that faint infrared glow, it keeps its telescope at about minus 210 degrees Celsius, shaded by three cone-shaped shields that block the heat of the Sun and Earth.",
          "Ahead is the center of our Milky Way. Dust hides it from ordinary telescopes, but infrared light slips through the dust.",
        ],
        facts: [
          ["Launched", "March 11, 2025 · Falcon 9"],
          ["Colors", "102, from 0.75 to 5 µm"],
          ["Whole-sky maps", "One every 6 months"],
          ["Telescope", "20 cm mirror, 3.5° × 11.3° view"],
          ["Run by", "NASA JPL & Caltech"],
        ],
        ask: ["Why does SPHEREx need to be so cold?", "How does SPHEREx split light into 102 colors?"],
      },
      {
        id: "ice",
        kicker: "Stop 2 · Science goal: ice",
        title: "Where water comes from",
        target: { ra: 68.0, dec: 26.0 },
        zoom: 10,
        marker: "Taurus Molecular Cloud",
        lines: [
          "This dark cloud in Taurus is a nursery where stars like the Sun are being born, about 450 light-years away.",
          "Inside clouds like this, water, carbon dioxide and carbon monoxide freeze onto tiny grains of dust.",
          "Ices soak up very specific infrared colors. With 102 colors, SPHEREx can read those fingerprints in starlight shining through the clouds.",
          "It will measure ice along millions of lines of sight across the Milky Way. The water in Earth's oceans may have started out as ice like this.",
        ],
        facts: [
          ["Distance", "About 450 light-years"],
          ["Ices", "Water, CO₂, CO and more"],
          ["How", "Absorption fingerprints in starlight"],
        ],
        ask: ["How can a telescope tell that something is ice?", "Did Earth's water come from space?"],
      },
      {
        id: "inflation",
        kicker: "Stop 3 · Science goal: the Big Bang",
        title: "Echoes of inflation",
        target: { ra: 270.0, dec: 66.561 },
        zoom: 16,
        marker: "North ecliptic pole",
        lines: [
          "In a tiny fraction of a second after the Big Bang, the universe ballooned outward unimaginably fast. Physicists call it inflation.",
          "Inflation left a faint pattern in where galaxies ended up, billions of years later.",
          "SPHEREx will measure the 3D positions of about 450 million galaxies to search for that pattern.",
          "Its orbit brings it back over the poles of the ecliptic again and again, so here, and at the south ecliptic pole, it builds up its deepest views.",
        ],
        facts: [
          ["Galaxies mapped", "About 450 million"],
          ["Looking for", "Traces of cosmic inflation"],
          ["Deep fields", "North & south ecliptic poles"],
        ],
        ask: ["What is cosmic inflation?", "How do colors tell SPHEREx how far away a galaxy is?"],
      },
      {
        id: "glow",
        kicker: "Stop 4 · Science goal: galaxies",
        title: "The glow of every galaxy",
        target: { ra: 90.0, dec: -66.561 },
        zoom: 16,
        marker: "South ecliptic pole",
        lines: [
          "Many galaxies are far too faint to spot one by one. Together, though, they fill the sky with a dim glow.",
          "SPHEREx measures that total glow, color by color, to learn how much light galaxies have made over the history of the universe.",
          "Nearby is the Large Magellanic Cloud, a small galaxy orbiting our own, about 160,000 light-years away.",
        ],
        facts: [
          ["Measures", "The combined light of all galaxies"],
          ["Neighbor", "Large Magellanic Cloud"],
          ["Deep field", "South ecliptic pole"],
        ],
        ask: ["What is the extragalactic background light?", "What is the Large Magellanic Cloud?"],
      },
      {
        id: "data",
        kicker: "Stop 5 · Open data",
        title: "The data is yours",
        target: { ra: 10.685, dec: 41.269 },
        zoom: 7,
        marker: "Andromeda Galaxy",
        lines: [
          "Everything SPHEREx sees becomes public. The IRSA archive publishes its images for anyone on Earth to explore.",
          "This map stitches those images into tiles, the same way online maps stitch together satellite photos.",
          "That's the Andromeda Galaxy, the nearest big galaxy to ours, about 2.5 million light-years away.",
          "In the Sky Explorer you can view a single SPHEREx color, or blink between the sky's six-month passes. Remember that blink. You'll need it.",
        ],
        facts: [
          ["Archive", "NASA/IPAC IRSA"],
          ["Access", "Free and public"],
          ["Andromeda", "About 2.5 million light-years"],
        ],
        ask: ["How can I download SPHEREx data?", "What does blinking two images show?"],
      },
      {
        id: "pluto",
        kicker: "Stop 6 · The challenge begins",
        title: "Planet X, 1930",
        target: { ra: 110.031, dec: 21.982 },
        zoom: 6,
        marker: "Delta Geminorum",
        lines: [
          "Now, the challenge. Over a century ago, astronomer Percival Lowell was convinced an unseen Planet X lay beyond Neptune.",
          "In 1930, at Lowell Observatory, Clyde Tombaugh photographed the same patches of sky days apart, then flipped between the plates in a blink comparator.",
          "The stars stayed put. One faint dot jumped. Right here, near the star Delta Geminorum, he had found Pluto.",
          "Pluto turned out far too small to be Lowell's Planet X. But the hunt for distant worlds never really ended.",
        ],
        facts: [
          ["Discovered", "February 18, 1930"],
          ["By", "Clyde Tombaugh, Lowell Observatory"],
          ["Method", "Blinking photos taken days apart"],
        ],
        ask: ["How does a blink comparator work?", "Why isn't Pluto a planet anymore?"],
      },
      {
        id: "neptune",
        kicker: "Stop 7 · Planets found with math",
        title: "A planet on paper",
        target: { planet: "neptune" },
        zoom: 4,
        marker: "Neptune",
        lines: [
          "This is Neptune. In 1846, Urbain Le Verrier worked out where it had to be from small tugs on the orbit of Uranus.",
          "Johann Galle pointed a telescope there and found it on his first night of searching, within about a degree of the prediction.",
          "Today, some astronomers suspect a Planet Nine far beyond Neptune, because a group of distant icy bodies have oddly lined-up orbits.",
          "If it exists, it could be several times Earth's mass and hundreds of times farther from the Sun than we are. No one has seen it yet.",
        ],
        facts: [
          ["Neptune found", "September 23, 1846"],
          ["Planet Nine", "Proposed in 2016 · not yet seen"],
          ["Clue", "Clustered orbits of distant icy bodies"],
        ],
        ask: ["What is the evidence for Planet Nine?", "How was Neptune predicted before anyone saw it?"],
      },
      {
        id: "hunt",
        kicker: "Stop 8 · Your mission",
        title: "How SPHEREx could spot it",
        target: "sky",
        zoom: 70,
        lines: [
          "SPHEREx photographs each patch of sky about six months apart. In that time, Earth swings to the opposite side of the Sun.",
          "Distant stars barely shift. But anything in our solar system, even a planet hundreds of times farther away than Earth, would appear to jump between the two passes.",
          "That's Tombaugh's blink, done across the entire sky, in 102 colors.",
          "Color helps, too. Methane gas soaks up light near 3.3 micrometers, which is why Uranus and Neptune look dark at that color. A cold, faraway planet might show the same fingerprint.",
          "Your mission: open the Sky Explorer, use Blink to compare the six-month passes, and look for anything that moves. Good hunting, cadet.",
        ],
        facts: [
          ["Passes", "Each spot imaged ~6 months apart"],
          ["Trick", "Nearby objects shift; stars don't"],
          ["Clue", "Methane absorbs near 3.3 µm"],
        ],
        ask: ["How far would Planet Nine move between SPHEREx passes?", "What would Planet Nine look like to SPHEREx?"],
      },
    ],
  },
];

/** Chapters still being written, shown as locked on the chapter screen. */
export const COMING_SOON = [
  { number: 2, title: "The moving-object hunt", blurb: "Blink real SPHEREx passes and learn to tell asteroids from artifacts." },
  { number: 3, title: "Ices of the Milky Way", blurb: "Follow starlight through frozen clouds, color by color." },
];
