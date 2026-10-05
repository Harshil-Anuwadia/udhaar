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
  plan TEXT NOT NULL DEFAULT 'free', theme TEXT NOT NULL DEFAULT 'light',
  voice_mode TEXT NOT NULL DEFAULT 'neutral' CHECK (voice_mode IN ('neutral','male','female')),
  is_demo INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS friendships (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id TEXT NULL REFERENCES users(id) ON DELETE CASCADE, handle TEXT NOT NULL, name TEXT NOT NULL,
  avatar_seed INTEGER NOT NULL DEFAULT 0, note TEXT, created_at INTEGER NOT NULL, UNIQUE(owner_id, handle)
);
CREATE INDEX IF NOT EXISTS idx_friendships_owner ON friendships(owner_id);
CREATE INDEX IF NOT EXISTS idx_friendships_pair ON friendships(owner_id, user_id);
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
CREATE INDEX IF NOT EXISTS idx_entries_split ON entries(split_id);
CREATE INDEX IF NOT EXISTS idx_entries_group ON entries(group_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_entries_photo ON entries(photo);
CREATE TABLE IF NOT EXISTS moments (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friendship_id TEXT NOT NULL REFERENCES friendships(id) ON DELETE CASCADE,
  title TEXT NOT NULL, note TEXT, occurred_on TEXT NOT NULL,
  photo TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_moments_friendship_date ON moments(friendship_id, occurred_on DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moments_photo ON moments(photo);
CREATE TABLE IF NOT EXISTS item_photos (
  url TEXT PRIMARY KEY,
  entry_id TEXT REFERENCES entries(id) ON DELETE CASCADE,
  moment_id TEXT REFERENCES moments(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  CHECK ((entry_id IS NOT NULL) != (moment_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_item_photos_entry ON item_photos(entry_id, position);
CREATE INDEX IF NOT EXISTS idx_item_photos_moment ON item_photos(moment_id, position);
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
CREATE INDEX IF NOT EXISTS idx_group_members_friendship ON group_members(friendship_id);
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
CREATE INDEX IF NOT EXISTS idx_split_shares_split ON split_shares(split_id);
CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY, friendship_id TEXT NOT NULL REFERENCES friendships(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, token TEXT NOT NULL, kind TEXT NOT NULL,
  entry_id TEXT REFERENCES entries(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, expires_at INTEGER,
  claimed_by TEXT REFERENCES users(id) ON DELETE SET NULL, claimed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_links_token ON links(token);
CREATE INDEX IF NOT EXISTS idx_links_friendship ON links(friendship_id, kind);
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
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
CREATE TABLE IF NOT EXISTS invite_codes (
  code TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  used_by TEXT REFERENCES users(id) ON DELETE SET NULL, created_at INTEGER NOT NULL, used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_invite_codes_owner ON invite_codes(owner_id);
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY, content_type TEXT NOT NULL, data BLOB NOT NULL, created_at INTEGER NOT NULL,
  owner_id TEXT
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
    const columns = await client.execute('PRAGMA table_info(users)');
    if (!columns.rows.some((row) => row.name === 'voice_mode')) {
      try {
        await client.execute("ALTER TABLE users ADD COLUMN voice_mode TEXT NOT NULL DEFAULT 'neutral'");
      } catch (error) {
        // Concurrent cold starts can both observe the old schema.
        if (!String(error?.message || '').includes('duplicate column name')) throw error;
      }
    }
    if (!columns.rows.some((row) => row.name === 'avatar_path')) {
      try {
        await client.execute('ALTER TABLE users ADD COLUMN avatar_path TEXT');
      } catch (error) {
        if (!String(error?.message || '').includes('duplicate column name')) throw error;
      }
    }
    await client.execute('CREATE INDEX IF NOT EXISTS idx_users_avatar_path ON users(avatar_path)');
    const mediaColumns = await client.execute('PRAGMA table_info(media)');
    const needsMediaOwnerMigration = !mediaColumns.rows.some((row) => row.name === 'owner_id');
    if (needsMediaOwnerMigration) {
      try {
        await client.execute('ALTER TABLE media ADD COLUMN owner_id TEXT');
      } catch (error) {
        if (!String(error?.message || '').includes('duplicate column name')) throw error;
      }
      await client.execute("UPDATE media SET owner_id = (SELECT id FROM users WHERE avatar_path = '/api/media/' || media.id LIMIT 1) WHERE owner_id IS NULL AND EXISTS (SELECT 1 FROM users WHERE avatar_path = '/api/media/' || media.id)");
      await client.execute("UPDATE media SET owner_id = (SELECT owner_id FROM entries WHERE photo = '/api/media/' || media.id LIMIT 1) WHERE owner_id IS NULL AND EXISTS (SELECT 1 FROM entries WHERE photo = '/api/media/' || media.id)");
    }
    await client.execute('CREATE INDEX IF NOT EXISTS idx_media_owner ON media(owner_id)');
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
