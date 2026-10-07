/* One friendship, end to end: balance, ledger, settle, nudge, invite. */

import { h, esc, buzz, money, symbol, withSymbol, relTime, dueLabel, avatarHTML, plural, daysBetween, formatDate, copyText, share, shortMoney, currencyCode } from '../core/utils.js';
import { Icon } from '../ui/icons.js';
import { api } from '../core/api.js';
import { state, bus } from '../core/store.js';
import { mount, setHeader, showFab } from './view.js';
import { navigate, currentPath } from '../core/router.js';
import { toast, toastOk, toastError } from '../ui/toast.js';
import { Sheet, confirmSheet } from '../ui/sheet.js';
import { confetti } from '../ui/confetti.js';
import { bindSwipe } from '../ui/swipe.js';
import { openLightbox } from '../ui/lightbox.js';
import { Art } from '../ui/art.js';
import { openRecord } from './add.js';
import { friendQuietCopy } from '../core/voice.js';
import { photoPicker } from '../ui/photo-picker.js';

const KIND_ICON = { money: 'rupee', favor: 'hands', gesture: 'heart' };
const KIND_WORD = { money: 'money', favor: 'favour', gesture: 'promise' };

export async function viewFriend({ outlet, params, isCurrent = () => true }) {
  mount(outlet, 'app', () => `
    <div class="card skeleton" style="height:160px"></div>
    <div class="card skeleton" style="height:260px"></div>`);
  setHeader({ title: '', back: true });
  showFab(false);

  let data;
  try {
    data = await api.friend(params.id);
  } catch (e) {
    if (!isCurrent()) return;
    mount(outlet, 'app', () => `
      <div class="empty" style="padding-top:80px">
        <div class="empty__art">${Icon.alert}</div>
        <h3>Not in your book</h3>
        <p>${esc(e.message)}</p>
        <a class="btn btn--primary" href="#/">Back to the ledger</a>
      </div>`);
    return;
  }
  if (!isCurrent()) return;

  const { friend, entries, moments = [], history, inviteToken } = data;
  setHeader({
    title: `<span class="friend-title">${avatarHTML({ name: friend.name, seed: friend.avatar_seed, size: 32, avatarUrl: friend.avatarUrl })}<span class="friend-title__copy"><h1>${esc(friend.name)}</h1><span>${friend.linked ? 'Shared ledger · live' : 'Only in your book'}</span></span></span>`,
    back: true,
    actions: [{ label: 'Person settings', icon: Icon.settings, onClick: () => openFriendMenu(friend, inviteToken, () => viewFriend({ outlet, params })) }],
  });

  mount(outlet, 'app', () => friendHTML(friend, entries, moments, history, inviteToken), (main) => bindFriend(main, friend, entries, moments, history, inviteToken));
  showFab(true);
}

