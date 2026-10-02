import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

// Render directly from our vector source, without the app's navigation/SW.
const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage({ serviceWorkers: 'block' });
  for (const size of [32, 180, 192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;padding:0}svg{display:block;width:100vw;height:100vh}</style>${svg}`);
    const name = size === 32 ? 'favicon-32' : size === 180 ? 'apple-touch-icon' : `icon-${size}`;
    await page.locator('svg').screenshot({ path: new URL(`../public/icons/${name}.png`, import.meta.url).pathname, omitBackground: true });
  }
  await page.setViewportSize({ width: 512, height: 512 });
  await page.setContent(`<style>html,body{margin:0;padding:0;background:#17150F}svg{display:block;width:80vw;height:80vh;margin:10vw}</style>${svg}`);
  await page.screenshot({ path: new URL('../public/icons/maskable-512.png', import.meta.url).pathname });
  console.log('Generated favicon, touch, app and maskable icons from icon.svg.');
} finally { await browser.close(); }
