# The udhaar world

This is a product system, not a list of slogans. A line must have a real person, a real reason, a truthful state, and a useful next action. Everything else is decoration.

## 1. What we are building

**Category:** a social memory ledger. A relationship ledger is a useful explanation after someone has seen the product; “social memory ledger” is the broader category. Internally, money, favours, and promises are all **lines**. The ledger keeps the small agreements between people that would otherwise be scattered across chats and memory.

**Philosophy:** people owe each other more than money. A line can be a cab fare, a charger, a photo, or a promised call. Some lines close with payment; others close when someone follows through. A closed line stays in the story.

**Emotional proposition:** “I know what happened between us.” The immediate relief is not having to ask who paid. The deeper value is keeping the context of shared history without turning a friendship into an account statement.

**Product mythology:** the book is a small, private place for unfinished things. “Open the book,” “add a line,” “see what’s open,” and “we’re square” are recurring rituals. The mythology stays quiet: no fictional characters, invented memories, collectible badges, or forced lore.

**Personality:** observant, warm, dry, concise, slightly amused. It notices the awkward little detail; it never judges the people. Editorial restraint in the interface leaves room for a sharp line of copy when the moment earns it.

**Difference from finance software:** a finance tool starts with a number and a category. Udhaar starts with a person and a reason. It still shows amounts, direction, due dates, receipts, and status precisely. The emotional framing does not soften financial facts.

### The mental model

`Person → our page → open lines → money / favour / promise → what happened → resolution → history`

“Square” means there are no open or questioned lines between those people. A zero money balance alone does **not** mean square.

## 2. The voice contract

Write 90% like a person talking naturally and 10% like a good line in a book. The joke is usually the situation, not the user. Keep the number and status plain. Put the wit in the note, empty state, or success moment.

| Use | Avoid | Why |
| --- | --- | --- |
| person, line, book, tab, open, closed, square | debtor, creditor, transaction, obligation | The first set explains the relationship; the second turns it into a credit report. |
| “They owe you ₹240” | “Your receivable is ₹240” | Clear facts sound human. |
| “What was it for?” | “Enter transaction description” | A reason is part of the memory. |
| “Add a line” | “Create record” | An action with a place in the world. |
| “Question this line” | “Raise dispute case” | Clear without escalation. |
| “Nothing open right now” | “You won!” | Resolution is not a game. |

Never use insults, shame, fake urgency, “financial queen,” “bestie,” “slay,” random meme slang, finance bro language, “good/bad friend” scores, or invented social proof. “Bro” belongs only in a quoted real scenario or opted-in campaign, never as the default address to every user.

### The three line types

| Type | Human moment | Capture prompt | Open line | Closing line |
| --- | --- | --- | --- | --- |
| Money | Someone covered something. | “What was it for?” | “₹240 · Cab home · your turn” | “Cab home is square.” |
| Favour | Someone did or will do a thing for someone. | “What’s the favour?” | “Return my charger · still open” | “Charger returned. Finally.” |
| Promise | Someone said they would show up or follow through. | “What was promised?” | “Send the photos · still open” | “Photos sent. That one’s done.” |

Money labels always retain **who owes whom**. Favour and promise labels retain **who is waiting on whom**. Do not replace an amount with a joke, call a questioned line settled, or call a zero net balance square while other lines remain open.

### Relationship, group, sharing, and settlement language

- Relationship: “Between you two,” “Your page with Sana,” “Three lines still open,” “Nothing left open.” Use a person’s actual chosen name. Never imply a closeness the user has not expressed.
- Groups: “The Goa trip book,” “Who covered the cab?”, “Two shares still open.” Put the trip or occasion before the arithmetic.
- Sharing: “Send this line,” “Share this page,” “Names hidden,” “Choose what to show.” A preview must be accurate and names hidden by default on broad snapshot cards.
- Settlement: “Close this line,” “We’re square,” “That one’s done.” Reserve “square” for a page with no unresolved lines. “Settled” remains a useful exact status in history.
- Nudge: “A gentle reminder about dinner” rather than “Demand payment.” Never send automatically on the user’s behalf.

