import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'udhaar-person-create-'));
process.env.DATA_DIR = dataDir;
process.env.TURSO_DATABASE_URL = `file:${path.join(dataDir, 'udhaar.db')}`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.JWT_SECRET = 'person-create-isolated-test-secret';
const [{ default: app }, { db }] = await Promise.all([import('../server/index.js'), import('../server/db.js')]);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 360, height: 640 }, serviceWorkers: 'block' });
  const signup = await context.request.post(`${base}/api/auth/signup`, { data: { name: 'Person Tester', handle: 'persontester', secret: 'testpass123', currency: 'INR' } });
  const { token } = await signup.json();
  await context.request.post(`${base}/api/me/onboarded`, { headers: { Authorization: `Bearer ${token}` }, data: {} });
  await context.request.post(`${base}/api/friends`, { headers: { Authorization: `Bearer ${token}` }, data: { name: 'Old friend' } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript((value) => localStorage.setItem('udhaar.at', value), token);
  await page.goto(`${base}/#/`);
  await page.getByRole('button', { name: 'Add a person' }).first().click();
  await page.locator('#af-name').fill('New friend');
  await page.getByRole('button', { name: 'Add to my book' }).click();
  await page.waitForTimeout(650);
  assert.match(page.url(), /#\/friend\/f_/, 'adding a person opens the newly created person page');
  assert.match(await page.locator('#hdrTitle').innerText(), /New friend/, 'the visible page belongs to the new person');
  assert.equal(await page.getByRole('dialog').count(), 0, 'no unrelated composer appears after navigating');
  if (process.env.PERSON_SCREENSHOT) { await page.waitForTimeout(350); await page.screenshot({ path: process.env.PERSON_SCREENSHOT }); }
  await page.getByRole('button', { name: 'Dismiss notification' }).first().click();
  await page.locator('.toast').waitFor({ state: 'detached' });
  await db.prepare('INSERT INTO events (id, user_id, type, body, created_at) VALUES (?,?,?,?,?)')
    .run('ev_browser-dismiss', (await signup.json()).user.id, 'entry_new', 'A browser update', Date.now());
  await page.goto(`${base}/#/activity`);
  await page.locator('[data-alert="ev_browser-dismiss"]').waitFor();
  if (process.env.ALERT_SCREENSHOT) { await page.waitForTimeout(350); await page.screenshot({ path: process.env.ALERT_SCREENSHOT }); }
  await page.locator('[data-dismiss-event="ev_browser-dismiss"]').click();
  await page.locator('[data-alert="ev_browser-dismiss"]').waitFor({ state: 'detached' });
  if (process.env.PLUS_SCREENSHOT) { await page.goto(`${base}/#/plus`); await page.locator('.free-feature').first().scrollIntoViewIfNeeded(); await page.screenshot({ path: process.env.PLUS_SCREENSHOT }); }
  assert.deepEqual(errors, []);
  console.log('New person opens immediately on the correct page.');
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
