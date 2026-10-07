import { Art } from '../ui/art.js';
/* Activity: everything that happened while you weren’t looking. */

import { h, esc, buzz, relTime, withSymbol, avatarHTML, money } from '../core/utils.js';
import { Icon } from '../ui/icons.js';
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
  setHeader({ title: 'Alerts', sub: 'What’s new between you and your people' });
  showFab(true);

  // Instant paint from cache
  const cachedEvents = state.events || [];
  const hadCache = cachedEvents.length > 0;
  if (hadCache) {
    mount(outlet, 'app', () => activityHTML(cachedEvents, [], { loading: true }), (main) => bind(main, cachedEvents, []));
  } else {
    mount(outlet, 'app', () => `<div class="card skeleton" style="height:80px"></div><div class="card skeleton" style="height:80px"></div>`);
  }

  const [ev, inc] = await Promise.allSettled([api.events(), api.incoming()]);
  if (!isCurrent()) return;
  const events = ev.status === 'fulfilled' ? ev.value.events : cachedEvents;
  // Only unfinished, unconfirmed entries need a review; settled entries aren't tasks.
  const incoming = inc.status === 'fulfilled' ? inc.value.entries.filter(e => e.status === 'open' && !e.confirmedAt) : [];
  const failed = ev.status === 'rejected' || inc.status === 'rejected';
  if (ev.status === 'fulfilled') {
    setState({ events, unread: ev.value.unread });
    if (ev.value.unread) api.readEvents().then(() => {
      if (isCurrent()) setState({ unread: 0 });
    }).catch(() => {});
  }
  mount(outlet, 'app', () => activityHTML(events, incoming, { failed }), (main) => bind(main, events, incoming), { animate: !hadCache });
}

function activityHTML(events, incoming, { failed = false, loading = false } = {}) {
  const notice = failed ? `<div class="activity-notice" role="status"><span>${Icon.wifiOff}</span><div><strong>Couldn’t check all your updates</strong><p>${events.length || incoming.length ? 'These are the updates we have. ' : ''}Try again to see the latest.</p><button class="btn btn--outline btn--sm" data-act="retry">${Icon.refresh} Try again</button></div></div>` : loading ? '<p class="tiny muted" role="status">Checking for updates…</p>' : '';
  if (!events.length && !incoming.length && !failed && !loading) {
    return `<div class="card"><div class="empty">
      <div class="empty__art empty__art--alerts">${Art.plane()}</div>
      <h3>You’re up to date</h3>
      <p>New entries, replies, and invitations will appear here. Nothing needs your attention right now.</p>
      <a class="btn btn--outline" href="#/">Back to your people</a>
    </div></div>`;
  }

  return `
  ${notice}
  ${incoming.length ? `<section class="activity-section"><div class="section-head"><h2>Ready to review</h2><span class="activity-count">${incoming.length}</span></div><p class="activity-section__intro">Check the details your people added. Open their ledger to confirm or ask about a line.</p><div class="list">${incoming.map(incomingRow).join('')}</div></section>` : ''}
  ${events.length ? `<section class="activity-section"><div class="section-head"><h2>Recent updates</h2><span class="tiny dim">Swipe to dismiss</span></div><div class="list">${[...events].sort((a, b) => b.createdAt - a.createdAt).map(eventRow).join('')}</div></section>` : ''}
  ${events.length ? '<p class="tiny dim center">Recent updates stay here until you dismiss them.</p>' : ''}`;
}

function eventRow(e) {
  const meta = TYPE_META[e.type] || { icon: 'info', tone: '' };
  const tone = meta.tone === 'warn' ? 'warn' : meta.tone;
  const fg = tone ? `var(--${tone})` : 'var(--ink-2)';
  const tag = e.friendshipId ? 'button' : 'div';
  return `
  <div class="alert-row ${e.read ? '' : 'is-unread'}" data-alert="${esc(e.id)}">
  <${tag} class="alert-row__content" ${e.friendshipId ? `type="button" data-ev="${esc(e.friendshipId)}"` : ''}>
    <span class="alert-row__icon" style="color:${fg}">${Icon[meta.icon]}</span>
    <span class="alert-row__copy">
      <span class="alert-row__message">${esc(e.body || e.type)}</span>
      <span class="alert-row__meta">${relTime(e.createdAt)}${e.read ? '' : ' · New'}${e.friendshipId ? ' · View ledger' : ''}</span>
    </span>
  </${tag}>
  <button class="alert-row__dismiss" data-dismiss-event="${esc(e.id)}" type="button" aria-label="Dismiss notification">${Icon.close}</button>
  </div>`;
}

function incomingRow(e) {
  const isDue = e.direction === 'owed_by_me';
  return `
  <button class="alert-row__content alert-review" type="button" data-incoming="${esc(e.id)}">
    <span class="alert-row__avatar">${avatarHTML({ name:e.friend.name, seed:e.friend.avatarSeed, size:36 })}</span>
    <span class="alert-row__copy">
      <span class="alert-row__message">
        <b>${esc(e.friend.name)}</b> logged ${isDue ? `that you owe them ${e.kind === 'money' ? withSymbol(e.amount) : 'something'}` : `that they owe you ${e.kind === 'money' ? withSymbol(e.amount) : 'something'}`}
      </span>
      <span class="alert-row__meta">${esc(e.note || '')} ${e.note ? '· ' : ''}${relTime(e.createdAt)}</span>
      <span class="alert-row__next">Review together ${Icon.chevR}</span>
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
    if (act?.dataset.act === 'retry') return navigate('/activity');
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
      if (entry?.friend?.id) return navigate(`/friend/${entry.friend.id}/entry/${entry.id}`);
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
