/**
 * Full history scan ('Scan older messages'): batches of 200 against the
 * newest-first native reader, continuing from the previous batch, stopping at
 * the cap or when the inbox runs out — with the dedupe hash absorbing any
 * overlap. The regex parser runs for real; only the native bridge, the
 * staging repository, and settings are mocked.
 */
import {getSmsInbox, hasSmsPermission} from '../../../services/sms';
import type {InboxSms} from '../../../services/sms';
import {getDetectedExpensesRepository} from '../services/detectedExpensesRepository';
import {
  HISTORY_SCAN_BATCH_SIZE,
  HISTORY_SCAN_CAP,
  createHistoryScanState,
  scanOlderSmsBatch,
} from '../services/trackingService';

jest.mock('../../../services/sms', () => ({
  ...jest.requireActual('../../../services/sms'),
  getSmsInbox: jest.fn(),
  hasSmsPermission: jest.fn(),
}));
jest.mock('../../../database/repositories', () => ({
  getAccountsRepository: jest.fn(),
  getCategoriesRepository: jest.fn(),
  getSettingsRepository: jest.fn(),
  getTransactionsRepository: jest.fn(),
}));
jest.mock('../../../store/dataVersionStore', () => ({
  bumpDataVersion: jest.fn(),
}));
jest.mock('../services/detectedExpensesRepository', () => ({
  getDetectedExpensesRepository: jest.fn(),
}));

const mockGetSmsInbox = jest.mocked(getSmsInbox);
const mockHasPermission = jest.mocked(hasSmsPermission);
const mockGetDetected = jest.mocked(getDetectedExpensesRepository);

/** Real dedupe semantics: a hash seen before is a 'duplicate'. */
const seenHashes = new Set<string>();
const insertDetected = jest.fn(
  async (input: {dedupeHash: string}): Promise<'inserted' | 'duplicate'> => {
    if (seenHashes.has(input.dedupeHash)) {
      return 'duplicate';
    }
    seenHashes.add(input.dedupeHash);
    return 'inserted';
  },
);

/** A parseable debit alert; unique per index so hashes don't collide. */
function makeMessage(index: number): InboxSms {
  return {
    id: `sms-${index}`,
    address: 'VM-HDFCBK',
    body: `Rs.${100 + index}.00 debited from A/c XX1234 at SHOP${index} on 01-01-2024`,
    date: 1_770_000_000_000 - index * 60_000,
  };
}

function makeInbox(size: number): InboxSms[] {
  return Array.from({length: size}, (_, index) => makeMessage(index));
}

/** Newest-first slice, mirroring the native reader's maxCount behaviour. */
function stubInbox(all: InboxSms[]): void {
  mockGetSmsInbox.mockImplementation(async (maxCount = 50) =>
    all.slice(0, maxCount),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  seenHashes.clear();
  mockHasPermission.mockResolvedValue(true);
  mockGetDetected.mockReturnValue({insertDetected} as never);
});

describe('scanOlderSmsBatch', () => {
  it('is a no-op without SMS permission', async () => {
    mockHasPermission.mockResolvedValue(false);
    const state = createHistoryScanState();

    const result = await scanOlderSmsBatch(state);

    expect(result).toEqual({
      scanned: 0,
      inserted: 0,
      skipped: 0,
      fetchedTotal: 0,
      capReached: false,
      exhausted: false,
    });
    expect(mockGetSmsInbox).not.toHaveBeenCalled();
  });

  it('processes the first batch of 200 and reports progress', async () => {
    stubInbox(makeInbox(250));
    const state = createHistoryScanState();
    const progress: number[] = [];

    const result = await scanOlderSmsBatch(state, fetched =>
      progress.push(fetched),
    );

    expect(mockGetSmsInbox).toHaveBeenCalledWith(HISTORY_SCAN_BATCH_SIZE);
    expect(result.scanned).toBe(200);
    expect(result.inserted).toBe(200);
    expect(result.fetchedTotal).toBe(200);
    expect(result.exhausted).toBe(false);
    expect(result.capReached).toBe(false);
    expect(progress).toEqual([200]);
  });

  it('continues with the older slice on the next batch and detects inbox end', async () => {
    stubInbox(makeInbox(250));
    const state = createHistoryScanState();

    await scanOlderSmsBatch(state);
    const second = await scanOlderSmsBatch(state);

    expect(mockGetSmsInbox).toHaveBeenLastCalledWith(400);
    expect(second.scanned).toBe(50); // only the newly covered older slice
    expect(second.inserted).toBe(50);
    expect(second.fetchedTotal).toBe(250);
    expect(second.exhausted).toBe(true); // inbox returned fewer than requested
  });

  it('marks a small inbox as exhausted on the first batch', async () => {
    stubInbox(makeInbox(60));
    const state = createHistoryScanState();

    const result = await scanOlderSmsBatch(state);

    expect(result.scanned).toBe(60);
    expect(result.exhausted).toBe(true);
    expect(result.fetchedTotal).toBe(60);
  });

  it('stops at the cap and refuses further batches', async () => {
    stubInbox(makeInbox(HISTORY_SCAN_CAP));
    const state = createHistoryScanState();
    state.fetched = HISTORY_SCAN_CAP - 100;

    const result = await scanOlderSmsBatch(state);

    expect(mockGetSmsInbox).toHaveBeenCalledWith(HISTORY_SCAN_CAP);
    expect(result.scanned).toBe(100);
    expect(result.capReached).toBe(true);

    const after = await scanOlderSmsBatch(state);
    expect(after.scanned).toBe(0);
    expect(mockGetSmsInbox).toHaveBeenCalledTimes(1);
  });

  it('skips unparseable messages and dedupes repeats', async () => {
    const duplicate = makeMessage(1);
    stubInbox([
      makeMessage(0),
      duplicate,
      {...duplicate, id: 'sms-1-copy'}, // same body + amount → same hash
      {
        id: 'sms-otp',
        address: 'VM-HDFCBK',
        body: 'Your OTP is 123456. Do not share it.',
        date: 1_770_000_000_000,
      },
    ]);
    const state = createHistoryScanState();

    const result = await scanOlderSmsBatch(state);

    expect(result.scanned).toBe(4);
    expect(result.inserted).toBe(2);
    expect(result.skipped).toBe(1); // the duplicate; the OTP is not parsed
  });

  it('re-scanning the same inbox inserts nothing new (dedupe)', async () => {
    const inbox = makeInbox(120);
    stubInbox(inbox);

    const first = await scanOlderSmsBatch(createHistoryScanState());
    const second = await scanOlderSmsBatch(createHistoryScanState());

    expect(first.inserted).toBe(120);
    expect(second.inserted).toBe(0);
    expect(second.skipped).toBe(120);
  });
});
