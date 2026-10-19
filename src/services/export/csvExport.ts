import RNFS from 'react-native-fs';
import Share from 'react-native-share';

import {getDb} from '../../database/connection';
import {dayjs} from '../../utils/date';
import {buildTransactionsCsv, fetchExportRows} from './csvCore';

/**
 * CSV export of all active (non soft-deleted) transactions.
 *
 * Fully offline: reads SQLite, writes a temp file with react-native-fs and
 * hands it to the OS share sheet via react-native-share. No server involved.
 * The web build swaps this file for csvExport.web.ts (Blob download).
 */

export {
  CSV_HEADER,
  buildCsvLine,
  buildTransactionsCsv,
  escapeCsvField,
  fetchExportRows,
  transactionToCsvFields,
} from './csvCore';
export type {ExportTransactionRow} from './csvCore';

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
