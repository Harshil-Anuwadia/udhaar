import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, newId, now } from './db.js';

function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(process.env.DATA_DIR || path.resolve(process.cwd(), 'data'), '.jwt_secret');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch {}
  const fresh = crypto.randomBytes(48).toString('hex');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, fresh, { mode: 0o600 });
  } catch {}
  return fresh;
}

const SECRET = loadSecret();

const ACCESS_TTL = '7d';
export const REFRESH_TTL_MS = 1000 * 60 * 60 * 24 * 90;

export const hashSecret = (s) => bcrypt.hashSync(s, 10);
export const verifySecret = (s, h) => {
  try {
    return bcrypt.compareSync(s, h);
  } catch {
    return false;
  }
};

export function signAccess(user) {
  return jwt.sign({ sub: user.id, h: user.handle }, SECRET, { expiresIn: ACCESS_TTL });
}

export async function issueRefresh(userId) {
  const raw = crypto.randomBytes(32).toString('base64url');
  await db.prepare(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, created_at, expires_at) VALUES (?,?,?,?,?)`,
  ).run(newId('rt'), userId, sha(raw), now(), now() + REFRESH_TTL_MS);
  return raw;
}

export async function rotateRefresh(raw) {
  const row = await db
    .prepare(`SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL`)
    .get(sha(raw));
  if (!row || row.expires_at < now()) return null;
  await db.prepare(`UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?`).run(now(), row.id);
  return { userId: row.user_id, next: await issueRefresh(row.user_id) };
}

export async function revokeAll(userId) {
  await db.prepare(`UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`).run(
    now(),
    userId,
  );
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export async function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearer || req.cookies?.at || null;
  if (!token) return res.status(401).json({ error: 'unauthenticated', message: 'Sign in to continue.' });
  try {
    const payload = jwt.verify(token, SECRET);
    const user = await db.prepare(`SELECT * FROM users WHERE id = ?`).get(payload.sub);
    if (!user) return res.status(401).json({ error: 'unauthenticated', message: 'Session expired.' });
    req.user = user;
    await db.prepare(`UPDATE users SET last_seen_at = ? WHERE id = ?`).run(now(), user.id);
    next();
  } catch {
    return res.status(401).json({ error: 'unauthenticated', message: 'Session expired. Sign in again.' });
  }
}

/* ---------------- rate limiting (in-memory sliding window) ---------------- */

const buckets = new Map();
setInterval(() => {
  const t = now();
  for (const [k, v] of buckets) if (v.reset < t) buckets.delete(k);
}, 60_000).unref?.();

export function rateLimit({ windowMs = 60_000, max = 120, key = 'api' } = {}) {
  return (req, res, next) => {
    const t = now();
    const id = `${key}:${req.ip}:${req.user?.id ?? ''}`;
    let b = buckets.get(id);
    if (!b || b.reset < t) {
      b = { count: 0, reset: t + windowMs };
      buckets.set(id, b);
    }
    b.count += 1;
    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - b.count)));
    if (b.count > max) {
      res.set('Retry-After', String(Math.ceil((b.reset - t) / 1000)));
      return res.status(429).json({
        error: 'rate_limited',
        message: 'Too many attempts. Give it a minute.',
        retryAfter: Math.ceil((b.reset - t) / 1000),
      });
    }
    next();
  };
}
