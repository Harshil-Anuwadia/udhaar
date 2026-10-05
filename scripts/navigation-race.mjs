import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

async function holdApi(path) {
  let release;
  let started;
  const held = new Promise((resolve) => { release = resolve; });
  const requested = new Promise((resolve) => { started = resolve; });
  const handler = async (route) => {
    started();
    await held;
    await route.continue();
  };
  await page.route(`**${path}`, handler);
  return {
    requested,
    async finish() {
      const response = page.waitForResponse((result) => new URL(result.url()).pathname === path);
      release();
      await response;
      await page.unroute(`**${path}`, handler);
      await page.waitForTimeout(100);
    },
  };
}

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Take a look first' }).click();
  await page.locator('.netcard').waitFor({ timeoutMs: 20_000 });

  const groups = await holdApi('/api/groups');
  await page.locator('[data-tab="groups"]').click();
  await groups.requested;
  await page.locator('[data-tab="you"]').click();
  await page.locator('.account-profile').waitFor({ timeoutMs: 20_000 });
  await groups.finish();

  assert.equal(new URL(page.url()).hash, '#/you', 'the newest tab remains selected');
  assert.equal(await page.locator('.account-profile').count(), 1, 'a late Groups response cannot replace Account');
  assert.equal(await page.locator('#hdrTitle').innerText(), 'Account', 'the header matches the current tab');
  console.log('Groups → Account race passed');

  await page.locator('[data-tab="home"]').click();
  await page.locator('.netcard').waitFor();
  const account = await holdApi('/api/me/card');
  await page.locator('[data-tab="you"]').click();
  await Promise.race([account.requested, new Promise((_, reject) => setTimeout(() => reject(new Error('Account card request did not start')), 10_000))]);
  await page.locator('[data-tab="alerts"]').click();
  await page.locator('#hdrTitle').getByText('Alerts').waitFor({ timeoutMs: 10_000 });
  await account.finish();
  assert.equal(new URL(page.url()).hash, '#/activity');
  assert.equal(await page.locator('.account-profile').count(), 0, 'a late Account response cannot replace Alerts');
  assert.equal(await page.locator('#hdrTitle').innerText(), 'Alerts');
  console.log('Account → Alerts race passed');

  await page.locator('[data-tab="home"]').click();
  await page.locator('.netcard').waitFor();
  const alerts = await holdApi('/api/me/events');
  await page.locator('[data-tab="alerts"]').click();
  await Promise.race([alerts.requested, new Promise((_, reject) => setTimeout(() => reject(new Error('Alerts request did not start')), 10_000))]);
  await page.locator('[data-tab="groups"]').click();
  await page.locator('#hdrTitle').getByText('Groups').waitFor({ timeoutMs: 10_000 });
  await alerts.finish();
  assert.equal(new URL(page.url()).hash, '#/groups');
  assert.equal(await page.locator('#hdrTitle').innerText(), 'Groups', 'a late Alerts response cannot replace Groups');
  assert.deepEqual(errors, [], 'rapid navigation leaves no browser errors');
  console.log('Rapid tab navigation keeps the latest screen visible.');
} finally {
  await browser.close();
}
