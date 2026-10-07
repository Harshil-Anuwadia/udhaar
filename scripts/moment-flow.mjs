import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'udhaar-moment-flow-'));
process.env.DATA_DIR = dataDir;
process.env.TURSO_DATABASE_URL = `file:${path.join(dataDir, 'udhaar.db')}`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.JWT_SECRET = 'moment-flow-isolated-test-secret';

const [{ default: app }, { db }] = await Promise.all([import('../server/index.js'), import('../server/db.js')]);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;

try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ isMobile: true, hasTouch: true, viewport: { width: Number(process.env.TEST_WIDTH) || 360, height: 640 }, serviceWorkers: 'block' });
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));

  const signupResponse = await context.request.post(`${base}/api/auth/signup`, { data: {
    name: 'Moment Tester', handle: 'momenttester', secret: 'testpass123', currency: 'INR',
  } });
  assert.equal(signupResponse.status(), 201);
  const signup = await signupResponse.json();
  const onboardedResponse = await context.request.post(`${base}/api/me/onboarded`, {
    headers: { Authorization: `Bearer ${signup.token}` }, data: {},
  });
  assert.equal(onboardedResponse.status(), 200);
  const friendResponse = await context.request.post(`${base}/api/friends`, {
    headers: { Authorization: `Bearer ${signup.token}` }, data: { name: 'Sana' },
  });
  assert.equal(friendResponse.status(), 201);
  const friend = await friendResponse.json();
  await page.addInitScript((token) => localStorage.setItem('udhaar.at', token), signup.token);
  await page.goto(`${base}/#/friend/${friend.friend.id}`);

  await page.getByRole('button', { name: 'Add a moment' }).waitFor({ timeout: 8000 }).catch(async (error) => {
    console.error('Person page during failure:', (await page.locator('body').innerText()).slice(0, 1200));
    throw error;
  });
  await page.getByRole('button', { name: 'Add a moment' }).click();
  assert.equal(await page.locator('#moment-photo').getAttribute('multiple'), '', 'a Moment accepts several photos in one picker');
  await page.locator('#moment-title').fill('The café after the rain');
  await page.locator('#moment-note').fill('We stayed until closing.');
  const tiny = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jcVQAAAAASUVORK5CYII=', 'base64');
  await page.locator('#moment-photo').setInputFiles([
    { name: 'first.png', mimeType: 'image/png', buffer: tiny },
    { name: 'second.png', mimeType: 'image/png', buffer: tiny },
  ]);
  await page.locator('.photo-picker__tile').nth(1).waitFor();
  assert.equal(await page.locator('.photo-picker__tile img').count(), 2);
  if (process.env.MOMENT_COMPOSER_SCREENSHOT) {
    await page.waitForTimeout(450); // Capture the settled sheet, not its entrance transition.
    await page.screenshot({ path: process.env.MOMENT_COMPOSER_SCREENSHOT });
  }
  await page.getByRole('button', { name: 'Keep this moment' }).click();
  await page.locator('.moment-row').getByText('The café after the rain').waitFor();
  await page.locator('.moment-row img').waitFor();
  await page.locator('.moment-row').click();
  assert.equal(await page.locator('.moment-detail .photo-gallery__item img').count(), 2, 'the Moment detail displays every selected photo');
  await page.locator('.moment-detail .photo-gallery__item').nth(1).click();
  await page.getByRole('dialog', { name: 'The café after the rain', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.locator('.lightbox').waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('dialog', { name: 'A little moment' }).isVisible(), true, 'closing a photo keeps the underlying Moment open');
  await page.getByRole('dialog', { name: 'A little moment' }).getByRole('button', { name: 'Close' }).click();
  const imageLoaded = await page.locator('.moment-row img').evaluate((img) => img.complete && img.naturalWidth > 0);
  assert.equal(imageLoaded, true, 'a browser image request can read the authorized private photo');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  assert.equal(overflow, false, 'the person page fits a narrow phone without horizontal overflow');
  assert.deepEqual(errors, [], 'Moment flow has no browser exceptions');
  await page.locator('.sheet').waitFor({ state: 'detached' });
  if (process.env.MOMENT_SCREENSHOT) await page.screenshot({ path: process.env.MOMENT_SCREENSHOT, fullPage: true });

  await page.goto(`${base}/#/add?friend=${friend.friend.id}`);
  await page.locator('#compose-amount').fill('100000');
  assert.equal(await page.locator('#compose-amount').inputValue(), '1,00,000', 'entry amounts group digits while typing');
  await page.locator('#compose-amount').fill('125');
  await page.getByRole('button', { name: 'receipt photos' }).click();
  assert.equal(await page.locator('#receipt-photo-input').getAttribute('multiple'), '', 'receipt picker accepts several photos together');
  await page.locator('#receipt-photo-input').setInputFiles([
    { name: 'receipt-front.png', mimeType: 'image/png', buffer: tiny },
    { name: 'receipt-back.png', mimeType: 'image/png', buffer: tiny },
  ]);
  await page.locator('.photo-picker__tile').nth(1).waitFor();
  assert.equal(await page.locator('.photo-picker__tile').count(), 2);
  await page.getByRole('button', { name: 'Done' }).click();
  await page.locator('.compose__foot .btn').click();
  await page.locator('.saved-moment').waitFor();
  const ledgerResponse = await context.request.get(`${base}/api/friends/${friend.friend.id}`, {
    headers: { Authorization: `Bearer ${signup.token}` },
  });
  const ledger = await ledgerResponse.json();
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].photos.length, 2, 'both selected receipt images are saved');
  assert.deepEqual(errors, [], 'photo flows have no browser exceptions');
  console.log('Private Moment and receipt multi-photo flows passed on a narrow phone viewport.');
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
