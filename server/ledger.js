import crypto from 'node:crypto';
import { db, now } from './db.js';

const DAY = 86_400_000;

/* ------------------------------- balances ------------------------------- */

const flipDirection = (direction) => direction === 'owed_to_me' ? 'owed_by_me' : 'owed_to_me';

/** Read one pair's canonical lines from both people's friendship rows. */
export async function sharedEntriesFor(friendship) {
  const rows = await db.prepare(
    `SELECT e.* FROM entries e
       JOIN friendships source ON source.id = e.friendship_id
      WHERE e.friendship_id = ?
         OR (source.owner_id = ? AND source.user_id = ?)
      ORDER BY e.created_at DESC, e.rowid DESC`,
  ).all(friendship.id, friendship.user_id || '', friendship.owner_id);
  return rows.map((entry) => ({
    ...entry,
    friendship_id: friendship.id,
    direction: entry.owner_id === friendship.owner_id ? entry.direction : flipDirection(entry.direction),
    owned_by_me: entry.owner_id === friendship.owner_id,
  }));
}

function summarizeEntries(entries) {
  const out = { money: 0, theyOwe: 0, youOwe: 0, favorsToMe: 0, favorsByMe: 0, gesturesToMe: 0, gesturesByMe: 0, openCount: 0, disputedCount: 0, overdueCount: 0 };
  const time = now();
  for (const entry of entries) {
    if (entry.status === 'disputed') { out.disputedCount++; continue; }
    if (entry.status !== 'open') continue;
    out.openCount++;
    if (entry.due_at && entry.due_at < time) out.overdueCount++;
    const toMe = entry.direction === 'owed_to_me';
    if (entry.kind === 'money') {
      if (toMe) out.theyOwe += entry.amount;
      else out.youOwe += entry.amount;
    } else if (entry.kind === 'favor') {
      if (toMe) out.favorsToMe++;
      else out.favorsByMe++;
    } else if (entry.kind === 'gesture') {
      if (toMe) out.gesturesToMe++;
      else out.gesturesByMe++;
    }
  }
  out.money = out.theyOwe - out.youOwe;
  return out;
}

export async function balanceFor(friendshipId) {
  const friendship = await db.prepare(`SELECT * FROM friendships WHERE id = ?`).get(friendshipId);
  if (!friendship) return { money: 0, theyOwe: 0, youOwe: 0 };
  const { money, theyOwe, youOwe } = summarizeEntries(await sharedEntriesFor(friendship));
  return { money, theyOwe, youOwe };
}

export async function countsFor(friendshipId) {
  const friendship = await db.prepare(`SELECT * FROM friendships WHERE id = ?`).get(friendshipId);
  if (!friendship) return { favorsToMe: 0, favorsByMe: 0, gesturesToMe: 0, gesturesByMe: 0 };
  const { favorsToMe, favorsByMe, gesturesToMe, gesturesByMe } = summarizeEntries(await sharedEntriesFor(friendship));
  return { favorsToMe, favorsByMe, gesturesToMe, gesturesByMe };
}

/** Everything we show about one friendship row in a list. */
export async function decorate(friendship) {
  const [entries, avatarRow] = await Promise.all([
    sharedEntriesFor(friendship),
    friendship.user_id ? db.prepare(`SELECT avatar_path FROM users WHERE id = ?`).get(friendship.user_id) : null,
  ]);
  const totals = summarizeEntries(entries);
  return {
    ...friendship,
    net: totals.money,
    theyOwe: totals.theyOwe,
    youOwe: totals.youOwe,
    favorsToMe: totals.favorsToMe,
    favorsByMe: totals.favorsByMe,
    gesturesToMe: totals.gesturesToMe,
    gesturesByMe: totals.gesturesByMe,
    openCount: totals.openCount,
    disputedCount: totals.disputedCount,
    overdueCount: totals.overdueCount,
    lastEntry: entries[0] ?? null,
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
  return decorated.filter((f) => f.net !== 0 || f.openCount > 0 || f.disputedCount > 0);
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
  return {
    owedToYou,
    youOwe,
    net: owedToYou - youOwe,
    favorsToYou,
    favorsByYou,
    friends: friends.length,
    activeFriends: friends.filter((f) => f.net !== 0 || f.openCount > 0 || f.disputedCount > 0).length,
    openEntries: friends.reduce((sum, friend) => sum + friend.openCount, 0),
    disputedEntries: friends.reduce((sum, friend) => sum + friend.disputedCount, 0),
    overdue: friends.reduce((sum, friend) => sum + friend.overdueCount, 0),
  };
}

/* ------------------------------ honor score ----------------------------- */

const W = { settledEarly: 100, settledLate: 62, openOnTime: 48, overdue: 8 };

export async function computeHonor(ownerId) {
  const rows = await db
    .prepare(
      `SELECT e.status, e.due_at, e.settled_at, e.created_at FROM entries e
         JOIN friendships source ON source.id = e.friendship_id
        WHERE e.status != 'void' AND (
          (e.owner_id = ? AND e.direction = 'owed_by_me')
          OR (source.user_id = ? AND e.direction = 'owed_to_me' AND EXISTS (
            SELECT 1 FROM friendships mine WHERE mine.owner_id = ? AND mine.user_id = source.owner_id
          ))
        ) ORDER BY e.created_at DESC LIMIT 200`,
    )
    .all(ownerId, ownerId, ownerId);

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
