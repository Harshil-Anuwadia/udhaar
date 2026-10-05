/* Toasts: transient, actionable, non-blocking. */

import { h } from '../core/utils.js';
import { Icon } from './icons.js';

let layer = null;
const live = [];
const timers = new Map();

function ensureLayer() {
  if (!layer) {
    layer = h('div', { class: 'toaster', 'aria-label': 'Notifications' });
    document.body.append(layer);
  }
  return layer;
}

export function toast(message, { action, onAction, kind = '', duration = action || kind === 'error' ? 8000 : 4000 } = {}) {
  const el = h('div', { class: `toast ${kind ? `toast--${kind}` : ''}`, role: kind === 'error' ? 'alert' : 'status', 'aria-atomic': 'true' }, [
    h('span', { class: 'toast__icon', 'aria-hidden': 'true', html: Icon[kind === 'error' ? 'alert' : kind === 'ok' ? 'checkCircle' : 'info'] }),
    h('div', { class: 'toast__body' }, [
      h('span', { class: 'toast__msg', text: message }),
      action ? h('button', { class: 'toast__act', type: 'button', text: action, onclick: () => { dismiss(); onAction?.(); } }) : null,
    ]),
    h('button', { class: 'toast__close', type: 'button', 'aria-label': 'Dismiss notification', html: Icon.close, onclick: () => dismiss() }),
  ]);
  ensureLayer().append(el);
  live.push(el);
  if (live.length > 3) dismiss(live[0]);

  let remaining = duration;
  let started = 0;
  const paused = new Set();
  function resume(reason) {
    paused.delete(reason);
    if (paused.size || duration <= 0 || !live.includes(el) || timers.has(el)) return;
    started = Date.now();
    timers.set(el, setTimeout(() => dismiss(), remaining));
  }
  function pause(reason) {
    paused.add(reason);
    if (!timers.has(el)) return;
    clearTimeout(timers.get(el));
    timers.delete(el);
    remaining = Math.max(0, remaining - (Date.now() - started));
  }
  el.addEventListener('pointerenter', (event) => { if (event.pointerType !== 'touch') pause('hover'); });
  el.addEventListener('pointerleave', () => resume('hover'));
  el.addEventListener('focusin', () => pause('focus'));
  el.addEventListener('focusout', (event) => { if (!el.contains(event.relatedTarget)) resume('focus'); });
  resume();
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let suppressClick = false;
  el.addEventListener('click', (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  el.addEventListener('pointerdown', (event) => {
    if (event.isPrimary === false || event.button > 0) return;
    tracking = true; startX = event.clientX; startY = event.clientY; pause('touch');
  });
  el.addEventListener('pointermove', (event) => {
    if (!tracking) return;
    const dx = event.clientX - startX;
    if (Math.abs(dx) > Math.abs(event.clientY - startY) * 1.3) el.style.transform = `translateX(${dx}px)`;
  });
  const release = () => { tracking = false; el.style.transform = ''; resume('touch'); };
  el.addEventListener('pointercancel', release);
  el.addEventListener('pointerleave', release);
  el.addEventListener('pointerup', (event) => {
    if (!tracking) return;
    const dx = event.clientX - startX;
    release();
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
