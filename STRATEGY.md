# Udhaar — the friendship ledger
### Product discovery & strategy (18 points)

**1. The product.**
Udhaar is a private, two-sided ledger of everything that passes between friends — money, favours, and gestures ("I owe you a dinner", "you get the next veto"). One tap logs a line; every line mints a share link the other person can confirm or dispute. It is the kirana-store *khata* rebuilt for Gen Z: ruled paper, red margin, blue for credit, vermillion for dues — but it lives in your pocket and it remembers so you don't have to.

**2. The user.**
18–28, urban India first (then diaspora + anywhere "I'll Venmo you" doesn't exist). Flatmates, couples, friend groups who split rent, trips, cabs, Zomato. They already track this — in their heads, in WhatsApp screenshots, in a Notes app they're embarrassed by. Not finance bros; people for whom money between friends is a *social* object, not an accounting one.

**3. The insight.**
Friendship runs on an unspoken economy with no books. Everyone keeps a shadow ledger in their head — and the head is lossy, biased, and silent. The pain isn't the money; it's the *awkwardness of remembering out loud*. Whoever remembers becomes the accountant of the friendship, and the accountant is always the bad guy.

**4. The problem.**
Three jobs, none served together: (a) remember what's outstanding, in both directions, without shame; (b) raise it without being "that person"; (c) keep score of the non-money economy (favours, gestures, who always covers) that actually decides how fair a friendship feels. Splitwise does (a) for money only, and makes (b) worse by being loud and group-wide.

**5. Today's workaround.**
Mental math, Notes app lists, "wait let me check what I paid", screenshots of UPI receipts, and simply swallowing small amounts — which quietly accumulates resentment. The workaround's cost is emotional, not financial: it taxes the friendship itself.

**6. Why incumbents fail here.**
Splitwise: group-first, receipt-audit culture, settlement rails nobody uses in India, zero concept of favours or one-sided memory. Venmo/Cash App: payment rails first, requires bank rails India doesn't have for P2P social use, public transaction memes = opposite of private. UPI apps: move money, never remember it. Notes app: no second side, no reminders, no social contract. All of them treat the ledger as bookkeeping; nobody treats it as a *relationship object* you can hold up and laugh about.

**7. The core experience.**
Open → big net position on ruled paper → tap the vermillion FAB → person, kind (money / favour / vow), direction, amount on a keypad → "Arjun owes me ₹450" → confetti, done in four seconds one-handed. Swipe a line left to nudge or settle. Everything else (groups, honor, sharing) hangs off this four-second loop.

**8. The "holy shit" moment.**
Logging a line mints a share card — a beautiful khata-page image with your net position and honor grade — and a confirmation link. Send it on WhatsApp; your friend opens it and sees *their* side, taps "yep, that's right" or "dispute". The ledger stops being your accusation and becomes your shared record. Second holy-shit: the Honor Score naming your reputation ("Bulletproof", "Shaky") from behaviour you can't edit.

**9. Why they return tomorrow.**
The ledger is alive: lines age, go overdue in vermillion, friends confirm or dispute (push + Notification API), nudges land, groups accumulate trip bills. Every real-world spend between friends is a reason to open it. It's a database of your unresolved social contracts — you check it the way you check unread messages.

**10. Why they invite.**
A one-sided ledger is weak; a confirmed one is proof. The product literally cannot reach its best state alone: "Make it two-sided — they see their own numbers, you stop being the accountant." Invite codes (UDH-XXXXX) and per-entry confirmation links are the only way to unlock confirmations, disputes, and the friend's own honor stake. Sharing the card is flexing; flexing is onboarding.

**11. Why they pay.**
Free is a real ledger: 8 people, 120 lines, 2 groups, offline, export, dark mode — forever. Plus (₹99/mo, ₹799/yr; $2/$16 elsewhere) removes ceilings and adds the things heavy users feel: unlimited people/groups/history, scheduled gentle nudges ("remind me to remind them, politely, Sunday"), and unbranded share cards for people who post them publicly. The upgrade moment is engineered: hit the 8-person cap exactly when your friend group does.

**12. Monetization model & honest math.**
Freemium subscription, server-enforced (HTTP 402 with an upsell payload, not a nag banner). Assumption to validate: 3–5% of weekly-active ledger owners convert once their book matters (≈20+ lines or a group trip). At 10k WAU that's 300–500 subs ≈ ₹30–50k MRR — a real solo-founder business, not a unicorn. Secondary, later: group-trip "settlement packs" and a printed-year-in-review khata (physical object, high margin, extremely on-brand). No ads, no data selling — the ledger is intimate; monetizing trust would kill the product.

**13. The viral loop.**
Log → share card / confirmation link on WhatsApp → recipient lands on `/#/join?token=…` seeing *their* side of one line → confirm (dopamine + fairness) → own empty ledger → log their first line → send their first link. K-factor lever: every entry has exactly one natural recipient, and confirmation benefits them (their honor score, their own memory). Loop is built into the data model, not bolted on as "invite friends".

**14. The moat.**
Two-sided confirmed entries are data nobody else can import or fake: a graph of who-trusts-whom-with-what, timestamped by both parties. Honor Score becomes social collateral people cite ("my udhaar is Bulletproof"). Switching cost = re-confirming years of history with every friend. Defensible by being the category's first *relationship* ledger, not by tech secrecy.

**15. The MVP (what shipped).**
Auth + handles, onboarding that ends in a real logged line, the record sheet (money/favour/vow, both directions, keypad, optional receipt photo straight from the camera), friendship ledgers with swipe actions (settle/nudge/delete), confirm-dispute via share tokens, groups with exact splits written into every member's ledger, Honor Score + shareable ledger card (canvas-rendered, blur mode for public posting), activity feed, offline queue + service-worker shell, dark mode, PWA install, rate limits, caps + Plus flip, WhatsApp deep-link sharing. Visual language: ruled-khata paper texture, hand-inked spot illustrations (empty states, onboarding, honor seal), washi tape and coffee-ring details, stamp-thunk and count-up motion, photo avatars. Verified: 43/43 backend E2E checks and a full headless-browser UI journey — including real file uploads — with zero console errors.

**16. What we deliberately did NOT build.**
No payment rails (UPI/banks) — settlement happens off-app by design; being the memory, not the money mover, keeps compliance at zero and trust high. No AI wrapper, no chat, no feed algorithm, no public social graph, no receipts OCR, no multi-currency wallets, no web push spam. Every omission protects the four-second loop and the private-by-default promise.

**17. Risks & mitigations.**
(a) *Cold-start awkwardness*: one-sided mode is fully useful alone — the ledger works before anyone joins. (b) *Social friction of being tracked*: confirm/dispute gives the other side equal power; copy is warm and self-deprecating, never dunning-language. (c) *WhatsApp dependency*: links are plain URLs; copy-as-text fallback exists. (d) *Retention decay after debts settle*: favours/vows and groups (trips never end) keep lines flowing; honor score adds identity stake. (e) *Monetization ceiling*: caps are tuned so free is genuinely useful — trust first, conversion second. (f) *Abuse (shaming)*: blur mode, private-by-default, no public walls, dispute path, delete-any-line.

**18. Evolution.**
v1.1: scheduled nudges ship to free as a trial, trip templates (Goa/Leh presets), year-in-review printed khata. v1.5: household mode (couples' shared book with parallel private books), honour-score-based "trust notes" friends can endorse. v2: the confirmation graph becomes an API for deposit-free rentals between verified friends ("udhaar-verified") — the moat monetized without touching payments. Always: four seconds to log, one thumb, ruled paper.

---
*Built solo-founder style: Express + better-sqlite3 + vanilla ES-module front end, no framework tax, PWA-first, ~zero dependencies beyond auth/validation/sqlite. Runs on a mid-range Android browser at full speed.*

---

## Addendum — rounds 4–6 (build-quality decisions)

- **Native shell rule:** the document never scrolls. One fixed viewport, pinned
  chrome, internal scroll regions, push/pop transitions, safe-area insets.
  Anything that feels like "a web page" is treated as a bug.
- **One view per intent; steps instead of scrolls.** Logging = 2 taps-deep wizard
  (who → the line). Auth = one question per screen. Secondary details (due date,
  receipt) live in a tucked sheet so the primary screen never grows.
- **Split semantics (the real world):** a bill divides between everyone present,
  payer included. Ledger lines are only created for obligations that actually
  exist in *my* book: I paid → friends owe me their shares; a friend paid → only
  my share, owed to them. Never book fiction.
- **Chase vs pay are different moods:** overdue review, swipe actions and nudge
  guards all respect direction. You cannot nudge someone for money you owe.
- **Dark mode is designed, not inverted:** warm charcoal paper, four readable ink
  steps, periwinkle/ember accents, fill-grade button colours, and the same care
  under `prefers-color-scheme` via a resolved `data-effective` attribute.
