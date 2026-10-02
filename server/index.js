import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { now } from './db.js';
import { rateLimit } from './auth.js';
import { readMedia } from './photos.js';

import authRoutes from './routes/auth.js';
import friendRoutes from './routes/friends.js';
import entryRoutes from './routes/entries.js';
import groupRoutes from './routes/groups.js';
import meRoutes from './routes/me.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

/* ------------------------------- middleware ------------------------------ */

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), geolocation=(), interest-cohort=()',
  });
  if (!req.path.startsWith('/api')) {
    res.set('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "manifest-src 'self'",
      "worker-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '));
  }
  next();
});

app.use(express.json({ limit: '4mb' })); // photo data-urls ride on JSON
app.use(cookieParser());

// Reject malformed JSON with a friendly 400 rather than an HTML stack trace.
app.use((err, req, res, next) => {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'bad_json', message: 'That request body isn’t valid JSON.' });
  }
  next(err);
});

/* ---------------------------------- api ---------------------------------- */

const api = express.Router();
api.use(rateLimit({ windowMs: 60_000, max: 400, key: 'global' }));

api.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), time: now() });
});

api.get('/media/:id', async (req, res) => {
  const media = await readMedia(req.params.id);
  if (!media) return res.status(404).json({ error: 'not_found', message: 'Image not found.' });
  res.set({ 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
  res.type(media.contentType).send(Buffer.from(media.data));
});

api.use('/auth', authRoutes);
api.use('/friends', friendRoutes);
api.use('/entries', entryRoutes);
api.use('/groups', groupRoutes);
api.use('/me', meRoutes);

api.use((req, res) => res.status(404).json({ error: 'not_found', message: 'No such endpoint.' }));

app.use('/api', api);

/* -------------------------------- static --------------------------------- */
const SW = fs.readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8');
const CACHE_TAG = process.env.CACHE_TAG || String(Date.now());

app.get('/sw.js', (req, res) => {
  res.set({ 'Content-Type': 'application/javascript; charset=utf-8', 'Service-Worker-Allowed': '/', 'Cache-Control': 'no-cache' });
  res.send(`/* build:${CACHE_TAG} */\n${SW}`);
});

app.use(
  express.static(PUBLIC, {
    extensions: ['html'],
    setHeaders(res, filePath) {
      // Code and shell always revalidate (ETag/304): unversioned URLs must
      // never be frozen, or an old build's bytes outlive the new build.
      if (filePath.endsWith('index.html') || /\.(js|css|woff2)$/.test(filePath)) res.set('Cache-Control', 'no-cache');
      else res.set('Cache-Control', 'public, max-age=3600');
    },
  }),
);

// Deep links: /j/<token> (join), /f/<handle>, /u/<handle>, /g/<id>
const DEEP_LINK = /^\/(j|f|u|g|p|ledger|groups|add|you)(\/[A-Za-z0-9_.-]+)?\/?$/;
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api')) return next();
  if (req.path === '/' || DEEP_LINK.test(req.path)) {
    return res.set('Cache-Control', 'no-cache').sendFile(path.join(PUBLIC, 'index.html'));
  }
  next();
});

/* -------------------------------- errors --------------------------------- */

app.use((err, req, res, next) => {
  console.error('[error]', req.method, req.path, err?.message || err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    error: 'server_error',
    message: process.env.NODE_ENV === 'production' ? 'Something broke on our end. Try again.' : String(err?.message || err),
  });
});

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));

export default app;
