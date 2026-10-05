/* Official Nucleo Sharp Essential glyphs, rendered at build time only. */
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as Sharp from 'nucleo-sharp-essential';

const target = 'public/js/ui/icons.js';
const names = {
  wallet: 'CreditCard', coins: 'PiggyBank', money: 'MoneyBillCoin', sound: 'VolumeUp', palette: 'DarkLight',
  device: 'Phone', receipt: 'Clipboard', fileExport: 'File', camera: 'Camera',
  ledger: 'BookBookmark', ledgerFill: 'BookBookmark', plus: 'Plus', minus: 'Minus',
  people: 'Users2', peopleFill: 'Users2', bell: 'Bell', bellFill: 'Bell',
  you: 'User', youFill: 'User', back: 'ChevronLeft', close: 'Xmark',
  check: 'Check', eye: 'EyeOpen', checkCircle: 'CircleHalfDottedCheck', chevR: 'ChevronRight',
  chevD: 'ChevronDown', share: 'Nodes', send: 'PaperPlane2', copy: 'Layers', trash: 'Trash',
  nudge: 'AlarmClock', rupee: 'MoneyBillCoin', hands: 'Handshake', heart: 'Heart2',
  heartFill: 'Heart2', backspace: 'Xmark', clock: 'Stopwatch', alert: 'TriangleWarning',
  settings: 'Gear2', logout: 'CircleLogout', download: 'SquareDottedArrowBottomRight', sparkle: 'LightbulbSparkle',
  crown: 'AwardCertificate', search: 'Magnifier', filter: 'Filter', calendar: 'CalendarDays',
  wifiOff: 'BoltSlash', shield: 'ShieldCheck', users: 'Users2', split: 'Layers3',
  edit: 'PenWriting4', moment: 'ImageSparkle', link: 'Link', lock: 'Lock', fire: 'Bolt', arrowUp: 'ChevronUp',
  arrowDown: 'ChevronDown', swap: 'FindReplace', info: 'CircleInfo',
  refresh: 'ArrowDottedRotateAnticlockwise', gift: 'Gift',
};

const icons = Object.fromEntries(Object.entries(names).map(([alias, name]) => {
  const component = Sharp[`Icon${name}`];
  if (!component) throw new Error(`Missing Nucleo Sharp icon: ${name}`);
  return [alias, renderToStaticMarkup(React.createElement(component, {
    className: `nucleo-sharp nucleo-${name}`, 'aria-hidden': 'true', focusable: 'false',
  }))];
}));

fs.writeFileSync(target, `/* Generated from Nucleo Sharp Essential by scripts/build-icons.mjs.\n   https://nucleoapp.com/free-sharp-icons — https://nucleoapp.com/license\n   React renders these SVGs at build time only; no React runtime is shipped. */\nexport const Icon = Object.freeze(${JSON.stringify(icons, null, 2)});\n\nexport function icon(name, cls = '') {\n  return \`<span class="ic \${cls}" aria-hidden="true">\${Icon[name] || ''}</span>\`;\n}\n`);
