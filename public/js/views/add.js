/* The core interaction, rebuilt as a two-step full-screen compose:
   step 1 — who (one tap on a face)
   step 2 — the line (amount, direction, note; details tucked away)
   The primary action stays focused while each stage scrolls when required. */

import { h, $, esc, buzz, symbol, withSymbol, avatarHTML, quickAmounts, noteSuggestions, daysBetween, formatDate, currencyCode, formatMoneyInput, applyMoneyInput } from '../core/utils.js';
import { Icon } from '../ui/icons.js';
import { api } from '../core/api.js';
import { state, bus } from '../core/store.js';
import { Sheet, hardCloseAllSheets } from '../ui/sheet.js';
import { toast, toastOk, toastError } from '../ui/toast.js';
import { navigate } from '../core/router.js';
import { savedMomentCopy, moneyNotePrompt, sharedLineCopy } from '../core/voice.js';
import { photoPicker } from '../ui/photo-picker.js';
import { mount, hideChrome } from './view.js';
import { openAddFriend } from './home.js';

const KINDS = [
  { id: 'money', label: 'Money', icon: 'wallet' },
  { id: 'favor', label: 'Favour', icon: 'hands' },
  { id: 'gesture', label: 'Promise', icon: 'heart' },
];

export async function viewAdd({ outlet, query, isCurrent = () => true }) {
  hardCloseAllSheets(); // idempotent: never stack two compose flows
  mount(outlet, 'app', () => `<div class="compose" id="compose"></div>`);
  outlet.querySelector('#compose')?.closest('.screen')?.classList.add('screen--compose');
  $('#main')?.classList.add('main--flush');
  hideChrome();

  let friends = state.friends?.length ? state.friends : (await api.friends()).friends;
  if (!isCurrent()) return;
  state.friends = friends;

  if (!friends.length) {
    const sheet = new Sheet({
      title: 'Who was it with?',
      sub: 'Add a person before you log this.',
      body: `<div class="empty" style="padding:var(--s6) 0">
        <div class="empty__art empty__art--icon">${Icon.people}</div>
        <h3>Start with a name</h3>
        <p>The friend from the cab, the coffee, or the “I’ll send it later.”</p>
      </div>`,
      footer: h('button', { class: 'btn btn--primary btn--lg btn--block', text: 'Add a person', onclick: () => { sheet.close(); openAddFriend({ onAdded: (nf) => navigate(`/add?friend=${nf.id}`) }); } }),
      onClose: () => exitCompose(),
    });
    return sheet.open();
  }

  const draft = {
    kind: query?.kind || 'money',
    direction: 'owed_to_me',
    friendshipId: query?.friend || null,
    amount: '',
    note: '',
    dueAt: null,
    photos: [],
  };

  const root = outlet.querySelector('#compose');
  let step = draft.friendshipId ? 2 : 1;

  /* ------------------------------ top bar ------------------------------ */
  const top = h('div', { class: 'compose__top' });
  const cancel = h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Cancel', html: Icon.close, onclick: () => { buzz(6); exitCompose(); } });
  const dots = h('div', { class: 'stepper', 'aria-label': 'Step 1 of 2' });
  const spacer = h('span', { style: 'width:38px' }); // balances the cancel button
  top.append(cancel, dots, spacer);

  const stage = h('div', { class: 'compose__stage' });
  const foot = h('div', { class: 'compose__foot' });
  const submit = h('button', { class: 'btn btn--lg btn--block', type: 'button' });
  foot.append(submit);
  root.append(top, stage, foot);

  const paintDots = () => {
    dots.innerHTML = `<i class="${step >= 1 ? 'on' : ''}"></i><i class="${step >= 2 ? 'on' : ''}"></i>`;
    dots.setAttribute('aria-label', `Step ${step} of 2`);
  };

  function goStep(n, dir = 'r') {
    step = n;
    paintDots();
    stage.innerHTML = '';
    const cls = dir === 'r' ? 'step-anim-r' : dir === 'l' ? 'step-anim-l' : '';
    const wrap = h('div', { class: `cstep ${cls}` });
    if (n === 1) renderWho(wrap); else renderLine(wrap);
    stage.append(wrap);
    syncSubmit();
    if (dir !== 'none') buzz(5);
  }

  /* ---------------------------- step 1 · who ---------------------------- */
  function renderWho(c) {
    const wrap = h('div', { class: 'who-wrap' });
    c.append(wrap);
    wrap.append(h('h1', { class: 'compose__prompt', text: 'Who was it with?' }));
    wrap.append(h('p', { class: 'compose__sub', text: 'Pick a person. The details come next.' }));
    const grid = h('div', { class: 'who-grid' });
    const sorted = [...friends].sort((a, b) => (Math.abs(b.net) - Math.abs(a.net)) || a.name.localeCompare(b.name));
    for (const p of sorted) {
      const tile = h('button', { class: 'who', type: 'button', onclick: () => { draft.friendshipId = p.id; buzz(8); goStep(2, 'r'); } });
      tile.innerHTML = `${avatarHTML({ name: p.name, seed: p.avatar_seed, size: 52 })}<span>${esc(p.name)}</span>`;
      grid.append(tile);
    }
    const add = h('button', { class: 'who who--new', type: 'button', onclick: () => openAddFriend({ onAdded: (nf) => { friends = [nf, ...friends]; draft.friendshipId = nf.id; goStep(2, 'r'); } }) });
    add.innerHTML = `<span class="who__plus">${Icon.plus}</span><span>new</span>`;
    grid.append(add);
    wrap.append(grid);
  }

  /* --------------------------- step 2 · the line ------------------------ */
  function renderLine(c) {
    const f = friends.find((x) => x.id === draft.friendshipId) || friends[0];
    draft.friendshipId = f.id;

    const whoRow = h('button', { class: 'compose__who chip', type: 'button', onclick: () => goStep(1, 'l') });
    whoRow.innerHTML = `${avatarHTML({ name: f.name, seed: f.avatar_seed, size: 28 })}<span class="grow" style="text-align:left">${esc(f.name)}</span><span class="tiny dim">change</span>`;
    c.append(whoRow);

    const seg = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Entry type' });
    for (const k of KINDS) {
      const b = h('button', {
        type: 'button', 'aria-pressed': String(k.id === draft.kind),
        onclick: () => { draft.kind = k.id; if (k.id !== 'money') draft.amount = ''; buzz(8); rerenderLine(); },
      });
      b.innerHTML = `${Icon[k.icon]}<span>${k.label}</span>`;
      seg.append(b);
    }
    c.append(seg);

    if (draft.kind === 'money') renderMoney(c, f);
    else renderNoteKind(c, f);

    function rerenderLine() {
      const dir = 'r';
      goStep(2, dir);
    }
  }

  function directionSeg(f) {
    const dirs = h('div', { class: 'seg-dir', role: 'group', 'aria-label': 'Direction' });
    const pick = (d) => { draft.direction = d; buzz(8); goStep(2, 'r'); };
    dirs.append(dirButton('owed_to_me', 'They owe me', 'You paid', draft.direction === 'owed_to_me', pick));
    dirs.append(dirButton('owed_by_me', 'I owe them', 'They paid', draft.direction === 'owed_by_me', pick));
    return dirs;
  }

  function renderMoney(c, f) {
    const cur = currencyCode();
    const amountId = 'compose-amount';
    const label = h('label', { class: 'compose__amtlabel', for: amountId, text: `Amount (${cur})` });
    const input = h('input', {
      class: 'input num amount-entry__input', id: amountId, type: 'text', inputmode: 'numeric',
      maxlength: 12, autocomplete: 'off', placeholder: '0',
      value: formatMoneyInput(draft.amount, cur),
      oninput: (e) => {
        draft.amount = applyMoneyInput(e.target, cur);
        syncSubmit();
      },
    });
    const amount = h('div', { class: 'amount-entry amount-entry--hero' }, [
      h('span', { class: 'amount-entry__symbol', text: symbol(cur), 'aria-hidden': 'true' }), input,
    ]);
    c.append(directionSeg(f), label, amount);

    const quick = h('div', { class: 'quickrow' });
    for (const q of quickAmounts().slice(0, 4)) {
      quick.append(h('button', {
        class: 'quick', type: 'button', text: `+${symbol(cur)}${q}`,
        onclick: () => { buzz(5); const next = (Number(draft.amount || 0) + q).toString(); if (next.length <= 9) { draft.amount = next; input.value = formatMoneyInput(next, cur); syncSubmit(); } },
      }));
    }
    c.append(quick);

    const note = h('input', {
      class: 'input compose__note', id: 'compose-note', placeholder: moneyNotePrompt({ direction: draft.direction, seed: f.id }), maxlength: 140, autocomplete: 'off',
      value: draft.note, oninput: (e) => { draft.note = e.target.value; },
    });
    const noteField = h('div', { class: 'field' }, [
      h('label', { class: 'field__label', for: 'compose-note', text: 'What was it for? (optional)' }),
      note,
    ]);
    c.append(noteField);

    const more = h('div', { class: 'chiprow' });
    more.append(h('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(!!draft.dueAt),
      html: `${Icon.clock || Icon.alert}<span>${draft.dueAt ? `by ${formatDate(draft.dueAt)}` : 'add a date'}</span>`,
      onclick: () => openDetails('date'),
    }));
    more.append(h('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(draft.photos.length > 0),
      html: `${Icon.receipt}<span>${draft.photos.length ? `${draft.photos.length} receipt ${draft.photos.length === 1 ? 'photo' : 'photos'}` : 'receipt photos'}</span>`,
      onclick: () => openDetails('receipt'),
    }));
    c.append(more);
  }

  function renderNoteKind(c, f) {
    const kind = KINDS.find((k) => k.id === draft.kind);
    const noteLabel = kind.id === 'favor' ? 'What’s the favour?' : 'What was promised?';
    c.append(directionSeg(f));
    c.append(h('label', { class: 'compose__amtlabel', for: 'compose-kind-note', text: noteLabel }));
    const input = h('input', {
      class: 'input compose__biginput', id: 'compose-kind-note', maxlength: 140, autocomplete: 'off', value: draft.note,
      placeholder: kind.id === 'favor' ? 'Return the charger, cover a shift…' : 'Plan the next trip, show up on time…',
      oninput: (e) => { draft.note = e.target.value; syncSubmit(); },
    });
    c.append(input);
    const chips = h('div', { class: 'quickrow', style: 'flex-wrap:wrap' });
    for (const s of noteSuggestions(draft.kind, draft.direction)) {
      chips.append(h('button', {
        class: 'quick', type: 'button', text: s, style: 'border-style:solid',
        onclick: (e) => { buzz(6); draft.note = s; input.value = s; chips.querySelectorAll('.quick').forEach((x) => x.style.borderColor = ''); e.currentTarget.style.borderColor = 'var(--ink)'; syncSubmit(); },
      }));
    }
    c.append(chips);
    c.append(h('p', { class: 'small muted', style: 'margin-top:auto', html: kind.id === 'favor'
      ? 'No price tag. Still worth remembering.'
      : 'Not about money. Still worth keeping track of.' }));
    if (draft.kind === 'favor') {
      const more = h('div', { class: 'chiprow' });
      more.append(h('button', {
        class: 'chip', type: 'button', 'aria-pressed': String(!!draft.dueAt),
        html: `${Icon.clock || Icon.alert}<span>${draft.dueAt ? `by ${formatDate(draft.dueAt)}` : 'add a date'}</span>`,
        onclick: () => openDetails('date'),
      }));
      c.append(more);
    }
    requestAnimationFrame(() => input.focus?.());
  }

  /* ------------------------- details (due + photo) ---------------------- */
  function openDetails(first = 'date') {
    const body = h('div', { class: 'col', style: { gap: 'var(--s4)' } });
    const rerender = () => {
      body.replaceChildren(first === 'receipt' ? photoBlock(draft) : dueBlock(draft, rerender));
    };
    rerender();
    const done = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'button', text: 'Done', onclick: () => s.close() });
    const s = new Sheet({ title: first === 'receipt' ? 'Add a receipt' : 'Set a due date', sub: first === 'receipt' ? 'Attach up to four receipt photos.' : 'Choose when this line is due.', body, footer: done, onClose: () => goStep(2, 'none') });
    s.open();
  }

  /* -------------------------------- submit ------------------------------ */
  function syncSubmit() {
    foot.classList.toggle('hide', step !== 2);
    const f = friends.find((x) => x.id === draft.friendshipId);
    const ok = draft.kind === 'money' ? Number(draft.amount) > 0 : draft.note.trim().length > 1;
    submit.disabled = step !== 2 || !ok;
    submit.className = 'btn btn--primary btn--lg btn--block';
    submit.innerHTML = step === 2 ? submitLabel(draft, f) : '…';
  }
  submit.onclick = () => {
    const f = friends.find((x) => x.id === draft.friendshipId);
    commit(draft, f, friends);
  };

  paintDots();
  goStep(step, 'r');
  syncSubmit();
  return root;
}

