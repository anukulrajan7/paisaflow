import {getDb} from '../../database/connection/connection';
import {queryFirst, queryRows} from '../../database/connection/helpers';
import type {SqlDb} from '../../database/connection/types';
import type {Period} from '../../database/types';
import {createSettingsRepository} from '../../database/repositories/settingsRepository';
import {contributionPeriodKey} from '../../features/savings/utils/savingsGoalMath';
import type {ContributionFrequency} from '../../features/savings/types/savingsGoal';
import {dayjs, dayPeriod} from '../../utils/date';
import {formatMoney} from '../../utils/money';
import {EVENING_REMINDER_COPY, MORNING_REMINDER_COPY} from './constants';

/** Reminder slot whose copy is being composed. */
export type ReminderKind = 'morning' | 'evening';

/**
 * Deep-link targets carried in the notification's `data.screen` payload.
 * Money-hub screens live in the SettingsStack; taps reach them through the
 * SettingsTab nested navigator (see app/navigation/notificationNavigation).
 */
export type ReminderScreenTarget =
  | 'Home'
  | 'AddTransaction'
  | 'People'
  | 'Salary'
  | 'Investments'
  | 'SavingsGoals';

export interface ReminderContent {
  title: string;
  body: string;
  /** Deep-link target for notification taps. */
  screen: ReminderScreenTarget;
}

/**
 * Raw app_settings keys ('true'/'false'; a missing key means enabled) gating
 * each reminder content category. Edited from the MoneyReminders screen.
 */
export const REMINDER_INCLUDE_KEYS = {
  lent: 'reminder.include.lent',
  salary: 'reminder.include.salary',
  investments: 'reminder.include.investments',
  savings: 'reminder.include.savings',
  spending: 'reminder.include.spending',
} as const;

export type ReminderIncludeCategory = keyof typeof REMINDER_INCLUDE_KEYS;

/** One composed sentence plus the screen a tap should open. */
interface Section {
  sentence: string;
  screen: ReminderScreenTarget;
}

/** Monthly period key ('YYYY-MM') shared with salary_records. */
function currentPeriodKey(now: Date): string {
  return dayjs(now).format('YYYY-MM');
}

/** '₹2,000' instead of '₹2,000.00' — notification copy drops a zero fraction. */
function formatShort(minor: number, currency: string): string {
  return formatMoney(minor, currency).replace(/\.00$/, '');
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

async function loadPersonNames(
  db: SqlDb,
  ids: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) {
    return names;
  }
  const placeholders = unique.map(() => '?').join(', ');
  const rows = await queryRows<{id: string; name: string}>(
    db,
    `SELECT id, name FROM people WHERE id IN (${placeholders})`,
    unique,
  );
  for (const row of rows) {
    names.set(row.id, row.name);
  }
  return names;
}

interface LedgerRow {
  person_id: string;
  direction: string;
  amount_minor: number;
  repaid_minor: number;
  currency: string;
  expected_return_at: number | null;
  reminder_enabled: number;
  updated_at: number;
}

function remainingMinor(row: LedgerRow): number {
  return Math.max(row.amount_minor - row.repaid_minor, 0);
}

/**
 * Morning: money expected back (or owed) today plus overdue counts. An entry
 * is eligible when its reminder is enabled and it is due today, or when it is
 * already overdue (expected_return_at before today).
 */
