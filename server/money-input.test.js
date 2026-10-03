import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMoneyInput } from '../public/js/core/utils.js';

test('amount typing groups digits by the chosen currency without changing the numeric value', () => {
  assert.equal(formatMoneyInput('100000', 'INR'), '1,00,000');
  assert.equal(formatMoneyInput('100000', 'USD'), '100,000');
  assert.equal(formatMoneyInput('001250', 'INR'), '1,250');
  assert.equal(formatMoneyInput('0', 'INR'), '0');
  assert.equal(formatMoneyInput('', 'INR'), '');
});
