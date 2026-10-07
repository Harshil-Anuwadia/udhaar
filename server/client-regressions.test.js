// Real API-client regressions use a disposable local database and HTTP server.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'udhaar-client-regressions-'));
process.env.DATA_DIR = directory;
process.env.TURSO_DATABASE_URL = `file:${path.join(directory, 'audit.db')}`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
const [{ default: app }, { db, newId }, auth] = await Promise.all([
  import('./index.js'), import('./db.js'), import('./auth.js'),
]);
await db.ready;
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const actualFetch = globalThis.fetch;
const password = 'isolated-client-audit-password';
const passwordHash = auth.hashSecret(password);
let counter = 0;
after(async () => {
  globalThis.fetch = actualFetch;
  await new Promise(resolve => server.close(resolve));
  await db.close();
  await fs.rm(directory, { recursive: true, force: true });
});

async function fixture() {
  const id = newId('u');
  const handle = `clientaudit${++counter}`;
  await db.prepare(`INSERT INTO users (id,handle,name,password_hash,onboarded,created_at,last_seen_at)
    VALUES (?,?,?,?,1,?,?)`).run(id, handle, handle, passwordHash, Date.now(), Date.now());
  const token = auth.signAccess(await db.prepare('SELECT * FROM users WHERE id = ?').get(id));
  const friendshipId = newId('f');
  await db.prepare(`INSERT INTO friendships (id,owner_id,handle,name,created_at) VALUES (?,?,?,?,?)`)
    .run(friendshipId, id, 'auditperson', 'Audit person', Date.now());
  return { id, handle, token, friendshipId };
}

async function clientFor(who) {
  const memory = new Map([['udhaar.at', who.token]]);
  globalThis.localStorage = {
    get length() { return memory.size; },
    key: i => [...memory.keys()][i] ?? null,
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: key => memory.delete(key),
  };
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
  const client = await import(`../public/js/core/api.js?regression=${++counter}`);
  return client;
}

const payload = (who, amount) => ({ friendshipId: who.friendshipId, kind: 'money', direction: 'owed_to_me', amount, note: 'Isolated offline audit' });
const connectedFetch = (url, options) => actualFetch(new URL(url, base), options);

test('B12: a lost response followed by offline retry must not create the same debt twice', async t => {
  const a = await fixture();
  const client = await clientFor(a);
  let loseResponse = true;
  globalThis.fetch = async (url, options) => {
    const response = await connectedFetch(url, options);
    if (String(url) === '/api/entries' && loseResponse) {
      loseResponse = false;
      await response.arrayBuffer();
      throw new TypeError('Isolated audit: response lost after server committed');
    }
    return response;
  };
  try {
    await assert.rejects(client.api.addEntry(payload(a, 100)));
    const before = await db.prepare('SELECT COUNT(*) AS n FROM entries WHERE owner_id = ?').get(a.id);
    assert.equal(before.n, 1);
    const flushed = await client.flushQueue();
    assert.equal(flushed.flushed, 1);
    const afterRetry = await db.prepare('SELECT COUNT(*) AS n, SUM(amount) AS amount FROM entries WHERE owner_id = ?').get(a.id);
    t.diagnostic(`One intended debt: after initial committed response loss 1 row; after retry ${afterRetry.n} rows, debt ${afterRetry.amount}`);
    assert.equal(afterRetry.n, 1, 'replaying a committed write must not create another obligation');
    assert.equal(afterRetry.amount, 100);
  } finally { globalThis.fetch = actualFetch; }
});

test('B13: a queue flush must not overwrite a new offline mutation queued while it is running', async t => {
  const a = await fixture();
  const client = await clientFor(a);
  globalThis.fetch = async () => { throw new TypeError('Isolated offline fixture'); };
  try {
    await assert.rejects(client.api.addEntry(payload(a, 100)));
    let rejectPending;
    globalThis.fetch = (_url, options) => {
      const amount = JSON.parse(options.body).amount;
      if (amount === 100) return new Promise((_resolve, reject) => { rejectPending = reject; });
      return Promise.reject(new TypeError('Isolated offline fixture'));
    };
    const pendingFlush = client.flushQueue();
    assert.equal(typeof rejectPending, 'function');
    await assert.rejects(client.api.addEntry(payload(a, 200)));
    assert.ok(client.pendingCount() >= 1, 'new work is retained while the old send is pending');
    rejectPending(new TypeError('Isolated pending flush failure'));
    await pendingFlush;
    assert.equal(client.pendingCount(), 2, 'both unsent financial writes remain pending');
    globalThis.fetch = connectedFetch;
    assert.equal((await client.flushQueue()).flushed, 2);
    const rows = await db.prepare('SELECT amount FROM entries WHERE owner_id = ? ORDER BY amount').all(a.id);
    assert.deepEqual(rows.map(row => row.amount), [100, 200], 'recovery sends both the old and newly queued debts');
  } finally { globalThis.fetch = actualFetch; }
});

