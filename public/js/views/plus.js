/* Udhaar Plus: pay where the pain is, not where the paywall is. */

import { h, esc, buzz, money, symbol, withSymbol, plural } from '../core/utils.js';
import { Icon } from '../ui/icons.js';
import { api } from '../core/api.js';
import { state, setState, bus } from '../core/store.js';
import { mount, setHeader, showFab } from './view.js';
import { navigate } from '../core/router.js';
import { toast, toastOk, toastError } from '../ui/toast.js';
import { Sheet } from '../ui/sheet.js';
import { confetti } from '../ui/confetti.js';

const PRICE_IN = { monthly: 99, yearly: 799 };

const FEATURES = [
  { t: 'Unlimited people', d: 'Free includes 8. Plus has room for every flatmate, trip friend, and plus-one.' },
  { t: 'Every entry, kept', d: 'Free holds 120 lines. Plus keeps the old canteen tabs and every new one.' },
  { t: 'Unlimited groups', d: 'More than the two groups included with free.' },
];

export async function viewPlus({ outlet }) {
  mount(outlet, 'app', () => `<div class="card skeleton" style="height:220px"></div><div class="card skeleton" style="height:300px"></div>`);
  setHeader({ title: 'Udhaar Plus', back: true });
  showFab(false);

  const stats = state.stats || await api.stats().catch(() => null);
  if (stats) setState({ stats });
  mount(outlet, 'app', () => plusHTML(stats), (main) => bind(main, stats));
}

function plusHTML(stats) {
  const u = state.user;
  const cur = u.currency;
  const price = cur === 'INR' ? PRICE_IN : { monthly: 2, yearly: 16 };
  const t = stats?.totals;
  const isPlus = u.plan === 'plus';

  return `
  <section class="plus-hero anim-rise">
    <div class="row" style="gap:8px;margin-bottom:var(--s3)">
      <span style="color:var(--gold-bright)">${Icon.crown}</span>
      <span class="tiny" style="letter-spacing:.14em;text-transform:uppercase;font-weight:700;opacity:.7">Udhaar Plus</span>
    </div>
    <h2>More room for<br>more shared moments.</h2>
    <p>${isPlus
      ? 'Plus is active. The limits are off.'
      : t
        ? `You’re tracking ${withSymbol(t.owedToYou, cur)} owed to you across ${plural(t.activeFriends, 'person', 'people')}. Keep everyone and every line together.`
        : 'For when your ledger grows beyond the free plan.'}</p>
  </section>

  ${isPlus ? `
    <div class="card" style="padding:var(--s5);text-align:center">
      <div style="color:var(--gold);justify-self:center;margin-bottom:8px">${Icon.checkCircle}</div>
      <h3 class="serif" style="font-size:var(--fs-24)">Plus is active</h3>
      <p class="small muted" style="margin-top:6px">No limits on people, entries, or groups.</p>
      <button class="btn btn--quiet btn--block" style="margin-top:var(--s4);color:var(--due)" data-act="cancel">Manage plan</button>
    </div>` : `
  <section class="col anim-rise" style="gap:var(--s3);animation-delay:50ms">
    <button class="plan" data-plan="yearly" aria-pressed="true">
      <span class="grow">
        <span class="row" style="gap:8px"><b class="strong">Yearly</b><span class="tag tag--gold">Lower per month</span></span>
        <span class="plan__per">${symbol(cur)}${money(price.yearly, cur)} a year · ${symbol(cur)}${(price.yearly / 12).toFixed(cur === 'INR' ? 0 : 2)}/mo</span>
      </span>
      <span class="plan__price num">${symbol(cur)}${money(price.yearly, cur)}</span>
    </button>
    <button class="plan" data-plan="monthly" aria-pressed="false">
      <span class="grow"><b class="strong">Monthly</b><span class="plan__per">Cancel whenever. No email required.</span></span>
      <span class="plan__price num">${symbol(cur)}${money(price.monthly, cur)}</span>
    </button>
    <button class="btn btn--primary btn--lg btn--block" data-act="buy">${Icon.lock} Continue</button>
      <p class="tiny dim center">Demo checkout. No payment is taken; Continue only turns on Plus in this build.</p>
  </section>

  <section class="card anim-rise" style="padding:var(--s4) var(--s5);animation-delay:80ms">
    ${FEATURES.map((f) => `
      <div class="feature">
        <span class="feature__tick">${Icon.check}</span>
        <span class="grow"><b>${esc(f.t)}</b><span>${esc(f.d)}</span></span>
      </div>`).join('')}
  </section>

  <section class="card anim-rise" style="padding:var(--s4);background:var(--surface-2);animation-delay:110ms">
    <div class="row" style="gap:var(--s3);align-items:flex-start">
      <span style="color:var(--due);flex:0 0 auto">${Icon.info}</span>
      <p class="tiny muted" style="line-height:1.55">Seeing what you’re owed stays free. No ads in your ledger. Plus is only for a bigger book.</p>
    </div>
  </section>`}

  <section class="anim-rise">
    <div class="section-head"><h2>What free already includes</h2></div>
    <div class="list" style="padding:var(--s2) 0">
      ${['8 people in your book', '120 ledger lines', '2 groups', 'Unlimited nudges & share links', 'CSV + JSON export', 'Offline logging & sync', 'Dark mode'].map((x) => `
        <div class="setrow"><span class="setrow__icon" style="background:var(--settled-bg);color:var(--settled)">${Icon.check}</span><span class="setrow__label" style="font-weight:500">${esc(x)}</span></div>`).join('')}
    </div>
  </section>`;
}

