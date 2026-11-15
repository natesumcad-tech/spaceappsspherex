const CODE_MAP: Record<string, string> = {
  KeyW: "w",
  KeyA: "a",
  KeyS: "s",
  KeyD: "d",
  ArrowUp: "arrowup",
  ArrowDown: "arrowdown",
  ArrowLeft: "arrowleft",
  ArrowRight: "arrowright",
  KeyQ: "q",
  KeyE: "e",
  KeyR: "r",
  KeyF: "f",
  KeyZ: "z",
  KeyX: "x",
  Equal: "=",
  NumpadAdd: "=",
  Minus: "-",
  NumpadSubtract: "-",
  ShiftLeft: "shiftleft",
  ShiftRight: "shiftright",
};

const VALID_TOKENS = new Set([
  "w",
  "a",
  "s",
  "d",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "q",
  "e",
  "r",
  "f",
  "z",
  "x",
  "=",
  "-",
  "shift",
  "shiftleft",
  "shiftright",
]);

/**
 * Normalize a keyboard event to a canonical navigation token using physical `e.code`
 * first (preventing stuck keys when Shift/CapsLock alters `e.key`), falling back to `e.key`.
 */
export function normalizeNavKey(e: { code?: string; key?: string }): string | null {
  if (e.code) {
    return CODE_MAP[e.code] ?? null;
  }
  const raw = e.key?.toLowerCase();
  if (!raw) return null;
  const mapped = raw === "+" ? "=" : raw === "_" ? "-" : raw;
  return VALID_TOKENS.has(mapped) ? mapped : null;
}

export function isShiftToken(token: string | null): boolean {
  return token === "shiftleft" || token === "shiftright" || token === "shift";
}

/**
 * Tracks currently held physical keys independently of OS key-repeat delay and repeat rate.
 */
export class KeyState {
  private held = new Set<string>();

  keydown(
    e: { code?: string; key?: string; repeat?: boolean },
    allowed?: ReadonlySet<string>,
  ): { token: string | null; added: boolean } {
    const token = normalizeNavKey(e);
    if (!token || (allowed && !allowed.has(token))) {
      return { token: null, added: false };
    }
    if (e.repeat) {
      return { token, added: false };
    }
    const had = this.held.has(token);
    this.held.add(token);
    return { token, added: !had };
  }

  keyup(e: { code?: string; key?: string }): boolean {
    let deleted = false;
    const byCode = normalizeNavKey(e);
    if (byCode && this.held.delete(byCode)) {
      deleted = true;
    }
    if (e.key) {
      const byKey = normalizeNavKey({ key: e.key });
      if (byKey && this.held.delete(byKey)) {
        deleted = true;
      }
    }
    return deleted;
  }

  has(...tokens: string[]): boolean {
    return tokens.some((t) => this.held.has(t));
  }

  get shift(): boolean {
    return this.held.has("shiftleft") || this.held.has("shiftright") || this.held.has("shift");
  }

  get hasActiveMotion(): boolean {
    for (const token of this.held) {
      if (!isShiftToken(token)) return true;
    }
    return false;
  }

  get size(): number {
    return this.held.size;
  }

  clear(): void {
    this.held.clear();
  }
}
