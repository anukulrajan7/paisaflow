import {MIGRATIONS, runMigrations} from '../../../database/migrations';
import {DEFAULT_ACCOUNT_IDS, seedDefaultData} from '../../../database/seeds';
import {createFakeDb} from '../../../database/__tests__/fakeDb';
import type {FakeDb} from '../../../database/__tests__/fakeDb';
import {
  createAccountsRepository,
  createTransactionsRepository,
} from '../../../database/repositories';
import type {
  AccountsRepository,
  TransactionsRepository,
} from '../../../database/repositories';
import {dayPeriod, dayjs} from '../../../utils/date';
import type {AddLedgerEntryInput} from '../services/peopleRepository';
import {createPeopleRepository} from '../services/peopleRepository';
import type {PeopleRepository} from '../services/peopleRepository';
import type {Person} from '../types/person';

const BANK = DEFAULT_ACCOUNT_IDS.bank;
const CASH = DEFAULT_ACCOUNT_IDS.cash;
const OCCURRED = dayjs('2025-06-10T12:00:00').valueOf();

function baseEntry(
  personId: string,
  overrides: Partial<AddLedgerEntryInput> = {},
): AddLedgerEntryInput {
  return {
    personId,
    direction: 'lent',
    amountMinor: 100_000,
    currency: 'INR',
    accountId: BANK,
    occurredAt: OCCURRED,
    ...overrides,
  };
}

