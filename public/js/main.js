/* App bootstrap: session restore, router wiring, offline plumbing, PWA. */

import { $, esc, buzz } from './core/utils.js';
import { Icon } from './ui/icons.js';
import { Art } from './ui/art.js';
import { api, hasSession, clearSession, flushQueue, pendingCount } from './core/api.js';
import { state, setState, bus, loadCache, saveCache, clearCache, applyTheme, loadPrefs, savePrefs } from './core/store.js';
import { defineRoutes, setNotFound, setGuard, setOutlet, startRouter, navigate, render, currentPath } from './core/router.js';
import { buildChrome, setHeader, showFab, syncChrome } from './views/view.js';
import { setRenderHook } from './core/router.js';
import { toast, toastOk, toastError } from './ui/toast.js';
import { setCurrency } from './core/utils.js';

/* ------------------------------- routes --------------------------------- */

const lazyView = (modulePath, name) => async (ctx) => {
  const module = await import(modulePath);
  if (ctx.isCurrent()) return module[name](ctx);
};

const routes = {
  '/': lazyView('./views/home.js', 'viewHome'),
  '/add': lazyView('./views/add.js', 'viewAdd'),
  '/friend/:id': lazyView('./views/friend.js', 'viewFriend'),
  '/review': lazyView('./views/journal.js', 'viewReview'),
  '/friend/:id/entry/:entryId': lazyView('./views/journal.js', 'viewEntry'),
  '/friend/:id/settle/:entryId': lazyView('./views/journal.js', 'viewPayment'),
  '/friend/:id/story': lazyView('./views/journal.js', 'viewStory'),
  '/groups': lazyView('./views/groups.js', 'viewGroups'),
  '/group/:id': lazyView('./views/groups.js', 'viewGroup'),
  '/activity': lazyView('./views/activity.js', 'viewActivity'),
  '/you': lazyView('./views/you.js', 'viewYou'),
  '/plus': lazyView('./views/plus.js', 'viewPlus'),
  '/onboard': lazyView('./views/onboard.js', 'viewOnboard'),
  '/join': lazyView('./views/onboard.js', 'viewJoin'),
  '/auth': lazyView('./views/auth.js', 'viewAuth'),
  '/share': async (ctx) => {
    const { openShareCard } = await import('./views/share.js');
    if (!ctx.isCurrent()) return;
    openShareCard();
    navigate('/');
  },
};

defineRoutes(routes);
setOutlet($('#app'));

setGuard(async (path) => {
  const authed = !!state.user;
  const publicPaths = ['/auth', '/join'];
  if (publicPaths.includes(path)) {
    if (authed && path === '/auth') return '/';
    return null;
  }
  if (!authed) return '/auth';
  if (authed && state.user && !state.user.onboarded && path !== '/onboard') return '/onboard';
  return null;
});

setNotFound(() => {
  const target = document.querySelector('#main') || $('#app');
  target.innerHTML = `
    <div class="empty" style="padding-top:90px">
      <div class="empty__art">${Art.lost()}</div>
      <h3>No such page</h3>
      <p>Whatever you were looking for, it isn’t in the book.</p>
      <button class="btn btn--primary" data-fix="home">Back to my ledger</button>
    </div>`;
  target.querySelector('[data-fix]')?.addEventListener('click', () => navigate('/'));
});

/* --------------------------- boot splash -------------------------------- */

function dismissBoot() {
  const b = document.getElementById('boot');
  if (!b) return;
  b.style.transition = 'opacity 260ms ease';
  b.style.opacity = '0';
  setTimeout(() => b.remove(), 300);
}

/* ------------------------------- boot ----------------------------------- */

async function boot() {
  // Deep link normalisation: /j/<token> -> #/join?token=<token>
  const m = location.pathname.match(/^\/j\/([A-Za-z0-9]+)/);
  if (m) {
    history.replaceState(null, '', `/#/join?token=${m[1]}`);
  }

  const prefs = loadPrefs();
  applyTheme(prefs.theme || 'light');

  buildChrome();
  setRenderHook(syncChrome);
  dismissBoot();
  wireLifecycle();
  registerSW();

  // Instant paint from cache, then reconcile with the server.
  const cached = loadCache();
  if (cached?.user && hasSession()) {
    setState({ user: cached.user, friends: cached.friends || [], groups: cached.groups || [], stats: cached.stats });
    setCurrency(cached.user.currency || 'INR');
    applyTheme(cached.user.theme || prefs.theme || 'light');
  }

  if (hasSession()) {
    try {
      const { user } = await api.me();
      setState({ user });
      setCurrency(user.currency);
      applyTheme(user.theme || prefs.theme || 'light');
      saveCache();
      if (pendingCount()) {
        const r = await flushQueue();
        if (r.flushed) toastOk(`${r.flushed} offline ${r.flushed === 1 ? 'entry' : 'entries'} synced.`);
      }
    } catch (e) {
      if (e.status === 401) { clearSession(); clearCache(); setState({ user: null }); }
      else if (!cached) toast('Offline — showing the last thing we saved.');
    }
  }

  setState({ booted: true });
  startRouter();

  // Global refresh + data-changed wiring
  bus.on('data-changed', () => { saveCache(); softRefresh(); });
  bus.on('refresh', () => {
    softRefresh();
    if (document.querySelector('.product-screen') && !currentPath().includes('/settle/')) render({ preserveScroll: true });
  });
  bus.on('signed-out', () => { clearSession(); clearCache(); setState({ user: null, friends: [], groups: [], stats: null }); navigate('/auth'); });
  bus.on('user', (u) => { if (u) { setState({ user: u }); setCurrency(u.currency); saveCache(); } });
  bus.on('queue', (n) => setState({ queue: n }));
  bus.on('paywall', (reason) => {
    toast(reason === 'friends' ? 'Free ledgers hold 8 people.' : 'You’ve hit the free ceiling.', {
      action: 'See Plus', onAction: () => navigate('/plus'), duration: 5000,
    });
  });

  pollUnread();
}

