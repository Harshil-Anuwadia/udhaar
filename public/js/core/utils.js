/* Small, dependency-free helpers. */

export const CURRENCY = {
  INR: { symbol: '₹', locale: 'en-IN', name: 'Indian Rupee' },
  USD: { symbol: '$', locale: 'en-US', name: 'US Dollar' },
  GBP: { symbol: '£', locale: 'en-GB', name: 'Pound' },
  EUR: { symbol: '€', locale: 'de-DE', name: 'Euro' },
  AED: { symbol: 'AED', locale: 'en-AE', name: 'Dirham' },
  SGD: { symbol: 'S$', locale: 'en-SG', name: 'Singapore Dollar' },
  AUD: { symbol: 'A$', locale: 'en-AU', name: 'Australian Dollar' },
  CAD: { symbol: 'C$', locale: 'en-CA', name: 'Canadian Dollar' },
};

let CUR = 'INR';
export const setCurrency = (c) => { CUR = CURRENCY[c] ? c : 'INR'; };
export const currencyCode = () => CUR;
export const symbol = (c = CUR) => (CURRENCY[c] || CURRENCY.INR).symbol;

/** 4500 -> "4,500" using the active locale; never shows paise. */
export function money(amount, code = CUR) {
  const c = CURRENCY[code] || CURRENCY.INR;
  const n = Math.round(Number(amount) || 0);
  try {
    return new Intl.NumberFormat(c.locale, { maximumFractionDigits: 0 }).format(Math.abs(n));
  } catch {
    return String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
}

export function withSymbol(amount, code = CUR) {
  const n = Math.round(Number(amount) || 0);
  return `${n < 0 ? '−' : ''}${symbol(code)}${money(Math.abs(n), code)}`;
}

/** Spoken-language magnitude for big numbers: 1.2L, 3.4Cr, 12K */
export function shortMoney(amount, code = CUR) {
  const n = Math.abs(Math.round(Number(amount) || 0));
  const s = symbol(code);
  if (code === 'INR') {
    if (n >= 1e7) return `${s}${(n / 1e7).toFixed(n >= 1e8 ? 0 : 1)}Cr`;
    if (n >= 1e5) return `${s}${(n / 1e5).toFixed(n >= 1e6 ? 0 : 1)}L`;
  }
  if (n >= 1e6) return `${s}${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${s}${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return `${s}${n}`;
}

const DAY = 86400000;

export function relTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const future = diff < 0;
  const d = Math.abs(diff);
  if (d < 60_000) return future ? 'in a moment' : 'just now';
  if (d < 3600_000) { const m = Math.round(d / 60_000); return future ? `in ${m}m` : `${m}m ago`; }
  if (d < DAY) { const h = Math.round(d / 3600_000); return future ? `in ${h}h` : `${h}h ago`; }
  if (d < 7 * DAY) { const n = Math.round(d / DAY); return future ? `in ${n}d` : `${n}d ago`; }
  if (d < 60 * DAY) { const w = Math.round(d / (7 * DAY)); return future ? `in ${w}w` : `${w}w ago`; }
  return formatDate(ts);
}

export function daysBetween(a, b) {
  return Math.round((b - a) / DAY);
}

export function formatDate(ts, opts = {}) {
  const d = new Date(ts);
  const options = { day: 'numeric', month: 'short', year: '2-digit', ...opts };
  if (options.year === false) delete options.year;
  return d.toLocaleDateString(undefined, options);
}

export function dueLabel(ts) {
  if (!ts) return null;
  const days = Math.ceil((ts - Date.now()) / DAY);
  if (days < -1) return `${Math.abs(days)} days overdue`;
  if (days === -1 || days === 0) return days < 0 ? 'due yesterday' : 'due today';
  if (days === 1) return 'due tomorrow';
  if (days <= 30) return `due in ${days} days`;
  return `due ${formatDate(ts)}`;
}

/* --------------------------------- DOM ---------------------------------- */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function debounce(fn, ms = 220) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ------------------------------ device bits ------------------------------ */

export function buzz(pattern = 8) {
  try { navigator.vibrate?.(pattern); } catch {}
}

export const isTouch = () => matchMedia('(hover: none)').matches;

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch {}
  try {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0', top: '0' } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

export async function share(data) {
  if (navigator.share) {
    try { await navigator.share(data); return 'native'; } catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  if (data.url) {
    const wa = `https://wa.me/?text=${encodeURIComponent(`${data.text ? data.text + '\n' : ''}${data.url}`)}`;
    window.open(wa, '_blank', 'noopener,noreferrer');
    return 'whatsapp';
  }
  return await copyText(data.text || data.url || '') ? 'copied' : 'failed';
}

/* -------------------------------- avatars -------------------------------- */

const PALETTES = [
  ['#8A5A44', '#6B4331'], ['#5B6B8C', '#414F6B'], ['#6E7B52', '#50593B'],
  ['#8C6E3F', '#68512C'], ['#7A5A80', '#59405E'], ['#4E7676', '#37575A'],
  ['#96564A', '#6F3D34'], ['#5F6E4E', '#46523A'], ['#8A4F63', '#63384A'],
  ['#4A5F8C', '#344566'], ['#7A6248', '#594734'], ['#565A8C', '#3E4166'],
];

export function avatarStyle(seed = 0) {
  const n = Math.abs(Number(seed) || 0);
  const [a, b] = PALETTES[n % PALETTES.length];
  const angle = (n % 7) * 47 + 20;
  return `background:linear-gradient(${angle}deg,${a},${b})`;
}

export function initials(name = '?') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function avatarHTML({ name, seed, size = 40, cls = '', avatarUrl }) {
  const inner = avatarUrl
    ? `<img src="${esc(avatarUrl)}" alt="" loading="lazy">`
    : `<span>${esc(initials(name))}</span>`;
  return `<span class="avatar avatar--${size} ${cls}" style="${avatarUrl ? 'background:var(--card)' : avatarStyle(seed)}" aria-hidden="true">${inner}</span>`;
}

/** Camera/file -> downscaled JPEG data-url, drawn on white. Keeps uploads tiny. */
export function fileToDataUrl(file, maxDim = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!(file instanceof Blob) || (file.type && !/^image\/(jpeg|png|webp)$/.test(file.type))) {
      reject(new Error('Choose a JPG, PNG or WebP image.'));
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      reject(new Error('That image is too large. Choose one under 15 MB.'));
      return;
    }
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) return reject(new Error('Could not prepare that image.'));
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.src = fr.result;
    };
    fr.onerror = () => reject(new Error('Could not read that file.'));
    fr.readAsDataURL(file);
  });
}

/* --------------------------------- misc ---------------------------------- */

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

/** Suggested amounts, tuned to how Indian friend-groups actually transact. */
export function quickAmounts() {
  if (CUR !== 'INR') return [5, 10, 20, 50, 100];
  return [50, 100, 200, 500, 1000];
}

export function noteSuggestions(kind, direction) {
  if (kind !== 'money') {
    return direction === 'owed_to_me'
      ? ['Return my charger', 'Cover my shift', 'Send the photos', 'Pick up the parcel']
      : ['Help you move', 'Return your book', 'Station drop-off', 'Check your CV'];
  }
  return direction === 'owed_to_me'
    ? ['Dinner split', 'Cab home', 'Wi-Fi bill', 'Concert ticket', 'Birthday gift', 'Canteen run']
    : ['Chai on me', 'My half of dinner', 'Ticket you grabbed', 'Shared subscription'];
}
