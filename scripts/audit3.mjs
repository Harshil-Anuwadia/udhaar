/* Audit 3: polish pass verification at two widths. */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:4173';
const OUT = 'shots/audit';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });

for (const width of [390, 320]) {
  const tag = width === 390 ? 'c' : 'n'; // c = comfort, n = narrow
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  const shot = async (n) => { await page.waitForTimeout(1000); await page.screenshot({ path: `${OUT}/${tag}${n}.png` }); console.log('•', tag + n); };

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE + '/#/', { waitUntil: 'networkidle' });
  await page.click('[data-act="demo"]');
  await page.waitForSelector('.netcard', { timeout: 20000 });
  await page.waitForTimeout(4200);
  await shot('1-home-top');
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight }));
  await shot('2-home-bottom');

  await page.goto(BASE + '/#/you');
  await page.waitForSelector('.profile-head');
  await shot('3-you');
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight }));
  await shot('4-you-settings');

  await page.goto(BASE + '/#/');
  await page.waitForSelector('.person');
  await page.click('.person');
  await page.waitForSelector('.balance-hero');
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight }));
  await shot('5-friend-bottom');

  await page.goto(BASE + '/#/plus');
  await page.waitForSelector('.plus-hero');
  await shot('6-plus');

  // record sheet via the new bar action
  await page.goto(BASE + '/#/');
  await page.waitForSelector('.netcard');
  await page.click('#tabAdd');
  await page.waitForSelector('.compose');
  await shot('7-sheet');

  console.log(tag, 'errors:', errs.length ? errs.join('|') : 0);
  await ctx.close();
}
await browser.close();
