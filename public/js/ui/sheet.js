/* Bottom sheet with drag-to-dismiss, focus trap, stack support. */

import { h, buzz } from '../core/utils.js';

const stack = [];
let scrimEl = null;

function scrim() {
  if (!scrimEl) {
    scrimEl = h('div', { class: 'scrim', 'aria-hidden': 'true' });
    scrimEl.addEventListener('click', () => top()?.close());
    document.body.append(scrimEl);
  }
  return scrimEl;
}

const top = () => stack[stack.length - 1] ?? null;

function sync() {
  const t = top();
  scrim().classList.toggle('is-open', !!t);
  document.body.style.overflow = t ? 'hidden' : '';
  // The scrim always sits exactly one layer below the topmost sheet.
  scrim().style.zIndex = t ? String(40 + (stack.length - 1) * 2) : '40';
}

export class Sheet {
  constructor({ title, sub, body, footer, onClose, size = 'auto', dismissible = true }) {
    this.onCloseCb = onClose;
    this.dismissible = dismissible;

    this.el = h('div', {
      class: 'sheet',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': typeof title === 'string' ? title : 'Dialog',
    });

    this.grab = h('div', { class: 'sheet__grab' });
    if (dismissible) this.grab.addEventListener('click', () => this.close());

    const head = h('div', { class: 'sheet__head' });
    if (title || sub) {
      const t = h('div', { class: 'grow' }, [
        title ? h('div', { class: 'sheet__title', html: title }) : null,
        sub ? h('div', { class: 'sheet__sub', html: sub }) : null,
      ]);
      head.append(t);
    }
    if (dismissible) {
      head.append(h('button', {
        class: 'iconbtn', 'aria-label': 'Close', type: 'button',
        onclick: () => this.close(),
        html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
      }));
    }

    this.bodyEl = h('div', { class: 'sheet__body' });
    if (typeof body === 'string') this.bodyEl.innerHTML = body;
    else if (body) this.bodyEl.append(...[].concat(body));

    this.el.append(this.grab, head);
    if (this.bodyEl.childNodes.length) this.el.append(this.bodyEl);

    if (footer) {
      this.footEl = h('div', { class: 'sheet__foot' });
      if (typeof footer === 'string') this.footEl.innerHTML = footer;
      else this.footEl.append(...[].concat(footer));
      this.el.append(this.footEl);
    }

    this.#bindDrag();
  }

  #bindDrag() {
    if (!this.dismissible) return;
    let startY = null;
    let dy = 0;
    let dragging = false;

    const onDown = (e) => {
      // Only drag from the grabber or from the top of a non-scrollable body.
      const fromGrab = this.grab.contains(e.target);
      const bodyAtTop = this.bodyEl.scrollTop <= 0;
      if (!fromGrab && !bodyAtTop) return;
      if (!fromGrab && e.target.closest('input,textarea,select,button,a,[data-nodrag]')) return;
      dragging = true;
      startY = e.touches ? e.touches[0].clientY : e.clientY;
      this.el.style.transition = 'none';
    };
    const onMove = (e) => {
      if (!dragging) return;
      const y = e.touches ? e.touches[0].clientY : e.clientY;
      dy = Math.max(0, y - startY);
      if (dy > 4 && e.cancelable) e.preventDefault?.();
      this.el.style.translate = `-50% ${dy}px`;
      scrim().style.opacity = String(Math.max(0.15, 1 - dy / 420));
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      this.el.style.transition = '';
      this.el.style.translate = '';
      scrim().style.opacity = '';
      if (dy > 110) { buzz(10); this.close(); }
      dy = 0; startY = null;
    };

