/* Activity: everything that happened while you weren’t looking. */

import { h, esc, buzz, relTime, withSymbol, avatarHTML, money } from '../core/utils.js';
import { Icon } from '../ui/icons.js';
import { Art } from '../ui/art.js';
import { api } from '../core/api.js';
import { state, setState, bus } from '../core/store.js';
import { mount, setHeader, showFab } from './view.js';
import { navigate } from '../core/router.js';
import { toast, toastError } from '../ui/toast.js';

const TYPE_META = {
  entry_new: { icon: 'plus', tone: 'credit' },
  entry_settled: { icon: 'checkCircle', tone: 'settled' },
  entry_confirmed: { icon: 'shield', tone: 'settled' },
  reminder: { icon: 'nudge', tone: 'gold' },
  dispute: { icon: 'alert', tone: 'warn' },
  friend_joined: { icon: 'people', tone: 'credit' },
};

export async function viewActivity({ outlet, isCurrent = () => true }) {
  setHeader({ title: 'Alerts', sub: 'New lines, replies, and updates' });
  showFab(true);

  // Instant paint from cache
  const cachedEvents = state.events;
  const hadCache = !!cachedEvents;
  if (hadCache) {
    mount(outlet, 'app', () => activityHTML(cachedEvents, [], cachedEvents.length > 0), (main) => bind(main, cachedEvents, []));
  } else {
    mount(outlet, 'app', () => `<div class="card skeleton" style="height:80px"></div><div class="card skeleton" style="height:80px"></div>`);
  }

  let events = [];
  let incoming = [];
  let unread = 0;
  try {
    const [ev, inc] = await Promise.all([
      api.events().catch(() => ({ events: [], unread: 0 })),
      api.incoming().catch(() => ({ entries: [] })),
    ]);
    if (!isCurrent()) return;
    events = ev.events; unread = ev.unread; incoming = inc.entries;
    setState({ events, unread: 0 });
    if (unread) api.readEvents().catch(() => {});
  } catch (e) {
    if (!isCurrent()) return;
    toastError(e.message);
  }

  const changed = !hadCache ||
    JSON.stringify(events) !== JSON.stringify(cachedEvents) ||
    incoming.length > 0;

  if (changed) {
    const hasContent = events.length || incoming.length;
    mount(outlet, 'app', () => activityHTML(events, incoming, hasContent), (main) => bind(main, events, incoming), { animate: !hadCache });
  }
}

function activityHTML(events, incoming, hasContent) {
  if (!hasContent) {
    return `<div class="card"><div class="empty">
      <div class="empty__art">${Art.plane()}</div>
      <h3>Nothing new yet</h3>
      <p>When someone joins or responds to a shared line, you’ll see it here.</p>
      <button class="btn btn--primary" data-act="invite">Invite a person</button>
    </div></div>`;
  }

  const feed = [
    ...events.map((e) => ({ ts: e.createdAt, kind: 'event', data: e })),
    ...incoming.map((e) => ({ ts: e.createdAt, kind: 'incoming', data: e })),
  ].sort((a, b) => b.ts - a.ts);

  return `
  <div class="list">
    ${feed.map((item) => item.kind === 'event' ? eventRow(item.data) : incomingRow(item.data)).join('')}
  </div>
  <p class="tiny dim center">Only in-app updates here. We never message your friends for you.</p>`;
}

