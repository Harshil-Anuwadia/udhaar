# Udhaar: the long-term product system

Status: product architecture, not a shipped-feature list. This document extends the existing app and the voice rules in [BRAND_WORLD.md](BRAND_WORLD.md). It is deliberately not a redesign into a finance app, couples app, social network, or photo gallery.

The promise is simple: **some things between people are worth remembering.** Money is the first useful doorway. Over time, the same private page between two people can hold what was owed, what was promised, what happened, and what they chose to keep. Nothing should be invented to make an empty page feel full.

## What exists now, and what does not

| In the current product | Proposed in this document |
| --- | --- |
| Per-user person pages, optionally connected to another account; private Moments with up to four photos | A stable shared relationship identity, with each person's private view and permissions kept separate |
| Money, favour, and promise lines; settlement and dispute states | A unified chronology that can also contain moments without pretending moments are debts |
| Group bills and splits | Optional trip/occasion collections that can contain both lines and moments |
| Up to four receipt photos on an entry, a user avatar, and up to four photos per private Moment | Item-scoped sharing and richer media management |
| Invitations that connect two ledgers | Narrow, previewable invitations to share specific memories or a future relationship page |
| Events and ledger activity | Factual, opt-in resurfacing and recaps derived only from actual content |

**Trust prerequisite.** The first implementation slice now requires authentication and checks ledger, avatar, or Moment access before serving `/api/media/:id`; responses are privately uncached. Existing images receive an owner during database migration, and private Moments are never shared just because ledgers connect. This does **not** complete the broader media platform: scoped sharing, export, revocation semantics, derivatives, and storage retention remain future work. A random ID alone is never a privacy policy.

## 1. Vision

Udhaar becomes a quiet, durable record of the little things between people. It remains useful on day one because it answers “who paid?”; it remains useful years later because it answers “what happened between us?” The product earns permanence through real events, not daily prompts. Its unit of meaning is a **person and a real occurrence**, not a balance, feed post, or content quota.

The long-term product promise is not “remember everything.” It is “keep the details you would otherwise lose.” The user decides which details deserve to last.

## 2. Category and boundaries

“Social memory ledger” is the internal category. In ordinary UI, say “your page with Sana” or “the little things between you,” not a category thesis. A ledger line is precise and actionable; a moment is a true occurrence with no obligation; a memory is a deliberate keep; a story is a collection. These are neighboring objects, not interchangeable labels.

The app must never become a generic expense dashboard, public social feed, relationship quality score, passive camera backup, or all-purpose notes app. Precision for money is non-negotiable even as the emotional scope grows.

## 3. Life-stage adaptation

The same primitives serve changing lives without asking the user to pick an age or persona:

| Life context | Natural reason to open Udhaar | What the product does |
| --- | --- | --- |
| College and flatmates | Cabs, food, borrowed things, “send me the photos” | Fast lines and small shared moments |
| First jobs and moving cities | Visits, group trips, old friends, promises to meet | Person pages preserve continuity across distance |
| Long-term friendships and partners | Years of occasions, practical care, recurring plans | Selected memories and stories sit beside open lines |
| Family and later life | Favours, caregiving details, celebrations, ordinary days | Private history remains legible and exportable |

No age, gender, relationship status, or closeness is inferred from behavior. The interface adapts to *content that actually exists*: a trip collection appears after a trip is created; a memory section appears after something is kept. A user may optionally name a chapter or occasion, but never has to select a life stage.

## 4. Person architecture

Today a person is a row in one user's book; it may later link to an account. Keep that distinction. A person's name, private note, nickname, and sort order belong to the viewer. A linked account's verified identity is separate. One person's label for “Sana” must not overwrite Sana's name or another user's label.

The person page should support three safe states: **only in my book**, **connected for lines**, and **connected for explicitly shared memories**. Connection is a capability, not blanket permission to see the whole page. Duplicate person merging needs a preview of affected lines and memories; it cannot silently combine two social histories.

## 5. Relationship architecture

A relationship is the durable shared context for two people, but it is not a prediction about intimacy. Give a connected pair one stable relationship ID while retaining user-local person records and private aliases. The relationship has a factual timeline and permission-scoped shared items; each participant also has private items that never leak into the other's view.

The current reciprocal friendship rows and `sharedEntriesFor` behavior can coexist during migration. Introduce the relationship ID behind the existing APIs, backfill linked pairs idempotently, then build a timeline projection that reads old lines and new moments. Do not clone old lines into new records or change balance logic while doing this. Historical pre-link lines must not become visible because a new memory feature was enabled; disclose and confirm any broadened sharing separately.

