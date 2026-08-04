import {z} from 'zod';

export const RECURRING_FREQUENCIES = [
  'daily',
  'weekly',
  'monthly',
  'yearly',
] as const;

export const recurringRuleFormSchema = z
  .object({
    type: z.enum(['expense', 'income', 'transfer']),
    /** Integer minor units; null while the field is empty. */
    amountMinor: z.number().int().nullable(),
    accountId: z.string(),
    destinationAccountId: z.string().nullable(),
    categoryId: z.string().nullable(),
    merchant: z.string().trim().max(120, 'Keep it under 120 characters'),
    note: z.string().trim().max(500, 'Keep it under 500 characters'),
    frequency: z.enum(RECURRING_FREQUENCIES),
    /** Text field holding 1–99; parsed to intervalCount on save. */
    intervalText: z.string().trim().regex(/^[1-9]\d?$/, 'Between 1 and 99'),
    /** epoch ms of the first (editing: next) occurrence. */
    firstDueAt: z.number().int().positive(),
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
        message: 'Choose an account',
      });
    }

    if (values.type === 'transfer') {
      if (!values.destinationAccountId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['destinationAccountId'],
          message: 'Choose a destination account',
        });
      } else if (values.destinationAccountId === values.accountId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['destinationAccountId'],
          message: 'Destination must differ from the source account',
        });
      }
    }
  });

export type RecurringRuleFormValues = z.infer<typeof recurringRuleFormSchema>;

export function defaultRecurringRuleFormValues(
  accountId = '',
): RecurringRuleFormValues {
  return {
    type: 'expense',
    amountMinor: null,
    accountId,
    destinationAccountId: null,
    categoryId: null,
    merchant: '',
    note: '',
    frequency: 'monthly',
    intervalText: '1',
    firstDueAt: Date.now(),
  };
}