function friendHTML(f, entries, moments, history, inviteToken) {
  const cur = currencyCode();
  const open = entries.filter((e) => e.status === 'open');
  const settled = entries.filter((e) => e.status === 'settled');
  const disputed = entries.filter((e) => e.status === 'disputed');
  const positive = f.net > 0;
  const zero = f.net === 0 && f.openCount === 0;
  const days = history.firstAt ? daysBetween(history.firstAt, Date.now()) : null;
  const shareUrl = `${location.origin}/#/join?token=${inviteToken}`;
  const quiet = disputed.length
    ? { title: 'No other open lines', body: 'The questioned line is above. It stays here until you both agree.' }
    : friendQuietCopy({ hasHistory: !!history.firstAt, seed: f.id });

  return `
  ${f.note ? `<p class="friend-private-note anim-rise"><span>Your note</span>${esc(f.note)}</p>` : ''}

  <section class="card balance-hero anim-rise" style="animation-delay:40ms">
    <div class="netcard__label">${f.net === 0 ? 'Between you two' : positive ? 'They owe you' : 'You owe them'}</div>
    <div class="balance-hero__amt" style="color:${f.net === 0 ? 'var(--ink-3)' : positive ? 'var(--credit)' : 'var(--due)'}">
      <span class="num">${withSymbol(Math.abs(f.net), cur)}</span>
    </div>
    ${f.favorsToMe + f.favorsByMe + f.gesturesToMe + f.gesturesByMe > 0 ? `
      <div class="hero-tags">
        ${f.favorsToMe ? chipTag('gold', `${plural(f.favorsToMe, 'favour')} owed to you`) : ''}
        ${f.favorsByMe ? chipTag('due', `you owe ${plural(f.favorsByMe, 'favour')}`) : ''}
        ${f.gesturesToMe ? chipTag('credit', `${plural(f.gesturesToMe, 'promise')}`) : ''}
      </div>` : ''}

    <div class="hero-actions">
      <button class="btn btn--primary" data-act="log">${Icon.edit} Add entry</button>
      ${positive || (f.net === 0 && open.length) ? `<button class="btn btn--outline" data-act="settle-all">${Icon.check} Settle up</button>` : ''}
      ${f.net < 0 ? `<button class="btn btn--outline" data-act="pay">${Icon.check} I paid them</button>` : ''}
    </div>
  </section>

  <button class="person-story-link" type="button" data-act="story"><span>${Icon.ledger}</span><span><strong>Your story with ${esc(f.name)}</strong><small>${entries.length} ledger ${entries.length === 1 ? 'line' : 'lines'} · ${moments.length} private ${moments.length === 1 ? 'moment' : 'moments'}</small></span>${Icon.chevR}</button>
  ${disputed.length ? `
  <section class="anim-rise">
    <div class="section-head"><h2 style="color:var(--warn)">Disputed</h2></div>
    <div class="list">${disputed.map((e) => entryRow(e, cur, f)).join('')}</div>
  </section>` : ''}

  <section class="anim-rise" style="animation-delay:100ms">
    <div class="section-head">
      <h2>Open lines · ${open.length}</h2>
      ${open.some(e => e.direction === 'owed_to_me') ? `<button class="btn btn--quiet btn--sm" data-act="nudge">${Icon.nudge} Remind</button>` : ''}
    </div>
    ${open.length
      ? `<div class="list" id="openList">${open.map((e) => swipeRow(e, cur, f)).join('')}</div>
         <p class="tiny dim center" style="margin-top:8px">Swipe left on a line to settle or remind</p>`
      : moments.length ? `<p class="moment-empty">Nothing open right now.</p>`
      : `<div class="card"><div class="empty" style="padding:var(--s8) var(--s5)">
          <div class="empty__art">${Art.chai()}</div>
          <h3>${quiet.title}</h3>
          <p>${quiet.body}</p>
        </div></div>`}
  </section>

  ${settled.length ? `
  <section class="anim-rise">
    <div class="section-head"><h2>Settled</h2><span class="tiny dim">${settled.length}</span></div>
    <div class="list">${settled.slice(0, 3).map((e) => entryRow(e, cur, f)).join('')}</div>
  </section>` : ''}

  <section class="anim-rise moment-section" aria-label="Moments with ${esc(f.name)}">
    <div class="section-head">
      <h2>Little moments</h2>
      <button type="button" data-act="moment">${Icon.moment} Add a moment</button>
    </div>
    ${moments.length ? `<div class="moment-list">${moments.map(momentRow).join('')}</div>`
      : `<p class="moment-empty">A photo, a thank-you, or something you want to remember. Moments are private to you.</p>`}
  </section>

  <section class="ledger-invite anim-rise">
    <div class="ledger-invite__heading">
      <span class="ledger-invite__icon">${f.linked ? Icon.link : Icon.send}</span>
      <div><h2>${f.linked ? 'One ledger. Both sides.' : 'Better with both of you.'}</h2><p>${f.linked ? 'You’re connected. New entries and changes appear for you both.' : `Invite ${esc(f.name)} to see their side of the story.`}</p></div>
    </div>
    <div class="ledger-invite__actions">
      <button class="btn btn--primary" data-act="sendlink">${Icon.send} ${f.linked ? 'Share link' : 'Share invite'}</button>
      <button class="btn btn--outline" data-act="copylink">${Icon.copy} Copy link</button>
    </div>
    <p class="ledger-invite__privacy">${Icon.lock}<span>${f.linked ? 'Personal notes and moments stay private.' : 'Only send this link to them. Accepting it connects your ledgers.'}</span></p>
  </section>
  `;
}

