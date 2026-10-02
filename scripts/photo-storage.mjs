import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'udhaar-photo-'));
process.env.DATA_DIR = dataDir;

try {
  const { saveDataUrl, unlinkUrl } = await import(`../server/photos.js?test=${Date.now()}`);
  const url = saveDataUrl('data:image/jpeg;base64,/9j/2Q==', 'storage');
  assert.ok(url, 'a valid JPEG data URL should be accepted');
  const file = path.join(dataDir, 'uploads', path.basename(url));
  assert.equal(fs.existsSync(file), true, 'uploads belong under DATA_DIR');
  unlinkUrl(url);
  assert.equal(fs.existsSync(file), false, 'uploaded files can be removed from DATA_DIR');
  console.log('photo storage checks passed');
} finally {
  fs.rmSync(dataDir, { recursive: true, force: true });
}
