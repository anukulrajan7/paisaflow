import type {LedgerDirection, LedgerStatus, ReminderSlot} from '../types/person';

/** Display labels for the people & lending ledger. */

export const DIRECTION_LABELS: Record<LedgerDirection, string> = {
  lent: 'You gave',
  borrowed: 'You borrowed',
};

export const STATUS_LABELS: Record<LedgerStatus, string> = {
  pending: 'Pending',
  partial: 'Partial',
  completed: 'Completed',
};

export const REMINDER_SLOT_LABELS: Record<ReminderSlot, string> = {
  morning: 'Morning',
  evening: 'Evening',
};

/** Balance caption relative to the signed person-account balance. */
export function balanceCaption(balanceMinor: number): string {
  if (balanceMinor > 0) {
    return 'owes you';
  }
  if (balanceMinor < 0) {
    return 'you owe';
  }
  return 'settled up';
}

/** Digits-only phone for wa.me links (needs country code, no symbols). */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}