const chipTag = (tone, text) => `<span class="tag tag--${tone}">${text}</span>`;

function momentDate(day) {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function photoGallery(photos, label) {
  if (!photos.length) return '';
  return `<div class="photo-gallery ${photos.length === 1 ? 'photo-gallery--single' : ''}" aria-label="${esc(label)} photos">
    ${photos.map((url, index) => `<button type="button" class="photo-gallery__item" data-photo-index="${index}" aria-label="Open photo ${index + 1} of ${photos.length}">
      <img src="${esc(url)}" alt="${esc(label)} · ${index + 1} of ${photos.length}" loading="lazy">
      ${photos.length > 1 ? `<span>${index + 1}/${photos.length}</span>` : ''}
    </button>`).join('')}
  </div>`;
}

export function bindPhotoGallery(root, photos, label) {
  root.querySelectorAll('[data-photo-index]').forEach((button) => button.addEventListener('click', () => {
    openLightbox(photos[Number(button.dataset.photoIndex)], label);
  }));
}

function momentRow(m) {
  return `<button class="moment-row" type="button" data-moment="${esc(m.id)}">
    ${m.photo ? `<span class="moment-row__photo"><img src="${esc(m.photo)}" alt="" loading="lazy">${m.photos?.length > 1 ? `<small>+${m.photos.length - 1}</small>` : ''}</span>` : `<span class="moment-row__glyph" aria-hidden="true">${Icon.heart}</span>`}
    <span class="moment-row__copy"><strong>${esc(m.title)}</strong><span>${esc(momentDate(m.occurredOn))}${m.note ? ` · ${esc(m.note)}` : ''}</span></span>
    <span class="moment-row__private" title="Only you can see this">${Icon.lock}<span>Only you</span></span>
  </button>`;
}

function swipeRow(e, cur, f) {
  return `
  <div class="swipe" data-swipe="${e.id}">
    <div class="swipe__actions"></div>
    <div class="swipe__content">${entryRow(e, cur, f, true)}</div>
  </div>`;
}

function entryRow(e, cur, f, swipeable = false) {
  const isDue = e.direction === 'owed_to_me';
  const tone = e.status === 'settled' ? 'settled' : isDue ? 'credit' : 'due';
  const amt = e.kind === 'money' ? withSymbol(e.amount, cur) : (e.kind === 'favor' ? 'favour' : 'promise');
  return `
  <button class="entry ${e.status === 'settled' ? 'is-settled' : ''}" data-entry="${e.id}" type="button" style="width:100%">
    <span class="entry__mark entry__mark--${tone}">${e.kind === 'money' ? Icon.money : Icon[KIND_ICON[e.kind]]}</span>
    <span class="grow wrap">
      <span class="entry__note">${esc(e.note || KIND_WORD[e.kind])}</span>
      <span class="entry__meta">
        ${e.status === 'settled'
          ? `<span class="settled-text">settled ${relTime(e.settledAt)}</span>`
          : e.overdue
            ? `<b style="color:var(--due)">${esc(dueLabel(e.dueAt))}</b>`
            : e.dueAt ? `<span>${esc(dueLabel(e.dueAt))}</span>` : `<span>${relTime(e.createdAt)}</span>`}
        ${e.remindCount ? `<span class="tag tag--gold" style="padding:1px 6px">nudged ×${e.remindCount}</span>` : ''}
        ${e.confirmedAt ? `<span class="tag tag--settled" style="padding:1px 6px">confirmed</span>` : ''}
        ${e.status === 'disputed' ? `<span class="tag tag--warn" style="padding:1px 6px">disputed</span>` : ''}
      </span>
    </span>
    ${e.photo ? `<span class="entry__photo"><img src="${esc(e.photo)}" alt="" loading="lazy">${e.photos?.length > 1 ? `<small>+${e.photos.length - 1}</small>` : ''}</span>` : ''}
    <span class="entry__amt"><b class="${tone}-text">${amt}</b></span>
  </button>`;
}

/* --------------------------------- bind ---------------------------------- */

function bindFriend(main, f, entries, moments, history, inviteToken) {
  const shareUrl = `${location.origin}/#/join?token=${inviteToken}`;
  const open = entries.filter((e) => e.status === 'open');

  main.querySelectorAll('[data-swipe]').forEach((row) => {
    const id = row.dataset.swipe;
    const e = entries.find((x) => x.id === id);
    bindSwipe(row, {
      actions: e.direction === 'owed_to_me'
        ? [
            { id: 'settle', label: 'Settled', tone: 'settle', icon: Icon.check },
            { id: 'remind', label: 'Nudge', tone: 'remind', icon: Icon.nudge },
          ]
        : [
            { id: 'settle', label: 'Paid', tone: 'settle', icon: Icon.check },
            ...(e.ownedByMe ? [{ id: 'delete', label: 'Delete', tone: 'delete', icon: Icon.trash }] : []),
          ],
      onAction: async (act) => {
        if (act === 'settle') return settleEntry(e, f, main);
        if (act === 'remind') return nudge(e, f, shareUrl);
        if (act === 'delete') return confirmSheet({
          title: 'Delete this line?',
          body: `“${esc(e.note || KIND_WORD[e.kind])}” disappears from the book. This cannot be undone.`,
          confirmLabel: 'Tear it out',
          danger: true,
          onConfirm: async () => {
            try { await api.removeEntry(e.id); toastOk('Torn out.'); bus.emit('data-changed'); main.innerHTML = ''; viewFriend({ outlet: main.closest('#app') || document.body, params: { id: f.id } }); }
            catch (err) { toastError(err.message); }
          },
        });
      },
    });
  });

  main.addEventListener('click', async (ev) => {
    const entryEl = ev.target.closest('[data-entry]');
    const momentEl = ev.target.closest('[data-moment]');
    const actEl = ev.target.closest('[data-act]');

    if (entryEl) {
      return navigate(`/friend/${f.id}/entry/${entryEl.dataset.entry}`);
    }
    if (momentEl) {
      const moment = moments.find((item) => item.id === momentEl.dataset.moment);
      if (moment) return openMomentSheet(moment, f);
    }
    if (!actEl) return;
    buzz(8);
    const act = actEl.dataset.act;

    if (act === 'log') return openRecord({ friendshipId: f.id });
    if (act === 'moment') return openMomentComposer(f);
    if (act === 'story') return navigate(`/friend/${f.id}/story`);
    if (act === 'settle-all') return settleAll(open, f);
    if (act === 'pay') return settleAll(open.filter((e) => e.direction === 'owed_by_me'), f, 'paid');
    if (act === 'nudge') return nudgeAll(open.filter((e) => e.direction === 'owed_to_me'), f, shareUrl);
    if (act === 'copylink') {
      const ok = await copyText(shareUrl);
      toast(ok ? 'Link copied.' : 'Could not copy.', { kind: ok ? 'ok' : 'error' });
    }
    if (act === 'sendlink') {
      const label = actEl.innerHTML;
      actEl.disabled = true;
      actEl.innerHTML = '<span class="btn__spinner"></span> Opening…';
      try {
        const result = await share({ title:'Our udhaar', text: f.linked ? 'Our little ledger, all in one place.' : `Hey ${f.name}, here’s our shared ledger on udhaar. Join me so we can both keep track.`, url:shareUrl });
        if (result === 'copied') toastOk('Invite copied. Paste it into your conversation.');
        if (result === 'failed') toastError('Couldn’t share. Try copying the link.');
      } catch { toastError('Couldn’t open sharing. You can still copy the link.'); }
      finally { actEl.disabled = false; actEl.innerHTML = label; }
    }
  });
}

function todayLocal() {
  const date = new Date();
  const two = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

export function openMomentComposer(friend, { onSaved } = {}) {
  const today = todayLocal();
  const body = h('div', { class: 'moment-composer' });
  body.innerHTML = `
    <div class="field"><label class="field__label" for="moment-title">What happened?</label>
      <input class="input" id="moment-title" type="text" maxlength="80" placeholder="The café after the rain" autocomplete="off"></div>
    <div class="field"><label class="field__label" for="moment-day">When?</label>
      <input class="input" id="moment-day" type="date" max="${today}" value="${today}"></div>
    <div class="field"><label class="field__label" for="moment-note">A detail to keep <span class="muted">· optional</span></label>
      <textarea class="input" id="moment-note" maxlength="500" rows="3" placeholder="One sentence is enough."></textarea></div>
    <p class="moment-composer__privacy">${Icon.lock} Only in your book. ${esc(friend.name)} won't see this.</p>`;
  const title = body.querySelector('#moment-title');
  const day = body.querySelector('#moment-day');
  let photos = [];
  body.insertBefore(photoPicker({
    id: 'moment-photo', label: 'Add photos · optional', photos,
    onChange: (next) => { photos = next; buzz(6); },
  }), body.querySelector('.moment-composer__privacy'));
  const save = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'button', text: 'Keep this moment', disabled: true });
  const sheet = new Sheet({ title: 'Remember a moment', sub: `With ${esc(friend.name)}`, body, footer: save });
  title.addEventListener('input', () => { save.disabled = !title.value.trim(); });
  save.addEventListener('click', async () => {
    if (!title.value.trim() || !day.value) return;
    save.disabled = true;
    save.innerHTML = '<span class="btn__spinner"></span> Keeping…';
    try {
      await api.addMoment(friend.id, {
        title: title.value.trim(), occurredOn: day.value,
        note: body.querySelector('#moment-note').value.trim(),
        photos,
      });
      sheet.close();
      toastOk('Moment kept. Only you can see it.');
      bus.emit('data-changed');
      if (onSaved) onSaved();
      else navigate(`/friend/${friend.id}`);
    } catch (error) { save.disabled = false; save.textContent = 'Keep this moment'; toastError(error.message); }
  });
  sheet.open();
}

