import { SPHEREX_RGB, type TileRequest } from "./hips";

/**
 * A small real SPHEREx image of any spot on the sky, cut live from the same IRSA all-sky data the map
 * streams (drawn in the background worker), as a data URL. Cached per spot.
 */
let worker: Worker | null = null;
let nextId = 5_000_000;
const waiting = new Map<number, (px: Uint8ClampedArray | null) => void>();
const cache = new Map<string, Promise<string | null>>();

export function spherexCutout(ra: number, dec: number, fov: number, size = 320): Promise<string | null> {
  const key = `${ra.toFixed(3)},${dec.toFixed(3)},${fov},${size}`;
  let p = cache.get(key);
  if (p) return p;
  p = new Promise<string | null>((resolve) => {
    if (typeof Worker === "undefined") return resolve(null);
    if (!worker) {
      worker = new Worker(new URL("./tile.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (e: MessageEvent<{ id: number; px?: Uint8ClampedArray }>) => {
        const cb = waiting.get(e.data.id);
        waiting.delete(e.data.id);
        cb?.(e.data.px ?? null);
      };
    }
    const id = ++nextId;
    const timer = setTimeout(() => {
      waiting.delete(id);
      resolve(null);
    }, 30_000);
    waiting.set(id, (px) => {
      clearTimeout(timer);
      if (!px) return resolve(null);
      const c = document.createElement("canvas");
      c.width = c.height = size;
      c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(px), size, size), 0, 0);
      resolve(c.toDataURL("image/jpeg", 0.88));
    });
    const req: TileRequest = {
      id,
      x0: 0,
      y0: 0,
      w: fov,
      h: fov,
      W: size,
      H: size,
      years: 0,
      base: "spherex",
      frames: [...SPHEREX_RGB],
      overlays: [],
      light: true,
      detail: 1,
      gnomonic: { ra, dec, fov },
    };
    worker.postMessage(req);
  });
  p.then((v) => v === null && cache.delete(key));
  cache.set(key, p);
  return p;
}
