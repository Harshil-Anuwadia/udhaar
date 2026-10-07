// Critical mobile journeys, using the real API and an isolated database.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { productContrast } from './product-contrast.mjs';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'udhaar-product-'));
process.env.DATA_DIR = directory;
process.env.TURSO_DATABASE_URL = `file:${directory}/test.db`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.JWT_SECRET = 'isolated-mobile-product-fixture-secret';
const [{ default: app }, { db }] = await Promise.all([import('../server/index.js'), import('../server/db.js')]);
await db.ready;
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;

try {
  const request = async (route, data, method = data === undefined ? 'GET' : 'POST') => {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    assert.ok(response.ok, `${route}: ${response.status}`);
    return response.json();
  };
  let token;
  const signup = await request('/api/auth/signup', { name: 'Maya Shah', handle: 'mayaproduct', secret: 'product-fixture-password', currency: 'INR' });
  token = signup.token;
  await request('/api/me/onboarded', {});
  const { friend } = await request('/api/friends', { name: 'Sana' });
  const { entry } = await request('/api/entries', { friendshipId: friend.id, kind: 'money', direction: 'owed_to_me', amount: 100, note: 'Train tickets' });
  // Currency conversion can leave fractional outstanding amounts.
  await db.prepare('UPDATE entries SET amount = 100.25 WHERE id = ?').run(entry.id);
  await request(`/api/friends/${friend.id}/moments`, { title: 'The café after the rain', occurredOn: '2026-09-30', note: 'We stayed until closing.' });
  const { friend: arjun } = await request('/api/friends', { name: 'Arjun' });
  for (const [note, amount, direction, status, date] of [
    ['Dinner at the corner place', 1650, 'owed_to_me', 'open', '2026-10-05'],
    ['Weekend groceries', 420, 'owed_by_me', 'open', '2026-10-03'],
    ['Airport cab', 780, 'owed_to_me', 'settled', '2026-09-29'],
    ['Shared subscription', 299, 'owed_by_me', 'disputed', '2026-09-26'],
  ]) {
    const { entry: line } = await request('/api/entries', { friendshipId: arjun.id, kind: 'money', direction, amount, note });
    const at = new Date(`${date}T12:00:00`).getTime();
    await db.prepare('UPDATE entries SET status = ?, created_at = ?, due_at = ?, settled_at = ? WHERE id = ?').run(status, at, status === 'open' ? Date.now() - 86400000 : null, status === 'settled' ? at + 86400000 : null, line.id);
  }
  const { friend: kabir } = await request('/api/friends', { name: 'Kabir' });
  await request('/api/entries', { friendshipId: kabir.id, kind: 'money', direction: 'owed_by_me', amount: 900, note: 'Concert tickets for Friday' });
  await request('/api/entries', { friendshipId: kabir.id, kind: 'favor', direction: 'owed_to_me', amount: 0, note: 'Help me move the bookshelf' });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await context.addInitScript(value => localStorage.setItem('udhaar.at', value), token);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const screenshot = async name => {
    if (process.env.PRODUCT_SCREENSHOTS) {
      await fs.mkdir(process.env.PRODUCT_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: path.join(process.env.PRODUCT_SCREENSHOTS, `${name}.png`) });
    }
  };
  const fits = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.querySelector('#main').scrollWidth > document.querySelector('#main').clientWidth + 1), false, 'mobile layout has no horizontal overflow');
  const viewportFits = async ({ content = false } = {}) => {
    await page.locator('#boot').waitFor({ state: 'detached' });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await fits();
    const metrics = await page.evaluate(() => {
      const main = document.querySelector('#main');
      const screen = document.querySelector('.product-screen');
      const body = screen.querySelector('.product-body') || screen;
      const footer = screen.querySelector('.product-foot');
      const rect = element => element.getBoundingClientRect();
      const action = footer?.querySelector('.btn--primary');
      const actionBox = action && rect(action);
      return {
        pageOverflow: document.documentElement.scrollHeight - innerHeight,
        mainOverflow: main.scrollHeight - main.clientHeight,
        contentOverflow: body.scrollHeight - body.clientHeight,
        screenBottom: rect(screen).bottom, mainBottom: rect(main).bottom,
        footerFits: !footer || (rect(footer).top >= rect(main).top && rect(footer).bottom <= rect(main).bottom + 1),
        actionReachable: !action || action.contains(document.elementFromPoint(actionBox.x + actionBox.width / 2, actionBox.y + actionBox.height / 2)),
        actionHit: actionBox && document.elementFromPoint(actionBox.x + actionBox.width / 2, actionBox.y + actionBox.height / 2)?.outerHTML.slice(0, 180),
      };
    });
    assert.ok(metrics.pageOverflow <= 1 && metrics.mainOverflow <= 1, `app shell must stay within the viewport: ${JSON.stringify(metrics)}`);
    assert.ok(metrics.screenBottom <= metrics.mainBottom + 1 && metrics.footerFits && metrics.actionReachable, `screen and actions must fit and stay reachable: ${JSON.stringify(metrics)}`);
    if (content) assert.ok(metrics.contentOverflow <= 1, `standard detail content must fit without scrolling: ${JSON.stringify(metrics)}`);
  };
  const controlsStayPut = async (scroller, controls) => {
    const result = await page.evaluate(({ scroller, controls }) => {
      const pane = document.querySelector(scroller);
      const positions = () => controls.map(selector => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return [box.top, box.bottom];
      });
      const before = positions();
      pane.scrollTop = pane.scrollHeight;
      return { before, after: positions(), scrolled: pane.scrollTop, height: pane.clientHeight, mainScroll: document.querySelector('#main').scrollTop };
    }, { scroller, controls });
    assert.deepEqual(result.after, result.before, 'scrolling content must not move navigation or actions');
    assert.equal(result.mainScroll, 0, 'the outer app must not scroll');
    assert.ok(result.scrolled > 0 && result.height >= 140, `content pane must scroll and have usable height: ${JSON.stringify(result)}`);
    await page.locator(scroller).evaluate(pane => pane.scrollTop = 0);
  };
  const readable = async () => {
    await page.waitForFunction(() => !document.documentElement.classList.contains('theme-anim'));
    assert.deepEqual(await page.evaluate(productContrast), [], 'visible text and functional icons retain accessible contrast');
  };
  const textContrast = async (selector, backgroundSelector) => {
    const ratio = await page.evaluate(({ selector, backgroundSelector }) => {
      const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
      const foreground = luminance(getComputedStyle(document.querySelector(selector)).color);
      const background = luminance(getComputedStyle(document.querySelector(backgroundSelector)).backgroundColor);
      return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
    }, { selector, backgroundSelector });
    assert.ok(ratio >= 4.5, `text must remain readable after switching themes (${selector}: ${ratio.toFixed(2)}:1)`);
  };

  await page.goto(base + '/#/');
  await page.getByRole('button', { name: /Review your ledger/ }).waitFor({ timeout: 6000 });
  await screenshot('home');
  await page.getByRole('button', { name: /Review your ledger/ }).click();
  await page.locator('#ledger-search').waitFor();
  await viewportFits();
  await screenshot('review');
  await page.locator('.ledger-filter-details summary').click();
  await page.locator('#ledger-status').selectOption('overdue');
  assert.equal(await page.locator('.review-journal .journal-row').count(), 2, 'overdue review uses real due dates');
  await page.locator('#ledger-status').selectOption('settled');
  assert.equal(await page.locator('.review-journal .journal-row').count(), 1);
  await page.locator('#ledger-status').selectOption('all');
  await page.locator('#ledger-month').selectOption('2026-09');
  assert.equal(await page.locator('.review-journal .journal-row').count(), 2);
  await page.locator('#ledger-direction').selectOption('owed_by_me');
  assert.equal(await page.locator('.review-journal .journal-row').count(), 1);
  await page.locator('#ledger-month').selectOption('all');
  await page.locator('#ledger-direction').selectOption('all');
  await page.locator('.ledger-filter-details summary').click();
  await page.locator('#ledger-search').fill('Sana');
  await page.getByRole('button', { name: /Train tickets/ }).click();
  await page.getByRole('button', { name: 'Record payment', exact: true }).waitFor();
  await screenshot('entry');
  await page.getByRole('button', { name: 'Remind Sana', exact: true }).click();
  await page.getByRole('dialog', { name: 'Message ready' }).waitFor({ timeout: 6000 });
  assert.equal(await page.getByRole('button', { name: 'Copy message' }).count(), 1, 'private ledgers retain a reminder message the user can choose to share');
  await page.getByRole('dialog', { name: 'Message ready' }).getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.locator('#ledger-search').waitFor();
  assert.equal(await page.locator('#ledger-search').inputValue(), 'Sana', 'detail Back restores the ledger search');
  await page.getByRole('button', { name: /Train tickets/ }).click();
  await page.getByRole('button', { name: 'Record payment', exact: true }).click();
  await page.locator('#payment-amount').fill('101');
  assert.equal(await page.getByRole('button', { name: 'Review payment', exact: true }).isEnabled(), false);
  await page.locator('#payment-amount').fill('40.10');
  assert.match(await page.locator('[data-payment-remaining]').innerText(), /60\.15/);
  await screenshot('payment');
  await page.getByRole('button', { name: 'Review payment', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  assert.equal(await page.locator('#payment-amount').inputValue(), '40.10', 'confirmation Back preserves the amount');
  await page.getByRole('button', { name: 'Review payment', exact: true }).click();
  await screenshot('confirmation');
  await page.getByRole('button', { name: 'Confirm record', exact: true }).click();
  await page.getByRole('heading', { name: 'Payment recorded' }).waitFor();
  await screenshot('recorded');
  let ledger = await request(`/api/friends/${friend.id}`);
  assert.equal(ledger.entries.find(x => x.id === entry.id).amount, 60.15);
  assert.equal(ledger.entries.filter(x => x.status === 'settled').length, 1);
  await page.getByRole('button', { name: 'Undo this record', exact: true }).click();
  await page.getByRole('button', { name: 'Record payment', exact: true }).waitFor();
  ledger = await request(`/api/friends/${friend.id}`);
  assert.equal(ledger.entries.find(x => x.id === entry.id).amount, 100.25);
  assert.equal(ledger.entries.length, 1, 'Undo removes precisely the payment fragment');

  await page.getByRole('button', { name: 'Record payment', exact: true }).click();
  await page.getByRole('button', { name: 'Review payment', exact: true }).click();
  await page.route(`**/api/entries/${entry.id}/settle`, route => route.fulfill({ status: 503, json: { message: 'Temporarily unavailable' } }));
  await page.getByRole('button', { name: 'Confirm record', exact: true }).click();
  await page.getByRole('link', { name: 'Check latest entry' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Confirm record', exact: true }).isEnabled(), false, 'an uncertain save cannot be submitted twice');
  assert.equal(await page.getByRole('button', { name: 'Edit amount', exact: true }).isEnabled(), false, 'editing cannot bypass an uncertain save');
  assert.equal(await page.getByRole('heading', { name: 'Payment recorded' }).count(), 0, 'failed request never claims payment success');
  await page.unroute(`**/api/entries/${entry.id}/settle`);
  await page.getByRole('link', { name: 'Check latest entry' }).click();
  await page.getByRole('button', { name: 'Record payment', exact: true }).click();
  await page.locator('#payment-amount').fill('20');
  await page.getByRole('button', { name: 'Review payment', exact: true }).click();
  // A counterparty change between review and save must appear in the receipt.
  await db.prepare('UPDATE entries SET amount = 90.25, version = version + 1 WHERE id = ?').run(entry.id);
  await page.getByRole('button', { name: 'Confirm record', exact: true }).click();
  await page.getByRole('heading', { name: 'Payment recorded' }).waitFor();
  assert.match(await page.locator('.payment-receipt--saved').innerText(), /70\.25/);
  await page.getByRole('button', { name: 'Undo this record', exact: true }).click();
  await page.getByRole('button', { name: 'Record payment', exact: true }).waitFor();

  await page.goto(base + `/#/friend/${friend.id}/story`);
  await page.getByRole('heading', { name: 'The café after the rain' }).waitFor();
  assert.match(await page.locator('.story-timeline').innerText(), /Only you/);
  await screenshot('story');
  await page.getByRole('button', { name: 'Moments', exact: true }).click();
  assert.equal(await page.locator('.story-timeline [data-entry-route]').count(), 0);
  await page.getByRole('button', { name: 'Add a moment', exact: true }).click();
  await page.locator('#moment-title').fill('A long walk home');
  await page.getByRole('button', { name: 'Keep this moment' }).click();
  await page.getByRole('heading', { name: 'A long walk home' }).waitFor();
  await page.getByRole('button', { name: 'All activity', exact: true }).click();
  await page.locator('.toast__close').evaluateAll(buttons => buttons.forEach(button => button.click()));
  await page.waitForFunction(() => !document.querySelector('.toast'));
  await screenshot('story');
  await page.locator('.story-timeline').evaluate(pane => pane.scrollTop = 430);
  await screenshot('story-timeline');

  await page.goto(base + `/#/friend/${friend.id}`);
  await page.locator('.person-story-link').waitFor();
  await screenshot('person');
  await page.locator('.person-story-link').click();
  await page.locator('.story-cover').waitFor();
  await page.locator('#hdrBack').click();
  await page.locator('.balance-hero').waitFor();
  await page.locator('[data-tab="you"]').click();
  await page.locator('.account-profile').waitFor();
  assert.equal(await page.locator('.book-review-link').count(), 0, 'ledger review has one main entry point');
  await screenshot('account');
  await page.locator('[data-tab="home"]').click();
  await page.getByRole('button', { name: /Review your ledger/ }).click();
  await page.locator('#ledger-search').waitFor();

  await page.goto(base + '/#/review');
  await page.locator('#ledger-search').waitFor();
  await page.locator('#ledger-search').fill('Nothing should match this');
  await page.getByRole('heading', { name: 'No lines match.' }).waitFor();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  assert.equal(await page.locator('.review-journal .journal-row').count(), 7);
  await db.prepare('UPDATE entries SET note = ? WHERE id = ?').run('Train tickets · revised', entry.id);
  await page.evaluate(async () => { const { bus } = await import('/js/core/store.js'); bus.emit('refresh'); });
  await page.getByRole('button', { name: /Train tickets · revised/ }).waitFor({ timeout: 6000 });
  await page.route('**/api/entries/export', route => route.fulfill({ status: 503, json: { message: 'Check your connection.' } }));
  await page.reload();
  await page.getByRole('button', { name: 'Try again', exact: true }).waitFor();
  await page.unroute('**/api/entries/export');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.locator('#ledger-search').waitFor();
  await page.route('**/api/entries/export', route => route.fulfill({ json: { entries: [] } }));
  await page.reload();
  await page.getByRole('heading', { name: 'A clean first page.' }).waitFor();
  await page.unroute('**/api/entries/export');

  const { entry: favour } = await request('/api/entries', { friendshipId: friend.id, kind: 'favor', direction: 'owed_to_me', amount: 0, note: 'Bring the book back' });
  await page.goto(base + `/#/friend/${friend.id}/entry/${favour.id}`);
  await page.getByRole('button', { name: 'Mark as done' }).click();
  await page.getByRole('button', { name: 'Review record' }).click();
  await page.getByRole('button', { name: 'Confirm record' }).click();
  await page.getByRole('heading', { name: 'Line completed' }).waitFor();
  assert.equal((await request(`/api/friends/${friend.id}`)).entries.find(x => x.id === favour.id).status, 'settled');

  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jcVQAAAAASUVORK5CYII=';
  const { entry: receipt } = await request('/api/entries', { friendshipId: friend.id, kind: 'money', direction: 'owed_by_me', amount: 600, note: 'Dinner receipt', photos: [image, image] });
  await page.goto(base + `/#/friend/${friend.id}/entry/${receipt.id}`);
  await page.locator('.entry-receipts').waitFor();
  assert.equal(await page.locator('.entry-receipts .photo-gallery__item').count(), 2);
  await page.locator('.entry-receipts .photo-gallery__item').nth(1).click();
  await page.getByRole('dialog', { name: 'Dinner receipt' }).waitFor();
  assert.equal(await page.locator('.lightbox').evaluate(dialog => dialog.contains(document.activeElement)), true, 'photo viewer receives keyboard focus');
  assert.equal(await page.locator('#app').evaluate(app => app.inert), true, 'background controls are unavailable while viewing a photo');
  await page.keyboard.press('Tab');
  assert.equal(await page.getByRole('button', { name: 'Close photo' }).evaluate(button => button === document.activeElement), true);
  assert.equal(await page.locator('.lightbox img').evaluate(image => image.complete && image.naturalWidth > 0), true, 'private receipt loads in the full viewer');
  await page.keyboard.press('Escape');
  await page.locator('.lightbox').waitFor({ state: 'detached' });
  assert.equal(await page.locator('#app').evaluate(app => app.inert), false);
  assert.equal(await page.locator('.entry-receipts .photo-gallery__item').nth(1).evaluate(button => button === document.activeElement), true, 'closing returns focus to the photo that was opened');

  await page.goto(base + `/#/friend/${arjun.id}`);
  await page.locator('[data-act="settle-all"]').click();
  await page.route('**/api/entries/*/settle', route => route.fulfill({ status: 503, json: { message: 'Could not save this record.' } }));
  await page.getByRole('button', { name: 'Mark all settled', exact: true }).click();
  await page.locator('.toast--error').filter({ hasText: 'Check the latest ledger' }).waitFor({ timeout: 6000 });
  assert.equal(await page.locator('.toast--ok').filter({ hasText: /0 lines closed/ }).count(), 0, 'bulk failure cannot claim settlement success');
  await page.unroute('**/api/entries/*/settle');

  // Late person data must not replace a tab selected while it was loading.
  let release, requested;
  const held = new Promise(resolve => release = resolve);
  const started = new Promise(resolve => requested = resolve);
  await page.route(`**/api/friends/${friend.id}`, async route => { requested(); await held; await route.continue(); });
  await page.goto(base + `/#/friend/${friend.id}/story`);
  await started;
  await page.locator('[data-tab="you"]').click();
  await page.locator('.account-profile').waitFor();
  const response = page.waitForResponse(result => new URL(result.url()).pathname === `/api/friends/${friend.id}`);
  release();
  await (await response).finished();
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.unroute(`**/api/friends/${friend.id}`);
  assert.equal(await page.locator('#hdrTitle').innerText(), 'Account');
  assert.equal(await page.locator('.account-profile').count(), 1);

  await page.locator('.toast__close').evaluateAll(buttons => buttons.forEach(button => button.click()));
  await page.waitForFunction(() => !document.querySelector('.toast'));
  for (const [width, height] of [[320, 568], [360, 640], [390, 844], [430, 932]]) {
    await page.setViewportSize({ width, height });
    for (const route of ['/review', `/friend/${friend.id}/entry/${entry.id}`, `/friend/${friend.id}/settle/${entry.id}`, `/friend/${friend.id}/story`]) {
      await page.goto(base + '/#' + route);
      await page.locator('[data-product-ready]').waitFor();
      await page.evaluate(async () => (await import('/js/core/store.js')).applyTheme('light'));
      await viewportFits({ content: route.includes('/settle/') });
      await readable();
      if (route.includes('/entry/')) { await textContrast('.entry-folio__note', '.entry-folio'); await textContrast('.entry-facts dd', '#app'); }
      if (route === '/review') await controlsStayPut('.review-journal', ['#hdr', '.review-search-tools', '#tabbar']);
      if (route.endsWith('/story') && height <= 640) await controlsStayPut('.story-timeline', ['#hdr', '.story-tools', '[data-add-moment]', '#tabbar']);
      await screenshot(`viewport-${width}x${height}-${route.split('/').at(-2) === 'settle' ? 'payment' : route === '/review' ? 'review' : route.endsWith('/story') ? 'story' : 'entry'}`);
      await page.evaluate(async () => (await import('/js/core/store.js')).applyTheme('dark'));
      await viewportFits();
      await readable();
      await page.evaluate(async () => (await import('/js/core/store.js')).applyTheme('sage'));
      await readable();
      if (route.includes('/entry/')) { await textContrast('.entry-folio__note', '.entry-folio'); await textContrast('.entry-facts dd', '#app'); }
    }
  }
  await screenshot('story-dark');
  await page.goto(base + `/#/friend/${friend.id}/entry/${entry.id}`);
  await page.locator('[data-product-ready]').waitFor();
  await page.setViewportSize({ width: 320, height: 568 });
  await viewportFits({ content: true });
  // Model a visual viewport shrinking while the layout viewport stays tall (iOS keyboard).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, 'height', { configurable: true, value: 380 });
    visualViewport.dispatchEvent(new Event('resize'));
  });
  await viewportFits();
  assert.ok(await page.locator('.product-foot').evaluate(footer => footer.getBoundingClientRect().bottom <= 381), 'the primary action follows the visible viewport, not only the layout viewport');
  await page.evaluate(() => {
    delete visualViewport.height;
    visualViewport.dispatchEvent(new Event('resize'));
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole('button', { name: 'Record payment', exact: true }).click();
  await page.locator('#payment-amount').waitFor();
  await viewportFits({ content: true });
  await page.locator('#payment-amount').fill('10');
  await page.getByRole('button', { name: 'Review payment', exact: true }).click();
  await viewportFits({ content: true });
  await screenshot('short-confirmation');
  await page.getByRole('button', { name: 'Confirm record', exact: true }).click();
  await page.getByRole('heading', { name: 'Payment recorded' }).waitFor();
  await viewportFits({ content: true });
  await screenshot('short-recorded');
  await page.getByRole('button', { name: 'Undo this record' }).click();
  await page.getByRole('button', { name: 'Record payment', exact: true }).waitFor();
  await fits();
  // Long details remain reachable while the primary action stays pinned.
  await page.goto(base + `/#/friend/${friend.id}/entry/${receipt.id}`);
  await page.locator('.entry-receipts').waitFor();
  await viewportFits();
  await controlsStayPut('.product-body', ['#hdr', '.product-foot']);
  await screenshot('short-receipts');
  // A reduced content viewport must keep the action visible and allow inner scrolling.
  await page.goto(base + `/#/friend/${friend.id}/settle/${entry.id}`);
  await page.locator('#payment-amount').waitFor();
  await page.setViewportSize({ width: 390, height: 380 });
  await viewportFits();
  await controlsStayPut('.product-body', ['#hdr', '.product-foot']);
  await page.setViewportSize({ width: 320, height: 568 });
  await viewportFits({ content: true });
  // Plus shares the detail frame: one purchase action, with its cost always visible.
  for (const [width, height] of [[320, 568], [360, 640], [375, 701], [390, 844], [430, 932]]) {
    await page.setViewportSize({ width, height });
    await page.goto(base + '/#/plus');
    await page.locator('.plus-page').waitFor();
    await page.evaluate(async () => (await import('/js/core/store.js')).applyTheme('light'));
    await viewportFits({ content: true });
    for (const theme of ['dark', 'sage', 'light']) {
      await page.evaluate(async theme => (await import('/js/core/store.js')).applyTheme(theme), theme);
      await readable();
    }
    assert.equal(await page.locator('.plus-unlock').count(), 3);
    assert.equal(await page.locator('.plus-hero').evaluate(hero => {
      const bounds = hero.getBoundingClientRect();
      return [...hero.querySelectorAll('.plus-art > g')].every(part => {
        const box = part.getBoundingClientRect();
        return box.top >= bounds.top && box.bottom <= bounds.bottom && box.left >= bounds.left && box.right <= bounds.right;
      });
    }), true, 'the Plus illustration stays complete at compact/tall layout boundaries');
    assert.equal(await page.locator('.product-foot [data-act]').count(), 1, 'Plus has one purchase action');
    assert.equal(await page.locator('#tabbar').isVisible(), false, 'Plus is a focused flow with a clear Back action');
    assert.equal(await page.locator('.plus-price-block').evaluate(price => {
      const box = price.getBoundingClientRect();
      return price.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    }), true, 'notifications cannot cover the Plus price');
    await page.locator('.toast__close').evaluateAll(buttons => buttons.forEach(button => button.click()));
    await page.waitForFunction(() => !document.querySelector('.toast'));
    await screenshot(`plus-${width}x${height}`);
  }
  // Illustration motion finishes once and never shifts the purchase action.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload();
  await page.locator('.plus-art__book').waitFor();
  const actionBefore = await page.locator('.plus-cta').boundingBox();
  const arrivals = await page.locator('.plus-art').evaluate(async art => {
    const animations = art.getAnimations({ subtree: true });
    const timings = animations.map(animation => animation.effect.getTiming());
    await Promise.all(animations.map(animation => animation.finished));
    return timings;
  });
  assert.ok(arrivals.length > 0 && arrivals.every(timing => timing.iterations === 1 && timing.duration <= 1000), 'Plus artwork has one brief arrival, never a looping distraction');
  assert.deepEqual(await page.locator('.plus-cta').boundingBox(), actionBefore, 'artwork cannot move the purchase action');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.plus-art__book').evaluate(book => getComputedStyle(book).animationName), 'none', 'reduced motion skips the artwork arrival');
  await db.prepare("UPDATE users SET plan = 'plus' WHERE id = ?").run(signup.user.id);
  await page.reload();
  await page.locator('.plus-settled').waitFor();
  await page.setViewportSize({ width: 320, height: 568 });
  await viewportFits({ content: true });
  assert.equal(await page.locator('[data-act="buy"]').count(), 0, 'paid accounts are not offered another purchase');
  await screenshot('plus-active-short');
  await page.locator('#hdrBack').click();
  await page.locator('.account-profile').waitFor();
  assert.equal(await page.locator('#main').evaluate(main => main.classList.contains('main--product')), false, 'normal screens recover their existing scroll behavior');
  assert.deepEqual(errors, [], 'new mobile journeys have no browser exceptions');
  console.log('Mobile journeys, pinned controls, inner scrolling, 320×568 through 430×932 viewports, viewport shrink/restore, and Plus purchase/active states passed.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await db.close();
  await fs.rm(directory, { recursive: true, force: true });
}
