import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /take a look first/i }).click();
  await page.locator('.person__name').first().waitFor();
  const person = await page.locator('.person__name').first().evaluate((el) => el.childNodes[0].textContent.trim());

  await page.locator('[data-tab="you"]').click();
  await page.getByText('Little things, kept together.').waitFor();
  assert.equal(await page.getByText('Your reliability').count(), 0, 'account uses real book facts, not a score');

  await page.locator('[data-set="voice"]').click();
  await page.getByRole('button', { name: /Deadpan/ }).click();
  await page.getByText('Your book sounds deadpan').waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Your book sounds deadpan').waitFor();

  await page.evaluate(() => {
    window.__cardText = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (value, ...args) {
      window.__cardText.push(String(value));
      return original.call(this, value, ...args);
    };
  });
  await page.locator('[data-act="card"]').click();
  await page.locator('.sheet.is-open canvas').waitFor();
  assert.equal(await page.locator('.snapshot-privacy').getAttribute('aria-pressed'), 'true', 'snapshot hides names by default');
  assert.ok((await page.evaluate(() => window.__cardText)).some((label) => label.includes('•')), 'initial card draws redacted names');
  assert.equal((await page.evaluate(() => window.__cardText)).includes(person), false, 'initial card omits the person’s full name');

  await page.evaluate(() => { window.__cardText = []; });
  await page.locator('.snapshot-privacy').click();
  assert.equal(await page.locator('.snapshot-privacy').getAttribute('aria-pressed'), 'false');
  assert.ok((await page.evaluate(() => window.__cardText)).includes(person), 'the person’s name appears only after an explicit reveal');
  assert.deepEqual(errors, [], 'brand journey has no browser errors');
  console.log('Voice preference persists; account facts and private-by-default share card pass.');
} finally { await browser.close(); }
