# People screen UX refinement

## UX audit

| Location | Problem | Priority | Principle | Proposed outcome |
|---|---|---|---|---|
| People actions | Multiple add/log/invite controls compete | P1 | Hick's Law, Proximity | One contextual Add person action; recording in navigation |
| People empty state | Settled people can be labelled “No people yet” | P1 | Mental Model | Separate empty and caught-up states |
| Money figures | System monospace is visually inconsistent with the product | P2 | Similarity, Aesthetic-Usability | Shared DM Sans number style with aligned digits |
| Navigation and balance | Muted accents weaken hierarchy | P2 | Selective Attention, Fitts's Law | Clear emerald accents and a 54px accessible plus action |

## UX improvements implemented

| Area | Problem | Principle | Change | Benefit |
|---|---|---|---|---|
| People | Repeated controls | Hick's Law | Removed top action pair, invitation banner, and caught-up log CTA | Fewer competing decisions |
| List | Add action disconnected from people | Proximity | One Add person control beside the list, or inside the initial empty state | Clear relationship between action and content |
| Empty state | Existing settled people mislabelled | Mental Model | “Your people” section and “All caught up” state | Accurate status without an extra recording button |
| Navigation | Unnecessary visible Log label | Fitts's Law | Icon-only mobile plus; accessible “Log a line” name retained | Cleaner navigation without reducing its hit target |
| Numbers | Monospace appears throughout amounts | Similarity | Shared self-hosted DM Sans, lining/tabular figures | Consistent, readable money and totals, no additional font download |
| Colour | Dull emphasis | Selective Attention | Deep emerald balance card, brighter green actions and credit states | More energy while keeping labels and debt/credit distinctions |

## Files changed in this pass

- `public/js/views/home.js` — People hierarchy, contextual action and empty-state correction.
- `public/js/views/view.js` — icon-only mobile navigation plus.
- `public/styles/tokens.css` — numeric typography and emerald tokens.
- `public/styles/app.css` — balance, list, empty-state and navigation styling; numeric family.
- `public/js/views/onboard.js`, `public/js/views/friend.js` — amount input font token.
- `public/sw.js` — cache version v1.22.1.
- `scripts/people-polish.mjs` — focused browser regression coverage.
- `scripts/action-visibility.mjs` — verifies the single navigation recording action.

## Validation

- The new regression check first reproduced two Add person actions in the empty state.
- Empty, settled and open balances: exactly one Add person control and no duplicate recording CTA.
- Adding a person still opens that person's ledger.
- Light/dark layouts at 320, 390 and 1280px; no horizontal overflow.
- Money font and icon-only plus accessible name checked in the browser.
- Existing action-visibility checks and 11 backend/unit tests passed.
- Existing visual audit covers login, signup and eight app views at four widths.

## Remaining scope

No functional blockers were identified in these targeted checks. Other screens retain their existing structure; their shared numeric typography and green tokens update consistently. Sharing and settings remain available through person details and You rather than duplicated in the People header. No financial calculations or stored amounts were changed.

## Follow-up: rhythm, voice and returning to a story

- **Proximity / Similarity:** Log in and Create account now share full width, 52px height and typography. Removed the detached “New here?” label.
- **Fitts's Law / Consistency:** Five equal navigation columns, a centred plus, 44px minimum small buttons, consistent line-height and icon/text alignment. Fixed an old dark-theme gradient that washed out the plus.
- **Working Memory:** “Pick up the story” opens the person associated with the most recently saved non-empty note. It is absent without real activity; there are no invented memories, streaks, or notification pressure.
- **Mental Model:** Warmer, direct copy in authentication, groups, People, moments, saving and voice preferences. Financial labels and amount meanings remain explicit.
- Additional files: `public/styles/auth-entry.css`, `public/js/views/auth.js`, `public/js/views/groups.js`, `public/js/views/you.js`, `public/js/views/add.js`, `public/js/core/voice.js`, `scripts/visual-audit.mjs`.
- Validation includes matching authentication button dimensions, recent-story navigation and dark-theme plus visibility. Service-worker version: **v1.22.2**.
