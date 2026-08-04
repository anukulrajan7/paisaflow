import {z} from 'zod';

export const personFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a name')
    .max(80, 'Keep it under 80 characters'),
  /** Optional; loose format check — manual entry only, no contacts sync. */
  phone: z
    .string()
    .trim()
    .max(24, 'Keep it under 24 characters')
    .regex(/^[+\d][\d\s-]*$|^$/, 'Digits, spaces, + and - only'),
  notes: z.string().trim().max(500, 'Keep it under 500 characters'),
});

export type PersonFormValues = z.infer<typeof personFormSchema>;

export function defaultPersonFormValues(): PersonFormValues {
  return {name: '', phone: '', notes: ''};
}
