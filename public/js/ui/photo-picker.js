/* One small, honest multi-photo picker for receipts and private Moments. */

import { h, fileToDataUrl } from '../core/utils.js';
import { Icon } from './icons.js';
import { toastError } from './toast.js';

export const PHOTO_LIMIT = 4;
const MAX_REQUEST_PHOTO_CHARS = 3_500_000;

export function photoPicker({ id, label, photos = [], onChange, inputAttrs = {} }) {
  const wrap = h('div', { class: 'photo-picker' });
  let selected = [...photos];
  const input = h('input', {
    class: 'file-input', id, type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true,
    ...inputAttrs,
  });
  const choose = h('label', { class: 'photo-picker__choose file-trigger', for: id });
  const grid = h('div', { class: 'photo-picker__grid' });
  const hint = h('p', { class: 'photo-picker__hint' });

  function render() {
    choose.innerHTML = `${Icon.camera}<span>${selected.length ? 'Add more photos' : label}</span><small>${selected.length}/${PHOTO_LIMIT}</small>`;
    hint.textContent = selected.length ? 'Tap a photo to remove it before saving.' : 'Choose up to four photos together, or add them one at a time.';
    grid.replaceChildren();
    selected.forEach((url, index) => {
      const tile = h('button', {
        class: 'photo-picker__tile', type: 'button',
        'aria-label': `Remove photo ${index + 1}`,
        onclick: () => { selected.splice(index, 1); onChange([...selected]); render(); },
      });
      const img = h('img', { alt: '' });
      img.src = url;
      tile.append(img, h('span', { class: 'photo-picker__remove', html: Icon.close, 'aria-hidden': 'true' }));
      grid.append(tile);
    });
    grid.hidden = selected.length === 0;
  }

  input.addEventListener('change', async () => {
    const files = [...(input.files || [])];
    input.value = '';
    if (!files.length) return;
    if (selected.length + files.length > PHOTO_LIMIT) {
      toastError(`Add up to ${PHOTO_LIMIT} photos. Remove one to make room.`);
      return;
    }
    try {
      const prepared = await Promise.all(files.map((file) => fileToDataUrl(file, 1000, 0.76)));
      if ([...selected, ...prepared].reduce((total, dataUrl) => total + dataUrl.length, 0) > MAX_REQUEST_PHOTO_CHARS) {
        toastError('These photos are too large together. Choose fewer or smaller images.');
        return;
      }
      selected = [...selected, ...prepared];
      onChange([...selected]);
      render();
    } catch (error) { toastError(error.message || 'Could not prepare those photos.'); }
  });

  wrap.append(input, choose, grid, hint);
  render();
  return wrap;
}
