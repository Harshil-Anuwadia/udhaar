import { Router } from 'express';
import { db, newId, now } from '../db.js';
import { requireAuth, rateLimit } from '../auth.js';
import { EntrySchema, validate } from '../validate.js';
import { syncHonor, insight, makeShareToken } from '../ledger.js';
import { hydrateEntry, inviteTokenFor } from './friends.js';
import { saveDataUrl, unlinkUrl } from '../photos.js';

const r = Router();
r.use(requireAuth, rateLimit({ windowMs: 60_000, max: 240, key: 'api' }));

const FREE_ENTRY_LIMIT = 120;

async function ownEntry(userId, id) {
  return db.prepare(`SELECT * FROM entries WHERE id = ? AND owner_id = ?`).get(id, userId);
}

async function friendshipOf(userId, friendshipId) {
  return db.prepare(`SELECT * FROM friendships WHERE id = ? AND owner_id = ?`).get(friendshipId, userId);
}

async function notify(userId, friendshipId, entryId, type, body) {
  await db.prepare(
    `INSERT INTO events (id, user_id, friendship_id, entry_id, type, body, created_at) VALUES (?,?,?,?,?,?,?)`,
  ).run(newId('ev'), userId, friendshipId, entryId, type, body, now());
}

async function shareLinkFor(entryId, friendshipId, ownerId) {
  const existing = await db
    .prepare(`SELECT token FROM links WHERE entry_id = ? AND kind = 'entry'`)
    .get(entryId);
  if (existing) return existing.token;
  const token = makeShareToken();
  await db.prepare(
    `INSERT INTO links (id, friendship_id, owner_id, token, kind, entry_id, created_at) VALUES (?,?,?,?,?,?,?)`,
  ).run(newId('lk'), friendshipId, ownerId, token, 'entry', entryId, now());
  return token;
}

/* --------------------------------- create -------------------------------- */

