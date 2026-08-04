/**
 * Pure budget-usage math for the budgets feature.
 *
 * Thresholds intentionally match the shared `BudgetProgress` component
 * (warning past 80% used, danger past 100%) so the text alternative never
 * disagrees with the bar color.
 */

export type BudgetStatusTone = 'under' | 'near' | 'over';

export interface BudgetStatus {
  tone: BudgetStatusTone;
  /** Whole percent of the limit used (may exceed 100). */
  percentUsed: number;
  /** limit − spent; negative when over budget. */
  remainingMinor: number;
}

export const NEAR_LIMIT_FRACTION = 0.8;

export function getBudgetStatus(limitMinor: number, spentMinor: number): BudgetStatus {
  const usedFraction = limitMinor > 0 ? spentMinor / limitMinor : 0;
  const tone: BudgetStatusTone =
    usedFraction > 1 ? 'over' : usedFraction > NEAR_LIMIT_FRACTION ? 'near' : 'under';
  return {
    tone,
    percentUsed: Math.round(usedFraction * 100),
    remainingMinor: limitMinor - spentMinor,
  };
}
