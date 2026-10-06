/* Udhaar Plus */

import { h, esc, buzz, money, symbol } from '../core/utils.js';
import { Icon } from '../ui/icons.js';
import { api } from '../core/api.js';
import { state, setState, bus } from '../core/store.js';
import { mount, setHeader, showFab } from './view.js';
import { navigate } from '../core/router.js';
import { toastError } from '../ui/toast.js';
import { Sheet } from '../ui/sheet.js';

const PRICE_IN    = { lifetime: 49 };
const PRICE_OTHER = { lifetime: 1 };

const UNLOCKS = [
  'Unlimited people',
  'Every entry saved',
  'Unlimited groups',
  'Future Plus updates',
];

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
      reject(new Error('Payment unavailable. Check your connection.'));
    };
    document.head.appendChild(script);
  });
  return _rzpLoader;
}

export async function viewPlus({ outlet, isCurrent = () => true }) {
  setHeader({ title: 'Plus', back: true });
  showFab(false);
  preloadRazorpay().catch(() => {});
  if (!isCurrent()) return;
  mount(outlet, 'app', () => plusHTML(), bind);
}

function plusHTML() {
  const u      = state.user;
  const cur    = u?.currency || 'INR';
  const price  = cur === 'INR' ? PRICE_IN : PRICE_OTHER;
  const isPlus = u?.plan === 'plus';

  if (isPlus) {
    return `
    <div class="plus-settled anim-rise">
      <div class="plus-settled__icon">${Icon.checkCircle}</div>
      <h2>You have Plus</h2>
      <p>Lifetime access. No limits on people, entries, or groups.</p>
      <a class="btn btn--outline btn--block" href="#/">Back to my ledger</a>
    </div>`;
  }

  return `
  <div class="plus-page anim-rise">
    <div class="plus-page__top">
      <p class="plus-page__label">What you get</p>
      <ul class="plus-unlocks">
        ${UNLOCKS.map((label) => `
        <li class="plus-unlock">
          <span class="plus-unlock__tick" aria-hidden="true">${Icon.check}</span>
          <span>${esc(label)}</span>
        </li>`).join('')}
      </ul>
    </div>

    <div class="plus-page__bottom">
      <div class="plus-price-block">
        <span class="plus-price-block__amount num">${symbol(cur)}${money(price.lifetime, cur)}</span>
        <span class="plus-price-block__note">One-time payment. No subscription.</span>
      </div>
      <button class="btn btn--primary btn--lg btn--block" data-act="buy">
        Unlock for ${symbol(cur)}${money(price.lifetime, cur)}
      </button>
      <p class="tiny muted center">Paid via Razorpay</p>
    </div>
  </div>`;
}

function bind(main) {
  main.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]');
    if (!act) return;

    if (act.dataset.act === 'buy') {
      const btn = act;
      const original = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="btn__spinner"></span> Connecting…';

      try {
        await preloadRazorpay();
        const order = await api.post('/api/me/create-order');

        const options = {
          key:         order.key_id,
          amount:      order.amount,
          currency:    order.currency,
          name:        'Udhaar',
          description: 'Plus. Lifetime access.',
          order_id:    order.order_id,
          handler: async (response) => {
            btn.innerHTML = '<span class="btn__spinner"></span> Confirming…';
            try {
              const res = await api.post('/api/me/verify-payment', {
                razorpay_order_id:   response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature:  response.razorpay_signature,
              });
              setState({ user: res.user });
              bus.emit('data-changed');
              buzz([10, 30, 10]);
              showPlusWelcome();
            } catch (err) {
              btn.disabled = false;
              btn.innerHTML = original;
              toastError('Verification failed. Contact support if money was deducted.');
            }
          },
          modal: {
            ondismiss: () => {
              btn.disabled = false;
              btn.innerHTML = original;
            },
          },
          theme: { color: '#087F5B' },
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', (response) => {
          toastError(response.error.description || 'Payment failed. Try again.');
          btn.disabled = false;
          btn.innerHTML = original;
        });
        rzp.open();

      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = original;
        toastError(err.message || 'Could not start payment. Try again.');
      }
    }
  });
}

function showPlusWelcome() {
  const s = new Sheet({
    title: 'You have Plus.',
    body: `
    <div class="plus-welcome">
      <p>Your book now has no limits. Add as many people, entries, and groups as you need.</p>
    </div>`,
    footer: [
      h('button', {
        class: 'btn btn--primary btn--lg btn--block', type: 'button', text: 'Go to my ledger',
        onclick: () => { s.close(); navigate('/'); },
      }),
    ],
  });
  s.open();
}
