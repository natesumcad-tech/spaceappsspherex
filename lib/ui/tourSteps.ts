/** The Sky Explorer tour's steps (plain data, so the server can check what the voice may read). */

export type Wait = "move" | "hover" | "modes" | "sphere";
export type Step = {
  /** CSS selector(s) of the control(s) to spotlight (none: nothing highlighted). */
  target?: string | string[];
  title: string;
  body: string;
  /** Something to try: the step notices when you do it and moves on by itself. */
  wait?: { kind: Wait; prompt: string };
};

export const STEPS: Step[] = [
  {
    title: "Welcome to the Sky Explorer",
    body: "The whole sky, built from NASA's SPHEREx telescope. This quick tour takes under a minute.",
  },
  {
    title: "Look around",
    body: "Drag to pan and scroll to zoom.",
    wait: { kind: "move", prompt: "Drag or scroll the map" },
  },
  {
    target: ".mv-top-row .mv-seg",
    title: "Tilt into 3D",
    body: "Flip between a flat star chart and a tilted 3D view.",
    wait: { kind: "modes", prompt: "" },
  },
  {
    target: "visible-landmark",
    title: "Step inside",
    body: "Every planet, star and diamond has a 360° view. Click one to fly there, then click it again to step inside.",
    wait: { kind: "sphere", prompt: "Open any 360° view" },
  },
  {
    target: [".mv-search-btn", ".mv-ask"],
    title: "Find anything",
    body: "Search for a star, planet or constellation, or ask the sky guide a question.",
  },
  {
    target: ".mv-blink-bar",
    title: "Hunt for Planet X",
    body: "Blink flips between SPHEREx's six-month passes. Stars stay put; anything nearer that moves will jump.",
  },
  {
    title: "You're all set",
    body: "Press the ? button any time to see this again.",
  },
];

/** What the guide reads aloud for a step. */
export const stepSpeech = (s: Step) => `${s.title}. ${s.body}`;
