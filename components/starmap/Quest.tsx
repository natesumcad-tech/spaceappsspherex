"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MISSION, type Line, type MissionCtx, type PlanetInfo, type StarInfo } from "@/lib/quest/mission";
import { spherexCutout } from "@/lib/starmap/cutout";
import { topSlot } from "@/lib/ui/placement";
import { formatDecDMS, formatRaHMS } from "@/lib/starmap/coordSearch";
import QuestArrow, { type ArrowSpot } from "@/components/ui/QuestArrow";
import { useT, useTV } from "@/lib/i18n";

/** Mission progress lives in this browser, so it survives a reload. */
const STORE = "starmap.quest.v1";
type Saved = { offered?: boolean; started?: number; step?: number; done?: boolean; finishedIn?: number; reading?: MissionCtx["reading"] };
export function loadQuest(): Saved {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "{}") ?? {};
  } catch {
    return {};
  }
}
function saveQuest(s: Saved) {
  try {
    localStorage.setItem(STORE, JSON.stringify(s));
  } catch {}
}
/** Testing helper (front page): forget the mission. */
export function resetQuest() {
  try {
    localStorage.removeItem(STORE);
  } catch {}
}

/** "5h55m", "5 55 10", "5:55", "5.92" → hours; "88.8°" or anything over 24 → degrees. */
function parseRA(text: string): number | null {
  const n = text.match(/\d+(\.\d+)?/g)?.map(Number);
  if (!n?.length) return null;
  const v = n[0] + (n[1] ?? 0) / 60 + (n[2] ?? 0) / 3600;
  return /°|deg|d\b/i.test(text) || v > 24 ? v : v * 15; // → degrees
}
function parseDec(text: string): number | null {
  const n = text.match(/\d+(\.\d+)?/g)?.map(Number);
  if (!n?.length) return null;
  const v = n[0] + (n[1] ?? 0) / 60 + (n[2] ?? 0) / 3600;
  return /^\s*[-−–]/.test(text) ? -v : v;
}
const sep = (ra1: number, d1: number, ra2: number, d2: number) => {
  const r = Math.PI / 180;
  const c = Math.sin(d1 * r) * Math.sin(d2 * r) + Math.cos(d1 * r) * Math.cos(d2 * r) * Math.cos((ra1 - ra2) * r);
  return Math.acos(Math.min(1, Math.max(-1, c))) / r;
};

/** The name a map label shows (stars and constellations: their text; planets: their name; diamonds: their title). */
function labelName(el: HTMLElement) {
  if (el.dataset.name) return el.dataset.name; // the English name, whatever language the label shows
  if (el.classList.contains("mv-wp")) return (el.getAttribute("aria-label") ?? "").replace(/^Waypoint:\s*/, "");
  if (el.classList.contains("mv-planet")) return el.querySelector("span")?.textContent ?? "";
  const aria = el.getAttribute("aria-label"); // e.g. "Polaris: travel, explore or ask a question"
  if (aria) return aria.split(":")[0];
  return (el.textContent ?? "").replace("View in 360°", "");
}

function Portrait() {
  return (
    <svg className="q-face" viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="q-visor" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a4a63" />
          <stop offset="0.55" stopColor="#141a26" />
          <stop offset="1" stopColor="#c9a46a" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="23" fill="#e9dcc4" />
      <path d="M8 46c2-9 9-13 16-13s14 4 16 13" fill="#cdbb9c" />
      <circle cx="24" cy="21" r="13" fill="#f7efdf" stroke="#b9a383" strokeWidth="1.5" />
      <rect x="14" y="15" width="20" height="12" rx="6" fill="url(#q-visor)" />
      <path d="M17 18.5c2-1.5 4-2 6-2" stroke="#fff" strokeOpacity=".55" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <circle cx="35" cy="12" r="2" fill="#c28a2c" />
    </svg>
  );
}

