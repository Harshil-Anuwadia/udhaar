import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const context = await browser.newContext({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const signup = await context.request.post(`${base}/api/auth/signup`, { data: { name: 'People audit', secret: 'testpass123', currency: 'INR' } });
  const { token, user } = await signup.json();
  const headers = { Authorization: `Bearer ${token}` };
  await context.request.post(`${base}/api/me/onboarded`, { headers, data: {} });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('#li-id').fill(user.handle);
  await page.locator('#li-pass').fill('testpass123');
  await page.locator('[data-act="login"]').click();
  await page.waitForSelector('.netcard');
  async function inspect(label) {
    await page.waitForTimeout(200);
    assert.equal(await page.locator('#main [data-act="addfriend"]').count(), 1, `${label}: exactly one add-person action`);
    assert.equal(await page.locator('#main [data-act="record"], #main [data-act="invite"]').count(), 0, `${label}: no duplicate entry or invitation CTA`);
    assert.equal(await page.locator('#tabAdd').getAttribute('aria-label'), 'Add entry');
    assert.equal((await page.locator('#tabAdd').innerText()).trim(), '', 'mobile plus is icon-only with an accessible name');
    assert.match(await page.locator('.netcard__amount .num').evaluate(el => getComputedStyle(el).fontFamily), /DM Sans/, 'money uses the product sans-serif, not system monospace');
    assert.equal(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), true, 'no horizontal overflow');
    if (process.env.UI_SHOTS) await page.screenshot({ path: `${process.env.UI_SHOTS}/${label}.png` });
  }
  await inspect('empty');
  await page.locator('[data-act="addfriend"]').click();
  await page.locator('#af-name').fill('Sam');
  await page.getByRole('button', { name: 'Add to my book' }).click();
  await page.waitForURL(/#\/friend\//);
  await page.locator('[data-tab="home"]').click();
  await page.waitForSelector('[data-person]');
  await inspect('settled');
  assert.equal(await page.getByText('No people yet', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('heading', { name: 'All caught up' }).count(), 1);
  const friends = await (await context.request.get(`${base}/api/friends`, { headers })).json();
  await context.request.post(`${base}/api/entries`, { headers, data: { friendshipId: friends.friends[0].id, kind: 'money', direction: 'owed_to_me', amount: 1250, note: 'Dinner' } });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.netcard--positive');
  await inspect('open');
  assert.equal(await page.locator('.story-recent').count(), 1, 'the latest saved detail offers a factual way back into a person’s story');
  assert.match(await page.locator('.story-recent').innerText(), /Dinner/);
  await page.locator('.story-recent').click();
  await page.waitForURL(/#\/friend\//);
  await page.locator('[data-tab="home"]').click();
  await page.waitForSelector('.netcard');
  for (const theme of ['light', 'dark']) {
    const preference = await context.request.patch(`${base}/api/me/profile`, { headers, data: { theme } });
    assert.equal(preference.ok(), true, 'theme preference saved');
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 800 });
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('[data-person]');
      assert.equal(await page.locator('html').getAttribute('data-theme'), theme, 'the requested theme is actually rendered');
      const addStyle = await page.locator('#tabAdd').evaluate(el => { const css = getComputedStyle(el); return { background: css.backgroundImage, color: css.color, fill: css.backgroundColor }; });
      assert.equal(addStyle.background, 'none', 'no theme override washes out the navigation action');
      assert.notEqual(addStyle.color, addStyle.fill, 'the plus stays visible');
      assert.equal(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), true);
      if (process.env.UI_SHOTS) await page.screenshot({ path: `${process.env.UI_SHOTS}/${theme}-${width}.png` });
    }
  }
  assert.deepEqual(errors, []);
  console.log('People: empty, settled, open, add-person navigation, number font, both themes and three widths passed.');
} finally { await browser.close(); }
