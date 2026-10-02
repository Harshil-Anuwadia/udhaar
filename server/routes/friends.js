import { Router } from 'express';
import { db, newId, now } from '../db.js';
import { requireAuth, rateLimit } from '../auth.js';
import { FriendSchema, validate } from '../validate.js';
import { decorate, friendsFor, makeShareToken } from '../ledger.js';
import { publicUser } from './auth.js';

const r = Router();
r.use(requireAuth, rateLimit({ windowMs: 60_000, max: 240, key: 'api' }));

async function getOwnedFriendship(userId, friendshipId) {
  return db.prepare(`SELECT * FROM friendships WHERE id = ? AND owner_id = ?`).get(friendshipId, userId);
}

/** Stable per-friendship invite token (regenerated only on demand). */
export async function inviteTokenFor(friendshipId, ownerId, kind = 'invite') {
  const existing = await db
    .prepare(`SELECT * FROM links WHERE friendship_id = ? AND kind = ?`)
    .get(friendshipId, kind);
  if (existing) return existing.token;
  const token = makeShareToken();
  await db.prepare(
    `INSERT INTO links (id, friendship_id, owner_id, token, kind, created_at) VALUES (?,?,?,?,?,?)`,
  ).run(newId('lk'), friendshipId, ownerId, token, kind, now());
  return token;
}

async function regenerateToken(friendshipId, ownerId, kind = 'invite') {
  await db.prepare(`DELETE FROM links WHERE friendship_id = ? AND kind = ?`).run(friendshipId, kind);
  return inviteTokenFor(friendshipId, ownerId, kind);
}

/* --------------------------------- list ---------------------------------- */

r.get('/', async (req, res) => {
  const all = await friendsFor(req.user.id);
  res.json({
    friends: all,
    withBalance: all.filter((f) => f.net !== 0 || f.openCount > 0),
  });
});

/* ---------------------------------- add ---------------------------------- */

