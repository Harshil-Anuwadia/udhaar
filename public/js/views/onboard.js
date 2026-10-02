/* Onboarding: three screens, under a minute, straight to the holy-shit moment. */

import { h, esc, buzz, money, symbol, withSymbol, avatarHTML, sleep } from '../core/utils.js';
import { Icon } from '../ui/icons.js';
import { Art } from '../ui/art.js';
import { openLightbox } from '../ui/lightbox.js';
import { api } from '../core/api.js';
import { state, setState, bus } from '../core/store.js';
import { mount } from './view.js';
import { navigate } from '../core/router.js';
import { toast, toastOk, toastError } from '../ui/toast.js';
import { Sheet } from '../ui/sheet.js';
import { confetti } from '../ui/confetti.js';
import { Wordmark, BrandMark } from './art.js';

const CURRENCIES = [
  ['INR', '₹', 'Rupee'], ['USD', '$', 'Dollar'], ['GBP', '£', 'Pound'], ['EUR', '€', 'Euro'],
  ['AED', 'AED', 'Dirham'], ['SGD', 'S$', 'SGD'], ['AUD', 'A$', 'AUD'], ['CAD', 'C$', 'CAD'],
];

const LIKELY = [
  { name: 'My roommate', hint: 'rent, wifi, groceries' },
  { name: 'The group trip', hint: 'the one nobody has settled' },
  { name: 'My best friend', hint: 'a hundred small things' },
  { name: 'Someone I lent money to', hint: 'and it’s been a while' },
];

export async function viewOnboard({ outlet }) {
  if (!state.user) return navigate('/auth');
  mount(outlet, 'bare', () => step1HTML(), (main) => bindStep1(main, outlet));
}

function stepper(n, total = 3) {
  return `<div class="setup-progress">${BrandMark()}<div class="stepper" aria-label="Step ${n} of ${total}">${Array.from({ length: total }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div></div>`;
}

function step1HTML() {
  const cur = state.user.currency || 'INR';
  return `
  <div class="auth onboard route-swap">
    ${stepper(1)}
    <div class="onboard__art">${Art.coins()}</div>
    <div class="onboard__intro">
      <h1>What money are we tracking?</h1>
      <p class="small muted" style="max-width:32ch">Pick your currency. You can switch it later.</p>
    </div>

    <div class="onboard__section" id="curGrid">
      <span class="field__label">Choose your default currency</span>
      <div class="currency-grid">
        ${CURRENCIES.map(([code, sym, name]) => `
          <button class="dirbtn" data-cur="${code}" aria-pressed="${code === cur}" style="text-align:center;padding:10px 4px">
            <b style="font-family:var(--font-mono);font-size:var(--fs-20)">${sym}</b>
            <span style="font-size:11px">${name}</span>
          </button>`).join('')}
      </div>
    </div>

    <div class="card" style="padding:var(--s3) var(--s4);background:var(--surface-2);margin-top:var(--s2)">
      <div class="row" style="gap:var(--s3);align-items:flex-start">
        <span style="color:var(--gold);flex:0 0 auto">${Icon.sparkle}</span>
        <p class="tiny" style="color:var(--ink-2);line-height:1.55">This isn’t just for money. That charger they borrowed in 2022? <b>Favours and promises</b> can live here too.</p>
      </div>
    </div>

    <div class="col onboard__actions">
      <button class="btn btn--primary btn--lg btn--block" data-act="next">Continue</button>
    </div>
  </div>`;
}

