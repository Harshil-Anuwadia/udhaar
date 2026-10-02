import { chromium } from 'playwright-core';
const b = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0,300)));
await p.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.auth');
// demo path for speed
await p.click('[data-act="demo"]');
await p.waitForSelector('.netcard', { timeout: 20000 });
await p.click('#fab');
await p.waitForSelector('.sheet .keypad');
await p.waitForTimeout(600);
const samples = [];
for (let i = 0; i < 8; i++) {
  samples.push(await p.evaluate(() => {
    const body = document.querySelector('.sheet__body');
    const act = document.activeElement;
    return { st: body?.scrollTop, sh: body?.scrollHeight, ch: body?.clientHeight, active: act?.className?.slice?.(0, 30) || act?.tagName };
  }));
  await p.waitForTimeout(250);
}
console.log(JSON.stringify(samples));
// try a normal click on key 5
try {
  await p.click('.sheet .key:nth-child(5)', { timeout: 4000 });
  console.log('click key5 OK');
} catch (e) { console.log('click key5 FAILED:', e.message.split('\n')[0]); }
console.log('amount now:', await p.evaluate(() => document.querySelector('.amount-display')?.textContent));
await p.screenshot({ path: 'shots/dbg-record.png' });
await b.close();