async function ledgerDueSections(db: SqlDb, day: Period): Promise<Section[]> {
  const rows = await queryRows<LedgerRow>(
    db,
    `SELECT person_id, direction, amount_minor, repaid_minor, currency, expected_return_at, reminder_enabled, updated_at
     FROM ledger_entries
     WHERE deleted_at IS NULL AND status != ? AND expected_return_at IS NOT NULL AND expected_return_at < ?`,
    ['completed', day.end],
  );
  const dueToday = rows.filter(
    row =>
      row.reminder_enabled === 1 &&
      row.expected_return_at != null &&
      row.expected_return_at >= day.start,
  );
  const overdue = rows.filter(
    row => row.expected_return_at != null && row.expected_return_at < day.start,
  );
  if (dueToday.length === 0 && overdue.length === 0) {
    return [];
  }

  const names = await loadPersonNames(db, dueToday.map(row => row.person_id));
  const name = (id: string): string => names.get(id) ?? 'someone';
  const currency = dueToday[0]?.currency ?? 'INR';

  const sentences: string[] = [];
  const lent = dueToday.filter(row => row.direction !== 'borrowed');
  const borrowed = dueToday.filter(row => row.direction === 'borrowed');
  if (lent.length === 1) {
    sentences.push(
      `${formatShort(remainingMinor(lent[0]), currency)} expected from ${name(
        lent[0].person_id,
      )} today`,
    );
  } else if (lent.length > 1) {
    const total = lent.reduce((sum, row) => sum + remainingMinor(row), 0);
    sentences.push(
      `${formatShort(total, currency)} expected back from ${plural(
        lent.length,
        'person',
      )} today`,
    );
  }
  if (borrowed.length === 1) {
    sentences.push(
      `you owe ${name(borrowed[0].person_id)} ${formatShort(
        remainingMinor(borrowed[0]),
        currency,
      )} today`,
    );
  } else if (borrowed.length > 1) {
    const total = borrowed.reduce((sum, row) => sum + remainingMinor(row), 0);
    sentences.push(
      `you owe ${formatShort(total, currency)} to ${plural(
        borrowed.length,
        'person',
      )} today`,
    );
  }
  if (overdue.length > 0) {
    sentences.push(`${plural(overdue.length, 'overdue payment')} to settle`);
  }
  return sentences.map(sentence => ({sentence, screen: 'People' as const}));
}

/** Evening: repayments recorded today, then overdue personal payments. */
async function ledgerEveningSections(db: SqlDb, day: Period): Promise<Section[]> {
  const sections: Section[] = [];

  const repaidRows = await queryRows<LedgerRow>(
    db,
    `SELECT person_id, direction, amount_minor, repaid_minor, currency, expected_return_at, reminder_enabled, updated_at
     FROM ledger_entries
     WHERE deleted_at IS NULL AND repaid_minor > 0 AND updated_at >= ? AND updated_at < ?`,
    [day.start, day.end],
  );
  if (repaidRows.length > 0) {
    const names = await loadPersonNames(db, repaidRows.map(row => row.person_id));
    const currency = repaidRows[0].currency;
    if (repaidRows.length === 1) {
      const row = repaidRows[0];
      const who = names.get(row.person_id) ?? 'Someone';
      sections.push({
        sentence:
          row.direction === 'borrowed'
            ? `you repaid ${who} ${formatShort(row.repaid_minor, currency)} today`
            : `${who} repaid ${formatShort(row.repaid_minor, currency)} today`,
        screen: 'People',
      });
    } else {
      sections.push({
        sentence: `${plural(repaidRows.length, 'repayment')} came in today`,
        screen: 'People',
      });
    }
  }

  const overdueRows = await queryRows<{id: string}>(
    db,
    `SELECT id FROM ledger_entries
     WHERE deleted_at IS NULL AND status != ? AND expected_return_at IS NOT NULL AND expected_return_at < ?`,
    ['completed', day.start],
  );
  if (overdueRows.length > 0) {
    sections.push({
      sentence: `you have ${plural(overdueRows.length, 'overdue personal payment')}`,
      screen: 'People',
    });
  }
  return sections;
}

interface SalaryConfigRow {
  id: string;
  amount_minor: number;
  currency: string;
  employer: string | null;
}

async function hasSalaryRecord(
  db: SqlDb,
  configId: string,
  periodKey: string,
): Promise<boolean> {
  const row = await queryFirst<{id: string}>(
    db,
    'SELECT id FROM salary_records WHERE config_id = ? AND period_key = ?',
    [configId, periodKey],
  );
  return row != null;
}

/** Morning: active salary configs whose expected day is today, unconfirmed. */
async function salaryExpectedSection(
  db: SqlDb,
  dayOfMonth: number,
  periodKey: string,
): Promise<Section[]> {
  const configs = await queryRows<SalaryConfigRow>(
    db,
    'SELECT id, amount_minor, currency, employer FROM salary_configs WHERE is_active = 1 AND expected_day = ?',
    [dayOfMonth],
  );
  const pending: SalaryConfigRow[] = [];
  for (const config of configs) {
    if (!(await hasSalaryRecord(db, config.id, periodKey))) {
      pending.push(config);
    }
  }
  if (pending.length === 0) {
    return [];
  }
  if (pending.length === 1) {
    const config = pending[0];
    const from = config.employer ? ` from ${config.employer}` : '';
    return [
      {
        sentence: `your ${formatShort(
          config.amount_minor,
          config.currency,
        )} salary${from} is expected today`,
        screen: 'Salary',
      },
    ];
  }
  return [
    {
      sentence: `${plural(pending.length, 'salary credit')} expected today`,
      screen: 'Salary',
    },
  ];
}

