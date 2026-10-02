/* You: honor score, ledger card, settings, and the exit doors. */

import { h, esc, buzz, money, symbol, withSymbol, avatarHTML, plural, copyText, shortMoney, relTime, formatDate, fileToDataUrl } from '../core/utils.js';
import { Icon } from '../ui/icons.js';
import { api, clearSession, flushQueue } from '../core/api.js';
import { state, setState, bus, savePrefs, loadPrefs, applyTheme, clearCache } from '../core/store.js';
import { mount, setHeader, showFab } from './view.js';
import { navigate } from '../core/router.js';
import { toast, toastOk, toastError } from '../ui/toast.js';
import { Sheet, actionSheet, confirmSheet } from '../ui/sheet.js';
import { drawLedgerCard, shareCanvas, loadRowImages } from '../ui/sharecard.js';
import { confetti } from '../ui/confetti.js';
import { openInvite } from './home.js';

export async function viewYou({ outlet }) {
  setHeader({ title: 'Account' });
  showFab(false);

  // Paint instantly from cached state if we have it — no skeleton flash
  const cachedStats = state.stats;
  if (cachedStats) {
    mount(outlet, 'app', () => youHTML(state.user, cachedStats, null, { links: [], used: 0 }), (main) => bindYou(main, cachedStats, null, { links: [], used: 0 }));
  } else {
    mount(outlet, 'app', () => `<div class="profile-head"><div class="skeleton" style="width:96px;height:96px;border-radius:50%"></div></div><div class="card skeleton" style="height:200px"></div>`);
  }

  // Fetch fresh data — all 3 in parallel
  const [stats, card, invites] = await Promise.all([
    api.stats(), api.card().catch(() => null), api.invites().catch(() => ({ links: [], used: 0 })),
  ]);
  setState({ stats });

  // Only re-render if data actually changed or we showed a skeleton
  mount(outlet, 'app', () => youHTML(state.user, stats, card, invites), (main) => bindYou(main, stats, card, invites));
}

