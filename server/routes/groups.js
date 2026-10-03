import { Router } from 'express';
import { db, newId, now } from '../db.js';
import { requireAuth, rateLimit } from '../auth.js';
import { GroupSchema, SplitSchema, validate } from '../validate.js';
import { syncHonor } from '../ledger.js';
import { hydrateEntry } from './friends.js';

const r = Router();
r.use(requireAuth, rateLimit({ windowMs: 60_000, max: 240, key: 'api' }));

async function ownGroup(userId, groupId) {
  return db.prepare(`SELECT * FROM groups WHERE id = ? AND owner_id = ?`).get(groupId, userId);
}

async function friendshipOf(userId, id) {
  return db.prepare(`SELECT * FROM friendships WHERE id = ? AND owner_id = ?`).get(id, userId);
}

async function membersOf(groupId) {
  return db
    .prepare(
      `SELECT f.*, gm.weight FROM group_members gm JOIN friendships f ON f.id = gm.friendship_id
        WHERE gm.group_id = ? ORDER BY f.name`,
    )
    .all(groupId);
}

/** Largest-remainder split so the parts always sum exactly to the total. */
export function divideEvenly(total, weights) {
  const sumW = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (total * w) / sumW);
  const base = raw.map((x) => Math.floor(x));
  let remainder = total - base.reduce((a, b) => a + b, 0);
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  let k = 0;
  while (remainder > 0 && order.length) {
    base[order[k % order.length].i] += 1;
    remainder -= 1;
    k += 1;
  }
  return base;
}

