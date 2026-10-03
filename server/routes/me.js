import crypto from 'crypto';
import Razorpay from 'razorpay';
import { Router } from 'express';
import { db, newId, now } from '../db.js';
import { saveDataUrl, unlinkUrl } from '../photos.js';
import { requireAuth, rateLimit } from '../auth.js';
import { ProfileSchema, validate , PhotoSchema } from '../validate.js';
import { computeHonor, totalsFor, friendsFor, insight, syncHonor } from '../ledger.js';
import { publicUser } from './auth.js';
import { inviteTokenFor } from './friends.js';
import { convertAmount, distributeConverted, latestRate } from '../fx.js';

const r = Router();
r.use(requireAuth, rateLimit({ windowMs: 60_000, max: 240, key: 'api' }));

/* --------------------------------- stats --------------------------------- */

r.get('/stats', async (req, res) => {
  const [totals, honor, friends, streakRow, currentInsight] = await Promise.all([
    totalsFor(req.user.id), computeHonor(req.user.id), friendsFor(req.user.id), db
    .prepare(
      `SELECT COUNT(DISTINCT date(created_at/1000,'unixepoch')) AS n FROM entries WHERE owner_id = ?`,
    )
    .get(req.user.id), insight(req.user.id),
  ]);
  const top = [...friends]
    .filter((f) => f.net !== 0 || f.openCount > 0 || f.disputedCount > 0)
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
    .slice(0, 6);

  res.json({ totals, honor, top, activeDays: streakRow.n, insight: currentInsight });
});

/* ------------------------------- profile -------------------------------- */

r.patch('/profile', validate(ProfileSchema), async (req, res) => {
  const { name, currency, theme, voiceMode, plan } = req.valid;
  if (currency && currency !== req.user.currency) {
    const [entries, groups] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS n FROM entries WHERE owner_id = ?').get(req.user.id),
      db.prepare('SELECT COUNT(*) AS n FROM groups WHERE owner_id = ?').get(req.user.id),
    ]);
    if (req.user.onboarded || entries.n || groups.n) return res.status(409).json({ error: 'currency_conversion_required', message: 'Use the currency conversion flow to change your ledger currency.' });
  }
  await db.prepare(`UPDATE users SET name = COALESCE(?,name), currency = COALESCE(?,currency), theme = COALESCE(?,theme), voice_mode = COALESCE(?,voice_mode), plan = COALESCE(?,plan) WHERE id = ?`)
    .run(name ?? null, currency ?? null, theme ?? null, voiceMode ?? null, plan ?? null, req.user.id);
  const fresh = await db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  res.json({ user: await publicUser(fresh) });
});

/* ------------------------------- razorpay ------------------------------- */

r.post('/create-order', rateLimit({ windowMs: 60_000, max: 10, key: 'order' }), async (req, res) => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ error: 'config_missing', message: 'Payment gateway is not configured.' });
  }
  const cur = req.user.currency;
  const price = cur === 'INR' ? 29 : 1; // Lifetime pricing
  const amountPaise = price * 100;
  
  if (amountPaise < 100) return res.status(400).json({ error: 'invalid_amount', message: 'Amount too small' });

  try {
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: cur,
      receipt: `rcpt_${req.user.id}_${Date.now()}`
    });
    res.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('Razorpay Create Order Error:', error);
    res.status(500).json({ error: 'order_failed', message: 'Failed to create payment order.' });
  }
});

r.post('/verify-payment', rateLimit({ windowMs: 60_000, max: 10, key: 'verify' }), async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'missing_fields', message: 'Missing payment signature details' });
  }
  
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(razorpay_order_id + '|' + razorpay_payment_id)
    .digest('hex');
    
  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({ error: 'invalid_signature', message: 'Payment verification failed' });
  }
  
  try {
    await db.prepare(`UPDATE users SET plan = 'plus' WHERE id = ?`).run(req.user.id);
    const fresh = await db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
    res.json({ success: true, user: await publicUser(fresh) });
  } catch (err) {
    res.status(500).json({ error: 'db_error', message: 'Payment verified but failed to update plan.' });
  }
});

r.get('/currency/quote', async (req, res) => {
  try {
    const quote = await latestRate(req.user.currency, String(req.query.to || ''));
    const [lines, groups, linked] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS n FROM entries WHERE owner_id = ? AND kind = 'money'").get(req.user.id),
      db.prepare('SELECT COUNT(*) AS n FROM groups WHERE owner_id = ?').get(req.user.id),
      db.prepare("SELECT COUNT(*) AS n FROM entries e JOIN friendships f ON f.id = e.friendship_id WHERE e.owner_id = ? AND e.kind = 'money' AND f.user_id IS NOT NULL").get(req.user.id),
    ]);
    res.json({ ...quote, lines: lines.n, groups: groups.n, linkedLines: linked.n });
  } catch (error) { res.status(503).json({ error: 'rate_unavailable', message: error.message }); }
});

