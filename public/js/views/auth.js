/* Landing + auth: the first three seconds decide everything. */

import { h, esc, buzz, sleep, setCurrency } from '../core/utils.js';
import { api, hasSession } from '../core/api.js';
import { setState, bus } from '../core/store.js';
import { toast, toastError } from '../ui/toast.js';
import { Sheet } from '../ui/sheet.js';
import { LandingPreview, Wordmark, BrandMark } from './art.js';
import { Art } from '../ui/art.js';
import { navigate } from '../core/router.js';
import { mount } from './view.js';

export function viewAuth({ outlet, query }) {
  return mount(outlet, 'bare', () => shell('home', query), (screen) => bindAuth(screen, query));
}

function shell(mode, query) {
  const inviteToken = query?.join || null;
  return `
  <div class="auth auth--landing route-swap">
    <header class="landing__nav">
      ${Wordmark({ size: 'sm' })}
    </header>

    <section class="landing__copy" aria-labelledby="landing-title">
      <h1 id="landing-title">Who paid<br>last time?</h1>
      <p>The cab, the split, the “I’ll send it later.” Keep track without searching the group chat.</p>
    </section>

    <div class="landing__visual">${LandingPreview()}</div>

    <div class="landing__actions auth__actions">
      ${inviteToken ? `<div class="install-nudge" id="inviteBanner"><span class="grow small"><b>You’ve got a ledger invite.</b> Join to see the shared line.</span></div>` : ''}
      <div class="landing__cta-row">
        <button class="btn btn--primary btn--block" data-act="signup">Start your ledger</button>
        <button class="btn btn--outline btn--block" data-act="login">Log in</button>
      </div>
      <button class="landing__demo" data-act="demo">Take a look first</button>
      <p class="landing__assurance">Free to start · No email needed</p>
    </div>
  </div>`;
}

export function bindAuth(outlet, query) {
  const inviteToken = query?.join || null;
  const inviteCode = query?.code || null;

  outlet.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    buzz(6);

    if (act === 'signup') return openSignup(outlet, inviteToken, inviteCode);
    if (act === 'login') return openLogin(outlet);
    if (act === 'demo') return startDemo(outlet, btn);
  });

  if (inviteCode) {
    const banner = outlet.querySelector('#inviteBanner');
    if (banner) banner.innerHTML = `<span class="grow small"><b>Invite code ${esc(inviteCode)}</b> will be applied when you join.</span>`;
  }

  if (inviteToken) {
    api.invite(inviteToken).then((info) => {
      const banner = outlet.querySelector('#inviteBanner');
      if (banner) {
        banner.innerHTML = `<span class="grow small"><b>${esc(info.inviter?.name || 'Someone')}</b> shared a ledger line with you. Join to see the details.</span>`;
      }
    }).catch(() => {});
  }
}

/* -------------------------------- sign up -------------------------------- */
/* Two in-place steps, one field-focus each. The document scrolls when needed. */