function youHTML(u, stats, card, invites) {
  const cur = u.currency;
  const t = stats.totals;
  const honor = stats.honor;
  const prefs = loadPrefs();
  const themeName = u.theme === 'dark' ? 'Dark' : u.theme === 'light' ? 'Light' : 'System';

  return `
  <div class="account-profile anim-rise">
    <label class="avatarbtn" for="avatar-photo-input" aria-label="Change your photo">
      ${avatarHTML({ name: u.name, seed: u.avatarSeed, size: 72, avatarUrl: u.avatarUrl })}
      <span class="avatarbtn__cam">${Icon.camera}</span>
    </label>
    <input id="avatar-photo-input" type="file" accept="image/jpeg,image/png,image/webp" class="file-input" data-avatar-input>
    <div class="grow account-profile__identity">
      <h1>${esc(u.name)}</h1>
      <p class="handle">@${esc(u.handle)}${u.isDemo ? ' · <span class="tag tag--warn">preview ledger</span>' : ''}</p>
    </div>
    <button class="iconbtn" data-act="edit" aria-label="Edit profile">${Icon.edit}</button>
  </div>

  <div class="account-quick anim-rise" aria-label="Account actions">
    <button class="account-quick__action" data-act="theme">${Icon.palette}<span>Appearance<small>${themeName} · change</small></span></button>
    <button class="account-quick__action" data-act="currency" aria-label="Change currency, currently ${esc(cur)}">${Icon.coins}<span>Currency<small>${esc(cur)} · change</small></span></button>
    <button class="account-quick__action" data-act="export">${Icon.fileExport}<span>Export ledger<small>Keep a copy</small></span></button>
    <button class="account-quick__action" data-act="logout">${Icon.logout}<span>Sign out<small>On this device</small></span></button>
  </div>

  <section class="anim-rise" style="animation-delay:100ms">
    <div class="section-head"><h2>Settings</h2></div>
    <div class="list">
      ${setRow('nudges', Icon.nudge, 'Nudge updates', '', 'switch', prefs.nudges !== false, '', 'green', 'Know when someone confirms or questions a line')}
      ${setRow('install', Icon.device, 'Install on this phone', 'Opens like an app', 'row', false, !state.installPrompt && !isStandalone() ? 'dim' : '', 'neutral')}
      ${setRow('plus', Icon.crown, 'Udhaar Plus', u.plan === 'plus' ? 'Active' : 'More people, groups, and history', 'row', false, '', 'gold')}
    </div>
  </section>

  <section class="card card--honor anim-rise" style="padding:var(--s5);animation-delay:40ms">
    <div class="row" style="gap:var(--s4);align-items:center">
      ${honorRingBig(honor.score)}
      <div class="grow">
        <div class="field__label">Your reliability</div>
        <div class="honor-grade">${esc(honor.grade)}</div>
        <p class="tiny muted" style="margin-top:4px;line-height:1.4">${honorLine(honor)}</p>
      </div>
    </div>
    <div class="divider" style="margin:var(--s4) 0"></div>
    <div class="statgrid">
      <div class="stat"><b class="num">${t.friends}</b><span>Your people</span></div>
      <div class="stat"><b class="num">${t.openEntries}</b><span>Open lines</span></div>
      <div class="stat"><b class="num credit-text">${shortMoney(t.owedToYou, cur)}</b><span>Owed to you</span></div>
      <div class="stat"><b class="num due-text">${shortMoney(t.youOwe, cur)}</b><span>You owe</span></div>
    </div>
    ${stats.activeDays > 1 ? `<p class="tiny dim center" style="margin-top:var(--s3)">You’ve kept tabs on ${stats.activeDays} different days.</p>` : ''}
  </section>

  <section class="anim-rise" style="animation-delay:70ms">
    <div class="section-head"><h2>Sharing</h2></div>
    <div class="list">
      <button class="setrow" data-act="card" type="button">
        <span class="setrow__icon setrow__icon--indigo">${Icon.ledger}</span>
        <span class="setrow__main"><span class="setrow__label">Ledger snapshot</span><span class="setrow__sub">Preview your balance and choose what to share</span></span>
        <span class="setrow__value">${Icon.chevR}</span>
      </button>
      <button class="setrow" data-act="invite" type="button">
        <span class="setrow__icon">${Icon.people}</span>
        <span class="setrow__main"><span class="setrow__label">Invite someone</span><span class="setrow__sub">Send a link to share a ledger</span></span>
        <span class="setrow__value">${Icon.chevR}</span>
      </button>
    </div>
  </section>

  ${invites.used > 0 ? `<p class="tiny center dim anim-rise">${plural(invites.used, 'person')} joined through your links.</p>` : ''}



  <section class="anim-rise">
    <div class="section-head"><h2>Privacy & account</h2></div>
    <div class="list">
      ${setRow('privacy', Icon.shield, 'Privacy', 'Your data, your call', 'row', false, '', 'indigo')}
      ${setRow('delete', Icon.trash, 'Delete everything', '', 'row', false, '', 'red')}
    </div>
  </section>

  <p class="tiny center dim" style="padding:var(--s4) 0 var(--s8)">udhaar · keep tabs, keep friends<br><span style="opacity:.7">v1.14.2</span></p>
  `;
}

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function honorLine(honor) {
  if (honor.n === 0) return 'No settled lines yet. Your score starts taking shape as you use the app.';
  if (honor.score >= 88) return 'You settle your side on time. That shows.';
  if (honor.score >= 74) return 'Mostly on time. Clear a late line to move this up.';
  if (honor.score >= 58) return 'A few lines are past due. Settle one and the score updates.';
  return 'Late lines affect this score. You can bring it back by settling them.';
}

function honorRingBig(score) {
  const r = 40; const c = 2 * Math.PI * r; const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = score >= 74 ? 'var(--gold-bright)' : score >= 50 ? 'var(--ink-3)' : 'var(--due)';
  return `
  <div class="honor-score">
    <svg width="72" height="72" viewBox="0 0 96 96" style="rotate:-90deg" aria-hidden="true">
      <circle cx="48" cy="48" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="8"/>
      <circle cx="48" cy="48" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}" style="transition:stroke-dashoffset 1s var(--ease-out)"/>
    </svg>
    <div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center">
      <div><div class="num" style="font-size:var(--fs-24);font-weight:700;line-height:1">${score}</div>
      <div class="tiny dim" style="font-size:10px;letter-spacing:.06em;text-transform:uppercase">score</div></div>
    </div>
  </div>`;
}

