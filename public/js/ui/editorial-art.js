/* Product illustrations, not interface glyphs. Inline SVG follows the user's palette. */
const scene = (name, content) => `<svg class="art art-scene art-scene--${name}" viewBox="0 0 320 240" fill="none" aria-hidden="true" focusable="false">
  ${content}
</svg>`;
const lines = '<path d="M0 0h73m-73 13h49m-49 13h63" stroke="var(--ink-3)" stroke-width="2" opacity=".5"/>';

export const EditorialArt = {
  book: () => scene('book', `
    <path d="M54 194h220" stroke="var(--line-2)"/>
    <g transform="rotate(-7 145 122)">
      <path d="M76 44h139v161H76z" fill="var(--credit-bg)" stroke="var(--credit)"/>
      <path d="M84 36h139v161H84z" fill="var(--surface)" stroke="var(--ink-2)" stroke-width="1.5"/>
      <path d="M102 37v159" stroke="var(--line-2)"/>
      <path d="M119 61h68v32h-68z" fill="var(--credit)"/>
      <path d="M132 70v10h11V70m13 0v10h18" stroke="var(--paper)" stroke-width="2"/>
      <g transform="translate(119 116)">${lines}</g>
      <path class="art-trace" pathLength="1" d="M119 170h63" stroke="var(--credit)" stroke-width="3"/>
      <path d="M196 36v67l10-8 10 8V36" fill="var(--brand-green)"/>
    </g>
    <g class="art-lift"><path d="M201 143h65v43h-65z" fill="var(--credit)"/>
      <path d="m220 164 8 8 19-20" stroke="var(--paper)" stroke-width="2.5"/>
    </g>`),
  duo: () => scene('duo', `
    <path d="M63 198h192M160 47v140" stroke="var(--line-2)" stroke-dasharray="3 6"/>
    <g class="art-drift"><path d="M40 56h106v131H40z" fill="var(--surface)" stroke="var(--ink-2)" stroke-width="1.5"/>
      <path d="M53 70h80v59H53z" fill="var(--credit-bg)"/>
      <circle cx="93" cy="91" r="11" fill="var(--credit)"/><path d="M71 121v-4c0-23 44-23 44 0v4" fill="var(--credit)"/>
      <path d="M55 149h53m-53 12h32" stroke="var(--ink-3)" stroke-width="2"/>
    </g>
    <g class="art-lift"><path d="M174 40h106v131H174z" fill="var(--surface)" stroke="var(--ink-2)" stroke-width="1.5"/>
      <path d="M187 54h80v59h-80z" fill="var(--surface-3)"/>
      <circle cx="227" cy="75" r="11" fill="var(--ink-2)"/><path d="M205 105v-4c0-23 44-23 44 0v4" fill="var(--ink-2)"/>
      <path d="M189 133h53m-53 12h32" stroke="var(--ink-3)" stroke-width="2"/>
    </g>
    <path class="art-trace" pathLength="1" d="M130 199h62v-39m-7 7 7-7 7 7" stroke="var(--credit)" stroke-width="2"/>`),
  coins: () => scene('coins', `
    <path d="M41 200h239" stroke="var(--line-2)"/>
    <g transform="rotate(7 198 117)"><path d="M148 35h102v158H148z" fill="var(--surface)" stroke="var(--ink-2)" stroke-width="1.5"/>
      <path d="M163 56h42m-42 13h69" stroke="var(--ink-3)" stroke-width="2"/>
      <path class="art-trace" pathLength="1" d="m164 130 20-26 16 13 31-38" stroke="var(--credit)" stroke-width="3"/>
      <path d="M163 154h69m-69 15h27" stroke="var(--line-2)" stroke-width="2"/>
    </g>
    <path d="M48 120h130v68H48z" fill="var(--credit-bg)" stroke="var(--credit)" stroke-width="1.5"/>
    <path d="M56 129h114v50H56z" stroke="var(--credit)" opacity=".4"/>
    <circle cx="113" cy="154" r="19" fill="var(--credit)"/>
    <path d="M108 153h10m-5-5v12" stroke="var(--paper)" stroke-width="2"/>
    <g class="art-lift"><circle cx="102" cy="101" r="28" fill="var(--surface)" stroke="var(--ink-2)" stroke-width="1.5"/><circle cx="102" cy="101" r="21" stroke="var(--line-2)"/><path d="M100 92v18m-5-14 5-4h3" stroke="var(--credit)" stroke-width="2"/></g>`),
  key: () => scene('key', `
    <path d="M99 47h125v156H99z" fill="var(--surface)" stroke="var(--ink-2)" stroke-width="1.5"/>
    <path d="M117 68h61m-61 13h87m-87 101h44" stroke="var(--line-2)" stroke-width="2"/>
    <g class="art-lift" transform="rotate(-24 156 131)"><path d="M113 120h139v19h-16v18h-19v-18H113z" fill="var(--credit)"/>
      <circle cx="103" cy="130" r="32" fill="var(--credit-bg)" stroke="var(--credit)" stroke-width="2"/><circle cx="103" cy="130" r="14" stroke="var(--credit)" stroke-width="2"/>
    </g>`),
  plane: () => scene('plane', `
    <path d="M49 102h197v104H49z" fill="var(--surface)" stroke="var(--ink-2)" stroke-width="1.5"/>
    <path d="m50 103 98 61 97-61M50 205l68-61m126 61-68-61" stroke="var(--line-2)" stroke-width="1.5"/>
    <g class="art-lift"><path d="m124 62 143-32-61 104-26-39z" fill="var(--credit-bg)" stroke="var(--credit)" stroke-width="1.5"/>
      <path d="m180 95 87-65-73 74 12 30" fill="var(--brand-green)" stroke="var(--credit)" stroke-width="1.5"/>
    </g><path class="art-trace" pathLength="1" d="M44 77h49m-27-13h35" stroke="var(--credit)" stroke-width="2"/>`),
};
