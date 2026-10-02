/* Groups: the Goa problem. One bill, many people, zero spreadsheets. */

import { h, esc, buzz, money, symbol, withSymbol, relTime, avatarHTML, plural, shortMoney } from '../core/utils.js';
import { Icon } from '../ui/icons.js';
import { Art } from '../ui/art.js';
import { api } from '../core/api.js';
import { state, setState, bus } from '../core/store.js';
import { mount, setHeader, showFab } from './view.js';
import { navigate } from '../core/router.js';
import { toast, toastOk, toastError } from '../ui/toast.js';
import { Sheet, confirmSheet } from '../ui/sheet.js';
import { confetti } from '../ui/confetti.js';
import { groupPosition } from '../core/group-position.js';

const PALETTE = ['#8A5A44', '#5B6B8C', '#6E7B52', '#8C6E3F', '#7A5A80', '#4E7676', '#96564A', '#5F6E4E'];

export async function viewGroups({ outlet }) {
  setHeader({ title: 'Groups', sub: 'The split, minus the chat maths' });
  showFab(false);

  // Instant paint from cache
  const cachedGroups = state.groups;
  const cachedFriends = state.friends;
  const hadCache = !!(cachedGroups && cachedFriends);

  if (hadCache) {
    mount(outlet, 'app', () => groupsHTML(cachedGroups, cachedFriends), (main) => bindGroups(main, cachedGroups, cachedFriends));
  } else {
    mount(outlet, 'app', () => `<div class="card skeleton" style="height:120px"></div><div class="card skeleton" style="height:120px"></div>`);
  }

  const [groupsRes, friendsRes] = await Promise.all([api.groups(), api.friends()]);
  setState({ groups: groupsRes.groups, friends: friendsRes.friends });

  const changed = !hadCache ||
    JSON.stringify(groupsRes.groups) !== JSON.stringify(cachedGroups) ||
    JSON.stringify(friendsRes.friends) !== JSON.stringify(cachedFriends);

  if (changed) {
    mount(outlet, 'app', () => groupsHTML(groupsRes.groups, friendsRes.friends), (main) => bindGroups(main, groupsRes.groups, friendsRes.friends), { animate: !hadCache });
  }
}

function groupsHTML(groups, friends) {
  if (!friends.length) {
    return `<div class="card"><div class="empty">
      <div class="empty__art">${Art.map()}</div>
      <h3>Get the crew in first</h3>
      <p>Add the people from the trip, flat, or birthday plan. Then split the bill here.</p>
      <button class="btn btn--primary" data-act="addfriend">Add people</button>
    </div></div>`;
  }

  return `
  ${groups.length === 0 ? `
    <div class="card anim-rise"><div class="empty">
      <div class="empty__art">${Art.split()}</div>
      <h3>First group starts here</h3>
      <p>That trip plan, flat bill, or post-match food run? Give it a group so the maths has a home.</p>
      <button class="btn btn--primary" data-act="newgroup">${Icon.plus} New group</button>
    </div></div>` : `
    <div class="col" style="gap:var(--s3)">
      ${groups.map((g, i) => groupCard(g, i)).join('')}
    </div>
    <button class="btn btn--outline btn--block" data-act="newgroup">${Icon.plus} New group</button>
  `}`;
}

