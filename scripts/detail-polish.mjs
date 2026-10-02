import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const shots = process.env.UI_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
const issues = [];
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const expectDetail = (condition, message) => { if (!condition) issues.push(message); };
const snap = async (name) => { if (shots) { await page.waitForTimeout(350); await page.screenshot({ path: `${shots}/${name}.png` }); } };

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('[data-act="signup"]').click();
  await page.locator('#su-name').fill(`Details ${Date.now()}`);
  await page.locator('[data-next]').click();
  await page.locator('#su-pass').fill('246810');
  await page.locator('[data-go]').click();
  await page.waitForSelector('#curGrid');
  await page.locator('[data-act="next"]').click();
  await page.waitForSelector('#ob-name');
  await page.locator('#ob-name').fill('Sana');
  await page.locator('[data-act="next"]').click();
  await page.locator('[data-act="skip"]').click();
  await page.waitForSelector('[data-person]');

  const friendId = await page.locator('[data-person]').first().getAttribute('data-person');
  await page.goto(`${base}/#/friend/${friendId}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.balance-hero');
  await snap('friend-before');
  expectDetail(await page.locator('#hdrTitle h1').count() === 1 && await page.locator('.profile-head h1').count() === 0, 'friend identity is shown once in the header');
  expectDetail(await page.locator('#hdrTitle .avatar').count() === 1, 'friend avatar is grouped with the header identity');
  await page.locator('[data-act="sendlink"]').scrollIntoViewIfNeeded();
  await snap('friend-share-actions');

  await page.locator('#hdrActions button').click();
  await page.waitForSelector('.sheet.is-open');
  await snap('person-settings-before');
  expectDetail(await page.locator('.sheet__title').innerText() === 'Person settings', 'person settings has a clear title');
  expectDetail(await page.locator('.sheet').getByRole('button', { name: 'Delete person' }).count() === 1, 'delete person is a clear, separate action');
  await page.locator('.sheet').getByRole('button', { name: /Edit name \/ note|Edit details/ }).click();
  await page.waitForSelector('#ef-name');
  expectDetail(await page.locator('.sheet').getByRole('button', { name: 'Save changes' }).count() === 1, 'edit person uses an explicit save action');
  await page.locator('#ef-name').fill('Sana K');
  await page.locator('.sheet').getByRole('button', { name: /^Save$|Save changes/ }).click();
  const renamedOnScreen = await page.waitForFunction(() => document.querySelector('#hdrTitle')?.textContent?.includes('Sana K'), null, { timeout: 1500 }).then(() => true).catch(() => false);
  expectDetail(renamedOnScreen, 'saved person name updates on the open ledger');

  await page.goto(`${base}/#/you`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.account-profile');
  await page.waitForTimeout(500);
  const cardSection = page.locator('section').filter({ has: page.getByRole('heading', { name: /Your ledger card|Sharing/ }) }).first();
  await cardSection.locator('[data-act="card"]').first().scrollIntoViewIfNeeded();
  await snap('account-card-before');
  expectDetail(await cardSection.locator('[data-act="card"]').count() === 1, 'account offers one clear entry to the ledger snapshot');
  expectDetail(await cardSection.getByRole('button', { name: /Ledger snapshot/ }).count() === 1, 'ledger snapshot matches the settings row pattern');
  expectDetail(await cardSection.getByRole('button', { name: /Invite someone/ }).count() === 1, 'invite is a labelled action, not an icon-only WhatsApp shortcut');
  await cardSection.locator('[data-act="card"]').first().click();
  await page.waitForSelector('.sheet.is-open canvas');
  expectDetail(await page.locator('.sheet').getByRole('button', { name: 'Copy summary' }).count() === 1, 'snapshot offers a plain copy action');
  const hideNames = page.locator('.sheet.is-open').getByRole('button', { name: /Hide names/ });
  expectDetail(await hideNames.count() === 1, 'name privacy is a visible keyboard-accessible control');
  if (await hideNames.count()) {
    const order = await hideNames.evaluate((button) => button.getBoundingClientRect().bottom <= button.closest('.sheet__body').querySelector('canvas').getBoundingClientRect().top + 1);
    expectDetail(order, 'name privacy sits before the card preview');
    await hideNames.click();
    expectDetail(await hideNames.getAttribute('aria-pressed') === 'true', 'name privacy confirms its selected state');
  }
  await snap('ledger-snapshot-before');
  await page.locator('.sheet [aria-label="Close"]').click();

  await page.goto(`${base}/#/friend/${friendId}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.balance-hero');
  await page.locator('#hdrActions button').click();
  await page.locator('.sheet').getByRole('button', { name: /Remove from book|Delete person/ }).click();
  await page.locator('.sheet.is-open').getByRole('button', { name: /Remove them|Delete person/ }).click();
  await page.waitForSelector('.home-actions');
  await page.locator('#tabAdd').click();
  await page.waitForSelector('.sheet.is-open .empty__art svg');
  await snap('no-person-before');
  const iconSize = await page.locator('.sheet.is-open .empty__art svg').first().evaluate((svg) => {
    const rect = svg.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expectDetail(iconSize.width <= 40 && iconSize.height <= 40, `no-person icon is restrained (${iconSize.width}×${iconSize.height})`);
  assert.deepEqual(errors, [], 'no browser errors');
  assert.deepEqual(issues, [], issues.join('; '));
  console.log('Friend identity, person settings, account sharing, and empty-record UI passed.');
} finally {
  await browser.close();
}
