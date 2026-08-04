/**
 * Money is ALWAYS stored as integer minor units (e.g. paise for INR).
 * ₹100.00 -> 10000, ₹99.50 -> 9950. Never use floats for money.
 */

/** Parse a user-typed decimal string (e.g. "99.50") into integer minor units. */
export function parseToMinorUnits(input: string): number | null {
  const cleaned = input.replace(/[,₹$\s]/g, '').trim();
  if (!/^\d*\.?\d{0,2}$/.test(cleaned) || cleaned === '' || cleaned === '.') {
    return null;
  }
  const [whole = '0', frac = ''] = cleaned.split('.');
  const minor = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isSafeInteger(minor)) {
    return null;
  }
  return minor;
}

/** Convert minor units to a plain decimal string without currency symbol. */
export function minorToDecimal(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}${whole}.${frac}`;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

export function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? currency + ' ';
}

/** Format minor units with symbol and grouping, e.g. ₹1,23,456.50 (INR). */
export function formatMoney(minor: number, currency = 'INR'): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  const grouped = groupDigits(whole, currency === 'INR');
  return `${sign}${currencySymbol(currency)}${grouped}.${frac}`;
}

/** Indian digit grouping (1,23,456) vs western (123,456). */
function groupDigits(whole: number, indian: boolean): string {
  const s = String(whole);
  if (!indian) {
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  if (s.length <= 3) {
    return s;
  }
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

/** Compact display for dashboards, e.g. ₹12.4k. */
export function formatMoneyCompact(minor: number, currency = 'INR'): string {
  const abs = Math.abs(minor);
  const symbol = currencySymbol(currency);
  const sign = minor < 0 ? '-' : '';
  if (abs >= 10_000_000) {
    return `${sign}${symbol}${(abs / 10_000_000 / 100).toFixed(1)}Cr`;
  }
  if (abs >= 100_000) {
    return `${sign}${symbol}${(abs / 100_000 / 100).toFixed(1)}L`;
  }
  if (abs >= 100_000) {
    return `${sign}${symbol}${Math.round(abs / 100 / 1000)}k`;
  }
  if (abs >= 10000 * 100) {
    return `${sign}${symbol}${(abs / 100 / 1000).toFixed(1)}k`;
  }
  return formatMoney(minor, currency);
}