## 3. Two optional cultural voice paths

The brief calls these male-coded and female-coded experiences. They are **user-selected content styles**, not assumptions about gender, identity, competence, or behaviour. Product structure, privacy, accessibility, status labels, and money logic stay identical. Neutral copy is the default. A person can change styles or stay neutral; we never infer a style from a name, photo, friends, or device.

| Situation | Neutral | Male-coded: deadpan group chaos | Female-coded: conversational detail |
| --- | --- | --- | --- |
| Cab | “Cab home, line saved.” | “The ride ended. The cab argument can too.” | “Cab home. Now nobody needs the screenshot.” |
| Shared meal | “Dinner has a line in the book.” | “Dinner finished. The maths stayed for an encore.” | “Dinner was lovely. The ‘who paid?’ part is handled.” |
| Charger | “Return my charger is still open.” | “The charger has been on tour long enough.” | “Still waiting on the charger. Yes, the good one.” |
| Photos | “Send the photos is still open.” | “The photos are apparently in post-production.” | “You said you’d send the photos. They’re worth remembering.” |
| Group trip | “The trip has two open lines.” | “The trip ended. Two lines missed the memo.” | “The trip’s over; the little details stayed together.” |

These scenarios are available to everyone. Vary the rhythm of the sentence, not access to features. Do not imply men never plan or women always do. Roast late screenshots, forgotten chargers, and group chat archaeology; never roast a gender as a group.

**Cross-gender banter:** use only in optional campaign content where the joke is a shared situation. Example: “One person booked the cab. Six people remember paying.” Avoid gender conflict in transactional UI, reminders, and account notices. A joke must work when the genders are removed; if it does not, it is too dependent on a stereotype.

**Product setting:** Account → Voice offers Original, Deadpan, and Conversational. Original is the default; Deadpan and Conversational are the two optional cultural paths. The choice syncs with the account and changes selected examples and asides, not financial labels or private data. Expand the variant bank only when each path has enough real situations to avoid repetition.

## 4. The product narrative

### Onboarding

1. Recognition: “Who paid last time?” The cab and the promise both belong here.
2. Identity: “Let’s put a name to it.” A name and passcode, no contact scraping.
3. Trust: “Your book stays yours.” Explain precisely what an invite shares.
4. Context: choose currency for money lines; favours and promises carry no price.
5. People: “Who’s in the story?” Start with a name, privately.
6. First memory: “Put the first one down.” Person, type, direction, reason, optional date or receipt.
7. First ledger: show the line on that person’s page, with its real status and a clear way to share it.

Do not force a first line merely to complete setup. If someone skips, the empty page offers one obvious action and a concrete example.

### State copy

| Moment | Copy | Requirement |
| --- | --- | --- |
| No people | “It starts with one person.” / “Add someone privately. Invite them when you’re ready.” | One primary action. |
| Person, no lines | “Nothing on the tab yet.” / “First cab, coffee, charger, or promise?” | No fictional history. |
| Money nets to zero; lines remain | “Money evens out. Two lines are still unresolved.” | Count from real records. |
| Everything resolved | “All square, for now.” | Check open and questioned lines, not just the net amount. |
| Save money | “That’s one for the book.” / situational aside tied to the note. | Amount and direction remain visible. |
| Save favour | “No price tag. Still part of the story.” | Do not invent monetary value. |
| Save promise | “Saved before it becomes ‘wait, did we say that?’” | Show what was promised. |
| Settle | “Dinner is square.” | Actual state must be settled. |
| Question | “This line is marked questioned.” | Neither side is called dishonest. |
| Loading | “Opening your book…” | Use only when work is actually pending. |
| Offline write | “No connection. Your line is queued on this device.” | Match real queue behaviour. |
| Error | “Couldn’t save that line. Try again.” | Keep user input; explain if an action failed. |

