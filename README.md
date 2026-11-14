# SPHEREx – NASA Space Apps

Team website for our NASA Space Apps Challenge SPHEREx project. Built with Next.js and deployed on Vercel.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Edit content

Team name, project description, team members and links are all in `content/site.ts`.

## Deploy to Vercel

1. Go to https://vercel.com/new and sign in with GitHub.
2. Import the `spaceappsspherex` repository.
3. Leave the defaults (Framework: Next.js) and click **Deploy**.

Every push to GitHub redeploys the site automatically.

## 3D Sky Explorer (`/explore`)

A "Street View for space": an illustrated region map with a route through 14 stops. Tap a stop to step inside its 360° sphere.

- **Map view:** drag to move, scroll or pinch to zoom, tap a stop to enter.
- **Sphere view:** drag to look around, scroll or pinch to zoom, Prev/Next to walk the route, Esc for the map.
- **WASD:** fly around planets, stars and the galaxy (Q/E down/up, Shift faster, R reset). In sky-only stops WASD looks around.
- **Hotspots:** small diamonds on interesting features (the Great Red Spot, Saturn's rings, the Orion Nebula…) unfold into a card on hover or tap, with *Look closer* and, where it applies, *Go to…*. They're defined per stop in `hotspots` in `lib/explorer/landmarks.ts`.
- **Portals:** names marked ↗ inside a sphere (Orion, Sirius, the Milky Way centre, Earth from the Moon…) take you to that stop.
- **Real data:** 25,700 stars brighter than magnitude 7.5 (Hipparcos / HYG catalogue via `d3-celestial`), the 88 constellations, and star and constellation names in several languages.
- **Extras:** PNG export, shareable links (`/explore?stop=orion`), star-name language picker.

| File | What it does |
| --- | --- |
| `lib/explorer/landmarks.ts` | The stops on the tour (text, facts, look direction). Add new stops here. |
| `components/explorer/StarMap.tsx` | The illustrated SVG map (islands, route, stop badges, pan/zoom) |
| `lib/explorer/engine.ts` | three.js engine: the 360° spheres, WASD flight, portals, labels, export |
| `lib/explorer/textures.ts` | Procedural planet, star and badge textures |
| `lib/explorer/astro.ts` | Sky coordinate maths and star colors |
| `components/explorer/Explorer.tsx` | The page UI around the 3D view |
| `scripts/build-sky-data.mjs` | Rebuilds `public/data/sky.json` from the star catalogue (`npm run build:sky`) |
