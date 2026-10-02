import crypto from 'node:crypto';
import { db } from './db.js';

const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const MAX_BYTES = 3 * 1024 * 1024;

/** Persist validated image bytes in the configured database; no local disk required. */
export async function saveDataUrl(dataUrl, _namePrefix, storage = db) {
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
  await storage.prepare(`INSERT INTO media (id, content_type, data, created_at) VALUES (?,?,?,?)`)
    .run(id, MIME[extension], buffer, Date.now());
  return `/api/media/${id}`;
}

export async function readMedia(id, storage = db) {
  return storage.prepare(`SELECT content_type AS contentType, data FROM media WHERE id = ?`).get(id);
}

export async function unlinkUrl(url, storage = db) {
  const match = typeof url === 'string' && /^\/api\/media\/([0-9a-f-]{36})$/.exec(url);
  if (match) await storage.prepare(`DELETE FROM media WHERE id = ?`).run(match[1]);
}
