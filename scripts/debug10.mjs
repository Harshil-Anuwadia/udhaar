import { chromium } from 'playwright-core';
const b = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERR', m.text()); });
await p.goto('http://127.0.0.1:4173/');
await p.waitForSelector('[data-act="demo"]');
await p.click('[data-act="demo"]');
await p.waitForSelector('.netcard');
await p.click('.person');
await p.waitForSelector('.swipe');
await p.waitForTimeout(4200); // let the toast clear the swipe zone
const row = await p.$('.swipe');
await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
await p.waitForTimeout(250);
const box = await row.boundingBox();
await p.evaluate(() => {
  window.__log = [];
  window.addEventListener('hashchange', () => window.__log.push('HASH ' + location.hash));
  ['mousedown','mousemove','mouseup','click'].forEach(t =>
    document.addEventListener(t, (e) => window.__log.push(t + '@' + Math.round(e.clientX) + ',' + Math.round(e.clientY) + '>' + (e.target.tagName || '?') + '.' + String(e.target.className && e.target.className.baseVal !== undefined ? e.target.className.baseVal : e.target.className).slice(0,24)), { passive: true }));
});
const y = box.y + box.height / 2;
console.log('box', JSON.stringify(box));
console.log('at point:', await p.evaluate(([x, yy]) => {
  const el = document.elementFromPoint(x, yy);
  return el ? el.tagName + '.' + (el.className || '').toString().slice(0, 40) : 'null';
}, [box.x + box.width - 40, y]));
await p.mouse.move(box.x + box.width - 40, y);
await p.mouse.down();
await p.mouse.move(box.x + box.width - 150, y, { steps: 10 });
await p.mouse.up();
await p.waitForTimeout(400);
await p.screenshot({ path: 'shots/dbg-swipe.png' });
const res = await p.evaluate(() => ({
  scrollY: window.scrollY, mainScroll: document.querySelector('main')?.scrollTop, screenScroll: document.querySelector('.screen')?.scrollTop,
  log: window.__log.slice(0, 24),
  isOpen: document.querySelector('.swipe').classList.contains('is-open'),
  inlineTranslate: document.querySelector('.swipe__content').style.translate,
}));
console.log(JSON.stringify(res, null, 1));
await b.close();
