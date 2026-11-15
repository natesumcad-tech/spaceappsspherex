/** CDS Sesame supplies catalogue J2000 positions; never accept model-guessed coordinates. */
export function parseResolvedPosition(xml: string) {
  const ra = Number(xml.match(/<jradeg>\s*([^<]+)<\/jradeg>/)?.[1] ?? NaN);
  const dec = Number(xml.match(/<jdedeg>\s*([^<]+)<\/jdedeg>/)?.[1] ?? NaN);
  return Number.isFinite(ra) && ra >= 0 && ra < 360 && Number.isFinite(dec) && Math.abs(dec) <= 90 ? { ra, dec } : null;
}
export async function resolveObject(name: string) {
  if (!name.trim() || name.length > 120) return null;
  const url = `https://cds.unistra.fr/cgi-bin/nph-sesame/-oxp/SNV?${encodeURIComponent(name.trim())}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12000), next: { revalidate: 86400 } });
    if (!response.ok) return null;
    const position = parseResolvedPosition(await response.text());
    return position ? { ...position, url } : null;
  } catch { return null; }
}
