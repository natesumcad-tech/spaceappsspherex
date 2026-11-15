"use client";

import { useEffect, useState } from "react";
import { useLang, useT } from "@/lib/i18n";

type Exposure = { obsId: string; date: string; band: string; umMin: number; umMax: number; cutout: string; full: string };
type Pass = { start: string; end: string; count: number; exposures: Exposure[] };
type Data = { ra: number; dec: number; total: number; passes: Pass[] };

const day = (iso: string, locale = "en-US") => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const hms = (ra: number) => {
  const h = ra / 15, hh = Math.floor(h), m = (h - hh) * 60, mm = Math.floor(m), ss = Math.round((m - mm) * 60);
  return `${hh}h ${String(mm).padStart(2, "0")}m ${String(ss).padStart(2, "0")}s`;
};
const dms = (d: number) => {
  const a = Math.abs(d), dd = Math.floor(a), m = (a - dd) * 60, mm = Math.floor(m), ss = Math.round((m - mm) * 60);
  return `${d < 0 ? "−" : "+"}${dd}° ${String(mm).padStart(2, "0")}′ ${String(ss).padStart(2, "0")}″`;
};

/**
 * "Get the real data": the actual SPHEREx exposures of a spot, ready to download, plus where scientists
 * (and citizen scientists) take it from here.
 */