function bindStep1(main, outlet) {
  let cur = state.user.currency || 'INR';
  main.querySelectorAll('[data-cur]').forEach((b) => b.addEventListener('click', () => {
    cur = b.dataset.cur;
    buzz(6);
    main.querySelectorAll('[data-cur]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  main.querySelector('[data-act="next"]').addEventListener('click', async (event) => {
    buzz(10);
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const res = await api.patchProfile({ currency: cur });
      setState({ user: res.user });
      mount(outlet, 'bare', () => step2HTML(), (m) => bindStep2(m, outlet));
    } catch (error) {
      button.disabled = false;
      toastError(error.message || 'Could not save your currency. Try again.');
    }
  });
}

function step2HTML() {
  return `
  <div class="auth onboard route-swap">
    ${stepper(2)}
    <div class="onboard__art">${Art.duo()}</div>
    <div class="onboard__intro">
      <h1>Who’s in the story?</h1>
      <p class="small muted" style="max-width:34ch">Add one person. They don’t need an account.</p>
    </div>

    <div class="onboard__section">
      <div class="field">
        <label class="field__label" for="ob-name">Their name</label>
        <input class="input" id="ob-name" placeholder="Type their name…" maxlength="40" autocomplete="off" data-autofocus>
      </div>
      <div class="col" style="gap:2px" id="ob-sugg">
        ${LIKELY.map((l) => `
          <button class="pick" data-sugg="${esc(l.name)}" type="button">
            <span class="avatar avatar--40" style="background:var(--surface-3);color:var(--ink-3)"><span>${Icon.plus}</span></span>
            <span class="grow"><span class="pick__name">${esc(l.name)}</span><br><span class="pick__meta">${esc(l.hint)}</span></span>
            <span class="pick__chev" style="color:var(--ink-4)">${Icon.chevR}</span>
          </button>`).join('')}
      </div>
    </div>

    <div class="col onboard__actions">
      <button class="btn btn--primary btn--lg btn--block" data-act="next" disabled>Add them</button>
      <button class="btn btn--quiet btn--block" data-act="demo" style="color:var(--ink-3)">Skip — fill it with a demo ledger</button>
    </div>
  </div>`;
}

function bindStep2(main, outlet) {
  const input = main.querySelector('#ob-name');
  const next = main.querySelector('[data-act="next"]');
  let name = '';

  const sync = () => { next.disabled = name.trim().length < 1; };
  input.addEventListener('input', () => { name = input.value; sync(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && name.trim()) next.click(); });

  main.querySelectorAll('[data-sugg]').forEach((b) => b.addEventListener('click', () => {
    buzz(6);
    name = b.dataset.sugg;
    input.value = name;
    sync();
    input.focus();
  }));

  next.addEventListener('click', async () => {
    next.disabled = true; next.innerHTML = '<span class="btn__spinner"></span> Adding…';
    try {
      const res = await api.addFriend({ name: name.trim(), handle: '', note: '' });
      buzz([10, 30, 12]);
      bus.emit('data-changed');
      mount(outlet, 'bare', () => step3HTML(res.friend), (m) => bindStep3(m, outlet, res.friend));
    } catch (e) {
      next.disabled = false; next.textContent = 'Add them';
      toastError(e.message);
    }
  });

  main.querySelector('[data-act="demo"]').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true; b.innerHTML = '<span class="btn__spinner"></span> Writing four friends into your book…';
    try {
      await api.demo();
      await api.onboarded();
      const me = await api.me();
      setState({ user: me.user });
      buzz([10, 30, 10, 30, 18]);
      confetti({ count: 26, originY: 0.3 });
      navigate('/', { replace: true });
    } catch (err) {
      b.disabled = false; b.textContent = 'Skip — fill it with a demo ledger';
      toastError(err.message);
    }
  });
}

function step3HTML(friend) {
  const cur = state.user.currency;
  return `
  <div class="auth onboard route-swap">
    ${stepper(3)}
    <div class="onboard__art">${Art.pen()}</div>
    <div class="onboard__intro">
      <h1>Put the first one down</h1>
      <p class="small muted" style="max-width:34ch">Think of the last cab, coffee, or “I’ll get the next one.”</p>
    </div>

    <div class="card" style="padding:var(--s4);display:flex;gap:var(--s3);align-items:center">
      ${avatarHTML({ name: friend.name, seed: friend.avatar_seed, size: 48 })}
      <div class="grow"><b class="strong">${esc(friend.name)}</b><p class="tiny muted">in your book</p></div>
      <span class="tag tag--settled">added</span>
    </div>

    <div class="ledger-page" style="padding:var(--s5) var(--s5) var(--s5) calc(var(--s5) + 14px);margin-top:var(--s2)">
      <div class="netcard__label">Your first line</div>
      <div class="netcard__amount" style="color:var(--due)"><span class="cur">${symbol(cur)}</span><span id="ob-preview">0</span></div>
      <p class="netcard__verdict" id="ob-verdict">${esc(friend.name)} owes you this much.</p>
    </div>

    <div class="quickrow" id="ob-quick" style="margin-top:var(--s2)"></div>

    <div class="col onboard__actions">
      <button class="btn btn--primary btn--lg btn--block" data-act="finish">Log it and see my ledger</button>
      <button class="btn btn--quiet btn--block" data-act="skip" style="color:var(--ink-3)">I’ll log it later</button>
    </div>
  </div>`;
}

