import {z} from 'zod';

import {INVESTMENT_TYPES} from '../types/investment';

/** Add/edit investment form (RHF). Money fields hold integer minor units. */
export const investmentFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Enter a name')
      .max(80, 'Keep it under 80 characters'),
    type: z.enum(INVESTMENT_TYPES),
    /** Create-only: amount already invested; null while empty. */
    initialInvestedMinor: z.number().int().nullable(),
    /** epoch ms */
    startedAt: z.number().int().positive(),
    /** Whether a maturity date is set (drives the date field below). */
    hasMaturity: z.boolean(),
    /** epoch ms; required when hasMaturity. */
    maturityAt: z.number().int().positive().nullable(),
    /** Planned monthly contribution; null while empty. */
    monthlyContributionMinor: z.number().int().nullable(),
    /** '' (no reminder) or a day of month 1..28; parsed on save. */
    reminderDayText: z.string().trim(),
    notes: z.string().trim().max(500, 'Keep it under 500 characters'),
  })
  .superRefine((values, ctx) => {
    if (
      values.initialInvestedMinor !== null &&
      values.initialInvestedMinor < 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['initialInvestedMinor'],
        message: 'Amount cannot be negative',
      });
    }

    if (values.hasMaturity && values.maturityAt === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maturityAt'],
        message: 'Pick a maturity date',
      });
    }

    if (
      values.monthlyContributionMinor !== null &&
      values.monthlyContributionMinor <= 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['monthlyContributionMinor'],
        message: 'Enter an amount greater than zero',
      });
    }

    if (values.reminderDayText !== '') {
      if (!/^\d{1,2}$/.test(values.reminderDayText)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['reminderDayText'],
          message: 'Enter a day of the month',
        });
      } else {
        const day = Number(values.reminderDayText);
        if (day < 1 || day > 28) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['reminderDayText'],
            message: 'Between 1 and 28',
          });
        }
      }
    }
  });

export type InvestmentFormValues = z.infer<typeof investmentFormSchema>;

export function defaultInvestmentFormValues(): InvestmentFormValues {
  return {
    name: '',
    type: 'mutual_fund',
    initialInvestedMinor: null,
    startedAt: Date.now(),
    hasMaturity: false,
    maturityAt: null,
    monthlyContributionMinor: null,
    reminderDayText: '',
    notes: '',
  };
}

/** 'Add contribution' form (RHF). */
export const contributionFormSchema = z
  .object({
    /** Integer minor units; null while the field is empty. */
    amountMinor: z.number().int().nullable(),
    accountId: z.string(),
    /** epoch ms */
    occurredAt: z.number().int().positive(),
    note: z.string().trim().max(500, 'Keep it under 500 characters'),
  })
  .superRefine((values, ctx) => {
    if (values.amountMinor === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amountMinor'],
        message: 'Enter an amount',
      });
    } else if (values.amountMinor <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amountMinor'],
        message: 'Enter an amount greater than zero',
      });
    }
    if (!values.accountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['accountId'],
        message: 'Choose a payment account',
      });
    }
  });

export type ContributionFormValues = z.infer<typeof contributionFormSchema>;

export function defaultContributionFormValues(
  accountId = '',
): ContributionFormValues {
  return {
    amountMinor: null,
    accountId,
    occurredAt: Date.now(),
    note: '',
  };
}

/** 'Update value' sheet: a single manual valuation field. */
export const currentValueFormSchema = z
  .object({
    currentValueMinor: z.number().int().nullable(),
  })
  .superRefine((values, ctx) => {
    if (values.currentValueMinor === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['currentValueMinor'],
        message: 'Enter the current value',
      });
    } else if (values.currentValueMinor < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['currentValueMinor'],
        message: 'Value cannot be negative',
      });
    }
  });

export type CurrentValueFormValues = z.infer<typeof currentValueFormSchema>;