/** Evening: salary day has arrived/passed but no record exists this period. */
async function salaryUnconfirmedSection(
  db: SqlDb,
  dayOfMonth: number,
  periodKey: string,
): Promise<Section[]> {
  const configs = await queryRows<SalaryConfigRow>(
    db,
    'SELECT id, amount_minor, currency, employer FROM salary_configs WHERE is_active = 1 AND expected_day <= ?',
    [dayOfMonth],
  );
  const pending: SalaryConfigRow[] = [];
  for (const config of configs) {
    if (!(await hasSalaryRecord(db, config.id, periodKey))) {
      pending.push(config);
    }
  }
  if (pending.length === 0) {
    return [];
  }
  if (pending.length === 1) {
    return [
      {
        sentence: `your ${formatShort(
          pending[0].amount_minor,
          pending[0].currency,
        )} salary is still unconfirmed`,
        screen: 'Salary',
      },
    ];
  }
  return [{sentence: 'your salary is still unconfirmed', screen: 'Salary'}];
}

/** Morning: active investments whose monthly reminder day is today. */
async function investmentDueSection(
  db: SqlDb,
  dayOfMonth: number,
): Promise<Section[]> {
  const rows = await queryRows<{
    name: string;
    monthly_contribution_minor: number | null;
  }>(
    db,
    'SELECT name, monthly_contribution_minor FROM investments WHERE is_active = 1 AND deleted_at IS NULL AND reminder_day = ?',
    [dayOfMonth],
  );
  if (rows.length === 0) {
    return [];
  }
  if (rows.length === 1) {
    const row = rows[0];
    return [
      {
        sentence:
          row.monthly_contribution_minor != null
            ? `your ${formatShort(row.monthly_contribution_minor, 'INR')} monthly investment is due`
            : `your ${row.name} investment contribution is due`,
        screen: 'Investments',
      },
    ];
  }
  return [
    {
      sentence: `${plural(rows.length, 'investment contribution')} due today`,
      screen: 'Investments',
    },
  ];
}

/** Bucket frequency for a raw savings_goals.contribution_frequency value. */
function toFrequency(raw: string | null): ContributionFrequency {
  // Mirrors savingsGoalMath's UNSCHEDULED_FREQUENCY: unscheduled goals
  // bucket contributions by day.
  return raw === 'daily' || raw === 'weekly' || raw === 'monthly'
    ? raw
    : 'daily';
}

/** Active savings goals for this slot with no contribution this period. */
async function savingsDueSection(
  db: SqlDb,
  kind: ReminderKind,
  now: Date,
): Promise<Section[]> {
  const goals = await queryRows<{
    id: string;
    name: string;
    contribution_amount_minor: number | null;
    contribution_frequency: string | null;
    currency: string;
  }>(
    db,
    'SELECT id, name, contribution_amount_minor, contribution_frequency, currency FROM savings_goals WHERE is_active = 1 AND reminder_slot = ?',
    [kind],
  );
  const pending: typeof goals = [];
  for (const goal of goals) {
    const periodKey = contributionPeriodKey(
      toFrequency(goal.contribution_frequency),
      now.getTime(),
    );
    const contribution = await queryFirst<{id: string}>(
      db,
      'SELECT id FROM savings_contributions WHERE goal_id = ? AND period_key = ?',
      [goal.id, periodKey],
    );
    if (contribution == null) {
      pending.push(goal);
    }
  }
  if (pending.length === 0) {
    return [];
  }
  if (pending.length === 1) {
    const goal = pending[0];
    return [
      {
        sentence:
          goal.contribution_amount_minor != null
            ? `add ${formatShort(
                goal.contribution_amount_minor,
                goal.currency,
              )} to your "${goal.name}" goal today`
            : `add to your "${goal.name}" savings goal today`,
        screen: 'SavingsGoals',
      },
    ];
  }
  return [
    {
      sentence: `${plural(pending.length, 'savings goal')} need a contribution`,
      screen: 'SavingsGoals',
    },
  ];
}

