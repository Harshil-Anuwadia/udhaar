import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { DATA_DIR } from './paths.js';

const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, handle TEXT UNIQUE, name TEXT NOT NULL, phone TEXT UNIQUE, email TEXT UNIQUE,
  password_hash TEXT NOT NULL, avatar_seed INTEGER NOT NULL DEFAULT 0, avatar_path TEXT,
  currency TEXT NOT NULL DEFAULT 'INR', honor_score REAL NOT NULL DEFAULT 50,
  honor_n INTEGER NOT NULL DEFAULT 0, onboarded INTEGER NOT NULL DEFAULT 0,
  plan TEXT NOT NULL DEFAULT 'free', theme TEXT NOT NULL DEFAULT 'system',
  is_demo INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS friendships (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id TEXT NULL REFERENCES users(id) ON DELETE CASCADE, handle TEXT NOT NULL, name TEXT NOT NULL,
  avatar_seed INTEGER NOT NULL DEFAULT 0, note TEXT, created_at INTEGER NOT NULL, UNIQUE(owner_id, handle)
);
CREATE INDEX IF NOT EXISTS idx_friendships_owner ON friendships(owner_id);
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY, friendship_id TEXT NOT NULL REFERENCES friendships(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('money','favor','gesture')),
  direction TEXT NOT NULL CHECK (direction IN ('owed_to_me','owed_by_me')),
  amount INTEGER NOT NULL DEFAULT 0, note TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','settled','disputed','void')),
  due_at INTEGER, group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  split_id TEXT REFERENCES splits(id) ON DELETE CASCADE, created_at INTEGER NOT NULL,
  settled_at INTEGER, confirmed_at INTEGER, remind_count INTEGER NOT NULL DEFAULT 0,
  last_remind_at INTEGER, pinned INTEGER NOT NULL DEFAULT 0, photo TEXT
);
CREATE INDEX IF NOT EXISTS idx_entries_friendship ON entries(friendship_id, status);
CREATE INDEX IF NOT EXISTS idx_entries_owner ON entries(owner_id, created_at);
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'INR', avatar_seed INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  friendship_id TEXT NOT NULL REFERENCES friendships(id) ON DELETE CASCADE,
  weight REAL NOT NULL DEFAULT 1, joined_at INTEGER NOT NULL, PRIMARY KEY (group_id, friendship_id)
);
CREATE TABLE IF NOT EXISTS splits (
  id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, payer_kind TEXT NOT NULL DEFAULT 'me',
  payer_friendship_id TEXT REFERENCES friendships(id) ON DELETE SET NULL, title TEXT NOT NULL,
  amount INTEGER NOT NULL, method TEXT NOT NULL DEFAULT 'equal', created_at INTEGER NOT NULL,
  note TEXT, me_share INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_splits_group ON splits(group_id, created_at);
CREATE TABLE IF NOT EXISTS split_shares (
  split_id TEXT NOT NULL REFERENCES splits(id) ON DELETE CASCADE,
  friendship_id TEXT NOT NULL REFERENCES friendships(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL, PRIMARY KEY (split_id, friendship_id)
);
CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY, friendship_id TEXT NOT NULL REFERENCES friendships(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, token TEXT NOT NULL, kind TEXT NOT NULL,
  entry_id TEXT REFERENCES entries(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, expires_at INTEGER,
  claimed_by TEXT REFERENCES users(id) ON DELETE SET NULL, claimed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_links_token ON links(token);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friendship_id TEXT REFERENCES friendships(id) ON DELETE CASCADE,
  entry_id TEXT REFERENCES entries(id) ON DELETE CASCADE, type TEXT NOT NULL, body TEXT,
  read INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, read, created_at);
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER
);
CREATE TABLE IF NOT EXISTS invite_codes (
  code TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  used_by TEXT REFERENCES users(id) ON DELETE SET NULL, created_at INTEGER NOT NULL, used_at INTEGER
);
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY, content_type TEXT NOT NULL, data BLOB NOT NULL, created_at INTEGER NOT NULL
);
`;

function bindStatement(client, sql, waitForReady = async () => {}) {
  const execute = async (args = []) => {
    await waitForReady();
    const result = await client.execute({ sql, args });
    const columns = result.columns || [];
    const rows = result.rows.map((row) => Object.fromEntries(columns.map((column, i) => [column, row[i]])));
    return { rows, meta: result.rowsAffected ? { changes: result.rowsAffected } : result.lastInsertRowid ? { lastInsertRowid: result.lastInsertRowid } : {} };
  };
  return {
    async all(...args) { return (await execute(args)).rows; },
    async get(...args) { return (await execute(args)).rows[0]; },
    async run(...args) { return (await execute(args)).meta; },
  };
}

function wrapClient(client) {
  let ready;
  const wrapped = {
    get ready() { return ready; },
    prepare(sql) { return bindStatement(client, sql, () => ready); },
    async exec(sql) { await ready; await client.executeMultiple(sql); },
    async transaction(callback) {
      await ready;
      const tx = await client.transaction('write');
      try {
        const value = await callback({ prepare: (sql) => bindStatement(tx, sql), exec: (sql) => tx.executeMultiple(sql) });
        await tx.commit();
        return value;
      } catch (error) {
        await tx.rollback();
        throw error;
      }
    },
    async close() { await client.close(); },
  };
  ready = (async () => {
    await client.execute('PRAGMA foreign_keys = ON');
    await client.executeMultiple(SCHEMA);
    return wrapped;
  })();
  return wrapped;
}

export function createDatabase({ url, authToken } = {}) {
  const targetUrl = url || (process.env.TURSO_DATABASE_URL
    ? process.env.TURSO_DATABASE_URL
    : `file:${path.join(DATA_DIR, 'udhaar.db')}`);
  if (targetUrl.startsWith('file:')) fs.mkdirSync(DATA_DIR, { recursive: true });
  const client = createClient({ url: targetUrl, authToken: authToken || process.env.TURSO_AUTH_TOKEN });
  return wrapClient(client);
}

export const db = createDatabase();

export const newId = (prefix) => `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;
export const newToken = () => crypto.randomBytes(24).toString('base64url');
export const now = () => Date.now();

/** Deterministic, URL-safe short handle from a name. */
export function suggestHandle(name, taken) {
  const base = (name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .slice(0, 14) || 'friend';
  let h = base;
  while (taken(h)) h = `${base}${crypto.randomInt(10, 99)}`;
  return h;
}
