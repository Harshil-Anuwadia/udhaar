import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'udhaar-group-select-'));
process.env.DATA_DIR = dataDir;
process.env.TURSO_DATABASE_URL = `file:${path.join(dataDir, 'udhaar.db')}`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.JWT_SECRET = 'group-selection-isolated-test-secret';

const [{ default: app }, { db }] = await Promise.all([import('../server/index.js'), import('../server/db.js')]);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;

try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: Number(process.env.TEST_WIDTH) || 360, height: 640 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  async function post(route, data, token) {
    const response = await context.request.post(`${base}${route}`, { data, headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok()) assert.fail(`${route}: ${response.status()} ${await response.text()}`);
    return response.json();
  }

  const signup = await post('/api/auth/signup', { name: 'Group Tester', handle: 'grouptester', secret: 'testpass123', currency: 'INR' });
  await post('/api/me/onboarded', {}, signup.token);
  const sana = await post('/api/friends', { name: 'Sana' }, signup.token);
  const mira = await post('/api/friends', { name: 'Mira' }, signup.token);
  const group = await post('/api/groups', { name: 'Weekend', members: [sana.friend.id, mira.friend.id] }, signup.token);
  await page.addInitScript((token) => localStorage.setItem('udhaar.at', token), signup.token);
  await page.goto(`${base}/#/group/${group.group.id}`);
  await page.getByRole('button', { name: 'Add a bill' }).first().click();

  const checkboxes = page.locator('input[type="checkbox"][data-split-member]');
  assert.equal(await checkboxes.count(), 3, 'each person has a real, accessible inclusion checkbox');
  const controlLayout = await page.locator('.split-person').first().evaluate((row) => ({
    check: row.querySelector('input[type="checkbox"]').getBoundingClientRect().left,
    name: row.querySelector('.split-person__name').getBoundingClientRect().left,
  }));
  assert.ok(controlLayout.check > controlLayout.name, 'inclusion controls sit to the right of the person name');
  assert.equal(await page.locator('input[data-split-member]:checked').count(), 3);
  await checkboxes.nth(2).uncheck();
  assert.equal(await page.locator('input[data-split-member]:checked').count(), 2);
  await page.locator('#sp-title').fill('Dinner');
  await page.locator('#sp-amount').fill('100000');
  assert.equal(await page.locator('#sp-amount').inputValue(), '1,00,000', 'group amounts use Indian grouping as typed');
  await page.locator('#sp-amount').fill('120');
  assert.match(await page.locator('.split-selection__count').innerText(), /2 of 3/);
  assert.match(await page.getByRole('button', { name: /Split ₹120 across 2/ }).innerText(), /Split/);

  await page.getByRole('button', { name: 'Custom' }).click();
  const customInput = page.locator('[data-custom="me"]');
  await customInput.waitFor({ timeout: 8000 }).catch(async (error) => {
    console.error('Bill sheet during failure:', (await page.locator('body').innerText()).slice(-1400));
    throw error;
  });
  await customInput.fill('60');
  assert.equal(await checkboxes.first().isChecked(), true, 'editing a custom share does not toggle inclusion');
  assert.equal(await page.getByRole('button', { name: 'Assign ₹60 more' }).isDisabled(), true, 'an incomplete custom split explains why it cannot be saved');
  await page.locator('[data-custom]').nth(1).fill('60');
  assert.equal(await page.getByRole('button', { name: 'Split ₹120 across 2' }).isEnabled(), true, 'the split is ready when shares match the bill');
  await page.locator('.split-selection__list').scrollIntoViewIfNeeded();
  if (process.env.GROUP_SCREENSHOT) await page.screenshot({ path: process.env.GROUP_SCREENSHOT, fullPage: true });
  await page.getByRole('button', { name: 'Split ₹120 across 2' }).click();
  await page.getByRole('dialog', { name: 'Bill saved' }).waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  assert.equal(overflow, false, 'the group page has no horizontal overflow');
  assert.deepEqual(errors, [], 'group selection has no browser exceptions');
  console.log('Group bill participant selection passed on a narrow phone viewport.');
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
