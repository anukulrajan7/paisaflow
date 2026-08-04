import {z} from 'zod';

/** Account types supported by the app (mirrors database AccountType). */
export const ACCOUNT_TYPES = [
  'cash',
  'bank',
  'credit_card',
  'upi_wallet',
] as const;

/**
 * Add/edit account form validation.
 * openingBalanceMinor is integer minor units; null means "not entered"
 * (treated as 0 on create). Not editable after creation.
 */
export const accountFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Account name is required')
    .max(60, 'Name must be 60 characters or fewer'),
  type: z.enum(ACCOUNT_TYPES, {
    errorMap: () => ({message: 'Choose an account type'}),
  }),
  openingBalanceMinor: z
    .number({invalid_type_error: 'Enter a valid amount'})
    .int('Amount must be in whole minor units')
    .safe('Amount is too large')
    .nullable(),
});

export type AccountFormValues = z.infer<typeof accountFormSchema>;