r.post('/', validate(EntrySchema), async (req, res) => {
  const v = req.valid;
  const f = await friendshipOf(req.user.id, v.friendshipId);
  if (!f) return res.status(404).json({ error: 'not_found', message: 'Add that person first.' });

  if (v.kind === 'money' && v.amount <= 0) {
    return res.status(400).json({ error: 'validation_failed', message: 'Enter an amount above zero.', field: 'amount' });
  }

  const openCount = (await db
    .prepare(`SELECT COUNT(*) AS n FROM entries WHERE owner_id = ?`)
    .get(req.user.id)).n;
  if (req.user.plan === 'free' && openCount >= FREE_ENTRY_LIMIT) {
    return res.status(402).json({
      error: 'limit_reached',
      message: `Free ledgers store ${FREE_ENTRY_LIMIT} entries. Udhaar Plus keeps forever.`,
      upsell: 'entries',
    });
  }

  const id = newId('e');
  const photoUrl = v.photo ? await saveDataUrl(v.photo, `e-${id}`) : null;
  if (v.photo && !photoUrl) {
    return res.status(400).json({ error: 'bad_image', message: 'That receipt could not be read. Try a JPG, PNG or WebP image.' });
  }

  try {
    await db.prepare(
      `INSERT INTO entries (id, friendship_id, owner_id, kind, direction, amount, note, due_at, photo, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(id, f.id, req.user.id, v.kind, v.direction, v.kind === 'money' ? v.amount : 0, v.note || null, v.dueAt || null, photoUrl, now());
  } catch (error) {
    if (photoUrl) await unlinkUrl(photoUrl);
    throw error;
  }

  await syncHonor(req.user.id);

  const entry = hydrateEntry(await db.prepare(`SELECT * FROM entries WHERE id = ?`).get(id));
  if (f.user_id) {
    await notify(
      f.user_id,
      f.id,
      id,
      'entry_new',
      `${req.user.name} logged ${v.direction === 'owed_to_me' ? 'that you owe them' : 'that they owe you'}${v.note ? ` — “${v.note}”` : ''}.`,
    );
  }

  res.status(201).json({ entry, shareToken: await shareLinkFor(id, f.id, req.user.id), friend: f });
});

/* ---------------------------------- list --------------------------------- */

r.get('/', async (req, res) => {
  const { status = 'open', friendshipId, kind, limit = 60 } = req.query;
  const clauses = ['e.owner_id = ?'];
  const params = [req.user.id];
  if (status !== 'all') {
    clauses.push('e.status = ?');
    params.push(status);
  }
  if (friendshipId) {
    clauses.push('e.friendship_id = ?');
    params.push(friendshipId);
  }
  if (kind && kind !== 'all') {
    clauses.push('e.kind = ?');
    params.push(kind);
  }
  params.push(Math.min(Number(limit) || 60, 200));

  const rows = await db
    .prepare(
      `SELECT e.*, f.name AS friend_name, f.handle AS friend_handle, f.avatar_seed AS friend_seed, f.user_id AS friend_user
         FROM entries e JOIN friendships f ON f.id = e.friendship_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY e.status = 'open' DESC, e.created_at DESC LIMIT ?`,
    )
    .all(...params);

  res.json({
    entries: rows.map((e) => ({
      ...hydrateEntry(e),
      friend: { id: e.friendship_id, name: e.friend_name, handle: e.friend_handle, avatarSeed: e.friend_seed, linked: !!e.friend_user },
    })),
  });
});

/* --------------------------------- settle -------------------------------- */

r.post('/:id/settle', async (req, res) => {
  const e = await ownEntry(req.user.id, req.params.id);
  if (!e) return res.status(404).json({ error: 'not_found', message: 'Entry not found.' });
  if (e.status === 'settled') return res.status(409).json({ error: 'already', message: 'Already settled.' });

  const partial = Math.max(0, Math.min(Number(req.body?.amount ?? e.amount), e.amount));
  const t = now();

  if (e.kind === 'money' && partial > 0 && partial < e.amount) {
    // Split into a settled portion + a remaining open portion.
    await db.prepare(
      `INSERT INTO entries (id, friendship_id, owner_id, kind, direction, amount, note, due_at, created_at, settled_at, status, group_id)
       VALUES (?,?,?,?,?,?,?,?,?,?, 'settled', ?)`,
    ).run(newId('e'), e.friendship_id, e.owner_id, e.kind, e.direction, partial, e.note ? `${e.note} (part)` : 'Part payment', e.due_at, t, t, e.group_id);
    await db.prepare(`UPDATE entries SET amount = amount - ? WHERE id = ?`).run(partial, e.id);
  } else {
    await db.prepare(`UPDATE entries SET status = 'settled', settled_at = ? WHERE id = ?`).run(t, e.id);
  }

  const score = await syncHonor(req.user.id);
  const f = await friendshipOf(req.user.id, e.friendship_id);
  if (f?.user_id) await notify(f.user_id, f.id, e.id, 'entry_settled', `${req.user.name} marked “${e.note || 'an entry'}” as settled.`);

  res.json({
    ok: true,
    honorScore: score,
    entry: hydrateEntry(await db.prepare(`SELECT * FROM entries WHERE id = ?`).get(e.id)),
  });
});

r.post('/:id/reopen', async (req, res) => {
  const e = await ownEntry(req.user.id, req.params.id);
  if (!e) return res.status(404).json({ error: 'not_found', message: 'Entry not found.' });
  await db.prepare(`UPDATE entries SET status = 'open', settled_at = NULL, confirmed_at = NULL WHERE id = ?`).run(e.id);
  res.json({ ok: true, honorScore: await syncHonor(req.user.id), entry: hydrateEntry(await db.prepare(`SELECT * FROM entries WHERE id = ?`).get(e.id)) });
});

r.post('/:id/remind', async (req, res) => {
  const e = await ownEntry(req.user.id, req.params.id);
  if (!e) return res.status(404).json({ error: 'not_found', message: 'Entry not found.' });
  if (e.direction !== 'owed_to_me') {
    return res.status(400).json({ error: 'not_yours_to_chase', message: 'That one’s on you — settle it instead of nudging.' });
  }
  if (e.last_remind_at && now() - e.last_remind_at < 6 * 3600_000) {
    const mins = Math.ceil((6 * 3600_000 - (now() - e.last_remind_at)) / 60000);
    return res.status(429).json({
      error: 'too_soon',
      message: `You nudged them ${mins < 60 ? `${mins} min ago` : 'recently'}. Let it breathe.`,
      retryAfterMinutes: mins,
    });
  }
  await db.prepare(`UPDATE entries SET remind_count = remind_count + 1, last_remind_at = ? WHERE id = ?`).run(now(), e.id);
  const f = await friendshipOf(req.user.id, e.friendship_id);
  if (f?.user_id) await notify(f.user_id, f.id, e.id, 'reminder', `${req.user.name} nudged you about “${e.note || 'an entry'}”.`);
  res.json({
    ok: true,
    remindCount: e.remind_count + 1,
    shareToken: await shareLinkFor(e.id, e.friendship_id, req.user.id),
  });
});

r.post('/:id/dispute', async (req, res) => {
  const e = await ownEntry(req.user.id, req.params.id);
  if (!e) return res.status(404).json({ error: 'not_found', message: 'Entry not found.' });
  await db.prepare(`UPDATE entries SET status = 'disputed' WHERE id = ?`).run(e.id);
  const f = await friendshipOf(req.user.id, e.friendship_id);
  if (f?.user_id) await notify(f.user_id, f.id, e.id, 'dispute', `${req.user.name} flagged “${e.note || 'an entry'}” as disputed.`);
  res.json({ ok: true, honorScore: await syncHonor(req.user.id), entry: hydrateEntry(await db.prepare(`SELECT * FROM entries WHERE id = ?`).get(e.id)) });
});

r.post('/:id/resolve', async (req, res) => {
  const e = await ownEntry(req.user.id, req.params.id);
  if (!e) return res.status(404).json({ error: 'not_found', message: 'Entry not found.' });
  const outcome = req.body?.outcome === 'drop' ? 'void' : 'open';
  await db.prepare(`UPDATE entries SET status = ? WHERE id = ?`).run(outcome, e.id);
  res.json({ ok: true, honorScore: await syncHonor(req.user.id), entry: hydrateEntry(await db.prepare(`SELECT * FROM entries WHERE id = ?`).get(e.id)) });
});

r.delete('/:id', async (req, res) => {
  const e = await ownEntry(req.user.id, req.params.id);
  if (!e) return res.status(404).json({ error: 'not_found', message: 'Entry not found.' });
  const doomed = await db.prepare(`SELECT photo FROM entries WHERE id = ?`).get(e.id);
  await db.prepare(`DELETE FROM entries WHERE id = ?`).run(e.id);
  if (doomed?.photo) await unlinkUrl(doomed.photo);
  res.json({ ok: true, honorScore: await syncHonor(req.user.id) });
});

/* --------------------------- incoming (linked) --------------------------- */

/** Entries other people logged against me — only exists once a friend joins. */
r.get('/incoming/all', async (req, res) => {
  const rows = await db
    .prepare(
      `SELECT e.*, u.handle AS friend_handle, u.name AS friend_real_name, u.avatar_seed AS friend_real_seed,
              mine.id AS my_friendship_id, mine.name AS my_name_for_them
         FROM entries e
         JOIN friendships f ON f.id = e.friendship_id
         JOIN users u ON u.id = e.owner_id
         LEFT JOIN friendships mine ON mine.owner_id = ? AND mine.user_id = e.owner_id
        WHERE f.user_id = ? AND e.owner_id != ?
        ORDER BY e.created_at DESC LIMIT 100`,
    )
    .all(req.user.id, req.user.id, req.user.id);

  res.json({
    entries: rows.map((e) => ({
      ...hydrateEntry(e),
      mirror: true,
      // From my side of the glass the direction flips.
      direction: e.direction === 'owed_to_me' ? 'owed_by_me' : 'owed_to_me',
      friend: {
        id: e.my_friendship_id || null,
        name: e.my_name_for_them || e.friend_real_name,
        handle: e.friend_handle,
        avatarSeed: e.friend_real_seed,
        linked: true,
      },
    })),
  });
});

/* ------------------------------- insights -------------------------------- */

r.get('/insights/summary', async (req, res) => {
  res.json({ insight: await insight(req.user.id), honor: await syncHonor(req.user.id) });
});

export default r;
export { shareLinkFor, notify, friendshipOf, ownEntry, FREE_ENTRY_LIMIT };
