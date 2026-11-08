# Who's Doing What

Installable web app (PWA) for tracking what friends told you they're doing. Static site, no build step, no backend. Data is stored in each browser's `localStorage` (key `friend-tracker-state-v1`) and never leaves the device. Move data between devices with the in-app **Export** / **Import** buttons.

## Run locally

```
npm install      # only needed for the font packages used to produce public/fonts
npm start        # serves ./public at http://localhost:4173
```

## Deploy (static)

Publish the `public/` folder. Any static host works:

- **Netlify:** connect the repo; `netlify.toml` already sets the publish dir and headers.
- **Cloudflare Pages / Vercel:** no build command, output directory `public`.
- **GitHub Pages:** publish the contents of `public/` (for example with a Pages workflow that uploads that folder). The app uses only relative URLs, so it works under a sub-path like `/repo-name/`.

The site must be served over HTTPS (localhost is fine for testing) for the service worker and install prompt to work.

## Updating

When you change anything in `public/`, bump `CACHE_VERSION` in `public/sw.js`, otherwise returning users keep the old cached copy. Also update the footer text in `public/index.html`.

## Icons

`npm run icons` regenerates everything in `public/icons/` (no dependencies).

## Privacy

Export files contain friends' names and plans. `.gitignore` excludes `*export*.json`; never commit or deploy them.
