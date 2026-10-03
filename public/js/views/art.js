import { BrandMark } from '../ui/brand.js';

export { BrandMark };

export const LandingPreview = () => `
  <div class="landing-preview" aria-hidden="true">
    <div class="landing-preview__top">
      <span class="landing-preview__brand"><b>Example book</b></span>
      <span class="landing-preview__status">Sample lines</span>
    </div>
    <div class="landing-preview__balance">
      <span>Money still open</span>
      <strong>₹610</strong>
      <small>Across two people</small>
    </div>
    <div class="landing-preview__person">
      <span class="landing-preview__avatar">S</span>
      <span class="landing-preview__person-name"><b>Sam</b><small>Dinner last night</small></span>
      <strong>+₹850</strong>
    </div>
    <div class="landing-preview__person">
      <span class="landing-preview__avatar">A</span>
      <span class="landing-preview__person-name"><b>Arjun</b><small>Cab home</small></span>
      <strong>−₹240</strong>
    </div>
  </div>`;
export const LogoMark = `<span class="brand-lockup">${BrandMark()}<span class="wordmark">udhaar<span class="dotred">.</span></span></span>`;
export function Wordmark({ size = 'lg' } = {}) {
  return `<span class="brand-lockup ${size === 'sm' ? 'brand-lockup--sm' : ''}">${BrandMark()}<span class="wordmark">udhaar<span class="dotred">.</span></span></span>`;
}