function groupCard(g, i) {
  const cur = g.currency || 'INR';
  const position = groupPosition(g.members);
  const color = PALETTE[g.avatarSeed % PALETTE.length];
  const max = Math.max(1, ...g.members.map((m) => Math.max(m.owes, m.isOwed)));

  return `
  <button class="card groupcard anim-rise" style="text-align:left;animation-delay:${i * 50}ms" data-group="${g.id}">
    <div class="groupcard__top">
      <span class="avatar avatar--48" style="background:linear-gradient(150deg,${color},${color}cc);border-radius:var(--r-md)"><span>${esc(g.name.slice(0, 2).toUpperCase())}</span></span>
      <span class="grow wrap">
        <span class="groupcard__name">${esc(g.name)}</span>
        <span class="groupcard__meta">${plural(g.members.length, 'person', 'people')} · ${plural(g.splits, 'split')}</span>
      </span>
      <span class="groupcard__position">
        <b class="num ${position.state === 'outgoing' ? 'due-text' : position.state === 'settled' ? '' : 'credit-text'}">${position.state === 'settled' ? 'Square' : withSymbol(position.incoming || position.outgoing, cur)}</b>
        <span class="tiny dim">${position.state === 'both' ? `also owe ${withSymbol(position.outgoing, cur)}` : position.state === 'incoming' ? 'coming to you' : position.state === 'outgoing' ? 'you owe' : 'all settled'}</span>
      </span>
    </div>

    <div class="stack">
      ${g.members.slice(0, 6).map((m) => avatarHTML({ name: m.name, seed: m.seed ?? m.avatarSeed ?? m.avatar_seed, size: 32 })).join('')}
      ${g.members.length > 6 ? `<span class="avatar avatar--32" style="background:var(--surface-3);color:var(--ink-3)"><span>+${g.members.length - 6}</span></span>` : ''}
    </div>

    ${g.members.some((m) => m.owes) ? `
    <div class="col" style="gap:5px">
      ${g.members.filter((m) => m.owes > 0).slice(0, 3).map((m) => `
        <div class="row" style="gap:8px">
          <span class="tiny truncate" style="width:74px;color:var(--ink-2)">${esc(m.name)}</span>
          <span class="splitbar grow"><i style="width:${Math.round((m.owes / max) * 100)}%;background:var(--credit)"></i></span>
          <span class="tiny num" style="width:62px;text-align:right;color:var(--credit)">${shortMoney(m.owes, cur)}</span>
        </div>`).join('')}
    </div>` : ''}
  </button>`;
}

function bindGroups(main, groups, friends) {
  main.addEventListener('click', (e) => {
    const g = e.target.closest('[data-group]');
    const act = e.target.closest('[data-act]');
    if (g) { buzz(6); return navigate(`/group/${g.dataset.group}`); }
    if (!act) return;
    buzz(8);
    if (act.dataset.act === 'newgroup') return openNewGroup(friends);
    if (act.dataset.act === 'addfriend') return import('./home.js').then((m) => m.openAddFriend());
  });
}

/* ------------------------------ new group -------------------------------- */