describe('PeopleRepository', () => {
  let db: FakeDb;
  let people: PeopleRepository;
  let accounts: AccountsRepository;
  let transactions: TransactionsRepository;
  let ravi: Person;

  beforeEach(async () => {
    db = createFakeDb();
    await runMigrations(db, MIGRATIONS);
    await seedDefaultData(db);
    people = createPeopleRepository(db);
    accounts = createAccountsRepository(db);
    transactions = createTransactionsRepository(db);
    ravi = await people.createPerson({name: 'Ravi', phone: '+91 98765 43210'});
  });

  describe('people', () => {
    it('creates, reads and lists people; validates the name', async () => {
      expect(ravi.id).toBeTruthy();
      expect(ravi.phone).toBe('+91 98765 43210');
      expect(await people.getPersonById(ravi.id)).toEqual(ravi);
      expect((await people.listPeople()).map(p => p.id)).toEqual([ravi.id]);

      await expect(people.createPerson({name: '  '})).rejects.toThrow('name');
    });

    it('updates details and renames the virtual account with the person', async () => {
      const entry = await people.addLedgerEntry(baseEntry(ravi.id));
      await people.updatePerson(ravi.id, {name: 'Ravi Kumar', phone: null});

      const updated = await people.getPersonById(ravi.id);
      expect(updated?.name).toBe('Ravi Kumar');
      expect(updated?.phone).toBeNull();

      const account = await accounts.getAccountById(entry.personAccountId);
      expect(account?.name).toBe('Ravi Kumar');
    });
  });

  describe('lending (money given)', () => {
    it('creates one archived virtual account and moves money via a transfer', async () => {
      const bankBefore = await accounts.getAccountBalance(BANK);
      const entry = await people.addLedgerEntry(baseEntry(ravi.id));

      expect(entry.status).toBe('pending');
      expect(entry.repaidMinor).toBe(0);
      expect(entry.transactionId).toBeTruthy();

      // The backing transfer: payment account -> person account.
      const transfer = await transactions.getTransactionById(
        entry.transactionId as string,
      );
      expect(transfer?.type).toBe('transfer');
      expect(transfer?.accountId).toBe(BANK);
      expect(transfer?.destinationAccountId).toBe(entry.personAccountId);
      expect(transfer?.merchant).toBe('Ravi');

      // One archived virtual account of type 'person', named after the person.
      const personAccount = await accounts.getAccountById(entry.personAccountId);
      expect(personAccount?.type).toBe('person');
      expect(personAccount?.name).toBe('Ravi');
      expect(personAccount?.isArchived).toBe(true);
      // ...so it stays out of the normal (non-archived) pickers.
      expect(
        (await accounts.listAccounts()).some(a => a.id === personAccount?.id),
      ).toBe(false);

      // Balance math: payment account down, person account up (they owe me).
      expect(await accounts.getAccountBalance(BANK)).toBe(bankBefore - 100_000);
      expect(await accounts.getAccountBalance(entry.personAccountId)).toBe(
        100_000,
      );
      expect(await people.getPersonBalance(ravi.id)).toBe(100_000);

      // Transfers are never income/expense.
      const totals = await transactions.getMonthlyTotals(
        dayPeriod(dayjs(OCCURRED)),
      );
      expect(totals).toEqual({incomeMinor: 0, expenseMinor: 0, count: 0});
    });

    it('reuses the same virtual account across entries', async () => {
      const first = await people.addLedgerEntry(baseEntry(ravi.id));
      const second = await people.addLedgerEntry(
        baseEntry(ravi.id, {amountMinor: 25_000}),
      );
      expect(second.personAccountId).toBe(first.personAccountId);
      expect(await people.getPersonBalance(ravi.id)).toBe(125_000);
    });

    it('tracks a partial repayment sequence and completes in full', async () => {
      const bankBefore = await accounts.getAccountBalance(BANK);
      const entry = await people.addLedgerEntry(baseEntry(ravi.id));

      const partial = await people.recordRepayment(entry.id, 40_000);
      expect(partial.status).toBe('partial');
      expect(partial.repaidMinor).toBe(40_000);
      // Person account now tracks only what is still owed.
      expect(await accounts.getAccountBalance(entry.personAccountId)).toBe(
        60_000,
      );
      expect(await accounts.getAccountBalance(BANK)).toBe(bankBefore - 60_000);

      const done = await people.recordRepayment(entry.id, 60_000);
      expect(done.status).toBe('completed');
      expect(done.repaidMinor).toBe(100_000);
      expect(await accounts.getAccountBalance(entry.personAccountId)).toBe(0);
      expect(await accounts.getAccountBalance(BANK)).toBe(bankBefore);
    });

    it('rejects over-repayment and repayment of completed entries', async () => {
      const entry = await people.addLedgerEntry(baseEntry(ravi.id));
      await expect(
        people.recordRepayment(entry.id, 100_001),
      ).rejects.toThrow('exceeds');
      await expect(people.recordRepayment(entry.id, 0)).rejects.toThrow(
        'positive integer',
      );

      await people.recordRepayment(entry.id, 100_000);
      await expect(people.recordRepayment(entry.id, 1)).rejects.toThrow(
        'already completed',
      );
    });

    it('settles an open entry in full', async () => {
      const bankBefore = await accounts.getAccountBalance(BANK);
      const entry = await people.addLedgerEntry(baseEntry(ravi.id));
      await people.recordRepayment(entry.id, 30_000);

      const settled = await people.settleEntry(entry.id);
      expect(settled.status).toBe('completed');
      expect(settled.repaidMinor).toBe(100_000);
      expect(await people.getPersonBalance(ravi.id)).toBe(0);
      expect(await accounts.getAccountBalance(BANK)).toBe(bankBefore);
    });
  });

  describe('borrowing (money taken)', () => {
    it('moves money from the person account to the payment account', async () => {
      const bankBefore = await accounts.getAccountBalance(BANK);
      const entry = await people.addLedgerEntry(
        baseEntry(ravi.id, {direction: 'borrowed', amountMinor: 50_000}),
      );

      const transfer = await transactions.getTransactionById(
        entry.transactionId as string,
      );
      expect(transfer?.accountId).toBe(entry.personAccountId);
      expect(transfer?.destinationAccountId).toBe(BANK);

      // Negative person balance = I owe them.
      expect(await accounts.getAccountBalance(entry.personAccountId)).toBe(
        -50_000,
      );
      expect(await people.getPersonBalance(ravi.id)).toBe(-50_000);
      expect(await accounts.getAccountBalance(BANK)).toBe(bankBefore + 50_000);
    });

    it('repayment made moves money back and completes', async () => {
      const bankBefore = await accounts.getAccountBalance(BANK);
      const entry = await people.addLedgerEntry(
        baseEntry(ravi.id, {direction: 'borrowed', amountMinor: 50_000}),
      );

      const done = await people.recordRepayment(entry.id, 50_000);
      expect(done.status).toBe('completed');
      expect(await accounts.getAccountBalance(entry.personAccountId)).toBe(0);
      expect(await accounts.getAccountBalance(BANK)).toBe(bankBefore);
    });
  });

  describe('editing', () => {
    it('reverses the old transfer so edits never double-apply', async () => {
      const bankBefore = await accounts.getAccountBalance(BANK);
      const cashBefore = await accounts.getAccountBalance(CASH);
      const entry = await people.addLedgerEntry(baseEntry(ravi.id));
      const originalTransferId = entry.transactionId as string;

      const edited = await people.editLedgerEntry(entry.id, {
        amountMinor: 150_000,
        accountId: CASH,
      });

      // The old transfer is soft-deleted (effect reversed exactly once).
      const oldTransfer =
        await transactions.getTransactionById(originalTransferId);
      expect(oldTransfer?.deletedAt).not.toBeNull();
      expect(edited.transactionId).not.toBe(originalTransferId);

      // Balances reflect ONLY the corrected values: bank untouched, cash down.
      expect(await accounts.getAccountBalance(BANK)).toBe(bankBefore);
      expect(await accounts.getAccountBalance(CASH)).toBe(cashBefore - 150_000);
      expect(await accounts.getAccountBalance(entry.personAccountId)).toBe(
        150_000,
      );

      // A second edit (direction flip) again leaves no residue.
      await people.editLedgerEntry(entry.id, {direction: 'borrowed'});
      expect(await accounts.getAccountBalance(CASH)).toBe(cashBefore + 150_000);
      expect(await accounts.getAccountBalance(entry.personAccountId)).toBe(
        -150_000,
      );
    });

    it('locks financial fields once a repayment exists', async () => {
      const entry = await people.addLedgerEntry(baseEntry(ravi.id));
      await people.recordRepayment(entry.id, 10_000);
      await expect(
        people.editLedgerEntry(entry.id, {amountMinor: 90_000}),
      ).rejects.toThrow('locked');
    });

    it('updates due date, notes and reminder without touching balances', async () => {
      const bankBefore = await accounts.getAccountBalance(BANK);
      const entry = await people.addLedgerEntry(baseEntry(ravi.id));
      const due = dayjs('2025-07-01').valueOf();

      const updated = await people.updateLedgerEntryDetails(entry.id, {
        expectedReturnAt: due,
        notes: 'For books',
        reminderEnabled: true,
        reminderSlot: 'evening',
      });
      expect(updated.expectedReturnAt).toBe(due);
      expect(updated.notes).toBe('For books');
      expect(updated.reminderEnabled).toBe(true);
      expect(updated.reminderSlot).toBe('evening');
      expect(await accounts.getAccountBalance(BANK)).toBe(bankBefore - 100_000);

      // Clearing the due date and disabling the reminder clears the slot too.
      const cleared = await people.updateLedgerEntryDetails(entry.id, {
        expectedReturnAt: null,
        reminderEnabled: false,
      });
      expect(cleared.expectedReturnAt).toBeNull();
      expect(cleared.reminderEnabled).toBe(false);
      expect(cleared.reminderSlot).toBeNull();

      await expect(
        people.updateLedgerEntryDetails(entry.id, {
          reminderEnabled: true,
          reminderSlot: null,
        }),
      ).rejects.toThrow('reminderSlot');
    });
  });

  describe('soft delete and undo', () => {
    it('reverses every linked transfer on delete and restores them on undo', async () => {
      const bankBefore = await accounts.getAccountBalance(BANK);
      const entry = await people.addLedgerEntry(baseEntry(ravi.id));
      await people.recordRepayment(entry.id, 40_000);

      await people.softDeleteEntry(entry.id);
      // Entry hidden, person balance and payment account fully reverted —
      // including the partial repayment transfer.
      expect(await people.getLedgerEntryById(entry.id)).toMatchObject({
        deletedAt: expect.any(Number),
      });
      expect(await people.listLedgerEntries(ravi.id)).toHaveLength(0);
      expect(await people.getPersonBalance(ravi.id)).toBe(0);
      expect(await accounts.getAccountBalance(BANK)).toBe(bankBefore);

      await people.restoreEntry(entry.id);
      expect(await people.listLedgerEntries(ravi.id)).toHaveLength(1);
      expect(await people.getPersonBalance(ravi.id)).toBe(60_000);
      expect(await accounts.getAccountBalance(BANK)).toBe(bankBefore - 60_000);
    });

    it('throws when deleting a missing or already-deleted entry', async () => {
      const entry = await people.addLedgerEntry(baseEntry(ravi.id));
      await people.softDeleteEntry(entry.id);
      await expect(people.softDeleteEntry(entry.id)).rejects.toThrow(
        'not found',
      );
    });
  });

  describe('summaries and overdue', () => {
    it('rolls up balances, open counts and overdue entries per person', async () => {
      const meena = await people.createPerson({name: 'Meena'});
      const yesterday = dayjs().subtract(1, 'day').valueOf();
      const nextWeek = dayjs().add(7, 'day').valueOf();

      // Ravi: owes me, overdue. Meena: I owe her, not due.
      await people.addLedgerEntry(
        baseEntry(ravi.id, {expectedReturnAt: yesterday}),
      );
      await people.addLedgerEntry(
        baseEntry(meena.id, {
          direction: 'borrowed',
          amountMinor: 30_000,
          expectedReturnAt: nextWeek,
        }),
      );

      const summaries = await people.getPersonSummaries(Date.now());
      const byName = new Map(summaries.map(s => [s.person.name, s]));

      const raviSummary = byName.get('Ravi');
      expect(raviSummary?.balanceMinor).toBe(100_000);
      expect(raviSummary?.openEntryCount).toBe(1);
      expect(raviSummary?.overdueCount).toBe(1);

      const meenaSummary = byName.get('Meena');
      expect(meenaSummary?.balanceMinor).toBe(-30_000);
      expect(meenaSummary?.openEntryCount).toBe(1);
      expect(meenaSummary?.overdueCount).toBe(0);

      // Completed entries are never overdue, even when past due.
      const settled = await people.addLedgerEntry(
        baseEntry(ravi.id, {amountMinor: 5_000, expectedReturnAt: yesterday}),
      );
      await people.settleEntry(settled.id);

      const todayStart = dayjs().startOf('day').valueOf();
      const overdue = await people.listOverdueEntries(todayStart);
      expect(overdue).toHaveLength(1);
      expect(overdue[0].personId).toBe(ravi.id);
      expect(overdue[0].expectedReturnAt).toBe(yesterday);
    });
  });

  describe('validation', () => {
    it('rejects invalid amounts, accounts, directions and people', async () => {
      await expect(
        people.addLedgerEntry(baseEntry(ravi.id, {amountMinor: 0})),
      ).rejects.toThrow('positive integer');
      await expect(
        people.addLedgerEntry(baseEntry(ravi.id, {amountMinor: 10.5})),
      ).rejects.toThrow('positive integer');
      await expect(
        people.addLedgerEntry(baseEntry(ravi.id, {accountId: ''})),
      ).rejects.toThrow('accountId');
      await expect(
        people.addLedgerEntry(baseEntry(ravi.id, {direction: 'x' as never})),
      ).rejects.toThrow('direction');
      await expect(
        people.addLedgerEntry(baseEntry(ravi.id, {currency: ''})),
      ).rejects.toThrow('currency');
      await expect(
        people.addLedgerEntry(baseEntry('missing-person')),
      ).rejects.toThrow('Person not found');
    });
  });
});
