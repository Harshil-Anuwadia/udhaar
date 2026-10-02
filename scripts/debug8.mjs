import { chromium } from 'playwright-core';
const b = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
await p.goto('http://127.0.0.1:4173/');
await p.waitForSelector('[data-act="demo"]', { timeout: 15000 });
await p.click('[data-act="demo"]');
await p.waitForSelector('.netcard__verdict', { timeout: 15000 });
const info = await p.evaluate(() => {
  const el = document.querySelector('.netcard__verdict');
  const t = el.textContent;
  return { text: t.slice(0, 30), codes: [...t.slice(0, 12)].map(c => c.charCodeAt(0)) };
});
console.log(JSON.stringify(info));
await b.close();
