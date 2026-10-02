/* Situational voice for the small moments. Stable per record: rerenders never
   make the app seem to change its mind. Labels and amounts stay factual. */
import { hashString } from './utils.js';

const pick = (lines, seed) => lines[hashString(String(seed ?? '')) % lines.length];

const SITUATIONS = [
  { test: /game|gaming|valorant|fifa|esport|lobby/i,
    lines: ['Game night has a score. The snack split has one too.', 'Good lobby, clear snack maths.', 'The game ended. The split did not have to be a side quest.'] },
  { test: /grocery|grocer|shopping|market|order|delivery|swiggy|zomato|blinkit|zepto/i,
    lines: ['The grocery run has a receipt trail now.', 'Checkout done. Split remembered.', 'The cart was shared; the maths is sorted.'] },
  { test: /dinner|lunch|breakfast|food|pizza|burger|biryani|restaurant|canteen|chai|coffee|snack|brunch/i,
    lines: ['Dinner split, sorted. Back to dessert.', 'No one has to redo the table maths.', 'The food was good. The split is saved.'] },
  { test: /cab|uber|ola|auto|ride|metro|train|bus|petrol|fuel|parking/i,
    lines: ['The ride ended. The fare did not disappear.', 'Cab math: finally somewhere other than the group chat.', 'Even the driver would approve of this receipt trail.'] },
  { test: /concert|ticket|gig|show|movie|cinema|fest|festival|game|match/i,
    lines: ['Ticket secured. Plot twist: the split is remembered too.', 'The show has a paper trail now.', 'Future you won’t have to search the ticket chat.'] },
  { test: /rent|wi.?fi|wifi|bill|electric|internet|subscription|netflix|spotify|hostel|flat/i,
    lines: ['The shared bill can stop haunting the chat.', 'Monthly split, now with an actual memory.', 'Household math belongs here, not in 46 screenshots.'] },
  { test: /birthday|gift|present|party|trip|holiday|vacation/i,
    lines: ['The plan was fun. The split can be boring.', 'Good memories, clear numbers.', 'Group-plan accounting without the group-chat archaeology.'] },
  { test: /lend|lent|borrow|loan|cash|upi|advance/i,
    lines: ['The “I’ll send it” now has a timestamp.', 'No need to scroll back to the UPI screenshot.', 'Lent it, noted it, still friends.'] },
];

const GENERIC = [
  'One less “wait, who covered that?” later.',
  'The group chat can retire as an accountant.',
  'Future you just got a tiny favour.',
  'No screenshot archaeology required.',
  'That “I’ll send it” has a place to live.',
  'A small line now. A much easier conversation later.',
];

export function savedMomentCopy({ kind = 'money', direction = 'owed_to_me', note = '', seed = '' } = {}) {
  if (kind === 'favor') return {
    title: 'Favour noted.',
    aside: pick(['No price tag, still worth remembering.', 'Good karma deserves a paper trail.', 'The little things count too.'], seed),
  };
  if (kind === 'gesture') return {
    title: 'Promise noted.',
    aside: pick(['Saved before it becomes “wait, did we say that?”', 'Future plans, less detective work.', 'A promise is easier to keep when it has a home.'], seed),
  };
  const category = SITUATIONS.find(({ test }) => test.test(note));
  return {
    title: 'In the book.',
    aside: pick(category?.lines || GENERIC, seed),
  };
}

export function friendQuietCopy({ hasHistory = false, seed = '' } = {}) {
  return hasHistory
    ? { title: pick(['All square', 'Nothing hanging', 'The tab is clear'], seed), body: pick([
        'The ledger is quiet. Enjoy it until the next chai.',
        'No open lines. The group chat can talk about literally anything else.',
        'Everything here is settled. A rare, peaceful screenshot.',
      ], `${seed}:body`) }
    : { title: 'Nothing on the tab yet', body: pick([
        'First cab, coffee, or “I got this” moment? Put it here.',
        'The next shared chai can start the story.',
        'No lines yet. That is either excellent planning or day one.',
      ], seed) };
}

export function homeVerdict({ net = 0, friends = 0, seed = '' } = {}) {
  if (!friends) return 'Add a person. The shared-spend lore starts there.';
  if (!net) return pick(['All square. Screenshot this feeling.', 'Everyone is even. Suspiciously peaceful.', 'The book is balanced. Main-character calm.'], seed);
  if (net > 0) return pick(['Those “I’ll send it” moments, in one place.', 'Your money has a return address.', 'The group-chat IOUs finally have a home.'], seed);
  return pick(['Your turn to settle a few “I’ll send it” moments.', 'A gentle reminder from your future self.', 'Your side of the tab is right here.'], seed);
}

export function moneyNotePrompt({ direction = 'owed_to_me', seed = '' } = {}) {
  return direction === 'owed_by_me'
    ? pick(['They covered the cab?', 'Their treat? Or your half?', 'What did they pay for?'], seed)
    : pick(['You covered dinner?', 'That “I got this” was for…', 'Coffee, ticket, flat bill?'], seed);
}

export function sharedLineCopy({ kind = 'money', direction = 'owed_to_me', note = '', formattedAmount = '', url = '' } = {}) {
  const detail = String(note).trim();
  if (kind === 'favor') {
    return `Hey — I noted a favour ${direction === 'owed_to_me' ? 'you owe me' : 'I owe you'} in our udhaar ledger: “${detail}.” View the line: ${url}`;
  }
  if (kind === 'gesture') {
    return `Hey — I saved our promise in udhaar: “${detail}.” View the line: ${url}`;
  }
  const what = detail || 'our split';
  return `Hey — I noted ${what} (${formattedAmount}) in our udhaar ledger. ${direction === 'owed_to_me' ? 'You owe me for this one.' : 'I owe you for this one.'} View the line: ${url}`;
}
