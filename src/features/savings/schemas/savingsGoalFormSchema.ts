import {z} from 'zod';

export const CONTRIBUTION_FREQUENCIES = ['daily', 'weekly', 'monthly'] as const;

/**
 * Form-local unions: 'none' stands for NULL (no schedule / no reminder) so
 * segmented controls can stay single-value strings.
 */
export const savingsGoalFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name the goal')
      .max(80, 'Keep it under 80 characters'),
    /** Integer minor units; null while the field is empty. */
    targetMinor: z.number().int().nullable(),
    /** Optional amount already set aside; null while empty. Create-only. */
    startingSavedMinor: z.number().int().nullable(),
    /** DateTimeField always needs a value; this flag makes the date optional. */
    hasTargetDate: z.boolean(),
    targetDate: z.number().int().positive(),
    savingsAccountId: z.string(),
    contributionAmountMinor: z.number().int().nullable(),
    frequency: z.enum(['none', 'daily', 'weekly', 'monthly']),
    reminderSlot: z.enum(['none', 'morning', 'evening']),
  })
  .superRefine((values, ctx) => {
    if (values.targetMinor === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetMinor'],
        message: 'Enter a target amount',
      });
    } else if (values.targetMinor <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetMinor'],
        message: 'Enter an amount greater than zero',
      });
    }

    if (
      values.startingSavedMinor !== null &&
      values.startingSavedMinor < 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['startingSavedMinor'],
        message: 'Cannot be negative',
      });
    }

    if (!values.savingsAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['savingsAccountId'],
        message: 'Choose a savings account',
      });
    }

    if (
      values.contributionAmountMinor !== null &&
      values.contributionAmountMinor <= 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contributionAmountMinor'],
        message: 'Enter an amount greater than zero',
      });
    }
  });

export type SavingsGoalFormValues = z.infer<typeof savingsGoalFormSchema>;

export function defaultSavingsGoalFormValues(
  savingsAccountId = '',
): SavingsGoalFormValues {
  return {
    name: '',
    targetMinor: null,
    startingSavedMinor: null,
    hasTargetDate: false,
    targetDate: Date.now(),
    savingsAccountId,
    contributionAmountMinor: null,
    frequency: 'none',
    reminderSlot: 'none',
  };
}
