# SpotCam

A web camera app that stamps date, time and location onto your photos. Fully client-side: photos never leave your browser.

Live site: https://gnanaswaroop.github.io/Spot-Cam/

## Run locally

Prerequisites: Node.js 22+

```
npm install
npm run dev
```

## Pages

| URL | Page |
| --- | --- |
| `/Spot-Cam/` or `/Spot-Cam/home` | Landing page |
| `/Spot-Cam/cam` | Camera (bookmarkable; asks for camera and location if not yet granted) |
| `/Spot-Cam/gallery` | Gallery |

GitHub Pages is static hosting, so the build emits a real `index.html` for each route plus a `404.html`
that falls back to the landing page (see `spaRoutes` in `vite.config.ts`).

## Test

End-to-end tests (Playwright) run against the production build, served like GitHub Pages:

```
npx playwright install chromium   # once
npm run test:e2e
```

On Windows you can reuse Edge instead: `PW_CHANNEL=msedge npm run test:e2e`.

## Deploy

Pushes to `main` build and deploy automatically to GitHub Pages via `.github/workflows/deploy.yml`.
One-time setup: repo Settings → Pages → Source → **GitHub Actions**.
(GitHub Pages on a private repo requires a paid GitHub plan.)
