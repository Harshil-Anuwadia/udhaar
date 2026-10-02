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

// geometry probe
const probe = await p.evaluate(() => {
  const key = document.querySelectorAll('.sheet .key')[4];
  key.scrollIntoView({ block: 'center' });
  const r = key.getBoundingClientRect();
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const el = document.elementFromPoint(cx, cy);
  return { rect: { x: r.x, y: r.y, w: r.width, h: r.height }, at: el?.className?.toString().slice(0, 40), atText: el?.textContent?.slice(0, 12) };
});
console.log('probe after scrollIntoView:', JSON.stringify(probe));
await p.waitForTimeout(400);
const probe2 = await p.evaluate(() => {
  const key = document.querySelectorAll('.sheet .key')[4];
  const r = key.getBoundingClientRect();
  const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return { y: r.y, at: el?.className?.toString().slice(0, 40), bodyScroll: document.querySelector('.sheet__body').scrollTop };
});
console.log('probe 400ms later:', JSON.stringify(probe2));

// synthetic click works?
await p.evaluate(() => document.querySelectorAll('.sheet .key')[4].click());
console.log('after synthetic click amount:', await p.evaluate(() => document.querySelector('.amount-display')?.textContent));
await b.close();
