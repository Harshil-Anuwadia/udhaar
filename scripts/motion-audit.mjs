import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage({ isMobile: true, hasTouch: true, viewport: { width: 320, height: 568 } });
  await page.goto(base, { waitUntil: 'networkidle' });
  assert.ok(await page.locator('.brand-mark').count() >= 1, 'landing has the new brand symbol');
  const drawing = await page.locator('.brand-mark__stroke').first().evaluate(el => getComputedStyle(el).animationName);
  assert.notEqual(drawing, 'none', 'logo draws on arrival');
  assert.equal(await page.locator('.landing-preview').count(), 1, 'landing shows the product preview');
  assert.equal(await page.locator('.landing-preview').isVisible(), false, 'mobile focuses on authentication instead of an animated landing');
  await page.setViewportSize({ width: 1280, height: 800 });
  assert.notEqual(await page.locator('.landing-preview').evaluate(el => getComputedStyle(el).animationName), 'none', 'desktop artwork enters with a short animation');
  await page.waitForTimeout(1800);
  const endless = await page.evaluate(() => document.getAnimations().filter(a => a.effect.getTiming().iterations === Infinity).length);
  assert.equal(endless, 0, 'decorative motion settles instead of looping indefinitely');
  await page.locator('[data-act="signup"]').click();
  assert.ok(await page.locator('.brand-mark:visible').count() >= 1, 'account setup carries the animated brand');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const animations = await page.locator('.brand-mark *').evaluateAll(els => els.map(el => getComputedStyle(el).animationName));
  assert.ok(animations.every(name => name === 'none'), 'reduced motion keeps brand artwork completely still');
  assert.ok((await page.locator('.brand-mark').evaluateAll(els => els.every(el => el.getAttribute('aria-hidden') === 'true'))), 'decorative symbols do not repeat accessible labels');
  console.log('Motion audit passed: animated brand, finite artwork motion, setup branding, reduced-motion fallback.');
} finally { await browser.close(); }