Success animation can be a brief page turn, ink mark, or line closing. Keep motion under a second, respect reduced motion, and never celebrate that somebody owes money. Celebrate remembering or resolving a shared detail.

### Privacy language

- “Add them privately now. Send a personal link when you want them to see this page.”
- “A link can show its preview to whoever has it. Accepting connects this page to one account.”
- “If you choose an older page, its existing lines become shared too.”
- “Names are hidden on a snapshot until you choose to show them.”
- “We don’t read your contacts or message your friends for you.”

The app must not claim end-to-end encryption, automatic contact privacy, or that a share link is secret after the user forwards it. Private receipts are part of a connected ledger and should be visible only to its two participants.

## 5. Notifications and return

An alert is a small update from a real ledger event. It states the person and line where available, links to that line, and never creates a false deadline. Quiet by default: group repeated updates, allow muting, and keep a useful in-app history.

| Trigger | In-app line | Optional device notice |
| --- | --- | --- |
| New shared line | “Sana added ‘Cab home’ to your page.” | “New line with Sana: Cab home.” |
| Settled | “Cab home is square.” | “Sana closed the cab line.” |
| Promise due | “Send the photos is due tomorrow.” | “A promise with Sana is due tomorrow.” |
| Favour still open | “Return my charger is still open.” | Only if the user asked to be reminded. |
| Questioned | “Sana questioned the dinner line.” | “A line with Sana needs a look.” |
| Group change | “The trip book has a new line.” | One grouped notice, not one per person. |

The current app supports in-app activity and notices while open. Background push while closed is a future capability; the copy must not promise it now. Product update prompts are operational and should stay separate from social ledger alerts.

People return because life creates a new line, someone responds, a real due date arrives, or an existing page becomes useful. Do not create fake streaks, points, leaderboards, scarcity, or guilt loops.

## 6. Sharing, rituals, and social content

**Sharing ladder:** private line link → two-person page invite → optional redacted snapshot → group summary. At each step, show what will be revealed. Single-line cards carry person, type, direction, amount if any, reason, date, and status. Snapshot cards hide names until the user deliberately reveals them. A share card must never substitute design for truth.

**Rituals:** “open the book” when checking a person page; “add a line” after a real moment; “catch up” when reading updates; “close the line” after resolution; “we’re square” when nothing unresolved remains. Repetition makes vocabulary familiar without inventing gameplay.

**Social content pillars:** the cab nobody remembers; the roommate bill; the charger with a second home; the birthday dinner organiser; the trip booking; the photos that never arrived; the friend who always says “next time”; the tiny favour that mattered more than its price. Use recognisable details and varied people. Do not mine private user entries for marketing.

**Campaign concepts:**

1. “Who paid last time?” — short scenes where everyone confidently remembers a different answer. End on the line’s real context.
2. “Some tabs aren’t money.” — a charger, a photo, a lift, and a promised call, all in the same book.
3. “The group chat forgot.” — screenshots scrolling past a tiny agreement; the Udhaar page remembers it.
4. “Next time, actually.” — a promise that becomes a small shared story when kept.

Use observational humour with a calm, warm editorial layout. No meme wallpaper, fake chat screenshots presented as real, neon fintech gradients, or repeated artwork pasted into unrelated moments.

**Shareable concepts to explore:** a single-line card, a “we’re square” card, a trip page summary, a month of closed lines, and a year in the book. Each needs explicit privacy controls and facts from the ledger. Virality should come from someone wanting to send a useful or funny true artifact, not from forced invites.

## 7. Memory features and long-term expansion

Build memory surfaces from data that exists. A relationship timeline can show “Dinner logged in March” and “Dinner settled in April” only when those records exist. Monthly and yearly stories should be generated from actual timestamps, statuses, and notes; no invented highlights or emotional claims about a friendship.

