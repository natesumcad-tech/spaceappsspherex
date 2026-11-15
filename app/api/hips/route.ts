import type { LiveCatalog } from "@/lib/starmap/hips";

/**
 * GET /api/hips
 * Which SPHEREx all-sky map is current, read live from NASA/IPAC IRSA's HiPS catalogue. When IRSA
 * re-publishes the map (or a new data release replaces DR1) the Star Map picks it up from here: the
 * new tiles, dates and wavelengths, with no change to the site. Cached for an hour at the edge.
 */
export const maxDuration = 20;

const LIST = "https://irsa.ipac.caltech.edu/data/hips/list";

type Props = Record<string, string>;
const parse = (text: string): Props[] =>
  text.split(/\n\s*\n/).map((block) => {
    const p: Props = {};
    for (const line of block.split("\n")) {
      const m = line.match(/^([a-z_0-9]+)\s*=\s*(.*)$/i);
      if (m) p[m[1]] = m[2].trim();
    }
    return p;
  });

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (d: Date) => `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const mjd = (v?: string) => (v && Number.isFinite(+v) ? new Date((+v - 40587) * 864e5) : null);

async function get(url: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status}`);
      return await r.text();
    } catch (e) {
      if (attempt >= 1) throw e;
    }
  }
}

export async function GET() {
  try {
    const all = parse(await get(LIST));
    // The SPHEREx all-sky cube with the highest data release number, newest first
    const cubes = all
      .filter((p) => /SPHEREx\/DR(\d+)\/cube/i.test(p.creator_did ?? "") && +(p.moc_sky_fraction ?? 0) > 0.99 && p.hips_service_url)
      .map((p) => ({ p, dr: +(p.creator_did.match(/DR(\d+)/i)?.[1] ?? 0) }))
      .sort((a, b) => b.dr - a.dr || (b.p.hips_release_date ?? "").localeCompare(a.p.hips_release_date ?? ""));
    if (!cubes.length) throw new Error("no SPHEREx map in the catalogue");
    const { p: entry, dr } = cubes[0];
    const url = entry.hips_service_url.replace(/^http:/, "https:");
    const props: Props = Object.assign({}, ...parse(await get(`${url}/properties`))); // one record, blank lines and all
    const release = props.hips_release_date ?? entry.hips_release_date ?? "";
    const tMin = mjd(props.t_min), tMax = mjd(props.t_max);
    const wavelengths = (props.data_cube_crval3_arr ?? "").split(/\s+/).map(Number).filter((n) => n > 0);
    // "Frames 50 and 51 (...) are blank."
    const blankText = props.obs_description?.match(/Frames? ([\d ,and]+?)\s*\([^)]*\)\s*are blank/i)?.[1] ?? "";
    const blank = (blankText.match(/\d+/g) ?? []).map(Number);

    // Release dates of the other surveys on the map, by address
    const layers: Record<string, string> = {};
    for (const p of all) if (p.hips_service_url && p.hips_release_date) layers[p.hips_service_url.replace(/^http:/, "https:")] = day(new Date(p.hips_release_date));

    const body: LiveCatalog = {
      spherex: {
        url,
        name: props.obs_collection || `SPHEREx DR${dr}`,
        v: release,
        released: release ? day(new Date(release)) : "",
        observed: tMin && tMax ? `${day(tMin)} – ${day(tMax)}` : "",
        maxOrder: +(props.hips_order ?? entry.hips_order ?? 5),
        ...(wavelengths.length ? { wavelengths } : {}),
        ...(blank.length ? { blank } : {}),
      },
      layers,
      checkedAt: new Date().toISOString(),
    };
    return Response.json(body, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (e) {
    return Response.json({ error: `IRSA's catalogue didn't answer (${String(e)}).` }, { status: 502 });
  }
}
