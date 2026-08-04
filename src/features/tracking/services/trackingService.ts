import {
  getAccountsRepository,
  getCategoriesRepository,
  getSettingsRepository,
  getTransactionsRepository,
} from '../../../database/repositories';
import {bumpDataVersion} from '../../../store/dataVersionStore';
import {
  computeDedupeHash,
  extractInstrument,
  getSmsInbox,
  guessCategoryId,
  hasSmsPermission,
  parseBankMessage,
} from '../../../services/sms';
import type {
  ParsedInstrument,
  ParsedTransactionMessage,
} from '../../../services/sms';
import type {SummaryProvider} from '../../../services/openrouter';
import type {PaymentMethod} from '../../transactions/schemas/transactionFormSchema';
import {
  getDetectedExpensesRepository,
} from './detectedExpensesRepository';
import type {DetectedExpense} from './detectedExpensesRepository';
import {analyzeMessageWithAi} from './aiSmsAnalysis';
import type {AiSmsAnalysis} from './aiSmsAnalysis';

/**
 * Orchestration for auto-tracking: scan the SMS inbox / accept pasted text,
 * parse on-device, dedupe, stage rows in detected_expenses, and turn approved
 * rows into real transactions.
 */

export const TRACKING_SETTINGS_KEYS = {
  /** Master switch: 'true' | 'false' (absent = false). */
  smsTrackingEnabled: 'smsTrackingEnabled',
  /** Scan when the review screen gains focus: 'true' | 'false' (default off). */
  smsAutoScanOnOpen: 'smsAutoScanOnOpen',
} as const;

const SCAN_MESSAGE_COUNT = 50;

export interface ScanResult {
  scanned: number;
  inserted: number;
  skipped: number;
}

async function stageMessage(
  source: 'sms' | 'manual',
  rawBody: string,
  parsed: ParsedTransactionMessage,
  fallbackOccurredAt: number,
): Promise<'inserted' | 'duplicate'> {
  const dedupeHash = computeDedupeHash(
    rawBody,
    parsed.amountMinor,
    parsed.direction,
  );
  return getDetectedExpensesRepository().insertDetected({
    source,
    rawBody,
    parsedJson: JSON.stringify(parsed),
    amountMinor: parsed.amountMinor,
    direction: parsed.direction,
    merchant: parsed.merchant,
    accountHint: parsed.accountHint,
    occurredAt: parsed.occurredAt ?? fallbackOccurredAt,
    categoryId: parsed.categoryId,
    dedupeHash,
  });
}

/**
 * Scan the newest SMS inbox messages (max 50), parse bank/UPI alerts and
 * stage new ones for review. No-op without READ_SMS permission.
 */
export async function scanSmsInbox(): Promise<ScanResult> {
  if (!(await hasSmsPermission())) {
    return {scanned: 0, inserted: 0, skipped: 0};
  }
  const messages = await getSmsInbox(SCAN_MESSAGE_COUNT);
  let inserted = 0;
  let skipped = 0;
  for (const message of messages) {
    const parsed = parseBankMessage(message.body);
    if (!parsed) {
      continue;
    }
    const result = await stageMessage('sms', message.body, parsed, message.date);
    if (result === 'inserted') {
      inserted += 1;
    } else {
      skipped += 1;
    }
  }
  return {scanned: messages.length, inserted, skipped};
}

export type ManualImportResult = 'inserted' | 'duplicate' | 'unparseable';

/**
 * Manual import: the user pastes any bank email/SMS text; the same parser
 * stages it with source 'manual'. This is the email path until Gmail OAuth
 * exists.
 */
export async function importManualText(text: string): Promise<ManualImportResult> {
  const parsed = parseBankMessage(text);
  if (!parsed) {
    return 'unparseable';
  }
  return stageMessage('manual', text, parsed, Date.now());
}

/* ------------------------------------------------------------------ */
/* Full history scan ('Scan older messages')                           */
/* ------------------------------------------------------------------ */

export const HISTORY_SCAN_BATCH_SIZE = 200;
export const HISTORY_SCAN_CAP = 1000;

/**
 * Session progress for the history scan. Held by the screen in a ref so a
 * later press continues where the previous batch stopped.
 */
export interface HistoryScanState {
  /** Inbox messages covered so far (the native reader is newest-first). */
  fetched: number;
  /** True once the inbox returned fewer rows than requested. */
  exhausted: boolean;
}

export interface HistoryScanBatchResult extends ScanResult {
  /** Total inbox messages covered after this batch. */
  fetchedTotal: number;
  capReached: boolean;
  exhausted: boolean;
}

export function createHistoryScanState(): HistoryScanState {
  return {fetched: 0, exhausted: false};
}

const EMPTY_HISTORY_RESULT: Omit<HistoryScanBatchResult, 'fetchedTotal' | 'capReached' | 'exhausted'> = {
  scanned: 0,
  inserted: 0,
  skipped: 0,
};

