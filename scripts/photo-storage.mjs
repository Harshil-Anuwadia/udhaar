import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'udhaar-photo-'));
process.env.DATA_DIR = dataDir;

try {
  const { createDatabase } = await import('../server/db.js');
  const { saveDataUrl, readMedia, unlinkUrl } = await import('../server/photos.js');
  const storage = createDatabase({ url: 'file::memory:' });
  try {
    await storage.ready;
    const url = await saveDataUrl('data:image/jpeg;base64,/9j/2Q==', 'storage', storage);
    assert.match(url, /^\/api\/media\/[0-9a-f-]{36}$/, 'a valid JPEG data URL is stored in the database');
    const id = url.split('/').at(-1);
    const media = await readMedia(id, storage);
    assert.equal(media.contentType, 'image/jpeg');
    assert.deepEqual(Buffer.from(media.data), Buffer.from('/9j/2Q==', 'base64'));
    await unlinkUrl(url, storage);
    assert.equal(await readMedia(id, storage), undefined, 'uploaded media can be removed');
    console.log('photo storage checks passed');
  } finally {
    storage.close();
  }
} finally {
  fs.rmSync(dataDir, { recursive: true, force: true });
}
