/* Udhaar service worker
   - App shell: precached, offline-first, stale-while-revalidate
   - API GETs: network-first with a cache fallback so the ledger still opens
     on a train through a tunnel.
   - API writes: never intercepted; the app layer queues them instead.
*/

const VERSION = 'v1.14.2';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/styles/fonts.css',
  '/fonts/dm-sans-latin.woff2',
  '/fonts/instrument-serif-latin.woff2',
  '/fonts/instrument-serif-italic-latin.woff2',
  '/fonts/jetbrains-mono-latin.woff2',
  '/styles/tokens.css',
  '/styles/app.css',
  '/styles/landing.css',
  '/styles/motion.css',
  '/js/main.js',
  '/js/core/api.js',
  '/js/core/router.js',
  '/js/core/store.js',
  '/js/core/utils.js',
  '/js/core/group-position.js',
  '/js/ui/icons.js',
  '/js/ui/sheet.js',
  '/js/ui/swipe.js',
  '/js/ui/toast.js',
  '/js/ui/confetti.js',
  '/js/ui/art.js',
  '/js/ui/brand.js',
  '/js/ui/lightbox.js',
  '/js/ui/sharecard.js',
  '/js/views/add.js',
  '/js/views/art.js',
  '/js/views/activity.js',
  '/js/views/auth.js',
  '/js/views/friend.js',
  '/js/views/groups.js',
  '/js/views/home.js',
  '/js/views/onboard.js',
  '/js/views/plus.js',
  '/js/views/share.js',
  '/js/views/view.js',
  '/js/views/you.js',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll(SHELL_ASSETS).catch(() => {
        // Non-fatal: cache whatever we can, one by one.
        return Promise.allSettled(SHELL_ASSETS.map((u) => c.add(u).catch(() => {})));
      }))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

const isNav = (req) => req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API reads: network first, cache fallback (never serve stale writes).
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && request.headers.get('authorization')) {
            const copy = res.clone();
            caches.open(RUNTIME).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response(JSON.stringify({ error: 'offline', message: 'You’re offline.' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }),
    );
    return;
  }

  // Navigation: shell, always.
  if (isNav(request)) {
    event.respondWith(
      caches.match('/index.html').then((hit) => hit || fetch(request).catch(() => caches.match('/')))
        .then((res) => res || new Response('Offline', { status: 503 })),
    );
    return;
  }

  // Everything else: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(RUNTIME).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