/**
 * Scan one batch of older inbox messages. The regular scan covers the newest
 * 50; each call here widens the native inbox query by HISTORY_SCAN_BATCH_SIZE
 * and processes only the newly covered (older) slice — the UNIQUE dedupe hash
 * makes any overlap idempotent. Stops at HISTORY_SCAN_CAP or when the inbox
 * runs out of messages. No-op without READ_SMS permission.
 */
export async function scanOlderSmsBatch(
  state: HistoryScanState,
  onProgress?: (fetchedTotal: number) => void,
): Promise<HistoryScanBatchResult> {
  if (
    state.exhausted ||
    state.fetched >= HISTORY_SCAN_CAP ||
    !(await hasSmsPermission())
  ) {
    return {
      ...EMPTY_HISTORY_RESULT,
      fetchedTotal: state.fetched,
      capReached: state.fetched >= HISTORY_SCAN_CAP,
      exhausted: state.exhausted,
    };
  }
  const requestCount = Math.min(
    state.fetched + HISTORY_SCAN_BATCH_SIZE,
    HISTORY_SCAN_CAP,
  );
  const messages = await getSmsInbox(requestCount);
  if (messages.length < requestCount) {
    state.exhausted = true;
  }
  const older = messages.slice(state.fetched);
  let inserted = 0;
  let skipped = 0;
  for (const message of older) {
    const parsed = parseBankMessage(message.body);
    if (!parsed) {
      continue;
    }
    const result = await stageMessage('sms', message.body, parsed, message.date);
    if (result === 'inserted') {
      inserted += 1;
    } else {
      skipped += 1;
    }
  }
  state.fetched = Math.max(state.fetched, messages.length);
  onProgress?.(state.fetched);
  return {
    scanned: older.length,
    inserted,
    skipped,
    fetchedTotal: state.fetched,
    capReached: state.fetched >= HISTORY_SCAN_CAP,
    exhausted: state.exhausted,
  };
}

/* ------------------------------------------------------------------ */
/* AI fallback analysis (per-item, never bulk)                         */
/* ------------------------------------------------------------------ */

export interface AiTrackingOptions {
  /** Injectable for tests / future backend proxy. */
  provider?: SummaryProvider;
  signal?: AbortSignal;
}

/**
 * Category for an AI-parsed row: match the AI's free-text guess against the
 * user's category names, else reuse the parser's keyword guesser so the row
 * always lands on a real seeded category.
 */
async function resolveAiCategoryId(
  direction: 'debit' | 'credit',
  merchant: string | null,
  body: string,
  categoryGuess: string | null,
): Promise<string> {
  if (categoryGuess) {
    const categories = await getCategoriesRepository().listCategories({
      includeArchived: true,
    });
    const needle = categoryGuess.trim().toLowerCase();
    const match = categories.find(
      category => category.name.trim().toLowerCase() === needle,
    );
    if (match) {
      return match.id;
    }
  }
  return guessCategoryId(direction, merchant, body);
}

/**
 * parsedJson for an AI-staged row, in the parser's shape plus the `aiParsed`
 * marker the review screen badges on. occurredAt stays null — AI rows use
 * the staging time / message date as their fallback.
 */
function parsedJsonFromAi(
  analysis: AiSmsAnalysis,
  body: string,
  categoryId: string,
): string {
  const parsed: ParsedTransactionMessage & {aiParsed: true} = {
    direction: analysis.direction,
    amountMinor: analysis.amountMinor,
    confidence: 'high',
    instrument: analysis.instrument ?? extractInstrument(body),
    merchant: analysis.merchant,
    accountHint: null,
    referenceId: null,
    occurredAt: null,
    categoryId,
    aiParsed: true,
  };
  return JSON.stringify(parsed);
}

export type AiImportResult = 'inserted' | 'duplicate' | 'not_a_transaction';

/**
 * AI fallback for pasted text the regex parser rejected ('unparseable'). One
 * explicit user tap = one API call. Throws ProviderError for gating and
 * provider failures; the dedupe hash matches the regex path, so a message
 * already staged is reported as 'duplicate'.
 */
export async function importManualTextWithAi(
  text: string,
  options: AiTrackingOptions = {},
): Promise<AiImportResult> {
  const analysis = await analyzeMessageWithAi(text, options);
  if (!analysis) {
    return 'not_a_transaction';
  }
  const categoryId = await resolveAiCategoryId(
    analysis.direction,
    analysis.merchant,
    text,
    analysis.categoryGuess,
  );
  return getDetectedExpensesRepository().insertDetected({
    source: 'manual',
    rawBody: text,
    parsedJson: parsedJsonFromAi(analysis, text, categoryId),
    amountMinor: analysis.amountMinor,
    direction: analysis.direction,
    merchant: analysis.merchant,
    accountHint: null,
    occurredAt: Date.now(),
    categoryId,
    dedupeHash: computeDedupeHash(text, analysis.amountMinor, analysis.direction),
  });
}

export type AiReanalysisResult = 'updated' | 'not_a_transaction';

/**
 * Per-item AI re-analysis for a pending row the regex parser staged with low
 * confidence. Updates the row in place (same dedupe hash) and marks it
 * AI-parsed for the review badge. Throws ProviderError for gating and
 * provider failures.
 */
