// Mobile browser regressions. Run: node --test scripts/client-regressions.mjs
// Requires Chromium at CHROMIUM_PATH or /usr/bin/chromium.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright-core';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'udhaar-client-regressions-'));
process.env.DATA_DIR = directory;
process.env.TURSO_DATABASE_URL = `file:${path.join(directory, 'audit.db')}`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
process.env.RAZORPAY_KEY_ID = 'rzp_test_fixture';
process.env.RAZORPAY_KEY_SECRET = crypto.randomBytes(32).toString('hex');
const [{ default: app }, { db, newId }, auth] = await Promise.all([
  import('../server/index.js'), import('../server/db.js'), import('../server/auth.js'),
]);
const { paymentGateway } = await import('../server/billing.js');
await db.ready;
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const actualFetch = globalThis.fetch;
const password = 'isolated-client-audit-password';
const passwordHash = auth.hashSecret(password);
let counter = 0;
let browser;
after(async () => {
  await browser?.close();
  globalThis.fetch = actualFetch;
  await new Promise(resolve => server.close(resolve));
  await db.close();
  await fs.rm(directory, { recursive: true, force: true });
});

async function fixture() {
  const id = newId('u');
  const handle = `clientaudit${++counter}`;
  await db.prepare(`INSERT INTO users (id,handle,name,password_hash,onboarded,created_at,last_seen_at)
    VALUES (?,?,?,?,1,?,?)`).run(id, handle, handle, passwordHash, Date.now(), Date.now());
  const token = auth.signAccess(await db.prepare('SELECT * FROM users WHERE id = ?').get(id));
  const friendshipId = newId('f');
  await db.prepare(`INSERT INTO friendships (id,owner_id,handle,name,created_at) VALUES (?,?,?,?,?)`)
    .run(friendshipId, id, 'auditperson', 'Audit person', Date.now());
  return { id, handle, token, friendshipId };
}

async function pageFor(who) {
  browser ??= await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.addInitScript(token => localStorage.setItem('udhaar.at', token), who.token);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/#/you`);
  await page.locator('[data-set="export"]').waitFor({ timeout: 8000 }).catch(async error => {
    console.error('Audit browser fixture URL:', page.url());
    console.error('Audit browser fixture text:', (await page.locator('body').innerText()).slice(0, 1600));
    console.error('Audit browser fixture exceptions:', JSON.stringify(errors));
    throw error;
  });
  return { page, context };
}

test('B15: exporting a ledger with more than 200 lines must export every line', async t => {
  const a = await fixture();
  await db.transaction(async tx => {
    for (let i = 0; i < 205; i++) {
      await tx.prepare(`INSERT INTO entries (id,friendship_id,owner_id,kind,direction,amount,status,created_at,settled_at)
        VALUES (?,?,?,'money','owed_to_me',1,'settled',?,?)`).run(newId('e'), a.friendshipId, a.id, Date.now() + i, Date.now() + i);
    }
  });
  const { page, context } = await pageFor(a);
  try {
    await page.locator('[data-set="export"]').click();
    await page.getByRole('dialog').locator('.stat').first().waitFor();
    const visibleCount = Number(await page.getByRole('dialog').locator('.stat b').first().innerText());
    t.diagnostic(`Database contains 205 ledger lines; export UI contains ${visibleCount}`);
    assert.equal(visibleCount, 205, 'the export includes every financial line');
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download JSON' }).click();
    const download = await downloaded;
    const exported = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
    assert.equal(exported.entries.length, 205);
    assert.equal(new Set(exported.entries.map(row => row.id)).size, 205, 'pagination neither skips nor duplicates lines');
  } finally { await context.close(); }
});

test('B16: a failed account deletion must not tell the user their account was erased', async t => {
  const a = await fixture();
  const { page, context } = await pageFor(a);
  try {
    await page.route('**/api/me/account', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'isolated_failure', message: 'Isolated audit: deletion unavailable' }) }));
    await page.locator('[data-set="delete"]').click();
    await page.locator('#del-confirm').fill('DELETE');
    const deletionResponse = page.waitForResponse(response => response.url().endsWith('/api/me/account') && response.request().method() === 'DELETE');
    await page.getByRole('button', { name: 'Erase everything' }).click();
    assert.equal((await deletionResponse).status(), 503);
    await page.waitForTimeout(300);
    const stillExists = await db.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').get(a.id);
    const claimsSuccess = await page.getByText('Gone. Start again whenever.', { exact: true }).count();
    t.diagnostic(`Deletion response HTTP 503, account still exists ${stillExists.n === 1}; success toast shown ${claimsSuccess === 1}`);
    assert.equal(claimsSuccess, 0, 'a failed deletion must not announce erasure');
    assert.equal(stillExists.n, 1);
    assert.ok(await page.getByRole('dialog').count(), 'the deletion sheet remains available for retry');
    assert.ok(await page.locator('[data-set=\"export\"]').count(), 'the signed-in account remains on screen');
  } finally { await context.close(); }
});


test('B02: payment confirmation retries survive reload without purchasing again', async () => {
  const a = await fixture();
  const { page, context } = await pageFor(a);
  const orderId = 'order_pendingfixture';
  const paymentId = 'pay_pendingfixture';
  const receipt = { razorpay_order_id: orderId, razorpay_payment_id: paymentId,
    razorpay_signature: crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex') };
  let orders = 0;
  let confirmations = 0;
  paymentGateway.createOrder = async input => { orders++; return { id: orderId, ...input }; };
  paymentGateway.fetchPayment = async () => {
    confirmations++;
    if (confirmations === 1) throw new Error('Synthetic provider outage');
    return { id: paymentId, order_id: orderId, amount: 4900, currency: 'INR', status: 'captured', captured: true };
  };
  try {
    await page.addInitScript(receipt => {
      window.Razorpay = class {
        constructor(options) { this.options = options; }
        on() {}
        open() { this.options.handler(receipt); }
      };
    }, receipt);
    await page.goto(`${base}/?payment-fixture=1#/plus`, { waitUntil: 'networkidle' });
    const unavailable = page.waitForResponse(r => r.url().endsWith('/api/me/verify-payment'), { timeout: 5000 });
    await page.getByRole('button', { name: /Unlock for/ }).click();
    assert.equal((await unavailable).status(), 503);
    await page.getByRole('button', { name: 'Confirm payment' }).waitFor({ timeout: 3000 });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Confirm payment' }).click();
    await page.getByRole('dialog', { name: 'You have Plus.' }).waitFor();
    assert.equal(orders, 1, 'a confirmation retry never starts another charge');
    assert.equal(confirmations, 2);
    assert.equal((await db.prepare('SELECT plan FROM users WHERE id = ?').get(a.id)).plan, 'plus');
  } finally { await context.close(); }
});
