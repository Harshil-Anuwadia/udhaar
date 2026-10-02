import crypto from 'node:crypto';
import { db, now } from './db.js';

const DAY = 86_400_000;

/* ------------------------------- balances ------------------------------- */

export async function balanceFor(friendshipId) {
  const rows = await db
    .prepare(
      `SELECT kind, direction, SUM(amount) AS total, COUNT(*) AS n
         FROM entries
        WHERE friendship_id = ? AND status = 'open' AND kind = 'money'
        GROUP BY kind, direction`,
    )
    .all(friendshipId);

  let toMe = 0;
  let byMe = 0;
  for (const r of rows) {
    if (r.direction === 'owed_to_me') toMe += r.total;
    else byMe += r.total;
  }
  return { money: toMe - byMe, theyOwe: toMe, youOwe: byMe };
}

export async function countsFor(friendshipId) {
  const rows = await db
    .prepare(
      `SELECT kind, direction, COUNT(*) AS n
         FROM entries
        WHERE friendship_id = ? AND status = 'open' AND kind != 'money'
        GROUP BY kind, direction`,
    )
    .all(friendshipId);

  const out = { favorsToMe: 0, favorsByMe: 0, gesturesToMe: 0, gesturesByMe: 0 };
  for (const r of rows) {
    if (r.kind === 'favor') r.direction === 'owed_to_me' ? (out.favorsToMe += r.n) : (out.favorsByMe += r.n);
    if (r.kind === 'gesture') r.direction === 'owed_to_me' ? (out.gesturesToMe += r.n) : (out.gesturesByMe += r.n);
  }
  return out;
}

/** Everything we show about one friendship row in a list. */
export async function decorate(friendship) {
  const [b, c, last, openRow, avatarRow] = await Promise.all([
    balanceFor(friendship.id),
    countsFor(friendship.id),
    db
    .prepare(
      `SELECT kind, direction, amount, note, created_at FROM entries
        WHERE friendship_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(friendship.id),
    db.prepare(`SELECT COUNT(*) AS n FROM entries WHERE friendship_id = ? AND status = 'open'`).get(friendship.id),
    friendship.user_id ? db.prepare(`SELECT avatar_path FROM users WHERE id = ?`).get(friendship.user_id) : null,
  ]);
  return {
    ...friendship,
    net: b.money,
    theyOwe: b.theyOwe,
    youOwe: b.youOwe,
    ...c,
    openCount: openRow.n,
    lastEntry: last ?? null,
    linked: !!friendship.user_id,
    avatarUrl: friendship.user_id
      ? avatarRow?.avatar_path || null
      : null,
  };
}

export async function friendsFor(ownerId, { includeEmpty = true } = {}) {
  const rows = await db
    .prepare(`SELECT * FROM friendships WHERE owner_id = ? ORDER BY created_at DESC`)
    .all(ownerId);
  const decorated = await Promise.all(rows.map(decorate));
  if (includeEmpty) return decorated;
  return decorated.filter((f) => f.net !== 0 || f.openCount > 0);
}

export async function totalsFor(ownerId) {
  const friends = await friendsFor(ownerId);
  let owedToYou = 0;
  let youOwe = 0;
  let favorsToYou = 0;
  let favorsByYou = 0;
  for (const f of friends) {
    owedToYou += f.theyOwe;
    youOwe += f.youOwe;
    favorsToYou += f.favorsToMe;
    favorsByYou += f.favorsByMe;
  }
  const [openRow, overdueRow] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM entries WHERE owner_id = ? AND status = 'open'`).get(ownerId),
    db.prepare(
      `SELECT COUNT(*) AS n FROM entries
        WHERE owner_id = ? AND status = 'open' AND due_at IS NOT NULL AND due_at < ?`,
    )
    .get(ownerId, now()),
  ]);
  return {
    owedToYou,
    youOwe,
    net: owedToYou - youOwe,
    favorsToYou,
    favorsByYou,
    friends: friends.length,
    activeFriends: friends.filter((f) => f.net !== 0 || f.openCount > 0).length,
    openEntries: openRow.n,
    overdue: overdueRow.n,
  };
}

/* ------------------------------ honor score ----------------------------- */

const W = { settledEarly: 100, settledLate: 62, openOnTime: 48, overdue: 8 };

export async function computeHonor(ownerId) {
  const rows = await db
    .prepare(
      `SELECT status, due_at, settled_at, created_at FROM entries
        WHERE owner_id = ? AND direction = 'owed_by_me' AND status != 'void'
        ORDER BY created_at DESC LIMIT 200`,
    )
    .all(ownerId);

  if (!rows.length) return { score: 50, grade: 'Just started', n: 0, onTimeRate: null };

  let sum = 0;
  let settled = 0;
  let onTime = 0;
  const t = now();
  for (const r of rows) {
    if (r.status === 'settled') {
      settled += 1;
      const late = r.due_at ? r.settled_at > r.due_at + DAY : false;
      sum += late ? W.settledLate : W.settledEarly;
      if (!late) onTime += 1;
    } else if (r.status === 'disputed') {
      sum += W.openOnTime * 0.6;
    } else {
      const late = r.due_at ? t > r.due_at + DAY : false;
      sum += late ? W.overdue : W.openOnTime;
    }
  }
  const score = Math.round(sum / rows.length);
  return { score, grade: honorGrade(score), n: rows.length, onTimeRate: settled ? onTime / settled : null };
}

export function honorGrade(score) {
  if (score >= 88) return 'On track';
  if (score >= 74) return 'Mostly on track';
  if (score >= 58) return 'Getting there';
  if (score >= 42) return 'Catch-up needed';
  return 'Time to catch up';
}

export async function syncHonor(ownerId) {
  const { score, n } = await computeHonor(ownerId);
  await db.prepare(`UPDATE users SET honor_score = ?, honor_n = ? WHERE id = ?`).run(score, n, ownerId);
  return score;
}

/* -------------------------------- sharing ------------------------------- */

/** Compact, collision-resistant token for /j/<token> invite + entry links. */
export function makeShareToken() {
  const ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789'; // no l/1/o/0 confusion
  const bytes = crypto.randomBytes(9);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export async function insight(ownerId) {
  const friends = await friendsFor(ownerId);
  const active = friends.filter((f) => f.net !== 0 || f.openCount > 0);
  if (!active.length) return null;

  const byNet = [...active].sort((a, b) => b.net - a.net);
  const biggestDebtor = byNet[0];
  const biggestCreditor = byNet[byNet.length - 1];
  const [oldest, lifetime] = await Promise.all([db
    .prepare(
      `SELECT e.*, f.name FROM entries e JOIN friendships f ON f.id = e.friendship_id
        WHERE e.owner_id = ? AND e.status = 'open' ORDER BY e.created_at ASC LIMIT 1`,
    )
    .get(ownerId), db
    .prepare(`SELECT COALESCE(SUM(amount),0) AS s, COUNT(*) AS n FROM entries WHERE owner_id = ? AND kind='money'`)
    .get(ownerId)]);

  return {
    biggestDebtor: biggestDebtor ? { name: biggestDebtor.name, net: biggestDebtor.net } : null,
    biggestCreditor:
      biggestCreditor && biggestCreditor.net < 0
        ? { name: biggestCreditor.name, net: -biggestCreditor.net }
        : null,
    oldest: oldest
      ? { name: oldest.name, note: oldest.note, days: Math.floor((now() - oldest.created_at) / DAY) }
      : null,
    lifetime: { amount: lifetime.s, count: lifetime.n },
  };
}
