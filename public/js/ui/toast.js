/* Toasts: transient, actionable, non-blocking. */

import { h } from '../core/utils.js';

let layer = null;
const live = [];

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
  ]);
  ensureLayer().append(el);
  live.push(el);
  if (live.length > 3) dismiss(live[0]);

  const timer = setTimeout(() => dismiss(el), duration);
  function dismiss(target = el) {
    clearTimeout(timer);
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