/** The sky's grid: Dec runs north and south like latitude, RA runs east around the equator like longitude. */
function RaDecDiagram() {
  const t = useT();
  return (
    <figure className="q-diagram" aria-label={t("Diagram: declination is measured north or south of the sky's equator; right ascension is measured east along it, in hours")}>
      <svg viewBox="0 0 300 150">
        <circle cx="78" cy="75" r="62" fill="#14120e" stroke="#bfae93" strokeWidth="1.2" />
        <ellipse cx="78" cy="38" rx="45" ry="10" fill="none" stroke="#5c5446" strokeWidth="0.8" />
        <ellipse cx="78" cy="112" rx="45" ry="10" fill="none" stroke="#5c5446" strokeWidth="0.8" />
        <path d="M78 13 C 112 40 112 110 78 137" fill="none" stroke="#5c5446" strokeWidth="0.8" />
        <path d="M78 13 C 44 40 44 110 78 137" fill="none" stroke="#5c5446" strokeWidth="0.8" />
        <ellipse cx="78" cy="75" rx="62" ry="15" fill="none" stroke="#f0c674" strokeWidth="1.6" />
        {/* RA: along the equator, from 0h towards the star's meridian */}
        <path d="M30 84 Q 62 93 100 88" fill="none" stroke="#7fb3ff" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M95 84 L101 88 L95 92" fill="none" stroke="#7fb3ff" strokeWidth="2" strokeLinecap="round" />
        {/* Dec: up from the equator to the star */}
        <path d="M104 87 L104 40" stroke="#ff9d7a" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M100 45 L104 39 L108 45" fill="none" stroke="#ff9d7a" strokeWidth="2" strokeLinecap="round" />
        <circle cx="104" cy="34" r="4.5" fill="#fff6dc" />
        <circle cx="104" cy="34" r="8" fill="#fff6dc" opacity="0.25" />
        <circle cx="30" cy="84" r="2.6" fill="#7fb3ff" />
        <text x="78" y="9" textAnchor="middle" className="q-dg-pole">{t("+90° north pole")}</text>
        <text x="78" y="148" textAnchor="middle" className="q-dg-pole">{t("−90° south pole")}</text>
        <text x="18" y="100" className="q-dg-ra">0h</text>
        <g className="q-dg-key">
          <rect x="160" y="22" width="10" height="10" rx="2" fill="#ff9d7a" />
          <text x="176" y="31"><tspan className="b">Dec</tspan> {t("= north / south")}</text>
          <text x="176" y="45">{t("in degrees, −90° to +90°")}</text>
          <rect x="160" y="62" width="10" height="10" rx="2" fill="#7fb3ff" />
          <text x="176" y="71"><tspan className="b">RA</tspan> {t("= east around")}</text>
          <text x="176" y="85">{t("in hours, 0h to 24h")}</text>
          <rect x="160" y="102" width="10" height="3" rx="1.5" fill="#f0c674" />
          <text x="176" y="107">{t("the sky's equator")}</text>
          <text x="176" y="121">(Dec 0°)</text>
        </g>
      </svg>
    </figure>
  );
}

/** A real SPHEREx cutout, drawn in the background; shimmers while it loads. */
function RealImage({ cut }: { cut: NonNullable<Line["image"]> }) {
  const t = useT();
  const [src, setSrc] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setSrc(undefined);
    spherexCutout(cut.ra, cut.dec, cut.fov).then((s) => live && setSrc(s));
    return () => {
      live = false;
    };
  }, [cut.ra, cut.dec, cut.fov]);
  const ra = cut.ra / 15, h = Math.floor(ra), m = Math.round((ra - h) * 60);
  return (
    <figure className="q-img">
      {src ? <img src={src} alt={`${t(cut.caption)}: ${t("real SPHEREx infrared image")}`} /> : <div className={`q-img-wait ${src === null ? "failed" : ""}`}>{src === null ? t("Image unavailable right now") : t("Receiving image…")}</div>}
      <figcaption>
        <b>{t("Real data")}</b> {t(cut.caption)} · RA {h}h {String(m).padStart(2, "0")}m, Dec {cut.dec >= 0 ? "+" : "−"}
        {Math.abs(cut.dec).toFixed(1)}° · {t("{fov}° wide", { fov: cut.fov })} · {t("SPHEREx DR1 via IRSA")}
      </figcaption>
    </figure>
  );
}