function bind(main, stats) {
  let plan = 'yearly';
  main.addEventListener('click', async (e) => {
    const p = e.target.closest('[data-plan]');
    if (p) {
      plan = p.dataset.plan;
      buzz(6);
      main.querySelectorAll('[data-plan]').forEach((x) => x.setAttribute('aria-pressed', String(x === p)));
      return;
    }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    buzz(8);

    if (act.dataset.act === 'cancel') {
      await api.patchProfile({}).catch(() => {});
      toast('Billing isn’t connected in this demo. Plus stays active here.');
      return;
    }

    if (act.dataset.act === 'buy') return checkout(plan, act);
  });
}

function checkout(plan, btn) {
  const cur = state.user.currency;
  const price = (cur === 'INR' ? PRICE_IN : { monthly: 2, yearly: 16 })[plan];
  const body = h('div', { class: 'col', style: { gap: 'var(--s3)' } });
  body.innerHTML = `
    <div class="ledger-page" style="padding:var(--s5) var(--s5) var(--s5) calc(var(--s5) + 14px)">
      <div class="netcard__label">Udhaar Plus · ${plan}</div>
      <div class="netcard__amount"><span class="cur">${symbol(cur)}</span>${money(price, cur)}</div>
      <p class="small muted">${plan === 'yearly' ? 'Yearly plan selected.' : 'Monthly plan selected.'} No payment in this demo.</p>
    </div>
    <div class="card" style="padding:var(--s4);background:var(--surface-2)">
      <b class="small">Demo checkout</b>
      <p class="tiny muted" style="margin-top:4px;line-height:1.55">No payment provider is connected in this build. You won’t be charged. Confirm switches this account to Plus for testing.</p>
    </div>
  `;
  const go = h('button', { class: 'btn btn--gold btn--lg btn--block', type: 'button', html: `${Icon.lock} Confirm ${withSymbol(price, cur)}` });
  const s = new Sheet({ title: 'Confirm', body, footer: go });
  s.open();
  go.onclick = async () => {
    go.disabled = true; go.innerHTML = '<span class="btn__spinner"></span> Processing…';
    try {
      await api.patchProfile({ plan: 'plus' }).catch(() => {});
      await new Promise((r) => setTimeout(r, 620));
      const me = await api.me();
      const user = { ...me.user, plan: 'plus' };
      setState({ user });
      buzz([12, 40, 12, 40, 20]);
      confetti({ count: 46, originY: 0.4 });
      s.close();
      celebratePlus(user);
    } catch (e) {
      go.disabled = false; go.innerHTML = `${Icon.lock} Confirm ${withSymbol(price, cur)}`;
      toastError(e.message);
    }
  };
}

function celebratePlus(user) {
  const s = new Sheet({
    title: 'You’re Plus.',
    sub: 'Your people, entries, and groups are uncapped.',
    body: `<div class="empty" style="padding:var(--s6) 0">
      <div style="color:var(--gold-bright);width:72px;height:72px">${Icon.crown}</div>
      <h3>Room for the whole crew</h3>
      <p>Add everyone from the flat, the trip, and the group chat. Your history stays too.</p>
    </div>`,
    footer: [
      h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'button', text: 'Back to my ledger', onclick: () => { s.close(); navigate('/'); } }),
      h('button', { class: 'btn btn--quiet btn--block', type: 'button', text: 'Add everyone I’ve been leaving out', onclick: () => { s.close(); navigate('/'); import('./home.js').then((m) => m.openAddFriend()); } }),
    ],
  });
  s.open();
}
