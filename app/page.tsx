import Starfield from "@/components/Starfield";
import SpectrumExplorer from "@/components/SpectrumExplorer";
import { site, project, team, mission, resources } from "@/content/site";

const NAV = [
  ["mission", "Mission"],
  ["explore", "Explore"],
  ["project", "Our project"],
  ["team", "Team"],
  ["resources", "Resources"],
];

export default function Home() {
  return (
    <>
      <header className="nav">
        <a href="#top" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          {site.teamName}
        </a>
        <nav>
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>
      </header>

      <main id="top">
        <section className="hero">
          <Starfield />
          <div className="hero-inner">
            <p className="eyebrow">
              {site.event} · SPHEREx
            </p>
            <h1>{site.projectName}</h1>
            <p className="lede">{site.tagline}</p>
            <div className="cta-row">
              <a className="btn primary" href="#explore">
                Try the spectrum explorer
              </a>
              <a className="btn" href="#project">
                See our project
              </a>
            </div>
          </div>
          <div className="spectrum-bar" aria-hidden="true" />
        </section>

        <section id="mission" className="section">
          <div className="wrap">
            <p className="eyebrow">The mission</p>
            <h2>A rainbow map of the entire sky</h2>
            <p className="section-lede">
              Most sky surveys take pictures in a handful of colors. NASA's SPHEREx splits near-infrared
              light into <strong>102 colors</strong> for every point on the sky, building the first all-sky
              spectral map. It answers questions from the birth of the Universe to the origins of water in
              planetary systems.
            </p>

            <div className="stats">
              {mission.stats.map((s) => (
                <div className="stat" key={s.label}>
                  <div className="stat-value">{s.value}</div>
                  <div className="stat-label">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="cards">
              {mission.goals.map((g, i) => (
                <article className="card" key={g.title}>
                  <span className="card-num">0{i + 1}</span>
                  <h3>{g.title}</h3>
                  <p>{g.body}</p>
                </article>
              ))}
            </div>

            <dl className="facts">
              {mission.facts.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section id="explore" className="section alt">
          <div className="wrap">
            <p className="eyebrow">Interactive</p>
            <h2>See the sky the way SPHEREx does</h2>
            <p className="section-lede">
              Each dot is one of SPHEREx's 102 bands. Drag the slider to push a galaxy farther away and watch
              its light stretch to longer wavelengths, or switch to an icy cloud to see the chemical
              fingerprints of frozen water and CO₂.
            </p>
            <SpectrumExplorer />
          </div>
        </section>

        <section id="project" className="section">
          <div className="wrap">
            <p className="eyebrow">Our project</p>
            <h2>{project.challenge}</h2>
            <div className="two-col">
              <div>
                <h3>The problem</h3>
                <p>{project.problem}</p>
                <h3>Our solution</h3>
                <p>{project.solution}</p>
              </div>
              <div>
                <h3>How it works</h3>
                <ol className="steps">
                  {project.howItWorks.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                <h3>Built with</h3>
                <ul className="chips">
                  {project.tools.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section id="team" className="section alt">
          <div className="wrap">
            <p className="eyebrow">The team</p>
            <h2>{site.teamName}</h2>
            <ul className="team">
              {team.map((m) => (
                <li key={m.name}>
                  <span className="avatar" aria-hidden="true">
                    {m.name
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 2)}
                  </span>
                  <span className="team-name">{m.name}</span>
                  <span className="team-role">{m.role}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="resources" className="section">
          <div className="wrap">
            <p className="eyebrow">Resources</p>
            <h2>Data & references</h2>
            <ul className="resources">
              {resources.map((r) => (
                <li key={r.url}>
                  <a href={r.url} target="_blank" rel="noreferrer">
                    <span>{r.title}</span>
                    <small>{r.note} ↗</small>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap">
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
          <span className="fine-print">
            SPHEREx mission information courtesy of NASA/JPL-Caltech. This site is a student hackathon project
            and is not an official NASA website.
          </span>
        </div>
      </footer>
    </>
  );
}
