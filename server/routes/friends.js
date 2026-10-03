import { Router } from 'express';
import { db, newId, now } from '../db.js';
import { requireAuth, rateLimit } from '../auth.js';
import { FriendSchema, MomentSchema, validate } from '../validate.js';
import { selectedPhotoInputs, savePhotoSet, attachPhotoSet, photoMapFor, photosForItem, unlinkUrls } from '../photos.js';
import { decorate, friendsFor, makeShareToken, sharedEntriesFor, syncHonor } from '../ledger.js';
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

  const id = newId('f');
  await db.prepare(
    `INSERT INTO friendships (id, owner_id, user_id, handle, name, avatar_seed, note, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    ownerId,
    null,
    handle || `f_${id.slice(-6)}`,
    name,
    Math.floor(Math.random() * 1e6),
    req.valid.note || null,
    now(),
  );

  const token = await inviteTokenFor(id, ownerId);

  const created = await db.prepare(`SELECT * FROM friendships WHERE id = ?`).get(id);
  res.status(201).json({ friend: await decorate(created), inviteToken: token });
});

/**
 * Create the reciprocal friendship row for the other user so both sides share
 * one ledger, and cross-link the two rows.
 */
export async function mirrorFriendship(inviterId, inviterFriendshipId, inviteeId, storage = db, existingFriendshipId = null) {
  const inviter = await storage.prepare(`SELECT * FROM users WHERE id = ?`).get(inviterId);
  const row = await storage.prepare(`SELECT * FROM friendships WHERE id = ?`).get(inviterFriendshipId);
  if (!inviter || !row) return null;
  if (row.owner_id !== inviterId || (row.user_id && row.user_id !== inviteeId)) {
    const error = new Error('This ledger is already linked to someone else.');
    error.code = 'already_linked';
    throw error;
  }

  let mine = await storage
    .prepare(`SELECT * FROM friendships WHERE owner_id = ? AND user_id = ?`)
    .get(inviteeId, inviterId);

  if (existingFriendshipId) {
    const selected = await storage.prepare(`SELECT * FROM friendships WHERE id = ? AND owner_id = ?`)
      .get(existingFriendshipId, inviteeId);
    if (!selected || (selected.user_id && selected.user_id !== inviterId) || (mine && mine.id !== selected.id)) {
      const error = new Error('That person cannot be linked to this invite.');
      error.code = 'invalid_friend';
      throw error;
    }
    if (!mine) {
      await storage.prepare(`UPDATE friendships SET user_id = ? WHERE id = ?`)
        .run(inviterId, selected.id);
      mine = await storage.prepare(`SELECT * FROM friendships WHERE id = ?`).get(selected.id);
    }
  }

  if (!mine) {
    const id = newId('f');
    const handleTaken = await storage.prepare(`SELECT id FROM friendships WHERE owner_id = ? AND handle = ?`)
      .get(inviteeId, inviter.handle);
    await storage.prepare(
      `INSERT INTO friendships (id, owner_id, user_id, handle, name, avatar_seed, note, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      inviteeId,
      inviterId,
      handleTaken ? `f_${id.slice(-6)}` : inviter.handle,
      inviter.name,
      inviter.avatar_seed,
      `Came in through your link · they call you “${row.name}”`,
      now(),
    );
    mine = await storage.prepare(`SELECT * FROM friendships WHERE id = ?`).get(id);
  }

  if (!row.user_id) {
    await storage.prepare(`UPDATE friendships SET user_id = ? WHERE id = ?`).run(inviteeId, inviterFriendshipId);
    await storage.prepare(
      `INSERT INTO events (id, user_id, friendship_id, type, body, created_at) VALUES (?,?,?,?,?,?)`,
    ).run(
      newId('ev'), inviterId, inviterFriendshipId, 'friend_joined',
      `${mine.name} joined Udhaar. Your ledger is now live on both sides.`, now(),
    );
  }
  return mine;
}

/* ------------------------------ single friend ---------------------------- */

r.get('/:id', async (req, res) => {
  const f = await getOwnedFriendship(req.user.id, req.params.id);
  if (!f) return res.status(404).json({ error: 'not_found', message: 'No such person in your ledger.' });

  const entryRows = await sharedEntriesFor(f);
  const entryPhotos = await photoMapFor('entry', entryRows.map((entry) => entry.id));
  const entries = entryRows.map((entry) => hydrateEntry({ ...entry, photos: photosForItem(entryPhotos, entry) }));

  const settled = entries.filter((e) => e.status === 'settled');
  const history = {
    settledCount: settled.length,
    settledAmount: settled.reduce((s, e) => s + (e.kind === 'money' ? e.amount : 0), 0),
    lendsToYou: entries.filter((e) => e.direction === 'owed_to_me').length,
    youLend: entries.filter((e) => e.direction === 'owed_by_me').length,
    firstAt: entries.length ? entries[entries.length - 1].createdAt : null,
    reminders: entries.reduce((s, e) => s + e.remindCount, 0),
  };

  const momentRows = await db.prepare(`
    SELECT id, title, note, occurred_on AS occurredOn, photo, created_at AS createdAt
    FROM moments WHERE friendship_id = ? AND owner_id = ?
    ORDER BY occurred_on DESC, created_at DESC LIMIT 50
  `).all(f.id, req.user.id);
  const momentPhotos = await photoMapFor('moment', momentRows.map((moment) => moment.id));
  const moments = momentRows.map((moment) => ({ ...moment, photos: photosForItem(momentPhotos, moment) }));

  res.json({
    friend: await decorate(f),
    entries,
    moments,
    history,
    inviteToken: await inviteTokenFor(f.id, req.user.id),
  });
});

