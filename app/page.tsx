import Image from "next/image";
import Link from "next/link";
import SpectrumExplorer from "@/components/SpectrumExplorer";
import { site, project, team, mission, resources } from "@/content/site";
import "./home.css";

const NAV = [
  ["/map", "Star Map"],
  ["#how", "How it works"],
  ["#spectrum", "Spectrum"],
  ["#mission", "Mission"],
  ["#team", "Team"],
];

// 102 bars: one for each SPHEREx band, shaped like a gentle spectrum
const BARS = Array.from({ length: 102 }, (_, i) => {
  const x = i / 101;
  const h = 0.25 + 0.55 * Math.exp(-((x - 0.3) ** 2) / 0.05) + 0.25 * Math.abs(Math.sin(i * 1.7)) * (1 - x * 0.5);
  return Math.min(1, h);
});

export default function Home() {
  return (
    <div className="home">
      {/* ── Hero ── */}
      <header className="h-hero">
        <div className="h-sky" aria-hidden="true" />
        <nav className="h-nav">
          <Link href="/" className="h-logo">
            <span className="h-logo-mark" aria-hidden="true" />
            {site.teamName}
          </Link>
          <div className="h-links">
            {NAV.map(([href, label]) => (
              <a key={href} href={href}>
                {label}
              </a>
            ))}
          </div>
        </nav>

        <div className="h-hero-copy">
          <p className="h-kicker">NASA Space Apps · Planet X & SPHEREx</p>
          <h1>
            Step inside the sky
            <br />
            <em>SPHEREx</em> is mapping
          </h1>
          <p className="h-lede">
            Fly over SPHEREx&apos;s brand-new all-sky map in 2D or 3D, scroll through its 102 infrared colors, travel back in
            time, then step inside stars, planets and the Milky Way in 360°.
          </p>
          <div className="h-ctas">
            <Link href="/explore" className="h-btn">
              <span aria-hidden="true">◎</span> Launch the Sky Explorer
            </Link>
            <Link href="/map" className="h-btn-ghost">
              Open the Star Map →
            </Link>
          </div>
        </div>

        <div className="h-stage">
          <div className="h-wallpaper" aria-hidden="true" />
          <div className="h-pill" aria-hidden="true">
            <span className="h-pill-dot" /> Sky Explorer <span className="h-pill-key">Esc</span> <span className="h-pill-sq" />
          </div>
          <Link href="/explore?stop=saturn" className="h-window" aria-label="Open the Saturn stop in the Sky Explorer">
            <div className="h-chrome">
              <span />
              <span />
              <span />
              <div className="h-url">spaceappsspherex.vercel.app/explore</div>
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
            How the Sky Explorer <span>takes you there</span>
          </h2>
          <div className="h-cards">
            <article className="h-card h-card-color">
              <h3>
                SPHEREx <span className="h-chip">◉ sees</span> 102 colors of light
              </h3>
              <p>Every point on the sky, split into infrared colors our eyes can't see. We turned that idea into a place you can visit.</p>
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
              <h3>
                When you&apos;re curious, hover and it <span className="h-chip light">✦ explains</span> instantly
              </h3>
              <p>
                Diamonds mark the good stuff. Hover one to unfold a fact card, or press <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd>{" "}
                <kbd>D</kbd> to fly around a planet.
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
            The whole sky <span>as a map you can fly</span>
          </h2>
          <p className="h-sub">
            SPHEREx Data Release 1, streamed live from NASA/IPAC&apos;s Infrared Science Archive. Pan, orbit and zoom like Google
            Maps, tilt into 3D, and hyperspace-jump between waypoints.
          </p>
          <div className="h-panel">
            <Link href="/map" className="h-panel-window" aria-label="Open the Star Map">
              <div className="h-chrome light">
                <span />
                <span />
                <span />
                <div className="h-url">spaceappsspherex.vercel.app/map</div>
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
              <b>Your waypoints</b>
              <span>Press Shift+G to drop your own, in pastel colors</span>
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
            See light <span>the way SPHEREx does</span>
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
            The mission <span>behind the map</span>
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
            Our project <span>{project.challenge}</span>
          </h2>
          <div className="h-project">
            <div className="h-box">
              <h3>The problem</h3>
              <p>{project.problem}</p>
              <h3>Our solution</h3>
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

        {/* ── Team ── */}
        <section id="team" className="h-section">
          <h2 className="h-split center">
            Made by <span>{site.teamName}</span>
          </h2>
          <ul className="h-team">
            {team.map((m, i) => (
              <li key={m.name}>
                <span className={`h-avatar tint-${i % 4}`} aria-hidden="true">
                  {m.name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)}
                </span>
                <b>{m.name}</b>
                <span>{m.role}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Resources + final CTA ── */}
        <section className="h-section">
          <h2 className="h-split center">
            Data <span>& references</span>
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

        <section className="h-final">
          <h2>
            Ready to <em>step inside?</em>
          </h2>
          <Link href="/explore" className="h-btn">
            <span aria-hidden="true">◎</span> Launch the Sky Explorer
          </Link>
        </section>
      </main>

      <footer className="h-footer">
        <span>
          Built for the {site.event} by {site.teamName}.
        </span>
        <span>
          <a href={site.teamPageUrl} target="_blank" rel="noreferrer">
            Team page
          </a>{" "}
          ·{" "}
          <a href={site.repoUrl} target="_blank" rel="noreferrer">
            Source code
          </a>
        </span>
        <span className="h-fine">
          SPHEREx mission information courtesy of NASA/JPL-Caltech. A student hackathon project, not an official NASA website.
        </span>
      </footer>
    </div>
  );
}
