/* Full-bleed photo viewer: tap anywhere (or Esc) to close. */
import { esc } from '../core/utils.js';

export function openLightbox(src, caption = '') {
  const el = document.createElement('div');
  el.className = 'lightbox';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', caption || 'Photo');
  el.innerHTML = `
    <img src="${esc(src)}" alt="${esc(caption || 'Attached photo')}">
    ${caption ? `<p class="lightbox__cap">${esc(caption)}</p>` : ''}
    <p class="lightbox__hint">tap to close</p>`;
  const close = () => { el.classList.add('is-out'); setTimeout(() => el.remove(), 180); };
  el.addEventListener('click', close);
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.addEventListener('keydown', function h(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', h); } });
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-open'));
  return close;
}
