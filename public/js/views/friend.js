/* One friendship, end to end: balance, ledger, settle, nudge, invite. */

import { h, esc, buzz, money, symbol, withSymbol, relTime, dueLabel, avatarHTML, plural, daysBetween, formatDate, copyText, shortMoney, currencyCode } from '../core/utils.js';
import { Icon } from '../ui/icons.js';
import { api } from '../core/api.js';
import { state, bus } from '../core/store.js';
import { mount, setHeader, showFab } from './view.js';
import { navigate } from '../core/router.js';
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
      ${positive ? `<button class="btn btn--primary" data-act="settle-all">${Icon.check} Settle up</button>
                    <button class="btn btn--outline" data-act="nudge">${Icon.nudge} Nudge</button>` : ''}
      ${f.net < 0 ? `<button class="btn btn--due" data-act="pay">${Icon.check} I paid them</button>
                    <button class="btn btn--outline" data-act="log">${Icon.plus} Log</button>` : ''}
      ${f.net === 0 ? `<button class="btn btn--primary" data-act="log">${Icon.plus} Add a line</button>
                       <button class="btn btn--outline" data-act="moment">${Icon.heart} A moment</button>` : ''}
    </div>
    ${f.net !== 0 ? `<button class="btn btn--quiet btn--block" data-act="log">${Icon.plus} Log a line</button>` : ''}
  </section>


  ${disputed.length ? `
  <section class="anim-rise">
    <div class="section-head"><h2 style="color:var(--warn)">Disputed</h2></div>
    <div class="list">${disputed.map((e) => entryRow(e, cur, f)).join('')}</div>
  </section>` : ''}

  <section class="anim-rise" style="animation-delay:100ms">
    <div class="section-head">
      <h2>Open lines · ${open.length}</h2>
      ${open.length ? `<button class="btn btn--quiet btn--sm" data-act="settle-all">${Icon.check} Settle all</button>` : ''}
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
      <button type="button" data-act="moment">${Icon.plus} Add a moment</button>
    </div>
    ${moments.length ? `<div class="moment-list">${moments.map(momentRow).join('')}</div>`
      : `<p class="moment-empty">A place for the details worth keeping. Only you can see them for now.</p>`}
  </section>

  <section class="card anim-rise" style="padding:var(--s4);display:flex;flex-direction:column;gap:var(--s3)">
    <div class="row-between">
      <span class="twoside__art">${Art.clink()}</span>
      <div><b class="small">Share this ledger</b><p class="tiny muted">Send a link so you both see the same balance.</p></div>
      <span style="color:${f.linked ? 'var(--settled)' : 'var(--ink-4)'}">${f.linked ? Icon.checkCircle : Icon.lock}</span>
    </div>
    <div class="row" style="gap:var(--s2)">
      <button class="btn btn--sm btn--outline grow" data-act="copylink">${Icon.copy} Copy link</button>
      <button class="btn btn--sm btn--primary grow" data-act="sendlink">${Icon.send} Send</button>
    </div>
    ${f.linked ? `<p class="tiny settled-text">Connected. New lines and changes show up in both ledgers.</p>` : '<p class="tiny dim">They will see this ledger after accepting the personal link.</p>'}
  </section>
  `;
}

const chipTag = (tone, text) => `<span class="tag tag--${tone}">${text}</span>`;

function momentDate(day) {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function photoGallery(photos, label) {
  if (!photos.length) return '';
  return `<div class="photo-gallery ${photos.length === 1 ? 'photo-gallery--single' : ''}" aria-label="${esc(label)} photos">
    ${photos.map((url, index) => `<button type="button" class="photo-gallery__item" data-photo-index="${index}" aria-label="Open photo ${index + 1} of ${photos.length}">
      <img src="${esc(url)}" alt="${esc(label)} · ${index + 1} of ${photos.length}" loading="lazy">
      ${photos.length > 1 ? `<span>${index + 1}/${photos.length}</span>` : ''}
    </button>`).join('')}
  </div>`;
}

function bindPhotoGallery(root, photos, label) {
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
  const cur = currencyCode();
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
          body: `“${esc(e.note || KIND_WORD[e.kind])}” disappears from the book. There’s no undo, and no receipts.`,
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
      const e = entries.find((x) => x.id === entryEl.dataset.entry);
      return openEntrySheet(e, f, cur, shareUrl);
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
    if (act === 'settle-all') return settleAll(open, f);
    if (act === 'pay') return settleAll(open.filter((e) => e.direction === 'owed_by_me'), f, 'paid');
    if (act === 'nudge') return nudgeAll(open.filter((e) => e.direction === 'owed_to_me'), f, shareUrl);
    if (act === 'copylink') {
      const ok = await copyText(shareUrl);
      toast(ok ? 'Link copied.' : 'Could not copy.', { kind: ok ? 'ok' : 'error' });
    }
    if (act === 'sendlink') {
      const msg = `I'm keeping our udhaar on this — no more "kitna diya tha". Join and you'll see your side too: ${shareUrl}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
    }
  });
}