r.post('/:id/moments', validate(MomentSchema), async (req, res) => {
  const friend = await getOwnedFriendship(req.user.id, req.params.id);
  if (!friend) return res.status(404).json({ error: 'not_found', message: 'No such person.' });
  const id = newId('m');
  const photos = await savePhotoSet(selectedPhotoInputs(req.valid), req.user.id);
  if (!photos) return res.status(400).json({ error: 'bad_image', message: 'Use up to four JPG, PNG, or WebP images under 3 MB each.' });
  const createdAt = now();
  try {
    await db.transaction(async (tx) => {
      await tx.prepare(`INSERT INTO moments (id, owner_id, friendship_id, title, note, occurred_on, photo, created_at)
        VALUES (?,?,?,?,?,?,?,?)`)
        .run(id, req.user.id, friend.id, req.valid.title, req.valid.note || null, req.valid.occurredOn, photos[0] || null, createdAt);
      await attachPhotoSet('moment', id, photos, tx);
    });
  } catch (error) {
    await unlinkUrls(photos);
    throw error;
  }
  res.status(201).json({ moment: {
    id, title: req.valid.title, note: req.valid.note || null,
    occurredOn: req.valid.occurredOn, photo: photos[0] || null, photos, createdAt,
  } });
});

r.delete('/:id/moments/:momentId', async (req, res) => {
  const moment = await db.prepare(`SELECT m.photo FROM moments m JOIN friendships f ON f.id = m.friendship_id
    WHERE m.id = ? AND m.friendship_id = ? AND m.owner_id = ? AND f.owner_id = ?`)
    .get(req.params.momentId, req.params.id, req.user.id, req.user.id);
  if (!moment) return res.status(404).json({ error: 'not_found', message: 'No such moment.' });
  const photos = photosForItem(await photoMapFor('moment', [req.params.momentId]), { id: req.params.momentId, photo: moment.photo });
  await db.prepare(`DELETE FROM moments WHERE id = ? AND owner_id = ?`).run(req.params.momentId, req.user.id);
  await unlinkUrls(photos);
  res.json({ ok: true });
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
  await db.transaction(async (tx) => {
    await tx.prepare(`DELETE FROM media WHERE owner_id = ? AND ('/api/media/' || id) IN (
      SELECT photo FROM entries WHERE friendship_id = ? AND photo IS NOT NULL
      UNION SELECT photo FROM moments WHERE friendship_id = ? AND photo IS NOT NULL
      UNION SELECT ip.url FROM item_photos ip JOIN entries e ON e.id = ip.entry_id WHERE e.friendship_id = ?
      UNION SELECT ip.url FROM item_photos ip JOIN moments m ON m.id = ip.moment_id WHERE m.friendship_id = ?
    )`).run(req.user.id, f.id, f.id, f.id, f.id);
    await tx.prepare(`DELETE FROM friendships WHERE id = ?`).run(f.id);
    // Unlink the other side's row but keep their data intact.
    if (otherOwnerId) {
      await tx.prepare(`UPDATE friendships SET user_id = NULL, note = COALESCE(note,?) WHERE owner_id = ? AND user_id = ?`)
        .run('They removed their side of the ledger.', otherOwnerId, req.user.id);
    }
  });
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
  let mine;
  try {
    mine = await db.transaction(async (tx) => {
      const latest = await tx.prepare(`SELECT * FROM links WHERE id = ?`).get(link.id);
      if (latest.claimed_by && latest.claimed_by !== req.user.id) {
        const error = new Error('This personal invite has already been used by someone else.');
        error.code = 'already_claimed';
        throw error;
      }
      const updated = await tx.prepare(
        `UPDATE links SET claimed_by = ?, claimed_at = COALESCE(claimed_at, ?) WHERE id = ? AND (claimed_by IS NULL OR claimed_by = ?)`,
      ).run(req.user.id, now(), link.id, req.user.id);
      if (updated.changes !== 1) {
        const error = new Error('This personal invite has already been used.');
        error.code = 'already_claimed';
        throw error;
      }
      const friend = await mirrorFriendship(link.owner_id, link.friendship_id, req.user.id, tx, req.body?.friendshipId || null);
      if (!friend) throw new Error('The linked person no longer exists.');

      if (link.kind === 'entry' && link.entry_id) {
        const entry = await tx.prepare(`SELECT * FROM entries WHERE id = ?`).get(link.entry_id);
        if (entry && entry.status === 'open' && !entry.confirmed_at) {
          await tx.prepare(`UPDATE entries SET confirmed_at = ? WHERE id = ?`).run(now(), entry.id);
          await tx.prepare(
            `INSERT INTO events (id, user_id, friendship_id, entry_id, type, body, created_at) VALUES (?,?,?,?,?,?,?)`,
          ).run(newId('ev'), link.owner_id, entry.friendship_id, entry.id, 'entry_confirmed', `${friend.name} confirmed “${entry.note || 'that entry'}”.`, now());
        }
      }
      return friend;
    });
  } catch (error) {
    if (error.code === 'already_claimed' || error.code === 'already_linked' || error.code === 'invalid_friend') {
      return res.status(error.code === 'invalid_friend' ? 400 : 409).json({ error: error.code, message: error.message });
    }
    throw error;
  }

  await Promise.all([syncHonor(req.user.id), syncHonor(link.owner_id)]);
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
    photos: e.photos || (e.photo ? [e.photo] : []),
    ownedByMe: e.owned_by_me !== false,
    overdue: !!e.due_at && e.status === 'open' && e.due_at < now(),
    ageDays: Math.max(0, Math.floor((now() - e.created_at) / 86400000)),
  };
}

export default r;
