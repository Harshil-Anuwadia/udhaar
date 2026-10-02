import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

// Run against an isolated test server. Uses a disposable demo account.
const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const shots = process.env.UI_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', e => errors.push(e.message));

async function inspect(name) {
  await page.waitForTimeout(400);
  const problems = await page.evaluate(() => {
    const issues = [];
    const app = document.querySelector('#app').getBoundingClientRect();
    for (const el of document.querySelectorAll('.input, .btn, .setrow, .person, .account-profile, .profile-head, .netcard, .balance-hero, .sheet.is-open, .who')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.left < app.left - 1 || r.right > app.right + 1) issues.push(`${el.className}: outside app`);
      if (!el.matches('.input') && el.scrollWidth > el.clientWidth + 2) issues.push(`${el.className}: content overflow`);
    }
    for (const avatar of document.querySelectorAll('.avatar')) {
      const r = avatar.getBoundingClientRect();
      if (Math.abs(r.width - r.height) > 1) issues.push('distorted avatar');
    }
    if (document.scrollingElement.scrollWidth > innerWidth + 1) issues.push('document overflow');
    const main = document.querySelector('main');
    if (main.clientWidth && main.scrollWidth > main.clientWidth + 1) issues.push('main overflow');
    return issues;
  });
  assert.deepEqual(problems, [], `${name}: ${problems.join(', ')}`);
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('[data-act="login"]').click();
  await inspect('login-390');
  await page.setViewportSize({ width: 320, height: 568 });
  await inspect('login-320');
  await page.locator('[data-back]').click();
  await page.locator('[data-act="signup"]').click();
  await inspect('signup-320');
  await page.locator('[data-back]').click();
  await page.locator('[data-act="demo"]').click();
  await page.waitForSelector('[data-person]', { timeout: 20000 });
  const friendId = await page.locator('[data-person]').first().getAttribute('data-person');
  const routes = [
    ['home', '/', '.netcard'], ['friend', `/friend/${friendId}`, '.balance-hero'],
    ['groups', '/groups', '[data-act="newgroup"]'], ['activity', '/activity', '#main .screen'],
    ['account', '/you', '.account-profile'], ['plus', '/plus', '.plus-hero'],
    ['people', '/add', '.who-grid'], ['amount', `/add?friend=${friendId}`, '#compose-amount'],
  ];
  for (const [width, height] of [[320, 568], [390, 844], [768, 800], [1280, 800]]) {
    await page.setViewportSize({ width, height });
    for (const [name, route, ready] of routes) {
      await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle' });
      await page.waitForSelector(ready);
      await inspect(`${name}-${width}`);
    }
  }
  if (shots) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/#/you`, { waitUntil: 'networkidle' });
    await page.locator('[data-act="card"]').first().click();
    await page.waitForSelector('.sheet.is-open canvas');
    const png = await page.locator('.sheet.is-open canvas').evaluate(el => el.toDataURL('image/png').split(',')[1]);
    writeFileSync(`${shots}/ledger-card-populated.png`, Buffer.from(png, 'base64'));
  }
  assert.deepEqual(errors, [], 'no browser runtime errors');
  console.log('Visual audit passed: login, signup, and eight app views at four viewport sizes.');
} finally {
  await browser.close();
}
