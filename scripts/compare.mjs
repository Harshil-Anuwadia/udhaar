/* Before/after: shoots the old-design replica and the live app with identical
   data, both themes, then composes a labelled comparison sheet. */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'shots', 'compare');
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:4173';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();

// ---- BEFORE: replica page, light + dark ----
await page.goto('file://' + path.join(HERE, 'compare-before.html'));
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(OUT, 'before-light.png') });
await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, 'before-dark.png') });
console.log('• before light+dark');

// ---- AFTER: live app, demo ledger, toasts faded ----
await page.goto(BASE + '/#/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.goto(BASE + '/#/', { waitUntil: 'networkidle' });
await page.click('[data-act="demo"]');
await page.waitForSelector('.netcard', { timeout: 20000 });
await page.waitForTimeout(5200); // let the demo toast fade so both columns are clean
await page.screenshot({ path: path.join(OUT, 'after-light.png') });
await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(OUT, 'after-dark.png') });
console.log('• after light+dark');

// ---- compose the sheet ----
const grid = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin:0; background:#17150F; font-family:system-ui,sans-serif; color:#F3EFE3; padding:28px 24px 32px; }
  h1 { font-size:22px; margin:0 0 4px; letter-spacing:-.02em; }
  p.sub { margin:0 0 22px; font-size:13px; color:#8E887A; }
  .cols { display:grid; grid-template-columns:auto auto; gap:18px 26px; justify-content:start; }
  .cap { font-size:11px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; margin-bottom:8px; }
  .cap.before { color:#FF8A73; } .cap.after { color:#7FCFA0; }
  .rowlabel { writing-mode:vertical-rl; transform:rotate(180deg); align-self:center; font-size:10px; letter-spacing:.18em; color:#615C50; font-weight:700; }
  img { width:300px; border-radius:18px; display:block; box-shadow:0 12px 40px rgb(0 0 0/.5); }
  .grid { display:grid; grid-template-columns:auto auto auto; gap:18px 14px; align-items:start; }
</style></head><body>
  <h1>Udhaar home — redesign comparison</h1>
  <p class="sub">Same data, same viewport. Left: the ruled-notebook build you rejected. Right: the current statement design.</p>
  <div class="grid">
    <div></div>
    <div><div class="cap before">Before · ruled notebook</div></div>
    <div><div class="cap after">After · statement design</div></div>
    <div class="rowlabel">LIGHT</div>
    <img src="before-light.png"><img src="after-light.png">
    <div class="rowlabel">DARK</div>
    <img src="before-dark.png"><img src="after-dark.png">
  </div>
</body></html>`;
import { writeFileSync } from 'node:fs';
writeFileSync(path.join(OUT, 'grid.html'), grid);
const gp = await ctx.newPage();
await gp.setViewportSize({ width: 760, height: 100 });
await gp.goto('file://' + path.join(OUT, 'grid.html'));
await gp.waitForTimeout(700);
const h = await gp.evaluate(() => document.body.scrollHeight);
await gp.setViewportSize({ width: 760, height: h + 40 });
await gp.waitForTimeout(400);
await gp.screenshot({ path: path.join(OUT, 'home-before-after.png'), fullPage: true });
console.log('• composed home-before-after.png');
await browser.close();
