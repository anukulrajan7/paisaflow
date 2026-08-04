import {z} from 'zod';

/** SelectField value representing the overall (uncategorized) budget. */
export const OVERALL_CATEGORY_VALUE = 'overall';

export const budgetFormSchema = z.object({
  /** OVERALL_CATEGORY_VALUE or an expense category id. */
  categoryValue: z.string().min(1, 'Choose what this budget covers'),
  limitMinor: z
    .number()
    .nullable()
    .refine(v => v !== null && Number.isSafeInteger(v) && v > 0, {
      message: 'Enter a limit greater than zero',
    }),
});

export type BudgetFormValues = z.infer<typeof budgetFormSchema>;
