/* View mounting + the persistent app chrome (header, tab bar, FAB). */

import { h, $, buzz } from '../core/utils.js';
import { Icon } from '../ui/icons.js';
import { BrandMark } from '../ui/brand.js';
import { state, setState, bus } from '../core/store.js';
import { navigate, currentPath, navDir } from '../core/router.js';

const mounters = new Map();
let chromeBuilt = false;
let headerBackTo = null;
let headerBackAction = null;

let activeScreenPath = null;
export function resetActiveScreen() { activeScreenPath = null; }

/**
 * @param {string} mode 'app' renders inside the chrome; 'bare' renders full-screen (auth/onboarding).
 * Each render gets a FRESH screen node so delegated listeners never stack up.
 */
export function mount(outlet, mode, renderFn, bindFn, { animate } = {}) {
  if (mode === 'bare') {
    hideChrome();
    $('#app')?.classList.add('is-bare');
    const bare = $('#bare') || outlet;
    const screen = document.createElement('div');
    screen.className = 'screen screen--bare';
    screen.innerHTML = renderFn();
    bare.replaceChildren(screen);
    bare.classList.remove('hide');
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    mounters.set('current', bindFn);
    bindFn?.(screen);
    return screen;
  }

  // Leaving bare (setup/auth) back to the app shell: the body may have
  // scrolled during onboarding. Reset it NOW — before restoring 100dvh —
  // so the tabbar is not pushed below the visible viewport.
  if ($('#app')?.classList.contains('is-bare')) {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }
  showChrome();
  $('#app')?.classList.remove('is-bare');
  $('#bare')?.classList.add('hide');
  const main = $('#main');
  main.classList.remove('main--flush');


  const path = currentPath();
  const shouldAnimate = animate !== undefined ? animate : (activeScreenPath !== path);
  activeScreenPath = path;

  const screen = document.createElement('div');
  screen.className = shouldAnimate ? `screen screen--${navDir()}` : 'screen';
  screen.innerHTML = renderFn();
  main.replaceChildren(screen);
  mounters.set('current', bindFn);
  bindFn?.(screen);
  syncChrome();
  return screen;
}

export function rebind(outlet) { mounters.get('current')?.(outlet); }

/* -------------------------------- chrome --------------------------------- */

export function buildChrome() {
  if (chromeBuilt) return;
  chromeBuilt = true;

  const app = $('#app');
  app.innerHTML = `
    <header class="app-header" id="hdr">
      <div class="app-header__identity">
        <button class="iconbtn hide" id="hdrBack" aria-label="Back" type="button">${Icon.back}</button>
        <div class="grow wrap" id="hdrTitleWrap">
          <div class="app-header__title" id="hdrTitle"></div>
          <div class="app-header__sub hide" id="hdrSub"></div>
        </div>
      </div>
      <span class="app-header__mark" aria-hidden="true">${BrandMark()}</span>
      <div class="app-header__actions" id="hdrActions"></div>
    </header>

    <div class="pull-hint" id="pullHint">Release to refresh</div>
    <main id="main" tabindex="-1"></main>
    <div id="bare" class="hide"></div>

    <nav class="tabbar hide" id="tabbar" aria-label="Primary">
      ${tab('home', '/', 'People', 'ledger')}
      ${tab('groups', '/groups', 'Groups', 'people')}
      <button class="tabbar__add" id="tabAdd" type="button" aria-label="Add entry">${Icon.plus}</button>
      ${tab('alerts', '/activity', 'Alerts', 'bell')}
      ${tab('you', '/you', 'You', 'you')}
    </nav>
  `;

  // Header shadow follows the content region, not the window.
  const hdr = $('#hdr');
  const main = $('#main');
  const onScroll = () => hdr.classList.toggle('is-stuck', main.scrollTop > 6);
  main.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  $('#tabAdd').addEventListener('click', () => { buzz(8); navigate('/add'); });

  $('#tabbar').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (!t) return;
    buzz(6);
    navigate(t.dataset.to);
  });

  // Detail headers always return to their own section, even after a deep link.
  $('#hdrBack').addEventListener('click', () => {
    buzz(6);
    if (headerBackAction) return headerBackAction();
    const path = currentPath();
    navigate(headerBackTo || (path.startsWith('/group/') ? '/groups' : path === '/plus' ? '/you' : '/'));
  });

  // Pull to refresh (touch only)
  bindPullToRefresh(main);

  bus.on('state:unread', syncChrome);
  bus.on('state:user', syncChrome);
}