function setRow(act, icon, label, hint, type = 'row', on = false, dim = '', tint = 'neutral', sub = '') {
  // One predictable row: label and status together, action on the right.
  const subText = sub || (type !== 'switch' ? hint : '');
  const right = type === 'switch'
    ? `<span class="switch" role="switch" aria-checked="${on}" data-switch="${act}"></span>`
    : `<span class="setrow__value ${dim}">${Icon.chevR}</span>`;
  return `<button class="setrow ${act === 'delete' ? 'setrow--danger' : ''}" data-set="${act}" type="button">
    <span class="setrow__icon setrow__icon--${tint}">${icon}</span>
    <span class="setrow__main">
      <span class="setrow__label">${esc(label)}</span>
      ${subText ? `<span class="setrow__sub">${esc(subText)}</span>` : ''}
    </span>
    ${right}
  </button>`;
}

/* --------------------------------- bind ---------------------------------- */

function bindYou(main, stats, card, invites) {
  const avatarInput = main.querySelector('[data-avatar-input]');
  avatarInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const avatarButton = main.querySelector('.avatarbtn');
    avatarButton?.setAttribute('aria-busy', 'true');
    try {
      const dataUrl = await fileToDataUrl(file, 512, 0.85);
      const r = await api.post('/api/me/photo', { dataUrl });
      const user = { ...state.user, avatarUrl: r.avatarUrl };
      setState({ user });
      bus.emit('user', user);
      bus.emit('data-changed');
      const currentAvatar = main.querySelector('.avatarbtn .avatar');
      if (currentAvatar) currentAvatar.outerHTML = avatarHTML({ name: user.name, seed: user.avatarSeed, size: 72, avatarUrl: user.avatarUrl });
      toastOk('Photo updated.');
      buzz(10);
    } catch (err) { toastError(err.message || 'Could not save that photo.'); }
    avatarButton?.removeAttribute('aria-busy');
    e.target.value = '';
  });
  main.addEventListener('click', async (e) => {
    const row = e.target.closest('[data-set]');
    const actEl = e.target.closest('[data-act]');
    const key = row?.dataset.set || actEl?.dataset.act;
    if (!key) return;
    buzz(7);

    switch (key) {
      case 'theme': return themeSheet();
      case 'currency': return currencySheet();
      case 'edit': return editProfile();
      case 'card': return openCardSheet(card);
      case 'invite': return openInvite(state.friends?.length ? state.friends : (await api.friends()).friends);
      case 'plus': return navigate('/plus');
      case 'nudges': {
        const prefs = loadPrefs();
        const next = prefs.nudges === false;
        savePrefs({ nudges: next });
        if (next && 'Notification' in window && Notification.permission === 'default') {
          try { await Notification.requestPermission(); } catch {}
        }
        toast(next ? 'Updates on. Only for your own ledger.' : 'Updates off.');
        return navigate('/you');
      }
      case 'install': return install();
      case 'export': return exportSheet();
      case 'privacy': return privacySheet();
      case 'logout': return confirmSheet({
        title: 'Sign out?', body: 'Your ledger stays exactly where it is. Sign back in with your handle and passcode.',
        confirmLabel: 'Sign out', onConfirm: async () => { await api.logout(); clearSession(); clearCache(); setState({ user: null }); navigate('/auth'); },
      });
      case 'delete': return deleteSheet();
    }
  });
}

function themeSheet() {
  const current = document.documentElement.dataset.theme || 'system';
  actionSheet({
    title: 'Appearance',
    actions: ['system', 'light', 'dark'].map((t) => ({
      label: t === 'system' ? 'Match my phone' : t === 'light' ? 'Paper (light)' : 'Ink (dark)',
      hint: t === 'system' ? 'Switches with your device' : t === 'light' ? 'Warm khata paper' : 'For 2am ledgers',
      icon: current === t ? Icon.checkCircle : Icon.settings,
      onSelect: async () => {
        const previous = state.user.theme || 'system';
        const optimisticUser = { ...state.user, theme: t };
        applyTheme(t);
        setState({ user: optimisticUser, theme: t });
        bus.emit('user', optimisticUser);
        toast(`${t === 'system' ? 'System' : t} theme.`);
        navigate('/you');
        try {
          const res = await api.patchProfile({ theme: t });
          setState({ user: res.user });
          bus.emit('user', res.user);
        } catch (error) {
          const restored = { ...state.user, theme: previous };
          applyTheme(previous);
          setState({ user: restored, theme: previous });
          bus.emit('user', restored);
          toastError(error.message || 'Could not save that appearance.');
          navigate('/you');
        }
      },
    })),
  });
}

