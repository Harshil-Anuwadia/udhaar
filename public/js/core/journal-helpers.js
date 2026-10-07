/* The journal works with complete, viewer-oriented entries. Money stays in cents. */
const cents = value => Math.round((Number(value) || 0) * 100);

export function localDay(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