/** Evening: total of today's expense transactions (transfers excluded). */
async function spendingSection(db: SqlDb, day: Period): Promise<Section[]> {
  const rows = await queryRows<{amount_minor: number}>(
    db,
    `SELECT amount_minor FROM transactions
     WHERE deleted_at IS NULL AND type = ? AND occurred_at >= ? AND occurred_at < ?`,
    ['expense', day.start, day.end],
  );
  const total = rows.reduce((sum, row) => sum + row.amount_minor, 0);
  if (total <= 0) {
    return [];
  }
  const currency = await createSettingsRepository(db).getCurrency();
  return [
    {
      sentence: `you spent ${formatShort(total, currency)} today`,
      screen: 'AddTransaction',
    },
  ];
}

async function loadIncludes(
  db: SqlDb,
): Promise<Record<ReminderIncludeCategory, boolean>> {
  const settings = createSettingsRepository(db);
  const categories = Object.keys(
    REMINDER_INCLUDE_KEYS,
  ) as ReminderIncludeCategory[];
  const entries = await Promise.all(
    categories.map(async category => {
      const raw = await settings.getValue(REMINDER_INCLUDE_KEYS[category]);
      return [category, raw !== 'false'] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<ReminderIncludeCategory, boolean>;
}

/** Static copy used when no section applies (or composition fails). */
export function fallbackReminderContent(kind: ReminderKind): ReminderContent {
  const copy = kind === 'morning' ? MORNING_REMINDER_COPY : EVENING_REMINDER_COPY;
  return {
    title: copy.title,
    body: copy.body,
    screen: kind === 'morning' ? 'Home' : 'AddTransaction',
  };
}

const MAX_SENTENCES = 3;

/**
 * Compose reminder copy from local SQLite data. Pure-ish: all reads go through
 * the injected db (defaults to the app connection), and `now` is injectable
 * for deterministic tests. Every section runs in its own try/catch — Phase 9
 * tables may be empty or missing, and a partial reminder beats a broken one.
 *
 * When nothing applies, falls back to the static copy. The first contributing
 * section (priority: people → salary → investments → savings) decides the
 * deep-link target; the evening default is the Add tab.
 */
export async function composeReminderBody(
  kind: ReminderKind,
  db: SqlDb = getDb(),
  now: Date = new Date(),
): Promise<ReminderContent> {
  const includes = await loadIncludes(db);
  const day = dayPeriod(dayjs(now));
  const periodKey = currentPeriodKey(now);
  const dayOfMonth = now.getDate();

  const sections: Section[] = [];
  const collect = async (factory: () => Promise<Section[]>): Promise<void> => {
    try {
      sections.push(...(await factory()));
    } catch {
      // Section skipped — a missing/empty table must not break the rest.
    }
  };

  if (kind === 'morning') {
    if (includes.lent) {
      await collect(() => ledgerDueSections(db, day));
    }
    if (includes.salary) {
      await collect(() => salaryExpectedSection(db, dayOfMonth, periodKey));
    }
    if (includes.investments) {
      await collect(() => investmentDueSection(db, dayOfMonth));
    }
    if (includes.savings) {
      await collect(() => savingsDueSection(db, kind, now));
    }
  } else {
    if (includes.lent) {
      await collect(() => ledgerEveningSections(db, day));
    }
    if (includes.salary) {
      await collect(() => salaryUnconfirmedSection(db, dayOfMonth, periodKey));
    }
    if (includes.savings) {
      await collect(() => savingsDueSection(db, kind, now));
    }
    if (includes.spending) {
      await collect(() => spendingSection(db, day));
    }
  }

  const fallback = fallbackReminderContent(kind);
  if (sections.length === 0) {
    return fallback;
  }
  const greeting = kind === 'morning' ? 'Good morning.' : 'Good evening.';
  const body = sections
    .slice(0, MAX_SENTENCES)
    .map(section => section.sentence)
    .map(sentence => sentence.charAt(0).toUpperCase() + sentence.slice(1))
    .join('. ');
  return {
    title: fallback.title,
    body: `${greeting} ${body}.`,
    screen: sections[0].screen,
  };
}