r.post('/', validate(FriendSchema), async (req, res) => {
  const ownerId = req.user.id;
  const name = req.valid.name;
  const handle = (req.valid.handle || '').trim().toLowerCase();

  const dup = await db
    .prepare(`SELECT * FROM friendships WHERE owner_id = ? AND (lower(name) = lower(?) OR handle = ?)`)
    .get(ownerId, name, handle || '\u0000none');
  if (dup) {
    return res.status(409).json({
      error: 'duplicate',
      message: `${dup.name} is already in your ledger.`,
      friendshipId: dup.id,
    });
  }

  const count = (await db.prepare(`SELECT COUNT(*) AS n FROM friendships WHERE owner_id = ?`).get(ownerId)).n;
  const plan = req.user.plan;
  if (plan === 'free' && count >= 8) {
    return res.status(402).json({
      error: 'limit_reached',
      message: 'Free ledgers hold 8 people. Go Plus for unlimited.',
      upsell: 'friends',
    });
  }

  // If they typed a handle that belongs to a real user, link immediately.
  let linkedUserId = null;
  if (handle) {
    const target = await db.prepare(`SELECT id FROM users WHERE handle = ? AND id != ?`).get(handle, ownerId);
    if (target) linkedUserId = target.id;
  }

  const id = newId('f');
  await db.prepare(
    `INSERT INTO friendships (id, owner_id, user_id, handle, name, avatar_seed, note, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    ownerId,
    linkedUserId,
    handle || `f_${id.slice(-6)}`,
    name,
    Math.floor(Math.random() * 1e6),
    req.valid.note || null,
    now(),
  );

  const token = await inviteTokenFor(id, ownerId);
  if (linkedUserId) await mirrorFriendship(ownerId, id, linkedUserId);

  const created = await db.prepare(`SELECT * FROM friendships WHERE id = ?`).get(id);
  res.status(201).json({ friend: await decorate(created), inviteToken: token });
});

/**
 * Create the reciprocal friendship row for the other user so both sides share
 * one ledger, and cross-link the two rows.
 */
export async function mirrorFriendship(inviterId, inviterFriendshipId, inviteeId) {
  const inviter = await db.prepare(`SELECT * FROM users WHERE id = ?`).get(inviterId);
  const row = await db.prepare(`SELECT * FROM friendships WHERE id = ?`).get(inviterFriendshipId);
  if (!inviter || !row) return null;

  let mine = await db
    .prepare(`SELECT * FROM friendships WHERE owner_id = ? AND user_id = ?`)
    .get(inviteeId, inviterId);

  if (!mine) {
    const id = newId('f');
    await db.prepare(
      `INSERT INTO friendships (id, owner_id, user_id, handle, name, avatar_seed, note, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      inviteeId,
      inviterId,
      inviter.handle,
      inviter.name,
      inviter.avatar_seed,
      `Came in through your link · they call you “${row.name}”`,
      now(),
    );
    mine = await db.prepare(`SELECT * FROM friendships WHERE id = ?`).get(id);
  }

  await db.prepare(`UPDATE friendships SET user_id = ? WHERE id = ?`).run(inviteeId, inviterFriendshipId);
  await db.prepare(
    `INSERT INTO events (id, user_id, friendship_id, type, body, created_at) VALUES (?,?,?,?,?,?)`,
  ).run(
    newId('ev'),
    inviterId,
    inviterFriendshipId,
    'friend_joined',
    `${mine.name} joined Udhaar. Your ledger is now live on both sides.`,
    now(),
  );
  return mine;
}

/* ------------------------------ single friend ---------------------------- */

r.get('/:id', async (req, res) => {
  const f = await getOwnedFriendship(req.user.id, req.params.id);
  if (!f) return res.status(404).json({ error: 'not_found', message: 'No such person in your ledger.' });

  const entryRows = await db
    .prepare(`SELECT * FROM entries WHERE friendship_id = ? ORDER BY created_at DESC, rowid DESC`)
    .all(f.id);
  const entries = entryRows.map(hydrateEntry);

  const settled = entries.filter((e) => e.status === 'settled');
  const history = {
    settledCount: settled.length,
    settledAmount: settled.reduce((s, e) => s + (e.kind === 'money' ? e.amount : 0), 0),
    lendsToYou: entries.filter((e) => e.direction === 'owed_to_me').length,
    youLend: entries.filter((e) => e.direction === 'owed_by_me').length,
    firstAt: entries.length ? entries[entries.length - 1].createdAt : null,
    reminders: entries.reduce((s, e) => s + e.remindCount, 0),
  };

  res.json({
    friend: await decorate(f),
    entries,
    history,
    inviteToken: await inviteTokenFor(f.id, req.user.id),
  });
});

r.patch('/:id', async (req, res) => {
  const f = await getOwnedFriendship(req.user.id, req.params.id);
  if (!f) return res.status(404).json({ error: 'not_found', message: 'No such person.' });
  const { name, note } = req.body || {};
  await db.prepare(`UPDATE friendships SET name = COALESCE(?, name), note = ? WHERE id = ?`).run(
    typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : null,
    typeof note === 'string' ? note.trim().slice(0, 120) : f.note,
    f.id,
  );
  res.json({ friend: await decorate(await db.prepare(`SELECT * FROM friendships WHERE id = ?`).get(f.id)) });
});

r.delete('/:id', async (req, res) => {
  const f = await getOwnedFriendship(req.user.id, req.params.id);
  if (!f) return res.status(404).json({ error: 'not_found', message: 'No such person.' });
  const open = await db
    .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(amount),0) AS s FROM entries WHERE friendship_id = ? AND status='open'`)
    .get(f.id);
  const otherOwnerId = f.user_id;
  await db.prepare(`DELETE FROM friendships WHERE id = ?`).run(f.id);
  // Unlink the other side's row but keep their data intact.
  if (otherOwnerId) {
    await db.prepare(`UPDATE friendships SET user_id = NULL, note = COALESCE(note,?) WHERE owner_id = ? AND user_id = ?`)
      .run('They removed their side of the ledger.', otherOwnerId, req.user.id);
  }
  res.json({ ok: true, removedOpenEntries: open.n });
});

r.post('/:id/reinvite', async (req, res) => {
  const f = await getOwnedFriendship(req.user.id, req.params.id);
  if (!f) return res.status(404).json({ error: 'not_found', message: 'No such person.' });
  res.json({ inviteToken: await regenerateToken(f.id, req.user.id) });
});

/* ---------------------------- link claims -------------------------------- */

r.post('/link/:token/claim', async (req, res) => {
  const link = await db.prepare(`SELECT * FROM links WHERE token = ?`).get(req.params.token);
  if (!link) return res.status(404).json({ error: 'not_found', message: 'That link is dead.' });
  if (link.expires_at && link.expires_at < now()) {
    return res.status(410).json({ error: 'expired', message: 'That link expired.' });
  }
  if (link.owner_id === req.user.id) {
    return res.status(400).json({ error: 'self', message: 'That’s your own link.' });
  }
  const mine = await mirrorFriendship(link.owner_id, link.friendship_id, req.user.id);
  await db.prepare(`UPDATE links SET claimed_by = ?, claimed_at = ? WHERE id = ?`).run(req.user.id, now(), link.id);

  if (link.kind === 'entry' && link.entry_id) {
    const e = await db.prepare(`SELECT * FROM entries WHERE id = ?`).get(link.entry_id);
    if (e && e.status === 'open') {
      await db.prepare(`UPDATE entries SET confirmed_at = ? WHERE id = ?`).run(now(), e.id);
      await db.prepare(
        `INSERT INTO events (id, user_id, friendship_id, entry_id, type, body, created_at) VALUES (?,?,?,?,?,?,?)`,
      ).run(
        newId('ev'),
        link.owner_id,
        e.friendship_id,
        e.id,
        'entry_confirmed',
        `${mine.name} confirmed “${e.note || 'that entry'}”. No arguments.`,
        now(),
      );
    }
  }

  const inviter = await db.prepare(`SELECT * FROM users WHERE id = ?`).get(link.owner_id);
  res.json({ ok: true, inviter: await publicUser(inviter), friend: await decorate(mine) });
});

/* -------------------------------- helpers -------------------------------- */

export function hydrateEntry(e) {
  return {
    id: e.id,
    friendshipId: e.friendship_id,
    kind: e.kind,
    direction: e.direction,
    amount: e.amount,
    note: e.note,
    status: e.status,
    dueAt: e.due_at,
    groupId: e.group_id,
    createdAt: e.created_at,
    settledAt: e.settled_at,
    confirmedAt: e.confirmed_at,
    remindCount: e.remind_count,
    lastRemindAt: e.last_remind_at,
    pinned: !!e.pinned,
    photo: e.photo || null,
    overdue: !!e.due_at && e.status === 'open' && e.due_at < now(),
    ageDays: Math.max(0, Math.floor((now() - e.created_at) / 86400000)),
  };
}

export default r;