/* Opens the compose flow from anywhere (friend page, empty states). */
export function openRecord({ friendshipId = null, kind = null } = {}) {
  const q = new URLSearchParams();
  if (friendshipId) q.set('friend', friendshipId);
  if (kind) q.set('kind', kind);
  const qs = q.toString();
  navigate(`/add${qs ? `?${qs}` : ''}`);
  return null;
}

function exitCompose() {
  if (history.length > 1) history.back();
  else navigate('/', { replace: true });
}

const dirButton = (dir, label, hint, on, pick) => h('button', {
  class: 'dirbtn', type: 'button', 'data-dir': dir, 'aria-pressed': String(on),
  onclick: () => pick(dir),
  html: `<b>${label}</b><span>${hint}</span>`,
});

function submitLabel(draft, friend) {
  const cur = currencyCode();
  if (draft.kind === 'money') {
    const amt = Number(draft.amount) > 0 ? withSymbol(draft.amount, cur) : `${symbol(cur)}0`;
    return `Save entry · ${amt}`;
  }
  return `Save ${draft.kind === 'favor' ? 'favour' : 'promise'}`;
}

/* -------------------------------- commit --------------------------------- */

async function commit(draft, friend, friends) {
  const btn = document.querySelector('#compose .compose__foot .btn');
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="btn__spinner"></span> writing it down…';

  const payload = {
    friendshipId: draft.friendshipId,
    kind: draft.kind,
    direction: draft.direction,
    amount: draft.kind === 'money' ? Number(draft.amount) : 0,
    note: draft.note.trim(),
    dueAt: draft.dueAt,
    photos: draft.photos,
  };

  try {
    const res = await api.addEntry(payload);
    buzz([10, 30, 16]);
    bus.emit('data-changed');
    celebrate(res, friend, payload);
  } catch (e) {
    btn.disabled = false;
    btn.innerHTML = label;
    if (e.status === 0) {
      toastOk('Saved offline. It’ll post itself when you’re back.');
      exitCompose();
    } else if (e.status === 402) {
      navigate('/plus');
    } else {
      toastError(e.message || 'Could not log that.');
    }
  }
}

