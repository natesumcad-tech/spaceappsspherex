# SPHEREx Sky Explorer — NASA Space Apps

An interactive 2D/3D map of the infrared sky built for the **NASA Space Apps Challenge** (Planet X & SPHEREx). Built with Next.js, Three.js, and deployed on Vercel.

## What's in here

- **Sky Map (`/map`):** A Google Maps-style sky viewer with a **2D / 3D** toggle, live-streamed **SPHEREx Data Release 1** HiPS tiles from NASA/IPAC IRSA (1.0 / 2.2 / 3.3 µm color, all 102 individual bands, plus 2MASS and Spitzer layers), a **12,000 BCE – 14,000 CE** timeline, and custom waypoints (`Shift+G` to drop, export/import as JSON).
- **360° Views (`/explore`):** Step inside 14+ landmark stops, planets, bright stars, and all 88 constellations (built in 3D from real star distances). Includes Look / Orbit / Free-fly controls, hotspots, portals, and **PNG / JPG / WEBP** image export.
- **Sky Guide (AI Assistant):** Press `/` or click **✦ Ask** to chat with a Gemini-powered guide that knows what you're looking at and can fly the camera, switch imagery layers, or jump to timeline dates.

## Running locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

To enable the AI Sky Guide locally, create `.env.local` in the project root:

```env
GEMINI_API_KEY=your_key_here
```

## Deploy to Vercel

1. Import `spaceappsspherex` on [vercel.com/new](https://vercel.com/new).
2. Add `GEMINI_API_KEY` under **Settings → Environment Variables** (optional: `GEMINI_MODEL`, defaults to `gemini-2.5-flash`).
3. Deploy.

## Project structure

| Path | Purpose |
| --- | --- |
| `app/map/page.tsx` | Main 2D/3D Sky Explorer page |
| `app/api/chat/route.ts` | Gemini API endpoint with map-control function calling |
| `components/starmap/` | Map UI, minimap, timeline, settings, and AI assistant |
| `components/explorer/` | 360° sphere viewer and PNG/JPG/WEBP export |
| `lib/starmap/` | Three.js tile quadtree, HEALPix/IRSA HiPS worker, coordinates |
| `lib/explorer/` | 360° engine, landmarks, procedural textures, dynamic views |
| `content/site.ts` | Team info, project description, and links |
| `scripts/build-sky-data.mjs` | Rebuilds `public/data/sky.json` from the star catalog |

## Data & credits

- **Infrared sky:** NASA/IPAC Infrared Science Archive (IRSA) — SPHEREx DR1, 2MASS, Spitzer
- **Stars & constellations:** Hipparcos / HYG v4.1 (`d3-celestial`)
- **License:** MIT
