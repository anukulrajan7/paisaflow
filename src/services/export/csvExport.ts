import RNFS from 'react-native-fs';
import Share from 'react-native-share';

import {getDb} from '../../database/connection';
import {queryRows} from '../../database/connection/helpers';
import type {SqlDb} from '../../database/connection/types';
import type {TransactionType} from '../../database/types';
import {minorToDecimal} from '../../utils/money';
import {dayjs} from '../../utils/date';

/**
 * CSV export of all active (non soft-deleted) transactions.
 *
 * Fully offline: reads SQLite, writes a temp file with react-native-fs and
 * hands it to the OS share sheet via react-native-share. No server involved.
 *
 * The pure CSV-building functions (escapeCsvField / buildCsvLine /
 * buildTransactionsCsv) are unit-tested without fs/share.
 */

/** One export row with ids already resolved to human-readable names. */
export interface ExportTransactionRow {
  /** epoch ms */
  occurredAt: number;
  type: TransactionType;
  amountMinor: number;
  currency: string;
  /** '' for transfers. */
  categoryName: string;
  accountName: string;
  /** '' unless the transaction is a transfer. */
  destinationAccountName: string;
  merchant: string;
  paymentMethod: string;
  note: string;
}

export const CSV_HEADER = [
  'date',
  'type',
  'amount',
  'currency',
  'category',
  'account',
  'destination account',
  'merchant',
  'payment method',
  'note',
] as const;

/** RFC 4180 escaping: quote fields containing ", comma, CR or LF; double inner quotes. */
export function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCsvLine(fields: ReadonlyArray<string>): string {
  return fields.map(escapeCsvField).join(',');
}

export function transactionToCsvFields(row: ExportTransactionRow): string[] {
  return [
    dayjs(row.occurredAt).format('YYYY-MM-DD'),
    row.type,
    minorToDecimal(row.amountMinor),
    row.currency,
    row.categoryName,
    row.accountName,
    row.destinationAccountName,
    row.merchant,
    row.paymentMethod,
    row.note,
  ];
}

/** Header + one line per transaction. '\n' line endings (universally readable). */
export function buildTransactionsCsv(rows: ReadonlyArray<ExportTransactionRow>): string {
  const lines = [buildCsvLine(CSV_HEADER)];
  for (const row of rows) {
    lines.push(buildCsvLine(transactionToCsvFields(row)));
  }
  return lines.join('\n');
}

interface ExportDbRow {
  type: TransactionType;
  amount_minor: number;
  currency: string;
  account_id: string;
  destination_account_id: string | null;
  category_id: string | null;
  merchant: string | null;
  note: string | null;
  payment_method: string | null;
  occurred_at: number;
}

/**
 * Fetches active transactions oldest-first and resolves account/category
 * names. Three lean queries joined in-process (same pattern as
 * dashboardQueries) — no SQL joins, keeping this testable against fakeDb.
 */
export async function fetchExportRows(db: SqlDb): Promise<ExportTransactionRow[]> {
  const [transactions, accounts, categories] = await Promise.all([
    queryRows<ExportDbRow>(
      db,
      `SELECT type, amount_minor, currency, account_id, destination_account_id,
              category_id, merchant, note, payment_method, occurred_at
       FROM transactions
       WHERE deleted_at IS NULL
       ORDER BY occurred_at ASC, created_at ASC`,
    ),
    queryRows<{id: string; name: string}>(db, 'SELECT id, name FROM accounts'),
    queryRows<{id: string; name: string}>(db, 'SELECT id, name FROM categories'),
  ]);

  const accountNames = new Map(accounts.map(a => [a.id, a.name]));
  const categoryNames = new Map(categories.map(c => [c.id, c.name]));

  return transactions.map(tx => ({
    occurredAt: tx.occurred_at,
    type: tx.type,
    amountMinor: tx.amount_minor,
    currency: tx.currency,
    categoryName: tx.category_id ? categoryNames.get(tx.category_id) ?? '' : '',
    accountName: accountNames.get(tx.account_id) ?? '',
    destinationAccountName: tx.destination_account_id
      ? accountNames.get(tx.destination_account_id) ?? ''
      : '',
    merchant: tx.merchant ?? '',
    paymentMethod: tx.payment_method ?? '',
    note: tx.note ?? '',
  }));
}

export interface CsvExportResult {
  path: string;
  /** Number of transaction rows written (excluding the header). */
  count: number;
}

/**
 * Builds the CSV, writes it to the cache directory and opens the native
 * share sheet. Resolves after the sheet closes; user-cancel is not an error.
 */
export async function exportTransactionsCsv(): Promise<CsvExportResult> {
  const rows = await fetchExportRows(getDb());
  const csv = buildTransactionsCsv(rows);

  const fileName = `paisaflow-transactions-${dayjs().format('YYYYMMDD-HHmm')}.csv`;
  const path = `${RNFS.CachesDirectoryPath}/${fileName}`;
  await RNFS.writeFile(path, csv, 'utf8');

  await Share.open({
    url: `file://${path}`,
    type: 'text/csv',
    filename: fileName,
    // A dismissed sheet is a normal outcome, not a failure.
    failOnCancel: false,
  });

  return {path, count: rows.length};
}
