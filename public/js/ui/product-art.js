/* Original vector artwork for the paper-and-forest product identity. */
export function PlusArtwork() {
  return `<svg class="plus-art" viewBox="0 0 360 250" fill="none" aria-hidden="true" focusable="false">
    <path class="plus-art__rule" d="M24 200h45m239-138h28M38 46v15m-7-7h14m268 135v15m-7-7h14" stroke="#7DAB91" stroke-width="1.5"/>
    <ellipse cx="187" cy="222" rx="112" ry="10" fill="#082B1D" opacity=".35"/>
    <g class="plus-art__memory">
      <g transform="rotate(12 277 161)">
        <path d="M244 109h73v105h-73z" fill="#113B29"/>
        <path d="M241 105h73v105h-73z" fill="#E7EDDB"/>
        <path d="M249 113h57v63h-57z" fill="#B9CDB8"/>
        <path d="m249 157 19-20 15 14 13-10 10 10v25h-57z" fill="#4D785C"/>
        <circle cx="291" cy="127" r="6" fill="#EDF1DD"/>
        <path d="M251 188h40m-40 8h26" stroke="#6D826B" stroke-width="2"/>
      </g>
    </g>
    <g class="plus-art__book">
      <g transform="rotate(-12 178 129)">
        <path d="M109 36h147v180H109z" fill="#082C1C"/>
        <path d="M113 34h137v174H113z" fill="#D9E2CE"/>
        <path d="M115 196h131m-131 4h131m-131 4h131" stroke="#9BAF95"/>
        <path d="M103 28h144v171H103z" fill="#246345"/>
        <path d="M103 28h12v171h-12z" fill="#194832"/>
        <path d="M115 29v169" stroke="#6F9B7A" stroke-opacity=".65"/>
        <path d="M124 44h107v138H124z" stroke="#80A78A" stroke-width=".8"/>
        <path d="M148 64h11v31l7 7h7l7-7V81h11v19l-13 13h-16l-14-14V64z" fill="#F1F3E4"/>
        <path d="M180 61h11v11h-11z" fill="#B9D9AF"/>
        <text x="141" y="140" fill="#F1F3E4" font-family="DM Sans, sans-serif" font-size="19" font-weight="600" letter-spacing="-.6">udhaar</text>
        <path d="M141 150h58" stroke="#81AA8C"/>
        <text x="141" y="166" fill="#C1D8BC" font-family="DM Sans, sans-serif" font-size="7" font-weight="600" letter-spacing="2">PLUS EDITION</text>
        <path d="M217 28h13v64l-6.5-5-6.5 5V28z" fill="#B9D9AF"/>
      </g>
    </g>
    <g class="plus-art__receipt">
      <g transform="rotate(8 76 151)">
        <path d="M37 95h77v122l-7-4-7 4-7-4-7 4-7-4-7 4-7-4-7 4-7-4-7 4-7-4V95z" fill="#082C1C" opacity=".25" transform="translate(3 4)"/>
        <path d="M37 95h77v122l-7-4-7 4-7-4-7 4-7-4-7 4-7-4-7 4-7-4-7 4-7-4V95z" fill="#FAF8EF"/>
        <path d="M49 111h40m-40 7h27" stroke="#70816E" stroke-width="2"/>
        <path d="M49 132h52" stroke="#CBD4C3" stroke-dasharray="2 3"/>
        <path d="M49 145h20m14 0h18m-52 10h28m13 0h11" stroke="#7A8A76" stroke-width="2"/>
        <path d="M49 168h52" stroke="#CBD4C3"/>
        <path d="M49 181h22v20H49z" fill="#DCE8D8"/>
        <path class="plus-art__check" pathLength="1" d="m54 190 4 4 8-9" stroke="#235E3E" stroke-width="2"/>
        <path d="M80 188h21m-21 7h14" stroke="#53704F" stroke-width="2"/>
      </g>
    </g>
    <g class="plus-art__edition">
      <path d="M264 29h34v34h-34z" fill="#D7E8C9"/>
      <path d="M281 38v16m-8-8h16" stroke="#194B32" stroke-width="2"/>
    </g>
  </svg>`;
}

export function RecordSeal() {
  return `<svg class="record-seal" viewBox="0 0 80 72" fill="none" aria-hidden="true" focusable="false">
    <path d="M22 10h42v52H22z" fill="var(--surface)" stroke="var(--line-2)"/>
    <path d="M29 20h25m-25 7h18" stroke="var(--ink-3)" stroke-width="1.5"/>
    <path d="M12 35h37v31H12z" fill="var(--credit-bg)" stroke="var(--credit)"/>
    <path class="record-seal__check" pathLength="1" d="m22 49 6 6 12-14" stroke="var(--credit)" stroke-width="2.5"/>
    <path d="M9 16v8m-4-4h8m48 26h10" stroke="var(--credit)" stroke-width="1.5"/>
  </svg>`;
}
