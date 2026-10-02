/* Hash router: deep-linkable, works offline, no build step. */

import { $ } from './utils.js';

const routes = new Map();
let notFound = null;
let current = null;
let outlet = null;
let guard = null;

export function defineRoutes(map) {
  for (const [pattern, handler] of Object.entries(map)) routes.set(pattern, handler);
}

export function setNotFound(fn) { notFound = fn; }
export function setGuard(fn) { guard = fn; }
export function setOutlet(el) { outlet = el; }

/** '/friend/:id' -> regex + param names */
function compile(pattern) {
  const names = [];
  const src = pattern
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) { names.push(seg.slice(1)); return '([^/]+)'; }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { re: new RegExp(`^${src}$`), names };
}

const compiled = new Map();
function match(path) {
  for (const [pattern, handler] of routes) {
    if (!compiled.has(pattern)) compiled.set(pattern, compile(pattern));
    const { re, names } = compiled.get(pattern);
    const m = path.match(re);
    if (m) {
      const params = {};
      names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
      return { handler, params, pattern };
    }
  }
  return null;
}

export function currentPath() {
  const h = location.hash.replace(/^#/, '') || '/';
  return h.split('?')[0] || '/';
}

export function currentQuery() {
  const h = location.hash.replace(/^#/, '');
  const i = h.indexOf('?');
  return i === -1 ? {} : Object.fromEntries(new URLSearchParams(h.slice(i + 1)));
}

export function navigate(path, { replace = false, silent = false } = {}) {
  const target = `#${path.startsWith('/') ? path : `/${path}`}`;
  if (location.hash === target) { if (!silent) render(); return; }
  if (replace) history.replaceState(null, '', target);
  else location.hash = target;
  if (replace) render();
}

export const go = navigate;
export const back = () => history.back();

let renderHook = null;
export function setRenderHook(fn) { renderHook = fn; }

/* Direction of the current render, so views can animate like native screens:
   'push' drills in, 'back' pops out, 'tab' cross-rises. */
const TAB_ROOTS = ['/', '/groups', '/activity', '/you'];
let navStack = [];
let lastDir = 'tab';
function computeDir(path) {
  if (!navStack.length) { navStack = [path]; lastDir = 'tab'; return lastDir; }
  const top = navStack[navStack.length - 1];
  if (path === top) { lastDir = 'tab'; return lastDir; }
  if (navStack.length > 1 && navStack[navStack.length - 2] === path) {
    navStack.pop(); lastDir = 'back'; return lastDir;
  }
  if (TAB_ROOTS.includes(path)) { navStack = [path]; lastDir = 'tab'; return lastDir; }
  navStack.push(path); lastDir = 'push'; return lastDir;
}
export const navDir = () => lastDir;
export const resetNavStack = () => { navStack = []; };

export async function render() {
  const path = currentPath();
  const found = match(path) || (notFound ? { handler: notFound, params: {}, pattern: '*' } : null);
  if (!found) return;

  if (guard) {
    const redirect = await guard(path, found);
    if (redirect) return navigate(redirect, { replace: true });
  }

  current = { path, ...found };
  if (!outlet) outlet = $('#app');

  computeDir(path);
  outlet.scrollTop = 0;
  const mainEl = document.querySelector('#main');
  if (mainEl) mainEl.scrollTop = 0;
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

  try {
    await found.handler({ params: found.params, query: currentQuery(), outlet, path });
    renderHook?.();
  } catch (e) {
    console.error('[route]', path, e);
    const target = document.querySelector('#main') || outlet;
    target.innerHTML = `
      <div class="empty" style="padding-top:80px">
        <div class="empty__art">⚠️</div>
        <h3>That page fell over</h3>
        <p>${e?.message || 'Something went wrong rendering this screen.'}</p>
        <button class="btn btn--primary" data-fix="home">Back to your ledger</button>
      </div>`;
    target.querySelector('[data-fix]')?.addEventListener('click', () => { location.hash = '#/'; });
  }
}

/* Chromium fires BOTH hashchange and popstate for hash navigation, and
   fast consecutive navigations can stack. Coalesce to one render per tick. */
let renderQueued = false;
export function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => { renderQueued = false; render(); });
}

export function startRouter() {
  window.addEventListener('hashchange', queueRender);
  window.addEventListener('popstate', queueRender);
  queueRender();
}

export const getCurrent = () => current;
