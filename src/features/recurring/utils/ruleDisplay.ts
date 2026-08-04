import type {Account, Category} from '../../../database/types';
import type {RecurringRule} from '../types/recurringRule';

/** Display helpers shared by the rules screen and the Home due card. */

/**
 * A transfer rule whose destination is a credit card account represents the
 * monthly card bill: confirming it records the bill payment (money moves from
 * the source account onto the card).
 */
export function isCreditCardBillPayment(
  rule: RecurringRule,
  accountsById: Map<string, Account>,
): boolean {
  if (rule.type !== 'transfer' || !rule.destinationAccountId) {
    return false;
  }
  return (
    accountsById.get(rule.destinationAccountId)?.type === 'credit_card'
  );
}

/** Merchant first, then the card-bill label, category name, or a fallback. */
export function ruleTitle(
  rule: RecurringRule,
  accountsById: Map<string, Account>,
  categoriesById: Map<string, Category>,
): string {
  if (rule.merchant) {
    return rule.merchant;
  }
  if (isCreditCardBillPayment(rule, accountsById)) {
    return 'Credit card bill payment';
  }
  const category = rule.categoryId ? categoriesById.get(rule.categoryId) : null;
  if (category) {
    return category.name;
  }
  switch (rule.type) {
    case 'income':
      return 'Recurring income';
    case 'transfer':
      return 'Recurring transfer';
    default:
      return 'Recurring expense';
  }
}

/** 'Bank Account → Credit Card' for transfers, else the account name. */
export function ruleAccountLabel(
  rule: RecurringRule,
  accountsById: Map<string, Account>,
): string {
  const source = accountsById.get(rule.accountId)?.name ?? 'Unknown account';
  if (rule.type === 'transfer' && rule.destinationAccountId) {
    const destination =
      accountsById.get(rule.destinationAccountId)?.name ?? 'Unknown account';
    return `${source} → ${destination}`;
  }
  return source;
}
