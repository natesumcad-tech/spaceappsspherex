import { makeBlink } from "@/lib/spherex/blink";

/**
 * GET /api/blink?ra=<deg>&dec=<deg>&size=<deg>
 * Two real SPHEREx exposures of this patch of sky about six months apart, lined up for blinking, plus
 * where the planets were on each date. Fetched from NASA/IPAC IRSA on demand; results are cached by
 * the CDN (the archive doesn't change), so each spot is only fetched once.
 */
export const maxDuration = 60;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const ra = Number(q.get("ra")), dec = Number(q.get("dec"));
  const size = Math.min(1.6, Math.max(0.25, Number(q.get("size")) || 0.6));
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || ra < 0 || ra >= 360 || Math.abs(dec) > 90)
    return Response.json({ error: "Give ra (0–360) and dec (−90–90) in degrees." }, { status: 400 });
  try {
    const blink = await makeBlink(ra, dec, size, 360, 2, AbortSignal.timeout(55_000));
    return Response.json(blink, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=2592000" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const timeout = /abort|timeout/i.test(msg);
    return Response.json(
      { error: timeout ? "NASA's IRSA archive is slow to answer right now. Try again in a minute, or try the featured blink." : msg },
      { status: /only once|No SPHEREx/.test(msg) ? 404 : 502 },
    );
  }
}
