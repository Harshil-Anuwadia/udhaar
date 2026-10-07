import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { createDatabase } from './db.js';

test('libSQL database initializes the ledger schema and supports prepared statements', async () => {
  const db = createDatabase({ url: 'file::memory:' });
  try {
    await db.ready;
    await db.prepare('INSERT INTO users (id, name, password_hash, created_at, last_seen_at) VALUES (?,?,?,?,?)')
      .run('test-user', 'Test User', 'hash', 1, 1);

    const user = await db.prepare('SELECT id, name FROM users WHERE id = ?').get('test-user');
    assert.deepEqual(user, { id: 'test-user', name: 'Test User' });
  } finally {
    await db.close();
  }
});

test('libSQL database keeps ledger updates atomic when a transaction fails', async () => {
  const db = createDatabase({ url: 'file::memory:' });
  try {
    await db.ready;
    await assert.rejects(db.transaction(async (tx) => {
      await tx.prepare('INSERT INTO users (id, name, password_hash, created_at, last_seen_at) VALUES (?,?,?,?,?)')
        .run('rolled-back', 'Rolled Back', 'hash', 1, 1);
      throw new Error('abort transaction');
    }), /abort transaction/);

    assert.equal(await db.prepare('SELECT id FROM users WHERE id = ?').get('rolled-back'), undefined);
  } finally {
    await db.close();
  }
});

test('an existing user database gains the optional voice preference without losing accounts', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'udhaar-migration-'));
  const url = `file:${path.join(directory, 'legacy.db')}`;
  const legacy = createClient({ url });
  try {
    await legacy.execute('CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL)');
    await legacy.execute({ sql: 'INSERT INTO users (id, name) VALUES (?, ?)', args: ['old-user', 'Old User'] });
    await legacy.close();
    const upgraded = createDatabase({ url });
    try {
      await upgraded.ready;
      const user = await upgraded.prepare('SELECT name, voice_mode FROM users WHERE id = ?').get('old-user');
      assert.deepEqual(user, { name: 'Old User', voice_mode: 'neutral' });
    } finally { await upgraded.close(); }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('legacy media gains an owner without changing its URL or bytes', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'udhaar-media-migration-'));
  const url = `file:${path.join(directory, 'legacy.db')}`;
  const legacy = createClient({ url });
  const id = '00000000-0000-4000-8000-000000000001';
  try {
    await legacy.execute('CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, password_hash TEXT NOT NULL, avatar_path TEXT, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL)');
    await legacy.execute('CREATE TABLE media (id TEXT PRIMARY KEY, content_type TEXT NOT NULL, data BLOB NOT NULL, created_at INTEGER NOT NULL)');
    await legacy.execute({ sql: 'INSERT INTO users (id, name, password_hash, avatar_path, created_at, last_seen_at) VALUES (?,?,?,?,?,?)', args: ['owner', 'Owner', 'hash', `/api/media/${id}`, 1, 1] });
    await legacy.execute({ sql: 'INSERT INTO media (id, content_type, data, created_at) VALUES (?,?,?,?)', args: [id, 'image/png', Buffer.from([137, 80, 78, 71]), 1] });
    await legacy.close();

    const upgraded = createDatabase({ url });
    try {
      await upgraded.ready;
      const media = await upgraded.prepare('SELECT owner_id AS ownerId, content_type AS contentType, data FROM media WHERE id = ?').get(id);
      assert.equal(media.ownerId, 'owner');
      assert.equal(media.contentType, 'image/png');
      assert.deepEqual(Buffer.from(media.data), Buffer.from([137, 80, 78, 71]));
    } finally { await upgraded.close(); }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('legacy duplicate links consolidate money without deleting private pages or group shares', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'udhaar-link-migration-'));
  const url = `file:${path.join(directory, 'legacy.db')}`;
  let old = createDatabase({ url });
  try {
    await old.ready;
    for (const id of ['alice', 'bob']) await old.prepare('INSERT INTO users (id,handle,name,password_hash,created_at,last_seen_at) VALUES (?,?,?,?,?,?)')
      .run(id, id, id, 'hash', 1, 1);
    await old.exec('DROP INDEX idx_friendships_linked_pair');
    for (const [id, handle, created] of [['primary', 'bob', 1], ['alias', 'anotherbob', 2]]) {
      await old.prepare('INSERT INTO friendships (id,owner_id,user_id,handle,name,note,created_at) VALUES (?,?,?,?,?,?,?)')
        .run(id, 'alice', 'bob', handle, handle, `Private note for ${id}`, created);
    }
    await old.prepare('INSERT INTO groups (id,owner_id,name,created_at) VALUES (?,?,?,?)').run('trip', 'alice', 'Trip', 1);
    await old.prepare('INSERT INTO splits (id,group_id,owner_id,title,amount,created_at,payer_friendship_id) VALUES (?,?,?,?,?,?,?)')
      .run('bill', 'trip', 'alice', 'Bill', 100, 1, 'alias');
    for (const [fid, amount] of [['primary', 40], ['alias', 60]]) {
      await old.prepare('INSERT INTO split_shares (split_id,friendship_id,amount) VALUES (?,?,?)').run('bill', fid, amount);
      await old.prepare('INSERT INTO group_members (group_id,friendship_id,joined_at) VALUES (?,?,?)').run('trip', fid, 1);
      await old.prepare('INSERT INTO entries (id,friendship_id,owner_id,kind,direction,amount,split_id,group_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(`entry_${fid}`, fid, 'alice', 'money', 'owed_to_me', amount, 'bill', 'trip', 1);
    }
    await old.prepare('INSERT INTO moments (id,owner_id,friendship_id,title,occurred_on,created_at) VALUES (?,?,?,?,?,?)')
      .run('memory', 'alice', 'alias', 'Private moment', '2026-01-01', 1);
    await old.close();
    old = null;
    for (let pass = 0; pass < 2; pass++) {
      const upgraded = createDatabase({ url });
      try {
        await upgraded.ready;
        const rows = await upgraded.prepare('SELECT id, user_id, note FROM friendships ORDER BY id').all();
        assert.deepEqual(rows, [{ id: 'alias', user_id: null, note: 'Private note for alias' }, { id: 'primary', user_id: 'bob', note: 'Private note for primary' }]);
        assert.deepEqual(await upgraded.prepare('SELECT friendship_id, amount FROM entries ORDER BY amount').all(), [{ friendship_id: 'primary', amount: 40 }, { friendship_id: 'primary', amount: 60 }]);
        assert.deepEqual(await upgraded.prepare('SELECT friendship_id, amount FROM split_shares').all(), [{ friendship_id: 'primary', amount: 100 }]);
        assert.equal((await upgraded.prepare('SELECT payer_friendship_id FROM splits WHERE id = ?').get('bill')).payer_friendship_id, 'primary');
        assert.equal((await upgraded.prepare('SELECT COUNT(*) AS n FROM group_members').get()).n, 1);
        assert.equal((await upgraded.prepare('SELECT friendship_id FROM moments WHERE id = ?').get('memory')).friendship_id, 'alias');
        await assert.rejects(upgraded.prepare('UPDATE friendships SET user_id = ? WHERE id = ?').run('bob', 'alias'), /UNIQUE/);
      } finally { await upgraded.close(); }
    }
  } finally { await old?.close(); await fs.rm(directory, { recursive: true, force: true }); }
});

