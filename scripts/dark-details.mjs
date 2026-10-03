import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ serviceWorkers: 'allow' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.addInitScript(() => {
  const worker = { postMessage: (message) => { window.__workerMessage = message; } };
  const registration = new EventTarget();
  registration.waiting = worker;
  registration.installing = null;
  registration.update = () => { window.__updateChecks = (window.__updateChecks || 0) + 1; return Promise.resolve(); };
  const serviceWorker = new EventTarget();
  serviceWorker.controller = {};
  serviceWorker.register = () => Promise.resolve(registration);
  Object.defineProperty(Navigator.prototype, 'serviceWorker', { configurable: true, value: serviceWorker });
});

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Reload' }).waitFor();
  assert.ok(await page.evaluate(() => window.__updateChecks > 0), 'service worker checks for available releases');
  await page.getByRole('button', { name: 'Reload' }).click();
  assert.equal(await page.evaluate(() => window.__workerMessage), 'skip-waiting', 'update action activates the waiting release');
  await page.getByRole('button', { name: /take a look first/i }).click();
  await page.locator('[data-person]').first().waitFor();
  const friendId = await page.locator('[data-person]').first().getAttribute('data-person');
  await page.goto(`${base}/#/add?friend=${friendId}`, { waitUntil: 'networkidle' });
  await page.locator('#compose-amount').waitFor();
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });

  await page.getByRole('button', { name: /add a date/i }).click();
  await page.getByRole('dialog').getByText('Set a due date').waitFor();
  assert.equal(await page.locator('.sheet.is-open input[type="file"]').count(), 0, 'date sheet only contains date controls');
  await page.getByRole('button', { name: 'Pick a date' }).click();
  const dateInput = page.locator('.sheet input[type="date"]');
  await dateInput.waitFor();
  assert.notEqual(await dateInput.evaluate((el) => getComputedStyle(el).display), 'none', 'date picker field is visible in dark mode');
  await dateInput.fill('2026-12-25');
  await dateInput.dispatchEvent('change');
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'receipt' }).click();
  await page.getByRole('dialog').getByText('Add a receipt').waitFor();
  assert.equal(await page.locator('.sheet.is-open input[type="date"]').count(), 0, 'receipt sheet only contains receipt controls');
  assert.equal(await page.locator('#receipt-photo-input').getAttribute('multiple'), '', 'receipt picker allows multiple images');
  await page.locator('#receipt-photo-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jcVQAAAAASUVORK5CYII=', 'base64'),
  });
  await page.locator('.photo-picker__tile img').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  assert.deepEqual(errors, [], 'date and receipt actions produce no browser errors');
  console.log('Update prompt/action and distinct dark mode date/receipt controls pass.');
} finally {
  await browser.close();
}
