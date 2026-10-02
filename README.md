# Udhaar — a ledger for what friends owe you

A mobile-first PWA for tracking money, favours and vows between friends.
Two-sided ledgers: the other person confirms or disputes each line, so nobody
has to be the awkward one twice. Built solo-founder style: Express + SQLite
backend, zero-framework vanilla ES-module frontend, no build step.

The product discovery doc (18 points: insight, monetisation, viral loop,
moat, risks…) lives in [`STRATEGY.md`](STRATEGY.md).

---

## Run it

Requirements: **Node.js 20+** and npm. Nothing else — no database server,
no external services, no CDN.

```bash
npm install --omit=dev   # runtime deps only (skips Playwright's browser download)
npm start                # → http://localhost:4173
```

Open `http://localhost:4173` on the computer. To use your phone, keep the
server running, connect both devices to the same Wi-Fi, find the computer's
LAN address with `hostname -I`, then open `http://<LAN-address>:4173` in the
phone's browser. `localhost` on the phone refers to the phone, not your computer.
If the page does not load, check the computer's firewall and whether the Wi-Fi
blocks devices from talking to each other.
First boot creates `data/` with the SQLite database, the uploads folder and
an auto-generated JWT secret (`data/.jwt_secret`).

**Reset everything:** stop the server, `rm -rf data`, start again.

### Notes

- `better-sqlite3` ships prebuilt binaries for common platforms. If npm has
  to compile it from source you'll need a C++ toolchain (`build-essential`
  on Debian/Ubuntu, Xcode CLT on macOS).
- The app is fully self-contained: fonts are self-hosted in `public/fonts/`,
  all assets are same-origin, and the service worker precaches the shell.
  After one visit it runs **offline** and is installable as a PWA.
- "Just show me how it works" on the landing page creates a **demo account**
  (server-flagged `is_demo`, badged "demo ledger") pre-filled with sample
  lines. Real signups can never contain demo content, and the demo-seeding
  endpoint refuses non-demo accounts (HTTP 403).

### Environment variables (all optional)

| Variable       | Default            | Purpose                                    |
| -------------- | ------------------ | ------------------------------------------ |
| `PORT`         | `4173`             | HTTP port                                   |
| `LISTEN_HOST`  | `0.0.0.0`          | Bind address (allows same-network devices) |
| `DATA_DIR`     | `./data`           | SQLite + uploads + JWT secret location      |
| `JWT_SECRET`   | auto (persisted)   | Override the generated signing secret       |
| `COOKIE_SECURE`| unset              | `1` = `Secure; SameSite=None` refresh cookie (HTTPS only) |
| `NODE_ENV`     | unset              | `production` hides raw error text from clients |

---

## Tests

```bash
node scripts/e2e.mjs     # 43 backend API checks, no browser needed
```

Browser suites need the dev dependencies (`npm install`), which download a
Playwright Chromium:

```bash
node scripts/ui.mjs       # full UI smoke: signup → onboarding → photos → dark mode
node scripts/visual2.mjs  # inline login error, dark shots, join-page receipt
node scripts/audit.mjs    # design screenshots: key screens, light + dark
node scripts/audit2.mjs   # design screenshots: alerts, sheets, swipe, groups, plus
```

Screenshots land in `shots/` (created automatically). On minimal Linux
images Chromium may need extra system libraries (nss, atk, cups, asound…).

Rate limits are per server process — run browser suites against a freshly
started server, or space runs a minute apart.

---

## Layout

```
server/          Express app: routes/, db.js (schema+migrations), auth, photos, validate
public/
  index.html     shell + PWA manifest links
  styles/        tokens.css (design system), app.css, landing.css, fonts.css
  js/
    core/        api, router (hash), store, utils
    ui/          icons, sheets, toasts, swipe, confetti, share-card, lightbox
    views/       one module per screen (home, friend, groups, activity, you, add, plus, share, auth, onboard)
  fonts/         self-hosted woff2 (DM Sans, Instrument Serif, JetBrains Mono)
  sw.js          service worker (shell precache, network-first API reads)
scripts/         e2e + browser test/audit suites
STRATEGY.md      the 18-point product discovery document
```

## If you ever see an OLD design after updating (stale cache / stale worker)

Three things can pin an old build to your browser. In order of likelihood:

1. **An old server still running on port 4173.** The new server then dies
   with `EADDRINUSE` while your browser keeps talking to the old one.
   Kill it (`lsof -i :4173`, or close that terminal) and start again.
2. **A stale service worker + disk cache from a previous build.** Once per
   machine after an upgrade: DevTools → Application → Storage →
   **“Clear site data”** for the app's origin, then reload. (This unregisters
   the old worker and drops its cached shell. Your ledger lives on the
   server, nothing is lost.)
3. Nothing else, as of `v1.3.0`: code/shell/fonts are now served
   `Cache-Control: no-cache` (ETag-revalidated), so unversioned URLs can
   never be frozen again; the worker self-activates (`skipWaiting` +
   `clients.claim`) and open tabs auto-reload once when a new worker takes
   control.

## Money honesty

Plus is ₹99/month-equivalent freemium (server-enforced limits: 8 people,
120 lines, no photos on free). The checkout in this build is a disclosed
demo — it flips the plan flag without charging anything; production would
wire Razorpay/Stripe here.

---

## Changelog (product rounds)

- **v1.6–1.7 — native feel & practicality.** Persistent app chrome with scrollable
  content regions, naturally scrolling auth/setup pages, push/pop/tab view transitions, two-step
  full-screen compose (who → the line) with the v2 keypad, stepped signup/login,
  one-view home, redesigned dark theme (warm charcoal, tuned ink steps, fill-grade
  button colours), group splits that count *you* as a participant and only book
  real obligations (friend paid → only your share becomes a line), undo-split
  keeps settled history, overdue review separated into "chase these" vs
  "on you — go pay these", and nudges blocked on entries you owe.
- **v1.5 — compose & auth wizards, gen-z copy pass, manifest phone screenshot.**
- **v1.4 — polish round: docked nav action, responsive settings, theme crossfade.**
- **v1.3 — cache contract fix (no immutable unversioned assets), offline shell.**
