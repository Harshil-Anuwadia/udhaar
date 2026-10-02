import fs from 'node:fs';
import child_process from 'node:child_process';

let tag = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || '';
if (!tag) {
  try {
    tag = child_process.execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {}
}
if (!tag) {
  tag = 'v1.14.2';
}

fs.writeFileSync('build-tag.txt', tag, 'utf8');
console.log('[build-tag] Generated build tag:', tag);
