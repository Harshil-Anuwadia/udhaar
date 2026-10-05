import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium } from 'playwright-core';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';

const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
if (process.env.UI_SHOTS) mkdirSync(process.env.UI_SHOTS, { recursive:true });
const digest = value => createHash('sha256').update(value).digest('hex');
let browser;
before(async () => { browser = await chromium.launch({ args: ['--no-sandbox'] }); });
after(async () => { await browser?.close(); });

async function fixture(script) {
  const page = await browser.newPage({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await page.route('**/__feedback-test', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles/tokens.css"><link rel="stylesheet" href="/styles/app.css"></head><body><button id="trigger">Open</button><script type="module">${script}</script></body></html>` }));
  await page.goto(`${base}/__feedback-test`);
  return page;
}

test('actionable notifications stay while focused, resume afterwards, and offer a full touch target', async () => {
  const page = await fixture(`import { toast } from '/js/ui/toast.js'; document.querySelector('#trigger').onclick = () => toast('Your update is ready. Reload when you’re finished.', { action:'Reload', duration:1000 });`);
  try {
    await page.clock.install();
    await page.locator('#trigger').click();
    await page.locator('.toast__act').focus();
    await page.clock.runFor(1400);
    assert.equal(await page.locator('.toast:not(.is-out)').count(), 1, 'focused action must not disappear');
    const close = await page.locator('.toast__close').boundingBox();
    assert.ok(close.width >= 44 && close.height >= 44, 'dismiss target is at least 44px');
    await page.locator('#trigger').focus();
    await page.clock.runFor(1500);
    assert.equal(await page.locator('.toast').count(), 0, 'timer resumes after focus leaves');
  } finally { await page.close(); }
});

test('sharing preview returns to its original private image after revealing then hiding names', async () => {
  const page = await fixture(`import { openCardSheet } from '/js/views/you.js'; document.querySelector('#trigger').onclick = () => openCardSheet({ currency:'INR', net:1250, activeFriends:1, openEntries:1, top:[{name:'Sam',net:1250}] });`);
  try {
    await page.locator('#trigger').click();
    const canvas = page.locator('.sheet canvas');
    await canvas.waitFor();
    const hidden = digest(await canvas.evaluate(el => el.toDataURL()));
    await page.locator('.snapshot-privacy').click();
    assert.notEqual(digest(await canvas.evaluate(el => el.toDataURL())), hidden);
    await page.locator('.snapshot-privacy').click();
    assert.equal(digest(await canvas.evaluate(el => el.toDataURL())), hidden, 'the visible preview must match the privacy switch');
    if (process.env.UI_SHOTS) await page.screenshot({ path: `${process.env.UI_SHOTS}/snapshot.png` });
  } finally { await page.close(); }
});

test('cancelled native sharing restores controls without a false success', async () => {
  const page = await fixture(`import { openCardSheet } from '/js/views/you.js'; Object.defineProperty(navigator, 'canShare', { value:() => true }); Object.defineProperty(navigator, 'share', { value:async () => { throw new DOMException('Cancelled','AbortError'); } }); document.querySelector('#trigger').onclick = () => openCardSheet({ currency:'INR', net:1250, activeFriends:1, openEntries:1, top:[{name:'Sam',net:1250}] });`);
  try {
    await page.locator('#trigger').click();
    await page.getByRole('button', { name:'Share snapshot' }).click();
    await page.getByRole('button', { name:'Share snapshot' }).waitFor();
    assert.equal(await page.getByRole('button', { name:'Share snapshot' }).isEnabled(), true);
    assert.equal(await page.locator('.snapshot-privacy').isEnabled(), true);
    assert.equal(await page.getByRole('dialog').count(), 1);
    assert.equal(await page.locator('.toast--ok').count(), 0);
  } finally { await page.close(); }
});

test('alerts show only genuine unfinished reviews, distinct from informational updates at narrow widths', async () => {
  const { context, page, headers } = await account();
  try {
    const now = Date.now();
    const incoming = { id:'review', createdAt:now, status:'open', kind:'money', direction:'owed_by_me', amount:420, note:'Dinner after the movie', friend:{ id:'example', name:'Sam with a beautifully long name', avatarSeed:2 } };
    await page.route('**/api/entries/incoming/all', route => route.fulfill({ json:{ entries:[incoming, {...incoming,id:'confirmed',confirmedAt:now}, {...incoming,id:'settled',status:'settled'}] } }));
    await page.route('**/api/me/events', route => route.fulfill({ json:{ unread:0, events:[{id:'event',type:'friend_joined',body:'Sam joined your shared ledger. You can both see new entries now.',createdAt:now,read:false}] } }));
    for (const theme of ['light','dark']) {
      await context.request.patch(`${base}/api/me/profile`, { headers, data:{theme} });
      for (const width of [320,390,1280]) {
        await page.setViewportSize({width,height:width === 320 ? 568 : 844});
        await page.goto(`${base}/#/activity`);
        await page.reload();
        await page.getByRole('heading', {name:'Ready to review'}).waitFor();
        assert.equal(await page.locator('[data-incoming]').count(), 1);
        assert.equal(await page.locator('button[data-ev]').count(), 0, 'non-navigable information is not a dead button');
        const avatar = await page.locator('.alert-row__avatar .avatar').boundingBox();
        assert.equal(avatar.width, avatar.height);
        assert.equal(await page.evaluate(() => document.querySelector('#main').scrollWidth <= document.querySelector('#main').clientWidth), true);
        if (process.env.UI_SHOTS) await page.screenshot({path:`${process.env.UI_SHOTS}/alerts-${theme}-${width}.png`});
      }
    }
  } finally { await context.close(); }
});

async function account() {
  const context = await browser.newContext({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const response = await context.request.post(`${base}/api/auth/signup`, { data: { name: 'Feedback test', secret: 'testpass123', currency: 'INR' } });
  const { token, user } = await response.json();
  const headers = { Authorization: `Bearer ${token}` };
  await context.request.post(`${base}/api/me/onboarded`, { headers, data: {} });
  const page = await context.newPage();
  await page.goto(base);
  await page.locator('#li-id').fill(user.handle);
  await page.locator('#li-pass').fill('testpass123');
  await page.locator('[data-act="login"]').click();
  await page.locator('.netcard').waitFor();
  return { context, page, headers };
}

test('a person ledger has one integrated entry action for each balance direction', async () => {
  const { context, page, headers } = await account();
  try {
    const { friend } = await (await context.request.post(`${base}/api/friends`, { headers, data: { name: 'Sam' } })).json();
    for (const direction of [null, 'owed_by_me', 'owed_to_me']) {
      if (direction) await context.request.post(`${base}/api/entries`, { headers, data: { friendshipId: friend.id, kind:'money', direction, amount: direction === 'owed_by_me' ? 250 : 1000, note:'Dinner together' } });
      await page.goto(`${base}/#/friend/${friend.id}`);
      await page.reload();
      await page.locator('.balance-hero').waitFor();
      assert.equal(await page.locator('#main [data-act="log"]').count(), 1, `${direction}: one entry action`);
      assert.equal(await page.locator('.hero-actions [data-act="log"]').count(), 1);
      assert.equal(await page.locator('#main [data-act="moment"]').count(), 1, 'one moment action');
    }
    if (process.env.UI_SHOTS) await page.screenshot({ path: `${process.env.UI_SHOTS}/friend.png` });
  } finally { await context.close(); }
});

test('alerts distinguish a failed fetch from an empty inbox and provide retry', async () => {
  const { context, page } = await account();
  try {
    await page.route('**/api/me/events', route => route.fulfill({ status:503, contentType:'application/json', body:JSON.stringify({ error:'Unavailable' }) }));
    await page.locator('[data-tab="alerts"]').click();
    await page.getByRole('button', { name:'Try again', exact:true }).waitFor({ timeout:5000 });
    assert.equal(await page.getByText('Nothing new yet', { exact:true }).count(), 0);
    await page.unroute('**/api/me/events');
    await page.getByRole('button', { name:'Try again', exact:true }).click();
    await page.getByRole('heading', { name:'You’re up to date' }).waitFor();
    assert.equal(await page.getByRole('button', { name:'Try again', exact:true }).count(), 0);
  } finally { await context.close(); }
});