export function openMomentSheet(moment, friend, { onDeleted } = {}) {
  const body = h('div', { class: 'moment-detail' });
  const photos = moment.photos?.length ? moment.photos : moment.photo ? [moment.photo] : [];
  body.innerHTML = `
    ${photoGallery(photos, `Photo from ${moment.title}`)}
    <p class="moment-detail__date">${esc(momentDate(moment.occurredOn))} · only in your book</p>
    <h3>${esc(moment.title)}</h3>
    ${moment.note ? `<p class="moment-detail__note">${esc(moment.note)}</p>` : ''}`;
  bindPhotoGallery(body, photos, moment.title);
  const remove = h('button', { class: 'btn btn--quiet btn--block', type: 'button', text: 'Delete moment', style: { color: 'var(--due)' } });
  const sheet = new Sheet({ title: 'A little moment', body, footer: remove });
  remove.addEventListener('click', () => {
    sheet.close();
    confirmSheet({ title: 'Delete this moment?', body: 'It will leave your book, including its photos. There is no undo.', confirmLabel: 'Delete moment', danger: true,
      onConfirm: async () => {
        try {
          await api.removeMoment(friend.id, moment.id);
          toastOk('Moment deleted.');
          bus.emit('data-changed');
          if (onDeleted) onDeleted();
          else navigate(`/friend/${friend.id}`);
        } catch (error) { toastError(error.message); }
      },
    });
  });
  sheet.open();
}

