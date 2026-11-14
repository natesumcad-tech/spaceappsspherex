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

A "Street View for space": a map of landmark spheres joined by a path. Click a sphere to step inside and drag to look around in 360°.

- **Map view:** drag to move, right-drag to rotate, scroll to zoom, click a sphere to enter.
- **Sphere view:** drag to look around, scroll or pinch to zoom, Prev/Next to walk the path.
- **Real data:** 25,700 stars brighter than magnitude 7.5 (Hipparcos / HYG catalogue via `d3-celestial`), the 88 constellations, and star and constellation names in several languages.
- **Extras:** PNG export, shareable links (`/explore?stop=orion`), star-name language picker.

| File | What it does |
| --- | --- |
| `lib/explorer/landmarks.ts` | The stops on the tour (text, facts, look direction). Add new stops here. |
| `lib/explorer/engine.ts` | three.js engine: the map, the 360° spheres, labels, export |
| `lib/explorer/textures.ts` | Procedural planet, star and badge textures |
| `lib/explorer/astro.ts` | Sky coordinate maths and star colors |
| `components/explorer/Explorer.tsx` | The page UI around the 3D view |
| `scripts/build-sky-data.mjs` | Rebuilds `public/data/sky.json` from the star catalogue (`npm run build:sky`) |