function todayLocal() {
  const date = new Date();
  const two = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

function openMomentComposer(friend) {
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
      navigate(`/friend/${friend.id}`);
    } catch (error) { save.disabled = false; save.textContent = 'Keep this moment'; toastError(error.message); }
  });
  sheet.open();
}

function openMomentSheet(moment, friend) {
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
          navigate(`/friend/${friend.id}`);
        } catch (error) { toastError(error.message); }
      },
    });
  });
  sheet.open();
}

async function settleEntry(e, f, main) {
  if (e.kind !== 'money') {
    try {
      await api.settle(e.id);
      buzz([12, 40, 12]);
      confetti({ count: 18 });
      toastOk(`${KIND_WORD[e.kind]} marked as done.`);
      bus.emit('data-changed');
      return refresh(main, f.id);
    } catch (err) { return toastError(err.message); }
  }

  const cur = currencyCode();
  const body = h('div', { class: 'col', style: { gap: 'var(--s3)' } });
  const photos = e.photos?.length ? e.photos : e.photo ? [e.photo] : [];
  body.innerHTML = `
    ${photoGallery(photos, `Receipt for ${e.note || 'this line'}`)}
    <p class="small muted">Full amount is <b class="num" style="color:var(--ink)">${withSymbol(e.amount, cur)}</b>. Settled a different number? Change it.</p>
    <input class="input num" id="settleAmt" type="text" inputmode="decimal" value="${e.amount}" style="font-size:var(--fs-24);text-align:center;font-family:var(--font-mono)">
    <div class="quickrow" style="justify-content:center">
      <button class="quick" data-q="full" type="button">Full</button>
      <button class="quick" data-q="half" type="button">Half</button>
      <button class="quick" data-q="0" type="button">Wrote it off</button>
    </div>
  `;
  const input = body.querySelector('#settleAmt');
  body.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
    buzz(5);
    input.value = b.dataset.q === 'full' ? e.amount : b.dataset.q === 'half' ? Math.round(e.amount * 50) / 100 : 0;
  }));

  const go = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'button', text: 'Mark settled' });
  bindPhotoGallery(body, photos, e.note || 'Receipt');
  const sheet = new Sheet({ title: 'Settle this line', sub: esc(e.note || KIND_WORD[e.kind]), body, footer: go });
  sheet.open();

  go.onclick = async () => {
    const amt = Math.max(0, Math.min(Math.round((Number(input.value.replace(/[^\d.]/g, '')) || 0) * 100) / 100, e.amount));
    go.disabled = true; go.innerHTML = '<span class="btn__spinner"></span>';
    try {
      const res = await api.settle(e.id, amt < e.amount ? amt : undefined);
      buzz([12, 40, 16]);
      confetti({ count: amt >= e.amount ? 30 : 16 });
      sheet.close();
      toastOk(amt >= e.amount ? 'Settled.' : `Part-settled ${withSymbol(amt, cur)} — ${withSymbol(e.amount - amt, cur)} still open.`, {
        action: 'Undo',
        onAction: async () => { try { await api.reopen(e.id); bus.emit('data-changed'); toast('Reopened.'); } catch {} },
      });
      bus.emit('data-changed');
      refresh(main, f.id);
    } catch (err) {
      go.disabled = false; go.textContent = 'Mark settled';
      toastError(err.message);
    }
  };
}

