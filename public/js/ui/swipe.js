/* Horizontal swipe reveal for ledger rows (touch-first, keyboard-accessible). */

import { buzz } from '../core/utils.js';

const OPEN_PX = 78;
let openRow = null;

export function bindSwipe(row, { actions = [], onAction } = {}) {
  const content = row.querySelector('.swipe__content');
  const actionsEl = row.querySelector('.swipe__actions');
  if (!content) return;

  if (actions.length && actionsEl) {
    actionsEl.innerHTML = actions
      .map((a) => `<button class="swipe__act swipe__act--${a.tone}" type="button" data-sw="${a.id}" aria-label="${a.label}">${a.icon}<span>${a.label}</span></button>`)
      .join('');
    actionsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sw]');
      if (!btn) return;
      buzz([8, 20, 8]);
      close();
      onAction?.(btn.dataset.sw, row);
    });
  }

  let startX = 0;
  let startY = 0;
  let dx = 0;
  let dragging = false;
  let axis = null;
  let movedX = false;
  let suppressClick = false;

  // A completed horizontal gesture must not also count as a tap on the row.
  row.addEventListener('click', (e) => {
    if (!suppressClick) return;
    suppressClick = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  const onDown = (e) => {
    if (e.target.closest('button:not(.swipe__content button),a,input')) return;
    const t = e.touches ? e.touches[0] : e;
    startX = t.clientX; startY = t.clientY; dx = 0; dragging = true; axis = null; movedX = false;
    content.style.transition = 'none';
  };

  const onMove = (e) => {
    if (!dragging) return;
    const t = e.touches ? e.touches[0] : e;
    const mx = t.clientX - startX;
    const my = t.clientY - startY;
    if (!axis) {
      if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
      axis = Math.abs(mx) > Math.abs(my) * 1.25 ? 'x' : 'y';
    }
    if (axis !== 'x') { dragging = false; content.style.transition = ''; return; }
    if (e.cancelable) e.preventDefault?.();
    if (Math.abs(mx) > 12) movedX = true;
    const base = row.classList.contains('is-open') ? -OPEN_PX : 0;
    dx = Math.max(-OPEN_PX * 1.25, Math.min(OPEN_PX * 0.35, base + mx));
    content.style.translate = `${dx}px 0`;
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    if (movedX) suppressClick = true;
    content.style.transition = '';
    content.style.translate = '';
    if (dx < -OPEN_PX * 0.45) {
      if (openRow && openRow !== row) openRow.classList.remove('is-open');
      row.classList.add('is-open');
      openRow = row;
      buzz(10);
    } else {
      row.classList.remove('is-open');
      if (openRow === row) openRow = null;
    }
    dx = 0;
  };

  const startMouse = (e) => {
    if (e.button !== 0) return;
    // No focus-scroll, no text selection while dragging a row.
    e.preventDefault();
    onDown(e);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', endMouse);
  };
  const endMouse = (e) => { onUp(e); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', endMouse); };

  row.addEventListener('touchstart', onDown, { passive: true });
  row.addEventListener('touchmove', onMove, { passive: false });
  row.addEventListener('touchend', onUp);
  row.addEventListener('touchcancel', onUp);
  row.addEventListener('mousedown', startMouse);
}

function close() {
  openRow?.classList.remove('is-open');
  openRow = null;
}

export const closeOpenSwipe = close;

document.addEventListener('click', (e) => {
  if (openRow && !openRow.contains(e.target)) close();
});