async function groupSummary(g) {
  const [members, rows, settledRow, splitsRow] = await Promise.all([membersOf(g.id), db
    .prepare(
      `SELECT friendship_id, direction, SUM(amount) AS total
         FROM entries WHERE group_id = ? AND status = 'open' AND kind = 'money'
        GROUP BY friendship_id, direction`,
    )
    .all(g.id), db.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM entries WHERE group_id = ? AND status='settled' AND kind='money'`).get(g.id), db.prepare(`SELECT COUNT(*) AS n FROM splits WHERE group_id = ?`).get(g.id)]);
  const perMember = new Map(members.map((m) => [m.id, { owes: 0, isOwed: 0 }]));
  let totalSettled = 0;
  for (const row of rows) {
    const slot = perMember.get(row.friendship_id) || { owes: 0, isOwed: 0 };
    // 'owed_to_me' entries inside a group mean this member owes the owner.
    if (row.direction === 'owed_to_me') slot.owes += row.total;
    else slot.isOwed += row.total;
    perMember.set(row.friendship_id, slot);
  }
  totalSettled = settledRow.s;
  const splits = splitsRow.n;
  return {
    id: g.id,
    name: g.name,
    avatarSeed: g.avatar_seed,
    currency: g.currency,
    archived: !!g.archived,
    createdAt: g.created_at,
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      handle: m.handle,
      avatarSeed: m.avatar_seed,
      weight: m.weight,
      linked: !!m.user_id,
      owes: perMember.get(m.id)?.owes ?? 0,
      isOwed: perMember.get(m.id)?.isOwed ?? 0,
    })),
    splits,
    settledAmount: totalSettled,
    outstanding: [...perMember.values()].reduce((s, v) => s + v.owes, 0),
  };
}

/* --------------------------------- groups -------------------------------- */

r.get('/', async (req, res) => {
  const groups = await db.prepare(`SELECT * FROM groups WHERE owner_id = ? ORDER BY created_at DESC`).all(req.user.id);
  res.json({ groups: await Promise.all(groups.map(groupSummary)) });
});

r.post('/', validate(GroupSchema), async (req, res) => {
  const count = (await db.prepare(`SELECT COUNT(*) AS n FROM groups WHERE owner_id = ?`).get(req.user.id)).n;
  if (req.user.plan === 'free' && count >= 2) {
    return res.status(402).json({ error: 'limit_reached', message: 'Free ledgers hold 2 groups. Plus is unlimited.', upsell: 'groups' });
  }
  const members = (await Promise.all([...new Set(req.valid.members)].map((id) => friendshipOf(req.user.id, id)))).filter(Boolean);
  if (!members.length) return res.status(400).json({ error: 'validation_failed', message: 'Pick at least one person.' });

  const id = newId('g');
  const t = now();
  await db.transaction(async (tx) => {
    await tx.prepare(
      `INSERT INTO groups (id, owner_id, name, currency, avatar_seed, created_at) VALUES (?,?,?,?,?,?)`,
    ).run(id, req.user.id, req.valid.name, req.user.currency, Math.floor(Math.random() * 1e6), t);
    for (const m of members) await tx.prepare(`INSERT INTO group_members (group_id, friendship_id, joined_at) VALUES (?,?,?)`).run(id, m.id, t);
  });
  res.status(201).json({ group: await groupSummary(await db.prepare(`SELECT * FROM groups WHERE id = ?`).get(id)) });
});

r.get('/:id', async (req, res) => {
  const g = await ownGroup(req.user.id, req.params.id);
  if (!g) return res.status(404).json({ error: 'not_found', message: 'Group not found.' });
  const splitRows = await db
    .prepare(`SELECT * FROM splits WHERE group_id = ? ORDER BY created_at DESC LIMIT 100`)
    .all(g.id);
  const splits = await Promise.all(splitRows.map(async (s) => ({
      id: s.id,
      title: s.title,
      amount: s.amount,
      method: s.method,
      createdAt: s.created_at,
      note: s.note,
      payerKind: s.payer_kind,
      meShare: s.me_share || 0,
      payer: s.payer_friendship_id
        ? await db.prepare(`SELECT name FROM friendships WHERE id = ?`).get(s.payer_friendship_id)
        : null,
      shares: await db
        .prepare(
          `SELECT ss.amount, f.name, f.id AS friendship_id FROM split_shares ss
             JOIN friendships f ON f.id = ss.friendship_id WHERE ss.split_id = ?`,
        )
        .all(s.id),
    })));
  const entryRows = await db
    .prepare(
      `SELECT e.*, f.name AS friend_name FROM entries e JOIN friendships f ON f.id = e.friendship_id
        WHERE e.group_id = ? ORDER BY e.created_at DESC LIMIT 200`,
    )
    .all(g.id);
  const entries = entryRows.map((e) => ({ ...hydrateEntry(e), friendName: e.friend_name }));
  res.json({ group: await groupSummary(g), splits, entries });
});

r.patch('/:id', async (req, res) => {
  const g = await ownGroup(req.user.id, req.params.id);
  if (!g) return res.status(404).json({ error: 'not_found', message: 'Group not found.' });
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 40) : null;
  const archiveProvided = req.body != null && 'archived' in req.body;
  await db.prepare(
    `UPDATE groups SET name = COALESCE(?, name), archived = CASE WHEN ? THEN ? ELSE archived END WHERE id = ?`
  ).run(
    name || null,
    archiveProvided ? 1 : 0,
    req.body?.archived ? 1 : 0,
    g.id,
  );
  res.json({ group: await groupSummary(await db.prepare(`SELECT * FROM groups WHERE id = ?`).get(g.id)) });
});

r.post('/:id/members', async (req, res) => {
  const g = await ownGroup(req.user.id, req.params.id);
  if (!g) return res.status(404).json({ error: 'not_found', message: 'Group not found.' });
  const ids = Array.isArray(req.body?.members) ? req.body.members : [];
  for (const id of ids) if (await friendshipOf(req.user.id, id)) await db.prepare(`INSERT OR IGNORE INTO group_members (group_id, friendship_id, joined_at) VALUES (?,?,?)`).run(g.id, id, now());
  res.json({ group: await groupSummary(g) });
});

r.delete('/:id', async (req, res) => {
  const g = await ownGroup(req.user.id, req.params.id);
  if (!g) return res.status(404).json({ error: 'not_found', message: 'Group not found.' });
  await db.transaction(async (tx) => {
    // A group is organization, not the source of truth for money. Keep every
    // ledger line (including settled lines) when its split record goes away.
    await tx.prepare(`UPDATE entries SET group_id = NULL, split_id = NULL WHERE group_id = ?`).run(g.id);
    await tx.prepare(`DELETE FROM groups WHERE id = ?`).run(g.id);
  });
  res.json({ ok: true });
});

/* --------------------------------- splits -------------------------------- */

r.post('/splits/preview', async (req, res) => {
  const { amount, shares, method = 'equal' } = req.body || {};
  const total = Number(amount) || 0;
  const ids = Array.isArray(shares) ? shares : [];
  if (!ids.length || total <= 0) return res.status(400).json({ error: 'validation_failed', message: 'Need an amount and at least one person.' });
  const amounts = method === 'equal' ? divideEvenly(total, ids.map(() => 1)) : ids.map((s) => Number(s.amount) || 0);
  res.json({
    shares: await Promise.all(ids.map(async (s, i) => ({
      friendshipId: s.friendshipId ?? s,
      amount: amounts[i] ?? 0,
      name: (await friendshipOf(req.user.id, s.friendshipId ?? s))?.name ?? '—',
    }))),
    total,
  });
});

r.post('/splits', validate(SplitSchema), async (req, res) => {
  const v = req.valid;
  const g = await ownGroup(req.user.id, v.groupId);
  if (!g) return res.status(404).json({ error: 'not_found', message: 'Group not found.' });

  // 'me' is a first-class participant: their share divides the bill but never
  // becomes a ledger line against themselves.
  const meShareRow = v.shares.find((s) => s.friendshipId === 'me');
  const meShare = meShareRow ? Math.max(0, Number(meShareRow.amount) || 0) : 0;
  const shares = await Promise.all(v.shares.filter((s) => s.friendshipId !== 'me').map(async (s) => ({ ...s, f: await friendshipOf(req.user.id, s.friendshipId) })));
  const validShares = shares
    .filter((s) => s.f && s.amount > 0);
  if (!validShares.length && meShare <= 0) return res.status(400).json({ error: 'validation_failed', message: 'Everyone’s share is zero.' });
  if (validShares.reduce((a, b) => a + b.amount, 0) + meShare !== v.amount) {
    return res.status(400).json({ error: 'validation_failed', message: 'The shares must add up to the total.' });
  }

  const payerFriend = v.payer.kind === 'friend' ? await friendshipOf(req.user.id, v.payer.friendshipId || '') : null;
  if (v.payer.kind === 'friend' && !payerFriend) {
    return res.status(400).json({ error: 'validation_failed', message: 'Pick a valid payer.' });
  }
  if (v.payer.kind === 'friend' && meShare <= 0) {
    return res.status(400).json({ error: 'validation_failed', message: 'You’re not in this split, so there’s nothing to log against you.' });
  }

  const t = now();
  const splitId = newId('s');
  const created = [];

  await db.transaction(async (tx) => {
    await tx.prepare(
      `INSERT INTO splits (id, group_id, owner_id, payer_kind, payer_friendship_id, title, amount, method, created_at, note, me_share)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(splitId, g.id, req.user.id, v.payer.kind, payerFriend?.id ?? null, v.title, v.amount, v.method, t, v.note || null, meShare);

    if (v.payer.kind === 'me') {
      // I paid: each friend in the split owes me their own share — and my own
      // share is simply mine to bear, no line for it.
      for (const s of validShares) {
        await tx.prepare(`INSERT INTO split_shares (split_id, friendship_id, amount) VALUES (?,?,?)`).run(splitId, s.f.id, s.amount);
        const id = newId('e');
        await tx.prepare(`INSERT INTO entries (id, friendship_id, owner_id, kind, direction, amount, note, group_id, split_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, s.f.id, req.user.id, 'money', 'owed_to_me', s.amount, `${v.title} · split`, g.id, splitId, t);
        created.push(id);
      }
    } else if (payerFriend) {
      // A friend paid: the only line that belongs in MY book is my own share,
      // owed to whoever paid. Other people's shares are between them and the
      // payer — booking those to me would be fiction.
      for (const s of validShares) await tx.prepare(`INSERT INTO split_shares (split_id, friendship_id, amount) VALUES (?,?,?)`).run(splitId, s.f.id, s.amount);
      if (meShare > 0) {
        const id = newId('e');
        await tx.prepare(`INSERT INTO entries (id, friendship_id, owner_id, kind, direction, amount, note, group_id, split_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, payerFriend.id, req.user.id, 'money', 'owed_by_me', meShare, `${v.title} · my share of ${payerFriend.name}’s payment`, g.id, splitId, t);
        created.push(id);
      }
    }
  });

  await syncHonor(req.user.id);
  const entries = await Promise.all(created.map(async (id) => hydrateEntry(await db.prepare(`SELECT * FROM entries WHERE id = ?`).get(id))));
  res.status(201).json({ ok: true, splitId, entries, group: await groupSummary(g) });
});

r.delete('/splits/:id', async (req, res) => {
  const s = await db.prepare(`SELECT * FROM splits WHERE id = ? AND owner_id = ?`).get(req.params.id, req.user.id);
  if (!s) return res.status(404).json({ error: 'not_found', message: 'Split not found.' });
  await db.transaction(async (tx) => {
    // Settled lines are history now: keep them, just unlink from the split.
    await tx.prepare(`UPDATE entries SET split_id = NULL WHERE split_id = ? AND status <> 'open'`).run(s.id);
    await tx.prepare(`DELETE FROM entries WHERE split_id = ?`).run(s.id);
    await tx.prepare(`DELETE FROM splits WHERE id = ?`).run(s.id);
  });
  res.json({ ok: true, honorScore: await syncHonor(req.user.id), group: await groupSummary(await db.prepare(`SELECT * FROM groups WHERE id = ?`).get(s.group_id)) });
});

export default r;
export { groupSummary };
