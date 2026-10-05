import { EditorialArt } from './editorial-art.js';
/* Original editorial SVG illustrations: theme-aware paper and forest compositions.
   Shared geometry and token colours keep every scene crisp in both themes.
   Motion is finite, decorative, and fully disabled for reduced-motion users. */
const scene = (name, content) => `<svg class="art art-scene art-scene--${name}" viewBox="0 0 240 180" fill="none" stroke="var(--ink-2)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  ${content}
  <g class="art-spark" stroke="var(--brand-green)" stroke-width="2"><path d="M199 43v10m-5-5h10"/><path d="M34 113v6m-3-3h6"/></g>
</svg>`;
const coin = (x, y, r = 20) => `<circle cx="${x}" cy="${y}" r="${r}" fill="var(--brand-green)" stroke="var(--ink)"/><circle cx="${x}" cy="${y}" r="${r - 5}" stroke="var(--ink)" opacity=".35"/><path d="M${x-5} ${y-5}h10m-5-3v16m5-11c0 5-6 5-9 5l8 7" stroke="var(--ink)" stroke-width="1.8"/>`;
const star = '<path d="m120 59 5 12 13 2-10 9 3 13-11-7-11 7 3-13-10-9 13-2Z" fill="var(--brand-forest)" stroke="var(--brand-forest)"/>';