## 6. Moment

A Moment records something that happened: “the café where we got stuck in the rain,” “finally returned the charger,” “that 2 a.m. airport run.” It has an occurrence date, an optional short title or note, optional people and photos, and an explicit visibility setting. It has **no amount, debt direction, settlement, or reminder**. Create it in seconds from a person page, trip, or plus action; let a one-line Moment be complete without a photo.

Moments may be private to the creator or shared with named people. A shared Moment should become one canonical item for both viewers after consent, not two drifting copies. Edits show who changed what; removing a shared Moment is a clear action with understandable effects for both sides.

## 7. Story

A Story is a deliberately assembled sequence around a real theme or occasion: “Our first apartment,” “Goa, eventually,” “Sunday cafés.” It can contain Moments and references to relevant ledger lines without mutating those lines. The Story itself is not a feed post or an automatically written narrative. Default presentation is chronological; the owner can reorder, write a short introduction, and choose a cover only when they want to.

Stories are created after content exists, not as an onboarding chore. Sharing is separately permissioned from sharing individual items; the UI must show which included items the recipient will gain access to. A Story cannot launder a private receipt or private Moment into a public view.

## 8. Memory

“Keep as a memory” is a small, personal action on a Moment or closed line. It changes prominence, not the underlying facts. A kept line still has its true amount and settlement status; a kept Moment still has its creator and date. Technically, a Memory is a user's saved reference with an optional private note, not a duplicate copy of an entry, photo, or event.

This gives users a quiet way to mark “this mattered” without forcing every entry to become sentimental. Saved memories can be removed without deleting the source item. If the source is later deleted or access is revoked, the saved reference disappears or becomes an explicit unavailable state, never a ghost copy.

## 9. Photo

Photos support a real Moment; they are not the primary destination. Let a user add a small set of images, reorder them, choose a cover, and optionally caption one. Preserve original aspect ratio throughout the app. Never require a photo for a Moment, and do not silently import a camera roll or contact list.

Media should be stored as owned assets with type, dimensions, byte size, checksum, derivative references, and deletion state. Serve them only after checking whether the viewer owns the asset or has access through the attached item. Strip or intentionally handle EXIF/location data; generate bounded thumbnails; preserve originals only with a clear storage policy. Current receipt media is a separate migration concern, not a ready-made personal gallery backend.

## 10. Trip

A Trip is a time-bounded Story with an optional place and participants. It combines practical lines (“cab from airport”) with chosen Moments (“the wrong train was the best bit”). It does not attempt itinerary planning, booking, maps, or automatic travel detection. Creating a Trip should be optional even if a group is named after a place.

Group split data remains authoritative for money. The Trip merely references relevant group lines. One person can keep private notes or photos while other participants see only shared items. The trip page begins with what actually happened, not an empty hero demanding a cover image.

## 11. Milestone

A Milestone is a marked Moment: first apartment, graduation, anniversary, moving away, a small personal win. “Milestone” describes user intent, not a separate mandatory workflow or algorithmic achievement. Users may change or remove the mark. No automated relationship anniversaries are inferred from account creation or first payment unless the user explicitly supplies the date and wants it remembered.

## 12. Timeline

The timeline orders facts from different domains: line created, line closed, Moment occurred, Story assembled, and marked Milestone. It distinguishes **when something happened** from **when it was recorded**. Backdated Moments display their real occurrence date; corrections show a subtle edit history where trust matters. Filters for “all,” “lines,” and “moments” are sufficient at first.

The timeline is a read model, not a new source of truth. Money stays in `entries`; Moments stay in `moments`; saved references stay in `saved_items`. An event/projection layer can paginate across them with stable IDs and permission checks. Avoid one giant polymorphic table that mixes debt state with editorial content.

## 13. Relationship homepage

At the top of a person page, retain the practical truth: who owes whom and which lines are open. Below that, show a small, relevant glimpse of real history when it exists: the last Moment, a kept item, or an active Trip. A connected page makes the shared/private boundary visible. If there are no moments, the page remains a strong ledger rather than a vacant memory template.

Primary actions are contextual: “Add a line” when an obligation exists, “Remember a moment” when the page has history, and “Invite to this page” only when the viewer understands what sharing means. Never make people scroll through decorative content to settle a debt.

## 14. Lifetime homepage

