import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
mkdirSync('shots/peek', { recursive: true });
const B = 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('request', r => { if (r.url().includes('/api/')) console.log('REQ', r.url().split('4173')[1]); });
p.on('requestfailed', r => console.log('REQFAIL', r.url().split('4173')[1], r.failure()?.errorText));
p.on('response', r => { if (r.url().includes('/api/')) console.log('RES', r.status(), r.url().split('4173')[1]); });
await p.goto(B + '/');
await p.click('[data-act="demo"]');
await p.waitForSelector('.netcard', { timeout: 15000 });
await p.waitForTimeout(900);
const has = await p.$('[data-act="overdue"]');
if (!has) { console.log('no overdue row in demo'); await browser.close(); process.exit(0); }
await p.click('[data-act="overdue"]');
await p.waitForSelector('.sheet.is-open');
await p.waitForTimeout(2500);
await p.screenshot({ path: 'shots/peek/o1-overdue.png' });
const info = await p.evaluate(() => ({
  labels: [...document.querySelectorAll('.sheet .field__label')].map((e) => e.textContent),
  nudge: document.querySelector('[data-nudgeall]')?.textContent || null,
  rows: document.querySelectorAll('.sheet .entry').length,
}));
console.log(JSON.stringify(info), 'errors:', errs.length);
console.log('SHEET TEXT:', (await p.evaluate(() => document.querySelector('.sheet')?.innerText || 'NONE')).slice(0, 300));
console.log('SHEET STATE:', JSON.stringify(await p.evaluate(() => {
  const sheets = [...document.querySelectorAll('.sheet')];
  return sheets.map((sh) => ({
    cls: sh.className,
    rect: Math.round(sh.getBoundingClientRect().height),
    bodyKids: sh.querySelector('.sheet__body')?.children.length ?? -1,
    bodyHtml: (sh.querySelector('.sheet__body')?.innerHTML || '').slice(0, 80),
    transform: getComputedStyle(sh).transform.slice(0, 40),
  }));
})));
await browser.close();
