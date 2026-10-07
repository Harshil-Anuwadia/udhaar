import crypto from 'node:crypto';
import { Router } from 'express';
import { db, newId, now } from '../db.js';
import { requireAuth, rateLimit } from '../auth.js';
import { EntrySchema, validate } from '../validate.js';
import { requireCompatibleMoney } from '../currency-boundary.js';
import { syncHonor, insight, makeShareToken } from '../ledger.js';
import { hydrateEntry, inviteTokenFor } from './friends.js';
import { selectedPhotoInputs, savePhotoSet, attachPhotoSet, photoMapFor, photosForItem, unlinkUrls } from '../photos.js';

const r = Router();
r.use(requireAuth, rateLimit({ windowMs: 60_000, max: 240, key: 'api' }));

const FREE_ENTRY_LIMIT = 120;

async function ownEntry(userId, id) {
  return db.prepare(`SELECT * FROM entries WHERE id = ? AND owner_id = ?`).get(id, userId);
}

async function accessibleEntry(userId, id, storage = db) {
  return storage.prepare(
    `SELECT e.* FROM entries e JOIN friendships f ON f.id = e.friendship_id
      WHERE e.id = ? AND (e.owner_id = ? OR f.user_id = ?)`,
  ).get(id, userId, userId);
}

async function forViewer(entry, userId) {
  const photos = photosForItem(await photoMapFor('entry', [entry.id]), entry);
  if (entry.owner_id === userId) return hydrateEntry({ ...entry, photos, owned_by_me: true });
  const mine = await db.prepare(
    `SELECT id FROM friendships WHERE owner_id = ? AND user_id = ? ORDER BY created_at LIMIT 1`,
  ).get(userId, entry.owner_id);
  return hydrateEntry({
    ...entry,
    photos,
    friendship_id: mine?.id || null,
    direction: entry.direction === 'owed_to_me' ? 'owed_by_me' : 'owed_to_me',
    group_id: null,
    owned_by_me: false,
  });
}

async function friendshipOf(userId, friendshipId) {
  return db.prepare(`SELECT * FROM friendships WHERE id = ? AND owner_id = ?`).get(friendshipId, userId);
}

async function notify(userId, friendshipId, entryId, type, body) {
  await db.prepare(
    `INSERT INTO events (id, user_id, friendship_id, entry_id, type, body, created_at) VALUES (?,?,?,?,?,?,?)`,
  ).run(newId('ev'), userId, friendshipId, entryId, type, body, now());
}

async function notifyCounterparty(actorId, entry, type, body) {
  const source = await db.prepare(`SELECT owner_id, user_id FROM friendships WHERE id = ?`).get(entry.friendship_id);
  if (!source) return;
  const recipientId = actorId === entry.owner_id ? source.user_id : entry.owner_id;
  if (!recipientId) return;
  const recipientFriend = await db.prepare(
    `SELECT id FROM friendships WHERE owner_id = ? AND user_id = ? ORDER BY created_at LIMIT 1`,
  ).get(recipientId, actorId);
  if (recipientFriend) await notify(recipientId, recipientFriend.id, entry.id, type, body);
}

async function syncPair(entry, actorId) {
  const source = await db.prepare(`SELECT user_id FROM friendships WHERE id = ?`).get(entry.friendship_id);
  const otherId = actorId === entry.owner_id ? source?.user_id : entry.owner_id;
  const score = await syncHonor(actorId);
  if (otherId && otherId !== actorId) await syncHonor(otherId);
  return score;
}

async function shareLinkFor(entryId, friendshipId, ownerId) {
  const existing = await db
    .prepare(`SELECT token FROM links WHERE entry_id = ? AND owner_id = ? AND kind = 'entry'`)
    .get(entryId, ownerId);
  if (existing) return existing.token;
  const token = makeShareToken();
  await db.prepare(
    `INSERT INTO links (id, friendship_id, owner_id, token, kind, entry_id, created_at) VALUES (?,?,?,?,?,?,?)`,
  ).run(newId('lk'), friendshipId, ownerId, token, 'entry', entryId, now());
  return token;
}

/* --------------------------------- create -------------------------------- */

