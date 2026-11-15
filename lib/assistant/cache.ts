export interface CacheMessage {
  role: "user" | "model";
  text: string;
}

export interface ChatCachePayload {
  reply: string;
  actions: { name: string; args: Record<string, unknown> }[];
  followups: string[];
  sources: { id: number; title: string; url: string }[];
  sourceStatus?: "available" | "unavailable";
}

/**
 * Prompts that rely on where the camera is currently pointing ("what am I looking at?", "this star",
 * "in view", "right now", or coordinate lookups) must include the view's spatial coordinates in the
 * cache key. Global astronomy / navigation prompts ("Take me to Andromeda", "Where does SPHEREx look
 * for ice?") normalize away tiny camera jitter so users share cache hits across map positions!
 */
const VIEW_DEPENDENT_RE =
  /\b(here|this|these|looking at|in view|on screen|around here|nearby|current|hovering|selected|what star|which star|what constellation|which constellation|what galaxy|what planet|where am i)\b/i;

export function isViewDependentPrompt(messages: CacheMessage[], hasCoordQuestion = false): boolean {
  if (hasCoordQuestion) return true;
  const recentUser = messages
    .filter((m) => m.role === "user")
    .slice(-2)
    .map((m) => m.text)
    .join(" ");
  return VIEW_DEPENDENT_RE.test(recentUser);
}

export function normalizePromptText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeCacheContext(
  rawContext: unknown,
  viewDependent: boolean,
): Record<string, unknown> {
  if (!rawContext || typeof rawContext !== "object") return {};
  const ctx = rawContext as Record<string, unknown>;

  const base: Record<string, unknown> = {
    view: ctx.view ?? null,
    in_360_view_of: ctx.in_360_view_of ?? null,
    timeline: ctx.timeline ?? null,
    imagery: ctx.imagery ?? null,
  };

  if (!viewDependent) {
    return base;
  }

  const center =
    ctx.map_center && typeof ctx.map_center === "object"
      ? (ctx.map_center as Record<string, unknown>)
      : null;
  const ra = Number(center?.ra_deg);
  const dec = Number(center?.dec_deg);
  const fov = Number(ctx.field_of_view_deg);

  return {
    ...base,
    // Bucket camera center to 0.5° and FOV to 1° so sub-pixel camera drift still hits cache
    map_center:
      Number.isFinite(ra) && Number.isFinite(dec)
        ? { ra_deg: Math.round(ra * 2) / 2, dec_deg: Math.round(dec * 2) / 2 }
        : null,
    field_of_view_deg: Number.isFinite(fov) ? Math.round(fov) : null,
    hovering: ctx.hovering ?? null,
    places_in_view: Array.isArray(ctx.places_in_view) ? ctx.places_in_view.slice(0, 8) : [],
  };
}

export function buildChatCacheKey(
  model: string,
  messages: CacheMessage[],
  rawContext: unknown,
  hasCoordQuestion = false,
): string {
  const viewDep = isViewDependentPrompt(messages, hasCoordQuestion);
  const normMsgs = messages.map((m) => ({
    r: m.role,
    t: normalizePromptText(m.text),
  }));
  const normCtx = normalizeCacheContext(rawContext, viewDep);
  return JSON.stringify({ v: 1, m: model, msgs: normMsgs, ctx: normCtx });
}

export class ResponseCache<T> {
  private store = new Map<string, { value: T; expiresAt: number }>();
  private inflight = new Map<string, Promise<T>>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(maxEntries = 250, ttlMs = 30 * 60 * 1000) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  get size(): number {
    return this.store.size;
  }

  get(key: string, now = Date.now()): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.store.delete(key);
      return undefined;
    }
    // Refresh LRU order
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlOverrideMs?: number, now = Date.now()): void {
    const ttl = ttlOverrideMs ?? this.ttlMs;
    if (ttl <= 0) return;
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expiresAt: now + ttl });
    while (this.store.size > this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey === undefined) break;
      this.store.delete(oldestKey);
    }
  }

  /**
   * Deduplicates concurrent identical GenAI requests so simultaneous identical questions share
   * a single upstream Gemini API call, and only caches successful completions.
   */
  async getOrCompute(
    key: string,
    compute: () => Promise<{ value: T; cacheable?: boolean; ttlMs?: number }>,
  ): Promise<{ value: T; hit: boolean }> {
    const hit = this.get(key);
    if (hit !== undefined) {
      return { value: hit, hit: true };
    }

    const existing = this.inflight.get(key);
    if (existing) {
      const value = await existing;
      return { value, hit: true };
    }

    const promise = (async () => {
      const { value, cacheable = true, ttlMs } = await compute();
      if (cacheable) {
        this.set(key, value, ttlMs);
      }
      return value;
    })();

    this.inflight.set(key, promise);
    try {
      const value = await promise;
      return { value, hit: false };
    } finally {
      this.inflight.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
    this.inflight.clear();
  }
}

// Persist across Next.js hot reloads / warm serverless invocations
const globalForChatCache = globalThis as unknown as {
  __skyExplorerChatCache?: ResponseCache<ChatCachePayload>;
};

export const serverChatCache =
  globalForChatCache.__skyExplorerChatCache ??
  (globalForChatCache.__skyExplorerChatCache = new ResponseCache<ChatCachePayload>(300, 30 * 60 * 1000));
