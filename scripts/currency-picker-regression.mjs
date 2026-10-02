import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const shots = process.env.UI_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  if (shots) await page.screenshot({ path: `${shots}/landing-320.png` });
  await page.locator('[data-act="signup"]').click();
  await page.locator('#su-name').fill(`Currency ${Date.now()}`);
  await page.locator('[data-next]').click();
  await page.locator('#su-pass').fill('246810');
  await page.locator('[data-go]').click();
  await page.waitForSelector('#curGrid');
  if (shots) await page.screenshot({ path: `${shots}/currency-320.png` });

  for (const [width, height] of [[280, 568], [320, 568], [320, 360]]) {
    await page.setViewportSize({ width, height });
    const picker = await page.locator('#curGrid').evaluate(el => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, viewport: innerHeight, scrollHeight: document.scrollingElement.scrollHeight };
    });
    assert.ok(picker.top < height && picker.bottom > 0, `Currency picker must be visible initially at ${width}×${height}: ${JSON.stringify(picker)}`);
    assert.equal(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1), true, `Currency setup has no horizontal overflow at ${width}×${height}`);
    await page.locator('[data-cur="CAD"]').click();
    assert.equal(await page.locator('[data-cur="CAD"]').getAttribute('aria-pressed'), 'true');
  }

  await page.route('**/api/me/profile', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Temporary problem"}' }));
  await page.locator('[data-act="next"]').click();
  await page.waitForTimeout(350);
  assert.equal(await page.locator('#curGrid').isVisible(), true, 'setup must not advance when saving currency fails');
  await page.unroute('**/api/me/profile');
  await page.locator('[data-act="next"]').click();
  await page.locator('#ob-name').fill('Sam');
  await page.locator('[data-act="next"]').click();
  await page.locator('[data-act="skip"]').click();
  await page.waitForSelector('.account-quick', { state: 'hidden' }).catch(() => {});
  await page.waitForSelector('.home-actions');
  await page.locator('[data-tab="you"]').click();
  assert.match(await page.locator('.account-quick').innerText(), /CAD/, 'setup currency persists into account');
  await page.locator('[data-act="currency"]').click();
  await page.waitForSelector('.sheet.is-open');
  assert.ok(await page.locator('.sheet.is-open').getByText('US Dollar').isVisible(), 'Account currency choices are visible');
  await page.locator('.sheet.is-open').getByText('US Dollar').click();
  await page.waitForTimeout(350);
  assert.match(await page.locator('.account-quick').innerText(), /USD|Dollar/);
  if (shots) await page.screenshot({ path: `${shots}/account-320.png` });
  await page.locator('[data-act="card"]').first().click();
  await page.waitForSelector('.sheet.is-open canvas');
  if (shots) {
    await page.screenshot({ path: `${shots}/ledger-card-sheet-320.png` });
    const png = await page.locator('.sheet.is-open canvas').evaluate(el => el.toDataURL('image/png').split(',')[1]);
    writeFileSync(`${shots}/ledger-card-export.png`, Buffer.from(png, 'base64'));
  }
  console.log('Currency picker can be seen and selected during setup and from account.');
} finally {
  await browser.close();
}
