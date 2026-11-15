import PageTransition from "@/components/PageTransition";
import Image from "next/image";
import Link from "next/link";
import SiteTabs from "@/components/SiteTabs";
import ResetTutorialButton from "@/components/ResetTutorialButton";
import ScrollReveal from "@/components/ScrollReveal";
import SpectrumExplorer from "@/components/SpectrumExplorer";
import { site, project, mission, resources, credits, aiUse } from "@/content/site";
import "./home.css";

// 102 bars: one for each SPHEREx band, shaped like a gentle spectrum
const BARS = Array.from({ length: 102 }, (_, i) => {
  const x = i / 101;
  const h = 0.25 + 0.55 * Math.exp(-((x - 0.3) ** 2) / 0.05) + 0.25 * Math.abs(Math.sin(i * 1.7)) * (1 - x * 0.5);
  return Math.min(1, h);
});

export default function Home() {
  return (
    <PageTransition>
    <div className="home">
      <ScrollReveal />
      {/* ── Hero ── */}
      <header className="h-hero">
        <div className="h-sky" aria-hidden="true" />
        <div className="h-nav">
          <div className="h-brand">
            <Link href="/" className="h-logo">
              <span className="h-logo-mark" aria-hidden="true" />
              {site.projectName}
            </Link>
            <ResetTutorialButton />
          </div>
          <SiteTabs active="home" />
        </div>

        <div className="h-hero-copy">
          <p className="h-kicker">NASA Space Apps · Planet X & SPHEREx</p>
          <h1>
            Explore the infrared sky mapped by <em>SPHEREx</em>
          </h1>
          <p className="h-lede">
            An interactive map built on SPHEREx Data Release 1. Pan across the whole sky in 2D or 3D, scan its 102 infrared
            bands, rewind the sky 14,000 years, and open 360° views of stars, planets, galaxies and all 88 constellations.
          </p>
          <div className="h-ctas">
            <Link transitionTypes={["site-navigation"]} href="/map" className="h-btn">
              <span aria-hidden="true">◎</span> Open the Sky Explorer
            </Link>
            <a href="#how" className="h-btn-ghost">
              How it works ↓
            </a>
          </div>
        </div>

        <div className="h-stage">
          <div className="h-wallpaper" aria-hidden="true" />
          <div className="h-pill" aria-hidden="true">
            <span className="h-pill-dot" /> Sky Explorer <span className="h-pill-key">Esc</span> <span className="h-pill-sq" />
          </div>
          <Link href="/map?stop=saturn" className="h-window" aria-label="Open the Saturn stop in the Sky Explorer">
            <div className="h-chrome">
              <span />
              <span />
              <span />
              <div className="h-url">orbit3d.earth/map</div>
            </div>
            <Image
              src="/shots/explorer-saturn.jpg"
              alt="The Sky Explorer inside the Saturn sphere, with a hotspot card about Saturn's rings open"
              width={2560}
              height={1520}
              priority
              sizes="(max-width: 1100px) 92vw, 960px"
            />
          </Link>
        </div>
      </header>

      <main>
        {/* ── How it works: two cards ── */}
        <section id="how" className="h-section">
          <h2 className="h-split">
            Built on real SPHEREx data <span>01 · How it works</span>
          </h2>
          <div className="h-cards">
            <article className="h-card h-card-color">
              <h3>102 infrared bands for every point on the sky</h3>
              <p>
                SPHEREx DR1 imagery streams straight from NASA/IPAC&apos;s archive. View it in color, one wavelength at a time, or
                switch to 2MASS.
              </p>
              <div className="h-counter">
                <strong>102</strong>
                <span>infrared bands</span>
              </div>
              <div className="h-bars" aria-hidden="true">
                {BARS.map((h, i) => (
                  <i key={i} style={{ height: `${h * 100}%` }} />
                ))}
              </div>
              <div className="h-mini h-mini-blur" aria-hidden="true">
                <Image src="/shots/starmap-3d.jpg" alt="" width={2560} height={1520} sizes="420px" />
              </div>
            </article>

            <article className="h-card h-card-light">
              <h3>Find a diamond, fly there, step inside</h3>
              <p>
                Diamonds mark notable objects. Click once to fly there, again to open a 360° view, then orbit it or fly with{" "}
                <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd>.
              </p>
              <div className="h-mini" aria-hidden="true">
                <Image src="/shots/explorer-orion.jpg" alt="" width={2560} height={1520} sizes="420px" />
              </div>
            </article>
          </div>
        </section>

        {/* ── Showcase panel ── */}
        <section className="h-section">
          <h2 className="h-split center">
            One map of the whole sky <span>02 · Star Map</span>
          </h2>
          <p className="h-sub">
            SPHEREx Data Release 1, streamed live from NASA/IPAC&apos;s Infrared Science Archive. Pan, orbit and zoom like Google
            Maps, tilt into 3D, and hyperspace-jump between waypoints.
          </p>
          <div className="h-panel">
            <Link transitionTypes={["site-navigation"]} href="/map" className="h-panel-window" aria-label="Open the Star Map">
              <div className="h-chrome light">
                <span />
                <span />
                <span />
                <div className="h-url">orbit3d.earth/map</div>
              </div>
              <Image
                src="/shots/starmap-2d.jpg"
                alt="The Star Map in 2D over Orion, with the Orion Nebula waypoint card open"
                width={2560}
                height={1520}
                sizes="(max-width: 900px) 92vw, 760px"
              />
            </Link>
          </div>
          <ul className="h-features">
            <li>
              <b>Real SPHEREx data</b>
              <span>DR1 all-sky map from IRSA, in all 102 colors, plus 2MASS, Spitzer and MSX layers</span>
            </li>
            <li>
              <b>2D ⇄ 3D</b>
              <span>Tilt the map into 3D; let go near flat and it snaps back to 2D</span>
            </li>
            <li>
              <b>Timeline</b>
              <span>See the sky drift from 12,000 BCE to 14,000 CE</span>
            </li>
            <li>
              <b>Blink real passes</b>
              <span>Flip between two SPHEREx images taken 6 months apart: stars stay put, planets jump</span>
            </li>
            <li>
              <b>Export & share</b>
              <span>Save any view as a PNG or share a link</span>
            </li>
            <li>
              <b>6 languages</b>
              <span>Star names in English, Spanish, French, Chinese, Hindi, Arabic</span>
            </li>
          </ul>
        </section>

        {/* ── Spectrum explorer ── */}
        <section id="spectrum" className="h-section">
          <h2 className="h-split center">
            How SPHEREx splits light <span>03 · Spectrum lab</span>
          </h2>
          <p className="h-sub">
            Each dot is one of SPHEREx&apos;s 102 bands. Push a galaxy farther away and watch its light stretch, or switch to an
            icy cloud to see the fingerprints of frozen water and CO₂.
          </p>
          <div className="h-wide">
            <SpectrumExplorer />
          </div>
        </section>

        {/* ── Mission ── */}
        <section id="mission" className="h-section">
          <h2 className="h-split center">
            SPHEREx at a glance <span>04 · The mission</span>
          </h2>
          <p className="h-sub">
            NASA&apos;s SPHEREx splits near-infrared light into 102 colors for every point on the sky, building the first all-sky
            spectral map.
          </p>
          <div className="h-stats">
            {mission.stats.map((s, i) => (
              <div className={`h-stat tint-${i % 4}`} key={s.label}>
                <strong>{s.value}</strong>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
          <div className="h-goals">
            {mission.goals.map((g, i) => (
              <article key={g.title} className={`h-goal tint-${(i + 1) % 4}`}>
                <span className="h-goal-num">0{i + 1}</span>
                <h3>{g.title}</h3>
                <p>{g.body}</p>
              </article>
            ))}
          </div>
          <dl className="h-facts">
            {mission.facts.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ── Project ── */}
        <section id="project" className="h-section">
          <h2 className="h-split center">
            {project.challenge} <span>05 · The project</span>
          </h2>
          <div className="h-project">
            <div className="h-box">
              <h3>The problem</h3>
              <p>{project.problem}</p>
              <h3>The solution</h3>
              <p>{project.solution}</p>
            </div>
            <div className="h-box">
              <h3>How it works</h3>
              <ol>
                {project.howItWorks.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              <h3>Built with</h3>
              <ul className="h-tags">
                {project.tools.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── Resources + final CTA ── */}
        <section className="h-section">
          <h2 className="h-split center">
            Data & references <span>06 · Sources</span>
          </h2>
          <ul className="h-resources">
            {resources.map((r) => (
              <li key={r.url}>
                <a href={r.url} target="_blank" rel="noreferrer">
                  <b>{r.title}</b>
                  <span>{r.note} ↗</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Credits & AI use ── */}
        <section id="credits" className="h-section">
          <h2 className="h-split center">
            Credits <span>07 · Data, code & AI</span>
          </h2>
          <div className="h-project">
            <div className="h-box">
              <h3>Data and acknowledgments</h3>
              <ul className="h-credits">
                {credits.map((c) => (
                  <li key={c.title}>
                    <b>{c.url ? <a href={c.url} target="_blank" rel="noreferrer">{c.title}</a> : c.title}</b>
                    <span>{c.text}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="h-box">
              <h3>How AI was used</h3>
              <ul className="h-credits">
                {aiUse.map((c) => (
                  <li key={c.title}>
                    <b>{c.title}</b>
                    <span>{c.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="h-final">
          <p className="h-final-label">Runs in your browser · no install · live data from IRSA</p>
          <h2>
            Open the <em>Sky Explorer</em>
          </h2>
          <Link transitionTypes={["site-navigation"]} href="/map" className="h-btn">
            <span aria-hidden="true">◎</span> Start at the origin
          </Link>
        </section>
      </main>

      <footer className="h-footer">
        <span>
          Built for the {site.event}.
        </span>
        <span>
          <a href="#credits">Credits</a>
        </span>
        <span className="h-fine">
          SPHEREx mission information courtesy of NASA/JPL-Caltech. A student hackathon project, not an official NASA website.
        </span>
      </footer>
    </div>
    </PageTransition>
  );
}