test('B14: pending mutations must not be replayed using another account after signing out', async t => {
  const a = await fixture();
  const b = await fixture();
  const client = await clientFor(a);
  globalThis.fetch = async () => { throw new TypeError('Isolated offline fixture'); };
  try {
    await assert.rejects(client.api.addEntry(payload(a, 100)));
    client.clearSession();
    globalThis.fetch = connectedFetch;
    await client.api.login({ id: b.handle, secret: password });
    let attemptsAsB = 0;
    let responseStatus;
    globalThis.fetch = async (url, options) => {
      if (String(url) === '/api/entries') attemptsAsB++;
      const response = await connectedFetch(url, options);
      responseStatus = response.status;
      return response;
    };
    const flushed = await client.flushQueue();
    t.diagnostic(`A's queued entry sent after B signed in: ${attemptsAsB} attempts, HTTP ${responseStatus}, failures ${flushed.failed}; backend ownership rejects the write`);
    assert.equal(attemptsAsB, 0, 'pending private work must not be sent under another account');
    assert.equal(client.pendingCount(), 0, 'another account does not inherit the backlog');
    client.clearSession();
    globalThis.fetch = connectedFetch;
    await client.api.login({ id: a.handle, secret: password });
    assert.equal(client.pendingCount(), 1, 'the original account retains its unsent write');
    assert.equal((await client.flushQueue()).flushed, 1);
    const saved = await db.prepare('SELECT amount FROM entries WHERE owner_id = ?').all(a.id);
    assert.deepEqual(saved.map(row => row.amount), [100]);
  } finally { globalThis.fetch = actualFetch; }
});

test('B18: the offline queue must not silently discard the oldest write when a forty-first write is saved', async t => {
  const a = await fixture();
  const client = await clientFor(a);
  globalThis.fetch = async () => { throw new TypeError('Isolated offline fixture'); };
  try {
    for (let amount = 1; amount <= 41; amount++) {
      await assert.rejects(client.api.addEntry(payload(a, amount)));
    }
    assert.equal(client.pendingCount(), 41, 'all accepted financial writes remain pending');
    globalThis.fetch = connectedFetch;
    assert.equal((await client.flushQueue()).flushed, 41);
    const saved = await db.prepare('SELECT amount FROM entries WHERE owner_id = ? ORDER BY amount').all(a.id);
    assert.deepEqual(saved.map(row => row.amount), Array.from({ length: 41 }, (_, i) => i + 1),
      'recovery includes the oldest write and every later accepted write');
  } finally { globalThis.fetch = actualFetch; }
});

test('B14: a refresh that changes accounts cannot replay the original account\'s mutation', async () => {
  const a = await fixture();
  const b = await fixture();
  const client = await clientFor(a);
  let entryRequests = 0;
  globalThis.fetch = async (url) => {
    if (url === '/api/auth/refresh') return new Response(JSON.stringify({ token: b.token, user: { id: b.id } }), { status: 200 });
    entryRequests++;
    return new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401 });
  };
  localStorage.setItem('udhaar.rt', 'synthetic-refresh');
  try {
    await assert.rejects(client.api.addEntry(payload(a, 100)));
    assert.equal(entryRequests, 1, 'refresh cannot send A’s financial payload using B’s access token');
  } finally { globalThis.fetch = actualFetch; }
});

test('B18: storage exhaustion is explicit and sends no unsaved write', async () => {
  const a = await fixture();
  const client = await clientFor(a);
  const write = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('Synthetic quota exhaustion'); };
  let sent = 0;
  globalThis.fetch = async () => { sent++; throw new Error('Must not send'); };
  try {
    await assert.rejects(client.api.addEntry(payload(a, 100)), error => error.status === 507 && /could not be saved/.test(error.message));
    assert.equal(sent, 0);
  } finally { localStorage.setItem = write; globalThis.fetch = actualFetch; }
});
