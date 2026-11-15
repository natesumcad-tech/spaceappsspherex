"use client";

import "./assistant.css";
import { useEffect, useRef, useState } from "react";

export type AssistantAction = { name: string; args: Record<string, unknown> };
type Source = { id: number; title: string; url: string };
type Msg = { role: "user" | "model"; text: string; notes?: string[]; sources?: Source[]; sourceUnavailable?: boolean };

const STARTERS = ["Take me to the Andromeda Galaxy", "Where does SPHEREx look for ice?", "Show me Orion in 3D", "What am I looking at?"];

/**
 * The Sky Explorer guide: a chat panel that answers questions, asks follow-ups, and drives the map
 * (the server turns requests into actions like "fly to M31" or "open Saturn in 360°").
 */
export default function Assistant({
  open,
  onClose,
  getContext,
  runAction,
  draft,
}: {
  draft?: { id: number; text: string } | null;
  open: boolean;
  onClose: () => void;
  getContext: () => unknown;
  runAction: (a: AssistantAction) => string | null;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>(STARTERS);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => field.current?.focus(), 50);
  }, [open]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (draft) { setInput(draft.text); field.current?.focus(); }
  }, [draft]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    const history: Msg[] = [...messages, { role: "user", text: q }];
    setMessages(history);
    setInput("");
    setSuggestions([]);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.map(({ role, text }) => ({ role, text })), context: getContext() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          data.error === "not_configured"
            ? "I'm not switched on yet: this site needs a Gemini API key. Add GEMINI_API_KEY in Vercel (Settings → Environment Variables) and redeploy."
            : data.error === "timeout"
              ? "The AI service is taking too long to respond. Please try again."
              : "I couldn't reach the AI service just now. Please try again in a moment.";
        setMessages((m) => [...m, { role: "model", text: msg }]);
        return;
      }
      const notes: string[] = [];
      le…9339 tokens truncated…d>F</kbd></li>
            <li><b>Zoom</b> scroll · <kbd>Z</kbd><kbd>X</kbd></li>
            <li><b>2D / 3D</b> <kbd>T</kbd> · tilt near flat to snap to 2D</li>
            <li><b>360° view</b> click any diamond, planet, star or constellation name to fly there, then click it again (or keep zooming in)</li>
            <li><b>Waypoint</b> <kbd>Shift</kbd>+<kbd>G</kbd> · <b>Home</b> <kbd>H</kbd></li>
          </ul>
        )}
      </Collapsible>

      {/* The summary card pops out of the hovered diamond or planet (rendered inside the viewer's card host) */}
      {hover &&
        settings.descriptions &&
        viewerRef.current &&
        createPortal(
          <div
            className="mv-pop"
            key={hover.wp?.id ?? hover.planet}
            onPointerEnter={() => {
              overCard.current = true;
              if (hideTimer.current) clearTimeout(hideTimer.current);
            }}
            onPointerLeave={() => {
              overCard.current = false;
              hoverWp(null);
            }}
          >
            {hover.wp ? (
              <WaypointDetails
                wp={hover.wp}
                viewer={viewerRef.current}
                near={waypointStop(hover.wp) === nearStop}
                onStep={enterSphere}
                imaged={`${layerById(settings.layer).name}: ${layerById(settings.layer).observed}`}
                onDelete={(id) => setCustom((c) => c.filter((w) => w.id !== id))}
              />
            ) : (
              <PlanetDetails
                hover={hover}
                near={hover.stop === nearStop}
                onStep={enterSphere}
                onTravel={() => viewerRef.current?.flyTo(hover.x, hover.y, 10, false)}
              />
            )}
            <button className="mv-primary" onClick={() => askAbout(hover.wp?.title ?? hover.planet ?? "this object")}>Ask about this</button>
          </div>,
          viewerRef.current.cardHost,
        )}

      {/* Add-waypoint panel (Shift+G) */}
      <aside className={`mv-glass mv-addcard ${adding ? "open" : ""}`} aria-hidden={!adding}>
        {adding && (
          <AddWaypoint
            at={adding}
            toRadec={(x, y) => viewerRef.current?.toRadec(x, y) ?? [0, 0]}
            onCancel={() => setAdding(null)}
            onSave={(wp) => {
              setCustom((c) => [...c, wp]);
              setAdding(null);
            }}
          />
        )}
      </aside>

      {/* Timeline */}
      <Collapsible
        id="map-timeline"
        className="mv-glass mv-timeline"
        title={
          <div className="mv-tl-head">
            <span className="cl-label">Timeline</span>
            <strong>{ep.label}</strong>
          </div>
        }
      >
        <p className="mv-tl-note">
          {ep.note}
          {!planetsValid(epochYear(ep)) && settings.planets && <em> Planets hidden: too far from today to calculate reliably.</em>}
        </p>
        <Timeline value={epoch} onChange={setEpoch} />
      </Collapsible>

      {travel && !sphere && <div className="mv-travel">Traveling to {travel}…</div>}

      <Assistant draft={assistantDraft} open={askOpen} onClose={() => setAskOpen(false)} getContext={assistantContext} runAction={runAction} />

      {/* The 360° sphere opens right here, over the map */}
      {sphere && (
        <>
          <div className={`mv-sphere ${closing ? "closing" : ""}`} onAnimationEnd={(e) => e.animationName === "mv-sphere-out" && finishExit()}>
            <SphereView onAsk={askAbout} stopId={sphere} onStop={enterSphere} onExit={exitSphere} />
          </div>
          {closing && <div className="mv-iris" aria-hidden="true" />}
        </>
      )}

      {/* Settings window */}
      <SettingsWindow
        open={showSettings}
        settings={settings}
        set={set}
        custom={custom}
        setCustom={setCustom}
        onClose={() => setShowSettings(false)}
        count={all.length}
      />
    </div>
  );
}

