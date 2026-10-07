import test from 'node:test';
import assert from 'node:assert/strict';
import { filterLedger, ledgerSummary, journalDays, paymentPreview } from '../public/js/core/ledger-review.js';

const day = (value) => new Date(`${value}T12:00:00`).getTime();
const lines = [
  { id: 'a', kind: 'money', status: 'open', direction: 'owed_to_me', amount: 100.25, createdAt: day('2026-09-30'), dueAt: day('2026-10-01'), note: 'Train tickets', friend: { name: 'Sana' } },
  { id: 'b', kind: 'money', status: 'open', direction: 'owed_by_me', amount: 40.10, createdAt: day('2026-10-02'), note: 'Dinner', friend: { name: 'Arjun' } },
  { id: 'c', kind: 'money', status: 'settled', direction: 'owed_to_me', amount: 50, createdAt: day('2026-10-01'), dueAt: day('2026-10-01') },
  { id: 'd', kind: 'money', status: 'disputed', direction: 'owed_to_me', amount: 800, createdAt: day('2026-10-02') },
  { id: 'e', kind: 'favor', status: 'open', direction: 'owed_to_me', amount: 0, createdAt: day('2026-10-02') },
];

test('ledger balances include open money only, keep cents, and count non-money lines separately', () => {
  assert.deepEqual(ledgerSummary(lines), { count: 5, open: 3, settled: 1, questioned: 1, owedToYou: 100.25, youOwe: 40.1, net: 60.15 });
});

test('overdue review excludes settled lines and combines person search with direction', () => {
  assert.deepEqual(filterLedger(lines, { status: 'overdue', search: ' SANA ', direction: 'owed_to_me' }, day('2026-10-07')).map(x => x.id), ['a']);
  assert.deepEqual(filterLedger(lines, { status: 'overdue', search: 'Arjun' }, day('2026-10-07')), []);
});

test('month selection uses the recorded date and search also finds notes', () => {
  assert.deepEqual(filterLedger(lines, { month: '2026-10', search: 'train' }), []);
  assert.deepEqual(filterLedger(lines, { month: '2026-09', search: 'tickets' }).map(x => x.id), ['a']);
});

test('search recognises the promise and favour names shown in the interface', () => {
  const entries = [{ ...lines[4], id: 'promise', kind: 'gesture' }, lines[4]];
  assert.deepEqual(filterLedger(entries, { search: 'promise' }).map(x => x.id), ['promise']);
  assert.deepEqual(filterLedger(entries, { search: 'favour' }).map(x => x.id), ['e']);
});

test('journal combines moments and entries in newest-first local days without mutating input', () => {
  const input = [{ id: 'old', at: day('2026-09-30') }, { id: 'new', at: day('2026-10-02') }, { id: 'same-day', at: day('2026-10-02') + 1 }];
  const result = journalDays(input);
  assert.deepEqual(result.map(x => x.key), ['2026-10-02', '2026-09-30']);
  assert.deepEqual(result[0].items.map(x => x.id), ['same-day', 'new']);
  assert.equal(input[0].id, 'old');
});

test('payment preview preserves fractional balances and rejects invalid or excessive amounts', () => {
  assert.deepEqual(paymentPreview('40.10', 100.25), { valid: true, amount: 40.1, remaining: 60.15, error: '' });
  assert.equal(paymentPreview('100.25', 100.25).remaining, 0);
  for (const value of ['', '0', '-1', '0.001', '1e2', '101', 'Infinity', '10,000']) {
    assert.equal(paymentPreview(value, 100.25).valid, false, value);
  }
});
