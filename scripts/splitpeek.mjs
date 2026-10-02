import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
mkdirSync('shots/peek', { recursive: true });
const B = 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto(B + '/');
await p.click('[data-act="demo"]');
await p.waitForSelector('.netcard', { timeout: 15000 });
await p.waitForTimeout(800);
await p.goto(B + '/#/groups');
await p.waitForSelector('[data-group]', { timeout: 8000 });
await p.click('[data-group]');
await p.waitForSelector('[data-act="split"]', { timeout: 8000 });
await p.click('[data-act="split"]');
await p.waitForSelector('.keypad2', { timeout: 8000 });
for (const k of ['1', '0', '0', '0', '0']) await p.click(`.keypad2 .key2:text-is("${k}")`);
await p.waitForTimeout(400);
await p.screenshot({ path: 'shots/peek/s1-split-light.png' });
await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; document.documentElement.dataset.effective = 'dark'; });
await p.waitForTimeout(400);
await p.screenshot({ path: 'shots/peek/s2-split-dark.png' });
const info = await p.evaluate(() => ({
  rows: [...document.querySelectorAll('.pick .pick__name')].map((e) => e.textContent),
  summary: document.querySelectorAll('.sheet .card .tiny')[0]?.textContent?.slice(0, 90),
  go: document.querySelector('.sheet__foot .btn')?.textContent,
}));
console.log(JSON.stringify(info, null, 1), 'errors:', errs.length);
await browser.close();