async function settleAll(open, f, mode = 'settled') {
  const relevant = mode === 'paid' ? open.filter((e) => e.direction === 'owed_by_me') : open.filter((e) => e.direction === 'owed_to_me');
  if (!relevant.length) return toast('Nothing open in that direction.');
  confirmSheet({
    title: mode === 'paid' ? `Paid ${esc(f.name)} back?` : `Settle everything with ${esc(f.name)}?`,
    body: `${relevant.length} open ${plural(relevant.length, 'line')} will be marked settled at once. You can undo each one afterwards.`,
    confirmLabel: mode === 'paid' ? 'Yes, I paid them' : 'Mark all settled',
    onConfirm: async () => {
      let ok = 0;
      for (const e of relevant) { try { await api.settle(e.id); ok += 1; } catch {} }
      buzz([14, 50, 20]);
      confetti({ count: 40, originY: 0.35 });
      toastOk(`${plural(ok, 'line')} closed. The details stay in the book.`);
      bus.emit('data-changed');
      navigate('/');
    },
  });
}

async function nudge(e, f, shareUrl) {
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

function openEntrySheet(e, f, cur, shareUrl) {
  const isDue = e.direction === 'owed_to_me';
  const body = h('div', { class: 'col', style: { gap: 'var(--s3)' } });
  const photos = e.photos?.length ? e.photos : e.photo ? [e.photo] : [];
  body.innerHTML = `
    <div class="ledger-page" style="padding:var(--s5) var(--s5) var(--s5) calc(var(--s5) + 14px)">
      <div class="netcard__label">${isDue ? `${esc(f.name)} owes you` : `You owe ${esc(f.name)}`}</div>
      ${e.kind === 'money'
        ? `<div class="netcard__amount" style="color:${isDue ? 'var(--credit)' : 'var(--due)'}"><span class="cur">${symbol(cur)}</span>${money(e.amount, cur)}</div>`
        : `<div class="serif" style="font-size:var(--fs-24);padding:var(--s2) 0">${esc(e.note || KIND_WORD[e.kind])}</div>`}
      ${e.note && e.kind === 'money' ? `<p class="small muted">“${esc(e.note)}”</p>` : ''}
      <p class="tiny dim" style="margin-top:8px">${e.ownedByMe ? 'You logged this' : `${esc(f.name)} logged this`} · ${formatDate(e.createdAt)} · ${relTime(e.createdAt)}</p>
      ${e.dueAt ? `<p class="tiny" style="color:${e.overdue ? 'var(--due)' : 'var(--ink-3)'};font-weight:600">${esc(dueLabel(e.dueAt))}</p>` : ''}
    </div>
    ${photoGallery(photos, e.note || 'Receipt')}
  `;

  bindPhotoGallery(body, photos, e.note || 'Receipt');

  const actions = [];
  if (e.status === 'open') {
    actions.push(h('button', { class: `btn btn--block btn--lg ${isDue ? 'btn--primary' : 'btn--due'}`, type: 'button', text: isDue ? 'Mark as settled' : 'I paid this', onclick: async () => {
      s.close();
      settleEntry(e, f, document.querySelector('#main'));
    } }));
    if (isDue) actions.push(h('button', { class: 'btn btn--block btn--outline', type: 'button', html: `${Icon.nudge} Nudge ${esc(f.name)}`, onclick: () => { s.close(); nudge(e, f, shareUrl); } }));
  } else if (e.status === 'settled') {
    actions.push(h('button', { class: 'btn btn--block btn--outline', type: 'button', html: `${Icon.refresh} Reopen this line`, onclick: async () => {
      try { await api.reopen(e.id); s.close(); bus.emit('data-changed'); toast('Reopened.'); } catch (err) { toastError(err.message); }
    } }));
  }
  if (e.ownedByMe) actions.push(h('button', { class: 'btn btn--block btn--quiet', type: 'button', style: 'color:var(--due)', text: 'Delete', onclick: () => {
    s.close();
    confirmSheet({
      title: 'Delete this line?', body: 'It leaves the book permanently.', confirmLabel: 'Tear it out', danger: true,
      onConfirm: async () => { try { await api.removeEntry(e.id); toastOk('Deleted.'); bus.emit('data-changed'); } catch (err) { toastError(err.message); } },
    });
  } }));

  const s = new Sheet({ title: e.status === 'settled' ? 'Settled line' : 'Open line', body, footer: actions });
  s.open();
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

function refresh(main, friendId) {
  const app = document.querySelector('#app');
  if (app) navigate(`/friend/${friendId}`);
}
