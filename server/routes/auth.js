import { Router } from 'express';
import { db, newId, now, suggestHandle } from '../db.js';
import { hashSecret, verifySecret, signAccess, issueRefresh, rotateRefresh, revokeRefresh, requireAuth, rateLimit } from '../auth.js';
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
  theme: u.theme === 'system' ? 'light' : u.theme,
  voiceMode: u.voice_mode || 'neutral',
  plan: u.plan,
  honorScore: Math.round(u.honor_score),
  honorGrade: (await computeHonor(u.id)).grade,
  onboarded: !!u.onboarded,
  createdAt: u.created_at,
  contact: u.email || u.phone || null,
});

function setMediaSession(req, res, token) {
  res.cookie('at', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    path: '/api/media',
    maxAge: 7 * 864e5,
  });
}

async function issueSession(req, res, user, successor = null) {
  const at = signAccess(user);
  const rt = successor || await issueRefresh(user.id);
  setMediaSession(req, res, at);
  res.cookie('rt', rt, { httpOnly: true, sameSite: 'lax', maxAge: 90 * 864e5, path: '/api/auth', secure: req.secure });
  res.set('X-Session', `${at}|${rt}`);
  return { token: at, refreshToken: rt };
}

/* --------------------------------- signup -------------------------------- */

r.post('/signup', authBurst, validate(SignupSchema), async (req, res) => {
  const { name, secret, contact, currency, demo } = req.valid;
  const rawHandle = (req.valid.handle || '').trim().toLowerCase();
  const trimmedContact = (contact || '').trim();
  const isEmail = trimmedContact.includes('@');
  const c = isEmail ? trimmedContact.toLowerCase() : trimmedContact;

  const handleTaken = async (h) => !!(await db.prepare(`SELECT 1 FROM users WHERE handle = ?`).get(h));
  if (rawHandle && await handleTaken(rawHandle)) {
    return res.status(409).json({ error: 'handle_taken', message: `@${rawHandle} is already taken.`, field: 'handle' });
  }
  let handle = rawHandle || suggestHandle(name, () => false);
  if (!rawHandle) {
    let _attempts = 0;
    while (await handleTaken(handle) && _attempts < 20) {
      handle = `${suggestHandle(name, () => false)}${Math.floor(10 + Math.random() * 89)}`;
      _attempts++;
    }
  }

  if (c) {
    const col = isEmail ? 'email' : 'phone';
    if (await db.prepare(`SELECT 1 FROM users WHERE ${col} = ? COLLATE NOCASE`).get(c)) {
      return res.status(409).json({ error: 'contact_taken', message: 'That contact is already registered. Sign in instead.', field: 'contact' });
    }
  }

  const id = newId('u');
  const passwordHash = hashSecret(secret);
  try {
    await db.transaction(async (tx) => {

      await tx.prepare(
        `INSERT INTO users (id, handle, name, phone, email, password_hash, avatar_seed, currency, theme, created_at, last_seen_at, is_demo)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        id,
        handle,
        name,
        !isEmail && c ? c : null,
        isEmail ? c : null,
        passwordHash,
        Math.floor(Math.random() * 1e6),
        currency,
        'light',
        now(),
        now(),
        demo ? 1 : 0,
      );

      // Credit any invite code used — and wire the two ledgers together.
      if (req.valid.inviteCode) {
        const inv = await tx.prepare(`SELECT * FROM invite_codes WHERE code = ?`).get(req.valid.inviteCode.toUpperCase());
        if (inv && !inv.used_by) {
          await tx.prepare(`UPDATE invite_codes SET used_by = ?, used_at = ? WHERE code = ?`).run(id, now(), inv.code);
          const conflict = await tx.prepare('SELECT id FROM friendships WHERE owner_id = ? AND handle = ?').get(inv.owner_id, handle);
          if (conflict) {
            const error = new Error('The inviter already has a private page with this handle. Sign up without this code, then link the chosen page explicitly.');
            error.code = 'invite_conflict';
            throw error;
          }
          const fid = newId('f');
          await tx.prepare(
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
          await mirrorFriendship(inv.owner_id, fid, id, tx);
          await tx.prepare(`UPDATE links SET claimed_by = ?, claimed_at = ? WHERE friendship_id = ? AND kind = 'invite'`).run(id, now(), fid);
        }
      }

    });
  } catch (error) {
    if (['invite_conflict', 'currency_mismatch', 'duplicate_pair'].includes(error.code)) {
      return res.status(409).json({ error: error.code, message: error.message });
    }
    // Uniqueness also protects concurrent signups after the friendly precheck.
    if (/UNIQUE constraint|email already registered/.test(String(error.message))) {
      return res.status(409).json({ error: 'signup_conflict', message: 'That handle or contact is already registered.', field: 'contact' });
    }
    throw error;
  }

  const user = await db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
  res.status(201).json({ user: await publicUser(user), ...await issueSession(req, res, user) });
});

/* ---------------------------------- login -------------------------------- */

r.post('/login', authBurst, validate(LoginSchema), async (req, res) => {
  const identifier = req.valid.id.trim();
  const id = identifier.toLowerCase();
  const rows = id.includes('@') && !id.startsWith('@')
    ? await db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').all(id)
    : await db.prepare('SELECT * FROM users WHERE handle = ? OR phone = ?').all(id.replace(/^@/, ''), identifier);
  if (rows.length > 1) return res.status(409).json({ error: 'ambiguous_contact', message: 'Use your unique handle to sign in.' });
  const row = rows[0];
  if (!row || !verifySecret(req.valid.secret, row.password_hash)) {
    return res.status(401).json({ error: 'bad_credentials', message: 'That handle and passcode don’t match.' });
  }
  res.json({ user: await publicUser(row), ...await issueSession(req, res, row) });
});

/* --------------------------------- refresh ------------------------------- */

r.post('/refresh', async (req, res) => {
  const raw = req.cookies?.rt || (req.body?.refreshToken ?? '');
  if (!raw) return res.status(401).json({ error: 'unauthenticated', message: 'No session to refresh.' });
  const rotated = await rotateRefresh(raw);
  if (!rotated) return res.status(401).json({ error: 'unauthenticated', message: 'Session expired. Sign in again.' });
  const user = await db.prepare(`SELECT * FROM users WHERE id = ?`).get(rotated.userId);
  if (!user) return res.status(401).json({ error: 'unauthenticated', message: 'Account not found.' });
  res.json({ user: await publicUser(user), ...await issueSession(req, res, user, rotated.next) });
});

/* --------------------------------- logout -------------------------------- */

r.post('/logout', async (req, res) => {
  await revokeRefresh(req.cookies?.rt || req.body?.refreshToken);
  res.clearCookie('rt', { path: '/api/auth' });
  res.clearCookie('at', { path: '/api/media' });
  res.json({ ok: true });
});

/* ---------------------------------- me ----------------------------------- */

r.get('/me', requireAuth, async (req, res) => {
  setMediaSession(req, res, signAccess(req.user));
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
      .prepare(`SELECT owner_id, kind, direction, amount, note, status, created_at, photo FROM entries WHERE id = ?`)
      .get(link.entry_id);
    if (e) {
      entry = {
        kind: e.kind,
        amount: e.amount,
        note: e.note,
        status: e.status,
        // Flip only when the link creator also created the entry.
        direction: link.owner_id === e.owner_id
          ? (e.direction === 'owed_to_me' ? 'owed_by_me' : 'owed_to_me')
          : e.direction,
        createdAt: e.created_at,
        // Receipt bytes are private until the invitee accepts and gains ledger access.
        photo: null,
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
