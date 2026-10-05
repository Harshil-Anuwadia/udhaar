import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /take a look first/i }).click();
  await page.locator('[data-tab="you"]').click();
  await page.locator('[data-set="plus"]').click();
  await page.getByRole('button', { name: 'Try Plus free' }).click();
  await page.getByRole('dialog', { name: 'Try Plus' }).getByRole('button', { name: 'Turn on Plus preview' }).click();
  const success = page.getByRole('dialog', { name: 'Plus preview is on.' });
  await success.waitFor();
  await success.getByRole('button', { name: 'Back to my ledger' }).click();

  await page.goto(`${base}/#/plus`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Plus preview is on' }).waitFor();
  await page.locator('[data-act="cancel"]').click();
  const confirm = page.getByRole('dialog', { name: 'Turn off Plus preview?' });
  await confirm.getByRole('button', { name: 'Turn off preview' }).click();
  await page.getByRole('button', { name: 'Try Plus free' }).waitFor();

  assert.deepEqual(errors, [], 'preview can be enabled and disabled without browser errors');
  console.log('Plus preview activates only after a saved account update and can be turned off.');
} finally { await browser.close(); }