const CURRENCIES = [
  ['INR', '₹', 'Indian Rupee'], ['USD', '$', 'US Dollar'], ['GBP', '£', 'Pound'], ['EUR', '€', 'Euro'],
  ['AED', 'AED', 'Dirham'], ['SGD', 'S$', 'Singapore Dollar'], ['AUD', 'A$', 'Australian Dollar'], ['CAD', 'C$', 'Canadian Dollar'],
];

function currencySheet() {
  const current = state.user.currency;
  actionSheet({
    title: 'Currency',
    sub: 'Choose how amounts appear across your ledger.',
    actions: CURRENCIES.map(([code, sym, name]) => ({
      label: `${sym}  ${name}`,
      value: code === current ? 'Selected' : code,
      icon: code === current ? Icon.checkCircle : null,
      onSelect: async () => {
        try {
          const res = await api.patchProfile({ currency: code });
          setState({ user: res.user });
          toastOk(`Currency set to ${code}.`);
          bus.emit('data-changed');
          navigate('/you');
        } catch (e) { toastError(e.message); }
      },
    })),
  });
}

function editProfile() {
  const u = state.user;
  const body = h('div', { class: 'col', style: { gap: 'var(--s4)' } });
  body.innerHTML = `
    <div style="display:flex;justify-content:center">${avatarHTML({ name: u.name, seed: u.avatarSeed, size: 96, avatarUrl: u.avatarUrl })}</div>
    <div class="field"><label class="field__label" for="ep-name">Name</label>
      <input class="input" id="ep-name" value="${esc(u.name)}" maxlength="40"></div>
    <div class="field"><label class="field__label">Handle</label>
      <input class="input" value="@${esc(u.handle)}" disabled style="opacity:.6">
      <p class="tiny dim">Handles are permanent — they’re how friends find your ledger.</p></div>
  `;
  const go = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'button', text: 'Save' });
  const s = new Sheet({ title: 'Your details', body, footer: go });
  s.open();
  go.onclick = async () => {
    go.disabled = true;
    try {
      const res = await api.patchProfile({ name: body.querySelector('#ep-name').value.trim() });
      setState({ user: res.user });
      s.close(); toastOk('Saved.'); navigate('/you');
    } catch (e) { go.disabled = false; toastError(e.message); }
  };
}

/* ------------------------------- ledger card ------------------------------ */

