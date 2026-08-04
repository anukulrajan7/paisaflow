import {
  Banknote,
  CreditCard,
  Landmark,
  TrendingUp,
  User,
  Wallet,
} from 'lucide-react-native';
import type {LucideIcon} from 'lucide-react-native';

import type {AccountType} from '../../../database/types';

export interface AccountTypeMeta {
  label: string;
  icon: LucideIcon;
}

/** Display metadata for each account type (icon + human label). */
export const ACCOUNT_TYPE_META: Record<AccountType, AccountTypeMeta> = {
  cash: {label: 'Cash', icon: Banknote},
  bank: {label: 'Bank account', icon: Landmark},
  credit_card: {label: 'Credit card', icon: CreditCard},
  upi_wallet: {label: 'UPI / Wallet', icon: Wallet},
  investment: {label: 'Investment holding', icon: TrendingUp},
  person: {label: 'Person', icon: User},
};

/** Types offered when a user manually creates an account. Virtual types
 * (investment, person) are managed by their own features. */
export const USER_CREATABLE_ACCOUNT_TYPES: AccountType[] = [
  'cash',
  'bank',
  'credit_card',
  'upi_wallet',
];

/** Virtual account types created and managed by the People & Investments
 * features. They hold balances (via transfer transactions) but are not
 * user-managed here and never count as available money. */
export const VIRTUAL_ACCOUNT_TYPES: AccountType[] = ['investment', 'person'];

export function isVirtualAccountType(type: AccountType): boolean {
  return VIRTUAL_ACCOUNT_TYPES.includes(type);
}