r.post('/', validate(EntrySchema), async (req, res) => {
  const { mutationId, ...v } = req.valid;
  const requestHash = crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
  const priorMutation = async (storage) => mutationId
    ? storage.prepare('SELECT * FROM entry_mutations WHERE owner_id = ? AND mutation_id = ?').get(req.user.id, mutationId)
    : null;
  const replay = (prior) => {
    if (prior.request_hash !== requestHash) {
      const error = new Error('This saved write identifier already belongs to a different entry.');
      error.status = 409; throw error;
    }
    return JSON.parse(prior.response_json);
  };
  const prior = await priorMutation(db);
  if (prior) return res.status(201).json(replay(prior));
  if (v.kind === 'money' && v.amount <= 0) return res.status(400).json({ error: 'validation_failed', message: 'Enter an amount above zero.', field: 'amount' });
  const photoUrls = await savePhotoSet(selectedPhotoInputs(v), req.user.id);
  if (!photoUrls) return res.status(400).json({ error: 'bad_image', message: 'One of those photos could not be read. Use JPG, PNG or WebP images under 3 MB each.' });
  let result;
  try {
    result = await db.transaction(async (tx) => {
      const existing = await priorMutation(tx);
      if (existing) return { response: replay(existing), created: false };
      const f = await tx.prepare('SELECT * FROM friendships WHERE id = ? AND owner_id = ?').get(v.friendshipId, req.user.id);
      if (!f) { const error = new Error('Add that person first.'); error.status = 404; throw error; }
      if (v.kind === 'money') await requireCompatibleMoney(tx, req.user.id, f.id);
      const user = await tx.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.id);
      const openCount = (await tx.prepare("SELECT COUNT(*) AS n FROM entries WHERE owner_id = ? AND status = 'open'").get(req.user.id)).n;
      if (user.plan === 'free' && openCount >= FREE_ENTRY_LIMIT) {
        const error = new Error(`Free ledgers store ${FREE_ENTRY_LIMIT} open entries. Go Plus for unlimited.`);
        error.status = 402; throw error;
      }
      const id = newId('e');
      await tx.prepare(`INSERT INTO entries (id, friendship_id, owner_id, kind, direction, amount, note, due_at, photo, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(id, f.id, req.user.id, v.kind, v.direction, v.kind === 'money' ? v.amount : 0, v.note || null, v.dueAt || null, photoUrls[0] || null, now());
      await attachPhotoSet('entry', id, photoUrls, tx);
      const shareToken = makeShareToken();
      await tx.prepare('INSERT INTO links (id, friendship_id, owner_id, token, kind, entry_id, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(newId('lk'), f.id, req.user.id, shareToken, 'entry', id, now());
      const saved = await tx.prepare('SELECT * FROM entries WHERE id = ?').get(id);
      const response = { entry: hydrateEntry({ ...saved, photos: photoUrls }), shareToken, friend: f };
      if (mutationId) await tx.prepare('INSERT INTO entry_mutations (owner_id, mutation_id, request_hash, response_json, created_at) VALUES (?,?,?,?,?)')
        .run(req.user.id, mutationId, requestHash, JSON.stringify(response), now());
      return { response, saved, created: true };
    });
  } catch (error) {
    await unlinkUrls(photoUrls);
    if ([402, 404, 409].includes(error.status)) return res.status(error.status).json({ error: error.status === 402 ? 'limit_reached' : 'entry_conflict', message: error.message, ...(error.status === 402 ? { upsell: 'entries' } : {}) });
    throw error;
  }
  if (!result.created) await unlinkUrls(photoUrls);
  else {
    await syncPair(result.saved, req.user.id);
    await notifyCounterparty(req.user.id, result.saved, 'entry_new', `${req.user.name} logged ${v.direction === 'owed_to_me' ? 'that you owe them' : 'that they owe you'}${v.note ? ` — “${v.note}”` : ''}.`);
  }
  res.status(201).json(result.response);
});

/* ---------------------------------- list --------------------------------- */

r.get(['/', '/export'], async (req, res) => {
  const exporting = req.path === '/export';
  const { status = exporting ? 'all' : 'open', friendshipId, kind, limit = 60 } = req.query;
  const clauses = [];
  const params = [req.user.id, req.user.id];
  if (status !== 'all') {
    clauses.push('e.status = ?');
    params.push(status);
  }
  if (friendshipId) {
    clauses.push('f.id = ?');
    params.push(friendshipId);
  }
  if (kind && kind !== 'all') {
    clauses.push('e.kind = ?');
    params.push(kind);
  }
  if (!exporting) params.push(Math.max(1, Math.min(Math.floor(Number(limit)) || 60, 200)));

  const rows = await db
    .prepare(
      `SELECT e.*, f.id AS viewer_friendship_id, f.name AS friend_name, f.handle AS friend_handle, f.avatar_seed AS friend_seed, f.user_id AS friend_user
         FROM entries e
         JOIN friendships source ON source.id = e.friendship_id
         JOIN friendships f ON f.id = (
           SELECT viewer.id FROM friendships viewer
            WHERE viewer.owner_id = ?
              AND (viewer.id = source.id OR (viewer.user_id = source.owner_id AND source.user_id = ?))
            ORDER BY viewer.created_at LIMIT 1
         )
        ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY e.status = 'open' DESC, e.created_at DESC, e.id DESC ${exporting ? '' : 'LIMIT ?'}`,
    )
    .all(...params);

  const photoMap = await photoMapFor('entry', rows.map((e) => e.id));
  res.json({
    entries: rows.map((e) => {
      const ownedByMe = e.owner_id === req.user.id;
      const line = hydrateEntry({
        ...e,
        photos: photosForItem(photoMap, e),
        friendship_id: e.viewer_friendship_id,
        direction: ownedByMe ? e.direction : e.direction === 'owed_to_me' ? 'owed_by_me' : 'owed_to_me',
        owned_by_me: ownedByMe,
      });
      if (!ownedByMe) line.groupId = null;
      return { ...line, friend: { id: e.viewer_friendship_id, name: e.friend_name, handle: e.friend_handle, avatarSeed: e.friend_seed, linked: !!e.friend_user } };
    }),
  });
});

/* --------------------------------- settle -------------------------------- */

function entryError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

r.post('/:id/settle', async (req, res) => {
  let result;
  try {
    result = await db.transaction(async (tx) => {
      const e = await accessibleEntry(req.user.id, req.params.id, tx);
      if (!e) throw entryError(404, 'not_found', 'Entry not found.');
      if (e.status === 'settled') throw entryError(409, 'already', 'Already settled.');
      if (e.status === 'void') throw entryError(409, 'voided', 'This entry was voided — reopen it first.');
      const requested = req.body?.amount === undefined ? e.amount : Number(req.body.amount);
      if (!Number.isFinite(requested) || requested < 0 || (e.kind === 'money' && requested <= 0)) throw entryError(400, 'bad_amount', 'Enter an amount above zero.');
      const amount = Math.round(requested * 100) / 100;
      if (amount > e.amount || (e.kind === 'money' && amount <= 0)) throw entryError(409, 'amount_changed', 'The outstanding amount changed. Refresh before settling.');
      const t = now();
      const partial = e.kind === 'money' && amount < e.amount;
      const fragmentId = partial ? newId('e') : null;
      if (partial) {
        await tx.prepare(`INSERT INTO entries (id, friendship_id, owner_id, kind, direction, amount, note, due_at, created_at, settled_at, status, group_id, split_id)
          VALUES (?,?,?,?,?,?,?,?,?,?, 'settled', ?,?)`)
          .run(fragmentId, e.friendship_id, e.owner_id, e.kind, e.direction, amount, e.note ? `${e.note} (part)` : 'Part payment', e.due_at, t, t, e.group_id, e.split_id);
        await tx.prepare('UPDATE entries SET amount = ROUND(amount - ?, 2), version = version + 1 WHERE id = ? AND version = ?')
          .run(amount, e.id, e.version);
      } else {
        await tx.prepare("UPDATE entries SET status = 'settled', settled_at = ?, version = version + 1 WHERE id = ? AND version = ?").run(t, e.id, e.version);
      }
      const settlementId = newId('st');
      await tx.prepare(`INSERT INTO settlements (id, entry_id, fragment_id, before_amount, before_status, before_settled_at, before_confirmed_at, entry_version, created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(settlementId, e.id, fragmentId, e.amount, e.status, e.settled_at, e.confirmed_at, e.version + 1, t);
      return { e, settlementId };
    });
  } catch (error) {
    if (error.code && error.status) return res.status(error.status).json({ error: error.code, message: error.message });
    throw error;
  }
  const score = await syncPair(result.e, req.user.id);
  await notifyCounterparty(req.user.id, result.e, 'entry_settled', `${req.user.name} marked “${result.e.note || 'an entry'}” as settled.`);
  res.json({ ok: true, settlementId: result.settlementId, honorScore: score,
    entry: await forViewer(await db.prepare('SELECT * FROM entries WHERE id = ?').get(result.e.id), req.user.id) });
});

r.post('/:id/reopen', async (req, res) => {
  let e;
  try {
    e = await db.transaction(async (tx) => {
      let current = await accessibleEntry(req.user.id, req.params.id, tx);
      if (!current) throw entryError(404, 'not_found', 'Entry not found.');
      const requestedId = req.body?.settlementId;
      let operation;
      if (requestedId !== undefined) {
        if (typeof requestedId !== 'string') throw entryError(400, 'bad_settlement', 'Invalid settlement.');
        operation = await tx.prepare('SELECT * FROM settlements WHERE id = ? AND entry_id = ?').get(requestedId, current.id);
        if (!operation) throw entryError(409, 'settlement_changed', 'This settlement is no longer available.');
      } else {
        operation = await tx.prepare('SELECT * FROM settlements WHERE (entry_id = ? OR fragment_id = ?) AND undone_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 1').get(current.id, current.id);
        if (operation && operation.entry_id !== current.id) current = await accessibleEntry(req.user.id, operation.entry_id, tx);
      }
      if (operation) {
        if (operation.undone_at) return current; // Retrying the same Undo is safe.
        if (current.version !== operation.entry_version) throw entryError(409, 'settlement_changed', 'This line changed after that payment. Refresh before undoing.');
        if (!operation.fragment_id && operation.before_amount !== current.amount) throw entryError(409, 'settlement_changed', 'The paid portion was removed. Refresh before undoing.');
        if (operation.fragment_id) {
          const fragment = await tx.prepare('SELECT status, version FROM entries WHERE id = ?').get(operation.fragment_id);
          if (!fragment || fragment.status !== 'settled' || fragment.version !== 0) throw entryError(409, 'settlement_changed', 'The paid portion changed. Refresh before undoing.');
          await tx.prepare('DELETE FROM entries WHERE id = ?').run(operation.fragment_id);
        }
        await tx.prepare('UPDATE entries SET amount = ?, status = ?, settled_at = ?, confirmed_at = ?, version = version + 1 WHERE id = ?')
          .run(operation.before_amount, operation.before_status, operation.before_settled_at, operation.before_confirmed_at, current.id);
        await tx.prepare('UPDATE settlements SET undone_at = ? WHERE id = ?').run(now(), operation.id);
      } else {
        await tx.prepare("UPDATE entries SET status = 'open', settled_at = NULL, confirmed_at = NULL, version = version + 1 WHERE id = ?").run(current.id);
      }
      return current;
    });
  } catch (error) {
    if (error.code && error.status) return res.status(error.status).json({ error: error.code, message: error.message });
    throw error;
  }
  res.json({ ok: true, honorScore: await syncPair(e, req.user.id), entry: await forViewer(await db.prepare('SELECT * FROM entries WHERE id = ?').get(e.id), req.user.id) });
});

r.post('/:id/remind', async (req, res) => {
  const e = await accessibleEntry(req.user.id, req.params.id);
  if (!e) return res.status(404).json({ error: 'not_found', message: 'Entry not found.' });
  if (e.status !== 'open') {
    return res.status(409).json({ error: 'not_open', message: 'That entry is already settled or closed.' });
  }
  const perspective = await forViewer(e, req.user.id);
  if (perspective.direction !== 'owed_to_me') {
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
  await notifyCounterparty(req.user.id, e, 'reminder', `${req.user.name} nudged you about “${e.note || 'an entry'}”.`);
  res.json({
    ok: true,
    remindCount: e.remind_count + 1,
    shareToken: await shareLinkFor(e.id, perspective.friendshipId, req.user.id),
  });
});

r.post('/:id/dispute', async (req, res) => {
  const e = await accessibleEntry(req.user.id, req.params.id);
  if (!e) return res.status(404).json({ error: 'not_found', message: 'Entry not found.' });
  await db.prepare(`UPDATE entries SET status = 'disputed', version = version + 1 WHERE id = ?`).run(e.id);
  await notifyCounterparty(req.user.id, e, 'dispute', `${req.user.name} flagged “${e.note || 'an entry'}” as disputed.`);
  res.json({ ok: true, honorScore: await syncPair(e, req.user.id), entry: await forViewer(await db.prepare(`SELECT * FROM entries WHERE id = ?`).get(e.id), req.user.id) });
});

r.post('/:id/resolve', async (req, res) => {
  const e = await accessibleEntry(req.user.id, req.params.id);
  if (!e) return res.status(404).json({ error: 'not_found', message: 'Entry not found.' });
  const outcome = req.body?.outcome === 'drop' ? 'void' : 'open';
  await db.prepare(`UPDATE entries SET status = ?, version = version + 1 WHERE id = ?`).run(outcome, e.id);
  res.json({ ok: true, honorScore: await syncPair(e, req.user.id), entry: await forViewer(await db.prepare(`SELECT * FROM entries WHERE id = ?`).get(e.id), req.user.id) });
});

r.delete('/:id', async (req, res) => {
  const e = await ownEntry(req.user.id, req.params.id);
  if (!e) return res.status(404).json({ error: 'not_found', message: 'Entry not found.' });
  const urls = photosForItem(await photoMapFor('entry', [e.id]), e);
  await db.prepare(`DELETE FROM entries WHERE id = ?`).run(e.id);
  await unlinkUrls(urls);
  res.json({ ok: true, honorScore: await syncPair(e, req.user.id) });
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

  const photoMap = await photoMapFor('entry', rows.map((entry) => entry.id));
  res.json({
    entries: rows.map((e) => ({
      ...hydrateEntry({ ...e, photos: photosForItem(photoMap, e), friendship_id: e.my_friendship_id, owned_by_me: false }),
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
