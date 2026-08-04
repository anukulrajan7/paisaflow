import {MIGRATIONS, runMigrations} from '../../../database/migrations';
import {DEFAULT_ACCOUNT_IDS, seedDefaultData} from '../../../database/seeds';
import {
  createAccountsRepository,
  createTransactionsRepository,
} from '../../../database/repositories';
import {createFakeDb} from '../../../database/__tests__/fakeDb';
import type {FakeDb} from '../../../database/__tests__/fakeDb';
import {dayjs, monthPeriod} from '../../../utils/date';
import {
  addInvestmentContribution,
  createAddContributionDeps,
} from '../services/addInvestmentContribution';
import {
  createInvestmentsRepository,
  type InvestmentsRepository,
} from '../services/investmentsRepository';

const WHEN = dayjs('2026-08-04T10:00:00').valueOf();

describe('addInvestmentContribution', () => {
  let db: FakeDb;
  let investments: InvestmentsRepository;
  let investmentId: string;
  let holdingAccountId: string;

  beforeEach(async () => {
    db = createFakeDb();
    await runMigrations(db, MIGRATIONS);
    await seedDefaultData(db);
    investments = createInvestmentsRepository(db);
    const investment = await investments.createInvestment({
      name: 'Nifty 50 index fund',
      type: 'mutual_fund',
      currency: 'INR',
      startedAt: dayjs('2025-01-01').valueOf(),
    });
    investmentId = investment.id;
    holdingAccountId = investment.holdingAccountId;
  });

  it('moves money: one transfer, invested/current bump, holding balance up', async () => {
    const accounts = createAccountsRepository(db);
    const bankBefore = await accounts.getAccountBalance(DEFAULT_ACCOUNT_IDS.bank);

    const result = await addInvestmentContribution(
      {
        investmentId,
        amountMinor: 25_000_00,
        accountId: DEFAULT_ACCOUNT_IDS.bank,
        occurredAt: WHEN,
        note: 'August SIP',
      },
      createAddContributionDeps(db),
    );

    // Exactly one transaction was created, and it is a transfer.
    const transactions = db.getRows('transactions');
    expect(transactions).toHaveLength(1);
    expect(result.transaction.type).toBe('transfer');
    expect(result.transaction.accountId).toBe(DEFAULT_ACCOUNT_IDS.bank);
    expect(result.transaction.destinationAccountId).toBe(holdingAccountId);
    expect(result.transaction.merchant).toBe('Nifty 50 index fund');
    expect(result.transaction.categoryId).toBeNull();

    // The contribution row links the transfer.
    expect(result.contribution.investmentId).toBe(investmentId);
    expect(result.contribution.amountMinor).toBe(25_000_00);
    expect(result.contribution.transactionId).toBe(result.transaction.id);
    expect(result.contribution.note).toBe('August SIP');

    // invested_minor (and current value) moved by the amount.
    expect(result.investment.investedMinor).toBe(25_000_00);
    expect(result.investment.currentValueMinor).toBe(25_000_00);

    // The holding account balance reflects the transfer; the payer went down.
    expect(await accounts.getAccountBalance(holdingAccountId)).toBe(25_000_00);
    expect(await accounts.getAccountBalance(DEFAULT_ACCOUNT_IDS.bank)).toBe(
      bankBefore - 25_000_00,
    );
  });

  it('is never counted as spending: transfers are excluded from totals', async () => {
    await addInvestmentContribution(
      {
        investmentId,
        amountMinor: 25_000_00,
        accountId: DEFAULT_ACCOUNT_IDS.bank,
        occurredAt: WHEN,
      },
      createAddContributionDeps(db),
    );

    const transactions = createTransactionsRepository(db);
    const totals = await transactions.getMonthlyTotals(monthPeriod(dayjs(WHEN)));
    expect(totals.expenseMinor).toBe(0);
    expect(totals.incomeMinor).toBe(0);
  });

  it('allows repeated contributions (no period uniqueness) and keeps history', async () => {
    const deps = createAddContributionDeps(db);
    await addInvestmentContribution(
      {investmentId, amountMinor: 10_000_00, accountId: DEFAULT_ACCOUNT_IDS.bank, occurredAt: WHEN},
      deps,
    );
    await addInvestmentContribution(
      {investmentId, amountMinor: 10_000_00, accountId: DEFAULT_ACCOUNT_IDS.bank, occurredAt: WHEN},
      deps,
    );

    const investment = await investments.getInvestmentById(investmentId);
    expect(investment?.investedMinor).toBe(20_000_00);
    expect(db.getRows('transactions')).toHaveLength(2);

    const history = await investments.listContributions(investmentId);
    expect(history).toHaveLength(2);
  });

  it('adds contributions on top of an initial invested amount', async () => {
    const accounts = createAccountsRepository(db);
    const seeded = await investments.createInvestment({
      name: 'PPF',
      type: 'ppf',
      currency: 'INR',
      startedAt: dayjs('2024-04-01').valueOf(),
      initialInvestedMinor: 150_000,
    });
    await addInvestmentContribution(
      {
        investmentId: seeded.id,
        amountMinor: 50_000,
        accountId: DEFAULT_ACCOUNT_IDS.bank,
        occurredAt: WHEN,
      },
      createAddContributionDeps(db),
    );
    const updated = await investments.getInvestmentById(seeded.id);
    expect(updated?.investedMinor).toBe(200_000);
    expect(updated?.currentValueMinor).toBe(200_000);
    expect(await accounts.getAccountBalance(seeded.holdingAccountId)).toBe(200_000);
  });

  it('validates input and rejects contributing from the holding account', async () => {
    const deps = createAddContributionDeps(db);
    await expect(
      addInvestmentContribution(
        {investmentId, amountMinor: 0, accountId: DEFAULT_ACCOUNT_IDS.bank, occurredAt: WHEN},
        deps,
      ),
    ).rejects.toThrow('positive integer');
    await expect(
      addInvestmentContribution(
        {investmentId, amountMinor: 100, accountId: '', occurredAt: WHEN},
        deps,
      ),
    ).rejects.toThrow('accountId');
    await expect(
      addInvestmentContribution(
        {investmentId, amountMinor: 100, accountId: holdingAccountId, occurredAt: WHEN},
        deps,
      ),
    ).rejects.toThrow('differ from the holding account');
    await expect(
      addInvestmentContribution(
        {investmentId: 'missing', amountMinor: 100, accountId: DEFAULT_ACCOUNT_IDS.bank, occurredAt: WHEN},
        deps,
      ),
    ).rejects.toThrow('not found');
    expect(db.getRows('transactions')).toHaveLength(0);
  });

  it('rejects contributions to archived investments', async () => {
    await investments.setInvestmentActive(investmentId, false);
    await expect(
      addInvestmentContribution(
        {investmentId, amountMinor: 100, accountId: DEFAULT_ACCOUNT_IDS.bank, occurredAt: WHEN},
        createAddContributionDeps(db),
      ),
    ).rejects.toThrow('archived');
    expect(db.getRows('transactions')).toHaveLength(0);
    expect(db.getRows('investment_contributions')).toHaveLength(0);
  });
});
