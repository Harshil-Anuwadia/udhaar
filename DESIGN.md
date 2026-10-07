# Deeper mobile journeys

The visual identity stays intact: square corners, forest green, white and ink,
DM Sans, and the existing People / Groups / Add / Alerts / You navigation.
The new screens extend the product rather than introduce a second theme.

## What users can do

| Screen | How to reach it | Purpose |
| --- | --- | --- |
| Ledger review | People → Review your ledger; Account → Your book | Search the complete ledger, filter by status, recorded month, and direction, and open any entry. |
| Entry details | Tap a person’s ledger line or a review result | See the amount, status, note, dates, author, receipts, and relevant actions together. |
| Record payment | Entry details → Record payment | Record a full or partial payment, review the remaining amount, confirm, and undo the specific record. Favours and promises have their own completion copy. |
| Your story | Person → Your story | Browse a chronological timeline of entries and private moments, view photos, and keep another moment. |

Routes: `/#/review`, `/#/friend/:id/entry/:entryId`,
`/#/friend/:id/settle/:entryId`, and `/#/friend/:id/story`.

## Design decisions

- Keep the familiar green balance panel. Place its next step inside the panel,
  instead of adding another competing card to the overview.
- Use a compact review introduction and expandable date/direction controls so
  entries remain visible on a phone. Preserve filters when returning from details.
- Let an entry occupy a full page. Receipts and context get room, and the primary
  action stays near the bottom of the screen.
- Hide primary tabs during payment recording. Review Back returns to the amount
  without losing it. Confirmation explicitly explains that Udhaar records money
  already paid elsewhere.
- Show the server’s remaining balance after saving. An ambiguous connection failure
  asks the user to check the latest entry before submitting another record.
- Give each person a forest-green story cover and a continuous timeline. Private
  moments carry “Only you” labels; shared entries retain their ledger status.
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
layouts. Set `PRODUCT_SCREENSHOTS` to save viewport previews.

The application has no frontend build step. New modules and styles are included
in the versioned service-worker shell; private API responses remain uncached.
