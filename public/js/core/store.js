/* Tiny event bus + in-memory store with localStorage fallback for offline. */

const CACHE_KEY = 'udhaar.cache.v1';

class Bus {
  #h = new Map();
  on(evt, fn) {
    if (!this.#h.has(evt)) this.#h.set(evt, new Set());
    this.#h.get(evt).add(fn);
    return () => this.#h.get(evt)?.delete(fn);
  }
  once(evt, fn) {
    const off = this.on(evt, (...a) => { off(); fn(...a); });
    return off;
  }
  emit(evt, ...args) {
    this.#h.get(evt)?.forEach((fn) => { try { fn(...args); } catch (e) { console.error('[bus]', evt, e); } });
    this.#h.get('*')?.forEach((fn) => { try { fn(evt, ...args); } catch {} });
  }
}

export const bus = new Bus();

export const state = {
  user: null,
  friends: [],
  groups: [],
  stats: null,
  events: [],
  unread: 0,
  online: navigator.onLine,
  theme: 'system',
  queue: 0,
  booted: false,
  installPrompt: null,
};

export function setState(patch) {
  Object.assign(state, patch);
  for (const k of Object.keys(patch)) bus.emit(`state:${k}`, patch[k]);
}

/* ------------------------------- cache ---------------------------------- */

export function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      user: state.user,
      friends: state.friends.slice(0, 60),
      groups: state.groups.slice(0, 20),
      stats: state.stats,
      at: Date.now(),
    }));
  } catch {}
}

export function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.user) return null;
    return parsed;
  } catch { return null; }
}

export function clearCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch {}
}

/* ------------------------------ settings -------------------------------- */

const PREFS = 'udhaar.prefs.v1';

export function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS) || '{}'); } catch { return {}; }
}

export function savePrefs(patch) {
  const next = { ...loadPrefs(), ...patch };
  try { localStorage.setItem(PREFS, JSON.stringify(next)); } catch {}
  return next;
}

export function applyTheme(theme) {
  const rootEl = document.documentElement;
  rootEl.classList.add('theme-anim');
  rootEl.dataset.theme = theme || 'system';
  clearTimeout(rootEl.__themeT);
  rootEl.__themeT = setTimeout(() => rootEl.classList.remove('theme-anim'), 420);
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  rootEl.dataset.effective = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#100E0B' : '#F5F2E9';
  savePrefs({ theme });
}

matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  if ((document.documentElement.dataset.theme || 'system') === 'system') applyTheme('system');
});
