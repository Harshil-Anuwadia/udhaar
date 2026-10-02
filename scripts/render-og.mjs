import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { BrandMark } from '../public/js/ui/brand.js';

const sans = readFileSync(new URL('../public/fonts/dm-sans-latin.woff2', import.meta.url)).toString('base64');
const serif = readFileSync(new URL('../public/fonts/instrument-serif-latin.woff2', import.meta.url)).toString('base64');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>
    @font-face{font-family:DM;src:url(data:font/woff2;base64,${sans})}
    @font-face{font-family:Instrument;src:url(data:font/woff2;base64,${serif})}
    :root{--ink:#17150f;--paper:#f5f2e9;--due:#c4372a}*{box-sizing:border-box}body{margin:0;background:#f5f2e9;color:#17150f;font-family:DM,Arial}
    .wrap{display:grid;grid-template-columns:1fr 380px;gap:64px;align-items:center;height:630px;padding:64px 76px}
    .brand{display:flex;align-items:center;gap:14px;font:48px Instrument,Georgia;margin-bottom:48px}
    .brand-mark{display:block;width:48px;height:48px;flex:0 0 auto}
    h1{font-size:86px;line-height:1.04;letter-spacing:-.06em;margin:0 0 22px;font-weight:650}
    p{font-size:26px;line-height:1.35;color:#514d43;margin:0;max-width:22ch}
    .card{background:#fefdf9;border:1px solid #d8d1c1;border-radius:18px;padding:28px;box-shadow:0 8px 24px #17150f12}
    .card h2{font-size:20px;margin:0 0 38px}.small{font-size:16px;color:#746e61}.amount{font-size:68px;letter-spacing:-.05em;font-weight:650;margin:5px 0 2px;color:#21409b}.row{display:flex;justify-content:space-between;border-top:1px solid #e2dccc;padding:21px 0;font-size:20px}.row:last-child{padding-bottom:0}.row b{color:#21409b}.row:last-child b{color:#c4372a}
  </style><div class="wrap"><div><div class="brand">${BrandMark()}udhaar<span style="color:#c4372a;margin-left:-14px">.</span></div><h1>Who paid<br>last time?</h1><p>The cab, the split, the “I’ll send it later.” Keep tabs without searching the group chat.</p></div><div class="card"><h2>Your ledger</h2><div class="small">Net position</div><div class="amount">₹610</div><div class="small" style="margin-bottom:35px">Across two people</div><div class="row"><span>Sam · dinner</span><b>+₹850</b></div><div class="row"><span>Arjun · cab</span><b>−₹240</b></div></div></div>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: new URL('../public/og.png', import.meta.url).pathname });
  console.log('Rendered social preview.');
} finally { await browser.close(); }
