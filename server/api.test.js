import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jcVQAAAAASUVORK5CYII=';

test('signup, login, friend ledger, receipt, avatar, group, and settings work on a fresh database', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'udhaar-api-test-'));
  process.env.DATA_DIR = dataDir;
  process.env.TURSO_DATABASE_URL = `file:${path.join(dataDir, 'udhaar.db')}`;
  process.env.TURSO_AUTH_TOKEN = '';
  process.env.JWT_SECRET = 'test-secret-for-isolated-integration-test-only';

  const [{ default: app }, { db }] = await Promise.all([import('./index.js'), import('./db.js')]);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(method, route, body, token) {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
    return { response, data };
  }

  try {
    const signup = await request('POST', '/api/auth/signup', {
      name: 'Test User', handle: 'testuser', secret: 'testpass123', currency: 'INR',
    });
    assert.equal(signup.response.status, 201, JSON.stringify(signup.data));
    const token = signup.data.token;
    const setupCurrency = await request('PATCH', '/api/me/profile', { currency: 'USD' }, token);
    assert.equal(setupCurrency.response.status, 200, 'an empty setup ledger can choose its initial currency');
    assert.equal(setupCurrency.data.user.currency, 'USD');
    const resetSetupCurrency = await request('PATCH', '/api/me/profile', { currency: 'INR' }, token);
    assert.equal(resetSetupCurrency.response.status, 200);

    const login = await request('POST', '/api/auth/login', { id: 'testuser', secret: 'testpass123' });
    assert.equal(login.response.status, 200, JSON.stringify(login.data));
    assert.equal(login.data.user.handle, 'testuser');

    await db.prepare('INSERT INTO events (id, user_id, type, body, created_at) VALUES (?,?,?,?,?)')
      .run('ev_dismiss-test', signup.data.user.id, 'entry_new', 'A test update', Date.now());
    const dismissedEvent = await request('DELETE', '/api/me/events/ev_dismiss-test', undefined, token);
    assert.equal(dismissedEvent.response.status, 200, 'a user can dismiss an alert');
    const afterDismiss = await request('GET', '/api/me/events', undefined, token);
    assert.equal(afterDismiss.data.events.some((event) => event.id === 'ev_dismiss-test'), false);

    const friend = await request('POST', '/api/friends', { name: 'Sana' }, token);
    assert.equal(friend.response.status, 201, JSON.stringify(friend.data));
    const friendId = friend.data.friend.id;

    const moment = await request('POST', `/api/friends/${friendId}/moments`, {
      title: 'The café after the rain', note: 'We stayed until closing.', occurredOn: '2026-04-11', photos: [PNG, PNG],
    }, token);
    assert.equal(moment.response.status, 201, JSON.stringify(moment.data));
    assert.equal(moment.data.moment.title, 'The café after the rain');
    assert.match(moment.data.moment.photo, /^\/api\/media\//);
    assert.equal(moment.data.moment.photos.length, 2, 'a Moment keeps both selected photos');
    assert.notEqual(moment.data.moment.photos[0], moment.data.moment.photos[1]);
    const ownMoments = await request('GET', `/api/friends/${friendId}`, undefined, token);
    assert.equal(ownMoments.data.moments.length, 1);
    assert.equal(ownMoments.data.moments[0].occurredOn, '2026-04-11');
    assert.deepEqual(ownMoments.data.moments[0].photos, moment.data.moment.photos);
    const futureMoment = await request('POST', `/api/friends/${friendId}/moments`, {
      title: 'Has not happened', occurredOn: '9999-01-01',
    }, token);
    assert.equal(futureMoment.response.status, 400, 'a Moment cannot claim a future occurrence');

    const entry = await request('POST', '/api/entries', {
      friendshipId: friendId, kind: 'money', direction: 'owed_to_me', amount: 125,
      note: 'Lunch', photos: [PNG, PNG],
    }, token);
    assert.equal(entry.response.status, 201, JSON.stringify(entry.data));
    assert.equal(entry.data.entry.amount, 125);
    assert.match(entry.data.entry.photo, /^\/api\/media\//);
    assert.equal(entry.data.entry.photos.length, 2, 'a receipt keeps multiple selected images');
    assert.notEqual(entry.data.entry.photos[0], entry.data.entry.photos[1]);
    const anonymousReceipt = await fetch(`${base}${entry.data.entry.photo}`);
    assert.equal(anonymousReceipt.status, 401, 'a media URL alone cannot reveal a receipt');
    const receipt = await fetch(`${base}${entry.data.entry.photo}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(receipt.status, 200);
    assert.equal(receipt.headers.get('content-type'), 'image/png');
    assert.equal(receipt.headers.get('cache-control'), 'private, no-store');
    assert.match(signup.response.headers.get('set-cookie') || '', /\bat=/, 'sign-in gives image elements a scoped HTTP-only session');
    const cookieReceipt = await fetch(`${base}${entry.data.entry.photo}`, { headers: { Cookie: `at=${token}` } });
    assert.equal(cookieReceipt.status, 200, 'normal image requests can use the scoped media cookie');
    const entryInvite = await request('GET', `/api/auth/invite/${entry.data.shareToken}`);
    assert.equal(entryInvite.response.status, 200);
    assert.equal(entryInvite.data.entry.photo, null, 'an unclaimed invite does not expose a private receipt');

    const ledger = await request('GET', `/api/friends/${friendId}`, undefined, token);
    assert.equal(ledger.response.status, 200, JSON.stringify(ledger.data));
    assert.equal(ledger.data.friend.theyOwe, 125);
    assert.equal(ledger.data.entries.length, 1);
    assert.deepEqual(ledger.data.entries[0].photos, entry.data.entry.photos);

    const sanaSignup = await request('POST', '/api/auth/signup', {
      name: 'Sana', handle: 'sana', secret: 'testpass123', currency: 'INR',
    });
    assert.equal(sanaSignup.response.status, 201, JSON.stringify(sanaSignup.data));
    const sanaToken = sanaSignup.data.token;
    const claim = await request('POST', `/api/friends/link/${friend.data.inviteToken}/claim`, {}, sanaToken);
    assert.equal(claim.response.status, 200, JSON.stringify(claim.data));
    const sanaFriendId = claim.data.friend.id;
    const claimAgain = await request('POST', `/api/friends/link/${friend.data.inviteToken}/claim`, {}, sanaToken);
    assert.equal(claimAgain.response.status, 200, 'opening the same link again is safe for the person who accepted it');
    const sanaFriends = await request('GET', '/api/friends', undefined, sanaToken);
    assert.equal(sanaFriends.data.friends.filter((person) => person.user_id === signup.data.user.id).length, 1, 'accepting twice does not duplicate the person');

    const sanaLedger = await request('GET', `/api/friends/${sanaFriendId}`, undefined, sanaToken);
    assert.equal(sanaLedger.response.status, 200, JSON.stringify(sanaLedger.data));
    assert.equal(sanaLedger.data.friend.youOwe, 125, 'the invited person sees the opposite side of the balance');
    assert.equal(sanaLedger.data.entries.length, 1, 'entries logged before joining are shared');
    assert.equal(sanaLedger.data.entries[0].direction, 'owed_by_me');
    assert.equal(sanaLedger.data.entries[0].photo, entry.data.entry.photo, 'the shared receipt is visible');
    assert.deepEqual(sanaLedger.data.entries[0].photos, entry.data.entry.photos, 'both receipt photos are visible to the linked person');
    assert.deepEqual(sanaLedger.data.moments, [], 'a private Moment is not shared by connecting ledgers');
    const hiddenMomentPhoto = await fetch(`${base}${moment.data.moment.photo}`, { headers: { Authorization: `Bearer ${sanaToken}` } });
    assert.equal(hiddenMomentPhoto.status, 404, 'the connected person cannot read a private Moment photo');
    const hiddenSecondMomentPhoto = await fetch(`${base}${moment.data.moment.photos[1]}`, { headers: { Authorization: `Bearer ${sanaToken}` } });
    assert.equal(hiddenSecondMomentPhoto.status, 404);
    const sharedReceipt = await fetch(`${base}${entry.data.entry.photo}`, { headers: { Authorization: `Bearer ${sanaToken}` } });
    assert.equal(sharedReceipt.status, 200, 'a connected person can read the same receipt');
    const sharedSecondReceipt = await fetch(`${base}${entry.data.entry.photos[1]}`, { headers: { Authorization: `Bearer ${sanaToken}` } });
    assert.equal(sharedSecondReceipt.status, 200, 'a connected person can read every image in the receipt');

    const sanaStats = await request('GET', '/api/me/stats', undefined, sanaToken);
    assert.equal(sanaStats.data.totals.youOwe, 125, 'the invited person’s home balance includes shared lines');
    assert.equal(sanaStats.data.honor.n, 1, 'the invited person’s reliability reflects their side of shared lines');

    const reverse = await request('POST', '/api/entries', {
      friendshipId: sanaFriendId, kind: 'money', direction: 'owed_to_me', amount: 50, note: 'Coffee',
    }, sanaToken);
    assert.equal(reverse.response.status, 201, JSON.stringify(reverse.data));
    const aliceLedger = await request('GET', `/api/friends/${friendId}`, undefined, token);
    assert.equal(aliceLedger.data.entries.length, 2, 'new lines appear in the other person’s ledger');
    assert.equal(aliceLedger.data.friend.net, 75, 'both sides combine into one balance');
    assert.equal(aliceLedger.data.entries.find((line) => line.id === reverse.data.entry.id).direction, 'owed_by_me');

    const sanaLines = await request('GET', '/api/entries?status=all', undefined, sanaToken);
    assert.equal(sanaLines.data.entries.some((line) => line.id === entry.data.entry.id), true, 'shared lines appear in the invited person’s all-lines view');
    assert.equal(sanaLines.data.entries.find((line) => line.id === entry.data.entry.id).friend.id, sanaFriendId);

    const aliceEvents = await request('GET', '/api/me/events', undefined, token);
    const newLineEvent = aliceEvents.data.events.find((event) => event.entryId === reverse.data.entry.id);
    assert.equal(newLineEvent.friendshipId, friendId, 'tapping a shared alert opens a friend in the recipient’s own book');

    const sanaSettle = await request('POST', `/api/entries/${entry.data.entry.id}/settle`, {}, sanaToken);
    assert.equal(sanaSettle.response.status, 200, 'either connected person can settle a shared line');
    const aliceAfterSettle = await request('GET', `/api/friends/${friendId}`, undefined, token);
    assert.equal(aliceAfterSettle.data.entries.find((line) => line.id === entry.data.entry.id).status, 'settled');
    const sanaReopen = await request('POST', `/api/entries/${entry.data.entry.id}/reopen`, {}, sanaToken);
    assert.equal(sanaReopen.response.status, 200);

    const sanaDispute = await request('POST', `/api/entries/${entry.data.entry.id}/dispute`, {}, sanaToken);
    assert.equal(sanaDispute.response.status, 200, 'the invited person can dispute a line');
    const aliceAfterDispute = await request('GET', `/api/friends/${friendId}`, undefined, token);
    assert.equal(aliceAfterDispute.data.entries.find((line) => line.id === entry.data.entry.id).status, 'disputed');
    const questionedStats = await request('GET', '/api/me/stats', undefined, token);
    assert.equal(questionedStats.data.totals.disputedEntries, 1, 'questioned lines remain visible even when excluded from the money balance');
    const sanaResolve = await request('POST', `/api/entries/${entry.data.entry.id}/resolve`, { outcome: 'keep' }, sanaToken);
    assert.equal(sanaResolve.response.status, 200);
    const resolvedStats = await request('GET', '/api/me/stats', undefined, token);
    assert.equal(resolvedStats.data.totals.disputedEntries, 0, 'resolving a line clears the questioned state');

    const thirdSignup = await request('POST', '/api/auth/signup', {
      name: 'Third User', handle: 'thirduser', secret: 'testpass123', currency: 'INR',
    });
    const thirdClaim = await request('POST', `/api/friends/link/${friend.data.inviteToken}/claim`, {}, thirdSignup.data.token);
    assert.equal(thirdClaim.response.status, 409, 'a personal invite cannot move to a different account');
    const unaccepted = await request('POST', '/api/friends', { name: 'Sana', handle: 'sana' }, thirdSignup.data.token);
    assert.equal(unaccepted.data.friend.linked, false, 'knowing a handle never connects two private ledgers without an accepted invite');

    const aliceThird = await request('POST', '/api/friends', { name: 'Third User' }, token);
    const thirdAlice = await request('POST', '/api/friends', { name: 'Test User' }, thirdSignup.data.token);
    const olderLine = await request('POST', '/api/entries', {
      friendshipId: thirdAlice.data.friend.id, kind: 'money', direction: 'owed_to_me', amount: 20, note: 'Already in my book',
    }, thirdSignup.data.token);
    const linkExisting = await request('POST', `/api/friends/link/${aliceThird.data.inviteToken}/claim`, {
      friendshipId: thirdAlice.data.friend.id,
    }, thirdSignup.data.token);
    assert.equal(linkExisting.response.status, 200, JSON.stringify(linkExisting.data));
    assert.equal(linkExisting.data.friend.id, thirdAlice.data.friend.id, 'an existing record is reused rather than duplicated');
    const aliceThirdLedger = await request('GET', `/api/friends/${aliceThird.data.friend.id}`, undefined, token);
    assert.equal(aliceThirdLedger.data.entries.find((line) => line.id === olderLine.data.entry.id).direction, 'owed_by_me', 'older lines from the invitee become visible to the inviter');
    const thirdFriends = await request('GET', '/api/friends', undefined, thirdSignup.data.token);
    assert.equal(thirdFriends.data.friends.filter((person) => person.user_id === signup.data.user.id).length, 1);

    const fourthSignup = await request('POST', '/api/auth/signup', {
      name: 'Fourth User', handle: 'fourthuser', secret: 'testpass123', currency: 'INR',
    });
    const preexistingAlice = await request('POST', '/api/friends', {
      name: 'Test User', handle: signup.data.user.handle,
    }, fourthSignup.data.token);
    const privateLine = await request('POST', '/api/entries', {
      friendshipId: preexistingAlice.data.friend.id, kind: 'money', direction: 'owed_to_me', amount: 9,
      note: 'Do not share this without selecting it', photo: PNG,
    }, fourthSignup.data.token);
    const aliceFourth = await request('POST', '/api/friends', { name: 'Fourth User' }, token);
    const freshClaim = await request('POST', `/api/friends/link/${aliceFourth.data.inviteToken}/claim`, {}, fourthSignup.data.token);
    assert.equal(freshClaim.response.status, 200, JSON.stringify(freshClaim.data));
    assert.notEqual(freshClaim.data.friend.id, preexistingAlice.data.friend.id, 'an existing handle match must not imply consent to share old data');
    const aliceFourthLedger = await request('GET', `/api/friends/${aliceFourth.data.friend.id}`, undefined, token);
    assert.equal(aliceFourthLedger.data.entries.some((line) => line.id === privateLine.data.entry.id), false, 'unselected older lines remain private');
    const unselectedReceipt = await fetch(`${base}${privateLine.data.entry.photo}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(unselectedReceipt.status, 404, 'a connected user still cannot read receipts from an unselected older page');

    const outsider = await request('GET', `/api/friends/${friendId}`, undefined, thirdSignup.data.token);
    assert.equal(outsider.response.status, 404, 'a different account cannot view someone else’s ledger');
    const outsiderSettle = await request('POST', `/api/entries/${entry.data.entry.id}/settle`, {}, thirdSignup.data.token);
    assert.equal(outsiderSettle.response.status, 404, 'a different account cannot mutate someone else’s line');
    const outsiderReceipt = await fetch(`${base}${entry.data.entry.photo}`, { headers: { Authorization: `Bearer ${thirdSignup.data.token}` } });
    assert.equal(outsiderReceipt.status, 404, 'a different account cannot read the receipt by URL');
    const incomingDelete = await request('DELETE', `/api/entries/${entry.data.entry.id}`, undefined, sanaToken);
    assert.equal(incomingDelete.response.status, 404, 'an invited person cannot delete the other person’s original line');

    const avatar = await request('POST', '/api/me/photo', { dataUrl: PNG }, token);
    assert.equal(avatar.response.status, 200, JSON.stringify(avatar.data));
    assert.match(avatar.data.avatarUrl, /^\/api\/media\//);
    const anonymousAvatar = await fetch(`${base}${avatar.data.avatarUrl}`);
    assert.equal(anonymousAvatar.status, 401, 'avatar URLs are not anonymously readable');
    const ownAvatar = await fetch(`${base}${avatar.data.avatarUrl}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(ownAvatar.status, 200);
    const connectedAvatar = await fetch(`${base}${avatar.data.avatarUrl}`, { headers: { Authorization: `Bearer ${sanaToken}` } });
    assert.equal(connectedAvatar.status, 200, 'linked people can see the avatar used on their person page');
    const strangerSignup = await request('POST', '/api/auth/signup', {
      name: 'Stranger', handle: 'stranger', secret: 'testpass123', currency: 'INR',
    });
    const outsiderAvatar = await fetch(`${base}${avatar.data.avatarUrl}`, { headers: { Authorization: `Bearer ${strangerSignup.data.token}` } });
    assert.equal(outsiderAvatar.status, 404, 'unlinked accounts cannot read a private avatar');
    const outsiderMoment = await request('DELETE', `/api/friends/${friendId}/moments/${moment.data.moment.id}`, undefined, strangerSignup.data.token);
    assert.equal(outsiderMoment.response.status, 404, 'another account cannot delete a private Moment');

    const group = await request('POST', '/api/groups', { name: 'Trip', members: [friendId] }, token);
    assert.equal(group.response.status, 201, JSON.stringify(group.data));
    assert.equal(group.data.group.members.length, 1);

    const directCurrency = await request('PATCH', '/api/me/profile', { currency: 'USD' }, token);
    assert.equal(directCurrency.response.status, 409, 'currency changes must convert saved amounts');
    const settings = await request('PATCH', '/api/me/profile', { theme: 'dark', voiceMode: 'male' }, token);
    assert.equal(settings.response.status, 200, JSON.stringify(settings.data));
    assert.equal(settings.data.user.currency, 'INR');
    assert.equal(settings.data.user.voiceMode, 'male');

    const friendSettings = await request('PATCH', `/api/friends/${friendId}`, { name: 'Sana K' }, token);
    assert.equal(friendSettings.response.status, 200, JSON.stringify(friendSettings.data));
    assert.equal(friendSettings.data.friend.name, 'Sana K');

    for (const route of ['/api/me/stats', '/api/me/card', '/api/me/invites', '/api/me/events', '/api/entries/insights/summary', '/api/entries/incoming/all', `/api/groups/${group.data.group.id}`]) {
      const result = await request('GET', route, undefined, token);
      assert.equal(result.response.status, 200, `${route}: ${JSON.stringify(result.data)}`);
    }

    const preview = await request('POST', '/api/groups/splits/preview', {
      amount: 100, shares: [friendId, 'me'], method: 'equal',
    }, token);
    assert.equal(preview.response.status, 200, JSON.stringify(preview.data));
    assert.equal(preview.data.shares.reduce((sum, share) => sum + share.amount, 0), 100);

    const split = await request('POST', '/api/groups/splits', {
      groupId: group.data.group.id, title: 'Train', amount: 100,
      payer: { kind: 'me' }, shares: [
        { friendshipId: friendId, amount: 75 }, { friendshipId: 'me', amount: 25 },
      ], method: 'custom',
    }, token);
    assert.equal(split.response.status, 201, JSON.stringify(split.data));
    assert.equal(split.data.entries.length, 1);

    const settle = await request('POST', `/api/entries/${entry.data.entry.id}/settle`, {}, token);
    assert.equal(settle.response.status, 200, JSON.stringify(settle.data));
    const reopen = await request('POST', `/api/entries/${entry.data.entry.id}/reopen`, {}, token);
    assert.equal(reopen.response.status, 200, JSON.stringify(reopen.data));
    const remind = await request('POST', `/api/entries/${entry.data.entry.id}/remind`, {}, token);
    assert.equal(remind.response.status, 200, JSON.stringify(remind.data));
    const dispute = await request('POST', `/api/entries/${entry.data.entry.id}/dispute`, {}, token);
    assert.equal(dispute.response.status, 200, JSON.stringify(dispute.data));
    const resolve = await request('POST', `/api/entries/${entry.data.entry.id}/resolve`, { outcome: 'drop' }, token);
    assert.equal(resolve.response.status, 200, JSON.stringify(resolve.data));

    const deleteSplit = await request('DELETE', `/api/groups/splits/${split.data.splitId}`, undefined, token);
    assert.equal(deleteSplit.response.status, 200, JSON.stringify(deleteSplit.data));
    const deleteEntry = await request('DELETE', `/api/entries/${entry.data.entry.id}`, undefined, token);
    assert.equal(deleteEntry.response.status, 200, JSON.stringify(deleteEntry.data));
    assert.equal(await db.prepare('SELECT id FROM media WHERE id = ?').get(entry.data.entry.photos[1].split('/').at(-1)), undefined, 'deleting a receipt removes every image');
    const deleteMoment = await request('DELETE', `/api/friends/${friendId}/moments/${moment.data.moment.id}`, undefined, token);
    assert.equal(deleteMoment.response.status, 200, JSON.stringify(deleteMoment.data));
    assert.equal(await db.prepare('SELECT id FROM media WHERE id = ?').get(moment.data.moment.photo.split('/').at(-1)), undefined, 'deleting a Moment removes its photo');
    assert.equal(await db.prepare('SELECT id FROM media WHERE id = ?').get(moment.data.moment.photos[1].split('/').at(-1)), undefined, 'deleting a Moment removes its second photo');

    const preservedSplit = await request('POST', '/api/groups/splits', {
      groupId: group.data.group.id, title: 'Taxi home', amount: 80,
      payer: { kind: 'me' }, shares: [
        { friendshipId: friendId, amount: 40 }, { friendshipId: 'me', amount: 40 },
      ], method: 'custom',
    }, token);
    assert.equal(preservedSplit.response.status, 201);
    const preservedEntryId = preservedSplit.data.entries[0].id;
    const deletedGroup = await request('DELETE', `/api/groups/${group.data.group.id}`, undefined, token);
    assert.equal(deletedGroup.response.status, 200);
    const preservedEntry = await db.prepare('SELECT id, group_id, split_id FROM entries WHERE id = ?').get(preservedEntryId);
    assert.ok(preservedEntry, 'deleting a group keeps its ledger entries');
    assert.equal(preservedEntry.group_id, null);
    assert.equal(preservedEntry.split_id, null);

    const temporaryFriend = await request('POST', '/api/friends', { name: 'Temporary page' }, token);
    const temporaryMoment = await request('POST', `/api/friends/${temporaryFriend.data.friend.id}/moments`, {
      title: 'A small real thing', occurredOn: '2026-04-11', photos: [PNG, PNG],
    }, token);
    const removeFriend = await request('DELETE', `/api/friends/${temporaryFriend.data.friend.id}`, undefined, token);
    assert.equal(removeFriend.response.status, 200);
    assert.equal(await db.prepare('SELECT id FROM media WHERE id = ?').get(temporaryMoment.data.moment.photo.split('/').at(-1)), undefined, 'deleting a person removes attached Moment media');
    assert.equal(await db.prepare('SELECT id FROM media WHERE id = ?').get(temporaryMoment.data.moment.photos[1].split('/').at(-1)), undefined, 'deleting a person removes every Moment image');

    const refresh = await request('POST', '/api/auth/refresh', { refreshToken: signup.data.refreshToken });
    assert.equal(refresh.response.status, 200, JSON.stringify(refresh.data));
    const account = await request('DELETE', '/api/me/account', undefined, token);
    assert.equal(account.response.status, 200, JSON.stringify(account.data));
    const deletedAvatar = await db.prepare('SELECT id FROM media WHERE id = ?').get(avatar.data.avatarUrl.split('/').at(-1));
    assert.equal(deletedAvatar, undefined, 'account deletion removes media owned by that account');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});
