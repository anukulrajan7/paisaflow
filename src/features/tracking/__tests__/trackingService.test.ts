import {
  getAccountsRepository,
  getSettingsRepository,
  getTransactionsRepository,
} from '../../../database/repositories';
import {bumpDataVersion} from '../../../store/dataVersionStore';
import {getDetectedExpensesRepository} from '../services/detectedExpensesRepository';
import type {DetectedExpense} from '../services/detectedExpensesRepository';
import {approveDetectedExpense} from '../services/trackingService';

/**
 * Approve-flow mapping: the parser's instrument (stored in parsed_json at
 * staging time) decides the transaction's payment_method, and credit-card
 * spends are booked against the user's credit_card-type account.
 */

jest.mock('../../../database/repositories', () => ({
  getAccountsRepository: jest.fn(),
  getSettingsRepository: jest.fn(),
  getTransactionsRepository: jest.fn(),
}));
jest.mock('../../../store/dataVersionStore', () => ({
  bumpDataVersion: jest.fn(),
}));
jest.mock('../services/detectedExpensesRepository', () => ({
  getDetectedExpensesRepository: jest.fn(),
}));

const mockGetAccounts = jest.mocked(getAccountsRepository);
const mockGetSettings = jest.mocked(getSettingsRepository);
const mockGetTransactions = jest.mocked(getTransactionsRepository);
const mockGetDetected = jest.mocked(getDetectedExpensesRepository);

const listAccounts = jest.fn();
const getDefaultAccountId = jest.fn();
const createTransaction = jest.fn();
const markApproved = jest.fn();

const BANK_ACCOUNT = {id: 'acc_bank', type: 'bank', isDefault: true};
const CARD_ACCOUNT = {id: 'acc_cc', type: 'credit_card', isDefault: false};

function makeItem(parsedJson: string): DetectedExpense {
  return {
    id: 'det-1',
    source: 'sms',
    rawBody: 'Rs 899.00 spent on your HDFC Bank Credit Card xx1234 at AMAZON',
    parsedJson,
    amountMinor: 89_900,
    direction: 'debit',
    merchant: 'AMAZON',
    accountHint: '1234',
    occurredAt: 1_770_000_000_000,
    categoryId: 'cat_shopping',
    dedupeHash: 'hash-1',
    status: 'pending',
    transactionId: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAccounts.mockReturnValue({listAccounts} as never);
  mockGetSettings.mockReturnValue({getDefaultAccountId} as never);
  mockGetTransactions.mockReturnValue({createTransaction} as never);
  mockGetDetected.mockReturnValue({markApproved} as never);
  getDefaultAccountId.mockResolvedValue(null);
  createTransaction.mockResolvedValue({id: 'txn-1'});
});

describe('approveDetectedExpense — instrument mapping', () => {
  it('books credit-card spends against the credit_card account as card', async () => {
    listAccounts.mockResolvedValue([BANK_ACCOUNT, CARD_ACCOUNT]);

    await approveDetectedExpense(
      makeItem(JSON.stringify({instrument: 'credit_card'})),
    );

    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'expense',
        amountMinor: 89_900,
        accountId: 'acc_cc',
        paymentMethod: 'card',
      }),
    );
    expect(markApproved).toHaveBeenCalledWith('det-1', 'txn-1');
    expect(bumpDataVersion).toHaveBeenCalled();
  });

  it('falls back to the default account when no credit_card account exists', async () => {
    listAccounts.mockResolvedValue([BANK_ACCOUNT]);

    await approveDetectedExpense(
      makeItem(JSON.stringify({instrument: 'credit_card'})),
    );

    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({accountId: 'acc_bank', paymentMethod: 'card'}),
    );
  });

  it('maps UPI to paymentMethod upi on the default account', async () => {
    getDefaultAccountId.mockResolvedValue('acc_wallet');

    await approveDetectedExpense(makeItem(JSON.stringify({instrument: 'upi'})));

    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({accountId: 'acc_wallet', paymentMethod: 'upi'}),
    );
  });

  it.each([
    ['debit_card', 'card'],
    ['net_banking', 'net_banking'],
    ['atm', 'cash'],
  ] as const)('maps instrument %s to paymentMethod %s', async (instrument, paymentMethod) => {
    getDefaultAccountId.mockResolvedValue('acc_bank');

    await approveDetectedExpense(makeItem(JSON.stringify({instrument})));

    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({accountId: 'acc_bank', paymentMethod}),
    );
  });

  it('maps unknown / legacy rows (no instrument in parsedJson) to null paymentMethod', async () => {
    getDefaultAccountId.mockResolvedValue('acc_bank');

    await approveDetectedExpense(makeItem('{"direction":"debit"}'));

    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({accountId: 'acc_bank', paymentMethod: null}),
    );
  });

  it('treats malformed parsedJson as unknown instead of throwing', async () => {
    getDefaultAccountId.mockResolvedValue('acc_bank');

    await approveDetectedExpense(makeItem('not json'));

    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({accountId: 'acc_bank', paymentMethod: null}),
    );
  });
});
