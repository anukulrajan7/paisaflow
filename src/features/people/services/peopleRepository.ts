import {getDb} from '../../../database/connection/connection';
import {queryFirst, queryRows} from '../../../database/connection/helpers';
import type {SqlDb, SqlExecutor} from '../../../database/connection/types';
import {
  createAccountsRepository,
  createTransactionsRepository,
} from '../../../database/repositories';
import {escapeLike} from '../../../database/repositories/mappers';
import {dayjs} from '../../../utils/date';
import {newId} from '../../../utils/id';
import {isEntryOverdue, remainingMinor} from '../types/person';
import type {
  LedgerDirection,
  LedgerEntry,
  LedgerStatus,
  Person,
  PersonSummary,
  ReminderSlot,
} from '../types/person';

/**
 * Repository for people + ledger_entries (migration 004). Feature-local
 * (mirrors features/recurring/services/recurringRulesRepository): bound
 * parameters only, rows revalidated after writes.
 *
 * Money movement (pinned model): every person gets ONE archived virtual
 * account of type 'person', created lazily on their first ledger entry and
 * discovered afterwards via any historical ledger row. Each entry writes a
 * real transfer through the shared transactions repository:
 * - lent:     payment account -> person account (they owe me)
 * - borrowed: person account -> payment account (I owe them)
 * - repayment for lent:     person account -> payment account (received)
 * - repayment for borrowed: payment account -> person account (made)
 *
 * Compound writes run inside a single db.transaction; the shared
 * repositories are bound to the transaction handle via asDb().
 *
 * Edit policy: an entry's financial fields (direction, amount, account,
 * occurred date) are editable ONLY while no repayment has been recorded
 * (repaid_minor = 0). The edit soft-deletes the original transfer and writes
 * a corrected one in the same transaction, so balance effects never double
 * up. Once a repayment exists, only due date, notes and reminder settings
 * may change (updateLedgerEntryDetails).
 *
 * Repayment transfers carry a `[ledger:<entryId>]` note marker so that
 * soft-deleting an entry can reverse every transfer it ever caused; the
 * original transfer and all repayment transfers share the entry's deletion
 * stamp, and restore only revives rows carrying that exact stamp.
 */

const REPAYMENT_NOTE_PREFIX = '[ledger:';

function repaymentMarker(entryId: string): string {
  return `${REPAYMENT_NOTE_PREFIX}${entryId}]`;
}

/** Bind repository factories to an in-flight transaction handle. */
function asDb(executor: SqlExecutor): SqlDb {
  return {
    execute: (sql, params) => executor.execute(sql, params),
    executeAsync: (sql, params) => executor.executeAsync(sql, params),
    // Already inside a transaction: run inline instead of nesting.
    transaction: fn => fn(executor),
  };
}

const DIRECTIONS: ReadonlyArray<LedgerDirection> = ['lent', 'borrowed'];
const REMINDER_SLOTS: ReadonlyArray<ReminderSlot> = ['morning', 'evening'];

