/** The Sky Explorer tour's steps (plain data, so the server can check what the voice may read). */

export type Wait = "move" | "hover" | "modes" | "sphere";
export type Step = {
  /** CSS selector of the control to spotlight (none: a card in the middle of the screen). */
  target?: string;
  title: string;
  body: string;
  /** Something to try: the step notices when you do it, and you can't move on until you have. */
  wait?: { kind: Wait; prompt: string };
  place?: "center" | "top";
};

export const STEPS: Step[] = [
  {
    title: "Welcome to the Sky Explorer",
    body: "This is the whole sky, built from NASA's SPHEREx telescope and streamed live from the IRSA archive. Here's a one-minute tour of what you can do.",
  },
  {
    title: "Move around",
    body: "Drag the map (or use W A S D) to pan, and scroll to zoom. Right-drag tilts the view.",
    wait: { kind: "move", prompt: "Try it: drag or scroll the map" },
    place: "top",
  },
  {
    target: "visible-landmark",
    title: "Landmarks",
    body: "Diamonds mark landmarks, and planets wear their names. Hover one for a summary card.",
    wait: { kind: "hover", prompt: "Try it: hover over a diamond" },
  },
  {
    target: ".mv-top-row .mv-seg",
    title: "2D and 3D",
    body: "See the sky as a flat star chart, or tilt it into a 3D view. Try both.",
    wait: { kind: "modes", prompt: "" },
  },
  {
    title: "Step inside: 360° views",
    body: "Every constellation, planet and landmark has a Street View–style 360° view. Click a name or diamond to fly there, then click it again (or choose View in 360° on its card). Zooming in close works too.",
    wait: { kind: "sphere", prompt: "Step inside any 360° view to continue" },
    place: "top",
  },
  {
    target: ".mv-search-btn",
    title: "Search",
    body: "Find any star, constellation, planet or landmark and fly straight to it. Shortcut: Ctrl + K.",
  },
  {
    target: ".mv-ask",
    title: "Ask the sky guide",
    body: "Ask questions in plain words, like “Where does SPHEREx look for ice?”, and the guide answers and can fly the map for you.",
  },
  {
    target: ".mv-coord-form",
    title: "Exact coordinates",
    body: "Type a J2000 RA/Dec to jump to a precise spot, pick a benchmark target, or share a link to what you're looking at.",
  },
  {
    target: ".mv-blink-bar",
    title: "Blink: the Planet X tool",
    body: "SPHEREx photographs each patch of sky about six months apart. Flip between the passes, or compare them with B − A: stars stay put, but anything in our solar system shifts.",
  },
  {
    target: ".mv-minicard",
    title: "Overview and colors",
    body: "The minimap shows where you are (click it to jump). Below it, choose SPHEREx color, isolate a single infrared wavelength, or switch to 2MASS.",
  },
  {
    target: ".mv-timeline",
    title: "Timeline",
    body: "Slide through time and watch the stars drift over thousands of years.",
  },
  {
    target: ".mv-zoom",
    title: "Zoom and the galaxy",
    body: "＋ and − zoom, ⌂ takes you home, and ⊙ pulls all the way out to the Milky Way. The ? button replays this tour.",
  },
  {
    target: ".mv-actions",
    title: "Make it yours",
    body: "Drop your own waypoints with Shift + G, and choose what's shown (grid, names, lines) with the settings wrench.",
  },
  {
    title: "You're ready",
    body: "Explore freely, or try the Campaign tab for a guided story of SPHEREx and the hunt for Planet X.",
  },
];

/** What the guide reads aloud for a step. */
export const stepSpeech = (s: Step) => `${s.title}. ${s.body}`;
