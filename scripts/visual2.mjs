import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
mkdirSync('shots', { recursive: true });
const B = 'http://127.0.0.1:4173';
const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
const mk = async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  return ctx.newPage();
};
const api = async (method, path, body, token) => {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};

// --- 1. login wrong passcode shows inline error
let p = await mk();
await p.goto(B + '/');
await p.waitForSelector('[data-act="login"]') .catch(() => {});
const loginBtn = await p.$('[data-act="login"]');
if (loginBtn) { await loginBtn.click(); } else { await p.click('text=Log in'); }
await p.waitForSelector('#li-id');
await p.fill('#li-id', 'riya');
await p.click('[data-next]');
await p.waitForSelector('#li-pass');
await p.fill('#li-pass', 'wrongpass');
await p.click('[data-go]');
await p.waitForTimeout(1200);
const errText = await p.$eval('.authstep', (el) => el.textContent).catch(() => '');
console.log('login error visible:', /passcode|handle|doesn|match|wrong/i.test(errText));
await p.screenshot({ path: 'shots/27-login-error.png' });
await p.close();

// --- 2. dark mode with art (demo user, theme dark via profile)
p = await mk();
await p.goto(B + '/');
await p.waitForSelector('[data-act="demo"]');
await p.click('[data-act="demo"]');
await p.waitForSelector('.netcard');
const sess = await p.evaluate(() => localStorage.getItem('udhaar:session') || localStorage.getItem('at') || '');
// theme toggle through the You > theme sheet is UI-heavy; use the settings row instead:
await p.goto(B + '/#/you');
await p.waitForSelector('.profile-head');
await p.click('[data-act="theme"]');
await p.waitForSelector('.sheet');
await p.click('text=Dark');
await p.waitForTimeout(700);
await p.goto(B + '/#/');
await p.waitForSelector('.netcard');
await p.waitForTimeout(4300);
await p.screenshot({ path: 'shots/24-dark-home.png' });
await p.click('.person');
await p.waitForSelector('.swipe');
await p.waitForTimeout(500);
const row = await p.$('.swipe');
await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
await p.waitForTimeout(300);
await p.screenshot({ path: 'shots/25-dark-friend.png' });
await p.close();

// --- 3. join page shows the receipt photo
const s1 = await api('POST', '/api/auth/signup', { name: 'Ada' + Date.now().toString(36), secret: 'hunter22', contact: '', currency: 'INR' });
const t1 = s1.data.token;
const f1 = await api('POST', '/api/friends', { name: 'Bo', handle: '' }, t1);
const fid = f1.data.friend.id;
const e1 = await api('POST', '/api/entries', { friendshipId: fid, kind: 'money', direction: 'owed_to_me', amount: 320, note: 'Uber home', photo: TINY_JPEG }, t1);
const tok = e1.data.shareToken;
p = await mk();
await p.goto(B + `/#/join?token=${tok}`);
await p.waitForSelector('.photocard', { timeout: 10000 });
await p.waitForTimeout(1200); // let the boot splash finish leaving
console.log('join page shows receipt: true');
await p.screenshot({ path: 'shots/26-join-photo.png' });
await p.close();

await browser.close();
console.log('visual2 done');