function openSignup(outlet, inviteToken, inviteCode = null) {
  const d = { name: '', handle: '', secret: '', contact: '' };
  const land = () => mount(outlet, 'bare', () => shell('home', { join: inviteToken, code: inviteCode }), (m) => bindAuth(m, { join: inviteToken, code: inviteCode }));

  const step1 = () => `
    <div class="auth authstep step-anim-r">
      <div class="authstep__head">
        <button class="authstep__back" data-back type="button">Back</button>
        ${stepperHTML(1)}
      </div>
      <div class="authstep__intro">
        <h1 class="authstep__prompt">Let’s put a name to it</h1>
        <p class="authstep__sub">Just your name for now. Your friends will see it on shared lines.</p>
      </div>
      <div class="authstep__form">
        <label class="field__label" for="su-name">Your name</label>
        <input class="input input--hero" id="su-name" name="name" autocomplete="given-name" placeholder="e.g. Riya" maxlength="40" data-autofocus>
        <span class="field__error" id="err-name"></span>
      </div>
      <div class="authstep__scene">${Art.book()}</div>
      <div class="authstep__foot">
        <button class="btn btn--primary btn--lg btn--block" data-next type="button">Continue</button>
      </div>
    </div>`;

  const step2 = () => `
    <div class="auth authstep step-anim-r">
      <div class="authstep__head">
        <button class="authstep__back" data-backstep type="button">Back</button>
        ${stepperHTML(2)}
      </div>
      <div class="authstep__intro">
        <h1 class="authstep__prompt">Keep your tabs yours</h1>
        <p class="authstep__sub">Make a passcode with at least six characters. A handle makes next time quicker.</p>
      </div>
      <div class="authstep__form">
        <label class="field__label" for="su-pass">Passcode</label>
        <input class="input input--hero input--pass num" id="su-pass" name="secret" type="password" inputmode="numeric" placeholder="••••••" autocomplete="new-password" maxlength="40" data-autofocus>
        <span class="field__error" id="err-secret"></span>
        <div class="row" style="gap:0;background:var(--surface-2);border:1.5px solid var(--line);border-radius:var(--r-md);padding-left:14px">
          <span class="num" style="color:var(--ink-4);font-size:var(--fs-16)">@</span>
          <input class="input" id="su-handle" name="handle" style="border:0;background:transparent;min-height:47px" placeholder="handle (optional)" maxlength="20" autocomplete="off" autocapitalize="none" spellcheck="false">
        </div>
        <span class="field__error" id="err-handle"></span>
        <details class="small" style="color:var(--ink-3)" ${inviteCode ? 'open' : ''}>
          <summary style="cursor:pointer;font-weight:600">Recovery or invite code (optional)</summary>
          <div class="col" style="gap:8px;margin-top:8px">
            <input class="input" id="su-contact" placeholder="Phone or email, just in case" autocomplete="off">
            <input class="input num" id="su-code" placeholder="invite code, e.g. UDH-7K2QF" value="${esc(inviteCode || '')}" autocapitalize="characters" autocomplete="off" spellcheck="false">
          </div>
        </details>
      </div>
      <div class="authstep__scene">${Art.seal()}</div>
      <div class="authstep__foot">
        ${inviteToken ? '<div class="install-nudge"><span class="grow small"><b>Shared ledger invite.</b> Your accounts will link when you join.</span></div>' : ''}
        <button class="btn btn--primary btn--lg btn--block" data-go type="button">Create my ledger</button>
      </div>
    </div>`;

  const show1 = () => mount(outlet, 'bare', step1, (m) => {
    m.querySelector('[data-back]')?.addEventListener('click', () => { buzz(6); land(); });
    const name = m.querySelector('#su-name');
    const next = () => {
      d.name = name.value.trim();
      if (d.name.length < 2) return fieldError(m, 'name', 'We need something to call you.');
      buzz(6); show2();
    };
    m.querySelector('[data-next]').addEventListener('click', next);
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') next(); });
  });

  const show2 = () => mount(outlet, 'bare', step2, (m) => {
    m.querySelector('[data-backstep]')?.addEventListener('click', () => { buzz(6); show1(); });
    const handle = m.querySelector('#su-handle');
    handle.addEventListener('input', () => { handle.value = handle.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''); });
    const go = async () => {
      clearErrors(m);
      d.secret = m.querySelector('#su-pass').value;
      d.handle = handle.value.trim();
      d.contact = m.querySelector('#su-contact')?.value.trim() || '';
      if (d.secret.length < 6) return fieldError(m, 'secret', 'At least 6 characters.');
      const btn = m.querySelector('[data-go]');
      btn.disabled = true;
      btn.innerHTML = '<span class="btn__spinner"></span> opening your ledger…';
      try {
        const res = await api.signup({
          name: d.name, handle: d.handle, secret: d.secret, contact: d.contact,
          currency: detectCurrency(),
          inviteCode: m.querySelector('#su-code')?.value.trim() || inviteCode || '',
        });
        buzz([10, 40, 14]);
        onSession(res, { invited: inviteToken });
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Create my ledger';
        if (e.code === 'handle_taken') fieldError(m, 'handle', e.message);
        else if (e.code === 'contact_taken') toastError(e.message);
        else toastError(e.message || 'Could not create your ledger.');
      }
    };
    m.querySelector('[data-go]').addEventListener('click', go);
    m.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') go(); });
  });

  show1();
}

/* --------------------------------- login --------------------------------- */

