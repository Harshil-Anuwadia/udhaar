/* Udhaar Plus — not a sales screen. Just an honest explanation of what's inside.
   UX principles applied: Hick's Law (one plan, no choices), Cognitive Load (no
   comparison tables), Occam's Razor (simplest layout that communicates the offer),
   Mental Model (lifetime = one payment, clear immediately), Von Restorff (only the
   CTA stands out), Proximity (price block grouped), Peak-End Rule (effort on the
   post-purchase state, not on persuasion). */

import { h, esc, buzz, money, symbol } from '../core/utils.js';
import { Icon } from '../ui/icons.js';
import { api } from '../core/api.js';
import { state, setState, bus } from '../core/store.js';
import { mount, setHeader, showFab } from './view.js';
import { navigate } from '../core/router.js';
import { toastError, toastOk } from '../ui/toast.js';
import { Sheet } from '../ui/sheet.js';

const PRICE_IN    = { lifetime: 49 };
const PRICE_OTHER = { lifetime: 1 };

const pendingReceipts = new Map();
const receiptKey = owner => `udhaar.payment.${owner}`;
function pendingReceipt(owner) {
  if (!owner) return null;
  if (pendingReceipts.has(owner)) return pendingReceipts.get(owner);
  try { return JSON.parse(localStorage.getItem(receiptKey(owner)) || 'null'); } catch { return null; }
}
function rememberReceipt(owner, receipt) {
  pendingReceipts.set(owner, receipt);
  try { localStorage.setItem(receiptKey(owner), JSON.stringify(receipt)); }
  catch { toastError('Keep this screen open until payment is confirmed; this device could not store the receipt.'); }
}
function forgetReceipt(owner) {
  pendingReceipts.delete(owner);
  try { localStorage.removeItem(receiptKey(owner)); } catch {}
}

// What Plus unlocks — described honestly, no marketing superlatives
const UNLOCKS = [
  { t: 'Unlimited people',        d: 'Free includes 8. Plus has room for every flatmate, trip friend, and plus-one.' },
  { t: 'Every entry, kept',       d: 'Free holds 120 lines. Plus keeps the canteen tabs and every new one, forever.' },
  { t: 'Unlimited groups',        d: 'Beyond the 2 that come with free.' },
  { t: 'All future Plus features',d: 'Anything we add to Plus, you get.' },
];

/* ─── Razorpay loader ──────────────────────────────────────────────────────── */

let _rzpLoader = null;
function preloadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  if (_rzpLoader) return _rzpLoader;
  _rzpLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = resolve;
    script.onerror = () => {
      _rzpLoader = null;
      reject(new Error('Payment gateway unavailable. Check your connection or try disabling your ad blocker.'));
    };
    document.head.appendChild(script);
  });
  return _rzpLoader;
}

/* ─── View ─────────────────────────────────────────────────────────────────── */

export async function viewPlus({ outlet, isCurrent = () => true }) {
  setHeader({ title: 'Plus', back: true });
  showFab(false);
  mount(outlet, 'app', () => `<div class="card skeleton" style="height:260px"></div>`);

  // Start loading Razorpay now so it's ready when the user taps
  if (!pendingReceipt(state.user?.id)) preloadRazorpay().catch(() => {});

  if (!isCurrent()) return;
  mount(outlet, 'app', () => plusHTML(), bind);
}

/* ─── HTML ─────────────────────────────────────────────────────────────────── */

