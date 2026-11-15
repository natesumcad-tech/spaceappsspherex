/** Wheel deltas are expressed in pixels, lines, or pages by different devices. */
export function wheelPixels(delta: number, mode: number, pageHeight: number) {
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? pageHeight : 1);
  return Math.max(-160, Math.min(160, pixels));
}

/** Require continued outward intent at the boundary, not just one large zoom. */
export class ZoomExitGesture {
  private outward = 0;
  private lastAt = -Infinity;
  private exited = false;

  reset() {
    this.outward = 0;
    this.lastAt = -Infinity;
    this.exited = false;
  }

  update(delta: number, atBoundary: boolean, now: number) {
    if (this.exited) return false;
    if (delta <= 0 || !atBoundary || now - this.lastAt > 500) this.outward = 0;
    this.lastAt = now;
    if (delta <= 0 || !atBoundary) return false;
    this.outward += Math.min(160, delta);
    if (this.outward < 220) return false;
    this.exited = true;
    return true;
  }
}

/** Retain one neighboring level for small zoom reversals, not old close-up textures. */
export function discardDetailedTile(level: number, maxWantedLevel: number, visible: boolean) {
  return !visible && level > maxWantedLevel + 1;
}
