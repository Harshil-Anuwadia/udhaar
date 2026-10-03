/* Udhaar Plus: pay where the pain is, not where the paywall is. */

import { h, esc, buzz, money, symbol, plural } from '../core/utils.js';
import { Icon } from '../ui/icons.js';
import { api } from '../core/api.js';
import { state, setState, bus } from '../core/store.js';
import { mount, setHeader, showFab } from './view.js';
import { navigate } from '../core/router.js';
import { toastError } from '../ui/toast.js';
import { Sheet, confirmSheet } from '../ui/sheet.js';

const PRICE_IN = { lifetime: 29 };
const PRICE_OTHER = { lifetime: 1 };

const FEATURES = [
  { t: 'Unlimited people', d: 'Free includes 8. Plus has room for every flatmate, trip friend, and plus-one.' },
  { t: 'Every entry, kept', d: 'Free holds 120 lines. Plus keeps the old canteen tabs and every new one.' },
  { t: 'Unlimited groups', d: 'More than the two groups included with free.' },
];

export async function viewPlus({ outlet, isCurrent = () => true }) {
  mount(outlet, 'app', () => `<div class="card skeleton" style="height:220px"></div><div class="card skeleton" style="height:300px"></div>`);
  setHeader({ title: 'Udhaar Plus', back: true });
  showFab(false);

  const stats = state.stats || await api.stats().catch(() => null);
  if (!isCurrent()) return;
  if (stats) setState({ stats });
  mount(outlet, 'app', () => plusHTML(stats), bind);
}

function plusHTML(stats) {
  const u = state.user;
  const cur = u.currency;
  const price = cur === 'INR' ? PRICE_IN : PRICE_OTHER;
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
      ? 'Your Plus preview is on. The limits are off.'
      : t
        ? `Your book has ${plural(t.friends, 'person', 'people')} and ${plural(t.openEntries, 'open line')}. Plus gives it more room to grow.`
        : 'For when your ledger grows beyond the free plan.'}</p>
  </section>

  ${isPlus ? `
    <div class="card" style="padding:var(--s5);text-align:center">
      <div style="color:var(--gold);justify-self:center;margin-bottom:8px">${Icon.checkCircle}</div>
      <h3 class="serif" style="font-size:var(--fs-24)">You're on Plus</h3>
      <p class="small muted" style="margin-top:6px">Lifetime access. No limits on people, entries, or groups.</p>
    </div>` : `
  <section class="col anim-rise" style="gap:var(--s3);animation-delay:50ms">
    <button class="plan" data-plan="lifetime" aria-pressed="true">
      <span class="grow">
        <span class="row" style="gap:8px"><b class="strong">Lifetime Access</b><span class="tag tag--gold">One-time payment</span></span>
        <span class="plan__per">Pay once, keep it forever. No subscriptions.</span>
      </span>
      <span class="plan__price num">${symbol(cur)}${money(price.lifetime, cur)}</span>
    </button>
    <button class="btn btn--primary btn--lg btn--block" data-act="buy">Upgrade to Plus</button>
    <p class="small muted center">Secure payment via Razorpay.</p>
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
        <div class="free-feature"><span class="free-feature__tick">${Icon.check}</span><span>${esc(x)}</span></div>`).join('')}
    </div>
  </section>`;
}

function bind(main) {
  main.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    buzz(8);

    if (act.dataset.act === 'cancel') return confirmSheet({
      title: 'Turn off Plus preview?',
      body: 'Your book stays intact. The free plan limits will apply again.',
      confirmLabel: 'Turn off preview',
      onConfirm: async () => {
        try {
          const { user } = await api.patchProfile({ plan: 'free' });
          setState({ user });
          bus.emit('data-changed');
          navigate('/plus');
        } catch (error) { toastError(error.message || 'Could not update your plan.'); }
      },
    });

    if (act.dataset.act === 'buy') {
      const btn = act;
      const originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="btn__spinner"></span> Connecting...';
      try {
        if (!window.Razorpay) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load payment gateway. Check your connection.'));
            document.head.appendChild(script);
          });
        }
        const order = await api.post('/api/me/create-order');
        
        const options = {
          key: order.key_id,
          amount: order.amount,
          currency: order.currency,
          name: 'Udhaar Plus',
          description: 'Lifetime Access',
          order_id: order.order_id,
          handler: async function (response) {
            btn.innerHTML = '<span class="btn__spinner"></span> Verifying...';
            try {
              const res = await api.post('/api/me/verify-payment', {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              });
              setState({ user: res.user });
              bus.emit('data-changed');
              buzz([10, 30, 10]);
              celebratePlus();
            } catch (err) {
              btn.disabled = false;
              btn.innerHTML = originalText;
              toastError('Payment verification failed. If money was deducted, contact support.');
            }
          },
          modal: {
            ondismiss: function () {
              btn.disabled = false;
              btn.innerHTML = originalText;
            }
          },
          theme: { color: '#C4372A' }
        };
        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function (response){
          toastError(response.error.description || 'Payment failed. Please try again.');
          btn.disabled = false;
          btn.innerHTML = originalText;
        });
        rzp.open();
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = originalText;
        toastError(err.message || 'Could not initiate payment.');
      }
    }
  });
}

function celebratePlus() {
  const s = new Sheet({
    title: 'Welcome to Plus.',
    sub: 'Your people, entries, and groups are uncapped.',
    body: `<div class="empty" style="padding:var(--s6) 0">
      <div style="color:var(--gold-bright);width:72px;height:72px">${Icon.crown}</div>
      <h3>Room for the whole crew</h3>
      <p>Add everyone from the flat, the trip, and the group chat. Your history stays too.</p>
    </div>`,
    footer: [
      h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'button', text: 'Back to my ledger', onclick: () => { s.close(); navigate('/'); } }),
      h('button', { class: 'btn btn--quiet btn--block', type: 'button', text: 'Add a person', onclick: () => { s.close(); navigate('/'); import('./home.js').then((m) => m.openAddFriend()); } }),
    ],
  });
  s.open();
}