function tab(id, to, label, iconName) {
  return `
    <a class="tab" data-tab="${id}" data-to="${to}" href="#${to}" role="link">
      <span class="tab__pill"></span>
      <span class="tab__ico">${Icon[iconName]}</span>
      <span class="tab__label">${label}</span>
    </a>`;
}

const TAB_MAP = { '/': 'home', '/review': 'home', '/friend': 'home', '/groups': 'groups', '/group': 'groups', '/activity': 'alerts', '/you': 'you', '/plus': 'you' };

export function syncChrome() {
  const path = currentPath();
  const tabbar = $('#tabbar');
  if (!tabbar) return;

  const activeKey = Object.keys(TAB_MAP).find((k) => path === k || (k !== '/' && path.startsWith(`${k}/`)));
  const active = activeKey ? TAB_MAP[activeKey] : null;
  tabbar.querySelectorAll('[data-tab]').forEach((el) => {
    const isActive = el.dataset.tab === active;
    el.toggleAttribute('aria-current', isActive);
    if (isActive) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });

  const badge = tabbar.querySelector('[data-tab="alerts"] .tab__badge');
  if (state.unread > 0 && !badge) {
    const b = h('span', { class: 'tab__badge num', text: String(Math.min(99, state.unread)) });
    tabbar.querySelector('[data-tab="alerts"]').append(b);
  } else if (state.unread === 0 && badge) badge.remove();
  else if (badge) badge.textContent = String(Math.min(99, state.unread));
}

export function showChrome() {
  $('#tabbar')?.classList.remove('hide');
  $('#hdr')?.classList.remove('hide');
}
export function hideChrome() {
  $('#tabbar')?.classList.add('hide');
  $('#hdr')?.classList.add('hide');
}

/* The floating button is retired; the bar action is always reachable. */
export function showFab(_show = true) {}
export function showTabs(show = true) { $('#tabbar')?.classList.toggle('hide', !show); }

export function setHeader({ title, sub, back = false, backTo = null, onBack = null, actions = [] }) {
  headerBackTo = backTo;
  headerBackAction = onBack;
  const t = $('#hdrTitle');
  const s = $('#hdrSub');
  const b = $('#hdrBack');
  const a = $('#hdrActions');
  if (t) t.innerHTML = title ?? '';
  if (s) { s.innerHTML = sub ?? ''; s.classList.toggle('hide', !sub); }
  if (b) b.classList.toggle('hide', !back);
  const mark = $('.app-header__mark');
  if (mark) mark.classList.toggle('hide', back);
  if (a) {
    a.innerHTML = '';
    for (const act of actions) {
      a.append(h('button', {
        class: 'iconbtn', type: 'button', 'aria-label': act.label, html: act.icon,
        onclick: () => { buzz(6); act.onClick?.(); },
      }));
    }
  }
}

/* ---------------------------- pull to refresh ---------------------------- */

function bindPullToRefresh(main) {
  if (!matchMedia('(hover: none)').matches) return;
  const hint = $('#pullHint');
  let startY = null;
  let pulling = false;

  main.addEventListener('touchstart', (e) => {
    if (main.scrollTop > 4) return;
    if (e.target.closest('input,textarea,[data-nopull]')) return;
    startY = e.touches[0].clientY;
    pulling = true;
  }, { passive: true });

  main.addEventListener('touchmove', (e) => {
    if (!pulling || startY == null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy < 0 || main.scrollTop > 4) { hint.style.height = '0px'; return; }
    const shown = Math.min(58, dy * 0.42);
    hint.style.height = `${shown}px`;
    hint.textContent = shown > 44 ? 'Release to refresh' : 'Pull to refresh';
  }, { passive: true });

  main.addEventListener('touchend', async () => {
    if (!pulling) return;
    pulling = false;
    const wasReady = parseFloat(hint.style.height || '0') > 44;
    hint.style.height = '0px';
    startY = null;
    if (!wasReady) return;
    buzz(12);
    hint.style.height = '34px';
    hint.textContent = 'Refreshing…';
    bus.emit('refresh');
    await new Promise((r) => setTimeout(r, 520));
    hint.style.height = '0px';
  });
}
