import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const shots = process.env.UI_SHOTS || '/tmp/udhaar-mobile-polish';
mkdirSync(shots, { recursive:true });
const browser = await chromium.launch({args:['--no-sandbox']});
try {
  const desktop = await browser.newPage({viewport:{width:1366,height:900}, serviceWorkers:'block'});
  const desktopRequests = [];
  desktop.on('request', r => desktopRequests.push(r.url()));
  await desktop.goto(base, {waitUntil:'networkidle'});
  assert.equal(await desktop.locator('.desktop-gate').isVisible(), true);
  assert.equal(await desktop.locator('#app').isVisible(), false);
  assert.equal(desktopRequests.some(url => url.endsWith('/js/main.js')), false, 'desktop never loads the mobile runtime');
  await desktop.screenshot({path:`${shots}/desktop.png`});
  await desktop.setViewportSize({width:390,height:700});
  assert.equal(await desktop.locator('.desktop-gate').isVisible(), true, 'a narrow desktop window stays on the notice');
  await desktop.close();

  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base, {waitUntil:'networkidle'});
  assert.equal(await page.locator('.desktop-gate').isVisible(), false);
  await page.screenshot({path:`${shots}/login.png`});
  await page.locator('[data-act="demo"]').click();
  await page.locator('[data-person]').first().waitFor();
  if (await page.locator('.toast__close').count()) await page.locator('.toast__close').first().click();
  const friend = await page.locator('[data-person]').first().getAttribute('data-person');
  await page.locator('[data-tab="groups"]').click();
  await page.locator('[data-group]').first().waitFor();
  const group = await page.locator('[data-group]').first().getAttribute('data-group');

  async function check(name) {
    const overflow = await page.evaluate(() => {
      const main = document.querySelector('#main');
      const bad = [...document.querySelectorAll('#main .btn, #main .setrow, #main .person, #main .groupcard')].filter(el => el.scrollWidth > el.clientWidth + 2).map(el => el.className);
      if (main.scrollWidth > main.clientWidth + 1) bad.push('main');
      return bad;
    });
    assert.deepEqual(overflow, [], name);
    await page.screenshot({path:`${shots}/${name}.png`});
  }

  for (const theme of ['light','dark']) {
    if (theme === 'dark') {
      await page.goto(`${base}/#/you`);
      await page.locator('[data-act="theme"]').click();
      await page.getByRole('button',{name:/Ink.*Graphite/}).click();
      await page.locator('.sheet.is-open').waitFor({state:'detached'});
    }
    for (const width of [320,390]) {
      await page.setViewportSize({width,height:width === 320 ? 568 : 844});
      for (const [name,path,ready] of [['people','/','.netcard'],['friend',`/friend/${friend}`,'.balance-hero'],['groups','/groups','[data-group]'],['group',`/group/${group}`,'[data-act="split"]'],['alerts','/activity','.activity-section, .empty'],['account','/you','.account-profile'],['amount',`/add?friend=${friend}`,'#compose-amount']]) {
        await page.goto(`${base}/#${path}`);
        await page.locator(ready).first().waitFor();
        if (name === 'group') {
          assert.equal(await page.locator('[data-act="split"]').count(),1,'one bill action');
          assert.equal(await page.locator('[data-tab="groups"]').getAttribute('aria-current'),'page');
        }
        if (name === 'account') {
          assert.equal(await page.locator('[data-set="logout"]').count(),1);
          assert.equal(await page.locator('.account-quick [data-act="logout"]').count(),0);
        }
        await check(`${theme}-${name}-${width}`);
      }
    }
  }
  await page.goto(`${base}/#/group/${group}`);
  await page.reload();
  await page.locator('[data-act="split"]').waitFor();
  await page.locator('#hdrBack').click();
  await page.waitForURL(/#\/groups$/);
  await page.goto(`${base}/#/friend/${friend}`);
  await page.reload();
  await page.locator('.balance-hero').waitFor();
  await page.locator('#hdrBack').click();
  await page.waitForURL(/#\/$/);
  assert.deepEqual(errors, []);
  console.log('Mobile layouts pass at 320/390 in both themes; one bill action, active group tab, deep-link back navigation, and desktop notice verified.');
} finally { await browser.close(); }
