import {SYSTEM_CATEGORY_IDS} from '../../database/seeds/defaultData';
import {dayjs} from '../../utils/date';
import {parseToMinorUnits} from '../../utils/money';

/**
 * On-device parser for Indian bank/UPI transaction alerts (SMS or pasted
 * email text). Pure functions — no I/O, no native calls — so the whole
 * surface is jest-tested. Returns null for anything that is not a money
 * movement (OTPs, promos, delivery spam).
 */

export type ParsedDirection = 'debit' | 'credit';

export interface ParsedTransactionMessage {
  direction: ParsedDirection;
  /** Integer minor units (paise). Never a float. */
  amountMinor: number;
  /** Merchant / payee / payer, best-effort. */
  merchant: string | null;
  /** Last 4 digits of the account/card, when present. */
  accountHint: string | null;
  /** Bank/UPI reference id, when present. */
  referenceId: string | null;
  /** epoch ms when the alert carries a parseable date, else null. */
  occurredAt: number | null;
  /** Keyword-guessed seeded category id (cat_other / cat_other_income fallback). */
  categoryId: string;
}

/* ------------------------------------------------------------------ */
/* Rejection rules                                                     */
/* ------------------------------------------------------------------ */

const OTP_PATTERN =
  /\b(otp|one[-\s]?time\s+password|verification\s+code|passcode)\b/i;

/** Marketing that mentions money but moves none. */
const PROMO_PATTERN =
  /\b(offer|deal|discount|cashback\s+offer|win\s+|prize|lottery|lucky\s+draw|pre[-\s]?approved|apply\s+now|shop\s+now|grab\s+|hurry|limited\s+period|t\s*&\s*c)\b/i;

const DIRECTION_WORDS =
  /\b(debited|credited|withdrawn|deposited|received|refunded|reversed|spent|paid|sent|purchase)\b/i;

