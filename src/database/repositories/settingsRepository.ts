import type {SqlDb} from '../connection/types';
import {queryFirst} from '../connection/helpers';
import type {ReminderSetting, SettingsRepository} from './interfaces';

/** Well-known app_settings keys. */
export const SETTINGS_KEYS = {
  currency: 'currency',
  theme: 'theme',
  budgetCycleStartDay: 'budget_cycle_start_day',
  morningReminder: 'reminder_morning',
  eveningReminder: 'reminder_evening',
  onboardingCompleted: 'onboarding_completed',
  defaultAccountId: 'default_account_id',
  aiModel: 'ai_model',
} as const;

type ThemePreference = 'light' | 'dark' | 'system';

const DEFAULT_CURRENCY = 'INR';
const DEFAULT_THEME: ThemePreference = 'system';
const DEFAULT_CYCLE_START_DAY = 1;
const DEFAULT_MORNING_REMINDER: ReminderSetting = {
  enabled: true,
  time: '08:30',
};
const DEFAULT_EVENING_REMINDER: ReminderSetting = {
  enabled: true,
  time: '20:30',
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseReminder(raw: string | null, fallback: ReminderSetting): ReminderSetting {
  if (!raw) {
    return fallback;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as ReminderSetting).enabled === 'boolean' &&
      typeof (parsed as ReminderSetting).time === 'string' &&
      TIME_PATTERN.test((parsed as ReminderSetting).time)
    ) {
      return parsed as ReminderSetting;
    }
  } catch {
    // fall through to default
  }
  return fallback;
}

function validateReminder(setting: ReminderSetting): void {
  if (!TIME_PATTERN.test(setting.time)) {
    throw new Error(`Invalid reminder time '${setting.time}', expected 'HH:mm'`);
  }
}

export function createSettingsRepository(db: SqlDb): SettingsRepository {
  async function getValue(key: string): Promise<string | null> {
    const row = await queryFirst<{value: string}>(
      db,
      'SELECT value FROM app_settings WHERE key = ?',
      [key],
    );
    return row?.value ?? null;
  }

  async function setValue(key: string, value: string): Promise<void> {
    await db.executeAsync(
      'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)',
      [key, value, Date.now()],
    );
  }

  async function deleteValue(key: string): Promise<void> {
    await db.executeAsync('DELETE FROM app_settings WHERE key = ?', [key]);
  }

  return {
    getValue,
    setValue,

    async getCurrency() {
      return (await getValue(SETTINGS_KEYS.currency)) ?? DEFAULT_CURRENCY;
    },
    async setCurrency(currency) {
      await setValue(SETTINGS_KEYS.currency, currency);
    },

    async getThemePreference() {
      const raw = await getValue(SETTINGS_KEYS.theme);
      return raw === 'light' || raw === 'dark' || raw === 'system'
        ? raw
        : DEFAULT_THEME;
    },
    async setThemePreference(preference) {
      await setValue(SETTINGS_KEYS.theme, preference);
    },

    async getBudgetCycleStartDay() {
      const raw = await getValue(SETTINGS_KEYS.budgetCycleStartDay);
      const day = raw ? Number.parseInt(raw, 10) : NaN;
      return day >= 1 && day <= 28 ? day : DEFAULT_CYCLE_START_DAY;
    },
    async setBudgetCycleStartDay(day) {
      if (!Number.isInteger(day) || day < 1 || day > 28) {
        throw new Error('budgetCycleStartDay must be an integer in 1..28');
      }
      await setValue(SETTINGS_KEYS.budgetCycleStartDay, String(day));
    },

    async getMorningReminder() {
      return parseReminder(
        await getValue(SETTINGS_KEYS.morningReminder),
        DEFAULT_MORNING_REMINDER,
      );
    },
    async setMorningReminder(setting) {
      validateReminder(setting);
      await setValue(SETTINGS_KEYS.morningReminder, JSON.stringify(setting));
    },
    async getEveningReminder() {
      return parseReminder(
        await getValue(SETTINGS_KEYS.eveningReminder),
        DEFAULT_EVENING_REMINDER,
      );
    },
    async setEveningReminder(setting) {
      validateReminder(setting);
      await setValue(SETTINGS_KEYS.eveningReminder, JSON.stringify(setting));
    },

    async isOnboardingComplete() {
      return (await getValue(SETTINGS_KEYS.onboardingCompleted)) === 'true';
    },
    async setOnboardingComplete(complete) {
      await setValue(SETTINGS_KEYS.onboardingCompleted, complete ? 'true' : 'false');
    },

    async getDefaultAccountId() {
      return getValue(SETTINGS_KEYS.defaultAccountId);
    },
    async setDefaultAccountId(id) {
      if (id == null) {
        await deleteValue(SETTINGS_KEYS.defaultAccountId);
      } else {
        await setValue(SETTINGS_KEYS.defaultAccountId, id);
      }
    },

    async getAiModel() {
      return getValue(SETTINGS_KEYS.aiModel);
    },
    async setAiModel(model) {
      await setValue(SETTINGS_KEYS.aiModel, model);
    },
  };
}