Home remains a useful answer to “what needs my attention?”: open lines, due promises, and people. As real history accumulates, a restrained “Worth keeping” module can show one saved or recent Moment. Users can dismiss or hide that module. There is no endless feed, no popularity ordering, and no manufactured “you have memories” card when the book is empty.

The visual hierarchy should be stable across years: attention first, people second, optional reflection third. This keeps the product recognizable even as its scope broadens.

## 15. Yearly recap

An on-demand yearly recap may summarize verified facts: people with activity, lines closed, Moments kept, Stories made, and photos chosen. It should use plain counts and user-authored text, not invented emotional conclusions such as “your closest friend was…” or “your best year.” If there is too little content, say so and offer a small factual page rather than padding it.

Recaps are private by default. Sharing creates an exact, editable preview with private names, amounts, and media hidden unless deliberately included. A recap should be recomputed or invalidated when source data is deleted, shared access changes, or a correction changes the facts.

## 16. Couples are a use case, not the product category

Two partners can naturally use the same person page for expenses, promises, little rituals, trips, and years of memories. Give them the same primitives as everyone else, with no “couple mode” gate, romance template, or relationship health score. A Story can be called “Our first year” because the users called it that, not because Udhaar classified them.

Private notes remain private even within a connected pair. An exit or breakup should be manageable without losing one's own records: revoke future sharing, understand what previously shared content remains with the other person, export one's own data, and avoid surprise resurfacing.

## 17. Story-forward experience, validated with women without stereotyping

The brief asks for a female-first couple experience. The product answer is a **story-forward composition path available to everyone**, researched and tested with women and couples as a priority audience. It may foreground an occasion, a detail, or a photo before ledger metadata when the user chooses to record a Moment. It must not assume that women are “the sentimental one,” that men handle payments, or that any person wants a romantic voice.

Do not collect gender to assign layouts. Offer a reversible preference such as “Practical first” or “Stories first” only if research shows a real need; keep core features and privacy identical. Test whether the flow feels useful in ordinary friendships and family relationships too. If it only works through a stereotype, do not ship it.

## 18. Organic partner invitation

The invitation happens at a natural moment: “I added the trip; want to keep the same page?” or “Confirm this line.” The sender chooses between **this one item**, **future shared items on this page**, and an explicitly previewed historical set. The invite screen says exactly what the other person will see and what accepting will not expose. The recipient can inspect, accept, decline, or postpone without creating a memory account under pressure.

Connection should make subsequent shared items canonical and two-sided. It must not silently publish private notes, unselected past entries, or a whole camera roll. Keep the current ledger invite flow functional during migration; introduce narrower memory sharing as an additional capability rather than changing the meaning of old invite links.

## 19. Retention loops that earn their place

The strongest loop is an actual shared event: someone covers a cab, does a favour, sends photos, or gets together again. Udhaar helps record it, follow through, and later find the context. A second loop is a user-kept Moment becoming useful later: “Which café was that?” A third is a genuine collaborative action: the other person confirms, adds a detail, or contributes a photo with permission.

No streaks, daily check-ins, guilt nudges, scoreboards, or arbitrary “memory of the day” notifications. Retention should be measured through repeated real use across months and relationships, not through notification open rates alone.

## 20. The life loop

`Something happens → someone records the useful detail → the right people see or confirm it → the line resolves or the Moment is kept → the history becomes findable → another real event brings them back.`

The loop works with one person and one line. Social participation and memory depth increase value, but neither is required to get started. That is why money remains the first doorway and the app never opens on a blank scrapbook canvas.

## 21. Home evolution without a forked product

Progressive disclosure should be based on *observed content*, not tenure. A new account sees ledger utility. After the first Moment, that Moment appears only on its person page. After several kept items, Home may show one “Worth keeping” preview. After a Story exists, a Stories entry point becomes visible. Each addition can be dismissed or hidden; the global “Add” flow stays short and predictable.

Do not keep adding permanent top-level tabs. Person pages and the existing Home are the stable spine. An advanced user gets richer pages, not a second app with a different navigation model.

## 22. Cross-feature connections

A line can link to a Moment (“cab after the concert”) while retaining its financial lifecycle. A Moment can be included in a Story or Trip. A closed line or Moment can be kept as a Memory. A Milestone is a marker on a Moment. A yearly recap reads these objects but never owns them. These are references, not copies; changing or deleting the source must propagate to every presentation.

