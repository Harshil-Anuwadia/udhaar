import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from './db.js';
import { saveDataUrl, readMedia, unlinkUrl } from './photos.js';

test('receipt images persist in the database and can be retrieved without local disk', async () => {
  const db = createDatabase({ url: 'file::memory:' });
  const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jcVQAAAAASUVORK5CYII=';
  try {
    await db.ready;
    const url = await saveDataUrl(dataUrl, 'receipt', db);
    const media = await readMedia(url.split('/').at(-1), db);
    assert.equal(media.contentType, 'image/png');
    assert.deepEqual(Buffer.from(media.data), Buffer.from(dataUrl.split(',')[1], 'base64'));
    await unlinkUrl(url, db);
    assert.equal(await readMedia(url.split('/').at(-1), db), undefined);
  } finally {
    await db.close();
  }
});
