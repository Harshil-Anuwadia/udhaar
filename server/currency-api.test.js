import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('currency change rewrites a private ledger and split atomically', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'udhaar-fx-test-'));
  process.env.DATA_DIR = dir;
  process.env.TURSO_DATABASE_URL = `file:${path.join(dir, 'test.db')}`;
  process.env.JWT_SECRET = 'currency-test-secret';
  const [{ default: app }, { db }] = await Promise.all([import('./index.js'), import('./db.js')]);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (url, options) => String(url).startsWith('https://api.frankfurter.dev/')
    ? Promise.resolve({ ok: true, json: async () => ({ date: new Date().toISOString().slice(0, 10), base: 'INR', quote: 'USD', rate: 0.0104 }) })
    : realFetch(url, options);
  const call = async (method, url, body, token) => {
    const response = await fetch(base + url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  try {
    const signup = await call('POST', '/api/auth/signup', { name: 'FX User', handle: 'fxuser', secret: 'password123', currency: 'INR' });
    assert.equal(signup.status, 201);
    const token = signup.data.token;
    const friend = await call('POST', '/api/friends', { name: 'Pat' }, token);
    const fid = friend.data.friend.id;
    await call('POST', '/api/entries', { friendshipId: fid, kind: 'money', direction: 'owed_to_me', amount: 250 }, token);
    const group = await call('POST', '/api/groups', { name: 'Weekend', members: [fid] }, token);
    const split = await call('POST', '/api/groups/splits', { groupId: group.data.group.id, title: 'Food', amount: 100, payer: { kind: 'me' }, shares: [{ friendshipId: fid, amount: 40 }, { friendshipId: 'me', amount: 60 }], method: 'custom' }, token);
    assert.equal(split.status, 201, JSON.stringify(split.data));
    const quote = await call('GET', '/api/me/currency/quote?to=USD', undefined, token);
    assert.equal(quote.data.rate, 0.0104);
    const changed = await call('POST', '/api/me/currency/change', { to: 'USD', rate: quote.data.rate, date: quote.data.date }, token);
    assert.equal(changed.status, 200, JSON.stringify(changed.data));
    assert.equal(changed.data.user.currency, 'USD');
    const entries = await db.prepare('SELECT amount FROM entries WHERE owner_id = ? ORDER BY amount').all(signup.data.user.id);
    assert.deepEqual(entries.map((e) => e.amount), [0.42, 2.6]);
    const savedSplit = await db.prepare('SELECT amount, me_share FROM splits WHERE id = ?').get(split.data.splitId);
    assert.deepEqual([savedSplit.amount, savedSplit.me_share], [1.04, 0.62]);
    assert.equal((await db.prepare('SELECT currency FROM groups WHERE id = ?').get(group.data.group.id)).currency, 'USD');
  } finally {
    globalThis.fetch = realFetch;
    await new Promise((resolve) => server.close(resolve));
    await db.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