export async function openCardSheet(card) {
  if (!card) return toastError('Card data unavailable right now.');
  const cur = card.currency;
  const due = card.net < 0;

  const rows = (card.top || []).map((t, i) => ({
    name: t.name, net: t.net, seed: (state.friends.find((f) => f.name === t.name)?.avatar_seed) || i * 3,
    avatarUrl: state.friends.find((f) => f.name === t.name)?.avatarUrl || null,
    label: t.net > 0 ? 'owes you' : 'you owe them',
  }));

  const data = {
    ...card,
    currency: cur,
    headline: due ? 'I owe' : "I'm owed",
    amountText: withSymbol(Math.abs(card.net), cur),
    subline: `${plural(card.activeFriends, 'person', 'people')} · ${plural(card.openEntries, 'open line', 'open lines')}`,
    stamp: due ? 'DEBTOR' : card.net === 0 ? 'ALL SQUARE' : 'CREDITOR',
    rows,
    honorNote: card.overdue ? `${plural(card.overdue, 'line')} past due.` : 'Nothing overdue.',
  };

  data.rowImages = await loadRowImages(rows);
  const canvas = drawLedgerCard(data);
  canvas.style.cssText = 'width:100%;border:1px solid var(--line);border-radius:var(--r-lg)';

  const hideNames = h('button', { class: 'snapshot-privacy', type: 'button', 'aria-pressed': 'false' });
  hideNames.innerHTML = `<span><strong>Hide names</strong><small>For posting publicly</small></span><span class="switch" aria-hidden="true"></span>`;

  const body = h('div', { class: 'col', style: { gap: 'var(--s3)' } });
  body.append(hideNames, canvas);

  let blurred = false;
  hideNames.addEventListener('click', () => {
    blurred = !blurred;
    buzz(6);
    hideNames.setAttribute('aria-pressed', String(blurred));
    const c2 = drawLedgerCard({ ...data, rowImages: blurred ? {} : data.rowImages, rows: blurred ? data.rows.map((r) => ({ ...r, name: r.name[0] + '•'.repeat(Math.max(2, r.name.length - 1)) })) : data.rows });
    c2.style.cssText = canvas.style.cssText;
    canvas.replaceWith(c2);
    cardCanvas.el = c2;
  });
  const cardCanvas = { el: canvas };

  const foot = h('div', { class: 'col', style: { gap: 'var(--s2)' } });
  const shareBtn = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'button', html: `${Icon.share} Share card` });
  shareBtn.onclick = async () => {
    shareBtn.disabled = true; shareBtn.innerHTML = '<span class="btn__spinner"></span> Rendering…';
    const res = await shareCanvas(cardCanvas.el, {
      title: 'My udhaar ledger',
      text: `${due ? 'I owe' : "I'm owed"} ${withSymbol(Math.abs(card.net), cur)}. Reliability score ${card.honorScore} — ${card.honorGrade}.`,
    });
    shareBtn.disabled = false; shareBtn.innerHTML = `${Icon.share} Share card`;
    if (res.ok && res.via === 'share') { buzz([10, 30, 10]); s.close(); }
    else if (res.ok) toastOk('Card saved to your downloads.');
    else if (res.reason !== 'cancelled') toast('Could not share the image. Try the text version.', { action: 'Copy text', onAction: () => copyText(res.text || '') });
  };

  const textBtn = h('button', { class: 'btn btn--outline btn--block', type: 'button', html: `${Icon.copy} Copy summary` });
  textBtn.onclick = async () => {
    const msg = `My udhaar snapshot:\n${due ? 'I owe' : "I'm owed"} ${withSymbol(Math.abs(card.net), cur)} across ${plural(card.activeFriends, 'person', 'people')}.\nReliability score: ${card.honorScore} — ${card.honorGrade}\n${card.overdue ? `${card.overdue} lines past due.` : 'Nothing overdue.'}\n${location.origin}`;
    const ok = await copyText(msg);
    toast(ok ? 'Summary copied.' : 'Could not copy.', { kind: ok ? 'ok' : 'error' });
  };

  foot.append(shareBtn, textBtn);
  const s = new Sheet({ title: 'Ledger snapshot', sub: 'Choose what to show before sharing.', body, footer: foot });
  s.open();
}

/* --------------------------------- export -------------------------------- */