export default function DataPanel({ ra, dec, onClose }: { ra: number; dec: number; onClose: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const loc = lang === "es" ? "es-ES" : "en-US";
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    setData(null);
    setError(null);
    fetch(`/api/spherex-data?ra=${ra.toFixed(4)}&dec=${dec.toFixed(4)}`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setData(j)))
      .catch(() => !ctl.signal.aborted && setError("Couldn't reach the archive. Check your connection and try again."));
    return () => ctl.abort();
  }, [ra, dec, attempt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const first = data?.passes[0]?.exposures[0];
  const python = `# pip install astropy matplotlib numpy
from astropy.io import fits
import matplotlib.pyplot as plt, numpy as np

url = "${first?.cutout ?? "<a cutout link from this panel>"}"
with fits.open(url) as f:
    img = f["IMAGE"].data            # surface brightness, MJy/sr
    lo, hi = np.nanpercentile(img, [5, 99.5])
plt.imshow(img, origin="lower", cmap="magma", vmin=lo, vmax=hi)
plt.title("SPHEREx, RA ${ra.toFixed(3)}°, Dec ${dec.toFixed(3)}°")
plt.show()`;

  const simbad = `https://simbad.cds.unistra.fr/simbad/sim-coo?Coord=${ra.toFixed(5)}%20${dec >= 0 ? "%2B" : "-"}${Math.abs(dec).toFixed(5)}&CooFrame=ICRS&Radius=3&Radius.unit=arcmin`;

  return (
    <div className="bk-wrap" role="dialog" aria-label={t("Real SPHEREx data at this spot")}>
      <div className="bk-card dp-card">
        <div className="bk-head">
          <div>
            <span className="bk-kicker">{t("Get the real data")}</span>
            <h2>
              RA {hms(ra)}, Dec {dms(dec)}
            </h2>
          </div>
          <button className="bk-x" onClick={onClose} aria-label={t("Close")}>
            ×
          </button>
        </div>
        <p className="bk-story">
          {t("Everything on this map comes from public NASA archives. Here are the actual SPHEREx images of the middle of your view: the same files astronomers download.")}
        </p>

        <section className="dp-sec">
          <h3>{t("SPHEREx images of this spot")}</h3>
          {!data && !error && (
            <div className="bk-state">
              <div className="bk-spin" aria-hidden="true" />
              <p>{t("Asking NASA/IPAC IRSA which SPHEREx exposures cover this spot…")}</p>
            </div>
          )}
          {error && (
            <div className="bk-row">
              <p className="dp-error">{t(error)}</p>
              <button className="bk-btn" onClick={() => setAttempt((a) => a + 1)}>
                {t("Try again")}
              </button>
            </div>
          )}
          {data && data.passes.length === 0 && <p className="bk-note">{t("SPHEREx hasn't imaged this exact spot in its first data release yet.")}</p>}
          {data &&
            data.passes.map((p, k) => (
              <div key={k} className="dp-pass">
                <p className="dp-pass-head">
                  <b>{t("Pass {n}", { n: k + 1 })}</b> · {day(p.start, loc)}
                  {day(p.end) !== day(p.start) && ` – ${day(p.end, loc)}`} · {t("{count} exposures", { count: p.count })}
                </p>
                <ul className="dp-list">
                  {p.exposures.map((e) => (
                    <li key={e.obsId}>
                      <span className="dp-band">
                        {e.umMin.toFixed(2)}–{e.umMax.toFixed(2)} µm
                      </span>
                      <a href={e.cutout} target="_blank" rel="noreferrer" title={`${e.obsId}: a 0.2° cutout around this spot`}>
                        {t("Cutout (FITS)")}
                      </a>
                      <a href={e.full} target="_blank" rel="noreferrer" title={`${e.obsId}: the whole 3.5° image, about 65 MB`}>
                        {t("Full image")}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </section>

        <section className="dp-sec">
          <h3>{t("How scientists use these files")}</h3>
          <ul className="dp-bullets">
            <li>{t("Each exposure records one slice of infrared colors. Stacking a spot's exposures across all 102 colors gives its spectrum: the fingerprint of ices, dust and distant galaxies.")}</li>
            <li>{t("Comparing the passes, six months apart, reveals anything that moved or changed brightness, like asteroids, comets or a distant planet.")}</li>
            <li>{t("Researchers open these exact FITS files in Python and measure the light of every star and galaxy in them. Try it:")}</li>
          </ul>
          <div className="dp-code">
            <pre>
              <code>{python}</code>
            </pre>
            <button
              className="bk-seg"
              onClick={() => {
                navigator.clipboard?.writeText(python).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? t("Copied ✓") : t("Copy")}
            </button>
          </div>
        </section>

        <section className="dp-sec">
          <h3>{t("Keep exploring")}</h3>
          <ul className="dp-links">
            <li>
              <a href={simbad} target="_blank" rel="noreferrer">
                {t("What's catalogued here ↗")}
              </a>
              <span>{t("SIMBAD: every known star, galaxy and nebula within 3′")}</span>
            </li>
            <li>
              <a href="https://caltech-ipac.github.io/irsa-tutorials/" target="_blank" rel="noreferrer">
                {t("IRSA tutorials ↗")}
              </a>
              <span>{t("Step-by-step notebooks for SPHEREx data, from NASA/IPAC")}</span>
            </li>
            <li>
              <a href="https://irsa.ipac.caltech.edu/Missions/spherex.html" target="_blank" rel="noreferrer">
                {t("SPHEREx at IRSA ↗")}
              </a>
              <span>{t("The full archive, documentation and data releases")}</span>
            </li>
            <li>
              <a href="https://backyardworlds.org/" target="_blank" rel="noreferrer">
                {t("Backyard Worlds: Planet 9 ↗")}
              </a>
              <span>{t("Citizen science: volunteers blink infrared images to find new worlds")}</span>
            </li>
            <li>
              <a href="https://www.zooniverse.org/projects?discipline=space" target="_blank" rel="noreferrer">
                {t("Zooniverse space projects ↗")}
              </a>
              <span>{t("Help real research teams classify galaxies, stars and more")}</span>
            </li>
          </ul>
        </section>
        <p className="bk-source">
          <b>{t("Real data")}</b> {t("SPHEREx DR1 Level 2 images (NASA/JPL-Caltech), served by NASA/IPAC IRSA")}
        </p>
      </div>
    </div>
  );
}
