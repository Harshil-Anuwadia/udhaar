import { chromium } from 'playwright-core';

const BASE = 'http://127.0.0.1:4173';
import { mkdirSync } from 'node:fs';
const OUT = 'shots';
mkdirSync(OUT, { recursive: true });
const errors = [];
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
});
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text().slice(0, 220)}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${String(e.message).slice(0, 220)}`));
page.on('requestfailed', (r) => { const u = r.url(); if (!u.includes('fonts.g')) errors.push(`[reqfail] ${u.slice(0, 120)} ${r.failure()?.errorText}`); });

const log = (...a) => console.log('•', ...a);

// ---------- 1. landing ----------
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.auth', { timeout: 15000 });
await page.waitForTimeout(900);
log('landing rendered');
await shot(page, '01-landing');

// ---------- 2. signup ----------
await page.click('[data-act="signup"]');
await page.waitForSelector('#su-name');
await page.fill('#su-name', 'Riya');
await shot(page, '02-signup-sheet');
await page.click('[data-next]');
await page.waitForSelector('#su-pass');
await page.fill('#su-pass', 'secret99');
await page.click('[data-go]');
await page.waitForSelector('#paletteGrid', { timeout: 15000 });
log('signed up → onboarding');
await shot(page, '03-onboard-palette');
await page.click('[data-act="palette-next"]');
await page.waitForSelector('#curGrid');
await shot(page, '03b-onboard-currency');

// ---------- 3. onboarding ----------
await page.click('[data-act="next"]');
await page.waitForSelector('#ob-name');
await page.fill('#ob-name', 'Arjun');
await shot(page, '04-onboard-person');
await page.click('[data-act="next"]');
await page.waitForSelector('#ob-quick .quick');
await page.click('#ob-quick .quick:nth-child(3)');
await page.waitForTimeout(200);
await shot(page, '05-onboard-first-line');
await page.click('[data-act="finish"]');
await page.waitForSelector('.netcard', { timeout: 15000 });
await page.waitForTimeout(1100);
log('home after onboarding');
await shot(page, '06-home-first');

// ---------- 4. record sheet ----------
await page.click('#tabAdd');
await page.waitForSelector('.who-grid', { timeout: 10000 });
await shot(page, '07a-compose-who');
await page.click('.who-grid .who');
await page.waitForSelector('#compose-amount', { timeout: 10000 });
// attach a receipt photo through the details sheet's real file input
await page.click('.chip:has-text("receipt")');
await page.waitForSelector('.sheet input[type="file"]', { state: 'attached', timeout: 8000 });
await page.setInputFiles('.sheet input[type="file"]', { name: 'receipt.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAHElEQVR4nGP8z8Dwn4EIwESMwKgIUQ6MwKgIDlEuAObHCRLhI3oVAAAAAElFTkSuQmCC', 'base64') });
await page.waitForSelector('.photo-picker__tile img', { timeout: 8000 });
await page.click('.sheet__foot .btn'); // done with the fine print
await page.fill('#compose-amount', '450');
await page.waitForTimeout(250);
await shot(page, '07-record-sheet');
await page.fill('.compose__note', 'Cab back from the airport');
await page.click('.compose__foot .btn');
await page.waitForSelector('.sheet .ledger-page', { timeout: 10000 });
await shot(page, '08-celebration');
await page.click('.sheet__foot .btn--quiet'); // keep private
await page.waitForTimeout(700);

// ---------- 5. friend page ----------
await page.click('[data-person]');
await page.waitForSelector('.balance-hero', { timeout: 10000 });
await page.waitForTimeout(500);
log('friend page');
await shot(page, '09-friend');

const photoThumb = await page.$('.entry__photo');
log(photoThumb ? 'receipt thumb on entry row' : 'NO receipt thumb');

// swipe an entry left (mouse drag on the row content, no tap first)
await page.waitForTimeout(4200); // toast must clear the swipe zone first
const row = await page.$('.swipe');
if (row) {
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(250);
  const box = await row.boundingBox();
  console.log('  swipe diag: scrollY=', await page.evaluate(() => window.scrollY), 'box.y=', Math.round(box.y));
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 40, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 150, y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(450);
  await shot(page, '10-swipe-actions');
  // dismiss the revealed actions by tapping the page header
  await page.mouse.click(box.x + 20, Math.max(30, box.y - 200));
  await page.waitForTimeout(300);
}

// ---------- 6. back home, groups ----------
await page.goBack(); await page.waitForTimeout(400);
await page.click('[data-tab="groups"]');
await page.waitForSelector('.empty, .groupcard', { timeout: 10000 });
await shot(page, '11-groups-empty');
// create group
const btn = await page.$('[data-act="newgroup"]');
if (btn) {
  await btn.click();
  await page.waitForSelector('#g-name');
  await page.fill('#g-name', 'Goa 2026');
  await page.click('[data-pick]');
  await page.waitForTimeout(150);
  await shot(page, '12-new-group');
  await page.click('.sheet__foot .btn');
  await page.waitForSelector('.ledger-page', { timeout: 10000 });
  await page.waitForTimeout(400);
  log('group created');
  await shot(page, '13-group');
  // add a bill
  await page.click('[data-act="split"]');
  await page.waitForSelector('#sp-amount');
  await page.fill('#sp-title', 'Dinner at Bombay Canteen');
  await page.fill('#sp-amount', '1789');
  await page.waitForTimeout(300);
  await shot(page, '14-split');
  await page.click('.sheet__foot .btn');
  await page.waitForTimeout(900);
  await shot(page, '15-group-after-split');
}

// ---------- 7. you ----------
await page.click('[data-tab="you"]');
await page.waitForSelector('.profile-head', { timeout: 10000 });
await page.waitForTimeout(600);
// avatar photo upload on You
await page.setInputFiles('[data-avatar-input]', { name: 'me.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAHElEQVR4nGP8z8Dwn4EIwESMwKgIUQ6MwKgIDlEuAObHCRLhI3oVAAAAAElFTkSuQmCC', 'base64') });
await page.waitForSelector('.avatarbtn img', { timeout: 8000 });
log('avatar photo uploaded');

log('you page');
await shot(page, '16-you');

// ledger card sheet
await page.click('[data-act="card"]');
await page.waitForSelector('.sheet canvas', { timeout: 10000 });
await page.waitForTimeout(600);
await shot(page, '17-ledger-card');
await page.click('.sheet__grab');
await page.waitForTimeout(400);

// plus
await page.goto(BASE + '/#/plus');
await page.waitForSelector('.plus-hero', { timeout: 10000 });
await shot(page, '18-plus');

// ---------- 8. dark mode ----------
await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
await page.goto(BASE + '/#/');
await page.waitForSelector('.netcard');
await page.waitForTimeout(700);
await shot(page, '19-home-dark');
await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });

// ---------- 9. desktop layout ----------
const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const dpage = await desk.newPage();
dpage.on('pageerror', (e) => errors.push(`[desk pageerror] ${String(e.message).slice(0, 200)}`));
// reuse session? new context = logged out; show landing on desktop instead
await dpage.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await dpage.waitForSelector('.auth');
await dpage.waitForTimeout(800);
await dpage.screenshot({ path: `${OUT}/20-desktop-landing.png` });
log('desktop landing shot');

// ---------- 10. offline behaviour ----------
await page.context().setOffline(true);
await page.goto(BASE + '/#/', { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/21-offline.png` });
await page.context().setOffline(false);
log('offline shot taken');

console.log('\n=== console/page errors:', errors.length);
for (const e of errors.slice(0, 25)) console.log('  ', e);
await browser.close();
process.exit(errors.length ? 2 : 0);