let refreshTimer = null;
function softRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    if (!state.user) return;
    try {
      const [friendsRes, statsRes] = await Promise.all([api.friends(), api.stats()]);
      setState({ friends: friendsRes.friends, stats: statsRes });
      setCurrency(state.user.currency);
      saveCache();
    } catch {}
  }, 800);
}

async function pollUnread() {
  if (!state.user) return setTimeout(pollUnread, 12000);
  try {
    const { unread } = await api.events();
    const prev = state.unread;
    if (unread !== prev) {
      setState({ unread });
      syncChrome();
      if (unread > prev && document.visibilityState === 'visible' &&
          !['/auth', '/join', '/onboard', '/add'].includes(currentPath()) &&
          !document.querySelector('.product-screen') &&
          !document.querySelector('.sheet.is-open')) {
        await render({ preserveScroll: true });
      }
      if (unread > prev && loadPrefs().nudges !== false) {
        notify('Udhaar', `${unread} new ${unread === 1 ? 'thing' : 'things'} in your ledger`);
      }
    }
  } catch {}
  setTimeout(pollUnread, document.visibilityState === 'visible' ? 12000 : 45000);
}

function notify(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    try { new Notification(title, { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: 'udhaar' }); } catch {}
  } else if (Notification.permission === 'default') {
    // Ask only after they've logged at least one entry — never cold.
    if ((state.stats?.totals?.openEntries ?? 0) > 0) {
      Notification.requestPermission().catch(() => {});
    }
  }
}

/* --------------------------- lifecycle / offline -------------------------- */

function wireLifecycle() {
  let bar = null;
  const setOnline = (online) => {
    setState({ online });
    if (!online) {
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'offline-bar';
        bar.innerHTML = `${Icon.wifiOff} <span style="vertical-align:middle">Offline — everything you log is saved and will sync</span>`;
        document.body.prepend(bar);
      }
    } else {
      bar?.remove(); bar = null;
      flushQueue().then((r) => { if (r.flushed) { toastOk(`Back online. ${r.flushed} synced.`); softRefresh(); } });
    }
  };
  window.addEventListener('online', () => setOnline(true));
  window.addEventListener('offline', () => setOnline(false));
  setOnline(navigator.onLine);

  // Install prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    setState({ installPrompt: e });
    const prefs = loadPrefs();
    if (prefs.installNudged) return;
    setTimeout(() => {
      if (currentPath() !== '/' || state.installPrompt == null) return;
      savePrefs({ installNudged: true });
      const t = toast('Add Udhaar to your home screen?', {
        action: 'Install', duration: 7000,
        onAction: () => { state.installPrompt?.prompt(); state.installPrompt = null; },
      });
    }, 12000);
  });

  window.addEventListener('appinstalled', () => { setState({ installPrompt: null }); toastOk('Installed. Opens like an app now.'); });

  // Warn before losing a half-written entry
  window.addEventListener('beforeunload', (e) => {
    if (pendingCount() > 0) { e.preventDefault(); e.returnValue = ''; }
  });

  let lastVisible = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { lastVisible = Date.now(); return; }
    // Only refresh if user was away for more than 2 minutes — not just switching tabs
    if (state.user && Date.now() - lastVisible > 2 * 60_000) softRefresh();
  });
}

/* ------------------------------ service worker --------------------------- */

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    let refreshing = false;
    let lastPromptedWorker = null;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });

    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        const promptUpdate = (worker) => {
          if (!worker || worker === lastPromptedWorker) return;
          lastPromptedWorker = worker;
          toast('New version of Udhaar is ready.', {
            action: 'Reload',
            duration: 30000,
            onAction: () => {
              worker?.postMessage('skip-waiting');
            },
          });
          // If the user misses the toast, a later return to the app can show it again.
          setTimeout(() => { if (lastPromptedWorker === worker) lastPromptedWorker = null; }, 30000);
        };

        const checkForUpdate = () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
          if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
        };

        if (reg.waiting && navigator.serviceWorker.controller) {
          promptUpdate(reg.waiting);
        }

        window.addEventListener('focus', checkForUpdate);
        document.addEventListener('visibilitychange', checkForUpdate);
        setInterval(checkForUpdate, 60 * 60 * 1000);
        checkForUpdate();

        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w?.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) {
              promptUpdate(w);
            }
          });
        });
      })
      .catch(() => {});
  });
}

boot().catch((e) => {
  console.error('[boot]', e);
  dismissBoot();
  const target = document.querySelector('#main') || $('#app');
  target.innerHTML = `
    <div class="empty" style="padding-top:90px">
      <div class="empty__art">${Icon.alert}</div>
      <h3>Udhaar couldn’t start</h3>
      <p>${esc(e?.message || 'Unknown error')}</p>
      <button class="btn btn--primary" data-fix="reload">Try again</button>
    </div>`;
  target.querySelector('[data-fix]')?.addEventListener('click', () => location.reload());
});
