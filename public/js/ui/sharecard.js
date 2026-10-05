/* Renders the shareable "ledger card" to a canvas → PNG (Web Share / download). */

import { money, symbol, initials, withSymbol } from '../core/utils.js';

const W = 1080;
const H = 1350;

const PALETTES = [
  ['#315C45', '#315C45'], ['#53655C', '#53655C'], ['#47674F', '#47674F'],
  ['#626C58', '#626C58'], ['#405D59', '#405D59'], ['#435648', '#435648'],
];

function font(size, family = 'serif', weight = '400') {
  return `${weight} ${size}px ${family}`;
}

const SANS = `"DM Sans", -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;

/**
 * @param {object} d card data from /api/me/card (or hand-built for a friend card)
 */
/** Preload same-origin avatar photos for card rows. Never throws. */
export function loadRowImages(rows = []) {
  return Promise.all(rows.map((r) => new Promise((resolve) => {
    if (!r.avatarUrl) return resolve(null);
    const img = new Image();
    const timeout = setTimeout(() => resolve(null), 4000);
    img.onload = () => { clearTimeout(timeout); resolve({ name: r.name, img }); };
    img.onerror = () => { clearTimeout(timeout); resolve(null); };
    img.src = r.avatarUrl;
  }))).then((list) => Object.fromEntries(list.filter(Boolean).map((o) => [o.name, o.img])));
}

export function drawLedgerCard(d) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const INK = '#111713';
  const MUTE = '#626765';
  const RULE = '#CED3CE';
  const due = d.net < 0;
  const ACCENT = due ? '#985440' : '#236646';
  const rule = (y) => {
    x.strokeStyle = RULE;
    x.lineWidth = 2;
    x.beginPath(); x.moveTo(72, y); x.lineTo(W - 72, y); x.stroke();
  };
  const fitLabel = (value, maxWidth) => {
    let label = String(value);
    if (x.measureText(label).width <= maxWidth) return label;
    while (label.length > 2 && x.measureText(`${label}…`).width > maxWidth) label = label.slice(0, -1);
    return `${label}…`;
  };

  x.fillStyle = '#FFFFFF';
  x.fillRect(0, 0, W, H);

  // Same restrained typographic language as the in-app ledger.
  x.fillStyle = INK;
  x.font = font(54, SANS, '650');
  x.fillText('udhaar', 72, 123);
  const brandEnd = 72 + x.measureText('udhaar').width;
  x.fillStyle = '#236646';
  x.fillText('.', brandEnd + 1, 123);
  x.textAlign = 'right';
  x.fillStyle = MUTE;
  x.font = font(25, SANS, '600');
  x.fillText('LEDGER SNAPSHOT', W - 72, 113);
  x.textAlign = 'left';
  rule(163);

  x.fillStyle = MUTE;
  x.font = font(25, SANS, '600');
  x.fillText('MONEY BETWEEN PEOPLE', 72, 243);
  x.fillStyle = INK;
  x.font = font(72, SANS, '650');
  x.fillText(d.headline || (due ? 'I owe' : "I'm owed"), 72, 349);

  const amt = d.amountText || withSymbol(Math.abs(d.net || 0), d.currency);
  x.fillStyle = d.net === 0 ? INK : ACCENT;
  let size = 158;
  x.font = font(size, SANS, '650');
  while (x.measureText(amt).width > W - 144 && size > 78) {
    size -= 6;
    x.font = font(size, SANS, '650');
  }
  x.fillText(amt, 68, 510);
  x.fillStyle = MUTE;
  x.font = font(29, SANS, '400');
  x.fillText(d.subline || `${d.activeFriends ?? 0} people in the book`, 72, 566);
  rule(622);

  x.fillStyle = MUTE;
  x.font = font(25, SANS, '600');
  x.fillText('IN THE BOOK', 72, 688);

  let y = 770;
  const rows = d.rows ?? [];
  if (!rows.length) {
    x.fillStyle = MUTE;
    x.font = font(35, SANS, '400');
    x.fillText('No open balances yet.', 72, 780);
  }
  for (const row of rows.slice(0, 4)) {
    const [a, b] = PALETTES[(row.seed || 0) % PALETTES.length];
    const photo = d.rowImages?.[row.name];
    if (photo) {
      x.save();
      x.beginPath(); x.rect(75, y - 44, 62, 62); x.clip();
      const side = Math.min(photo.naturalWidth, photo.naturalHeight);
      x.drawImage(photo, (photo.naturalWidth - side) / 2, (photo.naturalHeight - side) / 2, side, side, 75, y - 44, 62, 62);
      x.restore();
    } else {
      x.fillStyle = b || a;
      x.fillRect(75, y - 44, 62, 62);
      x.fillStyle = '#fff';
      x.font = font(25, SANS, '600');
      x.textAlign = 'center';
      x.fillText(initials(row.name), 106, y - 5);
      x.textAlign = 'left';
    }
    x.fillStyle = INK;
    x.font = font(34, SANS, '600');
    x.fillText(fitLabel(row.name, 410), 164, y - 14);
    x.fillStyle = MUTE;
    x.font = font(25, SANS, '400');
    x.fillText(row.label || '', 164, y + 21);
    x.textAlign = 'right';
    x.fillStyle = row.net < 0 ? '#985440' : '#236646';
    x.font = font(33, SANS, '600');
    x.fillText(`${row.net < 0 ? '−' : '+'}${symbol(d.currency)}${money(Math.abs(row.net), d.currency)}`, W - 72, y + 3);
    x.textAlign = 'left';
    y += 98;
  }
  rule(1135);
  x.fillStyle = MUTE;
  x.font = font(25, SANS, '600');
  x.fillText('OPEN LINES', 72, 1185);
  x.fillStyle = INK;
  x.font = font(65, SANS, '650');
  x.fillText(String(d.openEntries ?? 0), 72, 1252);
  x.font = font(31, SANS, '600');
  x.fillText(d.openEntries ? 'Still in the book' : 'Nothing open', 320, 1214);
  x.fillStyle = MUTE;
  x.font = font(25, SANS, '400');
  x.fillText(fitLabel(d.disputedEntries ? `${d.disputedEntries} questioned ${d.disputedEntries === 1 ? 'line' : 'lines'} kept separately.` : d.openEntries ? 'The details stay here until you close them.' : 'The story stays, even after a line closes.', 688), 320, 1251);
  rule(1280);
  x.fillStyle = INK;
  x.font = font(25, SANS, '500');
  x.fillText(fitLabel(d.name ? `${d.name}${d.handle ? `  @${d.handle}` : ''}` : 'udhaar', 690), 72, 1318);
  x.textAlign = 'right';
  x.fillStyle = MUTE;
  x.font = font(24, SANS, '400');
  x.fillText('udhaar.app', W - 72, 1318);
  x.textAlign = 'left';
  return c;
}

export async function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 1));
}

export async function shareCanvas(canvas, { title, text, filename = 'udhaar-card.png' }) {
  const blob = await canvasToBlob(canvas);
  if (!blob) return { ok: false, reason: 'encode' };

  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text });
      return { ok: true, via: 'share' };
    } catch (e) {
      if (e?.name === 'AbortError') return { ok: false, reason: 'cancelled' };
    }
  }
  // Fallback: download the PNG.
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { ok: true, via: 'download', url };
}