function isNonTransaction(body: string): boolean {
  if (OTP_PATTERN.test(body)) {
    return true;
  }
  // Promos get rejected unless a real debit/credit verb is present.
  if (PROMO_PATTERN.test(body) && !DIRECTION_WORDS.test(body)) {
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Amount                                                              */
/* ------------------------------------------------------------------ */

/** "Rs.1,234.00" / "INR 500" / "₹1,050.50" (symbol before or after). */
const AMOUNT_PATTERNS = [
  /(?:\b(?:rs\.?|inr)\b|₹)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i,
  /\b([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:rs\.?|inr)\b/i,
];

function extractAmountMinor(body: string): number | null {
  for (const pattern of AMOUNT_PATTERNS) {
    const match = body.match(pattern);
    if (!match) {
      continue;
    }
    const minor = parseToMinorUnits(match[1]);
    if (minor != null && minor > 0) {
      return minor;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Direction                                                           */
/* ------------------------------------------------------------------ */

const CREDIT_WORDS = new Set([
  'credited',
  'deposited',
  'received',
  'refunded',
  'reversed',
]);
const DEBIT_WORDS = new Set(['debited', 'withdrawn', 'spent', 'paid', 'sent', 'purchase']);

function extractDirection(body: string): ParsedDirection | null {
  // First direction verb wins — alerts state the movement up front.
  const match = body.match(DIRECTION_WORDS);
  if (!match) {
    return null;
  }
  const word = match[1].toLowerCase();
  if (CREDIT_WORDS.has(word)) {
    return 'credit';
  }
  if (DEBIT_WORDS.has(word)) {
    return 'debit';
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Merchant / payee                                                    */
/* ------------------------------------------------------------------ */

const MERCHANT_TAIL_WORDS =
  'on|via|upi|ref|for|at|from|towards|using|through|thru';
const MERCHANT_TAIL = `(?=\\s+(?:${MERCHANT_TAIL_WORDS})\\b|[.,;]|$)`;
const MERCHANT_NAME = '([A-Za-z0-9][A-Za-z0-9 .&@\'_-]{1,50}?)';
/** Optional "Rs.1,234.00 " between the verb and "to" ("sent ₹500 to X"). */
const AMOUNT_SKIP =
  '(?:(?:\\b(?:rs\\.?|inr)\\b|₹)\\s*[0-9][0-9,]*(?:\\.\\d{1,2})?\\s+)?';

const MERCHANT_PATTERNS = [
  // "paid to Swiggy on ..." / "sent ₹500.00 to Ramesh Kumar from ..."
  new RegExp(
    `(?:paid|sent)\\s+${AMOUNT_SKIP}to\\s+${MERCHANT_NAME}${MERCHANT_TAIL}`,
    'i',
  ),
  // "credited ... from ACME CORP" / "received ... from Employer"
  new RegExp(`\\bfrom\\s+${MERCHANT_NAME}${MERCHANT_TAIL}`, 'i'),
  // "at AMAZON PAY INDIA on ..." / "towards BESCOM ELECTRICITY bill"
  new RegExp(`\\b(?:at|towards)\\s+${MERCHANT_NAME}${MERCHANT_TAIL}`, 'i'),
  // "Info: SALARY ACME CORP" / "Narration: UPI/SWIGGY/..."
  new RegExp(`\\b(?:info|narration)[:.\\s]+(?:upi/)?${MERCHANT_NAME}(?=[.,;/]|$)`, 'i'),
  // UPI VPA "to VPA swiggy@paytm"
  /\bto\s+vpa\s+([a-z0-9._-]+)(?:@([a-z]+))?/i,
];

function cleanMerchant(raw: string): string {
  return raw.replace(/\s+/g, ' ').replace(/[.,;:/_-]+$/, '').trim();
}

function extractMerchant(body: string): string | null {
  for (const pattern of MERCHANT_PATTERNS) {
    const match = body.match(pattern);
    if (!match) {
      continue;
    }
    const candidate = cleanMerchant(match[1]);
    // Reject stop-words and account/card references ("Axis Bank Card XX7788")
    // that leak in from loose phrasing.
    if (candidate.length < 2 || /^(your|the|a|an|you)$/i.test(candidate)) {
      continue;
    }
    if (/\d{4,}/.test(candidate)) {
      continue;
    }
    return candidate;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Account hint / reference / date                                     */
/* ------------------------------------------------------------------ */

const ACCOUNT_PATTERN =
  /\b(?:a\/c|acct?|account|card)\b[^0-9]{0,12}(?:x{1,6}|\*{1,6})?(\d{4})\b/i;

function extractAccountHint(body: string): string | null {
  const match = body.match(ACCOUNT_PATTERN);
  return match ? match[1] : null;
}

const REFERENCE_PATTERN =
  /\b(?:ref(?:erence)?\s*(?:no\.?|id)?|utr|upi\s*ref(?:erence)?)\s*[:.]?\s*([A-Za-z0-9]{6,20})\b/i;

function extractReferenceId(body: string): string | null {
  const match = body.match(REFERENCE_PATTERN);
  return match ? match[1] : null;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function toEpochMs(day: number, month: number, year: number): number | null {
  const fullYear = year < 100 ? 2000 + year : year;
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const value = dayjs()
    .year(fullYear)
    .month(month - 1)
    .date(day)
    .startOf('day');
  if (value.year() !== fullYear || value.month() !== month - 1 || value.date() !== day) {
    return null; // e.g. 31 Feb — dayjs silently rolls over, reject that.
  }
  return value.valueOf();
}

function extractOccurredAt(body: string): number | null {
  // dd-mm-yyyy / dd/mm/yy (day-first; swap when the first part can't be a day).
  const numeric = body.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/);
  if (numeric) {
    let day = Number(numeric[1]);
    let month = Number(numeric[2]);
    if (day > 12 && month <= 12) {
      // already day-first
    } else if (month > 12 && day <= 12) {
      [day, month] = [month, day];
    }
    const epoch = toEpochMs(day, month, Number(numeric[3]));
    if (epoch != null) {
      return epoch;
    }
  }
  // dd-MMM-yyyy
  const named = body.match(/\b(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{2,4})\b/);
  if (named) {
    const month = MONTH_NAMES[named[2].slice(0, 3).toLowerCase()];
    if (month) {
      return toEpochMs(Number(named[1]), month, Number(named[3]));
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Category guesser                                                    */
/* ------------------------------------------------------------------ */

/** Ordered: first matching rule wins. */
const CATEGORY_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  // Credit-specific
  [/\b(salary|payroll|stipend)\b/i, SYSTEM_CATEGORY_IDS.salary],
  [/\b(refund(?:ed)?|revers(?:al|ed)|chargeback|cashback)\b/i, SYSTEM_CATEGORY_IDS.refund],
  [/\b(freelance|upwork|fiverr|consulting)\b/i, SYSTEM_CATEGORY_IDS.freelance],
  // Expense families
  [/\b(swiggy|zomato|domino'?s|pizza|kfc|mcdonald'?s|burger|restaurant|cafe|eatery|bakery|chai\s*point|starbucks|food)\b/i, SYSTEM_CATEGORY_IDS.food],
  [/\b(bigbasket|blinkit|zepto|dunzo|grofers|dmart|grocery|groceries|kirana|instamart)\b/i, SYSTEM_CATEGORY_IDS.groceries],
  [/\b(uber|ola\b|rapido|irctc|redbus|metro|fuel|petrol|diesel|parking|toll|fastag)\b/i, SYSTEM_CATEGORY_IDS.transport],
  [/\b(amazon|flipkart|myntra|ajio|nykaa|meesho|shopping|mall)\b/i, SYSTEM_CATEGORY_IDS.shopping],
  [/\b(electricity|bescom|recharge|broadband|postpaid|prepaid|jio|airtel|\bvi\b|bsnl|gas\s+bill|water\s+bill|dth|bill\s+payment)\b/i, SYSTEM_CATEGORY_IDS.bills],
  [/\b(rent)\b/i, SYSTEM_CATEGORY_IDS.rent],
  [/\b(pharmacy|apollo|1mg|pharmeasy|hospital|clinic|medical|doctor|netmeds)\b/i, SYSTEM_CATEGORY_IDS.health],
  [/\b(netflix|hotstar|prime\s*video|spotify|bookmyshow|movie|cinema|pvr|inox|youtube)\b/i, SYSTEM_CATEGORY_IDS.entertainment],
  [/\b(udemy|coursera|byju'?s|school|college|tuition|exam|course)\b/i, SYSTEM_CATEGORY_IDS.education],
  [/\b(makemytrip|goibibo|oyo|cleartrip|flight|hotel|airbnb|indigo|airasia)\b/i, SYSTEM_CATEGORY_IDS.travel],
];

/**
 * Keyword → seeded category id. Direction-appropriate fallback:
 * cat_other for debits, cat_other_income for credits.
 */
export function guessCategoryId(
  direction: ParsedDirection,
  merchant: string | null,
  body: string,
): string {
  const haystack = `${merchant ?? ''} ${body}`;
  for (const [pattern, categoryId] of CATEGORY_RULES) {
    if (pattern.test(haystack)) {
      return categoryId;
    }
  }
  return direction === 'credit'
    ? SYSTEM_CATEGORY_IDS.otherIncome
    : SYSTEM_CATEGORY_IDS.other;
}

/* ------------------------------------------------------------------ */
/* Dedupe hash                                                         */
/* ------------------------------------------------------------------ */

/**
 * Stable FNV-1a hash of the normalized body + amount + direction. The same
 * alert re-scanned later (or pasted manually) produces the same hash, so the
 * UNIQUE dedupe_hash column keeps the inbox idempotent.
 */
export function computeDedupeHash(
  body: string,
  amountMinor: number,
  direction: ParsedDirection,
): string {
  const normalized = body.toLowerCase().replace(/\s+/g, ' ').trim();
  const input = `${normalized}|${amountMinor}|${direction}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    // eslint-disable-next-line no-bitwise -- FNV-1a is inherently bitwise.
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // eslint-disable-next-line no-bitwise -- unsigned 32-bit hex digest.
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

/**
 * Parse one bank/UPI alert. Returns null for OTPs, promos and anything that
 * lacks a clear amount + direction.
 */
export function parseBankMessage(body: string): ParsedTransactionMessage | null {
  if (!body || !body.trim()) {
    return null;
  }
  if (isNonTransaction(body)) {
    return null;
  }
  const amountMinor = extractAmountMinor(body);
  const direction = extractDirection(body);
  if (amountMinor == null || direction == null) {
    return null;
  }
  const merchant = extractMerchant(body);
  return {
    direction,
    amountMinor,
    merchant,
    accountHint: extractAccountHint(body),
    referenceId: extractReferenceId(body),
    occurredAt: extractOccurredAt(body),
    categoryId: guessCategoryId(direction, merchant, body),
  };
}