r.post('/currency/change', rateLimit({ windowMs: 3600_000, max: 12, key: 'currency' }), async (req, res) => {
  const to = String(req.body?.to || '');
  let quote;
  try { quote = await latestRate(req.user.currency, to); }
  catch (error) { return res.status(503).json({ error: 'rate_unavailable', message: error.message }); }
  if (req.body?.date !== quote.date || req.body?.rate !== quote.rate) {
    return res.status(409).json({ error: 'rate_changed', message: 'The reference rate changed. Reopen Currency to review the new rate before converting.' });
  }
  try {
    await db.transaction(async (tx) => {
      const user = await tx.prepare('SELECT currency FROM users WHERE id = ?').get(req.user.id);
      if (user?.currency !== quote.from) throw new Error('Currency changed elsewhere. Refresh and try again.');
      const linked = await tx.prepare("SELECT COUNT(*) AS n FROM entries e JOIN friendships f ON f.id = e.friendship_id WHERE e.owner_id = ? AND e.kind = 'money' AND f.user_id IS NOT NULL").get(req.user.id);
      if (linked.n) throw new Error('Linked people share your money lines. Currency conversion is paused for these ledgers so their balances cannot silently change.');
      const entries = await tx.prepare("SELECT id, amount FROM entries WHERE owner_id = ? AND kind = 'money'").all(req.user.id);
      const splits = await tx.prepare('SELECT id, amount, me_share, payer_kind FROM splits WHERE owner_id = ?').all(req.user.id);
      const updates = entries.map((entry) => [convertAmount(entry.amount, quote.rate), entry.id]);
      const splitUpdates = [];
      for (const split of splits) {
        const shares = await tx.prepare('SELECT friendship_id, amount FROM split_shares WHERE split_id = ? ORDER BY friendship_id').all(split.id);
        const values = distributeConverted([...shares.map((s) => s.amount), split.me_share], quote.rate);
        splitUpdates.push({ split, shares, values, total: convertAmount(split.amount, quote.rate) });
      }
      for (const [amount, id] of updates) await tx.prepare('UPDATE entries SET amount = ? WHERE id = ?').run(amount, id);
      for (const { split, shares, values, total } of splitUpdates) {
        await tx.prepare('UPDATE splits SET amount = ?, me_share = ? WHERE id = ?').run(total, values.at(-1), split.id);
        for (let i = 0; i < shares.length; i++) {
          await tx.prepare('UPDATE split_shares SET amount = ? WHERE split_id = ? AND friendship_id = ?').run(values[i], split.id, shares[i].friendship_id);
          if (split.payer_kind === 'me') await tx.prepare('UPDATE entries SET amount = ? WHERE split_id = ? AND friendship_id = ?').run(values[i], split.id, shares[i].friendship_id);
        }
        if (split.payer_kind === 'friend') await tx.prepare('UPDATE entries SET amount = ? WHERE split_id = ?').run(values.at(-1), split.id);
      }
      await tx.prepare('UPDATE groups SET currency = ? WHERE owner_id = ?').run(to, req.user.id);
      await tx.prepare('UPDATE users SET currency = ? WHERE id = ?').run(to, req.user.id);
    });
    const fresh = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({ user: await publicUser(fresh), quote });
  } catch (error) { res.status(409).json({ error: 'conversion_failed', message: error.message }); }
});

r.post('/onboarded', async (req, res) => {
  await db.prepare(`UPDATE users SET onboarded = 1 WHERE id = ?`).run(req.user.id);
  res.json({ ok: true });
});

/* -------------------------------- invites -------------------------------- */

r.get('/invites', async (req, res) => {
  const [friends, codes] = await Promise.all([
    db.prepare(`SELECT * FROM friendships WHERE owner_id = ? ORDER BY created_at DESC`).all(req.user.id),
    db.prepare(`SELECT * FROM invite_codes WHERE owner_id = ?`).all(req.user.id),
  ]);
  res.json({
    links: await Promise.all(friends.map(async (f) => ({
      friendshipId: f.id,
      name: f.name,
      token: await inviteTokenFor(f.id, req.user.id),
      claimed: !!f.user_id,
    }))),
    codes: codes.map((c) => ({ code: c.code, usedAt: c.used_at })),
    used: codes.filter((c) => c.used_at).length,
  });
});