/**
 * The "read me the coordinates" helper: a checklist that ticks itself off, with the two numbers to copy
 * shown in the same colors as the circles on the map's “Center J2000” line.
 */
function ReportHelp({
  starName,
  center,
  star,
  onCenter,
  raIn,
  decIn,
  setRaIn,
  setDecIn,
}: {
  starName: string;
  center: { ra: number; dec: number };
  star: (name: string) => StarInfo | null;
  onCenter: (name: string) => void;
  raIn: string;
  decIn: string;
  setRaIn: (s: string) => void;
  setDecIn: (s: string) => void;
}) {
  const t = useT();
  const truth = star(starName);
  const centered = !truth || sep(center.ra, center.dec, truth.ra, truth.dec) < 1;
  const ra = parseRA(raIn), dec = parseDec(decIn);
  const raOk = !!truth && ra !== null && Math.abs(((ra - truth.ra + 540) % 360) - 180) <= 4;
  const decOk = !!truth && dec !== null && Math.abs(dec - truth.dec) <= 1.5;
  // What to type: the middle of the map, rounded the way the commander asks for it
  const raText = formatRaHMS(center.ra).replace(/^(\d+h \d+m).*/, "$1");
  const decText = formatDecDMS(center.dec).replace(/^([+−-]?\d+°\s*\d+[′']).*/, "$1");
  return (
    <ol className="q-steps">
      <li className={centered ? "ok" : ""}>
        <i>{centered ? "✓" : "1"}</i>
        <span>
          {t("Put {star} in the middle of the map.", { star: t(starName) })}{" "}
          {!centered && (
            <button className="q-chip-btn" onClick={() => onCenter(starName)}>
              {t("Center it for me")}
            </button>
          )}
        </span>
      </li>
      <li className={raOk ? "ok" : ""}>
        <i>{raOk ? "✓" : "2"}</i>
        <span>
          {t("Copy the")} <b className="q-tag ra">RA</b> {t("(circled in blue on the “Center J2000” line) into the RA box. It's hours and minutes:")}{" "}
          {centered && (
            <button className="q-chip ra" onClick={() => setRaIn(raText)} title={t("Tap to fill it in")}>
              {raText}
            </button>
          )}
        </span>
      </li>
      <li className={decOk ? "ok" : ""}>
        <i>{decOk ? "✓" : "3"}</i>
        <span>
          {t("Copy the")} <b className="q-tag dec">Dec</b> {t("(circled in orange) into the Dec box. It's degrees, + means north:")}{" "}
          {centered && (
            <button className="q-chip dec" onClick={() => setDecIn(decText)} title={t("Tap to fill it in")}>
              {decText}
            </button>
          )}
        </span>
      </li>
    </ol>
  );
}

type Phase = "offer" | "talk" | "seek" | "done";

/**
 * "Signal from the Dark": an optional rescue mission. The map stays free; clicking the right stars and
 * planets (or using the right tools) moves the story on. Images and numbers are real data.
 */
export default function Quest({
  open,
  hidden,
  sphere,
  center,
  bandUm,
  star,
  planet,
  onCenter,
  toScreen,
  onClose,
}: {
  open: boolean;
  /** Galaxy view or the tour is up: stay out of the way. */
  hidden: boolean;
  /** The 360° view that's open, if any. */
  sphere: string | null;
  /** J2000 RA/Dec of the middle of the map. */
  center: { ra: number; dec: number };
  bandUm: number | null;
  star: (name: string) => StarInfo | null;
  planet: (name: string) => PlanetInfo | null;
  /** Fly the map so this star sits in the middle. */
  onCenter: (name: string) => void;
  /** Screen position of an RA/Dec on the map. */
  toScreen: (ra: number, dec: number) => { x: number; y: number; behind: boolean } | null;
  onClose: () => void;
}) {
  const t = useT();
  const tv = useTV();
  const [saved, setSaved] = useState<Saved>({});
  const [phase, setPhase] = useState<Phase>("offer");
  const [queue, setQueue] = useState<Line[]>([]);
  const [li, setLi] = useState(0);
  const [hint, setHint] = useState(false);
  const [mini, setMini] = useState(false);
  const [raIn, setRaIn] = useState("");
  const [decIn, setDecIn] = useState("");
  const [nope, setNope] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  // Sit in the free space at the top, clear of the controls (re-checked as panels open and close)
  const [slot, setSlot] = useState<{ left: number; top: number; width: number } | null>(null);
  useEffect(() => {
    if (!open || hidden) return;
    const place = () =>
      setSlot((p) => {
        const n = topSlot(420);
        return p && Math.abs(p.left - n.left) + Math.abs(p.top - n.top) + Math.abs(p.width - n.width) < 1 ? p : n;
      });
    place();
    const t = setInterval(() => !document.hidden && place(), 1000);
    window.addEventListener("resize", place);
    return () => {
      clearInterval(t);
      window.removeEventListener("resize", place);
    };
  }, [open, hidden, sphere]);

  const stepIdx = saved.step ?? 0;
  const step = MISSION[Math.min(stepIdx, MISSION.length - 1)];
  const ctx = useMemo<MissionCtx>(() => ({ star, planet, bandUm, reading: saved.reading ?? null }), [star, planet, bandUm, saved.reading]);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const update = useCallback((patch: Saved) => {
    setSaved((s) => {
      const next = { ...s, ...patch };
      saveQuest(next);
      return next;
    });
  }, []);

  // Opening: offer, resume, or show the summary
  useEffect(() => {
    if (!open) return;
    const s = loadQuest();
    setSaved(s);
    setMini(false);
    if (s.done) setPhase("done");
    else if (s.started) {
      setQueue([]);
      setPhase("seek");
    } else setPhase("offer");
  }, [open]);

  const accept = () => {
    update({ offered: true, started: Date.now(), step: 0, done: false, reading: null });
    setQueue(MISSION[0].intro(ctxRef.current));
    setLi(0);
    setPhase("talk");
  };
  const decline = () => {
    update({ offered: true });
    onClose();
  };

  /** The objective is done: the commander reacts, then sets the next one. */
  const complete = useCallback(
    (extra: Saved = {}) => {
      const c = { ...ctxRef.current, reading: extra.reading ?? ctxRef.current.reading };
      const i = stepIdx;
      const lines = [...MISSION[i].success(c), ...(MISSION[i + 1]?.intro(c) ?? [])];
      const last = i + 1 >= MISSION.length;
      update({ ...extra, step: i + 1, ...(last ? { done: true, finishedIn: Date.now() - (saved.started ?? Date.now()) } : {}) });
      setQueue(lines);
      setLi(0);
      setHint(false);
      setMini(false);
      setNope(null);
      setFlash(true);
      setPhase("talk");
    },
    [stepIdx, saved.started, update],
  );
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(false), 900);
    return () => clearTimeout(t);
  }, [flash]);

  const nextLine = () => {
    if (li < queue.length - 1) return setLi(li + 1);
    setPhase(saved.done ? "done" : "seek");
  };

  const seeking = open && phase === "seek" && !saved.done;
  const check = step.check;

  // Clicking a quest target on the map
  useEffect(() => {
    if (!seeking || check.kind !== "click") return;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest?.<HTMLElement>(".mv-overlay .mv-ov, .mv-overlay .mv-wp");
      if (el && labelName(el).trim().toLowerCase() === check.name.toLowerCase()) setTimeout(() => complete(), 350);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [seeking, check, complete]);

  // Arriving at the coordinates
  useEffect(() => {
    if (!seeking || check.kind !== "goto") return;
    if (sep(center.ra, center.dec, check.ra, check.dec) <= check.radius) {
      const t = setTimeout(() => complete(), 900); // let the flight land first
      return () => clearTimeout(t);
    }
  }, [seeking, check, center.ra, center.dec, complete]);

  // A single SPHEREx color chosen
  useEffect(() => {
    if (seeking && check.kind === "band" && bandUm !== null) complete();
  }, [seeking, check, bandUm, complete]);

  // Watching a real blink (the Blink viewer announces it)
  useEffect(() => {
    if (!seeking || check.kind !== "blink") return;
    const on = (e: Event) => (e as CustomEvent<{ featured: boolean }>).detail?.featured && complete();
    window.addEventListener("spherex-blink", on);
    return () => window.removeEventListener("spherex-blink", on);
  }, [seeking, check, complete]);

  // Stepping inside the 360° view
  useEffect(() => {
    if (seeking && check.kind === "sphere" && sphere === check.stop) complete();
  }, [seeking, check, sphere, complete]);

  // Make the target pulse on the map, and the control we're asking about glow
  useEffect(() => {
    if (!seeking) return;
    const mark = () => {
      document.querySelectorAll(".quest-target").forEach((e) => e.classList.remove("quest-target"));
      if (check.kind === "click")
        document.querySelectorAll<HTMLElement>(".mv-overlay .mv-ov, .mv-overlay .mv-wp").forEach((el) => {
          if (labelName(el).trim().toLowerCase() === check.name.toLowerCase()) el.classList.add("quest-target");
        });
      if (step.glow) document.querySelector(step.glow)?.classList.add("quest-target");
    };
    mark();
    const t = setInterval(mark, 1000);
    return () => {
      clearInterval(t);
      document.querySelectorAll(".quest-target").forEach((e) => e.classList.remove("quest-target"));
    };
  }, [seeking, check, step.glow]);

  const submitReading = (e: React.FormEvent) => {
    e.preventDefault();
    if (check.kind !== "report") return;
    const truth = star(check.star);
    const ra = parseRA(raIn), dec = parseDec(decIn);
    if (!truth) return complete();
    if (ra === null || dec === null) return setNope(t("I need both numbers: RA like 5h 55m, and Dec like +7.4."));
    const dRA = Math.abs(((ra - truth.ra + 540) % 360) - 180), dDec = Math.abs(dec - truth.dec);
    if (dDec > 1.5) return setNope(t("That Dec doesn't match my backup chart. Is {star} right in the middle of your map? Read the second number on the “Center J2000” line.", { star: check.star }));
    if (dRA > 4) return setNope(t("Close, but the RA is off. RA is in hours and minutes: read the first number on the “Center J2000” line."));
    complete({ reading: { ra, dec, offDeg: sep(ra, dec, truth.ra, truth.dec) } });
  };

  /** The quest arrow: where this objective sends you (a place on the map, or the control to use). */
  const locate = (): ArrowSpot | null => {
    if (!seeking || sphere) return null;
    const ui = (...sels: string[]): ArrowSpot | null => {
      for (const sel of sels) {
        const el = document.querySelector<HTMLElement>(sel);
        const r = el?.getBoundingClientRect();
        if (r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight) return { x: r.left + r.width / 2, top: r.top, bottom: r.bottom };
      }
      return null;
    };
    const place = (name: string, at: { ra: number; dec: number } | null): ArrowSpot | null => {
      if (!at) return null;
      const s = toScreen(at.ra, at.dec);
      if (!s) return null;
      const far = sep(center.ra, center.dec, at.ra, at.dec);
      return { x: s.x, top: s.y - 12, bottom: s.y + 12, behind: s.behind, label: `${t(name)} · ${far < 10 ? far.toFixed(1) : far.toFixed(0)}°` };
    };
    if (check.kind === "click") return place(check.name, check.type === "planet" ? planet(check.name) : star(check.name));
    if (check.kind === "sphere") return place("Neptune", planet("Neptune"));
    if (check.kind === "report") {
      const s = star(check.star);
      if (s && sep(center.ra, center.dec, s.ra, s.dec) > 1) return place(check.star, s);
      return ui(".mv-coord-center");
    }
    if (check.kind === "goto") return ui(".mv-coord-go", ".mv-coord-form", ".mv-tools-btn");
    if (check.kind === "band") return ui(".mv-ir-presets", ".mv-minicard");
    if (check.kind === "blink") return ui(".mv-blink-featured", ".mv-tools-btn");
    return null;
  };

  if (!open || hidden) return null;

  const where = sphere ? " in-sphere" : "";
  const pos = slot ? { left: slot.left, top: slot.top, width: slot.width } : { visibility: "hidden" as const };

  if (phase === "offer")
    return (
      <div style={pos} className={`q-card q-offer${where}`} role="dialog" aria-label={t("Incoming transmission")}>
        <div className="q-signal" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="q-body">
          <span className="q-kicker">{t("Incoming transmission · optional mission")}</span>
          <h2>{t("Signal from the Dark")}</h2>
          <p>{t("A survey ship has lost power past Neptune. Use the real SPHEREx sky to guide its crew home. About 5 minutes.")}</p>
          <div className="q-actions">
            <button className="q-ghost" onClick={decline}>
              {t("Not now")}
            </button>
            <button className="q-go" onClick={accept}>
              {t("Answer the call")}
            </button>
          </div>
        </div>
      </div>
    );

  if (phase === "done") {
    const mins = saved.finishedIn ? Math.max(1, Math.round(saved.finishedIn / 60000)) : null;
    return (
      <div style={pos} className={`q-card q-done${where}`} role="dialog" aria-label={t("Mission complete")}>
        <div className="q-badge" aria-hidden="true">
          <svg viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="30" fill="#171512" />
            <circle cx="32" cy="32" r="24" fill="none" stroke="#c9a46a" strokeWidth="2" strokeDasharray="3 4" />
            <path d="M32 14l4.5 11.5L48 27l-9 8 3 12-10-6.5L22 47l3-12-9-8 11.5-1.5z" fill="#f7efdf" />
          </svg>
        </div>
        <div className="q-body">
          <span className="q-kicker">{t("Mission complete")}</span>
          <h2>{t("The Wren is coming home")}</h2>
          <p>{t("You navigated by the stars, read real coordinates, found fuel with SPHEREx data and tracked a ship past Neptune.")}</p>
          <ul className="q-stats">
            {mins && <li><b>{mins} min</b> {t("mission time")}</li>}
            {saved.reading && <li><b>{tv(`${saved.reading.offDeg.toFixed(1)}°`)}</b> {t("off on Betelgeuse")}</li>}
            <li><b>{MISSION.length}/{MISSION.length}</b> {t("objectives")}</li>
          </ul>
          <div className="q-actions">
            <button className="q-ghost" onClick={accept}>
              {t("Play again")}
            </button>
            <button className="q-go" onClick={onClose}>
              {t("Close")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "talk") {
    const line = queue[li];
    if (!line) return null;
    return (
      <div style={pos} className={`q-card q-talk${where} ${flash ? "flash" : ""}`} role="dialog" aria-label={t("Commander Ada Reyes")}>
        {flash && <span className="q-done-tick">{t("✓ Objective complete")}</span>}
        <div className="q-who">
          <Portrait />
          <div>
            <b>{t("Cmdr. Ada Reyes")}</b>
            <span>{t("Survey ship Wren · fictional")}</span>
          </div>
          <span className="q-count">
            {li + 1}/{queue.length}
          </span>
        </div>
        <p className="q-line" key={`${stepIdx}-${li}`}>
          {t(line.text)}
        </p>
        {line.diagram === "radec" && <RaDecDiagram />}
        {line.examples && (
          <div className="q-examples">
            <span className="q-examples-k">{t("Type it like this")}</span>
            {line.examples.map((x) => (
              <div key={x.value}>
                <code>{x.value}</code>
                <span>{t(x.note)}</span>
              </div>
            ))}
          </div>
        )}
        {line.image && <RealImage cut={line.image} />}
        {line.facts && line.facts.length > 0 && (
          <dl className="q-facts">
            {line.facts.map(([k, v]) => (
              <div key={k}>
                <dt>{t(k)}</dt>
                <dd>{tv(v)}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="q-actions">
          <button className="q-go" onClick={nextLine} ref={(el) => el?.focus({ preventScroll: true })}>
            {t(li < queue.length - 1 ? "Continue" : saved.done ? "Finish" : "On it")}
          </button>
        </div>
      </div>
    );
  }

  // Seeking: the objective bar
  if (mini || sphere)
    return (
      <>
      <QuestArrow locate={locate} />
      <button style={slot ? { left: slot.left + slot.width / 2, top: slot.top } : undefined} className={`q-mini${where}`} onClick={() => setMini(false)} aria-label={t("Show mission objective")}>
        <Portrait />
        <span>{t(step.objective)}</span>
      </button>
      </>
    );
  return (
    <>
    <QuestArrow locate={locate} />
    <div style={pos} className="q-card q-seek" role="region" aria-label={t("Mission objective")}>
      <div className="q-who">
        <Portrait />
        <div>
          <span className="q-kicker">
            {t("Objective {n} of {count}", { n: stepIdx + 1, count: MISSION.length })}
          </span>
          <b className="q-obj">{t(step.objective)}</b>
        </div>
        <button className="q-x" onClick={() => setMini(true)} aria-label={t("Minimize")}>
          –
        </button>
      </div>
      {check.kind === "report" && <ReportHelp starName={check.star} center={center} star={star} onCenter={onCenter} raIn={raIn} decIn={decIn} setRaIn={setRaIn} setDecIn={setDecIn} />}
      {check.kind === "report" && (
        <form className="q-form" onSubmit={submitReading}>
          <label className="q-in-ra">
            <span>RA</span>
            <input value={raIn} onChange={(e) => setRaIn(e.target.value)} placeholder="5h 55m" inputMode="text" />
          </label>
          <label className="q-in-dec">
            <span>Dec</span>
            <input value={decIn} onChange={(e) => setDecIn(e.target.value)} placeholder="+7° 24′" inputMode="text" />
          </label>
          <button className="q-go" type="submit" disabled={!raIn.trim() || !decIn.trim()}>
            {t("Send")}
          </button>
        </form>
      )}
      {check.kind === "goto" && (
        <div className="q-goto">
          <p className="q-breakdown">
            <span className="q-chip ra">4h 32m</span> = <b>RA</b> {t("(4 hours 32 minutes east)")} · <span className="q-chip dec">+26</span> = <b>Dec</b> {t("(26° north)")}
          </p>
          <ol className="q-steps">
            <li>
              <i>1</i>
              <span>
                {t("Type")} <code>4h 32m +26</code> {t("in the glowing coordinate bar at the top left, RA first, then Dec.")}{" "}
                <button className="q-chip-btn" onClick={() => window.dispatchEvent(new CustomEvent("coord-fill", { detail: "4h 32m +26" }))}>
                  {t("Type it in for me")}
                </button>
              </span>
            </li>
            <li>
              <i>2</i>
              <span>{t("Press the circled Go button.")}</span>
            </li>
          </ol>
        </div>
      )}
      {(check.kind === "report" || check.kind === "goto") && (
        <details className="q-explain">
          <summary>{t("What are RA and Dec?")}</summary>
          <p>{t("Picture the sky as a giant globe around Earth, with the same kind of grid lines as a map of Earth.")}</p>
          <p>
            <b className="q-tag dec">Dec</b> {t("is like latitude: how far north (+) or south (−) of the sky's equator, from +90° to −90°.")}
          </p>
          <p>
            <b className="q-tag ra">RA</b> {t("is like longitude: how far east around the sky, measured in hours (0h to 24h) because the sky turns once a day.")}
          </p>
          <RaDecDiagram />
        </details>
      )}
      {nope && <p className="q-nope">{nope}</p>}
      <div className="q-seek-foot">
        <div className="q-progress" aria-hidden="true">
          {MISSION.map((m, k) => (
            <i key={m.id} className={k < stepIdx ? "past" : k === stepIdx ? "now" : ""} />
          ))}
        </div>
        <button className="q-link" onClick={() => setHint((h) => !h)} aria-expanded={hint}>
          {hint ? t("Hide hint") : t("Need a hint?")}
        </button>
      </div>
      {hint && <p className="q-hint">{t(step.hint)}</p>}
    </div>
    </>
  );
}