function bindStep3(main, outlet, friend) {
  const cur = state.user.currency;
  const quick = main.querySelector('#ob-quick');
  const preview = main.querySelector('#ob-preview');
  const verdict = main.querySelector('#ob-verdict');
  const amounts = cur === 'INR' ? [100, 250, 500, 1200, 2500] : [5, 10, 20, 50, 100];
  let amount = 0;
  let note = '';

  quick.innerHTML = amounts.map((a) => `<button class="quick" data-amt="${a}" type="button">+${symbol(cur)}${money(a, cur)}</button>`).join('')
    + `<button class="quick" data-amt="custom" type="button">Custom…</button>`;

  const paint = () => {
    preview.textContent = money(amount, cur);
    verdict.textContent = amount
      ? `${friend.name} owes you ${withSymbol(amount, cur)}${note ? ` for “${note}”` : ''}.`
      : `${friend.name} owes you this much.`;
  };

  quick.addEventListener('click', (e) => {
    const b = e.target.closest('[data-amt]');
    if (!b) return;
    buzz(6);
    if (b.dataset.amt === 'custom') {
      const sheet = new Sheet({
        title: `What does ${esc(friend.name)} owe?`,
        body: `<div class="col" style="gap:var(--s3)">
          <input class="input num" id="ob-custom" inputmode="numeric" placeholder="0" style="font-size:var(--fs-30);text-align:center;font-family:var(--font-mono)" data-autofocus>
          <input class="input" id="ob-note" placeholder="What was it for?" maxlength="140">
        </div>`,
        footer: h('button', { class: 'btn btn--primary btn--lg btn--block', text: 'Use this', onclick: () => {
          amount = Number(sheet.bodyEl.querySelector('#ob-custom').value.replace(/[^\d]/g, '')) || 0;
          note = sheet.bodyEl.querySelector('#ob-note').value.trim();
          sheet.close(); paint();
        } }),
      });
      sheet.open();
      return;
    }
    amount = Number(b.dataset.amt);
    paint();
  });

  main.querySelector('[data-act="finish"]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (!amount) {
      toast('Pick an amount — or tap “I’ll log it later”.');
      return buzz([14, 30, 14]);
    }
    btn.disabled = true; btn.innerHTML = '<span class="btn__spinner"></span> Writing it down…';
    try {
      await api.addEntry({ friendshipId: friend.id, kind: 'money', direction: 'owed_to_me', amount, note: note || 'First line in the book' });
      await api.onboarded();
      buzz([12, 40, 16]);
      confetti({ count: 34, originY: 0.4 });
      bus.emit('data-changed');
      const me = await api.me();
      setState({ user: me.user });
      navigate('/', { replace: true });
      setTimeout(() => toastOk(`First line written. ${friend.name} owes you ${withSymbol(amount, cur)}.`), 500);
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Log it and open my ledger';
      toastError(err.message);
    }
  });

  main.querySelector('[data-act="skip"]').addEventListener('click', async () => {
    buzz(6);
    try { await api.onboarded(); const me = await api.me(); setState({ user: me.user }); } catch {}
    navigate('/', { replace: true });
  });

  paint();
}

/* ---------------------------- join via deep link --------------------------- */

