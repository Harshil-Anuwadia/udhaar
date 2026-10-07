import { newId } from './db.js';

/** Detach a shared page, retaining the financial history each participant saw.
 * Receipts and private moments remain owned by their author and are not copied.
 * Must run before unlinking/deletion in the caller's write transaction.
 */
export async function retainSharedHistory(tx, friendship) {
  if (!friendship.user_id) return;
  const other = await tx.prepare('SELECT * FROM friendships WHERE owner_id = ? AND user_id = ?')
    .get(friendship.user_id, friendship.owner_id);
  if (!other) return;
  const mine = await tx.prepare('SELECT * FROM entries WHERE friendship_id = ?').all(friendship.id);
  const theirs = await tx.prepare('SELECT * FROM entries WHERE friendship_id = ?').all(other.id);
  for (const [rows, target] of [[mine, other], [theirs, friendship]]) {
    for (const entry of rows) {
      await tx.prepare(`INSERT INTO entries
        (id, friendship_id, owner_id, kind, direction, amount, note, status, due_at,
         created_at, settled_at, confirmed_at, remind_count, last_remind_at, pinned)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(newId('e'), target.id, target.owner_id, entry.kind,
          entry.direction === 'owed_to_me' ? 'owed_by_me' : 'owed_to_me',
          entry.amount, entry.note, entry.status, entry.due_at, entry.created_at,
          entry.settled_at, entry.confirmed_at, entry.remind_count, entry.last_remind_at, entry.pinned);
    }
  }
}
