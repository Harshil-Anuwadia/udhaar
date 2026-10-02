/* Home: the net position, the people, the entries. */

import { h, esc, buzz, money, symbol, withSymbol, relTime, dueLabel, shortMoney, avatarHTML, plural, clamp, currencyCode } from '../core/utils.js';
import { Icon } from '../ui/icons.js';
import { Art } from '../ui/art.js';
import { BrandMark } from '../ui/brand.js';
import { api } from '../core/api.js';
import { state, setState, bus } from '../core/store.js';
import { mount, setHeader, showFab } from './view.js';
import { navigate } from '../core/router.js';
import { toast, toastOk, toastError } from '../ui/toast.js';
import { actionSheet, confirmSheet, Sheet } from '../ui/sheet.js';
import { confetti } from '../ui/confetti.js';

import { openRecord } from './add.js';
import { openShareCard } from './share.js';
import { homeVerdict } from '../core/voice.js';

const KIND_ICON = { money: 'rupee', favor: 'hands', gesture: 'heart' };

export async function viewHome({ outlet }) {
  setHeader({
    title: `<span class="brand-header">${BrandMark()}<span>udhaar<span style="color:var(--due)">.</span></span></span>`,
    actions: [
      { label: 'Share my ledger', icon: Icon.share, onClick: () => openShareCard() },
      { label: 'Settings', icon: Icon.settings, onClick: () => navigate('/you') },
    ],
  });
  showFab(true);

  // Instant paint from cache — zero skeleton flash on revisit
  const cachedFriends = state.friends;
  const cachedStats = state.stats;
  const hadCache = !!(cachedFriends?.length && cachedStats);

  if (hadCache) {
    mount(outlet, 'app', () => homeHTML({ friends: cachedFriends }, cachedStats), (el) => bindHome(el, { friends: cachedFriends }, cachedStats));
  } else {
    mount(outlet, 'app', skeletonHTML);
  }

  // Fetch fresh data in background
  const [friendsRes, statsRes] = await Promise.all([api.friends(), api.stats()]);
  setState({ friends: friendsRes.friends, stats: statsRes });

  const changed = !hadCache ||
    JSON.stringify(friendsRes.friends) !== JSON.stringify(cachedFriends) ||
    JSON.stringify(statsRes.totals) !== JSON.stringify(cachedStats?.totals);

  if (changed) {
    mount(outlet, 'app', () => homeHTML(friendsRes, statsRes), (el) => bindHome(el, friendsRes, statsRes), { animate: !hadCache });
  }
  bus.emit('loaded:home');
  return $('#main')?.firstElementChild;
}

/* --------------------------------- render -------------------------------- */

function skeletonHTML() {
  return `
    <div class="ledger-page skeleton" style="height:186px"></div>
    <div class="card skeleton" style="height:74px"></div>
    <div class="card skeleton" style="height:280px"></div>`;
}