Keep cross-links user-initiated at first. Suggesting “attach this line to your Goa trip?” is acceptable only when the Trip exists and the suggestion is obvious and dismissible. Automatically binding a private line to a shared Trip is not.

## 23. Privacy architecture

Use a capability model with four clear scopes: **only me**, **specific named people**, **the members of this named group**, and **an explicit export/share artifact**. There is no public-by-default scope. The creation form states the scope before save; the detail page makes it inspectable later. A share preview is generated from the same authorization rules as the recipient view, not a decorative mockup.

Authorization must be checked on server reads, writes, media downloads, thumbnails, timeline projections, and recap generation. Neither an unguessable URL nor a client-side hidden element is access control. Cache private responses as private/no-store as appropriate. Invites are scoped, expiring/revocable grants with an audit trail. Revoking access prevents future server access but cannot erase copies or screenshots already exported; say this plainly. Offer account export and deletion, per-item deletion, retention rules, and a documented backup policy. Financial records shared by two parties need an explicit correction/deletion policy so one person's action does not falsify the other's history.

## 24. Notifications

Notifications exist for real coordination: someone shared a line with you, confirmed or questioned it, invited you to a page, or contributed to a Story you joined. Memory resurfacing is opt-in and low frequency, preferably in-app first. Never auto-send reminders on a user's behalf or announce a private Moment to the person it mentions.

Give users granular controls for ledger activity, invitations, shared-memory activity, and optional reflection. Batch low-priority events; preserve exact deep links; respect quiet hours. A notification must not reveal sensitive names, amounts, or photos on a locked screen unless the user chooses that detail level.

## 25. UX writing

Follow the existing voice contract in `BRAND_WORLD.md`: warm, observant, concise, and precise. Key pairs: “Add a line” / “Remember a moment”; “Only in your book” / “Shared with Sana”; “Keep this” / “Remove from kept”; “This happened on…” / “Added today.” Money copy always preserves direction, amount, and state. Memory copy never fabricates feelings, closeness, or nostalgia.

Good example: “Cab home · ₹240 · Sana owes you.” Later, on the same page: “After the show · 14 June · kept by you.” Bad example: “Your friendship is priceless!” after a repayment. The app can be funny about a real situation, never at someone's expense or as a substitute for a clear action.

## 26. Rituals

The useful rituals are small: add the line while it is fresh; close it when it is done; keep a Moment when it matters; occasionally open a person's page to find the old detail. A Trip can end with a gentle “anything worth keeping?” prompt, but only once, only in context, and never as a task badge. Recaps are an invitation to look back, not a yearly obligation.

Micro-animation should confirm an action or reveal continuity: a line settles into history, a saved item joins the kept stack, a shared contribution appears in place. Honor reduced-motion settings; do not add confetti to sensitive money or relationship events.

## 27. Sharing outside Udhaar

Sharing is a deliberate artifact, not a growth tax. A user may export a single line, a Moment, a Story, or a recap after seeing an exact preview. Default to hiding amounts, private notes, and names where they are not essential. A shared link should have an expiration or revocation option; an image export should clearly warn that it can be saved by others.

The most natural invitation is still a practical one: “See and confirm this line.” Broader story sharing comes later, after users have reason to trust the product. No public discovery page or feed is required.

## 28. Expansion path and release gates

| Stage | Ship | Gate before moving on |
| --- | --- | --- |
| 0 — trustworthy ledger | Media authorization and owner migration now implemented; continue verifying connected-ledger permissions, performance, and navigation | Security tests for every media/ledger visibility state; no regression in settlement or invites |
| 1 — first memory | Private Moments with up to four photos now implemented; stable relationship ID and mixed person timeline remain | Users can create/find a Moment quickly; private content never appears in the other account |
| 2 — shared history | Item-scoped sharing, recipient preview, edits/revocation, saved references | Two-sided data stays consistent; revocation and deletion have predictable outcomes |
| 3 — collections | Story and Trip as references to existing items; multi-photo management | Real users form collections without onboarding pressure or duplicate content |
| 4 — reflection | Optional Milestones, factual recap, occasional in-app resurfacing | Users return to find actual details; no evidence of notification fatigue or false inference |

Prefer a focused pilot of each stage over a broad launch. Instrument task completion, item retrieval, sharing consent/revocation, and long-term return after real events. Do not optimize only for content created or time spent.

## 29. Feature contract: six questions answered for each proposal

Each row states the human behavior, natural use, return reason, compounding value, fit with today's Udhaar, and why it is not a generic version of the category. These are product hypotheses to validate, not claims about user behavior already observed.

