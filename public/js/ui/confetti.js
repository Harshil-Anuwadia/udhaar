/* A short, tasteful burst. No library, no confetti cannon cliché. */

import { h } from '../core/utils.js';

const COLORS = ['#236646', '#70AD89', '#B1C8B6', '#343736', '#A4CEB2'];

export function confetti({ count = 26, originX = 0.5, originY = 0.4, spread = 0.9 } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = h('div', { class: 'confetti-layer', 'aria-hidden': 'true' });
  document.body.append(layer);

  for (let i = 0; i < count; i++) {
    const p = h('i', { class: 'confetti' });
    const dx = (Math.random() - 0.5) * 260 * spread;
    p.style.left = `${originX * 100}%`;
    p.style.top = `${originY * 100}%`;
    p.style.background = COLORS[i % COLORS.length];
    p.style.setProperty('--dx', `${dx}px`);
    p.style.setProperty('--rot', `${Math.random() * 900 - 450}deg`);
    p.style.animationDuration = `${900 + Math.random() * 900}ms`;
    p.style.animationDelay = `${Math.random() * 120}ms`;
    // every 5th piece is a strip of khata paper, some are dots
    if (i % 5 === 4) {
      p.style.background = 'var(--paper)';
      p.style.boxShadow = 'inset 0 0 0 1px rgb(23 21 15 / 0.18)';
      p.style.width = `${4 + Math.random() * 4}px`;
      p.style.height = `${12 + Math.random() * 10}px`;
    } else {
      p.style.width = `${5 + Math.random() * 5}px`;
      p.style.height = `${8 + Math.random() * 8}px`;
    }
    p.style.borderRadius = Math.random() < 0.3 ? '50%' : '1px';
    layer.append(p);
  }
  setTimeout(() => layer.remove(), 2200);
}
