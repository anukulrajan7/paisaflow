import RNFS from 'react-native-fs';
import Share from 'react-native-share';

import {
  buildCsvLine,
  buildTransactionsCsv,
  CSV_HEADER,
  escapeCsvField,
  exportTransactionsCsv,
  fetchExportRows,
  transactionToCsvFields,
} from '../csvExport';
import type {ExportTransactionRow} from '../csvExport';
import {MIGRATIONS, runMigrations} from '../../../database/migrations';
import {
  DEFAULT_ACCOUNT_IDS,
  seedDefaultData,
  SYSTEM_CATEGORY_IDS,
} from '../../../database/seeds';
import {createTransactionsRepository} from '../../../database/repositories';
import {createFakeDb} from '../../../database/__tests__/fakeDb';
import type {FakeDb} from '../../../database/__tests__/fakeDb';
import {dayjs} from '../../../utils/date';

jest.mock('react-native-fs', () => ({
  CachesDirectoryPath: '/mock-cache',
  writeFile: jest.fn(async () => undefined),
}));

jest.mock('react-native-share', () => ({
  __esModule: true,
  default: {
    open: jest.fn(async () => undefined),
  },
}));

// exportTransactionsCsv reads via the lazy getDb() singleton; point it at a
// per-test fake db instead of the (auto-mocked) native module. The factory
// runs lazily, so mockDb is assigned before getDb() is ever called.
let mockDb: FakeDb;
jest.mock('../../../database/connection', () => ({
  getDb: () => mockDb,
  closeDb: jest.fn(),
}));

const T0 = dayjs('2025-06-10T12:00:00').valueOf();

function sampleRow(overrides: Partial<ExportTransactionRow> = {}): ExportTransactionRow {
  return {
    occurredAt: T0,
    type: 'expense',
    amountMinor: 10_050,
    currency: 'INR',
    categoryName: 'Food',
    accountName: 'Cash',
    destinationAccountName: '',
    merchant: 'Chai Point',
    paymentMethod: 'cash',
    note: 'morning chai',
    ...overrides,
  };
}

describe('escapeCsvField', () => {
  it('leaves plain values untouched', () => {
    expect(escapeCsvField('chai')).toBe('chai');
    expect(escapeCsvField('')).toBe('');
  });

  it('quotes fields containing commas', () => {
    expect(escapeCsvField('chai, samosa')).toBe('"chai, samosa"');
  });

  it('doubles inner quotes and wraps the field', () => {
    expect(escapeCsvField('the "best" chai')).toBe('"the ""best"" chai"');
  });

  it('quotes fields containing newlines or carriage returns', () => {
    expect(escapeCsvField('line one\nline two')).toBe('"line one\nline two"');
    expect(escapeCsvField('line one\r\nline two')).toBe('"line one\r\nline two"');
  });
});

describe('buildCsvLine / buildTransactionsCsv', () => {
  it('joins escaped fields with commas', () => {
    expect(buildCsvLine(['a', 'b,c', 'd"e'])).toBe('a,"b,c","d""e"');
  });

  it('emits the header then one line per row', () => {
    const csv = buildTransactionsCsv([sampleRow(), sampleRow({type: 'income'})]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(CSV_HEADER.join(','));
  });

  it('formats amounts as decimals via minorToDecimal', () => {
    expect(transactionToCsvFields(sampleRow({amountMinor: 10_050}))[2]).toBe('100.50');
    expect(transactionToCsvFields(sampleRow({amountMinor: 5}))[2]).toBe('0.05');
  });

  it('orders fields as date,type,amount,currency,category,account,destination,merchant,payment,note', () => {
    const fields = transactionToCsvFields(
      sampleRow({
        type: 'transfer',
        categoryName: '',
        destinationAccountName: 'Bank Account',
      }),
    );
    expect(fields).toEqual([
      dayjs(T0).format('YYYY-MM-DD'),
      'transfer',
      '100.50',
      'INR',
      '',
      'Cash',
      'Bank Account',
      'Chai Point',
      'cash',
      'morning chai',
    ]);
  });
});

describe('fetchExportRows', () => {
  beforeEach(async () => {
    mockDb = createFakeDb();
    await runMigrations(mockDb, MIGRATIONS);
    await seedDefaultData(mockDb);
  });

  it('resolves account/category names and excludes soft-deleted rows', async () => {
    const repo = createTransactionsRepository(mockDb);
    await repo.createTransaction({
      type: 'expense',
      amountMinor: 9950,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.cash,
      categoryId: SYSTEM_CATEGORY_IDS.food,
      merchant: 'Chai Point',
      note: 'with, comma and "quotes"\nand a newline',
      occurredAt: T0,
    });
    await repo.createTransaction({
      type: 'transfer',
      amountMinor: 50_000,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.cash,
      destinationAccountId: DEFAULT_ACCOUNT_IDS.bank,
      occurredAt: T0 + 1_000,
    });
    const deleted = await repo.createTransaction({
      type: 'income',
      amountMinor: 1_000,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.bank,
      categoryId: SYSTEM_CATEGORY_IDS.salary,
      occurredAt: T0 + 2_000,
    });
    await repo.softDeleteTransaction(deleted.id);

    const rows = await fetchExportRows(mockDb);
    expect(rows).toHaveLength(2);

    expect(rows[0]).toMatchObject({
      type: 'expense',
      amountMinor: 9950,
      categoryName: 'Food',
      accountName: 'Cash',
      destinationAccountName: '',
      merchant: 'Chai Point',
    });

    // Transfer: no category, destination account resolved.
    expect(rows[1]).toMatchObject({
      type: 'transfer',
      categoryName: '',
      accountName: 'Cash',
      destinationAccountName: 'Bank Account',
    });

    // The hostile note survives intact as data and is escaped in the CSV.
    expect(rows[0].note).toBe('with, comma and "quotes"\nand a newline');
    const csv = buildTransactionsCsv(rows);
    expect(csv).toContain('"with, comma and ""quotes""\nand a newline"');
  });
});

describe('exportTransactionsCsv', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockDb = createFakeDb();
    await runMigrations(mockDb, MIGRATIONS);
    await seedDefaultData(mockDb);
    await createTransactionsRepository(mockDb).createTransaction({
      type: 'expense',
      amountMinor: 10_000,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.cash,
      categoryId: SYSTEM_CATEGORY_IDS.food,
      occurredAt: T0,
    });
  });

  it('writes the CSV to the cache dir and opens the share sheet', async () => {
    const result = await exportTransactionsCsv();

    expect(result.count).toBe(1);

    const writeFile = RNFS.writeFile as jest.Mock;
    expect(writeFile).toHaveBeenCalledTimes(1);
    const [path, contents, encoding] = writeFile.mock.calls[0];
    expect(path).toMatch(/^\/mock-cache\/paisaflow-transactions-\d{8}-\d{4}\.csv$/);
    expect(encoding).toBe('utf8');
    expect(contents.split('\n')).toHaveLength(2); // header + 1 row

    expect(Share.open).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `file://${result.path}`,
        type: 'text/csv',
        failOnCancel: false,
      }),
    );
    expect(result.path).toBe(path);
  });
});
