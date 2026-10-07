/* The journal works with complete, viewer-oriented entries. Money stays in cents. */
const cents = value => Math.round((Number(value) || 0) * 100);

export function localDay(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function ledgerSummary(entries) {
  let owed = 0, owe = 0;
  const result = { count: entries.length, open: 0, settled: 0, questioned: 0 };
  for (const entry of entries) {
    if (entry.status === 'open') {
      result.open++;
      if (entry.kind === 'money') {
        if (entry.direction === 'owed_to_me') owed += cents(entry.amount);
        else owe += cents(entry.amount);
      }
    } else if (entry.status === 'settled') result.settled++;
    else if (entry.status === 'disputed') result.questioned++;
  }
  return { ...result, owedToYou: owed / 100, youOwe: owe / 100, net: (owed - owe) / 100 };
}

export function filterLedger(entries, { status = 'all', direction = 'all', month = 'all', search = '' } = {}, now = Date.now()) {
  const query = search.trim().toLocaleLowerCase();
  return entries.filter(entry => {
    if (status === 'overdue') {
      if (entry.status !== 'open' || !entry.dueAt || entry.dueAt >= now) return false;
    } else if (status !== 'all' && entry.status !== status) return false;
    if (direction !== 'all' && entry.direction !== direction) return false;
    if (month !== 'all' && localDay(entry.createdAt).slice(0, 7) !== month) return false;
    const kindName = entry.kind === 'favor' ? 'favour' : entry.kind === 'gesture' ? 'promise' : 'money';
    return !query || [entry.note, entry.friend?.name, entry.friend?.handle, entry.kind, kindName].some(value => String(value || '').toLocaleLowerCase().includes(query));
  });
}

export function journalDays(items) {
  const groups = new Map();
  for (const item of [...items].sort((a, b) => (b.at ?? b.createdAt) - (a.at ?? a.createdAt) || String(b.id).localeCompare(String(a.id)))) {
    const key = localDay(item.at ?? item.createdAt);
    if (!groups.has(key)) groups.set(key, { key, at: item.at ?? item.createdAt, items: [] });
    groups.get(key).items.push(item);
  }
  return [...groups.values()];
}

export function paymentPreview(raw, outstanding) {
  const text = String(raw).trim();
  const invalid = error => ({ valid: false, amount: 0, remaining: outstanding, error });
  if (!/^\d+(?:\.\d{1,2})?$/.test(text) || cents(text) <= 0) return invalid('Enter an amount above zero, with up to two decimal places.');
  const amount = cents(text);
  const available = cents(outstanding);
  if (amount > available) return invalid('This is more than the outstanding amount.');
  return { valid: true, amount: amount / 100, remaining: (available - amount) / 100, error: '' };
}