function eventRow(e) {
  const meta = TYPE_META[e.type] || { icon: 'info', tone: '' };
  const tone = meta.tone === 'warn' ? 'warn' : meta.tone;
  const bg = tone ? `var(--${tone}-bg)` : 'var(--surface-3)';
  const fg = tone ? `var(--${tone})` : 'var(--ink-2)';
  return `
  <div class="alert-row" data-alert="${esc(e.id)}">
  <button class="setrow alert-row__content" data-ev="${esc(e.friendshipId || '')}" style="align-items:flex-start;${e.read ? '' : 'background:var(--surface-2)'}">
    <span class="setrow__icon" style="background:${bg};color:${fg}">${Icon[meta.icon]}</span>
    <span class="grow wrap">
      <span class="setrow__label" style="font-weight:${e.read ? 500 : 650};font-size:var(--fs-14);line-height:1.35;display:block">${esc(e.body || e.type)}</span>
      <span class="setrow__hint">${relTime(e.createdAt)}${e.read ? '' : ' · new'}</span>
    </span>
    ${e.read ? '' : '<span class="dot" style="margin-top:8px"></span>'}
  </button>
  <button class="alert-row__dismiss" data-dismiss-event="${esc(e.id)}" type="button" aria-label="Dismiss notification">${Icon.close}</button>
  </div>`;
}

function incomingRow(e) {
  const isDue = e.direction === 'owed_by_me';
  return `
  <button class="setrow" data-incoming="${esc(e.id)}" style="align-items:flex-start">
    <span class="setrow__icon" style="background:var(--${isDue ? 'due' : 'credit'}-bg);color:var(--${isDue ? 'due' : 'credit'})">${Icon[isDue ? 'arrowUp' : 'arrowDown']}</span>
    <span class="grow wrap">
      <span class="setrow__label" style="font-size:var(--fs-14);display:block">
        <b>${esc(e.friend.name)}</b> logged ${isDue ? `that you owe them ${e.kind === 'money' ? withSymbol(e.amount) : 'something'}` : `that they owe you ${e.kind === 'money' ? withSymbol(e.amount) : 'something'}`}
      </span>
      <span class="setrow__hint">${esc(e.note || '')} ${e.note ? '· ' : ''}${relTime(e.createdAt)}</span>
    </span>
  </button>`;
}

function bind(main, events, incoming) {
  main.querySelectorAll('[data-alert]').forEach((row) => {
    let startX = 0;
    let startY = 0;
    let suppressClick = false;
    row.addEventListener('click', (event) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    }, true);
    row.addEventListener('pointerdown', (event) => { startX = event.clientX; startY = event.clientY; });
    row.addEventListener('pointerup', (event) => {
      const dx = event.clientX - startX;
      if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(event.clientY - startY) * 1.3) {
        event.preventDefault();
        event.stopPropagation();
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 300);
        dismissEvent(row.dataset.alert, row, events);
      }
    });
  });
  main.addEventListener('click', async (e) => {
    const dismiss = e.target.closest('[data-dismiss-event]');
    if (dismiss) { e.stopPropagation(); return dismissEvent(dismiss.dataset.dismissEvent, dismiss.closest('[data-alert]'), events); }
    const act = e.target.closest('[data-act]');
    if (act?.dataset.act === 'invite') {
      buzz(8);
      const { friends } = await api.friends();
      const { openInvite } = await import('./home.js');
      return openInvite(friends);
    }
    const ev = e.target.closest('[data-ev]');
    if (ev && ev.dataset.ev) { buzz(6); return navigate(`/friend/${ev.dataset.ev}`); }
    const inc = e.target.closest('[data-incoming]');
    if (inc) {
      buzz(6);
      const entry = incoming.find((x) => x.id === inc.dataset.incoming);
      if (entry?.friend?.id) return navigate(`/friend/${entry.friend.id}`);
      return toast('That person hasn’t been added to your side of the book yet.');
    }
  });
}

async function dismissEvent(id, row, events) {
  if (!row || row.classList.contains('is-removing')) return;
  row.classList.add('is-removing');
  try {
    await api.removeEvent(id);
    const index = events.findIndex((event) => event.id === id);
    if (index !== -1) events.splice(index, 1);
    setState({ events: (state.events || []).filter((event) => event.id !== id) });
    row.remove();
    if (!events.length && !document.querySelector('[data-incoming]')) navigate('/activity');
  } catch (error) {
    row.classList.remove('is-removing');
    toastError(error.message || 'Could not dismiss that update.');
  }
}