| Experience | Human moment | Why care | Why return | Emotion | Fit in the world | Different from finance software |
| --- | --- | --- | --- | --- | --- | --- |
| Add a line | “Wait, who covered that?” | Keep person, reason, and direction together. | Life creates another small agreement. | Relief. | A new page in the book. | Starts with the person and context. |
| Two-person page | “What’s still between us?” | Both can see the same facts after accepting an invite. | A line changes or closes. | Trust. | One shared chapter. | Includes favours and promises. |
| Group book | “Who booked what for the trip?” | Context survives group-chat noise. | Someone pays or a split changes. | Clarity. | A chapter with several people. | The trip stays more important than totals. |
| Close a line | “We finally sorted dinner.” | Ends an awkward open loop. | The next real line happens later. | Ease. | The line remains in history. | Resolution is not a score. |
| Private share card | “Let me show you what’s open.” | Useful for a conversation or a screenshot. | When the page changes. | Confidence. | A page you choose to show. | Names hidden until chosen. |
| Relationship timeline | “Remember the concert tickets?” | Old context becomes findable. | A shared memory is useful. | Nostalgia. | A history of actual lines. | Includes non-money moments. |
| Monthly recap | “What stayed open this month?” | See real changes without hunting. | A new month has new events. | Perspective. | A chapter summary. | No artificial engagement metric. |
| Year in the book | “What happened between us this year?” | A factual keepsake to revisit or share. | The year closes. | Warmth. | A bound chapter. | Stories come from user records. |

Potential expansion: add receipt to an existing line, search a person’s history, grouped reminders with consent, export a single relationship page, optional month and year recaps. Only build these when real user behaviour shows the underlying moment is frequent and the privacy model is clear.

### A truthful month and year

- Month: “You opened 4 lines with 3 people. 2 closed. 2 are still open.” Use real counts and name examples only with explicit sharing consent.
- Year: “Your 2026 book: 18 lines closed, 3 still open. The oldest open one is ‘Return my charger’ from March.” Skip “oldest” if dates are absent or data is incomplete.
- If there is too little data: “This month’s book is quiet.” Do not pad with fake milestones.

## 8. Brand manifesto

People owe each other more than money.

A ride. A coffee. A charger that has lived at the wrong house for weeks. Photos someone promised to send. A dinner, a favour, a next time.

Some of these things have a price. Some do not. Some are sorted that night. Some stay open long enough to become a joke.

The details live in chats, screenshots, and memory until nobody is quite sure what happened.

Udhaar gives those little things a place. A person, a reason, a line, and the whole small story around it. When it’s done, the line closes. The memory stays.

## 9. Homepage messaging

**Hero:** “Who paid last time?”

**Support:** “The cab. The borrowed charger. The photos someone promised. Keep the little things between people in one place.”

**Primary action:** “Start your book.” **Secondary:** “Take a look first.”

**Proof in the interface:** show a person’s real reason beside a money amount, and show that favours and promises are also lines. Any example artwork must be clearly illustrative, never passed off as a user’s real memory.

**Trust line:** “Add people privately. Share a page when you choose.” This is more useful than a vague promise of total privacy.

## 10. Rules that stop feature creep

1. Name the real human moment before approving a feature. If it has no person, shared context, or memory value, it likely does not belong.
2. State the exact data needed to make the experience truthful. Do not invent a relationship insight from a balance alone.
3. Show the privacy boundary before adding a new share, recap, or social surface.
4. Keep money direction and status explicit, even when the copy is playful.
5. Never reward debt, lateness, or app opens with points or badges.
6. Prefer one small useful action over a dashboard of metrics.
7. Test new language aloud. If it sounds like a campaign inside a settings panel, shorten it.
8. Retire jokes that repeat too often; a copy bank needs variation without changing the factual message.
9. Keep optional cultural voice paths opt-in and reversible. The neutral product must stand on its own.
10. Measure repeat value by real lines added, resolved, revisited, or intentionally shared, not by time spent in the app.
