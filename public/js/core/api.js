/* API client: bearer auth, silent refresh, offline mutation queue. */

import { bus } from './store.js';

const LS_TOKEN = 'udhaar.at';
const LS_REFRESH = 'udhaar.rt';

let accessToken = null;
try { accessToken = localStorage.getItem(LS_TOKEN); } catch {}

const QUEUE_KEY = 'udhaar.queue'; // Legacy queue, retained until safely migrated.
const ITEM_PREFIX = 'udhaar.queue.v2.';
const tokenOwner = (token) => {
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || null; }
  catch { return null; }
};
let accountId = tokenOwner(accessToken);
let sessionVersion = 0;
function readQueue() {
  try {
    const legacy = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    if (!Array.isArray(legacy)) throw new Error('Invalid queue');
    const items = [...legacy];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(ITEM_PREFIX)) items.push(JSON.parse(localStorage.getItem(key)));
    }
    // A migrated legacy record may exist in both forms after an interrupted save.
    return [...new Map(items.map(item => [item.id, item])).values()].sort((a, b) => a.at - b.at);
  } catch { throw new ApiError(507, { error: 'queue_unavailable', message: 'Pending entries could not be read. Keep this browser data and try again.' }); }
}
function persistItem(item) {
  try { localStorage.setItem(ITEM_PREFIX + item.id, JSON.stringify(item)); }
  catch { throw new ApiError(507, { error: 'queue_full', message: 'This entry could not be saved on this device. Free storage and retry.' }); }
}
function removeItem(item) {
  // Independent keys prevent concurrent tabs/new writes overwriting one another.
  localStorage.removeItem(ITEM_PREFIX + item.id);
  const legacy = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  if (legacy.some(row => row.id === item.id)) localStorage.setItem(QUEUE_KEY, JSON.stringify(legacy.filter(row => row.id !== item.id)));
}
export const pendingCount = () => readQueue().filter(item => accountId && (!item.ownerId || item.ownerId === accountId)).length;
export function clearPendingForAccount() {
  for (const item of readQueue()) if (item.ownerId === accountId) removeItem(item);
  bus.emit('queue', pendingCount());
}

function storeTokens(res) {
  if (!res) return;
  if (res.token) {
    const owner = res.user?.id || tokenOwner(res.token);
    if (owner !== accountId) sessionVersion++;
    accountId = owner;
    accessToken = res.token; try { localStorage.setItem(LS_TOKEN, res.token); } catch {} }
  if (res.refreshToken) { try { localStorage.setItem(LS_REFRESH, res.refreshToken); } catch {} }
}

export function clearSession() {
  accessToken = null;
  accountId = null;
  sessionVersion++;
  bus.emit('queue', 0);
  try { localStorage.removeItem(LS_TOKEN); localStorage.removeItem(LS_REFRESH); } catch {}
}

export const hasSession = () => !!accessToken;

let refreshing = null;

async function refresh() {
  if (refreshing) return refreshing;
  const rt = (() => { try { return localStorage.getItem(LS_REFRESH); } catch { return null; } })();
  if (!rt) { refreshing = null; return false; }
  const version = sessionVersion;
  refreshing = (async () => {
    try {
      const r = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!r.ok) return false;
      const data = await r.json();
      if (version !== sessionVersion) return false;
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
  const version = sessionVersion;
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    throw new ApiError(0, { error: 'offline', message: 'No connection. Please try again when you’re online.' });
  }

  // Only treat 401 as "session ended" when we actually had a token to retry with;
  // a failed login must surface its own inline error, not bounce to the landing.
  if (version !== sessionVersion) throw new ApiError(409, { error: 'session_changed', message: 'The signed-in account changed. Your pending entry stays with its original account.' });
  if (res.status === 401 && retry && accessToken) {
    const refreshed = await refresh();
    if (version !== sessionVersion) throw new ApiError(409, { error: 'session_changed', message: 'The signed-in account changed.' });
    if (refreshed) return send(method, path, body, { retry: false });
    clearSession();
    bus.emit('signed-out');
    throw new ApiError(401, { error: 'unauthenticated', message: 'Session ended.' });
  }

  let data = null;
  let text;
  try { text = await res.text(); }
  catch { throw new ApiError(0, { error: 'offline', message: 'The response was interrupted. Please retry.' }); }
  if (version !== sessionVersion) throw new ApiError(409, { error: 'session_changed', message: 'The signed-in account changed.' });
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text.slice(0, 200) }; }

  if (!res.ok) {
    if (res.status === 402) bus.emit('paywall', data?.upsell);
    throw new ApiError(res.status, data || {});
  }
  if (data?.token) storeTokens(data);
  return data;
}

