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

## Sky Explorer (`/map`)

One page with three views: **2D** and **3D** (a Google Maps-style map of the whole sky) and **Sphere** (step inside a landmark in 360°). Switch with the 2D / 3D / Sphere control at the top left. `/explore` and `?stop=` links open the matching sphere.

- **Camera (Fusion 360 style):** middle-drag pans, Shift + middle-drag orbits (a green dot marks the pivot), the scroll wheel zooms toward the cursor. Left-drag also pans and right-drag also orbits. Keyboard: WASD/arrows pan, Q/E turn, R/F tilt, Z/X zoom, T toggles 2D/3D, H returns to the origin.
- **2D snap:** let go of an orbit within about 12° of straight down and it snaps to the flat 2D view. Tilt stops at 72° so you can't go under the baseplate. The map's edges dissolve into the black void, with no border.
- **Imagery: real SPHEREx data.** The map is SPHEREx Data Release 1 (released by IRSA in Nov 2026), streamed live as HiPS tiles from NASA/IPAC's Infrared Science Archive. A background worker reprojects the HEALPix tiles onto the map's flat RA/Dec grid, starting from the origin (RA 0h, Dec 0°). Tiles are 30° at the coarsest level and split down to about 0.12° as you zoom (you can zoom in to about 13 arcminutes across the screen); each level loads a matching HiPS resolution, up to SPHEREx's 13″ pixels or 2MASS/Spitzer's finer ones.
  - **SPHEREx color** (default): blue 1.0 µm, green 2.2 µm, red 3.3 µm. **One wavelength**: any of the 102 bands. **2MASS** colour as an alternative base.
  - **Extra IRSA layers** in Settings, drawn where they have data: Spitzer GLIMPSE360, Spitzer SAGE-LMC, MSX.
  - The north and south ecliptic poles are blank in the DR1 all-sky map; IRSA serves those deep fields as a separate collection (`spherex_dr1_deep`).
  - Constellation lines and names still come from the Hipparcos-based d3-celestial catalogue.
- **Performance:** only tiles near the view are drawn (at most 96, plus fog in the distance), with less detail when zoomed out, and nothing redraws unless something changes.
- **Minimap:** shows where you are as a white dotted circle that grows as you zoom out. Drag it to move.
- **Timeline:** snaps between eight dates from 12,000 BCE to 14,000 CE. The sky shifts with precession (simplified model) and the planets use NASA JPL's approximate orbital elements (only shown within ±3,000 years).
- **Waypoints:** small breathing white diamonds. Hover for a card (description, why it matters, date, coordinates), click to hyperspace there. Shift+G adds your own (saved in your browser; export and import in Settings).
- **Settings:** the wrench icon picks the IRSA imagery and extra layers, toggles light, constellation lines, names, descriptions, waypoints, planets and the grid, and sets the quality.
- **Your own images:** list images with coordinates in `public/data/map-images.json` as `{ "src", "ra", "dec", "widthDeg", "heightDeg" }` and they're placed on the map by their RA/Dec, loading only when they come into view.

| File | What it does |
| --- | --- |
| `lib/starmap/viewer.ts` | three.js viewer: camera controls, tile quadtree, overlays, hyperspace |
| `lib/starmap/hips.ts` | IRSA layers, HEALPix maths, and the reprojection onto the map grid |
| `lib/starmap/tile.worker.ts` | Background worker that downloads and reprojects tiles |
| `lib/starmap/coords.ts` | Map projection, precession, planet positions |
| `lib/starmap/data.ts` | Preset waypoints and timeline dates |
| `components/starmap/StarMapApp.tsx` | Page UI: minimap, timeline, settings, waypoint panels |

### Sphere view

A "Street View for space": 14 stops you can step inside, each a 360° sphere. Open one with **Step inside** on a waypoint card, by clicking Mars, Jupiter or Saturn on the map, with the Sphere tab (nearest landmark), or from the sphere's stop list. Esc, 2D or 3D returns to the map at the same spot.

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
| `components/explorer/Explorer.tsx` | The sphere view, shown over the map page |
| `scripts/build-sky-data.mjs` | Rebuilds `public/data/sky.json` from the star catalogue (`npm run build:sky`) |
