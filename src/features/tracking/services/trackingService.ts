import {
  getAccountsRepository,
  getSettingsRepository,
  getTransactionsRepository,
} from '../../../database/repositories';
import {bumpDataVersion} from '../../../store/dataVersionStore';
import {
  computeDedupeHash,
  getSmsInbox,
  hasSmsPermission,
  parseBankMessage,
} from '../../../services/sms';
import type {ParsedTransactionMessage} from '../../../services/sms';
import {
  getDetectedExpensesRepository,
} from './detectedExpensesRepository';
import type {DetectedExpense} from './detectedExpensesRepository';

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

/**
 * Approve a pending row: create a real transaction with the guessed
 * category + default account, link it, and invalidate query caches.
 */
export async function approveDetectedExpense(item: DetectedExpense): Promise<void> {
  const accountId = await resolveDefaultAccountId();
  const transaction = await getTransactionsRepository().createTransaction({
    type: item.direction === 'debit' ? 'expense' : 'income',
    amountMinor: item.amountMinor,
    currency: 'INR',
    accountId,
    categoryId: item.categoryId,
    merchant: item.merchant,
    note: `Auto-detected from ${item.source === 'sms' ? 'SMS' : 'pasted text'}`,
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
