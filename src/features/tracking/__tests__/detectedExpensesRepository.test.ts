import {MIGRATIONS, runMigrations} from '../../../database/migrations';
import {seedDefaultData} from '../../../database/seeds';
import {createFakeDb} from '../../../database/__tests__/fakeDb';
import type {FakeDb} from '../../../database/__tests__/fakeDb';
import {
  createDetectedExpensesRepository,
} from '../services/detectedExpensesRepository';
import type {
  DetectedExpensesRepository,
  NewDetectedExpense,
} from '../services/detectedExpensesRepository';

function makeInput(
  overrides: Partial<NewDetectedExpense> = {},
): NewDetectedExpense {
  return {
    source: 'sms',
    rawBody: 'Rs.1,234.00 debited from A/c XX1234 at SWIGGY BANGALORE.',
    parsedJson: '{"direction":"debit"}',
    amountMinor: 123_400,
    direction: 'debit',
    merchant: 'SWIGGY BANGALORE',
    accountHint: '1234',
    occurredAt: 1_770_000_000_000,
    categoryId: 'cat_food',
    dedupeHash: 'hash-1',
    ...overrides,
  };
}

describe('DetectedExpensesRepository', () => {
  let db: FakeDb;
  let repo: DetectedExpensesRepository;

  beforeEach(async () => {
    db = createFakeDb();
    await runMigrations(db, MIGRATIONS);
    await seedDefaultData(db);
    repo = createDetectedExpensesRepository(db);
  });

  it('inserts a pending row and lists it newest-first', async () => {
    expect(await repo.insertDetected(makeInput())).toBe('inserted');
    expect(
      await repo.insertDetected(
        makeInput({dedupeHash: 'hash-2', occurredAt: 1_780_000_000_000}),
      ),
    ).toBe('inserted');

    const pending = await repo.listPending();
    expect(pending).toHaveLength(2);
    expect(pending[0].dedupeHash).toBe('hash-2'); // newer occurred_at first
    expect(pending[0].status).toBe('pending');
    expect(pending[0].amountMinor).toBe(123_400);
    expect(pending[0].merchant).toBe('SWIGGY BANGALORE');
    expect(pending[0].transactionId).toBeNull();
    expect(await repo.countPending()).toBe(2);
  });

  it('dedupes on dedupe_hash — re-imports are skipped', async () => {
    expect(await repo.insertDetected(makeInput())).toBe('inserted');
    expect(await repo.insertDetected(makeInput())).toBe('duplicate');
    expect(await repo.insertDetected(makeInput({rawBody: 'changed'}))).toBe(
      'duplicate',
    );
    expect(await repo.countPending()).toBe(1);
  });

  it('markApproved links the transaction and leaves the pending list', async () => {
    await repo.insertDetected(makeInput());
    const [item] = await repo.listPending();

    await repo.markApproved(item.id, 'txn-1');

    expect(await repo.listPending()).toHaveLength(0);
    const rows = db.getRows('detected_expenses');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('approved');
    expect(rows[0].transaction_id).toBe('txn-1');
  });

  it('markDismissed leaves the pending list without a transaction link', async () => {
    await repo.insertDetected(makeInput());
    const [item] = await repo.listPending();

    await repo.markDismissed(item.id);

    expect(await repo.listPending()).toHaveLength(0);
    const rows = db.getRows('detected_expenses');
    expect(rows[0].status).toBe('dismissed');
    expect(rows[0].transaction_id).toBeNull();
  });

  it('stores manual-source rows alongside sms ones', async () => {
    await repo.insertDetected(makeInput({source: 'manual', dedupeHash: 'm-1'}));
    await repo.insertDetected(makeInput({dedupeHash: 's-1'}));
    const pending = await repo.listPending();
    const sources = pending.map(item => item.source).sort();
    expect(sources).toEqual(['manual', 'sms']);
  });
});
