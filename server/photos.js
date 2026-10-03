import crypto from 'node:crypto';
import { db } from './db.js';

const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const MAX_BYTES = 3 * 1024 * 1024;

/** Persist validated image bytes in the configured database; no local disk required. */
export async function saveDataUrl(dataUrl, _namePrefix, storage = db, ownerId = null) {
  if (typeof dataUrl !== 'string') return null;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl.trim());
  if (!match) return null;
  const [, extension, encoded] = match;
  const buffer = Buffer.from(encoded, 'base64');
  if (!buffer.length || buffer.length > MAX_BYTES) return null;

  const actual =
    buffer[0] === 0xff && buffer[1] === 0xd8 ? 'jpeg' :
      buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 ? 'png' :
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
          buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50 ? 'webp' : null;
  if (!actual || actual !== extension) return null;

  const id = crypto.randomUUID();
  await storage.prepare(`INSERT INTO media (id, content_type, data, created_at, owner_id) VALUES (?,?,?,?,?)`)
    .run(id, MIME[extension], buffer, Date.now(), ownerId);
  return `/api/media/${id}`;
}

export async function readMedia(id, storage = db) {
  return storage.prepare(`SELECT content_type AS contentType, data FROM media WHERE id = ?`).get(id);
}

/** New records use an ordered set; the legacy single photo remains the cover. */
export function selectedPhotoInputs(valid) {
  return valid.photos?.length ? valid.photos : valid.photo ? [valid.photo] : [];
}

export async function savePhotoSet(dataUrls, ownerId, storage = db) {
  const urls = [];
  try {
    for (const dataUrl of dataUrls) {
      const url = await saveDataUrl(dataUrl, 'photo', storage, ownerId);
      if (!url) {
        await unlinkUrls(urls, storage);
        return null;
      }
      urls.push(url);
    }
    return urls;
  } catch (error) {
    await unlinkUrls(urls, storage);
    throw error;
  }
}

export async function attachPhotoSet(kind, itemId, urls, storage = db) {
  const column = kind === 'entry' ? 'entry_id' : 'moment_id';
  for (const [position, url] of urls.entries()) {
    await storage.prepare(`INSERT INTO item_photos (url, ${column}, position) VALUES (?,?,?)`)
      .run(url, itemId, position);
  }
}

export async function photoMapFor(kind, ids, storage = db) {
  const column = kind === 'entry' ? 'entry_id' : 'moment_id';
  const map = new Map();
  for (let offset = 0; offset < ids.length; offset += 200) {
    const batch = ids.slice(offset, offset + 200);
    const rows = await storage.prepare(`SELECT ${column} AS itemId, url FROM item_photos
      WHERE ${column} IN (${batch.map(() => '?').join(',')}) ORDER BY ${column}, position`).all(...batch);
    for (const row of rows) {
      if (!map.has(row.itemId)) map.set(row.itemId, []);
      map.get(row.itemId).push(row.url);
    }
  }
  return map;
}

export function photosForItem(map, item) {
  return map.get(item.id) || (item.photo ? [item.photo] : []);
}

export async function unlinkUrls(urls, storage = db) {
  for (const url of urls) await unlinkUrl(url, storage);
}

/** Resolve media only through a current avatar or ledger entry visible to this user. */
export async function readAuthorizedMedia(id, userId, storage = db) {
  const url = `/api/media/${id}`;
  return storage.prepare(`
    SELECT m.content_type AS contentType, m.data FROM media m
    WHERE m.id = ? AND (
      EXISTS (
        SELECT 1 FROM users u WHERE u.avatar_path = ? AND (
          u.id = ? OR EXISTS (
            SELECT 1 FROM friendships f WHERE f.owner_id = ? AND f.user_id = u.id
          )
        )
      ) OR EXISTS (
        SELECT 1 FROM entries e JOIN friendships f ON f.id = e.friendship_id
        WHERE e.photo = ? AND (
          e.owner_id = ? OR (
            f.user_id = ? AND EXISTS (
              SELECT 1 FROM friendships mirror
              WHERE mirror.owner_id = ? AND mirror.user_id = e.owner_id
            )
          )
        )
      ) OR EXISTS (
        SELECT 1 FROM moments WHERE photo = ? AND owner_id = ?
      ) OR EXISTS (
        SELECT 1 FROM item_photos ip JOIN moments mo ON mo.id = ip.moment_id
        WHERE ip.url = ? AND mo.owner_id = ?
      ) OR EXISTS (
        SELECT 1 FROM item_photos ip
        JOIN entries e ON e.id = ip.entry_id
        JOIN friendships f ON f.id = e.friendship_id
        WHERE ip.url = ? AND (
          e.owner_id = ? OR (
            f.user_id = ? AND EXISTS (
              SELECT 1 FROM friendships mirror
              WHERE mirror.owner_id = ? AND mirror.user_id = e.owner_id
            )
          )
        )
      )
    )
  `).get(id, url, userId, userId, url, userId, userId, userId, url, userId,
    url, userId, url, userId, userId, userId);
}

export async function unlinkUrl(url, storage = db) {
  const match = typeof url === 'string' && /^\/api\/media\/([0-9a-f-]{36})$/.exec(url);
  if (match) await storage.prepare(`DELETE FROM media WHERE id = ?`).run(match[1]);
}