function openLogin(outlet) {
  const land = () => mount(outlet, 'bare', () => shell('home', {}), (m) => bindAuth(m, {}));
  const d = { id: '' };

  const step1 = () => `
    <div class="auth authstep step-anim-r">
      <div class="authstep__head">
        <button class="authstep__back" data-back type="button">Back</button>
        ${stepperHTML(1)}
      </div>
      <div class="authstep__intro">
        <h1 class="authstep__prompt">Your tabs missed you</h1>
        <p class="authstep__sub">Use the handle, phone or email linked to your account.</p>
      </div>
      <div class="authstep__form">
        <label class="field__label" for="li-id">Handle, phone or email</label>
        <input class="input input--hero" id="li-id" placeholder="@riya" autocapitalize="none" autocorrect="off" autocomplete="username" data-autofocus>
        <span class="field__error" id="err-id"></span>
      </div>
      <div class="authstep__scene">${Art.key()}</div>
      <div class="authstep__foot">
        <button class="btn btn--primary btn--lg btn--block" data-next type="button">Continue</button>
      </div>
    </div>`;

  const step2 = () => `
    <div class="auth authstep step-anim-r">
      <div class="authstep__head">
        <button class="authstep__back" data-backstep type="button">Back</button>
        ${stepperHTML(2)}
      </div>
      <div class="authstep__intro">
        <h1 class="authstep__prompt">One last thing</h1>
        <p class="authstep__sub">Signing in as ${esc(d.id)}.</p>
      </div>
      <div class="authstep__form">
        <label class="field__label" for="li-pass">Your passcode</label>
        <input class="input input--hero input--pass num" id="li-pass" type="password" inputmode="numeric" placeholder="••••••" autocomplete="current-password" maxlength="40" data-autofocus>
        <span class="field__error" id="err-secret"></span>
      </div>
      <div class="authstep__scene">${Art.unlock()}</div>
      <div class="authstep__foot">
        <button class="btn btn--primary btn--lg btn--block" data-go type="button">Sign in</button>
      </div>
    </div>`;

  const show1 = () => mount(outlet, 'bare', step1, (m) => {
    m.querySelector('[data-back]').addEventListener('click', () => { buzz(6); land(); });
    const input = m.querySelector('#li-id');
    const next = () => {
      d.id = input.value.trim();
      if (!d.id) return fieldError(m, 'id', 'Enter your handle.');
      buzz(6); show2();
    };
    m.querySelector('[data-next]').addEventListener('click', next);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') next(); });
  });

  const show2 = () => mount(outlet, 'bare', step2, (m) => {
    m.querySelector('[data-backstep]').addEventListener('click', () => { buzz(6); show1(); });
    const go = async () => {
      clearErrors(m);
      const secret = m.querySelector('#li-pass').value;
      const btn = m.querySelector('[data-go]');
      btn.disabled = true;
      btn.innerHTML = '<span class="btn__spinner"></span> opening…';
      try {
        const res = await api.login({ id: d.id, secret });
        buzz([10, 40, 14]);
        onSession(res, {});
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Sign in';
        if (e.code === 'bad_credentials') fieldError(m, 'secret', e.message);
        else toastError(e.message || 'Could not sign you in.');
      }
    };
    m.querySelector('[data-go]').addEventListener('click', go);
    m.querySelector('#li-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  });

  show1();
}

/* ------------------------------ demo ledger ------------------------------ */

async function startDemo(outlet, btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="btn__spinner"></span> Writing four friends into your book…';
  try {
    const res = await api.signup({
      name: 'You',
      handle: '',
      secret: `demo${Math.random().toString(36).slice(2, 10)}`,
      contact: '',
      currency: detectCurrency(),
      demo: true,
    });
    setState({ user: res.user });
    await api.demo();
    const me = await api.me();
    res.user = me.user;
    buzz([10, 30, 10, 30, 18]);
    toast('Demo ledger loaded. Nothing in it is real.', { kind: 'ok' });
    onSession(res, { demo: true });
  } catch (e) {
    btn.disabled = false;
    btn.textContent = original;
    toastError(e.message || 'Could not load the demo.');
  }
}

function stepperHTML(n, total = 2) {
  return `${BrandMark()}<div class="stepper stepper--auth" aria-label="Step ${n} of ${total}">${Array.from({ length: total }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>`;
}

/* -------------------------------- helpers -------------------------------- */

function onSession(res, opts = {}) {
  setState({ user: res.user, theme: res.user.theme || 'system' });
  setCurrency(res.user.currency);
  document.documentElement.dataset.theme = res.user.theme || 'system';
  bus.emit('signed-in', res.user);
  if (!res.user.onboarded && !opts.demo) navigate('/onboard', { replace: true });
  else navigate('/', { replace: true });
}

function detectCurrency() {
  try {
    const loc = navigator.language || 'en-IN';
    const region = loc.split('-')[1]?.toUpperCase();
    const map = { IN: 'INR', US: 'USD', GB: 'GBP', AE: 'AED', SG: 'SGD', AU: 'AUD', CA: 'CAD', DE: 'EUR', FR: 'EUR', IE: 'EUR' };
    if (map[region]) return map[region];
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz.startsWith('Asia/Kolkata') || tz.startsWith('Asia/Calcutta')) return 'INR';
  } catch {}
  return 'INR';
}

const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 14) || 'you';

function clearErrors(form) {
  form.querySelectorAll('.field__error').forEach((el) => { el.textContent = ''; });
  form.querySelectorAll('.input').forEach((el) => el.removeAttribute('aria-invalid'));
}

function fieldError(form, field, msg) {
  const el = form.querySelector(`#err-${field}`);
  if (el) el.textContent = msg;
  const idMap = { name: '#su-name', handle: '#su-handle', secret: '[id$="-pass"]', id: '#li-id' };
  const input = form.querySelector(idMap[field] || 'input');
  input?.setAttribute('aria-invalid', 'true');
  input?.focus();
  buzz([14, 30, 14]);
}
