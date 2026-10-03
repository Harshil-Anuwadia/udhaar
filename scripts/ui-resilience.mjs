import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAHElEQVR4nGP8z8Dwn4EIwESMwKgIUQ6MwKgIDlEuAObHCRLhI3oVAAAAAElFTkSuQmCC',
  'base64',
);
const SHOTS = process.env.UI_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const context = await browser.newContext({
  viewport: { width: 320, height: 568 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const browserErrors = [];
page.on('pageerror', (error) => browserErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') browserErrors.push(message.text());
});

const assertNoHorizontalOverflow = async (label) => {
  const size = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.scrollingElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(size.document <= size.viewport + 1 && size.body <= size.viewport + 1, `${label} must not overflow horizontally: ${JSON.stringify(size)}`);
};

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    localStorage.clear();
    for (const registration of await navigator.serviceWorker?.getRegistrations?.() || []) await registration.unregister();
  });
  await page.reload({ waitUntil: 'networkidle' });

  await page.getByRole('button', { name: 'Start your ledger' }).click();
  await page.locator('#su-name').fill(`Narrow ${Date.now()}`);
  await page.locator('[data-next]').click();
  await page.locator('#su-pass').fill('246810');
  await page.locator('[data-go]').click();
  await page.waitForSelector('#curGrid', { timeout: 20_000 });
  if (SHOTS) {
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${SHOTS}/setup-currency.png`, fullPage: true });
  }
  await page.locator('[data-act="next"]').click();
  await page.waitForSelector('#ob-name');
  assert.equal(await page.evaluate(() => scrollY), 0, 'each setup step opens at its heading, not at the previous scroll offset');
  if (SHOTS) {
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${SHOTS}/setup-person.png`, fullPage: true });
  }
  await page.locator('#ob-name').fill('A person with a spectacularly long full name');
  await page.getByRole('button', { name: 'Add them' }).click();
  await page.getByRole('button', { name: 'I’ll log it later' }).click();
  await page.waitForSelector('.netcard', { timeout: 20_000 });

  await page.locator('#tabAdd').click();
  await page.waitForSelector('.who-grid');
  await assertNoHorizontalOverflow('person picker');
  await page.locator('.who:not(.who--new)').first().click();
  await page.waitForSelector('#compose-amount');
  assert.equal(await page.getByRole('textbox', { name: 'What was it for? (optional)' }).count(), 1, 'the optional note has a persistent visible label');
  await page.getByRole('button', { name: 'Favour' }).click();
  assert.equal(await page.getByRole('textbox', { name: 'What’s the favour?' }).count(), 1, 'the favour input is explicitly labelled');
  await page.getByRole('button', { name: 'Money' }).click();
  await page.waitForSelector('#compose-amount');
  assert.equal(await page.locator('.keypad, .keypad2').count(), 0, 'recording a line uses the device keyboard');
  assert.equal(await page.locator('#compose-amount').getAttribute('inputmode'), 'numeric');
  await page.locator('#compose-amount').fill('abc001');
  assert.equal(await page.locator('#compose-amount').inputValue(), '1', 'amount input accepts digits only');

  const compose = await page.evaluate(() => {
    const stage = document.querySelector('.cstep');
    const footerButton = document.querySelector('.compose__foot .btn');
    const who = document.querySelector('.compose__who');
    const amount = document.querySelector('.amount-entry--hero').getBoundingClientRect();
    const quick = document.querySelector('.quickrow').getBoundingClientRect();
    const footerRect = footerButton.getBoundingClientRect();
    return {
      overflowY: getComputedStyle(stage).overflowY,
      scrollHeight: stage.scrollHeight,
      clientHeight: stage.clientHeight,
      footerFits: footerButton.scrollWidth <= footerButton.clientWidth,
      whoFits: who.scrollWidth <= who.clientWidth,
      amountClearsQuickRow: amount.bottom <= quick.top + 1,
      footerFullyVisible: footerRect.top >= -1 && footerRect.bottom <= innerHeight + 1,
    };
  });
  assert.equal(compose.overflowY, 'auto', 'compose content should scroll on short screens');
  assert.ok(compose.scrollHeight >= compose.clientHeight, 'compose keeps a usable scroll region');
  assert.equal(compose.footerFits, true, 'long names must not overflow the submit button');
  assert.equal(compose.whoFits, true, 'long names must not overflow the selected-person row');
  assert.equal(compose.amountClearsQuickRow, true, 'the amount display must not overlap quick amounts');
  assert.equal(compose.footerFullyVisible, true, 'the submit action must remain fully visible');
  await assertNoHorizontalOverflow('entry compose');
  if (SHOTS) {
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${SHOTS}/compose-narrow.png` });
  }
  const bottomReachable = await page.locator('.cstep').evaluate((stage) => {
    stage.scrollTop = stage.scrollHeight;
    const last = stage.lastElementChild;
    const stageRect = stage.getBoundingClientRect();
    const lastRect = last.getBoundingClientRect();
    return lastRect.top >= stageRect.top - 1 && lastRect.bottom <= stageRect.bottom + 1;
  });
  assert.equal(bottomReachable, true, 'the final compose controls remain reachable by scrolling');

  await page.getByRole('button', { name: 'receipt' }).click();
  assert.equal(await page.locator('.sheet__body > :first-child .field__label').first().innerText(), 'Receipt (optional)', 'the receipt action opens directly to its photo control');
  const receiptPicker = '.sheet input[type="file"]';
  await page.waitForSelector(receiptPicker, { state: 'attached' });
  const receiptInput = await page.locator(receiptPicker).evaluate((input) => ({
    display: getComputedStyle(input).display,
    hasLabel: !!document.querySelector(`label[for="${input.id}"]`),
    capture: input.getAttribute('capture'),
  }));
  assert.notEqual(receiptInput.display, 'none', 'receipt picker must remain available to mobile browsers');
  assert.equal(receiptInput.hasLabel, true, 'receipt picker needs a native label trigger');
  assert.equal(receiptInput.capture, null, 'receipt picker must allow gallery and file selection');
  await page.setInputFiles(receiptPicker, { name: 'receipt.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForSelector('.entry__photo--lg img');
  await page.locator('.sheet.is-open .sheet__foot .btn').click();
  await page.locator('.compose__foot .btn').click();
  await page.waitForSelector('.sheet--saved .saved-moment__line', { timeout: 20_000 });
  await page.getByRole('button', { name: 'Back to ledger' }).click();
  await page.waitForSelector('.tabbar:not(.hide)');

  const storedReceipt = await page.evaluate(async () => {
    const token = localStorage.getItem('udhaar.at');
    const response = await fetch('/api/entries?status=all', { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    const url = data.entries?.find((entry) => entry.photo)?.photo;
    if (!url) return { url: null, status: null };
    const image = await fetch(url);
    return { url, status: image.status, type: image.headers.get('content-type') };
  });
  assert.ok(storedReceipt.url, 'saved entries retain their receipt URL');
  assert.equal(storedReceipt.status, 200, 'saved receipts are served from the configured data directory');
  assert.match(storedReceipt.type || '', /^image\//, 'saved receipt is served as an image');

  await page.locator('[data-tab="you"]').click();
  await page.waitForSelector('.account-profile');
  await assertNoHorizontalOverflow('settings');
  const avatarInput = page.locator('[data-avatar-input]');
  const avatarPicker = await avatarInput.evaluate((input) => ({
    display: getComputedStyle(input).display,
    hasLabel: !!document.querySelector(`label[for="${input.id}"]`),
  }));
  assert.notEqual(avatarPicker.display, 'none', 'avatar picker must remain available to mobile browsers');
  assert.equal(avatarPicker.hasLabel, true, 'avatar picker needs a native label trigger');
  await avatarInput.setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForSelector('.avatarbtn img', { timeout: 20_000 });
  const avatar = await page.locator('.avatarbtn img').evaluate((image) => ({
    loaded: image.complete && image.naturalWidth > 0,
    width: image.getBoundingClientRect().width,
    height: image.getBoundingClientRect().height,
    fit: getComputedStyle(image).objectFit,
  }));
  assert.equal(avatar.loaded, true, 'the uploaded avatar should render immediately');
  assert.ok(Math.abs(avatar.width - avatar.height) < 0.1, 'the uploaded avatar remains square');
  assert.equal(avatar.fit, 'cover', 'the uploaded avatar preserves its aspect ratio');

  const settingsRows = await page.locator('.setrow').evaluateAll((rows) => rows.map((row) => {
    const rect = row.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width, scrollWidth: row.scrollWidth, viewport: innerWidth };
  }));
  for (const row of settingsRows) {
    assert.ok(row.left >= -1 && row.right <= row.viewport + 1, `settings row stays within the viewport: ${JSON.stringify(row)}`);
    assert.ok(row.scrollWidth <= row.width + 1, `settings row content must not overflow: ${JSON.stringify(row)}`);
  }
  await page.locator('[data-act="theme"]').click();
  await page.getByRole('button', { name: /Ink \(dark\)/ }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.locator('[data-act="theme"]').waitFor({ state: 'visible' });
  assert.ok(await page.locator('[data-act="theme"]').isVisible(), 'appearance remains directly accessible after switching theme');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/settings-narrow.png` });

  for (const theme of ['light', 'dark']) {
    for (const route of ['/', '/activity', '/groups', '/you', '/plus']) {
      await page.goto(`${BASE}/#${route}`, { waitUntil: 'networkidle' });
      await page.evaluate((nextTheme) => {
        document.documentElement.dataset.theme = nextTheme;
        document.documentElement.dataset.effective = nextTheme;
      }, theme);
      await page.waitForTimeout(250);
      await assertNoHorizontalOverflow(`${theme} ${route}`);
      if (SHOTS && theme === 'dark' && route === '/you') {
        await page.screenshot({ path: `${SHOTS}/settings-dark.png` });
      }
    }
  }

  await page.goto(`${BASE}/#/groups`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-act="newgroup"]');
  await page.locator('[data-act="newgroup"]').click();
  await page.locator('#g-name').fill('Keyboard split');
  await page.locator('[data-pick]').first().click();
  await page.getByRole('button', { name: /Create group/ }).last().click();
  await page.waitForSelector('[data-act="split"]');
  await page.locator('[data-act="split"]').first().click();
  await page.waitForSelector('#sp-amount');
  const payerLayout = await page.locator('.sheet .chiprow').first().evaluate((row) => {
    const body = row.closest('.sheet__body').getBoundingClientRect();
    return {
      rowFits: row.scrollWidth <= row.clientWidth + 1,
      optionsFit: [...row.querySelectorAll('.chip')].every((chip) => chip.getBoundingClientRect().right <= body.right + 1),
    };
  });
  assert.deepEqual(payerLayout, { rowFits: true, optionsFit: true }, 'payer choices wrap inside the bill sheet instead of being clipped');
  assert.equal(await page.locator('.sheet .keypad, .sheet .keypad2').count(), 0, 'group bills use the device keyboard');
  assert.equal(await page.locator('#sp-amount').getAttribute('inputmode'), 'numeric');
  await page.locator('#sp-title').fill('Dinner');
  await page.locator('#sp-amount').fill('12x0');
  assert.equal(await page.locator('#sp-amount').inputValue(), '120');
  if (SHOTS) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/group-bill-narrow.png` });
  }
  await page.locator('.sheet.is-open .sheet__foot .btn').click();
  await page.waitForSelector('[data-split]', { timeout: 20_000 });

  assert.deepEqual(browserErrors, [], `browser errors: ${browserErrors.join('\n')}`);
  console.log('UI resilience checks passed');
} finally {
  await browser.close();
}