function celebrate(res, friend, payload) {
  const cur = currencyCode();
  const isDue = payload.direction === 'owed_to_me';
  const copy = savedMomentCopy({ ...payload, seed: res.entry?.id || `${friend?.id}:${payload.note}:${payload.amount}` });
  const person = esc(friend?.name || 'Them');
  const kindLabel = payload.kind === 'money' ? 'Money' : payload.kind === 'favor' ? 'Favour' : 'Promise';
  const direction = payload.kind === 'money'
    ? (isDue ? 'They owe you' : 'You owe them')
    : (isDue ? 'Their turn' : 'Your turn');

  const shareUrl = `${location.origin}/#/join?token=${res.shareToken}`;
  const msg = sharedLineCopy({ ...payload, formattedAmount: withSymbol(payload.amount, cur), url: shareUrl });

  const body = h('div', { class: 'saved-moment', role: 'status', 'aria-live': 'polite' });
  body.innerHTML = `
    <div class="saved-moment__hero">
      <h2>${copy.title}</h2>
      <p class="saved-moment__aside">${copy.aside}</p>
    </div>
    <div class="saved-moment__inkline" aria-hidden="true"></div>
    <div class="saved-moment__line">
      <div class="saved-moment__linehead"><span>${person}</span><span>${direction}</span></div>
      <div class="saved-moment__value ${payload.kind !== 'money' ? 'saved-moment__value--text' : ''}">${payload.kind === 'money' ? withSymbol(payload.amount, cur) : esc(payload.note)}</div>
      ${payload.kind === 'money' && payload.note ? `<p class="saved-moment__note">${esc(payload.note)}</p>` : ''}
      <div class="saved-moment__linefoot"><span>${kindLabel}</span><span>${payload.dueAt ? `By ${formatDate(payload.dueAt)}` : formatDate(Date.now(), { year: false })}</span></div>
    </div>
  `;

  const foot = h('div', { class: 'saved-moment__actions' });
  const done = h('button', { class: 'btn btn--primary btn--block btn--lg', type: 'button', text: 'Back to ledger' });
  done.onclick = () => s.close();
  const send = h('button', { class: 'btn btn--block btn--outline', type: 'button', html: `${Icon.send} Share this line` });
  send.onclick = () => {
    buzz([8, 20, 8]);
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  };
  const copyButton = h('button', { class: 'btn btn--block btn--quiet', type: 'button', html: `${Icon.copy} Copy details` });
  copyButton.onclick = async () => {
    const { copyText } = await import('../core/utils.js');
    const ok = await copyText(msg);
    buzz(8);
    toast(ok ? 'Copied. The receipts are ready.' : 'Could not copy.', { kind: ok ? 'ok' : 'error' });
  };
  const secondary = h('div', { class: 'saved-moment__actionrow' }, [send, copyButton]);
  foot.append(done, secondary);

  const s = new Sheet({
    title: 'Saved',
    body,
    footer: foot,
    onClose: () => exitCompose(),
  });
  s.el.classList.add('sheet--saved');
  s.open();
}

