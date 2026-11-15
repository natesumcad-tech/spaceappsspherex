# Sky Explorer (SPHEREx)

An interactive 2D/3D map of the infrared sky built for the **NASA Space Apps Challenge** (Planet X & SPHEREx). Users stream live SPHEREx Data Release 1 imagery from NASA/IPAC IRSA, jump to J2000 coordinates or benchmark targets, blink 6-month passes to spot moving objects, step into 360° views of landmarks and constellations, and ask a Gemini-powered Sky Guide to navigate the map.

## How It Works

1. **Explore the sky** at `/map` in 2D or tilted 3D using Google Maps-style pan, orbit, and zoom
2. **Switch imagery** between SPHEREx color (1.0 / 2.2 / 3.3 µm), any of the 102 individual bands, 2MASS, or Spitzer layers
3. **Jump to coordinates** using the RA/Dec search bar (HMS/DMS or decimal) or the 5 SPHEREx benchmark target presets
4. **Blink & compare** sequential 6-month SPHEREx passes (`Normal`, `B − A` subtract, `B + A` add) with an adjustable FOV slider
5. **Step inside 360° views** of landmarks, planets, bright stars, and 3D constellations, and export snapshots as PNG, JPG, or WEBP
6. **Ask the Sky Guide** (`/` or **✦ Ask**) to explain what's in view or fly the camera directly to any target
7. **Play the optional rescue mission** ("Signal from the Dark", offered after the tutorial or from the radio button): guide a fictional crew home by finding stars, reading and entering real J2000 coordinates, and switching SPHEREx colors. Every image is a live SPHEREx cutout from IRSA, and every number comes from the star catalogue or real planetary orbits

## Architecture

```
Browser (Next.js + Three.js)  ──▶  /api/chat (Next.js Route)  ──▶  Gemini API
         │
         ├── Web Worker (HEALPix)  ──▶  NASA/IPAC IRSA (SPHEREx DR1 / 2MASS / Spitzer)
         └── Static / Local Data   ──▶  Hipparcos / HYG v4.1 (sky.json) + localStorage waypoints
```

- **Frontend**: Next.js (App Router) + Three.js rendering the 2D/3D tile quadtree, overlays, 360° sphere engine, and HUD. Deployed on Vercel.
- **Worker**: Background Web Worker (`tile.worker.ts`) downloading and reprojecting HEALPix HiPS tiles onto the RA/Dec grid.
- **AI Backend**: `/api/chat` (`app/api/chat/route.ts`) calling Google's Gemini API with function declarations to drive map navigation, timeline, and imagery.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Three.js |
| Sky Imagery | NASA/IPAC IRSA HiPS tiles (SPHEREx DR1, 2MASS, Spitzer) |
| Star Catalog | Hipparcos / HYG v4.1 (`d3-celestial`) |
| Tile Processing | Web Workers + custom HEALPix reprojection |
| AI Assistant | Gemini API (`gemini-2.5-flash`) with function calling |
| Deployment | Vercel |

## Setup

### Prerequisites

- Node.js 18+
- A Gemini API key (optional, for the Sky Guide chatbot)

### Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` (or `http://localhost:3000/map` for the Sky Explorer).

### Environment Variables

Create `.env.local` in the project root (or set in **Vercel → Settings → Environment Variables**):

- `GEMINI_API_KEY` — Google AI Studio API key for `/api/chat`
- `GEMINI_MODEL` — Optional model override (defaults to `gemini-2.5-flash`)

## Project Structure

```
app/
  api/chat/route.ts         # Gemini API endpoint with map-control tools
  map/                      # 2D/3D Sky Explorer page & styles
  explore/                  # 360° view styles
  page.tsx                  # Landing page
components/
  starmap/
    StarMapApp.tsx          # Map HUD, minimap, timeline, settings, waypoints
    CoordSearchBar.tsx      # J2000 RA/Dec search, benchmark presets, shareable URLs
    BlinkPlayer.tsx         # 6-month time-series player, B-A/B+A, FOV slider
    Assistant.tsx           # Sky Guide chat UI
  explorer/
    Explorer.tsx            # 360° sphere viewer & PNG/JPG/WEBP export
lib/
  starmap/                  # Three.js viewer, HEALPix/IRSA HiPS, coords, cosmic data
  explorer/                 # 360° engine, landmarks, textures, dynamic views
content/
  site.ts                   # Project description, mission facts, sources, credits
scripts/
  build-sky-data.mjs        # Rebuilds public/data/sky.json from star catalog
```

## Testing

```bash
npx tsc --noEmit
node tests/zoom-policy.test.mjs
```

## AI Usage

Artificial intelligence (Anthropic's Claude) was used to help write the code for this project, along with Google Gemini for the "Sky Explorer" chatbot.

## License

MIT