r.post('/invites/code', rateLimit({ windowMs: 3600_000, max: 20, key: 'code' }), async (req, res) => {
  const existing = (await db.prepare(`SELECT COUNT(*) AS n FROM invite_codes WHERE owner_id = ?`).get(req.user.id)).n;
  if (req.user.plan === 'free' && existing >= 5) {
    return res.status(402).json({ error: 'limit_reached', message: 'Free accounts get 5 invite codes.' });
  }
  const code = `UDH-${Math.random().toString(36).slice(2, 6).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
  await db.prepare(`INSERT INTO invite_codes (code, owner_id, created_at) VALUES (?,?,?)`).run(code, req.user.id, now());
  res.status(201).json({ code });
});

/* -------------------------------- events --------------------------------- */

r.get('/events', async (req, res) => {
  const rows = await db
    .prepare(
      `SELECT e.*, f.name AS friend_name FROM events e
         LEFT JOIN friendships f ON f.id = e.friendship_id
        WHERE e.user_id = ? ORDER BY e.created_at DESC LIMIT 60`,
    )
    .all(req.user.id);
  const unread = (await db.prepare(`SELECT COUNT(*) AS n FROM events WHERE user_id = ? AND read = 0`).get(req.user.id)).n;
  res.json({
    unread,
    events: rows.map((e) => ({
      id: e.id,
      type: e.type,
      body: e.body,
      read: !!e.read,
      createdAt: e.created_at,
      friendshipId: e.friendship_id,
      entryId: e.entry_id,
      friendName: e.friend_name,
    })),
  });
});

r.post('/events/read', async (req, res) => {
  await db.prepare(`UPDATE events SET read = 1 WHERE user_id = ?`).run(req.user.id);
  res.json({ ok: true, unread: 0 });
});

r.delete('/events/:id', async (req, res) => {
  await db.prepare(`DELETE FROM events WHERE id = ? AND user_id = ?`).run(req.params.id, req.user.id);
  res.json({ ok: true });
});

/* ------------------------------ demo ledger ------------------------------ */

const DEMO = [
  {
    name: 'Arjun',
    note: 'Roomie since second year',
    entries: [
      { kind: 'money', direction: 'owed_to_me', amount: 450, note: 'Late-night food order, your half', daysAgo: 9 },
      { kind: 'money', direction: 'owed_to_me', amount: 1200, note: 'Flat Wi-Fi split', daysAgo: 21, due: 4 },
      { kind: 'favor', direction: 'owed_by_me', amount: 0, note: 'Help you shift to the new flat', daysAgo: 3 },
      { kind: 'money', direction: 'owed_by_me', amount: 180, note: 'Chai + maggi at 2am', daysAgo: 34, settled: true },
    ],
  },
  {
    name: 'Sana',
    note: 'The trip planner',
    entries: [
      { kind: 'money', direction: 'owed_to_me', amount: 2600, note: 'Goa stay deposit', daysAgo: 44, due: -6 },
      { kind: 'gesture', direction: 'owed_to_me', amount: 0, note: 'Make the playlist for the trip', daysAgo: 12 },
      { kind: 'money', direction: 'owed_by_me', amount: 320, note: 'Cab home after the gig', daysAgo: 6 },
    ],
  },
  {
    name: 'Kabir',
    note: 'Football every Sunday',
    entries: [
      { kind: 'money', direction: 'owed_by_me', amount: 900, note: 'Concert ticket he booked', daysAgo: 15, due: 10 },
      { kind: 'favor', direction: 'owed_to_me', amount: 0, note: 'Return my charger (the good one)', daysAgo: 40 },
      { kind: 'money', direction: 'owed_to_me', amount: 250, note: 'Turf booking, your share', daysAgo: 60, settled: true },
    ],
  },
  {
    name: 'Meera',
    note: 'College group project MVP',
    entries: [
      { kind: 'money', direction: 'owed_to_me', amount: 640, note: 'Prints + binding for the final report', daysAgo: 70 },
      { kind: 'gesture', direction: 'owed_by_me', amount: 0, note: 'Send her the final trip photos', daysAgo: 20 },
    ],
  },
];

r.post('/demo', rateLimit({ windowMs: 3600_000, max: 5, key: 'demo' }), async (req, res) => {
  if (!req.user.is_demo) return res.status(403).json({ error: 'not_demo', message: 'The demo ledger only loads on demo accounts.' });
  const existing = (await db.prepare(`SELECT COUNT(*) AS n FROM friendships WHERE owner_id = ?`).get(req.user.id)).n;
  if (existing > 0) {
    return res.status(409).json({ error: 'not_empty', message: 'Your ledger already has people in it.' });
  }
  const t = now();
  await db.transaction(async (tx) => {
    for (const person of DEMO) {
      const fid = newId('f');
      await tx.prepare(
        `INSERT INTO friendships (id, owner_id, handle, name, avatar_seed, note, created_at) VALUES (?,?,?,?,?,?,?)`,
      ).run(fid, req.user.id, `f_${fid.slice(-6)}`, person.name, Math.floor(Math.random() * 1e6), person.note, t);
      for (const e of person.entries) {
        const created = t - e.daysAgo * 86400000;
        await tx.prepare(
          `INSERT INTO entries (id, friendship_id, owner_id, kind, direction, amount, note, due_at, created_at, settled_at, status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        ).run(
          newId('e'),
          fid,
          req.user.id,
          e.kind,
          e.direction,
          e.amount,
          e.note,
          e.due !== undefined ? created + e.due * 86400000 : null,
          created,
          e.settled ? created + 5 * 86400000 : null,
          e.settled ? 'settled' : 'open',
        );
      }
    }
    const gid = newId('g');
    await tx.prepare(`INSERT INTO groups (id, owner_id, name, currency, avatar_seed, created_at) VALUES (?,?,?,?,?,?)`)
      .run(gid, req.user.id, 'Goa 2026', req.user.currency, Math.floor(Math.random() * 1e6), t);
    const members = (await tx.prepare(`SELECT id FROM friendships WHERE owner_id = ?`).all(req.user.id)).slice(0, 3);
    for (const m of members) {
      await tx.prepare(`INSERT INTO group_members (group_id, friendship_id, joined_at) VALUES (?,?,?)`).run(gid, m.id, t);
    }
  });
  await db.prepare(`UPDATE users SET onboarded = 1 WHERE id = ?`).run(req.user.id);
  const score = await syncHonor(req.user.id);
  res.json({ ok: true, honorScore: score, totals: await totalsFor(req.user.id) });
});

