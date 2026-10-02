const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
let token = null;
async function call(method, path, body, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.as) headers.Authorization = `Bearer ${opts.as}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (data.token) token = data.token;
  return { status: res.status, data };
}
const ok = (label, cond, extra='') => console.log(`${cond ? '✅' : '❌'} ${label}${cond ? '' : ' :: ' + JSON.stringify(extra).slice(0, 300)}`);

// 1. signup
let r = await call('POST', '/api/auth/signup', { name: 'Riya', secret: 'hunter22', contact: '', currency: 'INR' });
ok('signup', r.status === 201, r.data);
const riya = r.data.token;
ok('handle generated', !!r.data.user.handle, r.data.user);

// 2. add friends
r = await call('POST', '/api/friends', { name: 'Arjun', handle: '', note: 'roommate' });
ok('add friend', r.status === 201, r.data);
const fArjun = r.data.friend.id;
const inviteToken = r.data.inviteToken;
r = await call('POST', '/api/friends', { name: 'Sana', handle: '' });
ok('add friend 2', r.status === 201, r.data);
const fSana = r.data.friend.id;
r = await call('POST', '/api/friends', { name: 'Arjun', handle: '' });
ok('duplicate rejected', r.status === 409, r.data);

// 3. entries
r = await call('POST', '/api/entries', { friendshipId: fArjun, kind: 'money', direction: 'owed_to_me', amount: 450, note: 'Zomato your half' });
ok('log money entry', r.status === 201, r.data);
const e1 = r.data.entry.id;
r = await call('POST', '/api/entries', { friendshipId: fArjun, kind: 'favor', direction: 'owed_by_me', amount: 0, note: 'Return your charger' });
ok('log favour', r.status === 201, r.data);
const e2 = r.data.entry.id;
r = await call('POST', '/api/entries', { friendshipId: fArjun, kind: 'money', direction: 'owed_to_me', amount: 0, note: 'zero' });
ok('zero amount rejected', r.status === 400, r.data);

// 4. balances
r = await call('GET', '/api/friends');
ok('balance theyOwe=450', r.data.friends.find(f=>f.id===fArjun).theyOwe === 450, r.data.friends[0]);

// 5. stats & honor
r = await call('GET', '/api/me/stats');
ok('stats totals', r.data.totals.owedToYou === 450 && r.data.totals.youOwe === 0, r.data.totals);
ok('honor present', typeof r.data.honor.score === 'number', r.data.honor);

// 6. settle partially
r = await call('POST', `/api/entries/${e1}/settle`, { amount: 200 });
ok('partial settle', r.status === 200, r.data);
r = await call('GET', `/api/friends`);
const arjunAfter = r.data.friends.find(f=>f.id===fArjun);
ok('remaining 250', arjunAfter.theyOwe === 250, arjunAfter);

// 7. reminder throttle
r = await call('POST', `/api/entries/${e1}/remind`, {});
ok('remind ok', r.status === 200, r.data);
r = await call('POST', `/api/entries/${e1}/remind`, {});
ok('remind throttled', r.status === 429, r.data);

// 8. group + split
r = await call('POST', '/api/groups', { name: 'Goa', members: [fArjun, fSana] });
ok('create group', r.status === 201, r.data);
const gid = r.data.group.id;
r = await call('POST', '/api/groups/splits', { groupId: gid, title: 'Airbnb advance', amount: 3000, payer: { kind: 'me' }, shares: [{ friendshipId: fArjun, amount: 1000 }, { friendshipId: fSana, amount: 1000 }, ] });
ok('split sums must match', r.status === 400, r.data);
r = await call('POST', '/api/groups/splits', { groupId: gid, title: 'Airbnb advance', amount: 3000, payer: { kind: 'me' }, shares: [{ friendshipId: 'me', amount: 1000 }, { friendshipId: fArjun, amount: 1000 }, { friendshipId: fSana, amount: 1000 }] });
ok('split counts me', r.status === 201 && r.data.entries.length === 2 && r.data.entries.every((e) => e.amount === 1000 && e.direction === 'owed_to_me'), r.data);
const sid = r.data.splitId;
// friend paid: only MY share becomes a line, owed to the payer
r = await call('POST', '/api/groups/splits', { groupId: gid, title: 'Dinner', amount: 3000, payer: { kind: 'friend', friendshipId: fArjun }, shares: [{ friendshipId: 'me', amount: 1000 }, { friendshipId: fArjun, amount: 1000 }, { friendshipId: fSana, amount: 1000 }] });
ok('friend paid -> only my line', r.status === 201 && r.data.entries.length === 1 && r.data.entries[0].direction === 'owed_by_me' && r.data.entries[0].amount === 1000, r.data);
const myLineId = r.data.entries[0].id;
r = await call('POST', `/api/entries/${myLineId}/remind`, {});
ok('remind blocked on what I owe', r.status === 400, r.data);
// friend paid but I'm not in it -> nothing to log against me
r = await call('POST', '/api/groups/splits', { groupId: gid, title: 'Their dinner', amount: 2000, payer: { kind: 'friend', friendshipId: fArjun }, shares: [{ friendshipId: fArjun, amount: 1000 }, { friendshipId: fSana, amount: 1000 }] });
ok('friend paid without me rejected', r.status === 400, r.data);
r = await call('GET', `/api/groups/${gid}`);
ok('group outstanding 2000', r.data.group.outstanding === 2000, r.data.group);

// 9. undo split removes only its own open lines
r = await call('DELETE', `/api/groups/splits/${sid}`);
ok('undo split', r.status === 200, r.data);
r = await call('GET', `/api/groups/${gid}`);
ok('undo removed only its lines', r.data.entries.filter((e) => e.status === 'open').length === 1, r.data.entries);

// 10. second user joins via invite link
const tok2 = (await call('GET', '/api/friends')).data; // keep riya token
let r2 = await fetch(BASE + '/api/auth/signup', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: 'Arjun Real', secret: 'hunter33', contact: 'arjun@x.io' }) });
const arjun = await r2.json();
ok('signup user 2', r2.status === 201, arjun);
let rc = await fetch(BASE + `/api/friends/link/${inviteToken}/claim`, { method: 'POST', headers: { Authorization: `Bearer ${arjun.token}` } });
ok('claim invite', rc.status === 200, await rc.json());

// 11. riya sees linked friend + event
r = await call('GET', '/api/friends');
ok('friend linked', r.data.friends.find(f=>f.id===fArjun).linked === true, r.data.friends.find(f=>f.id===fArjun));
r = await call('GET', '/api/me/events');
ok('friend_joined event', r.data.events.some(e=>e.type==='friend_joined'), r.data.events);

// 12. arjun sees incoming entries (mirrored)
let ri = await fetch(BASE + '/api/entries/incoming/all', { headers: { Authorization: `Bearer ${arjun.token}` } });
const inc = await ri.json();
ok('incoming mirrored direction', inc.entries.some((e) => e.direction === 'owed_to_me' && e.amount === 1000 && /my share/.test(e.note || '')) && inc.entries.some((e) => e.direction === 'owed_by_me'), inc.entries);

// 20. refresh via JSON body + rotation
const savedToken = token;
r = await call('POST', '/api/auth/signup', { name: 'Ref', secret: 'hunter22', contact: 'ref@udhaar.app', currency: 'INR' });
ok('signup for refresh flow', r.status === 201, r.data);
const rt0 = r.data.refreshToken;
r = await call('POST', '/api/auth/refresh', { refreshToken: rt0 });
ok('refresh via json body', r.status === 200 && !!r.data.token, r.data);
const rt1 = r.data.refreshToken;
r = await call('POST', '/api/auth/refresh', { refreshToken: rt0 });
ok('old refresh token rotated out', r.status === 401, r.data);
token = r.data.token || token;

// 21. delete account kills the token
const delTok = (await call('POST', '/api/auth/refresh', { refreshToken: rt1 })).data.token;
r = await call('DELETE', '/api/me/account', null, { as: delTok });
ok('delete account', r.status === 200, r.data);
r = await call('GET', '/api/me', null, { as: delTok });
ok('token dead after delete', r.status === 401, r.data);
token = savedToken;


// 13. rate limits on auth
let rl = 0;
for (let i=0;i<30;i++) { const x = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id: 'nope', secret: 'nope' }) }); if (x.status === 429) rl = x.status; }
ok('auth rate limited', rl === 429, rl);

// 14. card
r = await call('GET', '/api/me/card');
ok('card data', typeof r.data.honorScore === 'number', r.data);

// 15. export endpoints / health
r = await call('GET', '/api/health');
ok('health', r.status === 200);

// 16. validation
r = await call('POST', '/api/friends', { name: '' });
ok('name required', r.status === 400, r.data);

// 17. free plan limits (friends cap 8)
for (let i=0;i<10;i++) await call('POST', '/api/friends', { name: `P${i}` });
r = await call('POST', '/api/friends', { name: 'Overflow' });
ok('free cap enforced', r.status === 402, r.data);

// 18. profile patch + currency
r = await call('PATCH', '/api/me/profile', { currency: 'USD', theme: 'dark', plan: 'plus' });
ok('profile patch + plan', r.data.user.currency === 'USD' && r.data.user.plan === 'plus', r.data.user);

// 19. logout then refresh
r = await call('POST', '/api/auth/logout');
ok('logout', r.status === 200, r.data);

// 22. photos: receipt on an entry + avatar
const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
token = riya;
r = await call('POST', '/api/entries', { friendshipId: fArjun, kind: 'money', direction: 'owed_by_me', amount: 80, note: 'with receipt', photo: TINY_JPEG });
ok('entry with receipt photo', r.status === 201 && !!r.data.entry.photo, r.data);
const photoUrl = r.data.entry?.photo;
if (photoUrl) {
  const pr = await fetch(BASE + photoUrl);
  ok('photo served', pr.status === 200 && (pr.headers.get('content-type') || '').includes('image'));
}
r = await call('POST', '/api/entries', { friendshipId: fArjun, kind: 'money', direction: 'owed_by_me', amount: 5, note: 'bad photo', photo: 'data:image/jpeg;base64,AAAA' });
ok('fake receipt rejected clearly', r.status === 400 && r.data.error === 'bad_image', r.data);
r = await call('POST', '/api/me/photo', { dataUrl: TINY_JPEG });
ok('avatar upload', r.status === 200 && !!r.data.avatarUrl, r.data);
r = await call('POST', '/api/me/photo', { dataUrl: 'data:text/html;base64,PHA+' });
ok('avatar rejects non-image', r.status === 400, r.data);

console.log('\nE2E complete.');
