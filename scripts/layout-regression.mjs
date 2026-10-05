import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

const context = await browser.newContext({ isMobile: true, hasTouch: true,
  viewport: { width: 390, height: 560 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    localStorage.clear();
    for (const registration of await navigator.serviceWorker?.getRegistrations?.() || []) {
      await registration.unregister();
    }
  });
  await page.reload({ waitUntil: 'networkidle' });

  const landing = await page.evaluate(() => ({
    bodyOverflowY: getComputedStyle(document.body).overflowY,
    pageScrollHeight: document.scrollingElement.scrollHeight,
    pageScrollWidth: document.scrollingElement.scrollWidth,
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
    headline: document.querySelector('#landing-title')?.textContent,
    visualHeight: document.querySelector('.landing__visual')?.getBoundingClientRect().height,
  }));
  assert.notEqual(landing.bodyOverflowY, 'hidden', 'bare pages must not lock document scrolling');
  assert.ok(landing.pageScrollHeight >= landing.viewportHeight, 'the landing canvas fits or grows naturally');
  assert.equal(landing.pageScrollWidth, landing.viewportWidth, 'responsive pages must not create horizontal overflow');
  assert.match(landing.headline, /Welcome back/, 'mobile opens as a login screen');
  assert.equal(landing.visualHeight, 0, 'decorative desktop artwork does not displace the mobile form');
  await page.getByRole('button', { name: 'Create an account' }).click();
  assert.equal((await page.locator('[data-back]').textContent()).trim(), 'Back', 'auth back stays a clean text control');
  await page.locator('#su-name').fill(`Layout ${Date.now()}`);
  await page.locator('[data-next]').click();
  await page.locator('#su-pass').fill('246810');
  await page.locator('[data-go]').click();
  await page.waitForSelector('#paletteGrid', { timeout: 20_000 });
  assert.equal(await page.locator('[data-palette]').count(), 3, 'setup offers three deliberate palettes');
  assert.equal(await page.locator('[data-palette="system"]').count(), 0, 'setup does not inherit the device palette');
  await page.locator('[data-palette="sage"]').click();
  assert.equal(await page.locator('[data-palette="sage"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-act="palette-next"]').click();
  await page.waitForSelector('#curGrid', { timeout: 20_000 });
  const currencyLayout = await page.locator('.onboard').evaluate((screen) => {
    const grid = screen.querySelector('.currency-grid').getBoundingClientRect();
    const action = screen.querySelector('.onboard__actions').getBoundingClientRect();
    return { gridBottom: grid.bottom, actionTop: action.top, actionBottom: action.bottom, viewportHeight: innerHeight };
  });
  assert.ok(currencyLayout.gridBottom <= currencyLayout.actionTop, `currency choices must not run under Continue: ${JSON.stringify(currencyLayout)}`);
  assert.ok(currencyLayout.actionBottom <= currencyLayout.viewportHeight + 1, `Continue must be visible on a short phone: ${JSON.stringify(currencyLayout)}`);
  await page.locator('[data-cur="USD"]').click();
  await page.locator('[data-act="next"]').click();
  await page.waitForSelector('#ob-sugg');
  assert.equal(await page.locator('#ob-sugg .pick').count(), 3, 'person setup offers three person suggestions, not a group');
  assert.equal(await page.locator('#ob-sugg').getByText('The group trip').count(), 0);
  const personLayout = await page.locator('.onboard').evaluate((screen) => ({
    suggestionsBottom: screen.querySelector('#ob-sugg').getBoundingClientRect().bottom,
    actionTop: screen.querySelector('.onboard__actions').getBoundingClientRect().top,
    actionBottom: screen.querySelector('.onboard__actions').getBoundingClientRect().bottom,
    viewportHeight: innerHeight,
  }));
  assert.ok(personLayout.suggestionsBottom <= personLayout.actionTop, `person suggestions must not run under actions: ${JSON.stringify(personLayout)}`);
  assert.ok(personLayout.actionBottom <= personLayout.viewportHeight + 1, `person actions must be visible on a short phone: ${JSON.stringify(personLayout)}`);

  const suggestions = await page.locator('#ob-sugg .pick').evaluateAll((rows) => rows.map((row) => {
    const rect = row.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: rect.height, flexShrink: getComputedStyle(row).flexShrink };
  }));
  for (let index = 0; index < suggestions.length; index += 1) {
    assert.ok(suggestions[index].height >= 60, 'setup suggestion rows retain a usable touch target');
    assert.equal(suggestions[index].flexShrink, '0', 'setup suggestion rows never compress');
    if (index > 0) {
      assert.ok(suggestions[index].top >= suggestions[index - 1].bottom, 'setup suggestion rows never overlap');
    }
  }

  await page.locator('#ob-name').fill('A person with an intentionally long name');
  await page.getByRole('button', { name: 'Add them' }).click();
  await page.waitForSelector('[data-act="skip"]');
  const firstLineLayout = await page.locator('.onboard').evaluate((screen) => ({
    choicesBottom: screen.querySelector('#ob-quick').getBoundingClientRect().bottom,
    actionTop: screen.querySelector('.onboard__actions').getBoundingClientRect().top,
    actionBottom: screen.querySelector('.onboard__actions').getBoundingClientRect().bottom,
    viewportHeight: innerHeight,
  }));
  assert.ok(firstLineLayout.choicesBottom <= firstLineLayout.actionTop, `first-line choices must not run under actions: ${JSON.stringify(firstLineLayout)}`);
  assert.ok(firstLineLayout.actionBottom <= firstLineLayout.viewportHeight + 1, `first-line actions must be visible on a short phone: ${JSON.stringify(firstLineLayout)}`);
  await page.getByRole('button', { name: 'I’ll log it later' }).click();
  await page.waitForSelector('.netcard', { timeout: 20_000 });
  const primaryNav = await page.locator('#tabbar').evaluate((nav) => {
    const action = nav.querySelector('#tabAdd').getBoundingClientRect();
    const active = nav.querySelector('[aria-current="page"]');
    return {
      actionWidth: action.width, actionHeight: action.height,
      labels: [...nav.querySelectorAll('[data-tab] .tab__label')].map((item) => item.textContent.trim()),
      activeBackground: active ? getComputedStyle(active).backgroundColor : null,
    };
  });
  assert.ok(primaryNav.actionWidth >= 48 && primaryNav.actionHeight >= 48, 'primary add action keeps a 48px touch target');
  assert.deepEqual(primaryNav.labels, ['People', 'Groups', 'Alerts', 'You'], 'navigation labels match user destinations');
  assert.notEqual(primaryNav.activeBackground, 'rgba(0, 0, 0, 0)', 'the active destination is visibly distinguished');
  await page.locator('#tabAdd').click();
  await page.waitForSelector('.who-grid');

  const people = await page.locator('.who:not(.who--new)').evaluateAll((tiles) => tiles.map((tile) => {
    const avatar = tile.querySelector('.avatar');
    const avatarStyle = getComputedStyle(avatar);
    const rect = avatar.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      flexShrink: avatarStyle.flexShrink,
      aspectRatio: avatarStyle.aspectRatio,
      nameOverflowsTile: tile.scrollWidth > tile.clientWidth,
    };
  }));
  assert.ok(people.length > 0, 'the completed setup should provide a person to select');
  for (const person of people) {
    assert.ok(Math.abs(person.width - 52) < 0.1, 'person-selection avatars retain their intended width');
    assert.ok(Math.abs(person.height - 52) < 0.1, 'person-selection avatars retain their intended height');
    assert.equal(person.flexShrink, '0', 'person-selection avatars never shrink');
    assert.ok(person.aspectRatio === '1 / 1' || person.width === person.height, 'avatars stay square');
    assert.equal(person.nameOverflowsTile, false, 'long person content cannot widen the selection tile');
  }

  const selection = await page.locator('.cstep').evaluate((el) => ({
    overflowY: getComputedStyle(el).overflowY,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  assert.equal(selection.overflowY, 'auto', 'the person list owns vertical overflow');
  assert.ok(selection.scrollHeight >= selection.clientHeight, 'the person list remains a stable scroll region');

  await page.locator('.compose__top .iconbtn').click();
  await page.waitForSelector('.tabbar:not(.hide)');
  await page.locator('[data-tab="groups"]').click();
  await page.waitForSelector('[data-act="newgroup"]');
  await page.locator('[data-act="newgroup"]').click();
  await page.waitForSelector('.sheet.is-open');
  await page.waitForTimeout(400);

  const modal = await page.locator('.sheet.is-open').evaluate((sheet) => {
    const body = sheet.querySelector('.sheet__body');
    const avatar = sheet.querySelector('.avatar');
    const sheetRect = sheet.getBoundingClientRect();
    const avatarRect = avatar?.getBoundingClientRect();
    return {
      top: sheetRect.top,
      bottom: sheetRect.bottom,
      viewportHeight: innerHeight,
      scrollY,
      position: getComputedStyle(sheet).position,
      bodyOverflowY: getComputedStyle(body).overflowY,
      bodyMinHeight: getComputedStyle(body).minHeight,
      avatarWidth: avatarRect?.width,
      avatarHeight: avatarRect?.height,
      avatarFlexShrink: avatar ? getComputedStyle(avatar).flexShrink : null,
    };
  });
  assert.ok(modal.top >= 0 && modal.bottom <= modal.viewportHeight + 1, `person-selection modals stay inside the viewport: ${JSON.stringify(modal)}`);
  assert.equal(modal.bodyOverflowY, 'auto', 'modal content scrolls instead of compressing its rows');
  assert.equal(modal.bodyMinHeight, '0px', 'modal flex content is allowed to become a scroll region');
  assert.equal(modal.avatarWidth, modal.avatarHeight, 'modal avatars retain a square aspect ratio');
  assert.equal(modal.avatarFlexShrink, '0', 'modal avatars cannot collapse beside long names');

  const narrowContext = await browser.newContext({ isMobile: true, hasTouch: true,
    viewport: { width: 320, height: 568 },
    isMobile: true,
    hasTouch: true,
  });
  const narrowPage = await narrowContext.newPage();
  await narrowPage.goto(BASE, { waitUntil: 'networkidle' });
  const narrowLanding = await narrowPage.evaluate(() => ({
    scrollWidth: document.scrollingElement.scrollWidth,
    viewportWidth: innerWidth,
    overflowY: getComputedStyle(document.body).overflowY,
  }));
  assert.equal(narrowLanding.scrollWidth, narrowLanding.viewportWidth, 'narrow phones do not get horizontal overflow');
  assert.notEqual(narrowLanding.overflowY, 'hidden', 'narrow phones keep natural page scrolling');
  await narrowPage.waitForSelector('#li-id');
  assert.equal(await narrowPage.locator('#li-pass').isVisible(), true, 'narrow phones open directly to both login fields');
  await narrowPage.getByRole('button', { name: 'Create an account' }).click();
  assert.equal(await narrowPage.locator('[data-back]').textContent(), 'Back', 'signup keeps the clean back treatment on narrow phones');
  await narrowContext.close();

  console.log('layout regression checks passed');
} finally {
  await browser.close();
}
