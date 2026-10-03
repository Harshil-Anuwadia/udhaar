const CURRENCIES = new Set(['INR', 'USD', 'GBP', 'EUR', 'AED', 'SGD', 'AUD', 'CAD']);

export function convertAmount(amount, rate) {
  const converted = Math.round(Number(amount) * rate * 100) / 100;
  if (!Number.isFinite(converted) || converted > 1e12) throw new Error('Converted amount is out of range.');
  if (amount > 0 && converted === 0) throw new Error('One saved amount is too small to convert without disappearing.');
  return converted;
}

export function distributeConverted(parts, rate) {
  const total = convertAmount(parts.reduce((sum, n) => sum + Number(n), 0), rate);
  const cents = parts.map((part) => Math.round(convertAmount(part, rate) * 100));
  const difference = Math.round(total * 100) - cents.reduce((sum, n) => sum + n, 0);
  if (difference && cents.length) {
    const lastNonzero = parts.findLastIndex((part) => part > 0);
    cents[lastNonzero >= 0 ? lastNonzero : cents.length - 1] += difference;
  }
  if (cents.some((n, i) => parts[i] > 0 && n <= 0)) throw new Error('One split share is too small to convert safely.');
  return cents.map((n) => n / 100);
}

export async function latestRate(from, to) {
  if (!CURRENCIES.has(from) || !CURRENCIES.has(to) || from === to) throw new Error('Choose a different supported currency.');
  const response = await fetch(`https://api.frankfurter.dev/v2/rate/${from.toLowerCase()}/${to.toLowerCase()}`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Exchange rate is unavailable right now. Try again later.');
  const quote = await response.json();
  if (quote.base !== from || quote.quote !== to || !Number.isFinite(quote.rate) || quote.rate <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(quote.date)) {
    throw new Error('Exchange rate could not be verified.');
  }
  const age = Date.now() - Date.parse(`${quote.date}T00:00:00Z`);
  if (age < -86400000 || age > 7 * 86400000) throw new Error('The latest exchange rate is too old. Try again later.');
  return { from, to, rate: quote.rate, date: quote.date };
}
