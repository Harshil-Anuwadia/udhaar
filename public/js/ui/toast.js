/* Toasts: transient, actionable, non-blocking. */

import { h } from '../core/utils.js';

let layer = null;
const live = [];
const timers = new Map();

function ensureLayer() {
  if (!layer) {
    layer = h('div', { class: 'toaster', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'false' });
    document.body.append(layer);
  }
  return layer;
}

export function toast(message, { action, onAction, kind = '', duration = 3800 } = {}) {
  const el = h('div', { class: `toast ${kind ? `toast--${kind}` : ''}` }, [
    h('span', { class: 'toast__msg', text: message }),
    action ? h('button', { class: 'toast__act', type: 'button', text: action, onclick: () => { dismiss(); onAction?.(); } }) : null,
    h('button', { class: 'toast__close', type: 'button', 'aria-label': 'Dismiss notification', text: '×', onclick: () => dismiss() }),
  ]);
  ensureLayer().append(el);
  live.push(el);
  if (live.length > 3) dismiss(live[0]);

  const timer = setTimeout(() => dismiss(el), duration);
  timers.set(el, timer);
  let startX = 0;
  let startY = 0;
  let suppressClick = false;
  el.addEventListener('click', (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  el.addEventListener('pointerdown', (event) => { startX = event.clientX; startY = event.clientY; });
  el.addEventListener('pointerup', (event) => {
    const dx = event.clientX - startX;
    if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(event.clientY - startY) * 1.3) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 300);
      dismiss();
    }
  });
  function dismiss(target = el) {
    clearTimeout(timers.get(target));
    timers.delete(target);
    const i = live.indexOf(target);
    if (i === -1) return;
    live.splice(i, 1);
    target.classList.add('is-out');
    setTimeout(() => target.remove(), 240);
  }
  return dismiss;
}

export const toastError = (m, opts) => toast(m, { kind: 'error', ...opts });
export const toastOk = (m, opts) => toast(m, { kind: 'ok', ...opts });