// ───────────────────────── Waypoint details ─────────────────────────

function WaypointDetails({
  wp,
  viewer,
  imaged,
  near,
  onStep,
  onDelete,
}: {
  wp: Waypoint;
  viewer: StarMapViewer | null;
  imaged: string;
  near: boolean;
  onStep: (stop: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      <span className="mv-kind" style={wp.color ? { background: wp.color } : undefined}>
        {wp.kind}
      </span>
      <h2>{wp.title}</h2>
      <p>{wp.description}</p>
      {wp.significance && (
        <p className="mv-sig">
          <b>Why it matters:</b> {wp.significance}
        </p>
      )}
      <dl>
        <div className="wide">
          <dt>Image taken</dt>
          <dd>{imaged}</dd>
        </div>
        <div className="wide">
          <dt>{wp.custom ? "Added" : "Recorded"}</dt>
          <dd>{wp.date || "—"}</dd>
        </div>
        <div>
          <dt>Map x, y</dt>
          <dd>
            {fmt(raToX(wp.ra))}°, {fmt(wp.dec)}°
          </dd>
        </div>
        <div>
          <dt>RA, Dec</dt>
          <dd>
            {raHMS(wp.ra)}, {fmt(wp.dec)}°
          </dd>
        </div>
      </dl>
      <div className="mv-wp-actions">
        <button className="mv-primary" onClick={() => onStep(waypointStop(wp))}>
          View in 360° ↗
        </button>
        {!near && (
          <button className="mv-secondary" onClick={() => viewer?.travelTo(wp)}>
            Travel here
          </button>
        )}
        {wp.custom && (
          <button className="mv-secondary" onClick={() => onDelete(wp.id)}>
            Delete
          </button>
        )}
      </div>
    </>
  );
}

/** The hover card for a planet or the Sun: its 360° stop's summary. */
function PlanetDetails({ hover, near, onStep, onTravel }: { hover: MapHover; near: boolean; onStep: (stop: string) => void; onTravel: () => void }) {
  const lm = hover.stop ? byId(hover.stop) : null;
  if (!lm) return null;
  return (
    <>
      <span className="mv-kind">{lm.subtitle}</span>
      <h2>{lm.title}</h2>
      <p>{lm.description}</p>
      <dl>
        {lm.facts.slice(0, 2).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        <div className="wide">
          <dt>Position today</dt>
          <dd>
            Map {fmt(hover.x)}°, {fmt(hover.y)}°
          </dd>
        </div>
      </dl>
      <div className="mv-wp-actions">
        <button className="mv-primary" onClick={() => onStep(lm.id)}>
          View in 360° ↗
        </button>
        {!near && (
          <button className="mv-secondary" onClick={onTravel}>
            Travel here
          </button>
        )}
      </div>
    </>
  );
}

function AddWaypoint({ at, toRadec, onCancel, onSave }: { at: { x: number; y: number }; toRadec: (x: number, y: number) => [number, number]; onCancel: () => void; onSave: (wp: Waypoint) => void }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("My waypoint");
  const [description, setDescription] = useState("");
  const [significance, setSignificance] = useState("");
  const [date, setDate] = useState(() => new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }));
  const [color, setColor] = useState(PASTELS[0]);
  const [ra, dec] = toRadec(at.x, at.y);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onSave({ id: `u-${Date.now()}`, title: title.trim(), kind: kind.trim() || "My waypoint", ra, dec, description: description.trim(), significance: significance.trim(), date: date.trim(), color, custom: true });
      }}
    >
      <div className="mv-add-head">
        <h2>New waypoint</h2>
        <button type="button" className="mv-close" onClick={onCancel} aria-label="Close">
          ×
        </button>
      </div>
      <p className="mv-add-pos">
        At x {fmt(at.x)}°, y {fmt(at.y)}° · RA {raHMS(ra)}, Dec {fmt(dec)}°
      </p>
      <label>
        Name
        <input ref={first} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. My favorite star" required maxLength={60} />
      </label>
      <label>
        Type
        <input value={kind} onChange={(e) => setKind(e.target.value)} maxLength={40} />
      </label>
      <label>
        Description
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={280} placeholder="What's here?" />
      </label>
      <label>
        Why it matters
        <textarea value={significance} onChange={(e) => setSignificance(e.target.value)} rows={2} maxLength={200} />
      </label>
      <label>
        Date
        <input value={date} onChange={(e) => setDate(e.target.value)} maxLength={40} />
      </label>
      <fieldset>
        <legend>Color</legend>
        <div className="mv-swatches">
          {PASTELS.map((c) => (
            <button type="button" key={c} className={c === color ? "on" : ""} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Color ${c}`} aria-pressed={c === color} />
          ))}
        </div>
      </fieldset>
      <div className="mv-wp-actions">
        <button type="submit" className="mv-primary" disabled={!title.trim()}>
          Add waypoint
        </button>
        <button type="button" className="mv-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ───────────────────────── Imagery (which IRSA data you're looking at) ─────────────────────────

function ImageryControl({ settings, set }: { settings: Settings; set: (k: keyof Settings, v: Settings[keyof Settings]) => void }) {
  const mode = settings.layer === "2mass" ? "2mass" : settings.band >= 0 ? "band" : "color";
  const [band, setBand] = useState(settings.band >= 0 ? settings.band : 46);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const available = SPHEREX_WL.map((_, i) => i).filter((i) => !BLANK_FRAMES.has(i));
  const cancelPending = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => {
    if (settings.band >= 0) setBand(settings.band);
  }, [settings.band]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const isolate = (b: number, deferred = false) => {
    cancelPending();
    setBand(b);
    const apply = () => {
      set("layer", "spherex");
      set("overlays", []);
      set("band", b);
      timer.current = null;
    };
    if (deferred) timer.current = setTimeout(apply, 180);
    else apply();
  };
  const switchMode = (layer: Settings["layer"], b: number) => {
    cancelPending();
    set("layer", layer);
    set("band", b);
  };
  const stepBand = (direction: number) => {
    const index = available.indexOf(band);
    const next = available[Math.max(0, Math.min(available.length - 1, index + direction))];
    isolate(next);
  };

  return (
    <div className="mv-imagery">
      <div className="mv-imagery-seg" role="radiogroup" aria-label="Map imagery">
        <button role="radio" aria-checked={mode === "color"} onClick={() => switchMode("spherex", -1)}>SPHEREx color</button>
        <button role="radio" aria-checked={mode === "band"} onClick={() => isolate(band)}>Isolate infrared</button>
        <button role="radio" aria-checked={mode === "2mass"} onClick={() => switchMode("2mass", -1)}>2MASS</button>
      </div>
      <div className="mv-ir-presets" role="group" aria-label="Isolate an infrared layer">
        {[12, 46, 62].map((frame) => (
          <button key={frame} type="button" aria-pressed={mode === "band" && settings.band === frame && settings.overlays.length === 0}
            onClick={() => isolate(frame)} title={`Isolate ${SPHEREX_WL[frame].toFixed(3)} micrometers`}>
            {SPHEREX_WL[frame].toFixed(1)} µm
          </button>
        ))}
      </div>
      {mode === "band" && (
        <div className="mv-ir-isolation">
          <p className="mv-ir-status" aria-live="polite">
            {settings.overlays.length ? "Overlay blend active" : "Infrared layer isolated"} · {SPHEREX_WL[settings.band].toFixed(3)} µm
          </p>
          <label className="mv-band">
            <span><b>{SPHEREX_WL[band].toFixed(3)} µm</b> · channel {band + 1} of 102</span>
            <input type="range" min={0} max={available.length - 1} value={Math.max(0, available.indexOf(band))}
              onChange={(e) => isolate(available[Number(e.target.value)], true)} aria-label="SPHEREx wavelength"
              aria-valuetext={`${SPHEREX_WL[band].toFixed(3)} micrometers, channel ${band + 1}`} />
          </label>
          <label className="mv-ir-select">Choose a wavelength
            <select value={band} onChange={(e) => isolate(Number(e.target.value))}>
              {SPHEREX_WL.map((w, i) => <option key={i} value={i} disabled={BLANK_FRAMES.has(i)}>
                {w.toFixed(3)} µm · channel {i + 1}{BLANK_FRAMES.has(i) ? " — no DR1 data" : ""}
              </option>)}
            </select>
          </label>
          <div className="mv-ir-steps">
            <button type="button" disabled={band === available[0]} onClick={() => stepBand(-1)}>← Previous</button>
            <button type="button" disabled={band === available[available.length - 1]} onClick={() => stepBand(1)}>Next →</button>
          </div>
          {settings.overlays.length > 0 && <button type="button" className="mv-ir-clear" onClick={() => isolate(band)}>Remove overlays and isolate</button>}
          <p className="mv-imagery-note">One wavelength only; survey overlays are removed. Display colors are artificial. Channels 51–52 have no DR1 data.</p>
        </div>
      )}
      {mode === "color" && <p className="mv-imagery-note">Blue 1.0 µm · green 2.2 µm · red 3.3 µm. Use the presets above to isolate one layer.</p>}
    </div>
  );
}

// ───────────────────────── Minimap ─────────────────────────

type MinimapHandle = { draw: (v: View) => void; setImage: (c: HTMLCanvasElement) => void; setWaypoints: (w: Waypoint[]) => void };


const Minimap = forwardRef<MinimapHandle, { onMove: (x: number, y: number) => void }>(function Minimap({ onMove }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLCanvasElement | null>(null);
  const wps = useRef<Waypoint[]>([]);
  const view = useRef<View | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const paint = useCallback(() => {
    const c = canvas.current, v = view.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (img.current) ctx.drawImage(img.current, 0, 0, w, h);
    else {
      ctx.fillStyle = "#0b1030";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (const wp of wps.current) {
      const x = ((raToX(wp.ra) + 180) / 360) * w, y = ((90 - wp.dec) / 180) * h;
      ctx.fillStyle = wp.color ?? "rgba(255,255,255,0.85)";
      ctx.fillRect(x - 1.5, y - 1, 3, 2);
    }
    if (!v) return;
    const cx = ((v.x + 180) / 360) * w, cy = ((90 - v.y) / 180) * h;
    const r = Math.max(5, (v.radius / 360) * w);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    ctx.setLineDash([]);
    // heading tick: which way is "up" on screen
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - Math.sin(v.theta) * r, cy - Math.cos(v.theta) * r);
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  useImperativeHandle(ref, () => ({
    draw: (v) => {
      view.current = v;
      paint();
    },
    setImage: (c) => {
      img.current = c;
      paint();
    },
    setWaypoints: (w) => {
      wps.current = w;
      paint();
    },
  }));

  const toMap = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 360 - 180, 90 - ((e.clientY - r.top) / r.height) * 180] as const;
  };

  return (
    <canvas
      ref={canvas}
      className="mv-minimap"
      aria-label="Overview map: drag the circle to move"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        const [x, y] = toMap(e);
        const v = view.current;
        // Grab the circle where you clicked it; click elsewhere to jump there.
        drag.current = v && Math.hypot(x - v.x, y - v.y) < Math.max(v.radius, 6) ? { dx: v.x - x, dy: v.y - y } : { dx: 0, dy: 0 };
        onMove(x + drag.current.dx, y + drag.current.dy);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const [x, y] = toMap(e);
        onMove(x + drag.current.dx, y + drag.current.dy);
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    />
  );
});

// ───────────────────────── Timeline ─────────────────────────

function Timeline({ value, onChange }: { value: number; onChange: (i: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [dragPos, setDragPos] = useState<number | null>(null);
  const n = EPOCHS.length;
  const pos = dragPos ?? value / (n - 1);
  const nearest = Math.round(pos * (n - 1));

  const fromEvent = (e: React.PointerEvent) => {
    const r = track.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };

  return (
    <div className="mv-tl">
      <div
        ref={track}
        className="mv-tl-track"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          setDragPos(fromEvent(e));
        }}
        onPointerMove={(e) => dragPos !== null && setDragPos(fromEvent(e))}
        onPointerUp={() => {
          if (dragPos === null) return;
          setDragPos(null);
          onChange(nearest); // snap to the closest date
        }}
      >
        <div className="mv-tl-fill" style={{ width: `${pos * 100}%` }} />
        {EPOCHS.map((ep, i) => (
          <button
            key={ep.label}
            className={`mv-tl-mark ${i === nearest ? "on" : ""}`}
            style={{ left: `${(i / (n - 1)) * 100}%` }}
            onClick={() => onChange(i)}
            tabIndex={-1}
          >
            <span>{ep.label}</span>
          </button>
        ))}
        <div
          className={`mv-tl-handle ${dragPos !== null ? "dragging" : ""}`}
          style={{ left: `${pos * 100}%` }}
          role="slider"
          tabIndex={0}
          aria-label="Date"
          aria-valuemin={0}
          aria-valuemax={n - 1}
          aria-valuenow={value}
          aria-valuetext={EPOCHS[value].label}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") onChange(Math.max(0, value - 1));
            if (e.key === "ArrowRight") onChange(Math.min(n - 1, value + 1));
          }}
        />
      </div>
    </div>
  );
}

// ───────────────────────── Settings window ─────────────────────────

const TOGGLES: [keyof Settings, string, string][] = [
  ["glow", "Light", "Brighter display, so faint dust and galaxies stand out"],
  ["lines", "Constellation mapping", "Stick-figure lines joining each constellation"],
  ["names", "Names", "Constellation, star and planet names"],
  ["descriptions", "Descriptions", "Detail cards that slide in when you hover a waypoint"],
  ["waypoints", "Waypoints", "The white markers you can click to fast travel"],
  ["planets", "Planets", "The Sun and planets at the date on the timeline"],
  ["grid", "Measurement grid", "Graph-paper lines with labeled degrees that adapt as you zoom, and bold axes through the origin"],
];

function SettingsWindow({
  open,
  settings,
  set,
  custom,
  setCustom,
  onClose,
  count,
}: {
  open: boolean;
  settings: Settings;
  set: (k: keyof Settings, v: Settings[keyof Settings]) => void;
  custom: Waypoint[];
  setCustom: (w: Waypoint[]) => void;
  onClose: () => void;
  count: number;
}) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className={`mv-settings ${open ? "open" : ""}`} aria-hidden={!open} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mv-settings-panel" role="dialog" aria-modal="true" aria-label="Settings">
        <div className="mv-settings-head">
          <h2>Settings</h2>
          <button className="mv-primary" onClick={onClose}>
            Done
          </button>
        </div>

        <section>
          <h3>Map imagery from IRSA</h3>
          <p className="mv-note">Live tiles from NASA/IPAC&apos;s Infrared Science Archive, its most recent releases first.</p>
          {BASE_LAYERS.map((l) => (
            <label key={l.id} className="mv-toggle">
              <span>
                <b>{l.name}</b>
                <small>
                  Released {l.released} · observed {l.observed}
                </small>
              </span>
              <input type="radio" name="mv-base" checked={settings.layer === l.id} onChange={() => set("layer", l.id as Settings["layer"])} />
              <i aria-hidden="true" />
            </label>
          ))}
          <h3 className="mv-subhead">Extra layers (where they have data)</h3>
          {OVERLAYS.map((l) => (
            <label key={l.id} className="mv-toggle">
              <span>
                <b>{l.name}</b>
                <small>
                  Released {l.released} · observed {l.observed}
                </small>
              </span>
              <input
                type="checkbox"
                checked={settings.overlays.includes(l.id)}
                onChange={(e) => set("overlays", e.target.checked ? [...settings.overlays, l.id] : settings.overlays.filter((x) => x !== l.id))}
              />
              <i aria-hidden="true" />
            </label>
          ))}
        </section>

        <section>
          <h3>Display</h3>
          {TOGGLES.map(([k, label, hint]) => (
            <label key={k} className="mv-toggle">
              <span>
                <b>{label}</b>
                <small>{hint}</small>
              </span>
              <input type="checkbox" checked={settings[k] as boolean} onChange={(e) => set(k, e.target.checked)} />
              <i aria-hidden="true" />
            </label>
          ))}
        </section>

        <section>
          <h3>Performance</h3>
          <p className="mv-note">The map only draws tiles near what you can see, and uses less detail as you zoom out.</p>
          <div className="mv-seg-row">
            {(["low", "auto", "high"] as const).map((q) => (
              <button key={q} className={settings.quality === q ? "on" : ""} onClick={() => set("quality", q)}>
                {q === "auto" ? "Auto" : q === "low" ? "Battery saver" : "High detail"}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>Controls</h3>
          <ul className="mv-keys">
            <li><span>Pan</span><span>Middle-drag, left-drag, or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrows</span></li>
            <li><span>Orbit</span><span><kbd>Shift</kbd> + middle-drag, right-drag, or <kbd>Q</kbd><kbd>E</kbd> (turn) <kbd>R</kbd><kbd>F</kbd> (tilt)</span></li>
            <li><span>Zoom</span><span>Scroll wheel, pinch, or <kbd>Z</kbd><kbd>X</kbd></span></li>
            <li><span>2D / 3D</span><span><kbd>T</kbd>, or tilt to nearly flat and let go to snap</span></li>
            <li><span>New waypoint</span><span><kbd>Shift</kbd> + <kbd>G</kbd></span></li>
            <li><span>Back to origin</span><span><kbd>H</kbd></span></li>
          </ul>
        </section>

        <section>
          <h3>Your waypoints</h3>
          <p className="mv-note">
            {custom.length} of {count} waypoints are yours. They&apos;re saved in this browser; export them to share or add to the team database.
          </p>
          <div className="mv-seg-row">
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(custom, null, 2)], { type: "application/json" });
                const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "star-map-waypoints.json" });
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 4000);
              }}
              disabled={!custom.length}
            >
              Export
            </button>
            <button onClick={() => file.current?.click()}>Import</button>
            <button onClick={() => custom.length && confirm("Delete all your waypoints?") && setCustom([])} disabled={!custom.length}>
              Clear mine
            </button>
          </div>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const list = JSON.parse(await f.text()) as Waypoint[];
                const ok = list.filter((w) => typeof w.ra === "number" && typeof w.dec === "number" && w.title);
                setCustom([...custom, ...ok.map((w, i) => ({ ...w, id: `u-${Date.now()}-${i}`, custom: true }))]);
              } catch {
                alert("That file isn't a waypoint list.");
              }
              e.target.value = "";
            }}
          />
        </section>

        <section>
          <h3>About the data</h3>
          <p className="mv-note">
            The map is SPHEREx Data Release 1 (NASA/JPL-Caltech, served by IRSA), streamed as HiPS tiles and laid onto a grid by RA/Dec starting from the
            origin (RA 0h, Dec 0°). Very bright cores that DR1 leaves blank (saturated pixels) are shown as white. Constellation lines and names come from the Hipparcos-based d3-celestial catalogue; star distances for the 3D constellations come from the HYG database v4.1 (CC BY-SA 4.0). The timeline shifts the sky by
            precession (a simplified model), and planets use NASA JPL&apos;s approximate orbital elements.
          </p>
        </section>
      </div>
    </div>
  );
}
