/* Plus: one lifetime purchase, or confirmation of a saved receipt. */

import { h, esc, buzz, money, symbol } from '../core/utils.js';
import { Icon } from '../ui/icons.js';
import { api } from '../core/api.js';
import { state, setState, bus } from '../core/store.js';
import { mountProduct, setHeader, showFab } from './view.js';
import { navigate, currentPath } from '../core/router.js';
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
  { t: 'Unlimited people', d: 'Free includes 8 people' },
  { t: 'Unlimited entries', d: 'Free includes 120 ledger lines' },
  { t: 'Unlimited groups', d: 'Free includes 2 groups' },
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
  setHeader({ title: 'Udhaar Plus', back: true, backTo: '/you' });
  showFab(false);
  mountProduct(outlet, () => `<div class="card skeleton" style="height:260px"></div>`, null, { tabs: false });

  // Start loading Razorpay now so it's ready when the user taps
  if (!pendingReceipt(state.user?.id)) preloadRazorpay().catch(() => {});

  if (!isCurrent()) return;
  mountProduct(outlet, plusHTML, bind, { tabs: false });
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
    <div class="plus-settled" data-product-ready>
      <div class="plus-settled__icon">${Icon.checkCircle}</div>
      <h2>You have Plus</h2>
      <p>Lifetime access. Your people, entries, and groups have no limits.</p>
    </div><footer class="product-foot"><a class="btn btn--primary btn--block" href="#/">Back to my ledger</a></footer>`;
  }

  if (pending) {
    return `<div class="plus-settled" data-product-ready><div class="plus-settled__icon">${Icon.receipt}</div><h2>Finish activating Plus</h2><p>Your payment receipt is saved on this phone. Confirm it to activate lifetime access.</p></div><footer class="product-foot plus-cta"><button class="btn btn--primary btn--lg btn--block" data-act="confirm">Confirm payment</button><p>Uses your saved receipt. You won’t be charged again.</p></footer>`;
  }

  // ── Not yet a Plus user: explain what it is, then offer it ─────────────────
  return `
  <div class="plus-page" data-product-ready>

    <div class="plus-page__intro">
      <span class="plus-page__mark" aria-hidden="true">${Icon.crown}</span>
      <h2>Your book,<br>without limits.</h2>
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

  </div>
    <footer class="product-foot plus-cta">
      <div class="plus-price-block">
        <span class="plus-price-block__amount num">${symbol(cur)}${money(price.lifetime, cur)}</span>
        <span class="plus-price-block__note">Pay once · Lifetime access<br>No subscription or renewal</span>
      </div>
      <button class="btn btn--primary btn--lg btn--block" data-act="buy">
        Get lifetime Plus
      </button>
      <p class="tiny muted center">Secure payment via Razorpay</p>
    </footer>`;
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
        if (currentPath() === '/plus') {
          mountProduct(document.querySelector('#app'), plusHTML, bind, { tabs: false });
          showPlusWelcome();
        } else toastOk('Plus is active on your account.');
      } catch (err) {
        reset();
        if (currentPath() === '/plus' && state.user?.id === owner) mountProduct(document.querySelector('#app'), plusHTML, bind, { tabs: false });
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
