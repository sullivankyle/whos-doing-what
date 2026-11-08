# Who's Doing What

Installable web app (PWA) for tracking what friends told you they're doing. Static site, no build step, no backend. Data is stored in each browser's `localStorage` (key `friend-tracker-state-v1`) and never leaves the device. Move data between devices with the in-app **Export** / **Import** buttons.

## Run locally

```
npm install      # only needed for the font packages used to produce docs/fonts
npm start        # serves ./docs at http://localhost:4173
```

## Deploy (static)

Publish the `docs/` folder. Any static host works:

- **Netlify:** connect the repo; `netlify.toml` already sets the publish dir and headers.
- **Cloudflare Pages / Vercel:** no build command, output directory `docs`.
- **GitHub Pages:** Settings > Pages > Deploy from a branch > `main` / `/docs`. The app uses only relative URLs, so it works under a sub-path like `/repo-name/`.

The site must be served over HTTPS (localhost is fine for testing) for the service worker and install prompt to work.

## Updating

When you change anything in `docs/`, bump `CACHE_VERSION` in `docs/sw.js`, otherwise returning users keep the old cached copy. Also update the footer text in `docs/index.html`.

## Icons

`npm run icons` regenerates everything in `docs/icons/` (no dependencies).

## Privacy

Export files contain friends' names and plans. `.gitignore` excludes `*export*.json`; never commit or deploy them.
