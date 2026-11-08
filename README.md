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

## Cloud sync (optional)

Sync uses Firebase: Google sign-in plus one Firestore document per user (`wdw/{uid}`). `localStorage` stays the working copy, so the app still works offline and merges with the server when it can. Merging is three-way by item id (`docs/merge.js`, tested with `node tools/test-merge.mjs`): edits made on two devices both survive, and an edit beats a delete.

Sync is off until `docs/firebase-config.js` contains your Firebase web config.

### One-time setup

1. Create a project at https://console.firebase.google.com (Analytics not needed).
2. **Build > Authentication > Get started > Google**: enable it and pick a support email.
3. **Authentication > Settings > Authorized domains**: add `YOUR-USERNAME.github.io`.
4. **Build > Firestore Database > Create database** (production mode, any region).
5. **Firestore > Rules**: paste the contents of `firestore.rules` and Publish.
6. **Project settings > Your apps > Web (</>)**: register an app and copy the `firebaseConfig` object into `docs/firebase-config.js`. These values are not secrets; the rules and sign-in protect the data.
7. Bump `CACHE_VERSION` in `docs/sw.js`, commit, and push.

### Notes

- Data for each Google account is private to that account; open the site and tap "Sign in with Google to sync" on each device, using the same account.
- On iPhone, if sign-in fails inside the Home Screen app, sign in once from the Safari tab first.
- Friends' names and plans are stored in your Firebase project once you turn sync on.