export const Art = {
  ...EditorialArt,
  pen: () => scene('pen', `
    <g transform="rotate(-6 112 93)"><rect x="61" y="30" width="99" height="122" rx="0" fill="var(--surface)" stroke="var(--line-2)"/><rect x="76" y="47" width="34" height="8" rx="0" fill="var(--credit-bg)" stroke="none"/><path d="M78 75h63m-63 15h44m-44 15h35" stroke="var(--ink-3)" opacity=".4"/><path class="art-trace" pathLength="1" d="m78 128 9 5 17-12" stroke="var(--settled)" stroke-width="3"/></g>
    <g class="art-lift"><path d="m132 107 44-63c3-4 7-4 11-1l7 5c4 3 4 7 1 11l-44 63-22 10Z" fill="var(--surface-3)" stroke="var(--ink-2)"/><path d="m138 99 19 13m-2-45 19 13" stroke="var(--ink-2)"/><path d="m129 132 5-17 10 7Z" fill="var(--ink-2)" stroke="none"/><path d="m173 57 10 7" stroke="var(--surface)" stroke-width="4"/></g>`),
  map: () => scene('map', `
    <path d="m37 58 51-17 59 16 49-16v98l-49 17-59-17-51 17Z" fill="var(--surface)" stroke="var(--line-2)"/>
    <path d="M88 41v98l59 17V57Z" fill="var(--credit-bg)" stroke="none"/><path d="M88 41v98m59-82v99" stroke="var(--credit)" opacity=".25"/>
    <path class="art-trace" pathLength="1" d="M57 118c-5-25 31-37 46-17s37 23 68-13" stroke="var(--credit)" stroke-width="2.5"/>
    <circle cx="57" cy="118" r="5" fill="var(--credit)" stroke="var(--surface)" stroke-width="3"/>
    <g class="art-lift"><path d="M171 39c-31 0-31 36 0 60 31-24 31-60 0-60Z" fill="var(--surface-3)" stroke="var(--ink-2)" stroke-width="2"/><circle cx="171" cy="60" r="8" fill="var(--ink-2)" stroke="none"/></g>`),
  clink: () => scene('clink', `
    <g class="art-drift"><path d="m45 77 54-9 8 54c2 17-41 25-45 7Z" fill="var(--credit-bg)" stroke="var(--credit)"/><path d="m99 79 11-2c22-4 26 25 4 29l-10 2" stroke="var(--credit)" stroke-width="3"/><path d="m52 89 46-8" stroke="var(--credit)" opacity=".4"/></g>
    <g class="art-lift"><path d="m139 68 54 9-17 52c-4 18-47 10-45-7Z" fill="var(--surface-3)" stroke="var(--ink-2)"/><path d="m140 79-11-2c-22-4-26 25-4 29l10 2" stroke="var(--ink-2)" stroke-width="3"/><path d="m143 81 44 8" stroke="var(--ink-2)" opacity=".4"/></g>
    <path class="art-trace" pathLength="1" d="M120 49V32m-15 22-9-13m39 13 9-13" stroke="var(--gold)" stroke-width="3"/>`),
  invite: () => scene('invite', `
    <g transform="rotate(-7 120 96)"><rect x="53" y="60" width="134" height="85" rx="0" fill="var(--surface)" stroke="var(--line-2)"/>
      <path d="m54 69 66 43 66-43M54 140l47-42m85 42-47-42" stroke="var(--credit)" stroke-opacity=".55"/>
      <circle cx="120" cy="110" r="13" fill="var(--credit-bg)" stroke="var(--credit)"/><path d="M114 110h12m-6-6v12" stroke="var(--credit)"/></g>
    <path class="art-trace" pathLength="1" d="M162 46c12-16 32-14 39-3" stroke="var(--gold)" stroke-width="2"/>`),
  chai: () => scene('chai', `
    <path d="M66 61h100l-10 68c-2 18-78 18-80 0Z" fill="var(--surface)" stroke="var(--line-2)"/>
    <path d="M166 72h13c28 0 27 36-2 36h-17" stroke="var(--ink-3)" stroke-width="3"/>
    <path d="M69 81h94l-7 44c-2 13-78 13-80 0Z" fill="var(--gold-bg)" stroke="var(--gold)" stroke-opacity=".75"/>
    <g class="chai-steam" style="--steam-delay:0ms"><path d="M91 53c-10-12 8-15 0-26" stroke="var(--gold)" stroke-width="2"/></g>
    <g class="chai-steam" style="--steam-delay:650ms"><path d="M117 52c-9-11 8-15 1-26" stroke="var(--gold)" stroke-width="2"/></g>
    <g class="chai-steam" style="--steam-delay:1300ms"><path d="M142 54c-9-11 8-16 1-27" stroke="var(--gold)" stroke-width="2"/></g>
    <path d="M68 149h111" stroke="var(--line-2)" stroke-width="3"/>`),
  unlock: () => scene('unlock', `
    <rect x="72" y="81" width="96" height="70" rx="0" fill="var(--surface)" stroke="var(--line-2)"/>
    <path d="M91 80V60c0-39 60-40 60 0" stroke="var(--credit)" stroke-width="6"/>
    <path d="M151 59v16" stroke="var(--credit)" stroke-width="6"/>
    <circle cx="120" cy="110" r="7" fill="var(--gold)" stroke="none"/><path d="M120 117v13" stroke="var(--gold)" stroke-width="4"/>
    <path class="art-trace" pathLength="1" d="M63 146h114" stroke="var(--gold)" stroke-width="2"/>`),
  split: () => scene('split', `
    <rect x="66" y="31" width="108" height="124" rx="0" fill="var(--surface)" stroke="var(--line-2)"/>
    <path d="M84 54h43m-43 16h72m-72 16h72m-72 16h72" stroke="var(--ink-3)" stroke-opacity=".65"/>
    <path d="M84 121h27m35 0h10" stroke="var(--credit)" stroke-width="2.5"/>
    <path class="art-trace" pathLength="1" d="M120 111v28m-12-12 12 12 12-12" stroke="var(--gold)" stroke-width="2.5"/>`),
  lost: () => scene('lost', `
    <circle cx="120" cy="89" r="58" fill="var(--surface)" stroke="var(--line-2)"/>
    <circle cx="120" cy="89" r="42" stroke="var(--ink-3)" stroke-opacity=".35"/>
    <path d="m137 70-10 33-26 11 10-33Z" fill="var(--credit-bg)" stroke="var(--credit)"/>
    <circle cx="120" cy="92" r="4" fill="var(--ink-2)" stroke="none"/>
    <path class="art-trace" pathLength="1" d="M87 153h66" stroke="var(--gold)" stroke-width="2"/>`),
  seal: () => scene('seal', `<path d="m97 106-9 45 29-15 28 15-3-46" fill="var(--surface-3)" stroke="var(--ink-2)"/><circle cx="120" cy="78" r="43" fill="var(--gold-bg)" stroke="var(--gold)"/><circle cx="120" cy="78" r="34" stroke="var(--gold)" stroke-dasharray="2 5"/><g class="art-lift">${star}</g>`),
  ring: () => '<svg class="art" viewBox="0 0 90 90" fill="none" aria-hidden="true"><circle cx="45" cy="45" r="30" stroke="currentColor" stroke-width="3" opacity=".2"/></svg>',
  arrow: () => '<svg class="art" viewBox="0 0 60 52" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 12c22 2 34 12 38 30m-8-8 8 10 4-13"/></svg>',
  underline: () => '<svg class="art" viewBox="0 0 88 20" preserveAspectRatio="none" fill="none" aria-hidden="true"><path d="M4 12c24-6 52-6 80-2" stroke="var(--ink-2)" stroke-width="3" stroke-linecap="round"/></svg>',
  tape: () => '<svg class="art" viewBox="0 0 92 28" aria-hidden="true"><path d="M6 10 84 4l4 16-80 6Z" fill="var(--gold-bg)"/></svg>',
};
