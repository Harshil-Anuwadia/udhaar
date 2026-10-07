// Financial-integrity regressions exercise the real API on a disposable local database.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'udhaar-ledger-regressions-'));
process.env.DATA_DIR = directory;
process.env.TURSO_DATABASE_URL = `file:${path.join(directory, 'audit.db')}`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
const [{ default: app }, { db, newId }, auth] = await Promise.all([
  import('./index.js'),
  import('./db.js'),
  import('./auth.js'),
]);
await db.ready;
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const actualFetch = globalThis.fetch;
const password = 'isolated-audit-password';
const passwordHash = auth.hashSecret(password);
let counter = 0;

after(async () => {
  globalThis.fetch = actualFetch;
  await new Promise(resolve => server.close(resolve));
  await db.close();
  await fs.rm(directory, { recursive: true, force: true });
});

async function user(currency = 'INR') {
  const id = newId('u');
  const handle = `audituser${++counter}`;
  await db.prepare(`INSERT INTO users (id,handle,name,password_hash,currency,onboarded,created_at,last_seen_at)
    VALUES (?,?,?,?,?,1,?,?)`).run(id, handle, handle, passwordHash, currency, Date.now(), Date.now());
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return { id, handle, currency, token: auth.signAccess(row) };
}

async function call(who, method, route, body, extraHeaders = {}) {
  const response = await actualFetch(base + route, {
    method,
    headers: {
      ...(who ? { Authorization: `Bearer ${who.token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  return { status: response.status, data };
}

async function friend(who, name = `Person ${++counter}`) {
  const result = await call(who, 'POST', '/api/friends', { name });
  assert.equal(result.status, 201);
  return { ...result.data.friend, inviteToken: result.data.inviteToken };
}

async function line(who, person, amount = 100) {
  const result = await call(who, 'POST', '/api/entries', {
    friendshipId: person.id, kind: 'money', direction: 'owed_to_me', amount, note: 'Audit debt',
  });
  assert.equal(result.status, 201);
  return result.data.entry;
}

async function pair(currencyA = 'INR', currencyB = 'INR') {
  const a = await user(currencyA);
  const b = await user(currencyB);
  const fa = await friend(a);
  const linked = await call(b, 'POST', `/api/friends/link/${fa.inviteToken}/claim`, {});
  assert.equal(linked.status, 200);
  return { a, b, fa, fb: linked.data.friend };
}

async function withRate(from, to, rate, operation) {
  globalThis.fetch = (url, options) => String(url).startsWith('https://api.frankfurter.dev/')
    ? Promise.resolve({ ok: true, json: async () => ({ base: from, quote: to, rate, date: new Date().toISOString().slice(0, 10) }) })
    : actualFetch(url, options);
  try { return await operation(); } finally { globalThis.fetch = actualFetch; }
}

async function convert(who, to, rate) {
  return call(who, 'POST', '/api/me/currency/change', { to, rate, date: new Date().toISOString().slice(0, 10) });
}

for (const payerKind of ['me', 'friend']) {
  test(`B03-${payerKind}: converting a partially paid split preserves the outstanding remainder`, async t => {
  const a = await user();
  const f = await friend(a);
  const group = await call(a, 'POST', '/api/groups', { name: 'Audit trip', members: [f.id] });
  assert.equal(group.status, 201);
  const split = await call(a, 'POST', '/api/groups/splits', {
    groupId: group.data.group.id, title: 'Audit bill', amount: 200,
    payer: payerKind === 'me' ? { kind: 'me' } : { kind: 'friend', friendshipId: f.id },
    shares: [{ friendshipId: f.id, amount: 100 }, { friendshipId: 'me', amount: 100 }], method: 'custom',
  });
  assert.equal(split.status, 201);
  const entryId = split.data.entries[0].id;
  const paid = await call(a, 'POST', `/api/entries/${entryId}/settle`, { amount: 40 });
  assert.equal(paid.status, 200);
  assert.equal(paid.data.entry.amount, 60);
  const changed = await withRate('INR', 'USD', 0.01, () => convert(a, 'USD', 0.01));
  assert.equal(changed.status, 200);
  const saved = await db.prepare('SELECT amount FROM entries WHERE id = ?').get(entryId);
  t.diagnostic(`Original debt 100, paid 40, remaining 60; rate 0.01; actual new remaining ${saved.amount}, expected 0.60`);
  assert.equal(saved.amount, 0.6, 'conversion preserves the remaining unpaid obligation');
  const rows = await db.prepare('SELECT amount, status FROM entries WHERE owner_id = ? ORDER BY status').all(a.id);
  assert.deepEqual(rows, [{ amount: 0.6, status: 'open' }, { amount: 0.4, status: 'settled' }]);
  });
}

test('B04a: differently denominated accounts cannot silently share unconverted money', async () => {
  const a = await user('INR');
  const b = await user('USD');
  const fa = await friend(a);
  await line(a, fa, 100);
  const claimed = await call(b, 'POST', `/api/friends/link/${fa.inviteToken}/claim`, {});
  assert.ok([200, 409].includes(claimed.status), JSON.stringify(claimed.data));
  if (claimed.status === 409) {
    const saved = await db.prepare('SELECT user_id FROM friendships WHERE id = ?').get(fa.id);
    assert.equal(saved.user_id, null, 'rejected links must leave the source private');
    return;
  }
  const ledger = await call(b, 'GET', `/api/friends/${claimed.data.friend.id}`);
  assert.ok(ledger.data.entries[0].currency || ledger.data.entries[0].amount !== 100,
    'INR 100 must not become USD 100 without a currency boundary');
});

test('B04b: an incoming shared money line must block unsafe currency changes too', async t => {
  const { a, b, fa, fb } = await pair();
  await line(a, fa, 100);
  const changed = await withRate('INR', 'USD', 0.01, () => convert(b, 'USD', 0.01));
  const ledger = await call(b, 'GET', `/api/friends/${fb.id}`);
  t.diagnostic(`Incoming-only ledger: conversion HTTP ${changed.status}; viewer currency ${changed.data.user?.currency}; unchanged incoming debt ${ledger.data.friend.youOwe}`);
  assert.equal(changed.status, 409, 'linked-line guard counts only entries authored by the user');
});

test('B05: two person rows linked to the same account must not count the opposite ledger twice', async t => {
  const { a, b, fa, fb } = await pair();
  const another = await friend(a);
  const claim = await call(b, 'POST', `/api/friends/link/${another.inviteToken}/claim`, {});
  assert.ok([200, 409].includes(claim.status), JSON.stringify(claim.data));
  await line(b, fb, 50);
  const stats = await call(a, 'GET', '/api/me/stats');
  t.diagnostic(`One opposite-account line of 50; actual total debt ${stats.data.totals.youOwe}`);
  assert.equal(stats.data.totals.youOwe, 50, 'duplicate owner/user friendship pairs duplicate incoming amounts in totalsFor');
});

for (const mode of ['account', 'friend']) {
  test(`B06-${mode}: removing one participant must preserve the other account's shared history`, async t => {
    const { a, b, fa, fb } = await pair();
    const e = await line(a, fa, 100);
    assert.equal((await call(a, 'POST', `/api/entries/${e.id}/settle`, {})).status, 200);
    await line(a, fa, 30);
    const before = await call(b, 'GET', `/api/friends/${fb.id}`);
    assert.equal(before.data.entries.length, 2);
    const deletion = await call(a, 'DELETE', mode === 'account' ? '/api/me/account' : `/api/friends/${fa.id}`);
    assert.equal(deletion.status, 200);
    const after = await call(b, 'GET', `/api/friends/${fb.id}`);
    assert.equal(after.status, 200);
    assert.deepEqual(after.data.entries.map(row => ({ amount: row.amount, status: row.status, direction: row.direction }))
      .sort((x, y) => x.amount - y.amount), [
        { amount: 30, status: 'open', direction: 'owed_by_me' },
        { amount: 100, status: 'settled', direction: 'owed_by_me' },
      ], 'the survivor retains both unpaid money and settled financial history');
    assert.equal(after.data.friend.youOwe, 30);
    assert.equal(after.data.history.settledAmount, 100);
  });
}

test('B07: Undo after a partial payment must restore the pre-payment debt', async t => {
  const a = await user();
  const f = await friend(a);
  const e = await line(a, f, 100);
  const paid = await call(a, 'POST', `/api/entries/${e.id}/settle`, { amount: 40 });
  assert.equal(paid.status, 200);
  const undo = paid.data.operationId ? { operationId: paid.data.operationId } : {};
  assert.equal((await call(a, 'POST', `/api/entries/${e.id}/reopen`, undo)).status, 200);
  const ledger = await call(a, 'GET', `/api/friends/${f.id}`);
  t.diagnostic(`After paying 40 from 100 and Undo: open debt ${ledger.data.friend.theyOwe}, settled history ${ledger.data.history.settledAmount}`);
  assert.equal(ledger.data.friend.theyOwe, 100, 'Undo restores the outstanding obligation');
  assert.equal(ledger.data.history.settledAmount, 0, 'Undo removes the reversed payment from paid history');
});

test('B08a: failed partial settlement must not leave a committed payment fragment', async t => {
  const a = await user();
  const f = await friend(a);
  const e = await line(a, f, 100);
  const originalPrepare = db.prepare;
  const originalTransaction = db.transaction;
  let injected = false;
  function failAmountWrite(prepare, context, sql) {
    const statement = prepare.call(context, sql);
    if (/UPDATE\s+entries\s+SET[\s\S]*\bamount\s*=/i.test(sql)) {
      const run = statement.run;
      statement.run = async (...args) => {
        if (args.includes(e.id)) {
          injected = true;
          throw new Error('Regression fixture: transient database failure during payment');
        }
        return run(...args);
      };
    }
    return statement;
  }
  db.prepare = function(sql) { return failAmountWrite(originalPrepare, this, sql); };
  db.transaction = function(callback) {
    return originalTransaction.call(this, tx => callback({
      ...tx, prepare: sql => failAmountWrite(tx.prepare, tx, sql),
    }));
  };
  let result;
  try { result = await call(a, 'POST', `/api/entries/${e.id}/settle`, { amount: 40 }); }
  finally { db.prepare = originalPrepare; db.transaction = originalTransaction; }
  assert.equal(injected, true, 'the fixture must fail a real payment write');
  assert.equal(result.status, 500);
  const rows = await db.prepare('SELECT amount, status FROM entries WHERE friendship_id = ? ORDER BY status').all(f.id);
  t.diagnostic(`Request failed HTTP 500, persisted rows: ${JSON.stringify(rows)}`);
  assert.deepEqual(rows, [{ amount: 100, status: 'open' }], 'the settled INSERT commits before the outstanding UPDATE, without a transaction');
});

test('B08b: concurrent partial settlements must never produce negative remaining debt', async t => {
  const a = await user();
  const f = await friend(a);
  const e = await line(a, f, 100);
  const results = await Promise.all([
    call(a, 'POST', `/api/entries/${e.id}/settle`, { amount: 75 }),
    call(a, 'POST', `/api/entries/${e.id}/settle`, { amount: 75 }),
  ]);
  const rows = await db.prepare('SELECT amount,status FROM entries WHERE friendship_id = ?').all(f.id);
  t.diagnostic(`Concurrent local requests: HTTP statuses ${results.map(r => r.status)}; final rows ${JSON.stringify(rows)}`);
  assert.ok(results.every(result => [200, 409].includes(result.status)), JSON.stringify(results));
  assert.ok(rows.every(row => row.amount >= 0), 'concurrent payments never make the obligation negative');
  assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 100, 'settled and remaining amounts conserve the obligation');
});

test('B09: email login must work for an address containing uppercase letters at signup', async t => {
  const signup = await call(null, 'POST', '/api/auth/signup', {
    name: 'Email audit', handle: `emailaudit${++counter}`, contact: 'MixedCaseAudit@Example.test', secret: password,
  });
  assert.equal(signup.status, 201);
  const login = await call(null, 'POST', '/api/auth/login', { id: 'MixedCaseAudit@Example.test', secret: password });
  t.diagnostic(`Signup with mixed-case email HTTP ${signup.status}; login with the exact same email HTTP ${login.status}`);
  assert.equal(login.status, 200, 'signup stores the original case, while login lowercases before a case-sensitive lookup');
});

test('B10: refresh token rotation must accept each old token only once under concurrent requests', async t => {
  const a = await user();
  const oldToken = await auth.issueRefresh(a.id);
  const results = await Promise.all([
    call(null, 'POST', '/api/auth/refresh', { refreshToken: oldToken }),
    call(null, 'POST', '/api/auth/refresh', { refreshToken: oldToken }),
  ]);
  const successes = results.filter(r => r.status === 200);
  const active = await db.prepare('SELECT COUNT(*) AS n FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL').get(a.id);
  t.diagnostic(`Concurrent local requests: HTTP statuses ${results.map(r => r.status)}; active descendant tokens ${active.n}`);
  assert.equal(successes.length, 1, 'only one concurrent rotation may consume the old token');
  assert.equal(active.n, 1, 'exactly one usable successor is issued');
  const successor = successes[0].data.refreshToken;
  assert.ok(successor);
  assert.equal((await call(null, 'POST', '/api/auth/refresh', { refreshToken: oldToken })).status, 401);
  assert.equal((await call(null, 'POST', '/api/auth/refresh', { refreshToken: successor })).status, 200);
});

test('B11: signing out of one phone must leave the other phone\'s refresh session usable', async t => {
  const a = await user();
  const deviceOne = await auth.issueRefresh(a.id);
  const deviceTwo = await auth.issueRefresh(a.id);
  const logout = await call(a, 'POST', '/api/auth/logout', {}, { Cookie: `rt=${deviceOne}` });
  assert.equal(logout.status, 200);
  const refreshOther = await call(null, 'POST', '/api/auth/refresh', { refreshToken: deviceTwo });
  t.diagnostic(`UI promises 'Only on this phone'; other phone refresh after logout HTTP ${refreshOther.status}`);
  assert.equal(refreshOther.status, 200, 'logout invokes revokeAll rather than revoking only the current refresh session');
});

test('B17: invite-code signup must not leave a committed account behind after a friendship conflict', async t => {
  const a = await user();
  const guestHandle = `inviteguest${++counter}`;
  const existing = await call(a, 'POST', '/api/friends', { name: 'Expected guest', handle: guestHandle });
  assert.equal(existing.status, 201);
  const invitation = await call(a, 'POST', '/api/me/invites/code', {});
  assert.equal(invitation.status, 201);
  const signup = await call(null, 'POST', '/api/auth/signup', {
    name: 'Actual guest', handle: guestHandle, secret: password, inviteCode: invitation.data.code,
  });
  const persisted = await db.prepare('SELECT COUNT(*) AS n FROM users WHERE handle = ?').get(guestHandle);
  t.diagnostic(`Pre-existing unlinked person with guest's handle: invite signup HTTP ${signup.status}; newly created account remains ${persisted.n === 1}`);
  assert.ok([201, 409].includes(signup.status), JSON.stringify(signup.data));
  const invite = await db.prepare('SELECT used_by, used_at FROM invite_codes WHERE code = ?').get(invitation.data.code);
  const source = await db.prepare('SELECT user_id FROM friendships WHERE id = ?').get(existing.data.friend.id);
  assert.equal(source.user_id, null, 'an existing unrelated private person record cannot be auto-shared');
  if (signup.status === 409) {
    assert.equal(persisted.n, 0, 'a rejected signup rolls the account back');
    assert.equal(invite.used_by, null, 'a rejected signup does not consume its invitation');
    assert.equal(invite.used_at, null);
  } else {
    assert.equal(persisted.n, 1);
    assert.equal(invite.used_by, signup.data.user.id);
  }
});

test('B11: logout revokes an in-flight refresh successor on this device only', async () => {
  const a = await user();
  const deviceOne = await auth.issueRefresh(a.id);
  const deviceTwo = await auth.issueRefresh(a.id);
  const inFlight = await call(null, 'POST', '/api/auth/refresh', { refreshToken: deviceOne });
  assert.equal(inFlight.status, 200);
  assert.equal((await call(a, 'POST', '/api/auth/logout', { refreshToken: deviceOne })).status, 200);
  assert.equal((await call(null, 'POST', '/api/auth/refresh', { refreshToken: inFlight.data.refreshToken })).status, 401,
    'a late refresh response cannot restore the signed-out device');
  assert.equal((await call(null, 'POST', '/api/auth/refresh', { refreshToken: deviceTwo })).status, 200);
});

test('B07: stale Undo cannot undo a newer payment; retries of the same Undo are harmless', async () => {
  const a = await user();
  const f = await friend(a);
  const e = await line(a, f, 100);
  const first = await call(a, 'POST', `/api/entries/${e.id}/settle`, { amount: 40 });
  const second = await call(a, 'POST', `/api/entries/${e.id}/settle`, { amount: 20 });
  assert.equal((await call(a, 'POST', `/api/entries/${e.id}/reopen`, { settlementId: first.data.settlementId })).status, 409);
  const undone = await call(a, 'POST', `/api/entries/${e.id}/reopen`, { settlementId: second.data.settlementId });
  assert.equal(undone.status, 200);
  assert.equal(undone.data.entry.amount, 60);
  assert.equal((await call(a, 'POST', `/api/entries/${e.id}/reopen`, { settlementId: second.data.settlementId })).status, 200);
  const rows = await db.prepare('SELECT amount, status FROM entries WHERE friendship_id = ? ORDER BY status').all(f.id);
  assert.deepEqual(rows, [{ amount: 60, status: 'open' }, { amount: 40, status: 'settled' }]);
});

test('B07: deleting a paid fragment makes its Undo stale', async () => {
  const a = await user();
  const f = await friend(a);
  const e = await line(a, f, 100);
  const payment = await call(a, 'POST', `/api/entries/${e.id}/settle`, { amount: 40 });
  const fragment = await db.prepare("SELECT id FROM entries WHERE friendship_id = ? AND status = 'settled'").get(f.id);
  assert.equal((await call(a, 'DELETE', `/api/entries/${fragment.id}`)).status, 200);
  assert.equal((await call(a, 'POST', `/api/entries/${e.id}/reopen`, { settlementId: payment.data.settlementId })).status, 409);
  assert.equal((await db.prepare('SELECT amount FROM entries WHERE id = ?').get(e.id)).amount, 60);
});

test('B12: concurrent retries share an entry, mismatched payloads conflict, and deletion stays deleted', async () => {
  const a = await user();
  const f = await friend(a);
  const payload = { friendshipId: f.id, kind: 'money', direction: 'owed_to_me', amount: 100, mutationId: crypto.randomUUID() };
  const writes = await Promise.all([call(a, 'POST', '/api/entries', payload), call(a, 'POST', '/api/entries', payload)]);
  assert.deepEqual(writes.map(r => r.status), [201, 201]);
  assert.equal(writes[0].data.entry.id, writes[1].data.entry.id);
  assert.equal((await call(a, 'POST', '/api/entries', { ...payload, amount: 200 })).status, 409);
  const id = writes[0].data.entry.id;
  assert.equal((await call(a, 'DELETE', `/api/entries/${id}`)).status, 200);
  assert.equal((await call(a, 'POST', '/api/entries', payload)).status, 201);
  assert.equal(await db.prepare('SELECT id FROM entries WHERE id = ?').get(id), undefined, 'an old acknowledged retry never resurrects a deleted line');
});
