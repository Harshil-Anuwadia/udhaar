import test from 'node:test';
import assert from 'node:assert/strict';
import { journalDays, paymentPreview } from '../public/js/core/journal-helpers.js';

const day = (value) => new Date(`${value}T12:00:00`).getTime();
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
