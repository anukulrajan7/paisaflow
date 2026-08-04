import {z} from 'zod';

import type {SalaryRecordStatus} from '../types/salary';

export const CONFIRM_STATUSES: ReadonlyArray<SalaryRecordStatus> = [
  'credited',
  'partial',
  'bonus',
  'delayed',
];

/**
 * Confirm-sheet validation. Amount rules are relative to the expected
 * salary: partial must be below it, bonus above it; 'delayed' moves no
 * money and needs no amount.
 */
export function createConfirmSalarySchema(expectedMinor: number) {
  return z
    .object({
      status: z.enum(['credited', 'partial', 'bonus', 'delayed']),
      /** Integer minor units; null while the field is empty. */
      amountMinor: z.number().int().nullable(),
      note: z.string().trim().max(500, 'Keep it under 500 characters'),
    })
    .superRefine((values, ctx) => {
      if (values.status === 'delayed') {
        return;
      }
      if (values.amountMinor === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['amountMinor'],
          message: 'Enter the received amount',
        });
      } else if (values.amountMinor <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['amountMinor'],
          message: 'Enter an amount greater than zero',
        });
      } else if (
        values.status === 'partial' &&
        values.amountMinor >= expectedMinor
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['amountMinor'],
          message: 'Partial means less than expected — use Full or Bonus instead',
        });
      } else if (
        values.status === 'bonus' &&
        values.amountMinor <= expectedMinor
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['amountMinor'],
          message: 'Bonus means more than the expected salary',
        });
      }
    });
}

export type ConfirmSalaryFormValues = z.infer<
  ReturnType<typeof createConfirmSalarySchema>
>;
