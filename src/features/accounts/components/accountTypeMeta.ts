import {Banknote, CreditCard, Landmark, Wallet} from 'lucide-react-native';
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
};