export async function reanalyzeDetectedExpenseWithAi(
  item: DetectedExpense,
  options: AiTrackingOptions = {},
): Promise<AiReanalysisResult> {
  const analysis = await analyzeMessageWithAi(item.rawBody, options);
  if (!analysis) {
    return 'not_a_transaction';
  }
  const categoryId = await resolveAiCategoryId(
    analysis.direction,
    analysis.merchant,
    item.rawBody,
    analysis.categoryGuess,
  );
  await getDetectedExpensesRepository().updateParsed(item.id, {
    parsedJson: parsedJsonFromAi(analysis, item.rawBody, categoryId),
    amountMinor: analysis.amountMinor,
    direction: analysis.direction,
    merchant: analysis.merchant,
    accountHint: item.accountHint,
    occurredAt: item.occurredAt,
    categoryId,
  });
  return 'updated';
}

/** Account for auto-approved transactions: settings override → is_default. */
async function resolveDefaultAccountId(): Promise<string> {
  const stored = await getSettingsRepository().getDefaultAccountId();
  if (stored) {
    return stored;
  }
  const accounts = await getAccountsRepository().listAccounts();
  const fallback = accounts.find(account => account.isDefault) ?? accounts[0];
  if (!fallback) {
    throw new Error('No account available for auto-tracked transaction');
  }
  return fallback.id;
}

/** Parser instrument → transactions.payment_method enum value. */
const INSTRUMENT_TO_PAYMENT_METHOD: Record<ParsedInstrument, PaymentMethod | null> = {
  credit_card: 'card',
  debit_card: 'card',
  upi: 'upi',
  net_banking: 'net_banking',
  atm: 'cash',
  unknown: null,
};

/**
 * Read the instrument from the staged parsedJson. Rows staged before the
 * parser detected instruments (or with unparseable JSON) yield 'unknown'.
 */
function instrumentFromParsedJson(parsedJson: string): ParsedInstrument {
  try {
    const parsed = JSON.parse(parsedJson) as {instrument?: string};
    if (parsed.instrument && parsed.instrument in INSTRUMENT_TO_PAYMENT_METHOD) {
      return parsed.instrument as ParsedInstrument;
    }
  } catch {
    // fall through — treat as unknown
  }
  return 'unknown';
}

/**
 * Account for the approved transaction. Credit-card spends go to the user's
 * credit_card-type account when one exists; everything else uses the default
 * account resolution.
 */
async function resolveApprovalAccountId(
  instrument: ParsedInstrument,
): Promise<string> {
  if (instrument === 'credit_card') {
    const accounts = await getAccountsRepository().listAccounts();
    const cardAccount = accounts.find(account => account.type === 'credit_card');
    if (cardAccount) {
      return cardAccount.id;
    }
  }
  return resolveDefaultAccountId();
}

/**
 * Approve a pending row: create a real transaction with the guessed
 * category + instrument-matched account, link it, and invalidate query caches.
 */
export async function approveDetectedExpense(item: DetectedExpense): Promise<void> {
  const instrument = instrumentFromParsedJson(item.parsedJson);
  const accountId = await resolveApprovalAccountId(instrument);
  const transaction = await getTransactionsRepository().createTransaction({
    type: item.direction === 'debit' ? 'expense' : 'income',
    amountMinor: item.amountMinor,
    currency: 'INR',
    accountId,
    categoryId: item.categoryId,
    merchant: item.merchant,
    note: `Auto-detected from ${item.source === 'sms' ? 'SMS' : 'pasted text'}`,
    paymentMethod: INSTRUMENT_TO_PAYMENT_METHOD[instrument],
    occurredAt: item.occurredAt,
  });
  await getDetectedExpensesRepository().markApproved(item.id, transaction.id);
  bumpDataVersion();
}

export async function dismissDetectedExpense(item: DetectedExpense): Promise<void> {
  await getDetectedExpensesRepository().markDismissed(item.id);
  bumpDataVersion();
}

export async function isSmsTrackingEnabled(): Promise<boolean> {
  const raw = await getSettingsRepository().getValue(
    TRACKING_SETTINGS_KEYS.smsTrackingEnabled,
  );
  return raw === 'true';
}

export async function setSmsTrackingEnabled(enabled: boolean): Promise<void> {
  await getSettingsRepository().setValue(
    TRACKING_SETTINGS_KEYS.smsTrackingEnabled,
    enabled ? 'true' : 'false',
  );
}

export async function isAutoScanOnOpenEnabled(): Promise<boolean> {
  const raw = await getSettingsRepository().getValue(
    TRACKING_SETTINGS_KEYS.smsAutoScanOnOpen,
  );
  return raw === 'true';
}

export async function setAutoScanOnOpenEnabled(enabled: boolean): Promise<void> {
  await getSettingsRepository().setValue(
    TRACKING_SETTINGS_KEYS.smsAutoScanOnOpen,
    enabled ? 'true' : 'false',
  );
}
