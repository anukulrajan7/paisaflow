/**
 * Credential resolution + lazy client lifecycle. The bundled config module
 * and the keychain override store are mocked, so no real credentials,
 * keychain, or network are involved.
 */
import {
  getSupabaseClient,
  resetSupabaseClient,
  resolveSupabaseCredentials,
} from '../client';
import {getSupabaseOverride} from '../overrideStore';

let mockBundledUrl = '';
let mockBundledAnonKey = '';

jest.mock('../../../config', () => ({
  get SUPABASE_URL() {
    return mockBundledUrl;
  },
  get SUPABASE_ANON_KEY() {
    return mockBundledAnonKey;
  },
}));

jest.mock('../overrideStore', () => ({
  getSupabaseOverride: jest.fn(),
}));

const mockGetOverride = getSupabaseOverride as jest.MockedFunction<
  typeof getSupabaseOverride
>;

beforeEach(() => {
  jest.clearAllMocks();
  resetSupabaseClient();
  mockBundledUrl = '';
  mockBundledAnonKey = '';
  mockGetOverride.mockResolvedValue(null);
});

describe('resolveSupabaseCredentials', () => {
  it('resolves null when neither override nor bundled config exists', async () => {
    await expect(resolveSupabaseCredentials()).resolves.toBeNull();
  });

  it('uses the bundled config when present', async () => {
    mockBundledUrl = 'https://bundled.supabase.co';
    mockBundledAnonKey = 'bundled-key';

    await expect(resolveSupabaseCredentials()).resolves.toEqual({
      url: 'https://bundled.supabase.co',
      anonKey: 'bundled-key',
      source: 'bundled',
    });
  });

  it('treats blank bundled values as not configured', async () => {
    mockBundledUrl = '   ';
    mockBundledAnonKey = '';

    await expect(resolveSupabaseCredentials()).resolves.toBeNull();
  });

  it('prefers the runtime override over the bundled config', async () => {
    mockBundledUrl = 'https://bundled.supabase.co';
    mockBundledAnonKey = 'bundled-key';
    mockGetOverride.mockResolvedValue({
      url: 'https://override.supabase.co',
      anonKey: 'override-key',
    });

    await expect(resolveSupabaseCredentials()).resolves.toEqual({
      url: 'https://override.supabase.co',
      anonKey: 'override-key',
      source: 'override',
    });
  });
});

describe('getSupabaseClient', () => {
  it('resolves null when not configured', async () => {
    await expect(getSupabaseClient()).resolves.toBeNull();
  });

  it('creates and caches a client for the active credentials', async () => {
    mockBundledUrl = 'https://bundled.supabase.co';
    mockBundledAnonKey = 'bundled-key';

    const first = await getSupabaseClient();
    const second = await getSupabaseClient();

    expect(first).not.toBeNull();
    expect(second).toBe(first);
  });

  it('drops the cache when credentials disappear or change', async () => {
    mockBundledUrl = 'https://bundled.supabase.co';
    mockBundledAnonKey = 'bundled-key';
    const bundled = await getSupabaseClient();
    expect(bundled).not.toBeNull();

    // Credentials removed entirely -> null, cache cleared.
    mockBundledUrl = '';
    mockBundledAnonKey = '';
    await expect(getSupabaseClient()).resolves.toBeNull();

    // An override pointing at another project -> a different client.
    mockGetOverride.mockResolvedValue({
      url: 'https://override.supabase.co',
      anonKey: 'override-key',
    });
    const overridden = await getSupabaseClient();
    expect(overridden).not.toBeNull();
    expect(overridden).not.toBe(bundled);
  });
});
