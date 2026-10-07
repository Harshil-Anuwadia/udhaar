import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'udhaar-billing-regressions-'));
process.env.DATA_DIR = directory;
process.env.TURSO_DATABASE_URL = `file:${path.join(directory, 'test.db')}`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
process.env.RAZORPAY_KEY_ID = 'rzp_test_fixture';
process.env.RAZORPAY_KEY_SECRET = crypto.randomBytes(32).toString('hex');
const [{ default: app }, { db, newId }, { signAccess }, { paymentGateway }] = await Promise.all([
  import('./index.js'), import('./db.js'), import('./auth.js'), import('./billing.js'),
]);
await db.ready;
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let counter = 0;
const payments = new Map();
paymentGateway.createOrder = async input => ({ id: `order_test${++counter}`, ...input });
paymentGateway.fetchPayment = async id => {
  if (!payments.has(id)) throw new Error('Synthetic provider unavailable');
  return payments.get(id);
};
after(async () => {
  await new Promise(resolve => server.close(resolve));
  await db.close();
  await fs.rm(directory, { recursive: true, force: true });
});

async function user() {
  const id = newId('u');
  await db.prepare('INSERT INTO users (id,handle,name,password_hash,created_at,last_seen_at) VALUES (?,?,?,?,?,?)')
    .run(id, `billing${++counter}`, 'Billing fixture', 'unused-hash', Date.now(), Date.now());
  return { id, token: signAccess(await db.prepare('SELECT * FROM users WHERE id = ?').get(id)) };
}
async function call(who, method, route, body = {}) {
  const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${who.token}` }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}
const plan = async who => (await db.prepare('SELECT plan FROM users WHERE id = ?').get(who.id)).plan;
async function purchase(who) {
  const created = await call(who, 'POST', '/api/me/create-order');
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const paymentId = `pay_test${++counter}`;
  payments.set(paymentId, { id: paymentId, order_id: created.data.order_id, amount: created.data.amount, currency: created.data.currency, status: 'captured', captured: true });
  return {
    razorpay_order_id: created.data.order_id, razorpay_payment_id: paymentId,
    razorpay_signature: crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${created.data.order_id}|${paymentId}`).digest('hex'),
  };
}

test('B01: profile fields cannot grant or remove paid entitlements', async () => {
  const who = await user();
  for (const input of ['plus', 'free', null, ['plus'], { plan: 'plus' }]) {
    assert.equal((await call(who, 'PATCH', '/api/me/profile', { plan: input })).status, 400);
    assert.equal(await plan(who), 'free');
  }
  const profile = await call(who, 'PATCH', '/api/me/profile', { name: 'Updated name', theme: 'dark', voiceMode: 'male' });
  assert.equal(profile.status, 200);
  assert.deepEqual([profile.data.user.name, profile.data.user.theme, profile.data.user.voiceMode], ['Updated name', 'dark', 'male']);
  await db.prepare("UPDATE users SET plan = 'plus' WHERE id = ?").run(who.id);
  assert.equal((await call(who, 'PATCH', '/api/me/profile', { plan: 'free' })).status, 400);
  assert.equal(await plan(who), 'plus');
});

test('B02: a captured purchase activates only its owner and retries return the same result', async () => {
  const owner = await user();
  const stranger = await user();
  const receipt = await purchase(owner);
  const saved = await db.prepare('SELECT user_id, amount, currency FROM payment_orders WHERE id = ?').get(receipt.razorpay_order_id);
  assert.deepEqual(saved, { user_id: owner.id, amount: 4900, currency: 'INR' });
  assert.equal((await call(stranger, 'POST', '/api/me/verify-payment', receipt)).status, 404);
  assert.equal(await plan(stranger), 'free');
  // An order retains its original price even if the owner changes currency.
  await db.prepare("UPDATE users SET currency = 'USD' WHERE id = ?").run(owner.id);
  const confirmations = await Promise.all([
    call(owner, 'POST', '/api/me/verify-payment', receipt),
    call(owner, 'POST', '/api/me/verify-payment', receipt),
  ]);
  assert.deepEqual(confirmations.map(r => r.status), [200, 200]);
  assert.equal(await plan(owner), 'plus');
  assert.equal((await call(stranger, 'POST', '/api/me/verify-payment', receipt)).status, 404);
  assert.equal(await plan(stranger), 'free');
  const consumed = await db.prepare('SELECT payment_id, paid_at FROM payment_orders WHERE id = ?').get(receipt.razorpay_order_id);
  assert.equal(consumed.payment_id, receipt.razorpay_payment_id);
  assert.ok(consumed.paid_at);
});

