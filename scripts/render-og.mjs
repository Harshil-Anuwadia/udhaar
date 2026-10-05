import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { BrandMark } from '../public/js/ui/brand.js';
import { Art } from '../public/js/ui/art.js';

const sans = readFileSync(new URL('../public/fonts/dm-sans-latin.woff2', import.meta.url)).toString('base64');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>
    @font-face{font-family:DM;src:url(data:font/woff2;base64,${sans})}
    :root{--ink:#111;--ink-2:#343736;--ink-3:#626765;--paper:#fff;--surface:#fff;--line-2:#CED3CE;--credit:#236646;--credit-bg:#E7F0E9;--brand-green:#70AD89}
    *{box-sizing:border-box}body{margin:0;background:#fff;color:#111;font-family:DM,Arial}
    .wrap{display:grid;grid-template-columns:.93fr 1.07fr;gap:48px;align-items:center;height:630px;padding:54px 76px}
    .brand{display:flex;align-items:center;gap:13px;font-size:42px;font-weight:750;letter-spacing:-.06em;margin-bottom:84px}
    .brand-mark{display:block;width:44px;height:44px;flex:0 0 auto}
    h1{font-size:78px;line-height:1.04;letter-spacing:-.045em;margin:0 0 25px;font-weight:700}
    p{font-size:24px;line-height:1.4;color:#626765;margin:0;max-width:24ch}
    .art{display:block;width:100%;max-height:540px;object-fit:contain}
  </style><div class="wrap"><div><div class="brand">${BrandMark()}udhaar<span style="color:#70AD89;margin-left:-13px">.</span></div><h1>Friends,<br>money, sorted.</h1><p>A shared ledger for money, favours, and promises.</p></div>${Art.book()}</div>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: new URL('../public/og.png', import.meta.url).pathname });
  console.log('Rendered social preview.');
} finally { await browser.close(); }