function openNewGroup(friends) {
  const selected = new Set();
  const body = h('div', { class: 'col', style: { gap: 'var(--s4)' } });
  body.innerHTML = `
    <div class="field">
      <label class="field__label" for="g-name">What’s this group for?</label>
      <input class="input" id="g-name" placeholder="Goa plan, Flat 402, Friday dinner" maxlength="40" data-autofocus>
      <div class="quickrow" style="margin-top:8px">
        ${['Trip', 'Flat', 'Birthday dinner', 'Football', 'Road trip'].map((s) => `<button class="quick" type="button" data-sugg="${s}">${s}</button>`).join('')}
      </div>
    </div>
    <div class="field">
      <span class="field__label">Who’s in it</span>
      <div class="col" style="gap:2px" id="g-people"></div>
    </div>
  `;
  const people = body.querySelector('#g-people');
  for (const f of friends) {
    people.append(h('button', {
      class: 'pick', type: 'button', 'aria-pressed': 'false', 'data-pick': f.id,
      html: `${avatarHTML({ name: f.name, seed: f.avatar_seed, size: 40 })}
        <span class="grow"><span class="pick__name">${esc(f.name)}</span><br><span class="pick__meta">${f.net > 0 ? `owes you ${withSymbol(f.net)}` : f.net < 0 ? `you owe ${withSymbol(-f.net)}` : 'square'}</span></span>
        <span class="pick__check">${Icon.check}</span>`,
      onclick: (e) => {
        const btn = e.currentTarget;
        const on = btn.getAttribute('aria-pressed') === 'true';
        btn.setAttribute('aria-pressed', String(!on));
        on ? selected.delete(f.id) : selected.add(f.id);
        buzz(5);
        syncSubmit();
      },
    }));
  }

  const go = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'button', text: 'Create group', disabled: true });
  const sheet = new Sheet({ title: 'New group', sub: `${plural(friends.length, 'person')} available`, body, footer: go });
  sheet.open();

  body.querySelectorAll('[data-sugg]').forEach((b) => b.addEventListener('click', () => {
    body.querySelector('#g-name').value = b.dataset.sugg;
    buzz(5);
    syncSubmit();
  }));
  body.querySelector('#g-name').addEventListener('input', syncSubmit);

  function syncSubmit() {
    go.disabled = !(body.querySelector('#g-name').value.trim() && selected.size > 0);
    go.textContent = selected.size ? `Create group · ${plural(selected.size, 'person', 'people')}` : 'Create group';
  }

  go.onclick = async () => {
    go.disabled = true; go.innerHTML = '<span class="btn__spinner"></span> Creating…';
    try {
      const res = await api.createGroup({ name: body.querySelector('#g-name').value.trim(), members: [...selected] });
      buzz([10, 30, 12]);
      sheet.close();
      toastOk(`Group created: ${res.group.name}.`);
      bus.emit('data-changed');
      navigate(`/group/${res.group.id}`);
    } catch (e) {
      go.disabled = false; go.textContent = 'Create group';
      if (e.status === 402) { sheet.close(); navigate('/plus'); }
      else toastError(e.message);
    }
  };
}

/* ----------------------------- group detail ------------------------------ */

export async function viewGroup({ outlet, params }) {
  mount(outlet, 'app', () => `<div class="card skeleton" style="height:160px"></div><div class="card skeleton" style="height:240px"></div>`);
  setHeader({ title: 'Group', back: true });
  showFab(true);

  let data;
  try { data = await api.group(params.id); }
  catch (e) {
    return mount(outlet, 'app', () => `<div class="empty" style="padding-top:80px"><h3>Group not found</h3><p>${esc(e.message)}</p><a class="btn btn--primary" href="#/groups">Back</a></div>`);
  }

  const { group, splits, entries } = data;
  setHeader({ title: esc(group.name), sub: `${plural(group.members.length, 'person')}`, back: true });

  mount(outlet, 'app', () => groupDetailHTML(group, splits, entries), (main) => bindGroupDetail(main, group, splits, entries));
}