function homeHTML({ friends }, stats) {
  const t = stats.totals;
  const cur = currencyCode();
  const net = t.net;
  const positive = net > 0;
  const zero = net === 0;

  const verdict = homeVerdict({ net, friends: t.friends, seed: state.user?.id || 'ledger' });

  const stamp = zero ? 'Settled' : positive ? 'In your favour' : 'You owe';
  const stampColor = zero ? 'var(--settled)' : positive ? 'var(--credit)' : 'var(--due)';

  const people = [...friends]
    .filter((f) => f.net !== 0 || f.openCount > 0)
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || b.openCount - a.openCount);

  const rest = friends.filter((f) => !(f.net !== 0 || f.openCount > 0));


  return `
  ${state.user?.isDemo ? '<span class="tag tag--warn demo-indicator">Preview ledger · sample data</span>' : ''}
  <div class="home-actions anim-rise" aria-label="Ledger actions">
    <button class="btn btn--primary" data-act="record">${Icon.plus} Log something</button>
    <button class="btn btn--outline" data-act="addfriend">${Icon.people} Add a person</button>
  </div>
  <section class="ledger-page netcard anim-rise" aria-label="Your net position">
    <div class="netcard__stamp" style="color:${stampColor}">${stamp}</div>
    <div class="netcard__label">Net position</div>
    <div class="netcard__amount" style="color:${zero ? 'var(--ink)' : positive ? 'var(--credit)' : 'var(--due)'}">
      <span class="cur">${symbol(cur)}</span><span class="num" data-count="${Math.abs(net)}">${money(Math.abs(net), cur)}</span>
    </div>
    <p class="netcard__verdict">${verdict}</p>

    <div class="netcard__split">
      <div class="netcard__cell" style="--cell-dot:var(--credit)">
        <b class="credit-text num">${symbol(cur)}${money(t.owedToYou, cur)}</b>
        <span>Owed to you</span>
      </div>
      <div class="netcard__cell" style="--cell-dot:var(--due);align-items:flex-end;text-align:right">
        <b class="due-text num">${symbol(cur)}${money(t.youOwe, cur)}</b>
        <span>You owe</span>
      </div>
    </div>
  </section>

  ${t.overdue > 0 ? `
  <button class="card overdue-row anim-rise" data-act="overdue" style="animation-delay:100ms">
      <span class="overdue-row__ico">${Icon.alert}</span>
      <span class="grow small" style="color:var(--due-ink);text-align:left"><b>${plural(t.overdue, 'entry', 'entries')} past its date</b> <span class="dim" style="color:inherit;opacity:.7">· tap to review</span></span>
      ${Icon.chevR}
    </button>` : ''}

  <section style="animation-delay:120ms" class="anim-rise">
    <div class="section-head">
      <h2>${people.length ? 'Your people' : 'No people yet'}</h2>
    </div>

    ${people.length ? `<div class="list" id="peopleList">
      ${people.map((f) => personRow(f, cur)).join('')}
    </div>` : emptyPeople(friends.length)}
  </section>

  ${rest.length ? `
  <section class="anim-rise">
    <div class="section-head"><h2>Square</h2><span class="tiny dim">${rest.length}</span></div>
    <div class="list">
      ${rest.slice(0, 6).map((f) => personRow(f, cur, true)).join('')}
      ${rest.length > 6 ? `<button class="person" data-act="allpeople" style="justify-content:center;color:var(--ink-3);font-size:var(--fs-13);font-weight:600">Show all ${rest.length}</button>` : ''}
    </div>
  </section>` : ''}

  ${friends.length === 0 ? '' : `
  <button class="card invite-row anim-rise" data-act="invite" style="margin-top:var(--s3)">
      <span class="invite-row__art">${Art.invite()}</span>
      <span class="grow small muted" style="text-align:left">The group chat has people. Your ledger should too. <b style="color:var(--ink-2)">Add someone.</b></span>
      ${Icon.chevR}
    </button>`}
  `;
}

function emptyPeople(hasFriends) {
  return `
  <div class="card">
    <div class="empty">
      <div class="empty__art empty__art--icon">${Icon.ledger}</div>
      <h3>${hasFriends ? 'All caught up' : 'It starts with one person'}</h3>
      <p>${hasFriends
        ? 'No open balances. The next cab or coffee can go here when it happens.'
        : 'You know the friend who says “I’ll send it later.” Add them now; sort the details later.'}</p>
      <button class="btn btn--primary" data-act="${hasFriends ? 'record' : 'addfriend'}">${hasFriends ? 'Log something' : 'Add your first person'}</button>
    </div>
  </div>`;
}

