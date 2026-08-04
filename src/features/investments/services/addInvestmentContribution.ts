import type {SqlDb} from '../../../database/connection/types';
import {getDb} from '../../../database/connection/connection';
import {
  createAccountsRepository,
  createTransactionsRepository,
  getAccountsRepository,
  getTransactionsRepository,
} from '../../../database/repositories';
import type {
  AccountsRepository,
  TransactionsRepository,
} from '../../../database/repositories';
import type {Transaction} from '../../../database/types';
import type {
  Investment,
  InvestmentContribution,
} from '../types/investment';
import {
  createInvestmentsRepository,
  getInvestmentsRepository,
} from './investmentsRepository';
import type {InvestmentsRepository} from './investmentsRepository';

export interface AddInvestmentContributionInput {
  investmentId: string;
  /** Positive integer minor units. */
  amountMinor: number;
  /** Real payment account the money comes FROM. */
  accountId: string;
  /** epoch ms */
  occurredAt: number;
  note?: string | null;
}

export interface AddInvestmentContributionResult {
  contribution: InvestmentContribution;
  transaction: Transaction;
  /** Investment after invested/current totals were moved. */
  investment: Investment;
}

interface ContributionDeps {
  db: SqlDb;
  investments: InvestmentsRepository;
  transactions: TransactionsRepository;
  accounts: AccountsRepository;
}

function defaultDeps(): ContributionDeps {
  return {
    db: getDb(),
    investments: getInvestmentsRepository(),
    transactions: getTransactionsRepository(),
    accounts: getAccountsRepository(),
  };
}

/**
 * Records a contribution as ONE atomic unit:
 * 1. a real transfer transaction from the payment account into the
 *    investment's virtual holding account (merchant = investment name) —
 *    transfers are excluded from income/expense reports, so contributing is
 *    never counted as spending,
 * 2. an investment_contributions row linked to that transfer,
 * 3. invested_minor += amount and current_value_minor += amount (the money
 *    buys units worth what was paid; the user revalues manually after).
 *
 * All three writes share one db transaction; any failure rolls back all of
 * them. The caller bumps dataVersion after success.
 */
export async function addInvestmentContribution(
  input: AddInvestmentContributionInput,
  deps: ContributionDeps = defaultDeps(),
): Promise<AddInvestmentContributionResult> {
  const investment = await deps.investments.getInvestmentById(input.investmentId);
  if (!investment) {
    throw new Error('Investment not found');
  }
  if (!investment.isActive) {
    throw new Error('Investment is archived');
  }
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error('amountMinor must be a positive integer (minor units)');
  }
  if (!input.accountId) {
    throw new Error('accountId is required');
  }
  if (input.accountId === investment.holdingAccountId) {
    throw new Error('Payment account must differ from the holding account');
  }
  if (!Number.isFinite(input.occurredAt)) {
    throw new Error('occurredAt must be a valid epoch-ms timestamp');
  }

  const holding = await deps.accounts.getAccountById(investment.holdingAccountId);
  if (!holding) {
    throw new Error('Holding account not found for investment');
  }

  let transaction: Transaction | null = null;
  let contribution: InvestmentContribution | null = null;
  await deps.db.transaction(async () => {
    // createTransaction uses plain executeAsync on the same connection, so it
    // runs inside this transaction (no nested BEGIN).
    transaction = await deps.transactions.createTransaction({
      type: 'transfer',
      amountMinor: input.amountMinor,
      currency: holding.currency,
      accountId: input.accountId,
      destinationAccountId: investment.holdingAccountId,
      merchant: investment.name,
      note: input.note ?? null,
      occurredAt: input.occurredAt,
    });
    contribution = await deps.investments.insertContribution({
      investmentId: investment.id,
      amountMinor: input.amountMinor,
      transactionId: transaction.id,
      occurredAt: input.occurredAt,
      note: input.note ?? null,
    });
    await deps.investments.applyContributionTotals(
      investment.id,
      investment.investedMinor + input.amountMinor,
      investment.currentValueMinor + input.amountMinor,
    );
  });

  if (!transaction || !contribution) {
    throw new Error('Contribution failed to complete');
  }
  const updated = await deps.investments.getInvestmentById(investment.id);
  if (!updated) {
    throw new Error('Investment not found after contribution');
  }
  return {contribution, transaction, investment: updated};
}

/** Test seam: build a service wired to a fake db. */
export function createAddContributionDeps(db: SqlDb): ContributionDeps {
  return {
    db,
    investments: createInvestmentsRepository(db),
    transactions: createTransactionsRepository(db),
    accounts: createAccountsRepository(db),
  };
}
