import {MIGRATIONS, runMigrations} from '../migrations';
import {DEFAULT_ACCOUNT_IDS, seedDefaultData, SYSTEM_CATEGORY_IDS} from '../seeds';
import {createAccountsRepository} from '../repositories/accountsRepository';
import {createTransactionsRepository} from '../repositories/transactionsRepository';
import type {
  AccountsRepository,
  TransactionsRepository,
} from '../repositories/interfaces';
import {dayjs} from '../../utils/date';
import {createFakeDb} from './fakeDb';
import type {FakeDb} from './fakeDb';

const T0 = dayjs('2025-06-10T12:00:00').valueOf();

describe('AccountsRepository', () => {
  let db: FakeDb;
  let accounts: AccountsRepository;
  let transactions: TransactionsRepository;

  beforeEach(async () => {
    db = createFakeDb();
    await runMigrations(db, MIGRATIONS);
    await seedDefaultData(db);
    accounts = createAccountsRepository(db);
    transactions = createTransactionsRepository(db);
  });

  it('seeds four default accounts with Cash as default', async () => {
    const list = await accounts.listAccounts();
    expect(list).toHaveLength(4);
    const defaultAccount = await accounts.getDefaultAccount();
    expect(defaultAccount?.id).toBe(DEFAULT_ACCOUNT_IDS.cash);
  });

  it('creates, updates and archives accounts', async () => {
    const created = await accounts.createAccount({
      name: 'Savings',
      type: 'bank',
      currency: 'INR',
      openingBalanceMinor: 500_000,
    });
    expect(created.isDefault).toBe(false);

    const updated = await accounts.updateAccount(created.id, {
      name: 'Savings (HDFC)',
    });
    expect(updated.name).toBe('Savings (HDFC)');

    await accounts.archiveAccount(created.id);
    expect(
      (await accounts.listAccounts()).map(a => a.id),
    ).not.toContain(created.id);
    expect(
      (await accounts.listAccounts({includeArchived: true})).map(a => a.id),
    ).toContain(created.id);
  });

  it('setDefaultAccount atomically moves the default flag', async () => {
    await accounts.setDefaultAccount(DEFAULT_ACCOUNT_IDS.bank);
    const list = await accounts.listAccounts();
    expect(list.filter(a => a.isDefault).map(a => a.id)).toEqual([
      DEFAULT_ACCOUNT_IDS.bank,
    ]);
  });

  it('getAccountBalance = opening + income − expense ± transfers', async () => {
    const bankId = DEFAULT_ACCOUNT_IDS.bank;
    const cashId = DEFAULT_ACCOUNT_IDS.cash;
    await accounts.updateAccount(bankId, {openingBalanceMinor: 1_000_000});

    // +5000 income, −1200 expense on bank
    await transactions.createTransaction({
      type: 'income',
      amountMinor: 500_000,
      currency: 'INR',
      accountId: bankId,
      categoryId: SYSTEM_CATEGORY_IDS.salary,
      occurredAt: T0,
    });
    await transactions.createTransaction({
      type: 'expense',
      amountMinor: 120_000,
      currency: 'INR',
      accountId: bankId,
      categoryId: SYSTEM_CATEGORY_IDS.food,
      occurredAt: T0,
    });
    // −2000 transfer out of bank into cash
    await transactions.createTransaction({
      type: 'transfer',
      amountMinor: 200_000,
      currency: 'INR',
      accountId: bankId,
      destinationAccountId: cashId,
      occurredAt: T0,
    });
    // +800 transfer into bank from cash
    await transactions.createTransaction({
      type: 'transfer',
      amountMinor: 80_000,
      currency: 'INR',
      accountId: cashId,
      destinationAccountId: bankId,
      occurredAt: T0,
    });

    // 1_000_000 + 500_000 − 120_000 − 200_000 + 80_000
    expect(await accounts.getAccountBalance(bankId)).toBe(1_260_000);
    // cash: 0 opening + 200_000 in − 80_000 out
    expect(await accounts.getAccountBalance(cashId)).toBe(120_000);
  });

  it('getAccountBalance ignores soft-deleted transactions', async () => {
    const cashId = DEFAULT_ACCOUNT_IDS.cash;
    const tx = await transactions.createTransaction({
      type: 'expense',
      amountMinor: 50_000,
      currency: 'INR',
      accountId: cashId,
      categoryId: SYSTEM_CATEGORY_IDS.food,
      occurredAt: T0,
    });
    expect(await accounts.getAccountBalance(cashId)).toBe(-50_000);
    await transactions.softDeleteTransaction(tx.id);
    expect(await accounts.getAccountBalance(cashId)).toBe(0);
  });
});
