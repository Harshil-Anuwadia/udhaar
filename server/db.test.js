import test from 'node:test';
import assert from 'node:assert/strict';
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
