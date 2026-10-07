# Udhaar — a social memory ledger

A mobile-first PWA for remembering money, favours and promises between people.
Two-sided ledgers: the other person confirms or disputes each line, so nobody
has to be the awkward one twice. Built solo-founder style: Express + SQLite
backend, zero-framework vanilla ES-module frontend, no build step.
Person pages also support private Moments with up to four photos; these are not
shared with a linked person.

The product discovery doc (18 points: insight, monetisation, viral loop,
moat, risks…) lives in [`STRATEGY.md`](STRATEGY.md).
The product voice, category, privacy rules, and future experience system live in
[`BRAND_WORLD.md`](BRAND_WORLD.md).
The staged long-term product architecture lives in
[`PRODUCT_SYSTEM.md`](PRODUCT_SYSTEM.md).
The new mobile screens, design decisions, and browser checks are documented in
[`DESIGN.md`](DESIGN.md).

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
   clear the service worker and static caches, then reload. Preserve localStorage
   while entries are pending: it holds financial writes awaiting confirmation.
3. Nothing else, as of `v1.3.0`: code/shell/fonts are now served
   `Cache-Control: no-cache` (ETag-revalidated), so unversioned URLs can
   never be frozen again; the worker self-activates (`skipWaiting` +
   `clients.claim`) and open tabs auto-reload once when a new worker takes
   control.

## Money honesty

Plus is lifetime access: ₹49 for INR ledgers, or 1 unit in the other supported
currencies. Free limits are enforced by the server (8 people, 120 open entries,
2 groups). Razorpay checkout must be configured with RAZORPAY_KEY_ID and
RAZORPAY_KEY_SECRET. Only a captured payment for an account-owned order can
activate Plus; profile updates cannot change the plan.

Run `npm test` for backend/database/client regressions and `npm run test:bugs:browser`
for mobile browser checks. The latter uses `CHROMIUM_PATH` (default `/usr/bin/chromium`).
See [BUGFIXES.md](BUGFIXES.md) for the fixes, migrations, and validation scope.

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