async function exportSheet() {
  const body = h('div', { class: 'col', style: { gap: 'var(--s3)' } });
  body.innerHTML = `<p class="small muted">Your entries, in a file you can keep. Export whenever you want.</p>
    <div class="skeleton" style="height:44px"></div>`;
  const s = new Sheet({ title: 'Export', body });
  s.open();
  try {
    const [{ friends }, { entries }] = await Promise.all([api.friends(), api.entries({ status: 'all', limit: 200 })]);
    const rows = [['date', 'person', 'type', 'direction', 'amount', 'note', 'status']];
    for (const e of entries) {
      rows.push([
        new Date(e.createdAt).toISOString().slice(0, 10),
        e.friend?.name || '',
        e.kind,
        e.direction === 'owed_to_me' ? 'they_owe_me' : 'i_owe_them',
        e.kind === 'money' ? e.amount : '',
        (e.note || '').replace(/[\n,]/g, ' '),
        e.status,
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const json = JSON.stringify({ exportedAt: new Date().toISOString(), friends, entries }, null, 2);

    body.innerHTML = '';
    body.append(
      h('div', { class: 'statgrid' }, [
        h('div', { class: 'stat', html: `<b class="num">${entries.length}</b><span>Lines</span>` }),
        h('div', { class: 'stat', html: `<b class="num">${friends.length}</b><span>People</span>` }),
      ]),
      h('button', { class: 'btn btn--primary btn--block', type: 'button', html: `${Icon.download} Download CSV`, onclick: () => download(csv, 'udhaar-ledger.csv', 'text/csv') }),
      h('button', { class: 'btn btn--outline btn--block', type: 'button', html: `${Icon.download} Download JSON`, onclick: () => download(json, 'udhaar-ledger.json', 'application/json') }),
    );
  } catch (e) {
    body.innerHTML = `<div class="empty"><h3>Export failed</h3><p>${esc(e.message)}</p></div>`;
  }
}

function download(text, filename, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  buzz([8, 20, 8]);
  toastOk(`${filename} downloaded.`);
}

function privacySheet() {
  const s = new Sheet({
    title: 'What we keep',
    sub: 'The short, clear version.',
    body: `
      <div class="col" style="gap:var(--s3)">
        ${[['Your name, handle, passcode hash', 'Enough to open your ledger. We can’t read your passcode and can’t reset it by email unless you added one.'],
           ['Every line you log', 'Amounts, notes, dates. Stored against your account, never sold, never used to train anything.'],
           ['Who you invited', 'Only that a link was opened. We never message your friends — nudges generate a message you send yourself.'],
           ['Nothing from your phone', 'No contacts, no location, no camera, no microphone. Udhaar has no reason to want them.'],
        ].map(([k, v]) => `<div class="card" style="padding:var(--s3) var(--s4);background:var(--surface-2)"><b class="small">${esc(k)}</b><p class="tiny muted" style="margin-top:3px;line-height:1.5">${esc(v)}</p></div>`).join('')}
        <p class="tiny dim">A favour you log about someone is your record, not theirs. That’s why every share is a manual action — Udhaar never posts anything automatically.</p>
      </div>`,
  });
  s.open();
}


function deleteSheet() {
  const body = h('div', { class: 'col', style: { gap: 'var(--s3)' } });
  body.innerHTML = `
    <p class="small" style="color:var(--due);font-weight:600">This erases your ledger permanently.</p>
    <p class="small muted">Every person, every line, every settlement. If anyone joined through your links, their copy of their own ledger stays with them — you cannot delete someone else’s book.</p>
    <div class="field"><label class="field__label" for="del-confirm">Type DELETE to confirm</label>
      <input class="input" id="del-confirm" placeholder="DELETE" autocomplete="off" autocapitalize="characters"></div>
  `;
  const go = h('button', { class: 'btn btn--due btn--lg btn--block', type: 'button', text: 'Erase everything', disabled: true });
  const s = new Sheet({ title: 'Delete account', body, footer: go });
  s.open();
  const input = body.querySelector('#del-confirm');
  input.addEventListener('input', () => { go.disabled = input.value.trim().toUpperCase() !== 'DELETE'; });
  go.onclick = async () => {
    go.disabled = true; go.innerHTML = '<span class="btn__spinner"></span> Erasing…';
    try {
      await api.del('/api/me/account').catch(() => {});
      await api.logout();
      clearSession(); clearCache();
      setState({ user: null, friends: [], groups: [], stats: null });
      s.close();
      toast('Gone. Start again whenever.');
      navigate('/auth');
    } catch (e) { go.disabled = false; go.textContent = 'Erase everything'; toastError(e.message); }
  };
}

async function install() {
  if (state.installPrompt) {
    state.installPrompt.prompt();
    const { outcome } = await state.installPrompt.userChoice;
    if (outcome === 'accepted') toastOk('Installing…');
    state.installPrompt = null;
    return;
  }
  if (isStandalone()) return toast('Already installed on this device.');
  new Sheet({
    title: 'Install Udhaar',
    sub: 'Opens full-screen, works offline, sits on your home screen.',
    body: `<div class="col" style="gap:var(--s3)">
      ${navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad')
        ? `<div class="card" style="padding:var(--s4);background:var(--surface-2)"><b class="small">On iPhone</b><p class="tiny muted" style="margin-top:4px;line-height:1.6">Tap the <b>Share</b> button in Safari’s toolbar, then <b>Add to Home Screen</b>.</p></div>`
        : `<div class="card" style="padding:var(--s4);background:var(--surface-2)"><b class="small">On Android / Chrome</b><p class="tiny muted" style="margin-top:4px;line-height:1.6">Menu <b>⋮</b> → <b>Install app</b> or <b>Add to Home screen</b>. Your browser should also be showing a banner.</p></div>`}
      <p class="tiny dim">Udhaar is a Progressive Web App — no app store, no 30% cut, no update waiting.</p>
    </div>`,
  }).open();
}
