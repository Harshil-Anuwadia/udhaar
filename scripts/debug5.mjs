import { chromium } from 'playwright-core';
const b = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
await p.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.auth');
await p.click('[data-act="demo"]');
await p.waitForSelector('.netcard', { timeout: 20000 });
await p.click('#fab');
await p.waitForSelector('.sheet .keypad');
await p.waitForTimeout(500);
const dump = await p.evaluate(() => {
  const q = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { s, y: Math.round(r.y), h: Math.round(r.height) }; };
  return [
    q('.sheet'), q('.sheet__body'), q('.amount-display'), q('.quickrow'), q('.sheet .keypad'), q('.sheet .key'),
    q('.seg-dir'), q('.sheet__foot'),
  ];
});
console.log(JSON.stringify(dump, null, 1));
await b.close();
