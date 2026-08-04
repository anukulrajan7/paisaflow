import {MIGRATIONS, runMigrations} from '../migrations';
import {
  createSettingsRepository,
  SETTINGS_KEYS,
} from '../repositories/settingsRepository';
import type {SettingsRepository} from '../repositories/interfaces';
import {createFakeDb} from './fakeDb';

describe('SettingsRepository', () => {
  let repo: SettingsRepository;

  beforeEach(async () => {
    const db = createFakeDb();
    await runMigrations(db, MIGRATIONS);
    repo = createSettingsRepository(db);
  });

  it('get/set round trip with updated_at', async () => {
    expect(await repo.getValue('greeting')).toBeNull();
    await repo.setValue('greeting', 'hello');
    expect(await repo.getValue('greeting')).toBe('hello');
    await repo.setValue('greeting', 'namaste');
    expect(await repo.getValue('greeting')).toBe('namaste');
  });

  it('currency defaults to INR and persists overrides', async () => {
    expect(await repo.getCurrency()).toBe('INR');
    await repo.setCurrency('USD');
    expect(await repo.getCurrency()).toBe('USD');
  });

  it('theme preference defaults to system and round trips', async () => {
    expect(await repo.getThemePreference()).toBe('system');
    await repo.setThemePreference('dark');
    expect(await repo.getThemePreference()).toBe('dark');
  });

  it('budgetCycleStartDay defaults to 1, validates 1..28', async () => {
    expect(await repo.getBudgetCycleStartDay()).toBe(1);
    await repo.setBudgetCycleStartDay(15);
    expect(await repo.getBudgetCycleStartDay()).toBe(15);
    await expect(repo.setBudgetCycleStartDay(0)).rejects.toThrow('1..28');
    await expect(repo.setBudgetCycleStartDay(29)).rejects.toThrow('1..28');
  });

  it('reminder settings round trip with defaults and validation', async () => {
    expect(await repo.getMorningReminder()).toEqual({
      enabled: true,
      time: '08:30',
    });
    expect(await repo.getEveningReminder()).toEqual({
      enabled: true,
      time: '20:30',
    });
    await repo.setEveningReminder({enabled: false, time: '21:45'});
    expect(await repo.getEveningReminder()).toEqual({
      enabled: false,
      time: '21:45',
    });
    await expect(
      repo.setMorningReminder({enabled: true, time: '25:00'}),
    ).rejects.toThrow('HH:mm');
  });

  it('onboarding flag defaults to incomplete', async () => {
    expect(await repo.isOnboardingComplete()).toBe(false);
    await repo.setOnboardingComplete(true);
    expect(await repo.isOnboardingComplete()).toBe(true);
  });

  it('defaultAccountId is null until set, cleared by null', async () => {
    expect(await repo.getDefaultAccountId()).toBeNull();
    await repo.setDefaultAccountId('acc_bank');
    expect(await repo.getDefaultAccountId()).toBe('acc_bank');
    expect(await repo.getValue(SETTINGS_KEYS.defaultAccountId)).toBe('acc_bank');
    await repo.setDefaultAccountId(null);
    expect(await repo.getDefaultAccountId()).toBeNull();
  });

  it('aiModel round trip', async () => {
    expect(await repo.getAiModel()).toBeNull();
    await repo.setAiModel('openai/gpt-4o-mini');
    expect(await repo.getAiModel()).toBe('openai/gpt-4o-mini');
  });
});
