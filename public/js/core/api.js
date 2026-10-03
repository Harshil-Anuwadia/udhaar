/* API client: bearer auth, silent refresh, offline mutation queue. */

import { bus } from './store.js';

const LS_TOKEN = 'udhaar.at';
const LS_REFRESH = 'udhaar.rt';

let accessToken = null;
try { accessToken = localStorage.getItem(LS_TOKEN); } catch {}

const QUEUE_KEY = 'udhaar.queue';
const readQueue = () => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; } };
const writeQueue = (q) => { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {} };

export const pendingCount = () => readQueue().length;

function storeTokens(res) {
  if (!res) return;
  if (res.token) { accessToken = res.token; try { localStorage.setItem(LS_TOKEN, res.token); } catch {} }
  if (res.refreshToken) { try { localStorage.setItem(LS_REFRESH, res.refreshToken); } catch {} }
}

export function clearSession() {
  accessToken = null;
  try { localStorage.removeItem(LS_TOKEN); localStorage.removeItem(LS_REFRESH); } catch {}
}

export const hasSession = () => !!accessToken;

let refreshing = null;

async function refresh() {
  if (refreshing) return refreshing;
  const rt = (() => { try { return localStorage.getItem(LS_REFRESH); } catch { return null; } })();
  if (!rt) { refreshing = null; return false; }
  refreshing = (async () => {
    try {
      const r = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!r.ok) return false;
      const data = await r.json();
      storeTokens(data);
      bus.emit('user', data.user);
      return true;
    } catch { return false; }
    finally { refreshing = null; }
  })();
  return refreshing;
}

class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || 'Request failed');
    this.status = status;
    this.code = body?.error;
    this.body = body || {};
  }
}

async function send(method, path, body, { retry = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    throw new ApiError(0, { error: 'offline', message: 'No connection. Saved it — we’ll send it when you’re back online.' });
  }

  // Only treat 401 as "session ended" when we actually had a token to retry with;
  // a failed login must surface its own inline error, not bounce to the landing.
  if (res.status === 401 && retry && accessToken) {
    if (await refresh()) return send(method, path, body, { retry: false });
    clearSession();
    bus.emit('signed-out');
    throw new ApiError(401, { error: 'unauthenticated', message: 'Session ended.' });
  }

  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text.slice(0, 200) }; }

  if (!res.ok) {
    if (res.status === 402) bus.emit('paywall', data?.upsell);
    throw new ApiError(res.status, data || {});
  }
  if (data?.token) storeTokens(data);
  return data;
}

/** Queue a failed mutation so nothing is lost on a bad network. */
function enqueue(method, path, body) {
  const q = readQueue();
  q.push({ id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, method, path, body, at: Date.now() });
  writeQueue(q.slice(-40));
  bus.emit('queue', q.length);
}

export async function flushQueue() {
  const q = readQueue();
  if (!q.length) return { flushed: 0 };
  writeQueue([]);
  let flushed = 0;
  const failed = [];
  for (const item of q) {
    try {
      await send(item.method, item.path, item.body);
      flushed += 1;
    } catch {
      failed.push(item);
    }
  }
  if (failed.length) writeQueue(failed);
  bus.emit('queue', failed.length);
  return { flushed, failed: failed.length };
}

export const api = {
  get: (p) => send('GET', p),
  post: (p, b) => send('POST', p, b ?? {}),
  patch: (p, b) => send('PATCH', p, b ?? {}),
  del: (p) => send('DELETE', p),

  /** POST that survives being offline by queueing itself. */
  postSafe(p, b) {
    return send('POST', p, b ?? {}).catch((e) => {
      if (e.status === 0) { enqueue('POST', p, b ?? {}); throw e; }
      throw e;
    });
  },

  /* ---- endpoints ---- */
  signup: (payload) => send('POST', '/api/auth/signup', payload),
  login: (payload) => send('POST', '/api/auth/login', payload),
  logout: () => send('POST', '/api/auth/logout').catch(() => {}),
  me: () => send('GET', '/api/auth/me'),
  invite: (token) => send('GET', `/api/auth/invite/${encodeURIComponent(token)}`),

  friends: () => send('GET', '/api/friends'),
  addFriend: (payload) => send('POST', '/api/friends', payload),
  friend: (id) => send('GET', `/api/friends/${id}`),
  addMoment: (id, payload) => send('POST', `/api/friends/${id}/moments`, payload),
  removeMoment: (id, momentId) => send('DELETE', `/api/friends/${id}/moments/${momentId}`),
  updateFriend: (id, payload) => send('PATCH', `/api/friends/${id}`, payload),
  removeFriend: (id) => send('DELETE', `/api/friends/${id}`),
  reinvite: (id) => send('POST', `/api/friends/${id}/reinvite`),
  claim: (token, friendshipId = null) => send('POST', `/api/friends/link/${encodeURIComponent(token)}/claim`, friendshipId ? { friendshipId } : {}),

  addEntry: (payload) => send('POST', '/api/entries', payload).catch((e) => { if (e.status === 0) { enqueue('POST', '/api/entries', payload); } throw e; }),
  entries: (params = {}) => send('GET', `/api/entries?${new URLSearchParams(params)}`),
  settle: (id, amount) => send('POST', `/api/entries/${id}/settle`, amount != null ? { amount } : {}),
  reopen: (id) => send('POST', `/api/entries/${id}/reopen`),
  remind: (id) => send('POST', `/api/entries/${id}/remind`),
  dispute: (id) => send('POST', `/api/entries/${id}/dispute`),
  resolve: (id, outcome) => send('POST', `/api/entries/${id}/resolve`, { outcome }),
  removeEntry: (id) => send('DELETE', `/api/entries/${id}`),
  incoming: () => send('GET', '/api/entries/incoming/all'),
  insights: () => send('GET', '/api/entries/insights/summary'),

  groups: () => send('GET', '/api/groups'),
  group: (id) => send('GET', `/api/groups/${id}`),
  createGroup: (payload) => send('POST', '/api/groups', payload),
  updateGroup: (id, payload) => send('PATCH', `/api/groups/${id}`, payload),
  addMembers: (id, members) => send('POST', `/api/groups/${id}/members`, { members }),
  removeGroup: (id) => send('DELETE', `/api/groups/${id}`),
  previewSplit: (payload) => send('POST', '/api/groups/splits/preview', payload),
  createSplit: (payload) => send('POST', '/api/groups/splits', payload),
  removeSplit: (id) => send('DELETE', `/api/groups/splits/${id}`),

  stats: () => send('GET', '/api/me/stats'),
  card: () => send('GET', '/api/me/card'),
  invites: () => send('GET', '/api/me/invites'),
  makeCode: () => send('POST', '/api/me/invites/code'),
  events: () => send('GET', '/api/me/events'),
  readEvents: () => send('POST', '/api/me/events/read'),
  removeEvent: (id) => send('DELETE', `/api/me/events/${id}`),
  patchProfile: (payload) => send('PATCH', '/api/me/profile', payload),
  currencyQuote: (to) => send('GET', `/api/me/currency/quote?to=${encodeURIComponent(to)}`),
  changeCurrency: (quote) => send('POST', '/api/me/currency/change', { to: quote.to, rate: quote.rate, date: quote.date }),
  onboarded: () => send('POST', '/api/me/onboarded'),
  demo: () => send('POST', '/api/me/demo'),
};

export { ApiError };
