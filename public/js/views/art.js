import { BrandMark } from '../ui/brand.js';

export { BrandMark };

export const LogoMark = `<span class="brand-lockup">${BrandMark()}<span class="wordmark"><span class="wordmark__metal">udhaar</span><span class="dotred">.</span></span></span>`;
export function Wordmark({ size = 'lg' } = {}) {
  return `<span class="brand-lockup ${size === 'sm' ? 'brand-lockup--sm' : ''}">${BrandMark()}<span class="wordmark"><span class="wordmark__metal">udhaar</span><span class="dotred">.</span></span></span>`;
}
