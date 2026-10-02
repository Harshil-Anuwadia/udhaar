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
await p.waitForTimeout(600);
console.log(await p.evaluate(() => {
  const sheets = [...document.querySelectorAll('.sheet')];
  return {
    count: sheets.length,
    info: sheets.map(s => ({ label: s.getAttribute('aria-label'), z: s.style.zIndex, open: s.classList.contains('is-open'), bodyScroll: s.querySelector('.sheet__body')?.scrollTop, keyY: Math.round(s.querySelector('.key')?.getBoundingClientRect().y ?? -1) })),
    scrims: [...document.querySelectorAll('.scrim')].map(s => s.style.zIndex + '/' + s.className),
    hash: location.hash,
  };
}));
await b.close();
