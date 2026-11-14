// Background thread that downloads IRSA tiles and reprojects them, so the page never stutters.
import { makeLoader, renderTile, type TileRequest } from "./hips";

const load = makeLoader();

self.onmessage = async (e: MessageEvent<TileRequest>) => {
  const req = e.data;
  try {
    const { px, partial } = await renderTile(req, load);
    (self as unknown as Worker).postMessage({ id: req.id, px, partial }, [px.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: req.id, error: String(err) });
  }
};
