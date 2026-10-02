/* The Udhaar mark: an open U, two sides of the same ledger. */
export const BrandMark = () => `<svg class="brand-mark" viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
  <rect x="2" y="2" width="44" height="44" rx="14" fill="var(--ink)"/>
  <path class="brand-mark__stroke" pathLength="1" d="M14 14v12c0 12 20 12 20 0V14" stroke="var(--paper)" stroke-width="3.5" stroke-linecap="round"/>
  <path class="brand-mark__page" d="M20 14v11c0 3 2 5 4 5" stroke="var(--paper)" stroke-opacity=".45" stroke-width="2" stroke-linecap="round"/>
  <circle class="brand-mark__dot" cx="34" cy="13" r="4" fill="var(--due)" stroke="var(--ink)" stroke-width="2"/>
</svg>`;
