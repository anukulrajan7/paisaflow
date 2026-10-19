import {getDb} from '../../database/connection';
import {dayjs} from '../../utils/date';
import {buildTransactionsCsv, fetchExportRows} from './csvCore';

/**
 * Web CSV export: build the file in memory and trigger a browser download
 * via a Blob URL. Nothing is uploaded — the "share" step is the browser's
 * own save dialog.
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

export async function exportTransactionsCsv(): Promise<CsvExportResult> {
  const rows = await fetchExportRows(getDb());
  const csv = buildTransactionsCsv(rows);
  const fileName = `paisaflow-transactions-${dayjs().format('YYYYMMDD-HHmm')}.csv`;

  // BOM so Excel opens UTF-8 (₹, merchant names) correctly.
  const blob = new Blob(['﻿', csv], {type: 'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Give the browser a tick to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return {path: fileName, count: rows.length};
}
