import {
  Briefcase,
  ChartPie,
  Coins,
  Bitcoin,
  Landmark,
  PiggyBank,
  Repeat,
  TrendingUp,
} from 'lucide-react-native';
import type {LucideIcon} from 'lucide-react-native';

import {CATEGORY_COLORS} from '../../../design-system/tokens';

/**
 * Domain models for the Phase 9 investment tracker (migration 004).
 *
 * Money movement is NOT modelled here: each investment owns one virtual
 * account (type 'investment', auto-created, archived) and every contribution
 * is a real transfer transaction from a payment account into that holding
 * account. These tables keep the metadata (valuation, maturity, reminders)
 * and link the transfer via investment_contributions.transaction_id.
 */

export const INVESTMENT_TYPES = [
  'mutual_fund',
  'stocks',
  'fixed_deposit',
  'recurring_deposit',
  'ppf',
  'gold',
  'cryptocurrency',
  'other',
] as const;

export type InvestmentType = (typeof INVESTMENT_TYPES)[number];

export const INVESTMENT_TYPE_LABELS: Record<InvestmentType, string> = {
  mutual_fund: 'Mutual fund',
  stocks: 'Stocks',
  fixed_deposit: 'Fixed deposit',
  recurring_deposit: 'Recurring deposit',
  ppf: 'PPF',
  gold: 'Gold',
  cryptocurrency: 'Cryptocurrency',
  other: 'Other',
};

export const INVESTMENT_TYPE_ICONS: Record<InvestmentType, LucideIcon> = {
  mutual_fund: ChartPie,
  stocks: TrendingUp,
  fixed_deposit: Landmark,
  recurring_deposit: Repeat,
  ppf: PiggyBank,
  gold: Coins,
  cryptocurrency: Bitcoin,
  other: Briefcase,
};

/**
 * Stable per-type colors for allocation bars, drawn from the shared category
 * palette. Bars always pair color with a text legend — never color alone.
 */
export const INVESTMENT_TYPE_COLORS: Record<InvestmentType, string> = {
  mutual_fund: CATEGORY_COLORS[0],
  stocks: CATEGORY_COLORS[2],
  fixed_deposit: CATEGORY_COLORS[3],
  recurring_deposit: CATEGORY_COLORS[5],
  ppf: CATEGORY_COLORS[1],
  gold: CATEGORY_COLORS[8],
  cryptocurrency: CATEGORY_COLORS[4],
  other: CATEGORY_COLORS[6],
};

export interface Investment {
  id: string;
  name: string;
  type: InvestmentType;
  /** Virtual account (type 'investment') holding the contributed money. */
  holdingAccountId: string;
  /** Total contributed, integer minor units. */
  investedMinor: number;
  /** Manual valuation, integer minor units (no market APIs). */
  currentValueMinor: number;
  /** epoch ms */
  startedAt: number;
  /** epoch ms, null when open-ended. */
  maturityAt: number | null;
  /** Planned monthly contribution, integer minor units; null when ad-hoc. */
  monthlyContributionMinor: number | null;
  /** Day of month (1..28) for the contribution reminder; null when off. */
  reminderDay: number | null;
  notes: string | null;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface InvestmentContribution {
  id: string;
  investmentId: string;
  amountMinor: number;
  /** The transfer transaction moving money into the holding account. */
  transactionId: string | null;
  /** epoch ms */
  occurredAt: number;
  note: string | null;
  createdAt: number;
}
