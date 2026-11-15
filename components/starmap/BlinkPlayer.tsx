"use client";

/**
 * The Blink panel: compare two real SPHEREx exposures of the middle of your view, taken about six
 * months apart (stars stay put; anything in our solar system jumps), or open the featured example.
 */
export default function BlinkPlayer({
  fov,
  onFovChange,
  onBlinkHere,
  onFeatured,
}: {
  fov: number;
  onFovChange: (fov: number) => void;
  onBlinkHere: () => void;
  onFeatured: () => void;
}) {
  return (
    <div className="mv-blink-bar">
      <div className="mv-blink-row">
        <span className="mv-blink-title">Blink · SPHEREx passes</span>
        <button type="button" className="mv-coord-btn" onClick={onBlinkHere} title="Compare two real SPHEREx images of the middle of your view, ~6 months apart">
          ▶ Blink here
        </button>
        <button type="button" className="mv-coord-btn" onClick={onFeatured} title="Neptune and Saturn caught moving, June vs December 2025">
          ★ Planets moving
        </button>
      </div>
      <p className="mv-blink-help">Two real SPHEREx images of the middle of your view, about 6 months apart. Things that move give themselves away.</p>
      <div className="mv-blink-row">
        <label className="mv-blink-fov">
          <span>FOV: {fov < 2 ? `${fov.toFixed(1)}°` : `${fov.toFixed(0)}°`}</span>
          <input type="range" min={0.3} max={60} step={0.1} value={Math.min(60, Math.max(0.3, fov))} onChange={(e) => onFovChange(Number(e.target.value))} />
        </label>
      </div>
    </div>
  );
}
