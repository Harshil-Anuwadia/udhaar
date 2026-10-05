# Mobile product polish — v1.24.0

## UX audit

- **P1 · Navigation:** a group detail route did not highlight Groups, and a deep-link Back button could leave the app. Applied mental models and continuity: section-aware back destinations and exact route-family matching.
- **P1 · Group actions:** an empty group presented Add a bill twice, while member controls competed with it. Applied proximity and choice reduction: one primary bill action and a labelled member control in the header.
- **P2 · Account:** sign-out sat beside frequently used appearance/currency choices. Applied task frequency and grouping: two preference shortcuts; export and sign-out with account management.
- **P2 · Alignment:** headers, sheet footers, forms and page content used different gutters. Applied similarity and proximity: a shared gutter, consistent header actions, and aligned section buttons.
- **P2 · Perceived speed:** nested content animations delayed rows after a page was visible. Applied prompt feedback: animate the view once and make functional content immediately visible; honour reduced motion for palette changes.
- **P2 · Desktop:** the user requested mobile-only availability. Removed desktop workspace/sidebar/login artwork rules and markup. Desktop pointer/hover capabilities show a dedicated notice and do not import the mobile app runtime. Touch devices retain the mobile layout, including landscape.

## Implemented

| Area | Change | Benefit |
|---|---|---|
| Viewports | Dedicated desktop notice; one mobile shell; scrollable content and anchored actions | Clear availability and reachable actions |
| Navigation | Aligned headers, fixed group/Plus selection, safe back destinations, quieter active-tab marker | Predictable location and movement |
| People | Compact settled status above actual people; user avatar photos respected | Less redundant empty-state content |
| Groups | One bill button; member balance rows use full currency values and explicit direction | Less ambiguity and fewer competing actions |
| Account | Two preference shortcuts; grouped account actions; compact book statistics | Easier scanning with fewer prominent controls |
| Colour | Soft Paper canvas, white content surfaces, retained forest/emerald and explicit Ink/Sage | Clear surface hierarchy across the chosen palettes |
| Identity | Angular joined-U mark; matching splash, favicon, PWA, Apple and maskable exports | Legible, consistent identity at small sizes |
| Motion | Faster page transitions, no delayed functional rows, finite brand motion | Responsive interaction without hidden content |

## Files

- `public/js/entry.js`, `public/styles/mobile-entry.css`, `public/index.html`: desktop notice and mobile startup.
- `public/js/views/{view,home,groups,you,auth,add,onboard}.js`: navigation and screen refinement.
- `public/styles/{app,auth-entry,tokens,motion}.css`, `public/js/core/store.js`: spacing, colour and motion.
- `public/js/ui/brand.js`, `public/icons/*`, `public/og.png`, `public/manifest.webmanifest`: identity assets.
- `public/sw.js`: updated offline app shell and release version.
- `scripts/mobile-polish.mjs`: focused mobile/desktop regression and screenshots. Existing browser scripts now emulate touch devices.

## Validation

- Focused browser check passed for People, friend, Groups, group detail, Alerts, Account and amount entry at 320 and 390px in Paper and Ink.
- Verified desktop notice at 1366px and in a narrow desktop window; desktop did not request `main.js`.
- Verified single group bill action, selected Groups tab, and back navigation after reloading deep links.
- Reviewed rendered desktop notice, mobile screens and the 192px app icon.
- Checked patch whitespace and regenerated icon and social-preview assets.

No financial calculations, database schema or account data were changed. Existing illustrations inherit the refined palette; photos were not introduced behind text or controls.