function settleEntry(e, f, _main) {
  navigate(`/friend/${f.id}/settle/${e.id}`);
}

async function settleAll(open, f, mode = 'settled') {
  const originPath = currentPath();
  const relevant = mode === 'paid' ? open.filter((e) => e.direction === 'owed_by_me') : open.filter((e) => e.direction === 'owed_to_me');
  if (!relevant.length) return toast('Nothing open in that direction.');
  confirmSheet({
    title: mode === 'paid' ? `Paid ${esc(f.name)} back?` : `Settle everything with ${esc(f.name)}?`,
    body: `${plural(relevant.length, 'open line')} will be marked settled at once. You can undo each one afterwards.`,
    confirmLabel: mode === 'paid' ? 'Yes, I paid them' : 'Mark all settled',
    onConfirm: async () => {
      let ok = 0;
      for (const e of relevant) { try { await api.settle(e.id); ok += 1; } catch {} }
      if (ok === relevant.length) {
        buzz([14, 50, 20]);
        confetti({ count: 40, originY: 0.35 });
        toastOk(`${plural(ok, 'line')} closed. The details stay in the book.`);
      } else {
        toastError(ok ? `${ok} of ${relevant.length} lines confirmed closed. Check the latest ledger for the rest.` : 'Couldn’t confirm these records. Check the latest ledger before trying again.');
      }
      bus.emit('data-changed');
      if (currentPath() === originPath) navigate(`/friend/${f.id}`);
    },
  });
}

