# Deeper mobile journeys

The visual identity stays intact: square corners, forest green, white and ink,
DM Sans, and the existing People / Groups / Add / Alerts / You navigation.
The new screens extend the product rather than introduce a second theme.

## What users can do

| Screen | How to reach it | Purpose |
| --- | --- | --- |
| Entry details | Tap a person’s ledger line | See the amount, status, note, dates, author, receipts, and relevant actions together. |
| Record payment | Entry details → Record payment | Record a full or partial payment, review the remaining amount, confirm, and undo the specific record. Favours and promises have their own completion copy. |
| Your story | Person → Little moments → View moments & entry history | Browse a chronological timeline of entries and private moments, view photos, and keep another moment. |
| Udhaar Plus | Account → Udhaar Plus | See the three concrete upgrades and one-time price, purchase once, or finish confirming an existing payment. |

Routes: `/#/friend/:id/entry/:entryId`,
`/#/friend/:id/settle/:entryId`, and `/#/friend/:id/story`.

## Design decisions

- Keep the familiar green balance panel. People open entries directly from each
  person’s ledger. Retired Ledger review bookmarks return to People.
- Fit these screens to the available mobile viewport. Headers, navigation, and
  primary actions stay in place; ledger rows, the timeline, and long details scroll
  inside their own panes. Short phone layouts retain 44px touch targets.
- Focus entry details on the amount, note, status, and a compact facts grid. Hide
  primary tabs in entry and payment flows; the header returns to their source.
- Hide primary tabs during payment recording. Review Back returns to the amount
  without losing it. Confirmation explicitly explains that Udhaar records money
  already paid elsewhere.
- Show the server’s remaining balance after saving. An ambiguous connection failure
  asks the user to check the latest entry before submitting another record.
- Keep the forest-green story identity compact. Two choices, All activity and
  Moments, sit above the timeline. Private moments carry “Only you” labels.
- A person's Moments section previews two moments and links to the complete
  timeline.
- Plus keeps its price and single purchase action together at the bottom. A saved
  receipt switches to confirmation only; active Plus immediately replaces checkout.
  Notifications stay above the body in focused flows so they cannot cover the price.
- Preserve the reminder message preview for both private and linked people.
  Bulk settlement reports confirmed saves and failures separately, then reloads
  the person’s ledger so remaining lines are visible.
- Respect dark and sage themes, reduced motion, touch targets, and safe areas.
  These journeys use the existing private-photo viewer and Moment composer.
- Plus uses an original SVG ledger, receipt, and memory illustration in forest,
  cream, and sage. Short phones use a compact side composition; taller phones
  give the illustration more space. Benefit icons distinguish people, entries,
  and groups. Active and pending accounts receive their own membership card.
- Amounts share a baseline with their currency symbol. Entry identity and status
  sit together above the amount, while the note has its own ruled space.
  Reminder actions have a clear touch target; deletion stays a labeled icon with
  its existing confirmation. Payment inputs show focus and invalid states.
- Forest primary fills, readable secondary labels, consistent gutters, and square
  icon tiles preserve the established identity. Press feedback is local; artwork
  and receipt checks animate once and honor reduced motion.

## Verification

`npm run test:journal` checks chronological grouping and payment input boundaries,
including fractional balances.

`npm run test:product` uses Chromium, a temporary database, and the real API to
check person-to-entry navigation, retired bookmarks, partial payment and exact Undo, ambiguous
save handling, updated balances, private Moments, receipts, empty/error recovery,
photo focus and restoration, reminder previews, bulk failures, and narrow mobile
layouts from 320×568 to 430×932. It checks vertical fit, pinned controls, usable
inner scrolling, text and functional-icon contrast in light/dark/sage themes,
visual-viewport shrink and restoration, and finite artwork motion that leaves
checkout stationary. Plus also covers the compact/tall layout breakpoint. Set
`PRODUCT_SCREENSHOTS` to save viewport previews. `npm run test:bugs:browser`
also verifies Plus confirmation retries across reload and the active state on a
short phone.

The application has no frontend build step. New modules and styles are included
in the versioned service-worker shell; private API responses remain uncached.