function personRow(f, cur, square = false) {
  const positive = f.net > 0;
  const amt = f.net === 0 ? '' : withSymbol(Math.abs(f.net), cur);
  const label = f.net === 0
    ? (f.openCount ? `${f.openCount} open` : 'square')
    : positive ? 'owes you' : 'you owe';
  const meta = f.lastEntry?.note || (f.lastEntry ? kindWord(f.lastEntry.kind) : f.note || 'no entries yet');
  const time = f.lastEntry ? relTime(f.lastEntry.created_at) : '';

  return `
  <button class="person" data-person="${f.id}" data-name="${esc(f.name)}">
    ${avatarHTML({ name: f.name, seed: f.avatar_seed, size: 40 })}
    <span class="person__main">
      <span class="person__name">
        ${esc(f.name)}
        ${f.linked ? `<span class="tag tag--settled" style="padding:1px 6px;font-size:9px">live</span>` : ''}
        ${square ? '' : positive ? '<span class="dot dot--credit"></span>' : f.net < 0 ? '<span class="dot"></span>' : ''}
      </span>
      <span class="person__meta"><span class="person__meta-note truncate">${esc(meta)}</span>${time ? `<span class="person__meta-time">· ${esc(time)}</span>` : ''}</span>
    </span>
    <span class="person__amt">
      ${amt ? `<b style="color:${positive ? 'var(--credit)' : 'var(--due)'}">${amt}</b>` : ''}
      <span>${label}</span>
    </span>
    <span class="person__chev">${Icon.chevR}</span>
  </button>`;
}

const kindWord = (k) => (k === 'money' ? 'money' : k === 'favor' ? 'a favour' : 'a gesture');

/* --------------------------------- bind ---------------------------------- */

function bindHome(main, { friends }, stats) {
  main.querySelectorAll('[data-nav]').forEach((el) => {
    const go = () => { const to = el.dataset.nav; if (to) { buzz(6); navigate(to); } };
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });

  main.querySelectorAll('[data-person]').forEach((el) => {
    el.addEventListener('click', () => { buzz(6); navigate(`/friend/${el.dataset.person}`); });
  });

  main.querySelectorAll('[data-act]').forEach((el) => {
    el.addEventListener('click', () => {
      const act = el.dataset.act;
      buzz(8);
      if (act === 'addfriend') return openAddFriend();
      if (act === 'record') return openRecord();
      if (act === 'invite') return openInvite(friends);
      if (act === 'overdue') return openOverdue();
      if (act === 'allpeople') return openAllPeople(friends);
    });
  });

  animateCounters(main);
}

