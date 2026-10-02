/* Design audit: seed a demo ledger, shoot the key screens light + dark. */
import { chromium } from 'playwright-core';

const BASE = 'http://localhost:4173';
const OUT = 'shots/audit';
import { mkdirSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

const shot = async (name) => { await page.waitForTimeout(1200); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('•', name); };

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.goto(BASE + '/#/', { waitUntil: 'networkidle' });
await shot('a1-landing');

// demo signup + seed
await page.click('[data-act="demo"]');
await page.waitForSelector('.netcard', { timeout: 20000 });
await page.waitForTimeout(900);
await shot('a2-home-light');

// friend page
await page.click('.person');
await page.waitForSelector('.balance-hero');
await shot('a3-friend-light');

// you page
await page.goto(BASE + '/#/you');
await page.waitForSelector('.profile-head');
await shot('a4-you-light');

// groups
await page.goto(BASE + '/#/groups');
await page.waitForTimeout(700);
await shot('a5-groups-light');

// record sheet open
await page.goto(BASE + '/#/');
await page.waitForSelector('.netcard');
await page.click('#tabAdd');
await page.waitForSelector('.compose');
await shot('a6-sheet-light');
await page.click('.compose__top .iconbtn');
await page.waitForTimeout(400);

// dark home + friend
await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
await page.waitForTimeout(400);
await shot('a7-home-dark');
await page.click('.person');
await page.waitForSelector('.balance-hero');
await shot('a8-friend-dark');

console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'errors: 0');
await browser.close();
