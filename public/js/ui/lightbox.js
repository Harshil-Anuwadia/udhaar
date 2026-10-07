/* Full-bleed photo viewer: tap anywhere (or Esc) to close. */
import { esc } from '../core/utils.js';
import { Icon } from './icons.js';

export function openLightbox(src, caption = '') {
  const el = document.createElement('div');
  el.className = 'lightbox';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', caption || 'Photo');
  el.tabIndex = -1;
  el.innerHTML = `
    <button class="lightbox__close" type="button" aria-label="Close photo">${Icon.close}</button>
    <img src="${esc(src)}" alt="${esc(caption || 'Attached photo')}">
    ${caption ? `<p class="lightbox__cap">${esc(caption)}</p>` : ''}
    <p class="lightbox__hint">tap to close</p>`;
  const previousFocus = document.activeElement;
  const background = [...document.body.children].filter(node => !['SCRIPT', 'STYLE', 'LINK'].includes(node.tagName)).map(node => ({ node, inert: node.inert }));
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    el.classList.add('is-out');
    setTimeout(() => {
      el.remove();
      background.forEach(({ node, inert }) => { if (node.isConnected) node.inert = inert; });
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    }, 180);
  };
  el.addEventListener('click', close);
  el.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); el.querySelector('button').focus(); }
  });
  background.forEach(({ node }) => { node.inert = true; });
  document.body.appendChild(el);
  el.querySelector('button').focus({ preventScroll: true });
  requestAnimationFrame(() => el.classList.add('is-open'));
  return close;
}
