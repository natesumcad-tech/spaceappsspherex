// Background thread that downloads IRSA tiles and reprojects them, so the page never stutters.
import { applyLive, makeLoader, renderTile, type LiveCatalog, type TileRequest } from "./hips";

const load = makeLoader();

self.onmessage = async (e: MessageEvent<TileRequest | { live: LiveCatalog }>) => {
  if ("live" in e.data) return applyLive(e.data.live);
  const req = e.data;
  try {
    const { px, partial } = await renderTile(req, load);
    (self as unknown as Worker).postMessage({ id: req.id, px, partial }, [px.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: req.id, error: String(err) });
  }
};
