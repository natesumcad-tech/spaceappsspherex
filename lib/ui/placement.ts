/**
 * Where a card that lives "at the top" can sit without covering the controls up there: centred in the
 * free gap between the top-left controls and the right-hand panels, or, if that gap is too narrow
 * (small screens, the 360° view), centred just below them.
 */
export function topSlot(want: number, minGap = 360) {
  const W = window.innerWidth, pad = 12;
  const rect = (sel: string) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width && r.height && getComputedStyle(el).visibility !== "hidden" ? r : null;
  };
  const leftRow = rect(".mv-top-row");
  const right = [rect(".mv-top-right .mv-actions"), rect(".mv-minicard"), rect(".xp-toolbar")].filter((r): r is DOMRect => !!r && r.left > W / 2);
  const middle = [rect(".xp-hint.top")].filter((r): r is DOMRect => !!r);
  const L = leftRow ? leftRow.right + pad : pad;
  const R = Math.min(W - pad, ...right.map((r) => r.left - pad));
  if (R - L >= Math.min(want, minGap) && !middle.length) {
    const width = Math.min(want, R - L);
    return { left: L + (R - L - width) / 2, top: 14, width };
  }
  const width = Math.min(want, W - pad * 2);
  const below = Math.max(leftRow?.bottom ?? 0, ...middle.map((r) => r.bottom), ...right.filter((r) => r.top < 80).map((r) => r.bottom));
  return { left: (W - width) / 2, top: below + 10, width };
}