test('legacy refresh tokens gain distinct device lineages without changing existing credentials', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'udhaar-session-migration-'));
  const url = `file:${path.join(directory, 'legacy.db')}`;
  const legacy = createClient({ url });
  try {
    await legacy.execute('CREATE TABLE refresh_tokens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT UNIQUE, created_at INTEGER, expires_at INTEGER, revoked_at INTEGER)');
    for (const id of ['phone_one', 'phone_two']) await legacy.execute({ sql: 'INSERT INTO refresh_tokens (id,user_id,token_hash,created_at,expires_at) VALUES (?,?,?,?,?)', args: [id, 'user', `hash_${id}`, 1, 1000] });
    await legacy.close();
    const upgraded = createDatabase({ url });
    try {
      await upgraded.ready;
      const tokens = await upgraded.prepare('SELECT id, session_id, token_hash FROM refresh_tokens ORDER BY id').all();
      assert.deepEqual(tokens, [
        { id: 'phone_one', session_id: 'phone_one', token_hash: 'hash_phone_one' },
        { id: 'phone_two', session_id: 'phone_two', token_hash: 'hash_phone_two' },
      ]);
    } finally { await upgraded.close(); }
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('database rejects negative debt writes and case-variant email duplicates', async () => {
  const isolated = createDatabase({ url: 'file::memory:' });
  try {
    await isolated.ready;
    await isolated.prepare('INSERT INTO users (id,name,email,password_hash,created_at,last_seen_at) VALUES (?,?,?,?,?,?)')
      .run('first', 'First', 'Mixed@Example.test', 'hash', 1, 1);
    await assert.rejects(isolated.prepare('INSERT INTO users (id,name,email,password_hash,created_at,last_seen_at) VALUES (?,?,?,?,?,?)')
      .run('second', 'Second', 'mixed@example.test', 'hash', 1, 1), /email already registered/);
    await isolated.prepare('INSERT INTO friendships (id,owner_id,handle,name,created_at) VALUES (?,?,?,?,?)').run('friend', 'first', 'friend', 'Friend', 1);
    await assert.rejects(isolated.prepare('INSERT INTO entries (id,friendship_id,owner_id,kind,direction,amount,created_at) VALUES (?,?,?,?,?,?,?)')
      .run('negative', 'friend', 'first', 'money', 'owed_to_me', -1, 1), /negative entry amount|CHECK/);
  } finally { await isolated.close(); }
});
