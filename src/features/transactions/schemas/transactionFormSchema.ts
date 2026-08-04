import {z} from 'zod';

/** Values stored in transactions.payment_method. */
export const PAYMENT_METHODS = [
  'cash',
  'upi',
  'card',
  'net_banking',
  'other',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  net_banking: 'Net Banking',
  other: 'Other',
};

export function isPaymentMethod(value: string | null): value is PaymentMethod {
  return (
    value !== null && (PAYMENT_METHODS as readonly string[]).includes(value)
  );
}

export const transactionFormSchema = z
  .object({
    type: z.enum(['expense', 'income', 'transfer']),
    /** Integer minor units; null while the field is empty. */
    amountMinor: z.number().int().nullable(),
    accountId: z.string(),
    destinationAccountId: z.string().nullable(),
    categoryId: z.string().nullable(),
    /** epoch ms */
    occurredAt: z.number().int().positive(),
    merchant: z.string().trim().max(120, 'Keep it under 120 characters'),
    note: z.string().trim().max(500, 'Keep it under 500 characters'),
    paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
    /** Comma-separated tag names, parsed on save. */
    tagsText: z.string().max(300, 'Keep tags under 300 characters'),
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

export type TransactionFormValues = z.infer<typeof transactionFormSchema>;

export function defaultTransactionFormValues(): TransactionFormValues {
  return {
    type: 'expense',
    amountMinor: null,
    accountId: '',
    destinationAccountId: null,
    categoryId: null,
    occurredAt: Date.now(),
    merchant: '',
    note: '',
    paymentMethod: null,
    tagsText: '',
  };
}
