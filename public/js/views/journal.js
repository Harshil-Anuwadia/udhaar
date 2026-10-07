/* Deeper mobile journeys, within the same square, forest-and-paper identity. */
import { esc, money, withSymbol, symbol, currencyCode, avatarHTML, formatDate, buzz } from '../core/utils.js';
import { api } from '../core/api.js';
import { bus } from '../core/store.js';
import { navigate, currentPath, currentQuery } from '../core/router.js';
import { journalDays, localDay, paymentPreview } from '../core/journal-helpers.js';
import { Icon } from '../ui/icons.js';
import { RecordSeal } from '../ui/product-art.js';
import { toastOk, toastError } from '../ui/toast.js';
import { confirmSheet } from '../ui/sheet.js';
import { mountProduct, setHeader } from './view.js';
import { photoGallery, bindPhotoGallery, openMomentComposer, openMomentSheet, nudge as openReminder } from './friend.js';

const KIND = { money: 'Money entry', favor: 'A favour', gesture: 'A promise' };
const STATUS = { open: 'Open', settled: 'Settled', disputed: 'Questioned', void: 'Closed' };
const routeFor = (friendId, entryId) => `/friend/${encodeURIComponent(friendId)}/entry/${encodeURIComponent(entryId)}`;
const photosFor = item => item.photos?.length ? item.photos : item.photo ? [item.photo] : [];
const dateLabel = at => formatDate(at, { day: 'numeric', month: 'short', year: 'numeric' });
const dayLabel = at => localDay(at) === localDay(Date.now()) ? 'Today' : new Date(at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const pill = entry => `<span class="record-status record-status--${esc(entry.status)}">${entry.overdue ? 'Overdue' : STATUS[entry.status] || 'Closed'}</span>`;
const currentRoute = () => currentPath() + (Object.keys(currentQuery()).length ? `?${new URLSearchParams(currentQuery())}` : '');

function productMount(ctx, html, bind, { tabs = true } = {}) {
  return mountProduct(ctx.outlet, () => html, bind, { tabs });
}

function pageError(ctx, error, backTo, tabs = true) {
  productMount(ctx, `<div class="product-empty"><span class="product-empty__icon">${Icon.wifiOff}</span><p class="eyebrow">Your book is still here</p><h1>${error.status === 404 ? 'This page has left the book.' : 'Couldn’t open this page.'}</h1><p>${esc(error.message || 'Check your connection and try again.')}</p><button class="btn btn--primary" data-retry>Try again</button><a class="product-text-link" href="#${esc(backTo)}">Back to your ledger ${Icon.chevR}</a></div>`, root => {
    root.querySelector('[data-retry]').onclick = () => navigate(currentRoute());
  }, { tabs });
}

async function loadPerson(ctx, title, backTo, tabs = true) {
  setHeader({ title, back: true, backTo });
  productMount(ctx, `<div class="skeleton" style="height:210px"></div><div class="skeleton" style="height:180px"></div>`, null, { tabs });
  try {
    const data = await api.friend(ctx.params.id);
    return ctx.isCurrent?.() === false ? null : data;
  } catch (error) {
    if (ctx.isCurrent?.() !== false) pageError(ctx, error, `/friend/${ctx.params.id}`, tabs);
    return null;
  }
}

function entryBack(ctx) {
  const from = ctx.query?.from;
  if (from === `/friend/${ctx.params.id}/story`) return from;
  return `/friend/${ctx.params.id}`;
}

function journalRow(entry, { from = '' } = {}) {
  return `<button type="button" class="journal-row" data-entry-route="${esc(routeFor(entry.friendshipId, entry.id) + (from ? `?from=${encodeURIComponent(from)}` : ''))}">
    <span class="journal-row__icon" aria-hidden="true">${Icon[entry.kind === 'money' ? 'receipt' : entry.kind === 'favor' ? 'hands' : 'heart']}</span>
    <span class="journal-row__copy"><strong>${esc(entry.note || KIND[entry.kind])}</strong><span>${STATUS[entry.status] || 'Closed'}${entry.overdue ? ' · overdue' : ''}</span></span>
    <span class="journal-row__amount ${entry.status === 'settled' || entry.status === 'void' ? 'is-settled' : entry.direction === 'owed_to_me' ? 'credit-text' : 'due-text'}"><b>${entry.kind === 'money' ? withSymbol(entry.amount) : entry.kind === 'favor' ? 'Favour' : 'Promise'}</b><small>${entry.status === 'settled' || entry.status === 'void' ? STATUS[entry.status].toLowerCase() : entry.direction === 'owed_to_me' ? 'owed to you' : 'you owe'}</small></span>
  </button>`;
}

function bindEntryRoutes(root) {
  root.querySelectorAll('[data-entry-route]').forEach(button => button.onclick = () => { buzz(6); navigate(button.dataset.entryRoute); });
}

export async function viewEntry(ctx) {
  const backTo = entryBack(ctx);
  const data = await loadPerson(ctx, 'Entry details', backTo, false);
  if (!data) return;
  const { friend, entries } = data;
  const entry = entries.find(item => item.id === ctx.params.entryId);
  if (!entry) { pageError(ctx, { status: 404, message: 'This entry may have been removed. The rest of your ledger is still available.' }, `/friend/${friend.id}`, false); return; }
  const owed = entry.direction === 'owed_to_me';
  const photos = photosFor(entry);
  const root = productMount(ctx, `
    <section class="entry-folio" data-product-ready><div class="entry-folio__top"><div class="entry-folio__identity">${avatarHTML({ name: friend.name, seed: friend.avatar_seed, size: 40, avatarUrl: friend.avatarUrl })}<div><strong>${esc(friend.name)}</strong><span>${KIND[entry.kind]} · ${friend.linked ? 'Shared' : 'Your book'}</span></div></div>${pill(entry)}</div><p class="entry-folio__direction">${owed ? (['settled', 'void'].includes(entry.status) ? 'Was owed to you' : 'Owed to you') : (['settled', 'void'].includes(entry.status) ? 'You owed' : 'You owe')}</p><h1 class="entry-folio__amount ${owed ? 'credit-text' : 'due-text'}">${entry.kind === 'money' ? `<small>${esc(symbol())}</small>${money(entry.amount)}` : entry.kind === 'favor' ? 'A favour' : 'A promise'}</h1><p class="entry-folio__note">${esc(entry.note || 'No note added')}</p></section>
    <section class="entry-facts"><h2 class="eyebrow">The details</h2><dl><div><dt>Recorded</dt><dd>${esc(dateLabel(entry.createdAt))}</dd></div><div><dt>Logged by</dt><dd>${entry.ownedByMe ? 'You' : esc(friend.name)}</dd></div>${entry.dueAt ? `<div><dt>Due date</dt><dd>${esc(dateLabel(entry.dueAt))}${entry.overdue ? ' · overdue' : ''}</dd></div>` : ''}${entry.settledAt ? `<div><dt>Settled</dt><dd>${esc(dateLabel(entry.settledAt))}</dd></div>` : ''}${entry.lastRemindAt ? `<div><dt>Last reminder</dt><dd>${esc(dateLabel(entry.lastRemindAt))}</dd></div>` : ''}</dl></section>
    ${photos.length ? `<section class="entry-receipts"><div class="section-head"><h2>Attached receipts</h2><span class="tiny muted">${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}</span></div>${photoGallery(photos, entry.note || 'Receipt')}</section>` : ''}
    ${entry.status === 'disputed' ? `<div class="product-notice">${Icon.info}<p>This line is questioned. Check the details with ${esc(friend.name)} before reopening it.</p></div><button class="btn btn--outline btn--block" data-entry-action="resolve">We agreed · reopen line</button>` : ''}
    <div class="entry-secondary">${entry.status === 'open' && owed ? `<button class="product-text-link" data-entry-action="remind">${Icon.nudge} Remind ${esc(friend.name)}</button>` : ''}${entry.status === 'settled' || entry.status === 'void' ? '<button class="product-text-link" data-entry-action="reopen">Reopen this line</button>' : ''}${entry.status === 'open' && !entry.ownedByMe ? '<button class="product-text-link" data-entry-action="question">Question this line</button>' : ''}${entry.ownedByMe ? `<button class="product-text-link product-text-link--danger" data-entry-action="delete" aria-label="Delete entry" title="Delete entry">${Icon.trash}</button>` : ''}</div>
    ${entry.status === 'open' ? `<footer class="product-foot"><button class="btn btn--primary btn--lg btn--block" data-record-payment>${Icon.check} ${entry.kind === 'money' ? 'Record payment' : 'Mark as done'}</button><p>${entry.kind === 'money' ? 'Record a payment made outside Udhaar.' : 'Keep the book up to date.'}</p></footer>` : ''}`, root => bindPhotoGallery(root, photos, entry.note || 'Receipt'), { tabs: false });
  root.querySelector('[data-record-payment]')?.addEventListener('click', () => navigate(`/friend/${friend.id}/settle/${entry.id}${ctx.query?.from ? `?from=${encodeURIComponent(ctx.query.from)}` : ''}`));
  root.querySelectorAll('[data-entry-action]').forEach(button => button.onclick = async () => {
    const action = button.dataset.entryAction;
    if (action === 'delete') return confirmSheet({ title: 'Delete this entry?', body: 'Its note and receipts leave the ledger permanently.', confirmLabel: 'Delete entry', danger: true, onConfirm: async () => {
      try { await api.removeEntry(entry.id); bus.emit('data-changed'); toastOk('Entry deleted.'); if (ctx.isCurrent?.() !== false) navigate(backTo); } catch (error) { toastError(error.message); }
    } });
    if (action === 'remind') {
      button.disabled = true;
      try { await openReminder(entry, friend, `${location.origin}/#/join?token=${data.inviteToken}`); }
      finally { button.disabled = false; }
      return;
    }
    const task = action === 'question' ? () => api.dispute(entry.id) : action === 'resolve' ? () => api.resolve(entry.id, 'keep') : () => api.reopen(entry.id);
    confirmSheet({ title: action === 'question' ? 'Question this line?' : 'Reopen this line?', body: action === 'question' ? 'It will be marked as questioned while you check the details together.' : 'It will count as outstanding again. Make sure you both agree.', confirmLabel: action === 'question' ? 'Question line' : 'Reopen line', onConfirm: async () => {
      try { await task(); bus.emit('data-changed'); if (ctx.isCurrent?.() !== false) navigate(currentRoute()); } catch (error) { toastError(error.message); }
    } });
  });
}

export async function viewPayment(ctx) {
  const detailRoute = routeFor(ctx.params.id, ctx.params.entryId) + (ctx.query?.from ? `?from=${encodeURIComponent(ctx.query.from)}` : '');
  const data = await loadPerson(ctx, 'Record payment', detailRoute, false);
  if (!data) return;
  const { friend } = data;
  const entry = data.entries.find(item => item.id === ctx.params.entryId);
  if (!entry || entry.status !== 'open') {
    productMount(ctx, `<div class="product-empty"><span class="product-empty__icon">${Icon.checkCircle}</span><h1>${entry ? 'This line isn’t open.' : 'Entry unavailable.'}</h1><p>Check the latest details before recording a payment.</p><a class="btn btn--primary" href="#${esc(detailRoute)}">View entry</a></div>`, null, { tabs: false });
    return;
  }
  const monetary = entry.kind === 'money';
  const owed = entry.direction === 'owed_to_me';
  const personLine = `${owed ? esc(friend.name) : 'You'} ${monetary ? 'paid' : 'completed this for'} ${owed ? 'you' : esc(friend.name)}`;
  let raw = String(entry.amount), stage = 'amount', sending = false, uncertainSave = false;
  const renderForm = () => {
    if (uncertainSave) return navigate(detailRoute);
    setHeader({ title: monetary ? 'Record payment' : 'Close this line', sub: '01 / 02 · Details', back: true, backTo: detailRoute });
    const root = productMount(ctx, `
      <section class="payment-intro" data-product-ready><h1>${monetary ? 'What was paid?' : 'A little thing,<br>taken care of.'}</h1><p class="product-lede">${monetary ? 'Already paid by cash, UPI, or bank transfer? Record it here.' : `Confirm this ${entry.kind === 'favor' ? 'favour' : 'promise'} is complete.`}</p></section>
      <div class="payment-context">${avatarHTML({ name: friend.name, seed: friend.avatar_seed, size: 40, avatarUrl: friend.avatarUrl })}<div><strong>${esc(friend.name)}</strong><span>${esc(entry.note || KIND[entry.kind])}</span></div>${monetary ? `<b>${withSymbol(entry.amount)}<small>outstanding</small></b>` : ''}</div>
      ${monetary ? `<section class="payment-input-panel"><div class="payment-amount-label"><label class="eyebrow" for="payment-amount">Amount ${owed ? 'received' : 'paid'} · ${esc(currencyCode())}</label><button class="product-text-link" type="button" data-payment-preset="full">Use full amount</button></div><div class="payment-input"><span>${esc(symbol())}</span><input id="payment-amount" type="number" inputmode="decimal" min="0.01" step="0.01" max="${entry.amount}" value="${esc(raw)}" aria-describedby="payment-error" autocomplete="off"></div><p id="payment-error" class="payment-error" role="status"></p></section><div class="payment-remainder"><span>Remaining after payment</span><strong data-payment-remaining>${withSymbol(paymentPreview(raw, entry.amount).remaining)}</strong></div>` : `<div class="payment-note">${Icon.hands}<p>${esc(entry.note || KIND[entry.kind])}</p></div>`}
      <footer class="product-foot"><button class="btn btn--primary btn--lg btn--block" data-review-payment>Review ${monetary ? 'payment' : 'record'} ${Icon.chevR}</button><p>${Icon.lock} ${friend.linked ? 'This updates your shared ledger.' : 'This updates only your book.'}</p></footer>`, null, { tabs: false });
    const update = () => {
      const preview = paymentPreview(raw, entry.amount);
      root.querySelector('[data-payment-remaining]').textContent = withSymbol(preview.remaining);
      root.querySelector('#payment-error').textContent = preview.valid ? '' : preview.error;
      root.querySelector('#payment-amount').setAttribute('aria-invalid', String(!preview.valid));
      const input = root.querySelector('#payment-amount');
      input.style.fontSize = `${Math.max(24, Math.min(48, input.clientWidth / (Math.max(raw.length, 1) * .6)))}px`;
      root.querySelector('[data-review-payment]').disabled = !preview.valid;
      root.querySelector('[data-payment-preset]').style.visibility = preview.valid && preview.amount === entry.amount ? 'hidden' : 'visible';
    };
    if (monetary) {
      root.querySelector('#payment-amount').oninput = event => { raw = event.target.value; update(); };
      root.querySelectorAll('[data-payment-preset]').forEach(button => button.onclick = () => {
        raw = String(entry.amount);
        root.querySelector('#payment-amount').value = raw; buzz(5); update();
      });
      update();
    }
    root.querySelector('[data-review-payment]').onclick = () => { stage = 'confirm'; renderConfirmation(); };
  };
  const renderConfirmation = () => {
    const preview = monetary ? paymentPreview(raw, entry.amount) : { amount: 0, remaining: 0, valid: true };
    if (!preview.valid) return renderForm();
    setHeader({ title: 'Check the record', sub: '02 / 02 · Confirm', back: true, backTo: detailRoute, onBack: () => { if (!sending) { stage = 'amount'; renderForm(); } } });
    const root = productMount(ctx, `<section class="payment-receipt" data-product-ready><span class="eyebrow">${monetary ? 'Payment record' : 'Completed line'}</span><strong>${monetary ? withSymbol(preview.amount) : KIND[entry.kind]}</strong><p>${esc(entry.note || KIND[entry.kind])}</p><dl><div><dt>With</dt><dd>${esc(friend.name)}</dd></div><div><dt>Recorded today</dt><dd>${esc(dateLabel(Date.now()))}</dd></div>${monetary ? `<div><dt>Remaining</dt><dd>${withSymbol(preview.remaining)}</dd></div>` : ''}</dl></section><button class="product-text-link" data-edit-payment>${Icon.edit} Edit ${monetary ? 'amount' : 'record'}</button><div class="product-notice">${Icon.info}<p>${monetary ? 'Udhaar records payments you have already made. Confirming this does not move money.' : 'Confirm only when this favour or promise is complete.'}</p></div><p class="payment-inline-error" role="alert"></p><footer class="product-foot"><button class="btn btn--primary btn--lg btn--block" data-confirm-record>${Icon.check} Confirm record</button><p>You can undo this record after saving.</p></footer>`, null, { tabs: false });
    root.querySelector('[data-edit-payment]').onclick = () => { if (!sending) { stage = 'amount'; renderForm(); } };
    root.querySelector('[data-confirm-record]').onclick = async () => {
      if (sending || stage !== 'confirm' || uncertainSave) return;
      sending = true;
      const button = root.querySelector('[data-confirm-record]');
      button.disabled = true; button.innerHTML = '<span class="btn__spinner"></span> Recording…';
      root.querySelector('[data-edit-payment]').disabled = true;
      try {
        const result = await api.settle(entry.id, monetary ? preview.amount : undefined);
        bus.emit('data-changed');
        if (ctx.isCurrent?.() === false) { toastOk('Record saved.'); return; }
        stage = 'saved';
        renderSuccess(result, { ...preview, remaining: monetary && result.entry.status === 'open' ? result.entry.amount : 0 });
      } catch (error) {
        const uncertain = !error.status || error.status >= 500;
        uncertainSave = uncertain;
        root.querySelector('.payment-inline-error').textContent = uncertain ? 'Couldn’t confirm whether this record saved. Open the latest entry before trying again.' : error.message;
        if (uncertain) {
          const link = document.createElement('a');
          link.className = 'btn btn--outline btn--block'; link.href = `#${detailRoute}`; link.textContent = 'Check latest entry';
          root.querySelector('.payment-inline-error').after(link);
        }
        button.disabled = uncertain; button.innerHTML = `${Icon.check} Confirm record`;
        root.querySelector('[data-edit-payment]').disabled = uncertain;
        root.querySelector('.payment-inline-error').scrollIntoView({ block: 'nearest' });
      } finally { sending = false; }
    };
  };
  const renderSuccess = (result, preview) => {
    setHeader({ title: 'Recorded', back: true, backTo: `/friend/${friend.id}` });
    const root = productMount(ctx, `<section class="payment-success" data-product-ready><span class="payment-success__seal" aria-hidden="true">${RecordSeal()}</span><h1>${monetary ? 'Payment recorded' : 'Line completed'}</h1><p>${personLine}.</p>${monetary ? `<strong class="payment-success__amount">${withSymbol(preview.amount)}</strong>` : ''}</section><section class="payment-receipt payment-receipt--saved"><span class="eyebrow">${esc(entry.note || KIND[entry.kind])}</span><dl><div><dt>Recorded</dt><dd>${esc(dateLabel(Date.now()))}</dd></div><div><dt>Status</dt><dd>${preview.remaining ? 'Part payment' : 'Settled'}</dd></div>${monetary ? `<div><dt>Still outstanding</dt><dd>${withSymbol(preview.remaining)}</dd></div>` : ''}</dl></section><p class="payment-explainer">${preview.remaining ? 'The remaining amount stays on the original line.' : 'One less open line between you.'}</p><p class="payment-inline-error" role="alert"></p><footer class="product-foot"><a class="btn btn--primary btn--lg btn--block" href="#/friend/${esc(friend.id)}">Back to ${esc(friend.name)}</a><button class="product-text-link" data-undo-record>Undo this record</button></footer>`, null, { tabs: false });
    root.querySelector('[data-undo-record]').onclick = async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try { await api.reopen(entry.id, result.settlementId); bus.emit('data-changed'); toastOk('Record undone.'); if (ctx.isCurrent?.() !== false) navigate(detailRoute, { replace: true }); }
      catch (error) {
        button.disabled = Boolean(!error.status || error.status >= 500);
        root.querySelector('.payment-inline-error').textContent = button.disabled ? 'Couldn’t confirm the Undo. Open the ledger to check the latest amount.' : error.message;
      }
    };
  };
  renderForm();
}

