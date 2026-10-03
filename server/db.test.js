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
