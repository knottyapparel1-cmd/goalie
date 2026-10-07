# Goalie

A mobile-first Progressive Web App (PWA) for tallying habits and behaviors. You install it on your iPhone home screen through Safari, so there's no App Store and no $99 developer fee.

## Features
- **Home**: colored tally cards. Tap a card to log its default count. Use the − / + buttons to take back or add an entry. Hold a card for more options: custom amount, history, edit. Tap the pencil (top left) to enter edit mode: drag cards to reorder them or move them into another group, tap × to delete, and tap DONE when finished.
- **Create/Edit**: what you want to measure, examples and non-examples (an operational definition), increase or decrease, which days to track, a **Goal** (amount, unit — occurrences, minutes, hours or custom — and PER minute/hour/day/week/month/year, which is also when the count resets) with an auto-generated sentence such as "Your goal is to decrease smoking to 1 occurrence per day.", plus group, default count, logging mode, reminder, badge, color and the card's bottom text. Cards show a ✓ when an increase goal is met and a ! when a decrease goal is exceeded.
- **Statistics**: week/month/year totals and averages as bar charts, plus a time-of-day chart showing when you log. Swipe or use the arrows to see earlier periods.
- **Settings**: week start day, JSON export/import backup, notifications, **Recently Deleted** (restore deleted goals for 30 days), delete all data.
- Works offline. Data is stored on the device in localStorage.

## Run locally
```bash
npx http-server -p 5173 -c-1
```
Then open http://localhost:5173.

## Put it on your iPhone (free, via GitHub Pages)
1. Create a new GitHub repo and upload every file in this folder (`index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `icons/`).
2. In the repo, go to **Settings → Pages**, choose **Deploy from a branch**, pick `main` / root, and save.
3. After about a minute, open the `https://<username>.github.io/<repo>/` URL in **Safari** on your iPhone.
4. Tap **Share → Add to Home Screen**.

Any static HTTPS host works too, such as Netlify Drop or Cloudflare Pages. A service worker (needed for offline use) only runs over HTTPS.

## Updating
After you change files, bump `CACHE` in `sw.js` (for example to `goalie-v47`) so installed copies pick up the new version.

## Limitations of a web app on iOS
- Reminders only fire while the app is open or was recently used. True background push needs a server.
- Reminder banners need iOS 16.4+, the app installed to the Home Screen, and permission (Settings → Turn on reminder banners). While the app is open, an in-app banner shows instead.
- There is no Apple Watch support. That needs a native app.
- Data lives on one device. Use Export to back it up.