function groupDetailHTML(g, splits, entries) {
  const cur = g.currency || 'INR';
  const owedToMe = g.members.reduce((s, m) => s + m.owes, 0);
  const iOwe = g.members.reduce((s, m) => s + m.isOwed, 0);
  const max = Math.max(1, ...g.members.map((m) => Math.max(m.owes, m.isOwed)));

  return `
  <section class="ledger-page anim-rise" style="padding:var(--s5) var(--s5) var(--s4) calc(var(--s5) + 14px)">
    <div class="netcard__label">Still to collect</div>
    <div class="netcard__amount" style="color:var(--credit)"><span class="cur">${symbol(cur)}</span>${money(owedToMe, cur)}</div>
    <p class="netcard__verdict">${iOwe ? `You also owe ${withSymbol(iOwe, cur)} in here.` : `Across ${plural(g.members.length, 'person')} and ${plural(splits.length, 'split')}.`}</p>
    <div class="row" style="gap:var(--s2);margin-top:var(--s4)">
      <button class="btn btn--primary grow" data-act="split">${Icon.plus} Add a bill</button>
      <button class="btn btn--outline" data-act="members" aria-label="Manage people">${Icon.people}</button>
    </div>
  </section>

  <section class="anim-rise" style="animation-delay:50ms">
    <div class="section-head"><h2>Who owes what</h2></div>
    <div class="list" style="padding:var(--s3) var(--s4)">
      ${g.members.map((m) => `
        <div class="row" style="gap:10px;padding:7px 0">
          ${avatarHTML({ name: m.name, seed: m.seed ?? m.avatarSeed ?? m.avatar_seed, size: 32 })}
          <span class="small truncate" style="width:78px">${esc(m.name)}</span>
          <span class="splitbar grow"><i style="width:${Math.round(((m.owes || m.isOwed) / max) * 100)}%;background:${m.owes ? 'var(--due)' : 'var(--credit)'}"></i></span>
          <span class="tiny num" style="width:70px;text-align:right;color:${m.owes ? 'var(--due)' : m.isOwed ? 'var(--credit)' : 'var(--ink-4)'}">
            ${m.owes ? `−${shortMoney(m.owes, cur)}` : m.isOwed ? `+${shortMoney(m.isOwed, cur)}` : 'square'}
          </span>
        </div>`).join('')}
    </div>
  </section>

  <section class="anim-rise" style="animation-delay:80ms">
    <div class="section-head"><h2>Bills</h2><span class="tiny dim">${splits.length}</span></div>
    ${splits.length ? `<div class="list">
      ${splits.map((s) => `
        <button class="entry" data-split="${s.id}" type="button" style="width:100%">
          <span class="entry__mark entry__mark--gold">${Icon.split}</span>
          <span class="grow wrap">
            <span class="entry__note">${esc(s.title)}</span>
            <span class="entry__meta">
              <span>${s.payerKind === 'me' ? 'you paid' : `${esc(s.payer?.name || 'they')} paid`}</span>
              <span>· ${relTime(s.createdAt)}</span>
              <span>· ${plural(s.shares.length, 'share')}</span>
            </span>
          </span>
          <span class="entry__amt"><b class="num">${withSymbol(s.amount, cur)}</b></span>
        </button>`).join('')}
    </div>` : `<div class="card"><div class="empty" style="padding:var(--s8) var(--s5)">
      <h3>No bills in this group</h3><p>Add the dinner, fuel, or stay deposit. We’ll split it and write everyone’s share down.</p>
      <button class="btn btn--primary" data-act="split">${Icon.plus} Add a bill</button>
    </div></div>`}
  </section>

  ${entries.filter((e) => e.status === 'settled').length ? `
  <section class="anim-rise">
    <div class="section-head"><h2>Settled here</h2></div>
    <div class="list">
      ${entries.filter((e) => e.status === 'settled').slice(0, 6).map((e) => `
        <div class="entry is-settled">
          <span class="entry__mark entry__mark--settled">${Icon.check}</span>
          <span class="grow wrap"><span class="entry__note">${esc(e.note || 'split')}</span>
          <span class="entry__meta"><span>${esc(e.friendName)}</span><span>· ${relTime(e.settledAt)}</span></span></span>
          <span class="entry__amt"><b class="num">${withSymbol(e.amount, cur)}</b></span>
        </div>`).join('')}
    </div>
  </section>` : ''}

  <section class="anim-rise">
    <button class="btn btn--quiet btn--block small" data-act="archive" style="color:var(--ink-3)">Archive this group</button>
  </section>`;
}

function bindGroupDetail(main, g, splits, entries) {
  main.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    const sp = e.target.closest('[data-split]');
    if (sp) {
      const s = splits.find((x) => x.id === sp.dataset.split);
      return openSplitDetail(s, g);
    }
    if (!act) return;
    buzz(8);
    const a = act.dataset.act;
    if (a === 'split') return openSplit(g);
    if (a === 'members') return openMembers(g);
    if (a === 'archive') return confirmSheet({
      title: `Archive ${esc(g.name)}?`,
      body: 'The ledgers stay intact — the group just stops showing up front. Entries are never deleted.',
      confirmLabel: 'Archive it',
      onConfirm: async () => { try { await api.updateGroup(g.id, { archived: true }); toastOk('Archived.'); navigate('/groups'); } catch (err) { toastError(err.message); } },
    });
  });
}

