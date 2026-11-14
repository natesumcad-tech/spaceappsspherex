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

## Star Map (`/map`)

A Google Maps-style map of the whole sky that switches between a flat 2D view and a tilted 3D view.

- **Camera (Fusion 360 style):** middle-drag pans, Shift + middle-drag orbits (a green dot marks the pivot), the scroll wheel zooms toward the cursor. Left-drag also pans and right-drag also orbits. Keyboard: WASD/arrows pan, Q/E turn, R/F tilt, Z/X zoom, T toggles 2D/3D, H returns to the origin.
- **2D snap:** let go of an orbit within about 12° of straight down and it snaps to the flat 2D view. Tilt stops at 72° so you can't go under the baseplate, whose sides are white so you can see its edges.
- **Layout:** every star is placed on a grid by its RA/Dec, starting from the origin (RA 0h, Dec 0°). Tiles are 30° at the coarsest level and split down to about 0.5° as you zoom.
- **Performance:** only tiles near the view are drawn (at most 96, plus fog in the distance), with less detail when zoomed out, and nothing redraws unless something changes.
- **Minimap:** shows where you are as a white dotted circle that grows as you zoom out. Drag it to move.
- **Timeline:** snaps between eight dates from 12,000 BCE to 14,000 CE. The sky shifts with precession (simplified model) and the planets use NASA JPL's approximate orbital elements (only shown within ±3,000 years).
- **Waypoints:** small white rectangles. Hover for a card (description, why it matters, date, coordinates), click to hyperspace there. Shift+G adds your own (saved in your browser; export and import in Settings).
- **Settings:** the wrench icon toggles light, constellation lines, names, descriptions, waypoints, planets and the grid, and sets the quality.
- **Your own images:** list images with coordinates in `public/data/map-images.json` as `{ "src", "ra", "dec", "widthDeg", "heightDeg" }` and they're placed on the map by their RA/Dec, loading only when they come into view.

| File | What it does |
| --- | --- |
| `lib/starmap/viewer.ts` | three.js viewer: camera controls, tile quadtree, overlays, hyperspace |
| `lib/starmap/tiles.ts` | Star index and the tile painter (Milky Way glow + stars) |
| `lib/starmap/coords.ts` | Map projection, precession, planet positions |
| `lib/starmap/data.ts` | Preset waypoints and timeline dates |
| `components/starmap/StarMapApp.tsx` | Page UI: minimap, timeline, settings, waypoint panels |

## 3D Sky Explorer (`/explore`)

A "Street View for space": 14 stops you can step inside, each a 360° sphere. Open it from a Star Map waypoint or the stop list.

- **Sphere view:** drag to look around, scroll or pinch to zoom, Prev/Next to walk the route, Esc for the map.
- **WASD:** fly around planets, stars and the galaxy (Q/E down/up, Shift faster, R reset). In sky-only stops WASD looks around.
- **Hotspots:** small diamonds on interesting features (the Great Red Spot, Saturn's rings, the Orion Nebula…) unfold into a card on hover or tap, with *Look closer* and, where it applies, *Go to…*. They're defined per stop in `hotspots` in `lib/explorer/landmarks.ts`.
- **Portals:** names marked ↗ inside a sphere (Orion, Sirius, the Milky Way centre, Earth from the Moon…) take you to that stop.
- **Real data:** 25,700 stars brighter than magnitude 7.5 (Hipparcos / HYG catalogue via `d3-celestial`), the 88 constellations, and star and constellation names in several languages.
- **Extras:** PNG export, shareable links (`/explore?stop=orion`), star-name language picker.

| File | What it does |
| --- | --- |
| `lib/explorer/landmarks.ts` | The stops on the tour (text, facts, look direction). Add new stops here. |
| `lib/explorer/engine.ts` | three.js engine: the 360° spheres, WASD flight, portals, labels, export |
| `lib/explorer/textures.ts` | Procedural planet, star and badge textures |
| `lib/explorer/astro.ts` | Sky coordinate maths and star colors |
| `components/explorer/Explorer.tsx` | The page UI around the 3D view |
| `scripts/build-sky-data.mjs` | Rebuilds `public/data/sky.json` from the star catalogue (`npm run build:sky`) |