    this.el.addEventListener('touchstart', onDown, { passive: true });
    this.el.addEventListener('touchmove', onMove, { passive: false });
    this.el.addEventListener('touchend', onUp);
    this.el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    this._cleanup = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }

  open() {
    const s = scrim();
    s.style.zIndex = String(40 + stack.length * 2);
    this.el.style.zIndex = String(41 + stack.length * 2);
    document.body.append(this.el);
    stack.push(this);
    sync();
    requestAnimationFrame(() => {
      this.el.classList.add('is-open');
      const focusable = this.el.querySelector('[data-autofocus],input,textarea,button');
      focusable?.focus({ preventScroll: true });
    });
    this._esc = (e) => { if (e.key === 'Escape' && top() === this) this.close(); };
    window.addEventListener('keydown', this._esc);
    return this;
  }

  close(result) {
    const i = stack.indexOf(this);
    if (i === -1) return;
    stack.splice(i, 1);
    this.el.classList.remove('is-open');
    sync();
    window.removeEventListener('keydown', this._esc);
    this._cleanup?.();
    setTimeout(() => { this.el.remove(); this.onCloseCb?.(result); }, 260);
  }

  setBody(content) {
    this.bodyEl.innerHTML = '';
    if (typeof content === 'string') this.bodyEl.innerHTML = content;
    else this.bodyEl.append(...[].concat(content));
    // Sheets created without a body keep bodyEl detached; attach it on first
    // use so async skeletons-then-content flows actually render.
    if (!this.bodyEl.isConnected) {
      const foot = this.el.querySelector('.sheet__foot');
      if (foot) this.el.insertBefore(this.bodyEl, foot);
      else this.el.append(this.bodyEl);
    }
  }

  setFooter(content) {
    if (!this.footEl) {
      this.footEl = h('div', { class: 'sheet__foot' });
      this.el.append(this.footEl);
    }
    this.footEl.innerHTML = '';
    if (typeof content === 'string') this.footEl.innerHTML = content;
    else this.footEl.append(...[].concat(content));
  }
}

export function openSheet(opts) { return new Sheet(opts).open(); }

/* ------------------------------ action sheet ----------------------------- */

export function actionSheet({ title, sub, actions }) {
  const list = h('div', { class: 'col', style: { gap: '2px' } });
  const sheet = new Sheet({ title, sub, body: list });
  for (const a of actions) {
    const btn = h('button', {
      class: 'setrow',
      type: 'button',
      style: a.danger ? 'color:var(--due)' : '',
      onclick: () => { buzz(6); sheet.close(); a.onSelect?.(); },
    }, [
      a.icon ? h('span', { class: 'setrow__icon', html: a.icon, style: a.danger ? 'background:var(--due-bg);color:var(--due)' : '' }) : null,
      h('span', { class: 'grow' }, [
        h('span', { class: 'setrow__label', html: a.label }),
        a.hint ? h('span', { class: 'setrow__hint', html: a.hint }) : null,
      ]),
      a.value ? h('span', { class: 'setrow__value', html: a.value }) : null,
    ]);
    list.append(btn);
  }
  return sheet.open();
}

/* --------------------------------- confirm -------------------------------- */

export function confirmSheet({ title, body, confirmLabel = 'Do it', danger = false, onConfirm }) {
  const sheet = new Sheet({
    title,
    body: `<p style="color:var(--ink-2);font-size:var(--fs-14);line-height:1.5">${body}</p>`,
    footer: [
      h('button', {
        class: `btn btn--block ${danger ? 'btn--due' : 'btn--primary'}`,
        type: 'button',
        text: confirmLabel,
        onclick: () => { buzz([8, 30, 8]); sheet.close(); onConfirm?.(); },
      }),
      h('button', { class: 'btn btn--block btn--quiet', type: 'button', text: 'Cancel', onclick: () => sheet.close() }),
    ],
  });
  return sheet.open();
}

export const closeAllSheets = () => [...stack].reverse().forEach((s) => s.close());

/** Synchronous teardown: nodes leave the DOM this tick (route re-entries). */
export function hardCloseAllSheets() {
  while (stack.length) {
    const s = stack.pop();
    s.el?.remove();
  }
  sync();
}
export const sheetDepth = () => stack.length;