function plusHTML() {
  const u     = state.user;
  const cur   = u?.currency || 'INR';
  const price = cur === 'INR' ? PRICE_IN : PRICE_OTHER;
  const isPlus = u?.plan === 'plus';
  const pending = pendingReceipt(u?.id);

  // ── Already a Plus user: confirm their access clearly ──────────────────────
  if (isPlus) {
    return `
    <div class="plus-settled anim-rise">
      <div class="plus-settled__icon">${Icon.checkCircle}</div>
      <h2>You have Plus</h2>
      <p>Lifetime access. Your people, entries, and groups have no limits.</p>
      <a class="btn btn--outline btn--block" href="#/">Back to my ledger</a>
    </div>`;
  }

  // ── Not yet a Plus user: explain what it is, then offer it ─────────────────
  return `
  <div class="plus-page anim-rise">

    <div class="plus-page__intro">
      <h2>Udhaar Plus</h2>
      <p>A one-time payment that removes the limits from your book. No subscription, no renewal — pay once and it's yours.</p>
    </div>

    <ul class="plus-unlocks" aria-label="What Plus unlocks">
      ${UNLOCKS.map((u) => `
      <li class="plus-unlock">
        <span class="plus-unlock__tick" aria-hidden="true">${Icon.check}</span>
        <span class="plus-unlock__copy">
          <b>${esc(u.t)}</b>
          <span>${esc(u.d)}</span>
        </span>
      </li>`).join('')}
    </ul>

    <div class="plus-price-block">
      <span class="plus-price-block__amount num">${symbol(cur)}${money(price.lifetime, cur)}</span>
      <span class="plus-price-block__note">One-time · Lifetime access · No subscription</span>
    </div>

    <div class="plus-cta">
      <button class="btn btn--primary btn--lg btn--block" data-act="${pending ? 'confirm' : 'buy'}">
        ${pending ? 'Confirm payment' : `Unlock for ${symbol(cur)}${money(price.lifetime, cur)}`}
      </button>
      <p class="tiny muted center">${pending ? 'Your receipt is saved. Confirming retries this payment and does not charge again.' : 'Secure payment via Razorpay'}</p>
    </div>

  </div>`;
}

/* ─── Interactions ─────────────────────────────────────────────────────────── */

function bind(main) {
  main.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || !['buy', 'confirm'].includes(btn.dataset.act) || btn.disabled) return;
    const owner = state.user?.id;
    if (!owner) return navigate('/auth');
    const original = btn.innerHTML;
    const reset = () => {
      btn.disabled = false;
      btn.dataset.act = pendingReceipt(owner) ? 'confirm' : 'buy';
      btn.innerHTML = pendingReceipt(owner) ? 'Confirm payment' : original;
    };
    const confirm = async receipt => {
      rememberReceipt(owner, receipt);
      btn.disabled = true;
      btn.innerHTML = '<span class="btn__spinner"></span> Confirming…';
      try {
        if (state.user?.id !== owner) throw new Error('Sign back into the purchasing account to confirm this payment.');
        const res = await api.post('/api/me/verify-payment', receipt);
        if (state.user?.id !== owner) throw new Error('Sign back into the purchasing account to confirm this payment.');
        forgetReceipt(owner);
        setState({ user: res.user });
        bus.emit('data-changed');
        buzz([10, 30, 10]);
        showPlusWelcome();
      } catch (err) {
        reset();
        toastError(`${err.message || 'Confirmation is unavailable.'} Your receipt is saved. Retry confirmation; you will not be charged again.`);
      }
    };
    const pending = pendingReceipt(owner);
    if (pending) return confirm(pending);
    btn.disabled = true;
    btn.innerHTML = '<span class="btn__spinner"></span> Connecting…';
    try {
      await preloadRazorpay();
      const order = await api.post('/api/me/create-order');
      if (state.user?.id !== owner) throw new Error('The signed-in account changed. Open Plus again to continue.');
      const options = {
        key: order.key_id, amount: order.amount, currency: order.currency,
        name: 'Udhaar', description: 'Plus — Lifetime Access', order_id: order.order_id,
        handler: response => confirm({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        }),
        modal: { ondismiss: reset }, theme: { color: '#087F5B' },
      };
      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', response => {
        toastError(response.error.description || 'Payment failed. Please try again.');
        reset();
      });
      rzp.open();
    } catch (err) { reset(); toastError(err.message || 'Could not start payment. Try again.'); }
  });
}

/* ─── Post-purchase state (Peak-End Rule: this is where we invest effort) ─── */

function showPlusWelcome() {
  const s = new Sheet({
    title: 'You have Plus.',
    body: `
    <div class="plus-welcome">
      <div class="plus-welcome__icon">${Icon.checkCircle}</div>
      <p>Your book is now unlimited. Add as many people, entries, and groups as you need.</p>
      <p class="tiny muted" style="margin-top:var(--s2)">This is a lifetime purchase — it stays with your account forever.</p>
    </div>`,
    footer: [
      h('button', {
        class: 'btn btn--primary btn--lg btn--block', type: 'button', text: 'Back to my ledger',
        onclick: () => { s.close(); navigate('/'); },
      }),
    ],
  });
  s.open();
}