export async function nudge(e, f, shareUrl) {
  try {
    const res = await api.remind(e.id);
    buzz([10, 30, 10]);
    const what = e.kind === 'money' ? withSymbol(e.amount, currencyCode()) : e.note;
    const tone = res.remindCount <= 1
      ? `Hey, quick check on ${what}. I added the details here so we both have them: ${shareUrl}`
      : res.remindCount === 2
        ? `Hey, following up on ${what}. Let me know when you get a chance: ${shareUrl}`
        : `Checking in again on ${what}. Here’s the shared line in case it got buried in chat: ${shareUrl}`;
    const msg = tone;
    const sheet = new Sheet({
      title: 'Message ready',
      sub: 'Nothing is sent until you choose to send it.',
      body: `<div class="card" style="padding:var(--s4);background:var(--surface-2)">
        <p class="small" style="line-height:1.55">“${esc(msg)}”</p></div>
        <p class="tiny muted">You’re in control. Udhaar never sends this for you.</p>`,
      footer: [
        h('button', { class: 'btn btn--primary btn--block btn--lg', type: 'button', html: `${Icon.send} Send on WhatsApp`, onclick: () => { window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer'); sheet.close(); } }),
        h('button', { class: 'btn btn--block btn--outline', type: 'button', html: `${Icon.copy} Copy message`, onclick: async () => { const ok = await copyText(msg); toast(ok ? 'Copied.' : 'Could not copy.'); } }),
      ],
    });
    sheet.open();
    bus.emit('data-changed');
  } catch (err) {
    if (err.code === 'too_soon') return toast(err.message, { duration: 4200 });
    toastError(err.message);
  }
}

async function nudgeAll(open, f, shareUrl) {
  if (!open.length) return toast('Nothing to nudge about.');
  const total = open.reduce((s, e) => s + (e.kind === 'money' ? e.amount : 0), 0);
  const msg = `Hey ${f.name}, putting our open tabs in one place: ${withSymbol(total, currencyCode())} across ${open.length} ${plural(open.length, 'line')}. Details here: ${shareUrl}`;
  const sheet = new Sheet({
    title: 'One message for all lines',
    sub: 'Review it before you send.',
    body: `<div class="card" style="padding:var(--s4);background:var(--surface-2)"><p class="small" style="line-height:1.55">“${esc(msg)}”</p></div>`,
    footer: [
      h('button', { class: 'btn btn--primary btn--block btn--lg', type: 'button', html: `${Icon.send} Send on WhatsApp`, onclick: async () => {
        for (const e of open) { try { await api.remind(e.id); } catch {} }
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
        sheet.close(); bus.emit('data-changed');
      } }),
      h('button', { class: 'btn btn--block btn--outline', type: 'button', html: `${Icon.copy} Copy`, onclick: async () => { const ok = await copyText(msg); toast(ok ? 'Copied.' : 'Could not copy.'); } }),
    ],
  });
  sheet.open();
}

function openFriendMenu(f, inviteToken, reload) {
  const body = h('div', { class: 'person-settings' });
  body.innerHTML = `
    <div><div class="person-settings__label">Their details</div>
      <div class="list"><button class="setrow" data-person-action="edit" type="button">
        <span class="setrow__icon">${Icon.edit}</span>
        <span class="setrow__main"><span class="setrow__label">Edit details</span><span class="setrow__sub">Name and private note</span></span>
        <span class="setrow__value">${Icon.chevR}</span>
      </button></div></div>
    <div><div class="person-settings__label">Invite link</div>
      <div class="list">
        <button class="setrow" data-person-action="copy" type="button"><span class="setrow__icon">${Icon.copy}</span><span class="setrow__main"><span class="setrow__label">Copy invite link</span><span class="setrow__sub">Let them see shared lines</span></span><span class="setrow__value">${Icon.chevR}</span></button>
        <button class="setrow" data-person-action="reset" type="button"><span class="setrow__icon">${Icon.refresh}</span><span class="setrow__main"><span class="setrow__label">Reset invite link</span><span class="setrow__sub">The old link will stop working</span></span><span class="setrow__value">${Icon.chevR}</span></button>
      </div></div>
    <div class="person-settings__danger list"><button class="setrow setrow--danger" data-person-action="delete" type="button">
      <span class="setrow__icon setrow__icon--red">${Icon.trash}</span><span class="setrow__main"><span class="setrow__label">Delete person</span><span class="setrow__sub">Removes every line with them from your book</span></span><span class="setrow__value">${Icon.chevR}</span>
    </button></div>`;
  const sheet = new Sheet({ title: 'Person settings', sub: `${esc(f.name)} · only your side`, body });
  body.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-person-action]')?.dataset.personAction;
    if (!action) return;
    sheet.close();
    if (action === 'edit') return editFriend(f, reload);
    if (action === 'copy') {
      const ok = await copyText(`${location.origin}/#/join?token=${inviteToken}`);
      return toast(ok ? 'Link copied.' : 'Could not copy.', { kind: ok ? 'ok' : 'error' });
    }
    if (action === 'reset') {
      try { await api.reinvite(f.id); toastOk('New link ready.'); reload(); } catch (error) { toastError(error.message); }
      return;
    }
    if (action === 'delete') return confirmSheet({
      title: `Delete ${esc(f.name)}?`,
      body: 'This removes every open and settled line with them from your book. It cannot be undone. They will not be notified.',
      confirmLabel: 'Delete person', danger: true,
      onConfirm: async () => { try { await api.removeFriend(f.id); toastOk('Person deleted.'); bus.emit('data-changed'); navigate('/'); } catch (error) { toastError(error.message); } },
    });
  });
  sheet.open();
}

function editFriend(f, reload) {
  const body = h('div', { class: 'col', style: { gap: 'var(--s4)' } });
  body.innerHTML = `
    <p class="small muted">Changes to this name and note stay on your side of the ledger.</p>
    <div class="field"><label class="field__label" for="ef-name">Name</label>
      <input class="input" id="ef-name" value="${esc(f.name)}" maxlength="40"></div>
    <div class="field"><label class="field__label" for="ef-note">Private note</label>
      <input class="input" id="ef-note" value="${esc(f.note || '')}" placeholder="Roommate, trip planner…" maxlength="120"></div>
  `;
  const go = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'button', text: 'Save changes' });
  const s = new Sheet({ title: 'Edit details', sub: esc(f.name), body, footer: go });
  s.open();
  const name = body.querySelector('#ef-name');
  name.addEventListener('input', () => { go.disabled = !name.value.trim(); });
  go.onclick = async () => {
    go.disabled = true;
    try {
      await api.updateFriend(f.id, { name: name.value.trim(), note: body.querySelector('#ef-note').value.trim() });
      s.close(); toastOk('Details saved.'); bus.emit('data-changed'); reload();
    } catch (e) { go.disabled = false; toastError(e.message); }
  };
}
