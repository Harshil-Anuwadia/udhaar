import assert from 'node:assert/strict';
import { savedMomentCopy, friendQuietCopy, homeVerdict, moneyNotePrompt, sharedLineCopy } from '../public/js/core/voice.js';
import { formatDate } from '../public/js/core/utils.js';

const dinner = savedMomentCopy({ kind: 'money', direction: 'owed_to_me', note: 'Dinner split', seed: 'dinner-1' });
const cab = savedMomentCopy({ kind: 'money', direction: 'owed_by_me', note: 'Cab home', seed: 'cab-1' });
const ticket = savedMomentCopy({ kind: 'money', direction: 'owed_to_me', note: 'Concert ticket', seed: 'ticket-1' });
assert.match(dinner.aside, /dinner|food|bill|table/i, 'food note gets food-specific copy');
assert.match(cab.aside, /cab|ride|driver|fare/i, 'transport note gets transport-specific copy');
assert.match(ticket.aside, /ticket|show|gig|concert/i, 'ticket note gets ticket-specific copy');
assert.match(savedMomentCopy({ kind: 'money', note: 'Grocery run', seed: 'shop' }).aside, /grocery|cart|checkout|basket/i, 'shopping has its own voice');
assert.match(savedMomentCopy({ kind: 'money', note: 'Game night snacks', seed: 'game' }).aside, /game|snack|lobby|score/i, 'game-night notes have their own voice');
assert.notEqual(dinner.aside, cab.aside, 'different situations do not repeat one generic line');
assert.deepEqual(savedMomentCopy({ kind: 'money', direction: 'owed_to_me', note: 'Dinner split', seed: 'dinner-1' }), dinner, 'copy is stable for the same saved entry');

const fallback = new Set(Array.from({ length: 20 }, (_, i) => savedMomentCopy({ kind: 'money', direction: 'owed_to_me', note: '', seed: `entry-${i}` }).aside));
assert.ok(fallback.size >= 4, 'ordinary entries have several variations');
assert.ok(![...fallback].some((line) => /paid|settled|sent money/i.test(line)), 'saving an entry does not claim money changed hands');
assert.match(savedMomentCopy({ kind: 'favor', direction: 'owed_by_me', note: 'Return charger', seed: 'f1' }).title, /favour|promise/i, 'non-money entries are described honestly');

const quiet = friendQuietCopy({ name: 'Sana', hasHistory: true, seed: 'sana' });
assert.ok(quiet.title && quiet.body, 'quiet ledger gives a complete empty state');
assert.ok(!quiet.body.includes('undefined'), 'quiet copy never interpolates missing data');
assert.notEqual(homeVerdict({ net: 50, friends: 2, seed: 'me' }), homeVerdict({ net: -50, friends: 2, seed: 'me' }), 'home copy respects balance direction');
assert.notEqual(moneyNotePrompt({ direction: 'owed_to_me', seed: 'sana' }), moneyNotePrompt({ direction: 'owed_by_me', seed: 'sana' }), 'the note hint reflects who covered it');
assert.match(sharedLineCopy({ kind: 'money', direction: 'owed_to_me', note: 'Dinner split', formattedAmount: '₹120', url: 'https://example.test/line' }), /Dinner split.*₹120.*https:\/\/example\.test\/line/s, 'shared money line includes the context and actual amount');
assert.match(sharedLineCopy({ kind: 'favor', direction: 'owed_by_me', note: 'Return your charger', url: 'https://example.test/line' }), /favour.*Return your charger/i, 'shared favour is grammatical');
assert.doesNotMatch(sharedLineCopy({ kind: 'gesture', direction: 'owed_to_me', note: 'Plan the trip', url: 'https://example.test/line' }), /our Plan|owe you.*\(/, 'promise sharing avoids money phrasing');
assert.doesNotMatch(formatDate(Date.UTC(2026, 9, 2), { year: false }), /2026/, 'a compact ledger date omits the year without throwing');
console.log('Voice tests passed.');