function animateCounters(root) {
  root.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count) || 0;
    if (!target || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = money(target); return; }
    const dur = 700;
    const start = performance.now();
    const step = (now) => {
      const p = clamp((now - start) / dur, 0, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = money(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/* ------------------------------ add a person ------------------------------ */

export function openAddFriend({ onAdded } = {}) {
  const form = h('div', { class: 'col', style: { gap: 'var(--s4)' } });
  form.innerHTML = `
    <div class="field">
      <label class="field__label" for="af-name">What do you call them?</label>
      <input class="input" id="af-name" placeholder="Roomie, bestie, Arjun…" maxlength="40" autocomplete="off" data-autofocus>
      <span class="field__error" id="err-af-name"></span>
    </div>
    <div class="field">
      <label class="field__label" for="af-handle">Their udhaar handle <span class="dim" style="text-transform:none;font-weight:500">(optional)</span></label>
      <input class="input" id="af-handle" placeholder="@arjun" autocapitalize="none" autocorrect="off" spellcheck="false">
      <p class="tiny dim" style="margin-top:2px">Already on udhaar? Your ledgers will link.</p>
    </div>
    <div class="card" style="padding:var(--s3) var(--s4);display:flex;gap:var(--s3);align-items:flex-start;background:var(--surface-2)">
      <span style="color:var(--gold);flex:0 0 auto;margin-top:1px">${Icon.info}</span>
      <p class="tiny" style="color:var(--ink-2);line-height:1.5">They don’t need an account. Keep this on your side, or share a link when you’re ready.</p>
    </div>
  `;

  const submit = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'button', text: 'Add to my book' });
  const sheet = new Sheet({ title: 'Add someone', sub: 'Just a name. No contact access.', body: form, footer: submit });
  sheet.open();

  const nameEl = form.querySelector('#af-name');
  const handleEl = form.querySelector('#af-handle');
  handleEl.addEventListener('input', () => { handleEl.value = handleEl.value.toLowerCase().replace(/[^a-z0-9_.]/g, '').replace(/^@/, ''); });

  async function go() {
    const name = nameEl.value.trim();
    if (name.length < 1) {
      form.querySelector('#err-af-name').textContent = 'Give them a name.';
      nameEl.focus();
      return buzz([14, 30, 14]);
    }
    submit.disabled = true;
    submit.innerHTML = '<span class="btn__spinner"></span> Adding…';
    try {
      const res = await api.addFriend({ name, handle: handleEl.value.trim(), note: '' });
      buzz([8, 30, 10]);
      sheet.close();
      toastOk(`${res.friend.name} is in the book.`);
      bus.emit('data-changed');
      onAdded?.(res.friend);
      // Immediately offer to log something — this is the retention moment.
      setTimeout(() => openRecord({ friendshipId: res.friend.id }), 320);
    } catch (e) {
      submit.disabled = false;
      submit.textContent = 'Add to my book';
      if (e.code === 'duplicate') {
        toast(e.message, { action: 'Open', onAction: () => navigate(`/friend/${e.body.friendshipId}`) });
        sheet.close();
      } else if (e.status === 402) {
        sheet.close();
        navigate('/plus');
      } else {
        form.querySelector('#err-af-name').textContent = e.message || 'Could not add them.';
      }
    }
  }

  submit.addEventListener('click', go);
  form.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  return sheet;
}

/* -------------------------------- invite --------------------------------- */

export async function openInvite(friends) {
  const sheet = new Sheet({
    title: 'Share their side',
    sub: 'One link, so you’re both looking at the same line.',
    body: `<div class="col"><div class="skeleton" style="height:60px"></div><div class="skeleton" style="height:60px"></div></div>`,
  });
  sheet.open();
  try {
    const res = await api.invites();
    const origin = location.origin;
    const list = res.links.slice(0, 12).map((l) => {
      const url = `${origin}/#/join?token=${l.token}`;
      return `
      <div class="card" style="padding:var(--s3) var(--s4);display:flex;align-items:center;gap:var(--s3)">
        <div class="grow wrap">
          <b class="small">${esc(l.name)}</b>
          <div class="tiny dim truncate" style="font-family:var(--font-mono)">${l.claimed ? 'already joined · resend anyway' : url.replace(origin, '')}</div>
        </div>
        <button class="iconbtn" data-copy="${esc(url)}" aria-label="Copy link for ${esc(l.name)}">${Icon.copy}</button>
        <button class="btn btn--sm btn--primary" data-wa="${esc(url)}" data-name="${esc(l.name)}">Send</button>
      </div>`;
    }).join('');

    sheet.setBody(`
      <div class="col" style="gap:var(--s3)">
        <div class="card" style="padding:var(--s4);background:var(--surface-2)">
          <b class="small">Your handle</b>
          <p class="tiny muted" style="margin:4px 0 10px">Share <b class="num" style="color:var(--ink)">@${esc(state.user?.handle || 'you')}</b>. When they add you, both ledgers link.</p>
          <div class="row" style="gap:var(--s2)">
            <button class="btn btn--sm btn--outline grow" data-copy="@${esc(state.user?.handle || '')}">${Icon.copy} Copy handle</button>
            <button class="btn btn--sm btn--primary grow" data-code>${Icon.gift} Invite code</button>
          </div>
          <p class="tiny dim" style="margin-top:8px" id="codeOut"></p>
        </div>
        <div class="section-head" style="margin:0"><h2>Personal links</h2><span class="tiny dim">one for each person</span></div>
        ${list || '<p class="small muted center">Add a person first, then send them their side of the book.</p>'}
      </div>
    `);

    sheet.bodyEl.addEventListener('click', async (e) => {
      const codeBtn = e.target.closest('[data-code]');
      if (codeBtn) {
        codeBtn.disabled = true;
        try {
          const { code } = await api.makeCode();
          const out = sheet.bodyEl.querySelector('#codeOut');
          if (out) out.innerHTML = `Code <b class="num">${esc(code)}</b> — they paste it at signup and land in your book.`;
          buzz([8, 20, 8]);
        } catch (err) { toastError(err.message); }
        codeBtn.disabled = false;
        return;
      }
      const copyBtn = e.target.closest('[data-copy]');
      const waBtn = e.target.closest('[data-wa]');
      if (copyBtn) {
        const { copyText } = await import('../core/utils.js');
        const ok = await copyText(copyBtn.dataset.copy);
        buzz(8);
        toast(ok ? 'Link copied.' : 'Could not copy.', { kind: ok ? 'ok' : 'error' });
      }
      if (waBtn) {
        buzz(8);
        const name = waBtn.dataset.name;
        const msg = `Hey, I put our shared tabs on udhaar so we don't have to scroll back through chat. Here's your side: ${waBtn.dataset.wa}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
      }
    });
  } catch (e) {
    sheet.setBody(`<div class="empty"><h3>Couldn’t load invites</h3><p>${esc(e.message)}</p></div>`);
  }
}

/* -------------------------------- overdue -------------------------------- */

async function openOverdue() {
  const sheet = new Sheet({ title: 'Past due', sub: 'The lines that need a follow-up.' });
  sheet.open();
  sheet.setBody('<div class="skeleton" style="height:120px"></div>');
  try {
    const { entries } = await api.entries({ status: 'open', limit: 100 });
    const late = entries.filter((e) => e.overdue);
    if (!late.length) {
      sheet.setBody('<div class="empty"><h3>Nothing overdue</h3><p>All caught up. Screenshot this feeling.</p></div>');
      return;
    }
    const cur = currencyCode();
    // Real world: half of "overdue" is money waiting for you to pay it.
    // Chasing and paying are different moods — never mix them in one list.
    const chase = late.filter((e) => e.direction === 'owed_to_me');
    const onYou = late.filter((e) => e.direction === 'owed_by_me');
    const row = (e, tag) => `
          <button class="entry" data-open="${e.friend.id}">
            <span class="entry__mark entry__mark--due">${Icon[KIND_ICON[e.kind]]}</span>
            <span class="grow wrap">
              <span class="entry__note">${esc(e.note || kindWord(e.kind))}${tag ? ` <span class="tag tag--gold" style="padding:1px 6px">${tag}</span>` : ''}</span>
              <span class="entry__meta"><b style="color:var(--due)">${esc(dueLabel(e.dueAt))}</b> · ${esc(e.friend.name)}</span>
            </span>
            <span class="entry__amt"><b class="due-text">${e.kind === 'money' ? withSymbol(e.amount, cur) : '—'}</b></span>
          </button>`;
    sheet.setBody(`
      ${chase.length ? `
        <div class="field__label">chase these</div>
        <div class="list">${chase.map((e) => row(e, '')).join('')}</div>
        <button class="btn btn--block btn--outline" data-nudgeall>Nudge everyone who owes you</button>` : ''}
      ${onYou.length ? `
        <div class="field__label" style="margin-top:var(--s4)">on you — go pay these</div>
        <div class="list">${onYou.map((e) => row(e, 'on you')).join('')}</div>
        <p class="tiny muted" style="margin-top:8px">Tap a line to open it with them and mark it paid. No nudging yourself.</p>` : ''}
    `);
    sheet.bodyEl.addEventListener('click', async (ev) => {
      const open = ev.target.closest('[data-open]');
      const all = ev.target.closest('[data-nudgeall]');
      if (open) { sheet.close(); navigate(`/friend/${open.dataset.open}`); }
      if (all) {
        all.disabled = true; all.innerHTML = '<span class="btn__spinner"></span> Nudging…';
        let ok = 0;
        for (const e of chase) { try { await api.remind(e.id); ok += 1; } catch {} }
        buzz([10, 40, 10]);
        toastOk(`Nudged ${plural(ok, 'person')}. Share the links so it actually lands.`);
        all.textContent = 'Done';
      }
    });
  } catch (e) {
    sheet.setBody(`<div class="empty"><h3>Couldn’t load</h3><p>${esc(e.message)}</p></div>`);
  }
}

function openAllPeople(friends) {
  const cur = currencyCode();
  const sheet = new Sheet({ title: 'Everyone', sub: `${friends.length} in the book` });
  sheet.open();
  sheet.setBody(`<div class="list">${friends.map((f) => personRow(f, cur)).join('')}</div>`);
  sheet.bodyEl.addEventListener('click', (e) => {
    const p = e.target.closest('[data-person]');
    if (p) { sheet.close(); navigate(`/friend/${p.dataset.person}`); }
  });
}