function openSplitDetail(s, g) {
  const cur = g.currency;
  const body = h('div', { class: 'col', style: { gap: 'var(--s3)' } });
  body.innerHTML = `
    <div class="ledger-page" style="padding:var(--s5) var(--s5) var(--s5) calc(var(--s5) + 14px)">
      <div class="netcard__label">${s.payerKind === 'me' ? 'You paid' : `${esc(s.payer?.name || 'They')} paid`}</div>
      <div class="netcard__amount" style="color:var(--ink)"><span class="cur">${symbol(cur)}</span>${money(s.amount, cur)}</div>
      <p class="small muted">${esc(s.title)} · ${relTime(s.createdAt)}</p>
    </div>
    <div class="list">
      ${s.meShare ? `
        <div class="entry">
          <span class="entry__mark">${Icon.you}</span>
          <span class="grow"><span class="entry__note">You — your part${s.payerKind === 'me' ? ' (yours to bear)' : ''}</span></span>
          <span class="entry__amt"><b class="num" style="color:var(--ink-3)">${withSymbol(s.meShare, cur)}</b></span>
        </div>` : ''}
      ${s.shares.map((sh) => `
        <div class="entry">
          <span class="entry__mark">${Icon.you}</span>
          <span class="grow"><span class="entry__note">${esc(sh.name)}${s.payerKind === 'friend' ? ' · between them and the payer' : ''}</span></span>
          <span class="entry__amt"><b class="num due-text">${withSymbol(sh.amount, cur)}</b></span>
        </div>`).join('')}
    </div>
  `;
  const sheet = new Sheet({
    title: 'Bill breakdown',
    body,
    footer: h('button', { class: 'btn btn--block btn--quiet', type: 'button', style: 'color:var(--due)', text: 'Undo this split', onclick: () => confirmSheet({
      title: 'Undo this split?',
      body: 'Every ledger line this bill created is removed. Settled ones stay settled.',
      confirmLabel: 'Undo split', danger: true,
      onConfirm: async () => { try { await api.removeSplit(s.id); sheet.close(); toastOk('Split undone.'); bus.emit('data-changed'); navigate(`/group/${g.id}`); } catch (e) { toastError(e.message); } },
    }) }),
  });
  sheet.open();
}

function openMembers(g) {
  const body = h('div', { class: 'col', style: { gap: 'var(--s3)' } });
  body.innerHTML = `<div class="list">${g.members.map((m) => `
    <div class="setrow" data-person="${m.id}">
      ${avatarHTML({ name: m.name, seed: m.seed ?? m.avatarSeed ?? m.avatar_seed, size: 40 })}
      <span class="grow"><span class="setrow__label">${esc(m.name)}</span><br><span class="setrow__hint">${m.linked ? 'on udhaar' : 'not on udhaar'}</span></span>
      <span class="setrow__value num">${m.owes ? `−${shortMoney(m.owes, g.currency)}` : m.isOwed ? `+${shortMoney(m.isOwed, g.currency)}` : '0'}</span>
    </div>`).join('')}</div>
    <button class="btn btn--outline btn--block" data-act="add">${Icon.plus} Add people to this group</button>`;
  const sheet = new Sheet({ title: `${g.members.length} in ${esc(g.name)}`, body });
  sheet.open();
  body.addEventListener('click', async (e) => {
    if (e.target.closest('[data-act="add"]')) {
      const { friends } = await api.friends();
      const missing = friends.filter((f) => !g.members.some((m) => m.id === f.id));
      if (!missing.length) return toast('Everyone in your book is already in this group.');
      const chosen = new Set();
      const pick = h('div', { class: 'col' });
      for (const f of missing) {
        pick.append(h('button', { class: 'pick', type: 'button', 'aria-pressed': 'false', html: `${avatarHTML({ name: f.name, seed: f.avatar_seed, size: 40 })}<span class="grow pick__name">${esc(f.name)}</span><span class="pick__check">${Icon.check}</span>`,
          onclick: (ev) => { const on = ev.currentTarget.getAttribute('aria-pressed') === 'true'; ev.currentTarget.setAttribute('aria-pressed', String(!on)); on ? chosen.delete(f.id) : chosen.add(f.id); } }));
      }
      const s2 = new Sheet({ title: 'Add to group', body: pick, footer: h('button', { class: 'btn btn--primary btn--block', text: 'Add them', onclick: async () => {
        try { await api.addMembers(g.id, [...chosen]); s2.close(); sheet.close(); toastOk('Added.'); bus.emit('data-changed'); navigate(`/group/${g.id}`); } catch (err) { toastError(err.message); }
      } }) });
      s2.open();
    }
    const p = e.target.closest('[data-person]');
    if (p) { sheet.close(); navigate(`/friend/${p.dataset.person}`); }
  });
}

