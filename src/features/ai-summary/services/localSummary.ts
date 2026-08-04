/**
 * Deterministic on-device summary generated from the aggregate payload.
 * Pure function — used as the fallback whenever the AI provider is
 * unavailable or returns unusable output, so the app always has something
 * honest to show.
 */
import {formatMoney} from '../../../utils/money';
import type {AiAggregatePayload} from '../types';
import type {SummaryContent} from './summarySchema';

const SPENDING_UP_THRESHOLD = 1.2;
const SPENDING_DOWN_THRESHOLD = 0.8;

function comparisonSentence(payload: AiAggregatePayload): string {
  const {expenseMinor, previousPeriodExpenseMinor, currency} = payload;
  if (previousPeriodExpenseMinor <= 0) {
    return 'No spending data from the previous period to compare with.';
  }
  const ratio = expenseMinor / previousPeriodExpenseMinor;
  const previous = formatMoney(previousPeriodExpenseMinor, currency);
  if (ratio > SPENDING_UP_THRESHOLD) {
    const pct = Math.round((ratio - 1) * 100);
    return `Spending is up about ${pct}% compared to ${previous} last period.`;
  }
  if (ratio < SPENDING_DOWN_THRESHOLD) {
    const pct = Math.round((1 - ratio) * 100);
    return `Spending is down about ${pct}% compared to ${previous} last period.`;
  }
  return `Spending is about the same as last period (${previous}).`;
}

export function buildLocalSummary(payload: AiAggregatePayload): SummaryContent {
  const {currency, expenseMinor, incomeMinor, budgetMinor} = payload;
  const spent = formatMoney(expenseMinor, currency);

  if (payload.transactionCount === 0) {
    return {
      headline: 'Not enough data yet',
      overview:
        'There are no transactions in this period yet. Add a few expenses and your summary will appear here.',
      highlights: [],
      warnings: [],
      suggestions: ['Record a few expenses to start seeing insights.'],
      comparison: comparisonSentence(payload),
    };
  }

  const netMinor = incomeMinor - expenseMinor;
  const net = formatMoney(Math.abs(netMinor), currency);
  const overviewParts = [
    `You spent ${spent} across ${payload.transactionCount} transactions this period.`,
  ];
  if (incomeMinor > 0) {
    overviewParts.push(
      netMinor >= 0
        ? `With ${formatMoney(incomeMinor, currency)} coming in, you kept ${net}.`
        : `With ${formatMoney(incomeMinor, currency)} coming in, you spent ${net} more than you earned.`,
    );
  }

  const highlights: string[] = [];
  const top = payload.topCategories[0];
  if (top && expenseMinor > 0) {
    highlights.push(
      `${top.name} is your biggest category at ${formatMoney(
        top.amountMinor,
        currency,
      )} (${Math.round(top.share * 100)}% of spending).`,
    );
  }
  const largest = payload.largestTransactions[0];
  if (largest) {
    const label = largest.merchant ?? largest.category;
    highlights.push(
      `Largest single expense: ${formatMoney(
        largest.amountMinor,
        currency,
      )} at ${label}.`,
    );
  }

  const warnings: string[] = [];
  if (budgetMinor != null && budgetMinor > 0 && expenseMinor > budgetMinor) {
    warnings.push(
      `You are ${formatMoney(
        expenseMinor - budgetMinor,
        currency,
      )} over your ${formatMoney(budgetMinor, currency)} budget.`,
    );
  }
  if (
    payload.previousPeriodExpenseMinor > 0 &&
    expenseMinor > payload.previousPeriodExpenseMinor * SPENDING_UP_THRESHOLD
  ) {
    warnings.push('Spending is noticeably higher than last period.');
  }

  const suggestions: string[] = [];
  if (budgetMinor == null) {
    suggestions.push('Set a monthly budget to track your spending against a limit.');
  }
  if (top && top.share >= 0.4) {
    suggestions.push(
      `${top.name} makes up a large share of spending — a small cut there goes a long way.`,
    );
  }
  if (suggestions.length === 0) {
    suggestions.push('Keep logging every expense — consistency makes these insights useful.');
  }

  return {
    headline: `You spent ${spent} this period`,
    overview: overviewParts.join(' '),
    highlights,
    warnings,
    suggestions,
    comparison: comparisonSentence(payload),
  };
}
