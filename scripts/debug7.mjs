import { chromium } from 'playwright-core';
const b = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on('console', m => { const t = m.text(); if (t.startsWith('TRACE') || t.startsWith('RENDER')) console.log(t.split('\n').slice(0,6).join('  ')); });
await p.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.auth');
await p.click('[data-act="demo"]');
await p.waitForSelector('.netcard', { timeout: 20000 });
await p.evaluate(() => {
  const origPush = history.pushState;
  window.addEventListener('hashchange', e => console.log('RENDER hashchange →', location.hash));
  window.addEventListener('popstate', () => console.log('RENDER popstate →', location.hash));
});
await p.click('#fab');
await p.waitForTimeout(1500);
console.log('sheets:', await p.evaluate(() => document.querySelectorAll('.sheet').length));
await b.close();
