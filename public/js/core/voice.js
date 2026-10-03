/* Situational voice for the small moments. Stable per record: rerenders never
   make the app seem to change its mind. Labels and amounts stay factual. */
import { hashString } from './utils.js';
import { state } from './store.js';

const pick = (lines, seed) => lines[hashString(String(seed ?? '')) % lines.length];
const mode = () => state.user?.voiceMode || 'neutral';

const FLAVOUR = {
  male: {
    money: ['The detail has a place outside the group chat.', 'That number has a line now.', 'Someone paid. The book remembers who.'],
    favor: ['No price tag. Still not forgotten.', 'That favour has its own line now.', 'The small stuff deserves a place too.'],
    gesture: ['The plan is in writing now. Gently.', 'That promise has a place to live.', 'A promise, saved without a speech.'],
    square: ['Nothing open. A rare group achievement.', 'The book is quiet. For now.'],
    positive: ['Your side is written down.', 'You covered it. The book kept the details.'],
    negative: ['Your turn is here when you need it.', 'A few lines on your side. No mystery.'],
    owedByMe: ['What did they cover?', 'Cab, snacks, or something else?'],
    owedToMe: ['What did you cover?', 'What was the “I got this” for?'],
  },
  female: {
    money: ['The number stayed with the story.', 'The moment and the detail are here together.', 'The detail has a place outside the chat.'],
    favor: ['A small favour can be a whole story.', 'No price tag. Still worth keeping.', 'The little details matter too.'],
    gesture: ['You said it. Now it has a place.', 'Saved before “did we actually plan that?”', 'This one can stay between you, clearly.'],
    square: ['Everything’s closed. The story stays.', 'Nothing open between your people right now.'],
    positive: ['You covered it. The reason is right here.', 'The amount and the moment stayed together.'],
    negative: ['Your side of the story is here.', 'A few lines are waiting on you, with the details.'],
    owedByMe: ['What did they cover for you?', 'Which little moment was this?'],
    owedToMe: ['What did you cover for them?', 'Dinner, tickets, or that one shared cab?'],
  },
};
const styled = (key, neutral, seed) => pick(FLAVOUR[mode()]?.[key] || neutral, seed);

const SITUATIONS = [
  { test: /game|gaming|valorant|fifa|esport|lobby/i,
    lines: ['Game night ended. The snack tab survived.', 'Someone bought the snacks. Now you know who.', 'The score got forgotten. The snack split did not.'] },
  { test: /grocery|grocer|shopping|market|order|delivery|swiggy|zomato|blinkit|zepto/i,
    lines: ['That shared basket has a place in the book.', 'The shopping detail can wait here.', 'The cart has a line of its own now.'] },
  { test: /dinner|lunch|breakfast|food|pizza|burger|biryani|restaurant|canteen|chai|coffee|snack|brunch/i,
    lines: ['The moment was the point. This line keeps the detail.', 'The food tab has a place outside the chat.', 'One less “who paid?” later.'],
    male: ['The food is gone. The split has a line.', 'The table cleared. The detail survived.'],
    female: ['The moment was better than the maths. Both are here.', 'The good part was being there. The detail is saved.'] },
  { test: /cab|uber|ola|auto|ride|metro|train|bus|petrol|fuel|parking/i,
    lines: ['The ride has a fare. This keeps its context.', 'One ride, one clear line.', 'The travel detail is saved.'],
    male: ['The ride has a line now. Easy.', 'The travel detail can live outside the chat.'],
    female: ['The ride has its details attached.', 'The fare and the reason are together.'] },
  { test: /concert|ticket|gig|show|movie|cinema|fest|festival|game|match/i,
    lines: ['The ticket has a story. This is one line of it.', 'The show’s detail has a place now.', 'No hunting through the ticket chat later.'] },
  { test: /rent|wi.?fi|wifi|bill|electric|internet|subscription|netflix|spotify|hostel|flat/i,
    lines: ['The shared bill has its place.', 'The shared bill has a line of its own.', 'The household detail is saved.'] },
  { test: /birthday|gift|present|party|trip|holiday|vacation/i,
    lines: ['The plan gets the memories. This keeps the small print.', 'The shared detail has a place now.', 'The details are here with the occasion.'] },
  { test: /lend|lent|borrow|loan|cash|upi|advance/i,
    lines: ['The lending detail has a date now.', 'Lent it, noted it, still friends.', 'A clear line for money between people.'] },
];

const GENERIC = [
  'One less “wait, who covered that?” later.',
  'A small detail, kept where you can find it.',
  'What happened has a place to live.',
  'A line now. Less guessing later.',
];

export function savedMomentCopy({ kind = 'money', direction = 'owed_to_me', note = '', seed = '' } = {}) {
  if (kind === 'favor') return {
    title: 'That’s one for the book.',
    aside: styled('favor', ['No price tag. Still part of the story.', 'The little things are easy to forget.', 'A favour can stay open without a number.'], seed),
  };
  if (kind === 'gesture') return {
    title: 'That’s one for the book.',
    aside: styled('gesture', ['Saved before it becomes “wait, did we say that?”', 'A promise has somewhere to live now.', 'The plan is small. Remembering it matters.'], seed),
  };
  const category = SITUATIONS.find(({ test }) => test.test(note));
  return {
    title: 'That’s one for the book.',
    aside: category ? pick(category[mode()] || category.lines, seed) : styled('money', GENERIC, seed),
  };
}

export function friendQuietCopy({ hasHistory = false, seed = '' } = {}) {
  return hasHistory
    ? { title: pick(['All square', 'Nothing left open', 'The tab is clear'], seed), body: pick([
        'Nothing open between you two right now.',
        'Every line is closed. The story is still here.',
        'The book is quiet until the next cab or coffee.',
      ], `${seed}:body`) }
    : { title: 'Nothing on the tab yet', body: pick([
        'First cab, coffee, or “I got this” moment? Put it here.',
        'The next shared chai can start the story.',
        'No lines yet. That is either excellent planning or day one.',
      ], seed) };
}

export function homeVerdict({ net = 0, friends = 0, openEntries = 0, seed = '' } = {}) {
  if (!friends) return 'Add someone. The first line comes when life does.';
  if (!net && openEntries) return `${openEntries} ${openEntries === 1 ? 'line is' : 'lines are'} still unresolved in your book.`;
  if (!net) return styled('square', ['Nothing open right now.', 'All square, for now.', 'The book is quiet today.'], seed);
  if (net > 0) return styled('positive', ['Those “I’ll send it” moments, in one place.', 'You covered something. The details are here.', 'Your side of the story is saved.'], seed);
  return styled('negative', ['Your side of the tab is right here.', 'A few lines are waiting on you.', 'What you owe, with the details attached.'], seed);
}

export function moneyNotePrompt({ direction = 'owed_to_me', seed = '' } = {}) {
  return direction === 'owed_by_me'
    ? styled('owedByMe', ['They covered the cab?', 'Their treat? Or your half?', 'What did they pay for?'], seed)
    : styled('owedToMe', ['You covered dinner?', 'That “I got this” was for…', 'Coffee, ticket, flat bill?'], seed);
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
