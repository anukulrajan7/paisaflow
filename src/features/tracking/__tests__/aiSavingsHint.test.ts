/**
 * AI savings hint: weekly aggregate payload, Zod validation, gating
 * (offline / missing key), and the session cache (keyed by the week's totals,
 * so new approvals force a fresh call). The provider is always a fake.
 */
import NetInfo from '@react-native-community/netinfo';
import * as Keychain from 'react-native-keychain';

import {
  getSettingsRepository,
  getTransactionsRepository,
} from '../../../database/repositories';
import {ProviderError} from '../../../services/openrouter';
import type {SummaryProvider} from '../../../services/openrouter';
import {setOpenRouterApiKey} from '../../../services/security/secureKeyStore';
import {
  __clearSavingsHintSessionCache,
  getSavingsHint,
  parseSavingsHintResponse,
} from '../services/aiSavingsHint';

jest.mock('../../../database/repositories', () => ({
  getSettingsRepository: jest.fn(),
  getTransactionsRepository: jest.fn(),
}));

const mockGetSettings = jest.mocked(getSettingsRepository);
const mockGetTransactions = jest.mocked(getTransactionsRepository);
const mockFetchNetInfo = NetInfo.fetch as jest.Mock;

const getCurrency = jest.fn();
const getAiModel = jest.fn();
const getMonthlyTotals = jest.fn();
const getCategoryTotals = jest.fn();

const WEEK_TOTALS = {incomeMinor: 500_000, expenseMinor: 250_000, count: 12};
const CATEGORY_TOTALS = [
  {
    categoryId: 'cat_food',
    name: 'Food & Dining',
    icon: 'utensils',
    color: '#fff',
    totalMinor: 120_000,
    count: 6,
  },
];

const VALID_REPLY = JSON.stringify({
  suggestions: ['Cook two more dinners at home.', 'Cap food delivery at ₹500.'],
});

function fakeProvider(reply: string): SummaryProvider {
  return {
    name: 'fake',
    generateSummary: jest.fn().mockResolvedValue(reply),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (
    Keychain as unknown as {__clearKeychainVault: () => void}
  ).__clearKeychainVault();
  __clearSavingsHintSessionCache();
  mockFetchNetInfo.mockResolvedValue({
    type: 'wifi',
    isConnected: true,
    isInternetReachable: true,
    details: null,
  });
  getCurrency.mockResolvedValue('INR');
  getAiModel.mockResolvedValue(null);
  getMonthlyTotals.mockResolvedValue(WEEK_TOTALS);
  getCategoryTotals.mockResolvedValue(CATEGORY_TOTALS);
  mockGetSettings.mockReturnValue({getCurrency, getAiModel} as never);
  mockGetTransactions.mockReturnValue({
    getMonthlyTotals,
    getCategoryTotals,
  } as never);
});

describe('parseSavingsHintResponse', () => {
  it('accepts a valid reply', () => {
    expect(parseSavingsHintResponse(VALID_REPLY)?.suggestions).toHaveLength(2);
  });

  it('unwraps code fences', () => {
    expect(
      parseSavingsHintResponse(`\`\`\`json\n${VALID_REPLY}\n\`\`\``),
    ).not.toBeNull();
  });

  it('rejects an empty suggestions array and non-JSON replies', () => {
    expect(parseSavingsHintResponse('{"suggestions": []}')).toBeNull();
    expect(parseSavingsHintResponse('no json here')).toBeNull();
  });
});

describe('getSavingsHint — gating', () => {
  it('throws offline without building the payload or calling the provider', async () => {
    mockFetchNetInfo.mockResolvedValue({
      type: 'none',
      isConnected: false,
      isInternetReachable: false,
      details: null,
    });
    await setOpenRouterApiKey('sk-or-test');
    const provider = fakeProvider(VALID_REPLY);

    const error = await getSavingsHint({provider}).catch(e => e);

    expect(error).toBeInstanceOf(ProviderError);
    expect(error.kind).toBe('offline');
    expect(provider.generateSummary).not.toHaveBeenCalled();
    expect(getMonthlyTotals).not.toHaveBeenCalled();
  });

  it('throws missing_key when no key exists', async () => {
    const provider = fakeProvider(VALID_REPLY);

    const error = await getSavingsHint({provider}).catch(e => e);

    expect(error).toBeInstanceOf(ProviderError);
    expect(error.kind).toBe('missing_key');
    expect(provider.generateSummary).not.toHaveBeenCalled();
  });
});

describe('getSavingsHint — suggestions and session cache', () => {
  beforeEach(async () => {
    await setOpenRouterApiKey('sk-or-test');
  });

  it('returns validated suggestions from the provider', async () => {
    const result = await getSavingsHint({provider: fakeProvider(VALID_REPLY)});

    expect(result.fromCache).toBe(false);
    expect(result.suggestions).toEqual([
      'Cook two more dinners at home.',
      'Cap food delivery at ₹500.',
    ]);
  });

  it('serves repeat calls from the session cache without a second API call', async () => {
    const provider = fakeProvider(VALID_REPLY);

    const first = await getSavingsHint({provider});
    const second = await getSavingsHint({provider});

    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(second.suggestions).toEqual(first.suggestions);
    expect(provider.generateSummary).toHaveBeenCalledTimes(1);
  });

  it('re-calls the provider when the week totals change (new approvals)', async () => {
    const provider = fakeProvider(VALID_REPLY);

    await getSavingsHint({provider});
    getMonthlyTotals.mockResolvedValue({...WEEK_TOTALS, expenseMinor: 300_000});
    const fresh = await getSavingsHint({provider});

    expect(fresh.fromCache).toBe(false);
    expect(provider.generateSummary).toHaveBeenCalledTimes(2);
  });

  it('throws invalid_response for an unusable reply', async () => {
    const provider = fakeProvider('not json at all');

    const error = await getSavingsHint({provider}).catch(e => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.kind).toBe('invalid_response');
  });
});
