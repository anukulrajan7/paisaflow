import {z} from 'zod';

export const ledgerEntryFormSchema = z
  .object({
    direction: z.enum(['lent', 'borrowed']),
    /** Integer minor units; null while the field is empty. */
    amountMinor: z.number().int().nullable(),
    /** Real payment account id (virtual accounts are filtered out upstream). */
    accountId: z.string(),
    /** epoch ms of when the money moved. */
    occurredAt: z.number().int().positive(),
    /** When false, expectedReturnAt is ignored and stored as null. */
    hasExpectedReturn: z.boolean(),
    expectedReturnAt: z.number().int().positive().nullable(),
    notes: z.string().trim().max(500, 'Keep it under 500 characters'),
    reminderEnabled: z.boolean(),
    reminderSlot: z.enum(['morning', 'evening']).nullable(),
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

    if (values.hasExpectedReturn && values.expectedReturnAt === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expectedReturnAt'],
        message: 'Pick a date',
      });
    }

    if (values.reminderEnabled && values.reminderSlot === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reminderSlot'],
        message: 'Pick a reminder slot',
      });
    }
  });

export type LedgerEntryFormValues = z.infer<typeof ledgerEntryFormSchema>;

export function defaultLedgerEntryFormValues(
  accountId = '',
): LedgerEntryFormValues {
  return {
    direction: 'lent',
    amountMinor: null,
    accountId,
    occurredAt: Date.now(),
    hasExpectedReturn: false,
    expectedReturnAt: null,
    notes: '',
    reminderEnabled: false,
    reminderSlot: 'morning',
  };
}
