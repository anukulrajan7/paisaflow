import {
  getTransactionsRepository,
  type TransactionsRepository,
} from '../../../database/repositories';
import type {Transaction} from '../../../database/types';
import type {RecurringRule} from '../types/recurringRule';
import {computeNextDueAt, overdueDays} from './recurringScheduler';
import {
  getRecurringRulesRepository,
  type RecurringRulesRepository,
} from './recurringRulesRepository';

export interface ConfirmRecurringRuleResult {
  /** The real transaction materialized from the rule (occurred_at = now). */
  transaction: Transaction;
  /** The rule after stamping last_confirmed_at and advancing next_due_at. */
  rule: RecurringRule;
  /** Whole days the confirmed occurrence was late; 0 when on time. */
  overdueDays: number;
}

interface ConfirmDeps {
  rules: RecurringRulesRepository;
  transactions: TransactionsRepository;
}

function defaultDeps(): ConfirmDeps {
  return {
    rules: getRecurringRulesRepository(),
    transactions: getTransactionsRepository(),
  };
}

/**
 * Confirms the currently-due occurrence of a rule:
 * 1. creates a real transaction from the rule's fields with occurred_at = now
 *    (for a transfer into a credit_card account this IS the bill payment),
 * 2. stamps last_confirmed_at,
 * 3. advances next_due_at one period at a time until it lands in the future,
 *    so rules confirmed late catch up every missed period instead of coming
 *    due again immediately.
 *
 * The caller bumps dataVersion after a successful confirm.
 */
export async function confirmRecurringRule(
  ruleId: string,
  now: number = Date.now(),
  deps: ConfirmDeps = defaultDeps(),
): Promise<ConfirmRecurringRuleResult> {
  const rule = await deps.rules.getRuleById(ruleId);
  if (!rule) {
    throw new Error('Recurring rule not found');
  }
  if (!rule.isActive) {
    throw new Error('Recurring rule is paused');
  }

  const daysLate = overdueDays(rule.nextDueAt, now);

  const transaction = await deps.transactions.createTransaction({
    type: rule.type,
    amountMinor: rule.amountMinor,
    currency: rule.currency,
    accountId: rule.accountId,
    destinationAccountId: rule.destinationAccountId,
    categoryId: rule.categoryId,
    merchant: rule.merchant,
    note: rule.note,
    paymentMethod: rule.paymentMethod,
    occurredAt: now,
  });

  // Catch-up loop: skip every missed period so the next due date is > now.
  let nextDueAt = rule.nextDueAt;
  do {
    nextDueAt = computeNextDueAt(nextDueAt, rule.frequency, rule.intervalCount);
  } while (nextDueAt <= now);

  await deps.rules.recordConfirmation(rule.id, now, nextDueAt);

  const updated = await deps.rules.getRuleById(rule.id);
  if (!updated) {
    throw new Error('Recurring rule not found after confirmation');
  }
  return {transaction, rule: updated, overdueDays: daysLate};
}