/** Persist before sending, and acknowledge only this record after success. */
function safeEntry(body) {
  if (!accountId) return Promise.reject(new ApiError(401, { error: 'unauthenticated', message: 'Sign in before saving an entry.' }));
  const id = crypto.randomUUID();
  const payload = JSON.parse(JSON.stringify({ ...body, mutationId: body?.mutationId || id }));
  const item = { id, ownerId: accountId, method: 'POST', path: '/api/entries', body: payload, at: Date.now() };
  try { persistItem(item); }
  catch (error) { return Promise.reject(error); }
  bus.emit('queue', pendingCount());
  return send(item.method, item.path, payload).then(result => {
    removeItem(item);
    bus.emit('queue', pendingCount());
    return result;
  }).catch(error => {
    if (error.status === 0 || error.status >= 500 || error.code === 'session_changed') {
      error.body.queued = true;
      error.message = 'Saved on this device. We’ll retry confirmation when you’re connected.';
    } else removeItem(item);
    bus.emit('queue', pendingCount());
    throw error;
  });
}

let flushing = null;
export function flushQueue() {
  if (flushing) return flushing;
  const owner = accountId;
  const version = sessionVersion;
  if (!owner) return Promise.resolve({ flushed: 0, failed: 0 });
  flushing = (async () => {
    let flushed = 0;
    for (let item of readQueue()) {
      if (version !== sessionVersion) break;
      if (item.ownerId && item.ownerId !== owner) continue;
      if (!item.ownerId) {
        // Old releases did not record owners. A read-only ownership check is
        // required before migrating their entries; never guess the new account.
        if (item.path !== '/api/entries' || !item.body?.friendshipId) continue;
        try { await send('GET', `/api/friends/${encodeURIComponent(item.body.friendshipId)}`); }
        catch { continue; }
        if (version !== sessionVersion) break;
        item = { ...item, ownerId: owner, body: { ...item.body, mutationId: item.body.mutationId || `legacy_${item.id}` } };
        persistItem(item);
      }
      try {
        await send(item.method, item.path, item.body);
        removeItem(item);
        flushed++;
      } catch { /* Keep every unacknowledged record for recovery. */ }
    }
    const failed = pendingCount();
    bus.emit('queue', failed);
    return { flushed, failed };
  })().finally(() => { flushing = null; });
  return flushing;
}

export const api = {
  get: (p) => send('GET', p),
  post: (p, b) => send('POST', p, b ?? {}),
  patch: (p, b) => send('PATCH', p, b ?? {}),
  del: (p) => send('DELETE', p),

  /** Only entries currently have a server-enforced retry identifier. */
  postSafe(p, b) {
    return p === '/api/entries' ? safeEntry(b ?? {}) : send('POST', p, b ?? {});
  },

  /* ---- endpoints ---- */
  signup: (payload) => send('POST', '/api/auth/signup', payload),
  login: (payload) => send('POST', '/api/auth/login', payload),
  logout: () => {
    let refreshToken;
    try { refreshToken = localStorage.getItem(LS_REFRESH); } catch {}
    return send('POST', '/api/auth/logout', { refreshToken }).catch(() => {});
  },
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

  addEntry: (payload) => safeEntry(payload),
  exportEntries: () => send('GET', '/api/entries/export'),
  entries: (params = {}) => send('GET', `/api/entries?${new URLSearchParams(params)}`),
  settle: (id, amount) => send('POST', `/api/entries/${id}/settle`, amount != null ? { amount } : {}),
  reopen: (id, settlementId) => send('POST', `/api/entries/${id}/reopen`, settlementId ? { settlementId } : {}),
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