for (const [name, replacement] of [
  ['authorized but uncaptured payment', { status: 'authorized', captured: false }],
  ['wrong amount', { amount: 1 }],
  ['wrong currency', { currency: 'USD' }],
  ['different order', { order_id: 'order_other' }],
  ['different payment', { id: 'pay_other' }],
]) test(`B02: ${name} cannot activate Plus`, async () => {
  const who = await user();
  const receipt = await purchase(who);
  payments.set(receipt.razorpay_payment_id, { ...payments.get(receipt.razorpay_payment_id), ...replacement });
  assert.equal((await call(who, 'POST', '/api/me/verify-payment', receipt)).status, 409);
  assert.equal(await plan(who), 'free');
  assert.equal((await db.prepare('SELECT payment_id FROM payment_orders WHERE id = ?').get(receipt.razorpay_order_id)).payment_id, null);
});

test('B02: forged, malformed and unknown-order callbacks cannot activate Plus', async () => {
  const who = await user();
  const receipt = await purchase(who);
  for (const data of [
    { ...receipt, razorpay_signature: '0'.repeat(64) },
    { ...receipt, razorpay_signature: ['0'.repeat(64)] },
    { ...receipt, razorpay_order_id: { toString: receipt.razorpay_order_id } },
    { ...receipt, razorpay_payment_id: [receipt.razorpay_payment_id] },
    { ...receipt, razorpay_order_id: 'order_unknown' },
  ]) assert.ok([400, 404].includes((await call(who, 'POST', '/api/me/verify-payment', data)).status));
  assert.equal(await plan(who), 'free');
});

test('B02: payment consumption and entitlement activation roll back together on database failure', async () => {
  const who = await user();
  const receipt = await purchase(who);
  const originalTransaction = db.transaction;
  db.transaction = callback => originalTransaction(tx => callback({ ...tx, prepare(sql) {
    const statement = tx.prepare(sql);
    if (sql.startsWith("UPDATE users SET plan = 'plus'")) statement.run = async () => { throw new Error('Synthetic database failure'); };
    return statement;
  } }));
  try { assert.equal((await call(who, 'POST', '/api/me/verify-payment', receipt)).status, 503); }
  finally { db.transaction = originalTransaction; }
  assert.equal(await plan(who), 'free');
  assert.equal((await db.prepare('SELECT payment_id FROM payment_orders WHERE id = ?').get(receipt.razorpay_order_id)).payment_id, null);
  assert.equal((await call(who, 'POST', '/api/me/verify-payment', receipt)).status, 200);
  assert.equal(await plan(who), 'plus');
});

test('B02: unavailable gateway does not consume a receipt and confirmation remains retryable', async () => {
  const who = await user();
  const receipt = await purchase(who);
  const payment = payments.get(receipt.razorpay_payment_id);
  payments.delete(payment.id);
  assert.equal((await call(who, 'POST', '/api/me/verify-payment', receipt)).status, 503);
  assert.equal(await plan(who), 'free');
  payments.set(payment.id, payment);
  assert.equal((await call(who, 'POST', '/api/me/verify-payment', receipt)).status, 200);
});

test('B02: a genuine pre-upgrade order can be recovered from its provider-owned receipt', async () => {
  const owner = await user();
  const stranger = await user();
  const orderId = `order_legacy${++counter}`;
  const paymentId = `pay_legacy${++counter}`;
  const legacy = { id: orderId, receipt: `rcpt_${owner.id}_${Date.now()}`, currency: 'INR', amount: 4900 };
  paymentGateway.fetchOrder = async id => { assert.equal(id, orderId); return legacy; };
  payments.set(paymentId, { id: paymentId, order_id: orderId, amount: 4900, currency: 'INR', status: 'captured', captured: true });
  const receipt = { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex') };
  assert.equal((await call(stranger, 'POST', '/api/me/verify-payment', receipt)).status, 404);
  assert.equal((await call(owner, 'POST', '/api/me/verify-payment', receipt)).status, 200);
  assert.equal(await plan(owner), 'plus');
  assert.equal(await plan(stranger), 'free');
  assert.equal((await db.prepare('SELECT user_id FROM payment_orders WHERE id = ?').get(orderId)).user_id, owner.id);
});