interface PersonRow {
  id: string;
  name: string;
  phone: string | null;
  contact_ref: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface LedgerEntryRow {
  id: string;
  person_id: string;
  direction: string;
  amount_minor: number;
  currency: string;
  account_id: string;
  person_account_id: string;
  transaction_id: string | null;
  occurred_at: number;
  expected_return_at: number | null;
  notes: string | null;
  status: string;
  repaid_minor: number;
  reminder_enabled: number;
  reminder_slot: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

const PERSON_COLUMNS =
  'id, name, phone, contact_ref, notes, created_at, updated_at, deleted_at';

const ENTRY_COLUMNS =
  'id, person_id, direction, amount_minor, currency, account_id, person_account_id, transaction_id, occurred_at, expected_return_at, notes, status, repaid_minor, reminder_enabled, reminder_slot, created_at, updated_at, deleted_at';

function mapPersonRow(row: PersonRow): Person {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    contactRef: row.contact_ref,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function mapEntryRow(row: LedgerEntryRow): LedgerEntry {
  return {
    id: row.id,
    personId: row.person_id,
    direction: row.direction as LedgerDirection,
    amountMinor: row.amount_minor,
    currency: row.currency,
    accountId: row.account_id,
    personAccountId: row.person_account_id,
    transactionId: row.transaction_id,
    occurredAt: row.occurred_at,
    expectedReturnAt: row.expected_return_at,
    notes: row.notes,
    status: row.status as LedgerStatus,
    repaidMinor: row.repaid_minor,
    reminderEnabled: row.reminder_enabled === 1,
    reminderSlot: (row.reminder_slot as ReminderSlot | null) ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export interface CreatePersonInput {
  name: string;
  phone?: string | null;
  notes?: string | null;
}

export type UpdatePersonInput = Partial<CreatePersonInput>;

export interface AddLedgerEntryInput {
  personId: string;
  direction: LedgerDirection;
  amountMinor: number;
  currency: string;
  /** Real payment account (never a virtual 'person'/'investment' account). */
  accountId: string;
  occurredAt: number;
  expectedReturnAt?: number | null;
  notes?: string | null;
  reminderEnabled?: boolean;
  reminderSlot?: ReminderSlot | null;
}

/** Financial fields editable while repaid_minor = 0 (see edit policy above). */
export interface EditLedgerEntryInput {
  direction?: LedgerDirection;
  amountMinor?: number;
  accountId?: string;
  occurredAt?: number;
}

/** Non-financial fields, always editable. Null clears nullable fields. */
export interface UpdateLedgerEntryDetailsInput {
  expectedReturnAt?: number | null;
  notes?: string | null;
  reminderEnabled?: boolean;
  reminderSlot?: ReminderSlot | null;
}

interface NormalizedFinancials {
  direction: LedgerDirection;
  amountMinor: number;
  accountId: string;
  occurredAt: number;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeFinancials(input: {
  direction: LedgerDirection;
  amountMinor: number;
  accountId: string;
  occurredAt: number;
}): NormalizedFinancials {
  if (!DIRECTIONS.includes(input.direction)) {
    throw new Error('direction must be lent or borrowed');
  }
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error('amountMinor must be a positive integer (minor units)');
  }
  if (!input.accountId) {
    throw new Error('accountId is required');
  }
  if (!Number.isFinite(input.occurredAt)) {
    throw new Error('occurredAt must be a valid epoch-ms timestamp');
  }
  return {
    direction: input.direction,
    amountMinor: input.amountMinor,
    accountId: input.accountId,
    occurredAt: input.occurredAt,
  };
}

function normalizeReminder(
  enabled: boolean,
  slot: ReminderSlot | null | undefined,
): {enabled: boolean; slot: ReminderSlot | null} {
  if (!enabled) {
    return {enabled: false, slot: null};
  }
  if (!slot || !REMINDER_SLOTS.includes(slot)) {
    throw new Error('reminderSlot must be morning or evening when enabled');
  }
  return {enabled: true, slot};
}

function normalizeExpectedReturn(
  value: number | null | undefined,
): number | null {
  if (value == null) {
    return null;
  }
  if (!Number.isFinite(value)) {
    throw new Error('expectedReturnAt must be a valid epoch-ms timestamp');
  }
  return value;
}

export function createPeopleRepository(db: SqlDb) {
  const accounts = createAccountsRepository(db);

  async function getPersonById(id: string): Promise<Person | null> {
    const row = await queryFirst<PersonRow>(
      db,
      `SELECT ${PERSON_COLUMNS} FROM people WHERE id = ?`,
      [id],
    );
    return row ? mapPersonRow(row) : null;
  }

  async function getLedgerEntryById(id: string): Promise<LedgerEntry | null> {
    const row = await queryFirst<LedgerEntryRow>(
      db,
      `SELECT ${ENTRY_COLUMNS} FROM ledger_entries WHERE id = ?`,
      [id],
    );
    return row ? mapEntryRow(row) : null;
  }

  /**
   * The person's virtual account id, found via ANY ledger row (including
   * soft-deleted ones) so the person <-> account mapping survives deletes.
   */
  async function getPersonAccountId(personId: string): Promise<string | null> {
    const row = await queryFirst<{person_account_id: string}>(
      db,
      'SELECT person_account_id FROM ledger_entries WHERE person_id = ? LIMIT 1',
      [personId],
    );
    return row?.person_account_id ?? null;
  }

  /** Create the archived virtual account on first use; reuse it afterwards. */
  async function ensurePersonAccount(
    tx: SqlExecutor,
    person: Person,
    currency: string,
  ): Promise<string> {
    const existing = await getPersonAccountId(person.id);
    if (existing) {
      return existing;
    }
    const txAccounts = createAccountsRepository(asDb(tx));
    const created = await txAccounts.createAccount({
      name: person.name,
      type: 'person',
      currency,
      openingBalanceMinor: 0,
    });
    // Archived so it stays out of normal account pickers and lists.
    await txAccounts.archiveAccount(created.id, true);
    return created.id;
  }

  function buildTransferNote(
    entry: Pick<LedgerEntry, 'direction'>,
    personName: string,
    notes: string | null,
  ): string {
    const base =
      entry.direction === 'lent'
        ? `Lent to ${personName}`
        : `Borrowed from ${personName}`;
    return notes ? `${base} — ${notes}` : base;
  }

  /** Active people, alphabetical. */
  async function listPeople(): Promise<Person[]> {
    const rows = await queryRows<PersonRow>(
      db,
      `SELECT ${PERSON_COLUMNS} FROM people WHERE deleted_at IS NULL ORDER BY name ASC`,
    );
    return rows.map(mapPersonRow);
  }

  /** Active entries for a person, newest first. */
  async function listLedgerEntries(personId: string): Promise<LedgerEntry[]> {
    const rows = await queryRows<LedgerEntryRow>(
      db,
      `SELECT ${ENTRY_COLUMNS} FROM ledger_entries
       WHERE person_id = ? AND deleted_at IS NULL
       ORDER BY occurred_at DESC, created_at DESC`,
      [personId],
    );
    return rows.map(mapEntryRow);
  }

  /**
   * Net balance for a person in minor units: positive = they owe me,
   * negative = I owe them. Reads the virtual account so the number always
   * matches the underlying transfers.
   */
  async function getPersonBalance(personId: string): Promise<number> {
    const accountId = await getPersonAccountId(personId);
    if (!accountId) {
      return 0;
    }
    return accounts.getAccountBalance(accountId);
  }

  const repo = {
    getPersonById,
    getLedgerEntryById,
    getPersonAccountId,

    async createPerson(input: CreatePersonInput): Promise<Person> {
      const name = input.name.trim();
      if (!name) {
        throw new Error('Person name is required');
      }
      const id = newId();
      const now = Date.now();
      await db.executeAsync(
        `INSERT INTO people
          (id, name, phone, contact_ref, notes, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          name,
          normalizeOptionalText(input.phone),
          null,
          normalizeOptionalText(input.notes),
          now,
          now,
          null,
        ],
      );
      const created = await getPersonById(id);
      if (!created) {
        throw new Error(`Person not found after create: ${id}`);
      }
      return created;
    },

    async updatePerson(
      id: string,
      patch: UpdatePersonInput,
    ): Promise<Person> {
      const existing = await getPersonById(id);
      if (!existing) {
        throw new Error(`Person not found: ${id}`);
      }
      const name =
        patch.name !== undefined ? patch.name.trim() : existing.name;
      if (!name) {
        throw new Error('Person name is required');
      }
      const phone =
        patch.phone !== undefined
          ? normalizeOptionalText(patch.phone)
          : existing.phone;
      const notes =
        patch.notes !== undefined
          ? normalizeOptionalText(patch.notes)
          : existing.notes;

      await db.transaction(async tx => {
        await tx.executeAsync(
          'UPDATE people SET name = ?, phone = ?, notes = ?, updated_at = ? WHERE id = ?',
          [name, phone, notes, Date.now(), id],
        );
        // Keep the virtual account label in sync for reports/lists.
        if (name !== existing.name) {
          const accountId = await getPersonAccountId(id);
          if (accountId) {
            await tx.executeAsync(
              'UPDATE accounts SET name = ?, updated_at = ? WHERE id = ?',
              [name, Date.now(), accountId],
            );
          }
        }
      });
      const updated = await getPersonById(id);
      if (!updated) {
        throw new Error(`Person not found after update: ${id}`);
      }
      return updated;
    },

    listPeople,

    listLedgerEntries,

    /**
     * Open entries past their expected return date, across all people.
     * Feeds reminder summaries: overdue = expected_return_at < today start
     * AND status != completed.
     */
    async listOverdueEntries(todayStart: number): Promise<LedgerEntry[]> {
      const rows = await queryRows<LedgerEntryRow>(
        db,
        `SELECT ${ENTRY_COLUMNS} FROM ledger_entries
         WHERE deleted_at IS NULL AND status != 'completed'
           AND expected_return_at IS NOT NULL AND expected_return_at < ?
         ORDER BY expected_return_at ASC`,
        [todayStart],
      );
      return rows.map(mapEntryRow);
    },

    getPersonBalance,

    /** Per-person rollups for the People list. */
    async getPersonSummaries(now: number): Promise<PersonSummary[]> {
      const todayStart = dayjs(now).startOf('day').valueOf();
      const people = await listPeople();
      const summaries: PersonSummary[] = [];
      for (const person of people) {
        const entries = await listLedgerEntries(person.id);
        const open = entries.filter(entry => entry.status !== 'completed');
        summaries.push({
          person,
          balanceMinor: await getPersonBalance(person.id),
          openEntryCount: open.length,
          overdueCount: entries.filter(entry =>
            isEntryOverdue(entry, todayStart),
          ).length,
        });
      }
      return summaries;
    },

    /**
     * Creates a ledger entry and its backing transfer in one transaction.
     * Auto-creates the person's virtual account on first entry.
     */
    async addLedgerEntry(input: AddLedgerEntryInput): Promise<LedgerEntry> {
      if (!input.personId) {
        throw new Error('personId is required');
      }
      if (!input.currency) {
        throw new Error('currency is required');
      }
      const financials = normalizeFinancials(input);
      const expectedReturnAt = normalizeExpectedReturn(input.expectedReturnAt);
      const notes = normalizeOptionalText(input.notes);
      const reminder = normalizeReminder(
        input.reminderEnabled ?? false,
        input.reminderSlot,
      );

      const id = newId();
      const now = Date.now();
      await db.transaction(async tx => {
        const personRow = await queryFirst<PersonRow>(
          tx,
          `SELECT ${PERSON_COLUMNS} FROM people WHERE id = ?`,
          [input.personId],
        );
        if (!personRow || personRow.deleted_at !== null) {
          throw new Error(`Person not found: ${input.personId}`);
        }
        const person = mapPersonRow(personRow);
        const personAccountId = await ensurePersonAccount(
          tx,
          person,
          input.currency,
        );

        const transactions = createTransactionsRepository(asDb(tx));
        const transfer = await transactions.createTransaction({
          type: 'transfer',
          amountMinor: financials.amountMinor,
          currency: input.currency,
          accountId:
            financials.direction === 'lent'
              ? financials.accountId
              : personAccountId,
          destinationAccountId:
            financials.direction === 'lent'
              ? personAccountId
              : financials.accountId,
          merchant: person.name,
          note: buildTransferNote(financials, person.name, notes),
          occurredAt: financials.occurredAt,
        });

        await tx.executeAsync(
          `INSERT INTO ledger_entries
            (id, person_id, direction, amount_minor, currency, account_id,
             person_account_id, transaction_id, occurred_at, expected_return_at,
             notes, status, repaid_minor, reminder_enabled, reminder_slot,
             created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            input.personId,
            financials.direction,
            financials.amountMinor,
            input.currency,
            financials.accountId,
            personAccountId,
            transfer.id,
            financials.occurredAt,
            expectedReturnAt,
            notes,
            'pending',
            0,
            reminder.enabled ? 1 : 0,
            reminder.slot,
            now,
            now,
            null,
          ],
        );
      });

      const created = await getLedgerEntryById(id);
      if (!created) {
        throw new Error(`Ledger entry not found after create: ${id}`);
      }
      return created;
    },

    /**
     * Financial edit with balance reversal. Only allowed while no repayment
     * has been recorded; the original transfer is soft-deleted and a
     * corrected one is written in the same transaction.
     */
    async editLedgerEntry(
      id: string,
      patch: EditLedgerEntryInput,
    ): Promise<LedgerEntry> {
      const existing = await getLedgerEntryById(id);
      if (!existing || existing.deletedAt !== null) {
        throw new Error(`Ledger entry not found: ${id}`);
      }
      if (existing.repaidMinor > 0) {
        throw new Error(
          'Amount, account and direction are locked once a repayment is recorded',
        );
      }
      const financials = normalizeFinancials({
        direction: patch.direction ?? existing.direction,
        amountMinor: patch.amountMinor ?? existing.amountMinor,
        accountId: patch.accountId ?? existing.accountId,
        occurredAt: patch.occurredAt ?? existing.occurredAt,
      });

      await db.transaction(async tx => {
        const personRow = await queryFirst<PersonRow>(
          tx,
          `SELECT ${PERSON_COLUMNS} FROM people WHERE id = ?`,
          [existing.personId],
        );
        if (!personRow) {
          throw new Error(`Person not found: ${existing.personId}`);
        }
        const person = mapPersonRow(personRow);
        const transactions = createTransactionsRepository(asDb(tx));

        // Reverse the old transfer, then write the corrected one.
        if (existing.transactionId) {
          await transactions.softDeleteTransaction(existing.transactionId);
        }
        const transfer = await transactions.createTransaction({
          type: 'transfer',
          amountMinor: financials.amountMinor,
          currency: existing.currency,
          accountId:
            financials.direction === 'lent'
              ? financials.accountId
              : existing.personAccountId,
          destinationAccountId:
            financials.direction === 'lent'
              ? existing.personAccountId
              : financials.accountId,
          merchant: person.name,
          note: buildTransferNote(financials, person.name, existing.notes),
          occurredAt: financials.occurredAt,
        });

        await tx.executeAsync(
          `UPDATE ledger_entries SET
            direction = ?, amount_minor = ?, account_id = ?, transaction_id = ?,
            occurred_at = ?, updated_at = ?
           WHERE id = ?`,
          [
            financials.direction,
            financials.amountMinor,
            financials.accountId,
            transfer.id,
            financials.occurredAt,
            Date.now(),
            id,
          ],
        );
      });

      const updated = await getLedgerEntryById(id);
      if (!updated) {
        throw new Error(`Ledger entry not found after edit: ${id}`);
      }
      return updated;
    },

    /** Non-financial updates: due date, notes, reminder toggle + slot. */
    async updateLedgerEntryDetails(
      id: string,
      patch: UpdateLedgerEntryDetailsInput,
    ): Promise<LedgerEntry> {
      const existing = await getLedgerEntryById(id);
      if (!existing || existing.deletedAt !== null) {
        throw new Error(`Ledger entry not found: ${id}`);
      }
      const expectedReturnAt =
        patch.expectedReturnAt !== undefined
          ? normalizeExpectedReturn(patch.expectedReturnAt)
          : existing.expectedReturnAt;
      const notes =
        patch.notes !== undefined
          ? normalizeOptionalText(patch.notes)
          : existing.notes;
      const reminder = normalizeReminder(
        patch.reminderEnabled ?? existing.reminderEnabled,
        patch.reminderSlot !== undefined
          ? patch.reminderSlot
          : existing.reminderSlot,
      );

      await db.executeAsync(
        `UPDATE ledger_entries SET
          expected_return_at = ?, notes = ?, reminder_enabled = ?,
          reminder_slot = ?, updated_at = ?
         WHERE id = ?`,
        [
          expectedReturnAt,
          notes,
          reminder.enabled ? 1 : 0,
          reminder.slot,
          Date.now(),
          id,
        ],
      );
      const updated = await getLedgerEntryById(id);
      if (!updated) {
        throw new Error(`Ledger entry not found after update: ${id}`);
      }
      return updated;
    },

    /**
     * Records a (partial or full) repayment as a transfer between the person
     * account and the entry's payment account, then advances repaid_minor
     * and the status ('partial' until repaid >= amount, then 'completed').
     */
    async recordRepayment(
      id: string,
      amountMinor: number,
    ): Promise<LedgerEntry> {
      const existing = await getLedgerEntryById(id);
      if (!existing || existing.deletedAt !== null) {
        throw new Error(`Ledger entry not found: ${id}`);
      }
      if (existing.status === 'completed') {
        throw new Error('Ledger entry is already completed');
      }
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
        throw new Error('amountMinor must be a positive integer (minor units)');
      }
      const remaining = remainingMinor(existing);
      if (amountMinor > remaining) {
        throw new Error('Repayment exceeds the remaining amount');
      }

      await db.transaction(async tx => {
        const personRow = await queryFirst<PersonRow>(
          tx,
          `SELECT ${PERSON_COLUMNS} FROM people WHERE id = ?`,
          [existing.personId],
        );
        if (!personRow) {
          throw new Error(`Person not found: ${existing.personId}`);
        }
        const person = mapPersonRow(personRow);
        const transactions = createTransactionsRepository(asDb(tx));
        const action =
          existing.direction === 'lent'
            ? `Repayment received from ${person.name}`
            : `Repayment made to ${person.name}`;

        await transactions.createTransaction({
          type: 'transfer',
          amountMinor,
          currency: existing.currency,
          accountId:
            existing.direction === 'lent'
              ? existing.personAccountId
              : existing.accountId,
          destinationAccountId:
            existing.direction === 'lent'
              ? existing.accountId
              : existing.personAccountId,
          merchant: person.name,
          note: `${repaymentMarker(existing.id)} ${action}`,
          occurredAt: Date.now(),
        });

        const repaid = existing.repaidMinor + amountMinor;
        const status: LedgerStatus =
          repaid >= existing.amountMinor ? 'completed' : 'partial';
        await tx.executeAsync(
          'UPDATE ledger_entries SET repaid_minor = ?, status = ?, updated_at = ? WHERE id = ?',
          [repaid, status, Date.now(), id],
        );
      });

      const updated = await getLedgerEntryById(id);
      if (!updated) {
        throw new Error(`Ledger entry not found after repayment: ${id}`);
      }
      return updated;
    },

    /**
     * Settles the entry in full: a repayment transfer for the remaining
     * amount, so the person account balance and the entry status agree.
     */
    async settleEntry(id: string): Promise<LedgerEntry> {
      const existing = await getLedgerEntryById(id);
      if (!existing || existing.deletedAt !== null) {
        throw new Error(`Ledger entry not found: ${id}`);
      }
      return repo.recordRepayment(id, remainingMinor(existing));
    },

    /**
     * Soft-deletes the entry AND every transfer it caused (original +
     * repayments), all stamped with the same deleted_at so restoreEntry can
     * revive exactly those rows.
     */
    async softDeleteEntry(id: string): Promise<void> {
      const existing = await getLedgerEntryById(id);
      if (!existing || existing.deletedAt !== null) {
        throw new Error(`Ledger entry not found: ${id}`);
      }
      const stamp = Date.now();
      await db.transaction(async tx => {
        await tx.executeAsync(
          'UPDATE ledger_entries SET deleted_at = ?, updated_at = ? WHERE id = ?',
          [stamp, stamp, id],
        );
        if (existing.transactionId) {
          await tx.executeAsync(
            'UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE id = ?',
            [stamp, stamp, existing.transactionId],
          );
        }
        await tx.executeAsync(
          `UPDATE transactions SET deleted_at = ?, updated_at = ?
           WHERE note LIKE ? ESCAPE '\\' AND deleted_at IS NULL`,
          [stamp, stamp, `${escapeLike(repaymentMarker(id))}%`],
        );
      });
    },

    /** Reverses softDeleteEntry: only rows carrying the deletion stamp. */
    async restoreEntry(id: string): Promise<void> {
      const existing = await getLedgerEntryById(id);
      if (!existing || existing.deletedAt === null) {
        throw new Error(`Deleted ledger entry not found: ${id}`);
      }
      const stamp = existing.deletedAt;
      const now = Date.now();
      await db.transaction(async tx => {
        await tx.executeAsync(
          'UPDATE ledger_entries SET deleted_at = NULL, updated_at = ? WHERE id = ?',
          [now, id],
        );
        if (existing.transactionId) {
          await tx.executeAsync(
            'UPDATE transactions SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at = ?',
            [now, existing.transactionId, stamp],
          );
        }
        await tx.executeAsync(
          `UPDATE transactions SET deleted_at = NULL, updated_at = ?
           WHERE note LIKE ? ESCAPE '\\' AND deleted_at = ?`,
          [now, `${escapeLike(repaymentMarker(id))}%`, stamp],
        );
      });
    },
  };

  return repo;
}

export type PeopleRepository = ReturnType<typeof createPeopleRepository>;

let instance: PeopleRepository | null = null;

/** Lazy singleton over the default connection (mirrors database/repositories). */
export function getPeopleRepository(): PeopleRepository {
  if (!instance) {
    instance = createPeopleRepository(getDb());
  }
  return instance;
}