export async function viewStory(ctx) {
  const data = await loadPerson(ctx, 'Your story', `/friend/${ctx.params.id}`);
  if (!data) return;
  const { friend, entries, moments = [] } = data;
  const settled = entries.filter(entry => entry.status === 'settled').length;
  const items = [...entries.map(entry => ({ ...entry, type: 'entry', friendshipId: friend.id, at: entry.createdAt })), ...moments.map(moment => ({ ...moment, type: 'moment', at: new Date(`${moment.occurredOn}T12:00:00`).getTime() }))];
  const first = items.length ? items.reduce((firstAt, item) => Math.min(firstAt, item.at), Infinity) : null;
  const route = `/friend/${friend.id}/story`;
  let filter = 'all';
  const root = productMount(ctx, `<section class="story-cover" data-product-ready><div class="story-cover__identity">${avatarHTML({ name: friend.name, seed: friend.avatar_seed, size: 40, avatarUrl: friend.avatarUrl })}<div><h1>You + ${esc(friend.name)}</h1><p>${first ? `Since ${esc(new Date(first).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }))}` : 'Your shared history'}</p></div><button class="product-text-link" data-add-moment>${Icon.plus}<span>Add a moment</span></button></div><div class="story-cover__stats"><div><b>${entries.length}</b><span>Ledger lines</span></div><div><b>${settled}</b><span>Settled</span></div><div><b>${moments.length}${moments.length === 50 ? '+' : ''}</b><span>Private moments</span></div></div></section><div class="story-tools"><div class="product-segments" aria-label="Timeline contents"><button type="button" data-story-filter="all" aria-pressed="true">All activity</button><button type="button" data-story-filter="moment" aria-pressed="false">Moments</button></div></div><p class="story-privacy">${Icon.lock}<span>Moments are only yours. ${friend.linked ? 'Ledger entries are shared.' : 'This ledger is only in your book.'}${moments.length === 50 ? ' Showing the latest 50 moments.' : ''}</span></p><div class="story-timeline" tabindex="0" role="region" aria-label="Entries and private moments"></div>`, null);
  const draw = () => {
    const visible = items.filter(item => filter === 'all' || item.type === filter);
    root.querySelectorAll('[data-story-filter]').forEach(button => button.setAttribute('aria-pressed', button.dataset.storyFilter === filter));
    const timeline = root.querySelector('.story-timeline');
    timeline.innerHTML = visible.length ? journalDays(visible).map(day => `<section class="story-day"><h2>${esc(dayLabel(day.at))}</h2><div class="story-day__items">${day.items.map(item => item.type === 'entry' ? journalRow(item, { from: route }) : `<article class="story-moment"><div class="story-moment__heading"><span>${Icon.moment} A little moment</span><small>${Icon.lock} Only you</small></div>${photosFor(item).length ? photoGallery(photosFor(item), item.title) : ''}<h3>${esc(item.title)}</h3>${item.note ? `<p>${esc(item.note)}</p>` : ''}<button class="product-text-link" data-story-moment="${esc(item.id)}">View moment ${Icon.chevR}</button></article>`).join('')}</div></section>`).join('') : `<div class="journal-empty">${Icon.moment}<h2>${filter === 'moment' ? 'Keep something worth remembering.' : 'Your story starts here.'}</h2><p>${filter === 'moment' ? 'A photo, a thank-you, or a small detail. Only you will see it.' : 'Entries and private moments will appear here as you add them.'}</p></div>`;
    timeline.scrollTop = 0;
    bindEntryRoutes(timeline);
    timeline.querySelectorAll('.story-moment').forEach(article => {
      const item = moments.find(moment => moment.id === article.querySelector('[data-story-moment]').dataset.storyMoment);
      bindPhotoGallery(article, photosFor(item), item.title);
      article.querySelector('[data-story-moment]').onclick = () => openMomentSheet(item, friend, { onDeleted: () => { if (ctx.isCurrent?.() !== false) navigate(route); } });
    });
  };
  root.querySelectorAll('[data-story-filter]').forEach(button => button.onclick = () => { filter = button.dataset.storyFilter; buzz(5); draw(); });
  root.querySelector('[data-add-moment]').onclick = () => openMomentComposer(friend, { onSaved: () => { if (ctx.isCurrent?.() !== false) navigate(route); } });
  draw();
}