| Proposal | Human behavior | Natural use | Why return | What compounds | Fit to existing app | Distinctive constraint |
| --- | --- | --- | --- | --- | --- | --- |
| Stable person/relationship page | People remember events through people | Open Sana's existing ledger page | Find an unresolved line or an old detail | A trustworthy shared history | Extends current person and linked-ledger model | Private aliases and sharing rights stay separate |
| Unified timeline | People ask “when did that happen?” | Scroll the page already used for lines | Locate a true event or resolution | Context across years | Reads current entries plus Moments | No feed ranking or invented chronology |
| Moment | People note a small event before forgetting | One line after an outing or favour | Recall place, date, or detail | More findable context per person | Lives beside a line, not instead of it | Complete without a photo or audience |
| Kept Memory | People mark a few things as meaningful | Tap “Keep this” on a real item | Revisit a chosen detail | A small personal collection | References existing line/Moment | Does not duplicate or sentimentalize data |
| Photo attachment | A picture helps explain a real event | Attach to a Moment during capture | Recognize the event instantly | Richer but still selective record | Evolves from receipt attachment | No camera-roll sync or gallery feed |
| Story | People group related details after the fact | Gather existing items around an occasion | Reopen an intelligible chapter | A curated history with no duplicate items | Assembles lines and Moments | User-authored, not AI-written social content |
| Trip | Groups mix practical spending and memorable moments | Create from an actual trip | Find both cab line and story later | Reusable occasion context | References current groups/splits | No booking, itinerary, or travel feed |
| Milestone | People mark a turning point | Mark an existing Moment | Recall a date they chose | Sparse meaningful anchors | Uses Moment data | No auto-awarded badge or relationship inference |
| Contextual Home | People want the next useful thing | See open lines first, one real memory later | Act on something or find someone | Familiar home gains depth | Preserves existing Home spine | No infinite feed or artificial empty modules |
| Factual recap | People sometimes look back at a year | Open on demand near year-end | Revisit chosen facts | Long-range perspective | Derives from lines and Moments | No invented “best friend” or emotional verdict |
| Scoped invite | People share when the other person has a reason to join | Send a line/Moment/page preview | Collaborate on the same truth | Two-sided continuity | Builds on existing join flow | Explicit scope, not blanket exposure |
| Quiet notifications | People need to know when another person acts | Receive a confirmation or contribution | Respond to a real event | Trust in shared state | Extends existing activity events | No streaks, guilt, or automatic nags |
| Optional reflection ritual | People occasionally want to preserve an occasion | Small prompt after a real Trip | Find what they chose to keep | Better future recall | Uses real group/person activity | Contextual and dismissible, not a daily chore |

## 30. Anti-feature-creep rules

1. Start from a real person, real occurrence, or real commitment. If a feature works only with fabricated filler, reject it.
2. Every new object must answer a retrieval or coordination need. “More content” is not a need.
3. Keep money states exact. Never let a beautiful memory card obscure an open debt or disputed line.
4. A shared relationship is not a public relationship. Visibility is explicit at creation and inspectable later.
5. Do not ask for gender, age, closeness, or relationship type to make the core product work.
6. No universal feed, social graph growth mechanic, streak, compatibility score, AI-written nostalgia, or engagement tax.
7. Reuse the person page and existing navigation until evidence proves a new destination is necessary.
8. A photo belongs to a real item; an item does not exist to justify a photo feature.
9. Cross-links reference sources; do not duplicate financial or personal history into competing records.
10. Ship each layer only after privacy, deletion, export, accessibility, small-screen behavior, and two-sided consistency are tested.

## Implementation seams to protect

The likely minimal model is `relationships` (shared pair identity), `relationship_members` (per-user linkage), `moments`, `moment_people`, `media_assets`, `moment_media`, `stories`, `story_items`, `saved_items`, and scoped `share_grants`. A Trip can initially be a typed Story; a Milestone can initially be a Moment flag. Keep `entries` as the ledger authority and make the timeline a projection over source objects. Add foreign keys, owner/visibility indexes, idempotent migration, and authorization tests before exposing new routes.

The front end needs a similarly small seam: a person-page timeline and one Moment composer. Do not start by adding five new tabs. Test on short phone viewports, slow uploads, interrupted sharing, and a newly linked pair with years of private old lines. The first usable version should still feel like Udhaar even if the user never creates a Moment.
