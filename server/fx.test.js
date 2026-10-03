import test from 'node:test';
import assert from 'node:assert/strict';
import { convertAmount, distributeConverted } from './fx.js';

test('conversion keeps cents and refuses amounts that would disappear', () => {
  assert.equal(convertAmount(250, 0.0104), 2.6);
  assert.throws(() => convertAmount(0.01, 0.0104), /too small/i);
});

test('converted split shares add up to the converted bill', () => {
  const converted = distributeConverted([33, 33, 34], 0.0104);
  assert.deepEqual(converted, [0.34, 0.34, 0.36]);
  assert.equal(converted.reduce((a, b) => a + b, 0).toFixed(2), '1.04');
});
