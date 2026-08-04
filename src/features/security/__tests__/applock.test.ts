import * as Keychain from 'react-native-keychain';

import {MIGRATIONS, runMigrations} from '../../../database/migrations';
import {getSettingsRepository} from '../../../database/repositories';
import {createSettingsRepository} from '../../../database/repositories/settingsRepository';
import type {SettingsRepository} from '../../../database/repositories/interfaces';
import {createFakeDb} from '../../../database/__tests__/fakeDb';
import {
  APP_LOCK_ENABLED_KEY,
  deleteAppLockPin,
  hasAppLockPin,
  isAppLockEnabled,
  setAppLockEnabled,
  setAppLockPin,
  validatePin,
  verifyAppLockPin,
} from '../../../services/security/applock';

// The service resolves the repository via the lazy singleton; point it at a
// fakeDb-backed repository instead of the native connection.
jest.mock('../../../database/repositories', () => ({
  getSettingsRepository: jest.fn(),
}));

const mockGetSettings = getSettingsRepository as jest.MockedFunction<
  typeof getSettingsRepository
>;

const clearVault = () =>
  (
    Keychain as unknown as {__clearKeychainVault: () => void}
  ).__clearKeychainVault();

beforeEach(async () => {
  clearVault();
  const db = createFakeDb();
  await runMigrations(db, MIGRATIONS);
  const repo: SettingsRepository = createSettingsRepository(db);
  mockGetSettings.mockReturnValue(repo);
});

describe('validatePin', () => {
  it('accepts 4–6 digit PINs', () => {
    expect(validatePin('1234')).toBeNull();
    expect(validatePin('00000')).toBeNull();
    expect(validatePin('123456')).toBeNull();
  });

  it('rejects PINs that are too short or too long', () => {
    expect(validatePin('')).toMatch(/digits only/);
    expect(validatePin('1')).toMatch(/4–6 digits/);
    expect(validatePin('123')).toMatch(/4–6 digits/);
    expect(validatePin('1234567')).toMatch(/4–6 digits/);
  });

  it('rejects non-numeric PINs', () => {
    expect(validatePin('abcd')).toMatch(/digits only/);
    expect(validatePin('12a4')).toMatch(/digits only/);
    expect(validatePin('12 4')).toMatch(/digits only/);
  });
});

describe('PIN storage (keychain)', () => {
  it('set → verify round trip; wrong PIN rejected', async () => {
    expect(await hasAppLockPin()).toBe(false);
    await setAppLockPin('4242');
    expect(await hasAppLockPin()).toBe(true);
    expect(await verifyAppLockPin('4242')).toBe(true);
    expect(await verifyAppLockPin('4243')).toBe(false);
  });

  it('verify resolves false when no PIN is stored', async () => {
    expect(await verifyAppLockPin('1234')).toBe(false);
  });

  it('replaces the PIN on re-set and removes it on delete', async () => {
    await setAppLockPin('1111');
    await setAppLockPin('2222');
    expect(await verifyAppLockPin('1111')).toBe(false);
    expect(await verifyAppLockPin('2222')).toBe(true);

    await deleteAppLockPin();
    expect(await hasAppLockPin()).toBe(false);
    expect(await verifyAppLockPin('2222')).toBe(false);
  });

  it('refuses to store an invalid PIN', async () => {
    await expect(setAppLockPin('12')).rejects.toThrow();
    expect(await hasAppLockPin()).toBe(false);
  });
});

describe('app-lock enabled flag (app_settings)', () => {
  it('defaults to disabled and round trips through app_settings', async () => {
    expect(await isAppLockEnabled()).toBe(false);

    await setAppLockEnabled(true);
    expect(await isAppLockEnabled()).toBe(true);
    expect(await getSettingsRepository().getValue(APP_LOCK_ENABLED_KEY)).toBe(
      'true',
    );

    await setAppLockEnabled(false);
    expect(await isAppLockEnabled()).toBe(false);
    expect(await getSettingsRepository().getValue(APP_LOCK_ENABLED_KEY)).toBe(
      'false',
    );
  });
});