export async function viewJoin({ outlet, query }) {
  const token = query?.token;
  if (!token) {
    if (query?.code) return navigate(`/auth?code=${encodeURIComponent(query.code)}`);
    return navigate('/auth');
  }

  mount(outlet, 'bare', () => `<div class="auth"><div class="col" style="margin:auto;align-items:center;gap:var(--s4)"><div class="skeleton" style="width:96px;height:96px;border-radius:50%"></div><div class="skeleton" style="width:200px;height:24px"></div></div></div>`);

  let info;
  try { info = await api.invite(token); }
  catch (e) {
    return mount(outlet, 'bare', () => `
      <div class="auth route-swap">
        <div class="col" style="margin:auto;text-align:center;gap:var(--s3);align-items:center">
          <div style="width:72px;height:72px;color:var(--due)">${Icon.alert}</div>
          <h1 class="serif" style="font-size:var(--fs-30)">That link is dead</h1>
          <p class="small muted" style="max-width:30ch">${esc(e.message)} Ask them to send a fresh one — it takes two taps on their side.</p>
          <a class="btn btn--primary" href="#/auth">Go to Udhaar</a>
        </div>
      </div>`);
  }

  const cur = 'INR';
  mount(outlet, 'bare', () => `
    <div class="auth route-swap">
      <div class="col" style="align-items:center;text-align:center;gap:var(--s3);margin-top:var(--s6)">
        ${avatarHTML({ name: info.inviter?.name || '?', seed: info.inviter?.avatar_seed || 0, size: 96 })}
        <div>
          <p class="tiny" style="letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);font-weight:700">udhaar · shared tabs</p>
          <h1 class="serif" style="font-size:var(--fs-30);line-height:1.1;margin-top:6px">${esc(info.inviter?.name || 'Someone')} has a line<br>with your name on it</h1>
        </div>
        ${info.entry ? `
          <div class="ledger-page" style="width:100%;padding:var(--s5) var(--s5) var(--s5) calc(var(--s5) + 14px);text-align:left">
            <div class="netcard__label">${info.entry.direction === 'owed_by_me' ? 'You owe them' : 'They owe you'}</div>
            ${info.entry.kind === 'money'
              ? `<div class="netcard__amount" style="color:${info.entry.direction === 'owed_by_me' ? 'var(--due)' : 'var(--credit)'}"><span class="cur">${symbol(cur)}</span>${money(info.entry.amount, cur)}</div>`
              : `<div class="serif" style="font-size:var(--fs-24);padding:var(--s2) 0">${esc(info.entry.note || 'Something')}</div>`}
            <p class="small muted">${esc(info.entry.note || '')} ${info.entry.note ? '· ' : ''}logged ${new Date(info.entry.createdAt).toLocaleDateString()}</p>
            ${info.entry.photo ? `<button type="button" class="photocard" data-lightbox><img src="${esc(info.entry.photo)}" alt="Receipt"><span>attached receipt</span></button>` : ''}
          </div>` : `
          <p class="small muted" style="max-width:32ch">They keep a ledger of who owes what. Join and you’ll see your side of it — and you can confirm or dispute any line.</p>`}
        ${info.claimed ? `<span class="tag tag--settled">you already joined this ledger</span>` : ''}
      </div>

      <div style="margin-top:auto" class="col">
        <button class="btn btn--primary btn--lg btn--block" data-act="join">${state.user ? 'Link my ledger' : 'Join and see my side'}</button>
        ${state.user ? '' : `<button class="btn btn--quiet btn--block" data-act="later" style="color:var(--ink-3)">Not now</button>`}
        <p class="tiny center dim">Free. No card, no contacts, no ads.</p>
      </div>
    </div>`,
    (main) => {
      main.querySelector('[data-lightbox]')?.addEventListener('click', () => openLightbox(info.entry?.photo, info.entry?.note || 'Receipt'));
      main.querySelector('[data-act="join"]').addEventListener('click', async (e) => {
        const b = e.currentTarget;
        b.disabled = true; b.innerHTML = '<span class="btn__spinner"></span> Linking…';
        try {
          if (!state.user) {
            // Sign up inline, then claim.
            const sheet = quickSignup(info);
            return;
          }
          const res = await api.claim(token);
          buzz([12, 40, 16]);
          confetti({ count: 30, originY: 0.35 });
          toastOk(`Linked with ${res.inviter?.name || 'them'}.`);
          bus.emit('data-changed');
          navigate(`/friend/${res.friend.id}`, { replace: true });
        } catch (err) {
          b.disabled = false; b.textContent = state.user ? 'Link my ledger' : 'Join and see my side';
          toastError(err.message);
        }
      });
      main.querySelector('[data-act="later"]')?.addEventListener('click', () => navigate('/auth'));
    });

  function quickSignup(info) {
    const body = h('div', { class: 'col', style: { gap: 'var(--s4)' } });
    body.innerHTML = `
      <div class="field"><label class="field__label" for="j-name">Your name</label>
        <input class="input" id="j-name" placeholder="What they call you" maxlength="40" data-autofocus autocomplete="given-name"></div>
      <div class="field"><label class="field__label" for="j-pass">Passcode</label>
        <input class="input num" id="j-pass" type="password" inputmode="numeric" placeholder="6+ characters" autocomplete="new-password"></div>
      <p class="tiny dim">That’s it. No email, no phone, no verification code.</p>
    `;
    const go = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'button', text: 'Join the ledger' });
    const s = new Sheet({ title: `Join ${esc(info.inviter?.name || '')}’s ledger`, body, footer: go });
    s.open();
    go.onclick = async () => {
      const name = body.querySelector('#j-name').value.trim();
      const secret = body.querySelector('#j-pass').value;
      if (name.length < 2 || secret.length < 6) { buzz([14, 30, 14]); return toast('Name and a 6+ character passcode.'); }
      go.disabled = true; go.innerHTML = '<span class="btn__spinner"></span> Creating…';
      try {
        const res = await api.signup({ name, handle: '', secret, contact: '', currency: 'INR' });
        setState({ user: res.user });
        document.documentElement.dataset.theme = res.user.theme || 'system';
        bus.emit('signed-in', res.user);
        const claim = await api.claim(token);
        await api.onboarded().catch(() => {});
        buzz([12, 40, 16]);
        confetti({ count: 34, originY: 0.4 });
        s.close();
        toastOk(`You’re in. ${esc(claim.inviter?.name || 'They')} can see you’re live now.`);
        bus.emit('data-changed');
        navigate(`/friend/${claim.friend.id}`, { replace: true });
      } catch (e) {
        go.disabled = false; go.textContent = 'Join the ledger';
        toastError(e.message);
      }
    };
  }
}
