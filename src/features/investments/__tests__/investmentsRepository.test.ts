import {MIGRATIONS, runMigrations} from '../../../database/migrations';
import {DEFAULT_ACCOUNT_IDS, seedDefaultData} from '../../../database/seeds';
import {createAccountsRepository} from '../../../database/repositories';
import {createFakeDb} from '../../../database/__tests__/fakeDb';
import type {FakeDb} from '../../../database/__tests__/fakeDb';
import {dayjs} from '../../../utils/date';
import {
  createInvestmentsRepository,
  type CreateInvestmentInput,
  type InvestmentsRepository,
} from '../services/investmentsRepository';

const STARTED = dayjs('2025-06-01T09:00:00').valueOf();

function baseInput(
  overrides: Partial<CreateInvestmentInput> = {},
): CreateInvestmentInput {
  return {
    name: 'Nifty 50 index fund',
    type: 'mutual_fund',
    currency: 'INR',
    startedAt: STARTED,
    ...overrides,
  };
}

describe('InvestmentsRepository', () => {
  let db: FakeDb;
  let repo: InvestmentsRepository;

  beforeEach(async () => {
    db = createFakeDb();
    await runMigrations(db, MIGRATIONS);
    await seedDefaultData(db);
    repo = createInvestmentsRepository(db);
  });

  it('creates an investment with a virtual holding account in one go', async () => {
    const created = await repo.createInvestment(baseInput());
    expect(created.id).toBeTruthy();
    expect(created.investedMinor).toBe(0);
    expect(created.currentValueMinor).toBe(0);
    expect(created.isActive).toBe(true);
    expect(created.maturityAt).toBeNull();

    const accounts = createAccountsRepository(db);
    const holding = await accounts.getAccountById(created.holdingAccountId);
    expect(holding).not.toBeNull();
    expect(holding?.type).toBe('investment');
    expect(holding?.name).toBe('Nifty 50 index fund');
    expect(holding?.isArchived).toBe(true);
    expect(holding?.openingBalanceMinor).toBe(0);
  });

  it('seeds an initial invested amount as the holding opening balance', async () => {
    const created = await repo.createInvestment(
      baseInput({initialInvestedMinor: 250_000}),
    );
    expect(created.investedMinor).toBe(250_000);
    expect(created.currentValueMinor).toBe(250_000);

    const accounts = createAccountsRepository(db);
    expect(await accounts.getAccountBalance(created.holdingAccountId)).toBe(
      250_000,
    );
    // No transfer is created for the pre-existing amount.
    expect(db.getRows('transactions')).toHaveLength(0);
    expect(db.getRows('investment_contributions')).toHaveLength(0);
  });

  it('validates name, type, amounts and reminder day', async () => {
    await expect(repo.createInvestment(baseInput({name: ' '}))).rejects.toThrow(
      'name',
    );
    await expect(
      repo.createInvestment(baseInput({type: 'hedge_fund' as never})),
    ).rejects.toThrow('type');
    await expect(repo.createInvestment(baseInput({currency: ''}))).rejects.toThrow(
      'currency',
    );
    await expect(
      repo.createInvestment(baseInput({initialInvestedMinor: -1})),
    ).rejects.toThrow('non-negative integer');
    await expect(
      repo.createInvestment(baseInput({initialInvestedMinor: 1.5})),
    ).rejects.toThrow('non-negative integer');
    await expect(
      repo.createInvestment(baseInput({monthlyContributionMinor: 0})),
    ).rejects.toThrow('monthlyContributionMinor');
    await expect(
      repo.createInvestment(baseInput({reminderDay: 29})),
    ).rejects.toThrow('reminderDay');
    await expect(
      repo.createInvestment(baseInput({reminderDay: 0})),
    ).rejects.toThrow('reminderDay');
  });

  it('updates details and renames the holding account with the name', async () => {
    const created = await repo.createInvestment(baseInput());
    const maturity = dayjs('2030-06-01').valueOf();
    const updated = await repo.updateInvestment(created.id, {
      name: 'Nifty 50 (direct)',
      type: 'stocks',
      maturityAt: maturity,
      monthlyContributionMinor: 10_000_00,
      reminderDay: 5,
      notes: 'SIP via broker',
    });
    expect(updated.name).toBe('Nifty 50 (direct)');
    expect(updated.type).toBe('stocks');
    expect(updated.maturityAt).toBe(maturity);
    expect(updated.monthlyContributionMinor).toBe(10_000_00);
    expect(updated.reminderDay).toBe(5);
    expect(updated.notes).toBe('SIP via broker');

    const accounts = createAccountsRepository(db);
    const holding = await accounts.getAccountById(created.holdingAccountId);
    expect(holding?.name).toBe('Nifty 50 (direct)');
  });

  it('clears optional fields when patched to null', async () => {
    const created = await repo.createInvestment(
      baseInput({
        maturityAt: dayjs('2030-01-01').valueOf(),
        monthlyContributionMinor: 500_00,
        reminderDay: 10,
      }),
    );
    const updated = await repo.updateInvestment(created.id, {
      maturityAt: null,
      monthlyContributionMinor: null,
      reminderDay: null,
    });
    expect(updated.maturityAt).toBeNull();
    expect(updated.monthlyContributionMinor).toBeNull();
    expect(updated.reminderDay).toBeNull();
  });

  it('updates the manual current value and rejects negatives', async () => {
    const created = await repo.createInvestment(
      baseInput({initialInvestedMinor: 100_000}),
    );
    const updated = await repo.updateCurrentValue(created.id, 132_050);
    expect(updated.currentValueMinor).toBe(132_050);
    expect(updated.investedMinor).toBe(100_000);
    await expect(repo.updateCurrentValue(created.id, -5)).rejects.toThrow(
      'non-negative integer',
    );
    await expect(repo.updateCurrentValue('nope', 100)).rejects.toThrow(
      'not found',
    );
  });

  it('archives via is_active = 0 and hides archived rows from the default list', async () => {
    const first = await repo.createInvestment(baseInput());
    const second = await repo.createInvestment(baseInput({name: 'PPF account'}));

    await repo.setInvestmentActive(first.id, false);

    const listed = await repo.listInvestments();
    expect(listed.map(i => i.id)).toEqual([second.id]);

    const all = await repo.listInvestments({includeInactive: true});
    expect(all).toHaveLength(2);
    // Archived rows remain readable by id (history is kept).
    const archived = await repo.getInvestmentById(first.id);
    expect(archived?.isActive).toBe(false);
  });

  it('lists investments A→Z by name', async () => {
    await repo.createInvestment(baseInput({name: 'Zerodha stocks'}));
    await repo.createInvestment(baseInput({name: 'Bank FD'}));
    const listed = await repo.listInvestments();
    expect(listed.map(i => i.name)).toEqual(['Bank FD', 'Zerodha stocks']);
  });

  it('does not collide with seeded accounts', async () => {
    await repo.createInvestment(baseInput());
    const accounts = createAccountsRepository(db);
    const bank = await accounts.getAccountById(DEFAULT_ACCOUNT_IDS.bank);
    expect(bank).not.toBeNull();
  });
});
