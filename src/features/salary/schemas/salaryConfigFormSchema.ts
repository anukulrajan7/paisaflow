import {z} from 'zod';

import {dayjs} from '../../../utils/date';

export const salaryConfigFormSchema = z
  .object({
    /** Integer minor units; null while the field is empty. */
    amountMinor: z.number().int().nullable(),
    accountId: z.string(),
    employer: z.string().trim().max(120, 'Keep it under 120 characters'),
    /** Text field holding 1-28; parsed to expectedDay on save. */
    expectedDayText: z
      .string()
      .trim()
      .regex(/^(?:[1-9]|1\d|2[0-8])$/, 'Between 1 and 28'),
    /** epoch ms carrying the reminder time-of-day; saved as 'HH:mm'. */
    reminderAt: z.number().int().positive(),
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
  });

export type SalaryConfigFormValues = z.infer<typeof salaryConfigFormSchema>;

export function defaultSalaryConfigFormValues(
  accountId = '',
): SalaryConfigFormValues {
  return {
    amountMinor: null,
    accountId,
    employer: '',
    expectedDayText: '1',
    reminderAt: dayjs().hour(9).minute(0).second(0).millisecond(0).valueOf(),
  };
}
