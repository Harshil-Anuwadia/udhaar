import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const shots = process.env.UI_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
const errors = [];
const entryResponses = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('response', (response) => { if (response.url().includes('/api/entries')) entryResponses.push(response.status()); });
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('[data-act="signup"]').click();
  await page.locator('#su-name').fill(`Moment ${Date.now()}`);
  await page.locator('[data-next]').click();
  await page.locator('#su-pass').fill('246810');
  await page.locator('[data-go]').click();
  await page.waitForSelector('#curGrid');
  await page.locator('[data-act="next"]').click();
  await page.locator('#ob-name').fill('Sana');
  await page.locator('[data-act="next"]').click();
  await page.locator('[data-act="skip"]').click();
  await page.waitForSelector('[data-person]');
  const friendId = await page.locator('[data-person]').first().getAttribute('data-person');
  await page.goto(`${base}/#/friend/${friendId}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.art-scene--chai');
  if (shots) {
    await page.waitForTimeout(550);
    await page.locator('.art-scene--chai').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${shots}/friend-chai.png` });
  }
  assert.equal(await page.locator('.chai-steam').count(), 3, 'chai has three independent steam strokes');
  assert.notEqual(await page.locator('.chai-steam').first().evaluate((el) => getComputedStyle(el).animationName), 'none', 'steam moves when motion is allowed');

  await page.goto(`${base}/#/add?friend=${friendId}`, { waitUntil: 'networkidle' });
  await page.locator('#compose-amount').fill('120');
  await page.locator('#compose-note').fill('Dinner split');
  await page.locator('.compose__foot .btn').click();
  await page.waitForSelector('.sheet--saved', { timeout: 1200 }).catch(async () => {
    const notice = await page.locator('.toaster').innerText().catch(() => '');
    const submit = await page.locator('.compose__foot .btn').innerText().catch(() => '');
    throw new Error(`Save sheet did not open; entry responses=${entryResponses.join(',')}; notice=${notice}; submit=${submit}; page errors=${errors.join(',')}`);
  });
  if (shots) {
    await page.waitForTimeout(950);
    await page.screenshot({ path: `${shots}/save-moment.png` });
  }
  assert.match(await page.locator('.saved-moment__aside').innerText(), /dinner|food|bill|table/i);
  assert.equal(await page.locator('.saved-moment__seal').count(), 0, 'saved moment has no oversized success seal');
  assert.equal(await page.locator('.saved-moment__line').count(), 1, 'saved line remains visible');
  const folioStyle = await page.locator('.saved-moment__line').evaluate((el) => ({
    background: getComputedStyle(el).backgroundColor,
    leftBorder: getComputedStyle(el).borderLeftWidth,
  }));
  assert.equal(folioStyle.background, 'rgba(0, 0, 0, 0)', 'entry is not wrapped in a tinted card');
  assert.equal(folioStyle.leftBorder, '0px', 'entry has no green accent rail');
  assert.equal(await page.locator('.saved-moment__inkline').count(), 1, 'a single ink line carries the confirmation motion');
  assert.equal(await page.locator('.sheet--saved').getByRole('button', { name: 'Back to ledger' }).count(), 1, 'returning to ledger is primary');
  assert.equal(await page.locator('.sheet--saved').getByRole('button', { name: /Share this line/ }).count(), 1, 'sharing remains available');
  const width = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(width <= 1, `no horizontal overflow at 320px (${width}px)`);
  await page.setViewportSize({ width: 280, height: 480 });
  await page.waitForTimeout(350);
  const narrow = await page.evaluate(() => {
    const sheet = document.querySelector('.sheet--saved');
    const foot = sheet.querySelector('.sheet__foot').getBoundingClientRect();
    return { overflow: document.documentElement.scrollWidth - innerWidth, footerBottom: foot.bottom, buttonOverflow: [...sheet.querySelectorAll('.saved-moment__actionrow .btn')].some((b) => b.scrollWidth > b.clientWidth) };
  });
  assert.ok(narrow.overflow <= 1, `no horizontal overflow at 280px (${narrow.overflow}px)`);
  assert.ok(narrow.footerBottom <= 481, `save actions stay visible on a short phone: ${JSON.stringify(narrow)}`);
  assert.equal(narrow.buttonOverflow, false, 'secondary actions do not clip at 280px');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.saved-moment__inkline').evaluate((el) => getComputedStyle(el).animationName), 'none', 'saved moment respects reduced motion');
  await page.goto(`${base}/#/activity`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.art-scene--plane');
  assert.equal(await page.locator('.art-scene--plane .art-lift').evaluate((el) => getComputedStyle(el).animationName), 'none', 'quiet alert art respects reduced motion');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  assert.match(await page.locator('.art-scene--plane .art-lift').evaluate((el) => getComputedStyle(el).animationName), /plane-hover/, 'quiet alert art has ambient movement');
  await page.goto(`${base}/#/add?friend=${friendId}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Favour' }).click();
  await page.locator('#compose-kind-note').fill('Return my charger');
  await page.locator('.compose__foot .btn').click();
  await page.waitForSelector('.sheet--saved');
  assert.equal(await page.locator('.saved-moment__value--text').count(), 1, 'favour notes use text sizing instead of giant currency typography');
  assert.deepEqual(errors, [], 'no browser errors');
  console.log('Saved moment and chai motion passed.');
} finally { await browser.close(); }