/* -------------------------------- split ---------------------------------- */

function openSplit(g) {
  const cur = g.currency;
  const friends = g.members;
  // A bill divides between everyone who was there — including you.
  const me = { id: 'me', name: 'You', seed: state.user?.avatarSeed || 'me' };
  const members = [me, ...friends];
  const draft = { title: '', amount: '', payer: 'me', payerFriend: null, method: 'equal', included: new Set(members.map((m) => m.id)), custom: new Map() };

  const body = h('div', { class: 'col', style: { gap: 'var(--s4)' } });
  const go = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'button', text: 'Split it', disabled: true });
  const sheet = new Sheet({ title: 'Add a bill', sub: esc(g.name), body, footer: go });
  sheet.open();

  render();

  function render() {
    body.innerHTML = '';

    body.append(h('div', { class: 'field' }, [
      h('label', { class: 'field__label', for: 'sp-title', text: 'What was it' }),
      h('input', { class: 'input', id: 'sp-title', placeholder: 'Dinner at Bombay Canteen', maxlength: 80, value: draft.title, autocomplete: 'off', oninput: (e) => { draft.title = e.target.value; sync(); } }),
      h('div', { class: 'quickrow', style: { marginTop: '8px' }, html: ['Dinner', 'Uber', 'Groceries', 'Fuel', 'Stay', 'Tickets', 'Drinks'].map((s) => `<button class="quick" type="button" data-t="${s}">${s}</button>`).join('') }),
    ]));
    body.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { draft.title = b.dataset.t; body.querySelector('#sp-title').value = b.dataset.t; buzz(5); sync(); }));

    // Amount
    const amt = h('div', { class: 'col', style: { gap: 'var(--s2)' } });
    const amountInput = h('input', {
      class: 'input num amount-entry__input', id: 'sp-amount', type: 'text', inputmode: 'numeric',
      pattern: '[0-9]*', maxlength: 9, autocomplete: 'off', placeholder: '0', value: draft.amount,
      oninput: (e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
        draft.amount = digits ? String(Number(digits)) : '';
        e.target.value = draft.amount;
        sync();
      },
      onchange: () => render(),
    });
    amt.append(
      h('label', { class: 'field__label', for: 'sp-amount', text: 'Total' }),
      h('div', { class: 'amount-entry' }, [
        h('span', { class: 'amount-entry__symbol', text: symbol(cur), 'aria-hidden': 'true' }), amountInput,
      ]),
    );
    body.append(amt);

    // Payer
    const payerWrap = h('div', { class: 'col', style: { gap: 'var(--s2)' } });
    const payerRow = h('div', { class: 'chiprow payer-options' });
    payerRow.append(h('button', { class: 'chip', type: 'button', 'aria-pressed': String(draft.payer === 'me'), text: 'I paid', onclick: () => { draft.payer = 'me'; buzz(6); render(); } }));
    for (const m of friends) {
      payerRow.append(h('button', {
        class: 'chip', type: 'button', 'aria-pressed': String(draft.payer === 'friend' && draft.payerFriend === m.id),
        style: 'padding-left:5px;gap:7px',
        html: `${avatarHTML({ name: m.name, seed: m.seed ?? m.avatarSeed ?? m.avatar_seed, size: 24 })}<span>${esc(m.name)} paid</span>`,
        onclick: () => { draft.payer = 'friend'; draft.payerFriend = m.id; buzz(6); render(); },
      }));
    }
    payerWrap.append(h('div', { class: 'field__label', text: 'Who paid' }), payerRow);
    body.append(payerWrap);

    // Method + who's in
    const whoWrap = h('div', { class: 'col', style: { gap: 'var(--s2)' } });
    const seg = h('div', { class: 'segmented' });
    for (const m of [{ id: 'equal', label: 'Equally' }, { id: 'custom', label: 'Custom' }]) {
      seg.append(h('button', { type: 'button', 'aria-pressed': String(draft.method === m.id), text: m.label, onclick: () => { draft.method = m.id; buzz(6); render(); } }));
    }
    whoWrap.append(h('div', { class: 'field__label', text: 'Split between' }), seg);

    const list = h('div', { class: 'list', style: { padding: '4px' } });
    const preview = previewShares();
    for (const m of members) {
      const inIt = draft.included.has(m.id);
      const share = preview.find((p) => p.id === m.id)?.amount ?? 0;
      const row = h('div', { class: 'pick', style: inIt ? '' : 'opacity:.45' });
      row.innerHTML = `${avatarHTML({ name: m.name, seed: m.seed ?? m.avatarSeed ?? m.avatar_seed, size: 32 })}
        <span class="grow"><span class="pick__name" style="font-size:var(--fs-14)">${esc(m.name)}</span></span>
        ${draft.method === 'custom' && inIt
          ? `<input class="input num" style="min-height:38px;width:96px;text-align:right;padding:0 10px;font-size:var(--fs-14)" inputmode="numeric" value="${draft.custom.get(m.id) ?? share}" data-custom="${m.id}" aria-label="${esc(m.name)} share">`
          : `<span class="num" style="font-weight:650;color:${inIt ? 'var(--due)' : 'var(--ink-4)'}">${inIt ? withSymbol(share, cur) : '—'}</span>`}
        <span class="pick__check" style="opacity:1;color:${inIt ? 'var(--settled)' : 'var(--line-2)'}">${inIt ? Icon.checkCircle : Icon.close}</span>`;
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-custom]')) return;
        buzz(5);
        inIt ? draft.included.delete(m.id) : draft.included.add(m.id);
        render();
      });
      list.append(row);
    }
    whoWrap.append(list);
    body.append(whoWrap);

    // Custom inputs
    if (draft.method === 'custom') {
      body.querySelectorAll('[data-custom]').forEach((inp) => inp.addEventListener('input', (e) => {
        draft.custom.set(e.target.dataset.custom, Number(e.target.value.replace(/[^\d]/g, '')) || 0);
        sync();
      }));
    }

    // Summary
    const total = Number(draft.amount) || 0;
    const sumShares = preview.reduce((s, p) => s + p.amount, 0);
    const mismatch = draft.method === 'custom' && total > 0 && sumShares !== total;
    const myShare = preview.find((p) => p.id === 'me')?.amount ?? 0;
    const inIt = draft.included.has('me');
    const payerFriendName = draft.payer === 'friend' ? (friends.find((f) => f.id === draft.payerFriend)?.name || 'them') : null;
    const expl = !total ? '' : mismatch ? '' : draft.payer === 'me'
      ? (inIt && myShare ? `<p class="tiny muted" style="margin-top:4px">Your part is ${withSymbol(myShare, cur)} — no line for it, it’s simply yours. Friends’ shares land in their ledgers.</p>` : `<p class="tiny muted" style="margin-top:4px">You’re not in this one — friends cover the whole bill.</p>`)
      : (inIt && myShare ? `<p class="tiny muted" style="margin-top:4px">Your part (${withSymbol(myShare, cur)}) becomes one line: you owe ${esc(payerFriendName)}. The rest is between them.</p>` : `<p class="tiny muted" style="margin-top:4px">You’re not in this split, so nothing lands in your book.</p>`);
    body.append(h('div', {
      class: 'card', style: `padding:var(--s3) var(--s4);background:${mismatch ? 'var(--due-bg)' : 'var(--surface-2)'}`,
      html: `<div class="row-between"><span class="small muted">Shares add up to</span><b class="num ${mismatch ? 'due-text' : ''}">${withSymbol(sumShares, cur)}</b></div>
        ${mismatch ? `<p class="tiny" style="color:var(--due-ink);margin-top:4px">${withSymbol(total - sumShares, cur)} unaccounted for. Fix it before splitting.</p>` : expl}`,
    }));

    sync();
  }

  function previewShares() {
    const included = members.filter((m) => draft.included.has(m.id));
    const total = Number(draft.amount) || 0;
    if (draft.method === 'custom') {
      return included.map((m) => ({ id: m.id, amount: draft.custom.get(m.id) ?? 0 }));
    }
    if (!total || !included.length) return included.map((m) => ({ id: m.id, amount: 0 }));
    const base = Math.floor(total / included.length);
    let rem = total - base * included.length;
    return included.map((m, i) => ({ id: m.id, amount: base + (i < rem ? 1 : 0) }));
  }

  function sync() {
    const total = Number(draft.amount) || 0;
    const shares = previewShares();
    const sum = shares.reduce((s, p) => s + p.amount, 0);
    const meIn = draft.included.has('me');
    const payerFriendWithoutMe = draft.payer === 'friend' && !meIn;
    const ok = draft.title.trim() && total > 0 && shares.length > 0 && !payerFriendWithoutMe && (draft.method === 'equal' || sum === total);
    go.disabled = !ok;
    if (payerFriendWithoutMe) {
      go.textContent = 'Include yourself when a friend pays';
    } else {
      go.textContent = shares.length ? `Split ${withSymbol(total, cur)} across ${shares.length}` : 'Split it';
    }
  }

  go.onclick = async () => {
    go.disabled = true; go.innerHTML = '<span class="btn__spinner"></span> Splitting…';
    const allShares = previewShares().filter((s) => s.amount > 0);
    // Separate 'me' share from friend shares — the server doesn't need 'me' as a friendshipId
    const friendShares = allShares.filter((s) => s.id !== 'me');
    const meShareAmt = allShares.find((s) => s.id === 'me')?.amount ?? 0;
    // Always include 'me' share in the payload so the server can track it
    const sharesToSend = [
      ...friendShares.map((s) => ({ friendshipId: s.id, amount: s.amount })),
      ...(meShareAmt > 0 ? [{ friendshipId: 'me', amount: meShareAmt }] : []),
    ];
    try {
      const res = await api.createSplit({
        groupId: g.id,
        title: draft.title.trim(),
        amount: Number(draft.amount),
        payer: draft.payer === 'me' ? { kind: 'me' } : { kind: 'friend', friendshipId: draft.payerFriend },
        shares: sharesToSend,
        method: draft.method,
      });
      buzz([12, 40, 16]);
      confetti({ count: 26, originY: 0.5 });
      sheet.close();
      const mine = meShareAmt;
      toastOk(draft.payer === 'me'
        ? `Split saved — ${plural(friendShares.length, 'friend now owes', 'friends now owe')} you their part.`
        : `Split saved — your ${withSymbol(mine, cur)} part is logged as owed to ${esc(friends.find((f) => f.id === draft.payerFriend)?.name || 'them')}.`);
      bus.emit('data-changed');
      navigate(`/group/${g.id}`);
    } catch (e) {
      go.disabled = false; sync();
      toastError(e.message);
    }
  };
}
