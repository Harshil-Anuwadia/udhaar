/* Audit 2: the screens audit.mjs doesn't cover. */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:4173';
const OUT = 'shots/audit';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
const shot = async (n) => { await page.waitForTimeout(1100); await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('•', n); };

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.goto(BASE + '/#/', { waitUntil: 'networkidle' });
await page.click('[data-act="demo"]');
await page.waitForSelector('.netcard', { timeout: 20000 });

await page.goto(BASE + '/#/activity');
await page.waitForSelector('.screen');
await shot('b1-alerts');

await page.goto(BASE + '/#/');
await page.waitForSelector('.person');
await page.click('.person');
await page.waitForSelector('.balance-hero');
await page.click('#openList .entry');
await page.waitForSelector('.sheet.is-open');
await shot('b2-entry-sheet');
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

await page.evaluate(() => document.querySelector('#openList .swipe')?.classList.add('is-open'));
await shot('b3-swipe');

await page.goto(BASE + '/#/groups');
await page.waitForSelector('.groupcard');
await shot('b4-groups');

await page.goto(BASE + '/#/plus');
await page.waitForSelector('.plus-hero');
await shot('b5-plus');

console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'errors: 0');
await browser.close();
