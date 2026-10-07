# Deeper mobile journeys

The visual identity stays intact: square corners, forest green, white and ink,
DM Sans, and the existing People / Groups / Add / Alerts / You navigation.
The new screens extend the product rather than introduce a second theme.

## What users can do

| Screen | How to reach it | Purpose |
| --- | --- | --- |
| Ledger review | People → Review your ledger | Search the complete ledger, filter by status, recorded month, and direction, and open any entry. |
| Entry details | Tap a person’s ledger line or a review result | See the amount, status, note, dates, author, receipts, and relevant actions together. |
| Record payment | Entry details → Record payment | Record a full or partial payment, review the remaining amount, confirm, and undo the specific record. Favours and promises have their own completion copy. |
| Your story | Person → Little moments → View moments & entry history | Browse a chronological timeline of entries and private moments, view photos, and keep another moment. |
| Udhaar Plus | Account → Udhaar Plus | See the three concrete upgrades and one-time price, purchase once, or finish confirming an existing payment. |

Routes: `/#/review`, `/#/friend/:id/entry/:entryId`,
`/#/friend/:id/settle/:entryId`, and `/#/friend/:id/story`.

## Design decisions

- Keep the familiar green balance panel. Place its next step inside the panel,
  instead of adding another competing card to the overview.
- Fit these screens to the available mobile viewport. Headers, navigation, and
  primary actions stay in place; ledger rows, the timeline, and long details scroll
  inside their own panes. Short phone layouts retain 44px touch targets.
- Put review filters in one expandable control. Show applied filters beside the
  result count, and preserve them when returning from details.
- Focus entry details on the amount, note, status, and a compact facts grid. Hide
  primary tabs in entry and payment flows; the header returns to their source.
- Hide primary tabs during payment recording. Review Back returns to the amount
  without losing it. Confirmation explicitly explains that Udhaar records money
  already paid elsewhere.
- Show the server’s remaining balance after saving. An ambiguous connection failure
  asks the user to check the latest entry before submitting another record.
- Keep the forest-green story identity compact. Two choices, All activity and
  Moments, sit above the timeline. Private moments carry “Only you” labels.
- Keep one ledger-review gateway on People. A person's Moments section previews
  two moments and links to the complete timeline, without another large gateway.
- Plus keeps its price and single purchase action together at the bottom. A saved
  receipt switches to confirmation only; active Plus immediately replaces checkout.
  Notifications stay above the body in focused flows so they cannot cover the price.
- Preserve the reminder message preview for both private and linked people.
  Bulk settlement reports confirmed saves and failures separately, then reloads
  the person’s ledger so remaining lines are visible.
- Respect dark and sage themes, reduced motion, touch targets, and safe areas.
  These journeys use the existing private-photo viewer and Moment composer.

## Verification

`npm run test:ledger-review` checks monetary totals, cents, overdue/month/search
filters, chronological grouping, and payment input boundaries.

`npm run test:product` uses Chromium, a temporary database, and the real API to
check navigation, filters, review Back, partial payment and exact Undo, ambiguous
save handling, updated balances, private Moments, receipts, empty/error recovery,
photo focus and restoration, reminder previews, bulk failures, and narrow mobile
layouts from 320×568 to 430×932. It checks vertical fit, pinned controls, usable
inner scrolling, readable text after theme changes, and visual-viewport shrink
and restoration. Set
`PRODUCT_SCREENSHOTS` to save viewport previews. `npm run test:bugs:browser`
also verifies Plus confirmation retries across reload and the active state on a
short phone.

The application has no frontend build step. New modules and styles are included
in the versioned service-worker shell; private API responses remain uncached.
