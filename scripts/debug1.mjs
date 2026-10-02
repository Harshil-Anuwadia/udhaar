import { chromium } from 'playwright-core';
const b = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('PAGEERROR', e.message));
p.on('console', m => { if (m.type()==='error') console.log('CONSOLE', m.text().slice(0,200)); });
await p.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.auth');
await p.click('[data-act="signup"]');
await p.waitForTimeout(1200);
const info = await p.evaluate(() => {
  const s = document.querySelector('.sheet');
  const scrim = document.querySelector('.scrim');
  const btn = document.querySelector('.sheet__foot .btn');
  const r = s?.getBoundingClientRect();
  const br = btn?.getBoundingClientRect();
  return {
    sheetClass: s?.className, sheetStyle: s?.getAttribute('style'),
    rect: r && { x: r.x, y: r.y, w: r.width, h: r.height },
    btnRect: br && { x: br.x, y: br.y, w: br.width, h: br.height },
    scrimClass: scrim?.className, scrimZ: scrim && getComputedStyle(scrim).zIndex,
    sheetZ: s && getComputedStyle(s).zIndex,
    translate: s && getComputedStyle(s).translate,
    bodyChildren: [...document.body.children].map(c => c.id || c.className).slice(0,8),
  };
});
console.log(JSON.stringify(info, null, 1));
await b.close();
