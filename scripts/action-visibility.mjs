import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });

async function visible(selector, label) {
  const bounds = await page.locator(selector).first().evaluate(el => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: innerWidth, height: innerHeight };
  });
  assert.ok(bounds.top >= -1 && bounds.bottom <= bounds.height + 1 && bounds.left >= -1 && bounds.right <= bounds.width + 1, `${label} stays onscreen: ${JSON.stringify(bounds)}`);
}

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  for (const [width, height] of [[280, 568], [320, 360], [320, 480], [320, 568], [390, 560], [390, 844], [768, 560], [768, 800], [844, 390], [1280, 800]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    // Keyboard-height screens may scroll; no control may become inaccessible.
    await page.locator('[data-act="signup"]').scrollIntoViewIfNeeded();
    await visible('[data-act="signup"]', `landing signup ${width}×${height}`);
    await page.locator('[data-act="login"]').scrollIntoViewIfNeeded();
    await visible('[data-act="login"]', `landing login ${width}×${height}`);
    await page.locator('[data-act="demo"]').scrollIntoViewIfNeeded();
    await visible('[data-act="demo"]', `landing demo ${width}×${height}`);
    const layout = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
      return { scrollWidth: document.scrollingElement.scrollWidth, width: innerWidth, titleTop: rect('#landing-title').top, artTop: rect('.landing__visual').top, artBottom: rect('.landing__visual').bottom, actionsTop: rect('.landing__actions').top };
    });
    assert.ok(layout.scrollWidth <= layout.width + 1, `landing has no horizontal overflow at ${width}×${height}`);
    if (width < 900) assert.equal(await page.locator('.landing__visual').isVisible(), false, 'mobile presents the login form without marketing artwork');
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await page.locator('[data-act="login"]').scrollIntoViewIfNeeded();
  await visible('[data-act="login"]', 'login submit');
  await page.setViewportSize({ width: 320, height: 360 });
  await page.locator('#li-id').scrollIntoViewIfNeeded();
  await visible('#li-id', 'login input with a short visual viewport');
  await page.locator('[data-act="login"]').scrollIntoViewIfNeeded();
  await visible('[data-act="login"]', 'login submit remains reachable with a short visual viewport');
  await page.setViewportSize({ width: 320, height: 568 });
  await page.locator('[data-act="signup"]').click();
  await visible('[data-next]', 'signup continue');
  await page.locator('#su-name').fill(`Visible ${Date.now()}`);
  await page.locator('[data-next]').click();
  await visible('[data-go]', 'signup submit');
  await page.locator('#su-pass').fill('246810');
  await page.locator('[data-go]').click();
  await page.waitForSelector('#paletteGrid', { timeout: 20000 });
  await visible('[data-act="palette-next"]', 'palette continue');
  await page.locator('[data-act="palette-next"]').click();
  await page.waitForSelector('#curGrid', { timeout: 20000 });
  await visible('[data-act="next"]', 'currency continue');
  await page.locator('[data-act="next"]').click();
  await page.waitForSelector('#ob-name');
  await visible('[data-act="next"]', 'person add');
  await visible('[data-act="demo"]', 'person skip');
  await page.locator('#ob-name').fill('Sam');
  await page.locator('[data-act="next"]').click();
  await page.waitForSelector('[data-act="finish"]');
  await visible('[data-act="finish"]', 'entry finish');
  await visible('[data-act="skip"]', 'entry skip');
  await page.locator('[data-act="skip"]').click();
  await page.waitForSelector('.netcard', { timeout: 20000 });
  await visible('#tabAdd', 'single navigation log action');
  await visible('.home-actions [data-act="addfriend"]', 'home add person action');
  await page.locator('[data-tab="you"]').click();
  await page.waitForSelector('.account-quick');
  for (const action of ['theme', 'currency', 'export', 'logout']) await visible(`.account-quick [data-act="${action}"]`, `account ${action}`);
  await page.setViewportSize({ width: 280, height: 568 });
  for (const action of ['theme', 'currency', 'export', 'logout']) await visible(`.account-quick [data-act="${action}"]`, `narrow account ${action}`);
  assert.equal(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1), true, 'narrow account has no horizontal overflow');
  await page.locator('[data-tab="home"]').click();
  await page.waitForSelector('.home-actions');
  await visible('#tabAdd', 'narrow navigation log action');
  await visible('.home-actions [data-act="addfriend"]', 'narrow home add person action');
  assert.equal(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1), true, 'narrow home has no horizontal overflow');
  console.log('Primary actions stay visible on landing, login, setup, home and account at short mobile sizes.');
} finally { await browser.close(); }
