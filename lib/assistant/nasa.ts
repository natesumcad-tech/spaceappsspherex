/** Fixed official sources only: user input can never become a fetch URL. */
export const NASA_SOURCES = [
  { id: 1, title: "NASA · SPHEREx mission", url: "https://science.nasa.gov/mission/spherex/" },
  { id: 2, title: "NASA JPL · SPHEREx science", url: "https://www.jpl.nasa.gov/press-kits/spherex/mission-overview/science/" },
  { id: 3, title: "NASA/IPAC IRSA · SPHEREx archive", url: "https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_dr1.html" },
];
export function paragraphs(html: string): string[] {
  return html.replace(/<(script|style|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|section|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .split(/\n/).map(s => s.replace(/\s+/g, " ").trim()).filter(s => s.length > 60);
}
export function relevantExcerpt(chunks: string[], question: string): string {
  const words = [...new Set(question.toLowerCase().match(/[a-z]{4,}/g) ?? [])];
  return chunks.map((text, index) => ({ text, index, score: words.filter(w => text.toLowerCase().includes(w)).length }))
    .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 4).map(c => c.text).join("\n").slice(0, 2300);
}
type Document = typeof NASA_SOURCES[number] & { chunks: string[] };
let cached: { expires: number; docs: Document[] } | undefined;
let pending: Promise<Document[]> | undefined;
async function documents(): Promise<Document[]> {
  if (cached && cached.expires > Date.now()) return cached.docs;
  if (pending) return pending;
  pending = Promise.all(NASA_SOURCES.map(async source => {
    try {
      const response = await fetch(source.url, { signal: AbortSignal.timeout(6000), redirect: "error" });
      if (!response.ok) return null;
      const chunks = paragraphs(await response.text());
      return chunks.length ? { ...source, chunks } : null;
    } catch { return null; }
  })).then(results => {
    const docs = results.filter((d): d is Document => d !== null);
    cached = { docs, expires: Date.now() + (docs.length === NASA_SOURCES.length ? 900000 : 60000) };
    return docs;
  }).finally(() => { pending = undefined; });
  return pending;
}
export async function retrieveNasa(question: string) {
  return (await documents()).map(({ chunks, ...source }) => ({ ...source, excerpt: relevantExcerpt(chunks, question) }));
}
export const DEFAULT_FOLLOWUPS = ["What does SPHEREx measure?", "How does infrared reveal dust?", "Where can I find NASA's data?"];
export function followups(value: unknown): string[] {
  const valid = Array.isArray(value) ? value.filter((q): q is string => typeof q === "string" && !!q.trim()).map(q => q.trim().slice(0, 100)) : [];
  return [...new Set([...valid, ...DEFAULT_FOLLOWUPS])].slice(0, 3);
}
