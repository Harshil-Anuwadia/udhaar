import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const setup = await browser.newContext({ isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const errors = [];

async function post(path, body, token) {
  const response = await setup.request.post(`${base}${path}`, {
    data: body,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await response.json();
  assert.ok(response.ok(), `${path}: ${JSON.stringify(data)}`);
  return data;
}

async function get(path, token) {
  const response = await setup.request.get(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json();
  assert.ok(response.ok(), `${path}: ${JSON.stringify(data)}`);
  return data;
}

async function newPage() {
  const context = await browser.newContext({ isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  return page;
}

try {
  const alice = await post('/api/auth/signup', {
    name: 'Alice', handle: `alice${Date.now()}`, secret: 'testpass123', currency: 'INR',
  });
  await post('/api/me/onboarded', {}, alice.token);

  const sana = await post('/api/friends', { name: 'Sana' }, alice.token);
  await post('/api/entries', {
    friendshipId: sana.friend.id, kind: 'money', direction: 'owed_to_me', amount: 125,
    note: 'Shared lunch before joining',
  }, alice.token);

  const newUser = await newPage();
  await newUser.goto(`${base}/#/join?token=${sana.inviteToken}`);
  await newUser.getByRole('button', { name: 'Join and see my side' }).click();
  await newUser.locator('#j-name').fill('Sana');
  await newUser.locator('#j-pass').fill('testpass123');
  await newUser.getByRole('button', { name: 'Join the ledger' }).click();
  await newUser.waitForURL(/#\/friend\//, { timeout: 20_000 });
  await newUser.getByText('Shared lunch before joining').first().waitFor();
  assert.ok((await newUser.locator('.balance-hero').innerText()).includes('125'), 'new invitee sees the shared amount');

  const existing = await post('/api/auth/signup', {
    name: 'Mira', handle: `mira${Date.now()}`, secret: 'testpass123', currency: 'INR',
  });
  await post('/api/me/onboarded', {}, existing.token);
  const olderAlice = await post('/api/friends', { name: 'Alice' }, existing.token);
  await post('/api/entries', {
    friendshipId: olderAlice.friend.id, kind: 'money', direction: 'owed_to_me', amount: 30,
    note: 'Mira already logged Alice',
  }, existing.token);
  const miraFriend = await post('/api/friends', { name: 'Mira' }, alice.token);
  await post('/api/entries', {
    friendshipId: miraFriend.friend.id, kind: 'money', direction: 'owed_to_me', amount: 80,
    note: 'Shared coffee before login',
  }, alice.token);

  const signedOut = await newPage();
  await signedOut.goto(`${base}/#/join?token=${miraFriend.inviteToken}`);
  await signedOut.getByRole('button', { name: 'Already have an account? Log in' }).click();
  await signedOut.locator('#li-id').fill(existing.user.handle);
  await signedOut.locator('#li-pass').fill('testpass123');
  await signedOut.getByRole('button', { name: 'Log in', exact: true }).click();
  await signedOut.waitForURL(/#\/join\?token=/, { timeout: 20_000 });
  await signedOut.locator('#existingFriend').selectOption(olderAlice.friend.id);
  await signedOut.getByRole('button', { name: 'Link my ledger' }).click();
  await signedOut.waitForURL(/#\/friend\//, { timeout: 20_000 });
  await signedOut.getByText('Shared coffee before login').first().waitFor();
  await signedOut.getByText('Mira already logged Alice').first().waitFor();
  assert.ok((await signedOut.locator('.balance-hero').innerText()).includes('50'), 'existing-account invitee sees both old ledgers combined');
  assert.ok(signedOut.url().includes(olderAlice.friend.id), 'the existing person page is reused');

  await post('/api/me/events/read', {}, alice.token);
  const alicePage = await newPage();
  await alicePage.goto(base);
  await alicePage.locator('#li-id').fill(alice.user.handle);
  await alicePage.locator('#li-pass').fill('testpass123');
  await alicePage.getByRole('button', { name: 'Log in', exact: true }).click();
  await alicePage.locator('.netcard').waitFor();
  await alicePage.goto(`${base}/#/friend/${miraFriend.friend.id}`);
  await alicePage.getByText('Shared coffee before login').first().waitFor();
  await alicePage.getByText('Mira already logged Alice').first().waitFor();
  await alicePage.waitForTimeout(500);

  const miraFriends = await get('/api/friends', existing.token);
  const miraSide = miraFriends.friends.find((friend) => friend.user_id === alice.user.id);
  await post('/api/entries', {
    friendshipId: miraSide.id, kind: 'money', direction: 'owed_to_me', amount: 40,
    note: 'Live reply from Mira',
  }, existing.token);
  await alicePage.getByText('Live reply from Mira').first().waitFor({ timeoutMs: 18_000 });

  await newUser.locator('[data-tab="you"]').click();
  await newUser.getByRole('button', { name: /Udhaar Plus/i }).click();
  await newUser.locator('.plan__price').first().waitFor();
  assert.equal(await newUser.locator('[data-plan="lifetime"]').count(), 1);
  assert.ok((await newUser.locator('.plan__price').innerText()).includes('49'), 'INR lifetime pricing is shown');
  assert.deepEqual(errors, [], 'shared-ledger journeys have no browser errors');
  console.log('New-user and existing-account invites share one live ledger; low Plus prices render.');
} finally {
  await browser.close();
}
