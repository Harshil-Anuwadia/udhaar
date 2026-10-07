/** Shared amounts have one denomination until multicurrency ledgers exist. */
export async function linkedMoneyCount(storage, userId) {
  return (await storage.prepare(`SELECT COUNT(*) AS n FROM entries e
    JOIN friendships f ON f.id = e.friendship_id
    WHERE e.kind = 'money' AND ((e.owner_id = ? AND f.user_id IS NOT NULL) OR f.user_id = ?)`)
    .get(userId, userId)).n;
}

export async function incompatibleLinks(storage, userId, currency) {
  return (await storage.prepare(`SELECT COUNT(*) AS n FROM friendships f JOIN users u
    ON u.id = CASE WHEN f.owner_id = ? THEN f.user_id ELSE f.owner_id END
    WHERE (f.owner_id = ? OR f.user_id = ?) AND f.user_id IS NOT NULL AND u.currency <> ?`)
    .get(userId, userId, userId, currency)).n;
}

export async function requireCompatibleMoney(storage, userId, friendshipId) {
  const mismatch = await storage.prepare(`SELECT 1 FROM friendships f
    JOIN users owner ON owner.id = f.owner_id JOIN users other ON other.id = f.user_id
    WHERE f.id = ? AND f.owner_id = ? AND owner.currency <> other.currency`).get(friendshipId, userId);
  if (mismatch) {
    const error = new Error('These linked ledgers use different currencies. Unlink them before adding money.');
    error.status = 409;
    throw error;
  }
}