/* -------------------------------- avatar photo ----------------------------- */
r.post('/photo', validate(PhotoSchema), rateLimit({ windowMs: 3600_000, max: 20, key: 'photo' }), async (req, res) => {
  const url = await saveDataUrl(req.valid.dataUrl, `u-${req.user.id}`, db, req.user.id);
  if (!url) return res.status(400).json({ error: 'bad_image', message: 'That image did not survive the trip. Try a JPG or PNG.' });
  const old = (await db.prepare(`SELECT avatar_path FROM users WHERE id = ?`).get(req.user.id)).avatar_path;
  await db.prepare(`UPDATE users SET avatar_path = ? WHERE id = ?`).run(url, req.user.id);
  if (old && old !== url) await unlinkUrl(old);
  res.json({ ok: true, avatarUrl: url });
});

/* ------------------------------ delete account ---------------------------- */

r.delete('/account', rateLimit({ windowMs: 3600_000, max: 3, key: 'delete' }), async (req, res) => {
  const id = req.user.id;
  await db.transaction(async (tx) => {
    await tx.prepare(`DELETE FROM media WHERE owner_id = ?`).run(id);
    // Unlink, don't destroy, other people's books.
    await tx.prepare(`UPDATE friendships SET user_id = NULL WHERE user_id = ?`).run(id);
    await tx.prepare(`DELETE FROM friendships WHERE owner_id = ?`).run(id);
    await tx.prepare(`DELETE FROM groups WHERE owner_id = ?`).run(id);
    await tx.prepare(`DELETE FROM entries WHERE owner_id = ?`).run(id);
    await tx.prepare(`DELETE FROM events WHERE user_id = ?`).run(id);
    await tx.prepare(`DELETE FROM links WHERE owner_id = ?`).run(id);
    await tx.prepare(`DELETE FROM invite_codes WHERE owner_id = ?`).run(id);
    await tx.prepare(`DELETE FROM refresh_tokens WHERE user_id = ?`).run(id);
    await tx.prepare(`DELETE FROM users WHERE id = ?`).run(id);
  });
  res.clearCookie('at', { path: '/api/media' });
  res.json({ ok: true });
});

/* ------------------------------ share card ------------------------------- */

r.get('/card', async (req, res) => {
  const [totals, friends] = await Promise.all([totalsFor(req.user.id), friendsFor(req.user.id)]);
  const top = [...friends].filter((f) => f.net !== 0).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 3);
  res.json({
    name: req.user.name,
    handle: req.user.handle,
    currency: req.user.currency,
    net: totals.net,
    owedToYou: totals.owedToYou,
    youOwe: totals.youOwe,
    friends: totals.friends,
    activeFriends: totals.activeFriends,
    openEntries: totals.openEntries,
    disputedEntries: totals.disputedEntries,
    overdue: totals.overdue,
    favorsToYou: totals.favorsToYou,
    top: top.map((f) => ({ name: f.name, net: f.net })),
  });
});

export default r;