/* --- due date chips ------------------------------------------------------- */
function dueBlock(draft, rerender) {
  const wrap = h('div', { class: 'col', style: { gap: 'var(--s2)' } });
  const row = h('div', { class: 'chiprow' });
  const options = [
    { id: null, label: 'No date' },
    { id: 3, label: '3 days' },
    { id: 7, label: '1 week' },
    { id: 30, label: '1 month' },
    { id: -1, label: 'Pick a date' },
  ];
  const currentDays = draft.dueAt ? daysBetween(Date.now(), draft.dueAt) : null;
  for (const o of options) {
    const on = o.id === -1 ? (currentDays != null && ![3, 7, 30].includes(currentDays)) : currentDays === o.id || (o.id === null && currentDays === null);
    row.append(h('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(!!on), text: o.label,
      onclick: async (e) => {
        buzz(6);
        if (o.id === -1) {
          const picker = wrap.querySelector('input[type="date"]');
          if (picker) { picker.classList.toggle('hide', false); picker.focus?.(); picker.showPicker?.(); }
          return;
        }
        draft.dueAt = o.id ? Date.now() + o.id * 86400000 : null;
        row.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
        e.currentTarget.setAttribute('aria-pressed', 'true');
        rerender();
      },
    }));
  }
  const dateField = h('input', {
    class: 'input num hide', type: 'date', 'aria-label': 'Due date',
    min: new Date().toISOString().slice(0, 10),
    value: draft.dueAt ? new Date(draft.dueAt).toISOString().slice(0, 10) : '',
  });
  dateField.addEventListener('change', () => {
    const ts = dateField.value ? new Date(`${dateField.value}T20:00:00`).getTime() : null;
    draft.dueAt = Number.isNaN(ts) ? null : ts;
    buzz(6);
    rerender();
  });
  wrap.append(h('div', { class: 'field__label', text: 'By when' }), row, dateField);
  if (currentDays != null && ![3, 7, 30].includes(currentDays)) dateField.classList.remove('hide');
  return wrap;
}

/* --- receipt photos (native multi-select; downscaled client-side) ---------- */
function photoBlock(draft) {
  const wrap = h('div', { class: 'col', style: { gap: 'var(--s3)' } });
  wrap.append(h('div', { class: 'field__label', text: 'Receipt photos · optional' }));
  wrap.append(photoPicker({
    id: 'receipt-photo-input', label: 'Choose receipt photos', photos: draft.photos,
    onChange: (photos) => { draft.photos = photos; buzz(6); },
    inputAttrs: { 'data-receipt-input': true },
  }));
  return wrap;
}
