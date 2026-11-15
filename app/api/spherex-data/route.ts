import { findExposures, passes } from "@/lib/spherex/blink";

/**
 * GET /api/spherex-data?ra=<deg>&dec=<deg>
 * The real SPHEREx DR1 exposures that cover a spot, grouped by survey pass, with links to download a
 * small cutout or the full image straight from NASA/IPAC IRSA. (IRSA doesn't let other sites query it
 * from the browser, so the page asks us.)
 */
export const maxDuration = 30;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const ra = Number(q.get("ra")), dec = Number(q.get("dec"));
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || ra < 0 || ra >= 360 || Math.abs(dec) > 90)
    return Response.json({ error: "Give ra (0–360) and dec (−90–90) in degrees." }, { status: 400 });
  try {
    const exps = await findExposures(ra, dec, AbortSignal.timeout(25_000));
    const cutout = (url: string) => `${url}?center=${ra.toFixed(5)},${dec.toFixed(5)}&size=0.2`;
    const groups = passes(exps).map((g) => {
      // one exposure per SPHEREx color band (the 6 detectors), the one most centred on the spot
      const byBand = new Map<string, (typeof g)[number]>();
      for (const e of g) {
        const d = (a: [number, number]) => Math.hypot((a[0] - ra) * Math.cos((dec * Math.PI) / 180), a[1] - dec);
        const cur = byBand.get(e.band);
        if (!cur || d(e.center) < d(cur.center)) byBand.set(e.band, e);
      }
      const date = (mjd: number) => new Date(Date.UTC(1858, 10, 17) + mjd * 864e5).toISOString();
      return {
        start: date(g[0].mjd),
        end: date(g[g.length - 1].mjd),
        count: g.length,
        exposures: [...byBand.values()]
          .sort((a, b) => a.umMin - b.umMin)
          .map((e) => ({ obsId: e.obsId, date: date(e.mjd), band: e.band, umMin: e.umMin, umMax: e.umMax, cutout: cutout(e.url), full: e.url })),
      };
    });
    return Response.json(
      { ra, dec, total: exps.length, passes: groups },
      { headers: { "Cache-Control": "public, max-age=3600, s-maxage=604800" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: /abort|timeout/i.test(msg) ? "NASA's IRSA archive is slow to answer right now. Try again in a minute." : msg }, { status: 502 });
  }
}
