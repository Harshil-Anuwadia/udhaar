import { Router } from 'express';
import { db, newId, now, suggestHandle } from '../db.js';
import { hashSecret, verifySecret, signAccess, issueRefresh, rotateRefresh, revokeAll, requireAuth, rateLimit } from '../auth.js';
import { SignupSchema, LoginSchema, validate } from '../validate.js';
import { computeHonor } from '../ledger.js';

const r = Router();
const authBurst = rateLimit({ windowMs: 15 * 60_000, max: 25, key: 'auth' });

const publicUser = async (u) => ({
  avatarUrl: u.avatar_path || null,
  isDemo: !!u.is_demo,
  id: u.id,
  handle: u.handle,
  name: u.name,
  avatarSeed: u.avatar_seed,
  currency: u.currency,
  theme: u.theme,
  plan: u.plan,
  honorScore: Math.round(u.honor_score),
  honorGrade: (await computeHonor(u.id)).grade,
  onboarded: !!u.onboarded,
  createdAt: u.created_at,
  contact: u.email || u.phone || null,
});

async function issueSession(res, user) {
  const at = signAccess(user);
  const rt = await issueRefresh(user.id);
  res.cookie('rt', rt, { httpOnly: true, sameSite: 'lax', maxAge: 90 * 864e5, path: '/api/auth' });
  res.set('X-Session', `${at}|${rt}`);
  return { token: at, refreshToken: rt };
}

/* --------------------------------- signup -------------------------------- */

r.post('/signup', authBurst, validate(SignupSchema), async (req, res) => {
  const { name, secret, contact, currency, demo } = req.valid;
  const rawHandle = (req.valid.handle || '').trim().toLowerCase();
  const c = (contact || '').trim();

  const handleTaken = async (h) => !!(await db.prepare(`SELECT 1 FROM users WHERE handle = ?`).get(h));
  if (rawHandle && await handleTaken(rawHandle)) {
    return res.status(409).json({ error: 'handle_taken', message: `@${rawHandle} is already taken.`, field: 'handle' });
  }
  let handle = rawHandle || suggestHandle(name, () => false);
  while (!rawHandle && await handleTaken(handle)) handle = `${handle}${Math.floor(10 + Math.random() * 89)}`;

  const isEmail = c.includes('@');
  if (c) {
    const col = isEmail ? 'email' : 'phone';
    if (await db.prepare(`SELECT 1 FROM users WHERE ${col} = ?`).get(c)) {
      return res.status(409).json({ error: 'contact_taken', message: 'That contact is already registered. Sign in instead.', field: 'contact' });
    }
  }

  const id = newId('u');
  await db.prepare(
    `INSERT INTO users (id, handle, name, phone, email, password_hash, avatar_seed, currency, created_at, last_seen_at, is_demo)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    handle,
    name,
    !isEmail && c ? c : null,
    isEmail ? c : null,
    hashSecret(secret),
    Math.floor(Math.random() * 1e6),
    currency,
    now(),
    now(),
    demo ? 1 : 0,
  );

  // Credit any invite code used — and wire the two ledgers together.
  if (req.valid.inviteCode) {
    const inv = await db.prepare(`SELECT * FROM invite_codes WHERE code = ?`).get(req.valid.inviteCode.toUpperCase());
    if (inv && !inv.used_by) {
      await db.prepare(`UPDATE invite_codes SET used_by = ?, used_at = ? WHERE code = ?`).run(id, now(), inv.code);
      const fid = newId('f');
      await db.prepare(
        `INSERT INTO friendships (id, owner_id, user_id, handle, name, avatar_seed, note, created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
      ).run(
        fid,
        inv.owner_id,
        id,
        handle,
        name,
        Math.floor(Math.random() * 1e6),
        'Joined with your invite code',
        now(),
      );
      const { mirrorFriendship } = await import('../routes/friends.js');
      await mirrorFriendship(inv.owner_id, fid, id);
      await db.prepare(`UPDATE links SET claimed_by = ?, claimed_at = ? WHERE friendship_id = ? AND kind = 'invite'`).run(id, now(), fid);
    }
  }

  const user = await db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
  res.status(201).json({ user: await publicUser(user), ...await issueSession(res, user) });
});

/* ---------------------------------- login -------------------------------- */

r.post('/login', authBurst, validate(LoginSchema), async (req, res) => {
  const id = req.valid.id.trim().toLowerCase();
  const row = await db
    .prepare(`SELECT * FROM users WHERE handle = ? OR email = ? OR phone = ?`)
    .get(id.replace(/^@/, ''), id, id);
  if (!row || !verifySecret(req.valid.secret, row.password_hash)) {
    return res.status(401).json({ error: 'bad_credentials', message: 'That handle and passcode don’t match.' });
  }
  res.json({ user: await publicUser(row), ...await issueSession(res, row) });
});

/* --------------------------------- refresh ------------------------------- */

r.post('/refresh', async (req, res) => {
  const raw = req.cookies?.rt || (req.body?.refreshToken ?? '');
  if (!raw) return res.status(401).json({ error: 'unauthenticated', message: 'No session to refresh.' });
  const rotated = await rotateRefresh(raw);
  if (!rotated) return res.status(401).json({ error: 'unauthenticated', message: 'Session expired. Sign in again.' });
  const user = await db.prepare(`SELECT * FROM users WHERE id = ?`).get(rotated.userId);
  if (!user) return res.status(401).json({ error: 'unauthenticated', message: 'Account not found.' });
  res.json({ user: await publicUser(user), ...await issueSession(res, user) });
});

/* --------------------------------- logout -------------------------------- */

r.post('/logout', async (req, res) => {
  const raw = req.cookies?.rt;
  if (raw) {
    const rotated = await rotateRefresh(raw);
    if (rotated) await revokeAll(rotated.userId);
  }
  res.clearCookie('rt', { path: '/api/auth' });
  res.json({ ok: true });
});

/* ---------------------------------- me ----------------------------------- */

r.get('/me', requireAuth, async (req, res) => {
  res.json({ user: await publicUser(req.user) });
});

/* --------------------------- public invite lookup ------------------------- */

r.get('/invite/:token', rateLimit({ windowMs: 60_000, max: 60, key: 'invite' }), async (req, res) => {
  const link = await db.prepare(`SELECT * FROM links WHERE token = ?`).get(req.params.token);
  if (!link) return res.status(404).json({ error: 'not_found', message: 'That link is dead.' });
  if (link.expires_at && link.expires_at < now()) {
    return res.status(410).json({ error: 'expired', message: 'That link expired.' });
  }
  const owner = await db.prepare(`SELECT name, handle, avatar_seed FROM users WHERE id = ?`).get(link.owner_id);
  const friendship = await db.prepare(`SELECT name, handle FROM friendships WHERE id = ?`).get(link.friendship_id);
  let entry = null;
  if (link.entry_id) {
    const e = await db
      .prepare(`SELECT kind, direction, amount, note, status, created_at, photo FROM entries WHERE id = ?`)
      .get(link.entry_id);
    if (e) {
      entry = {
        kind: e.kind,
        amount: e.amount,
        note: e.note,
        status: e.status,
        // From the recipient's perspective the direction flips.
        direction: e.direction === 'owed_to_me' ? 'owed_by_me' : 'owed_to_me',
        createdAt: e.created_at,
        photo: e.photo || null,
      };
    }
  }
  res.json({
    kind: link.kind,
    inviter: owner,
    knownAs: friendship,
    entry,
    claimed: !!link.claimed_by,
  });
});

export default r;
export { publicUser };
