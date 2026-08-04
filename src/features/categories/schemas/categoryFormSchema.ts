import {z} from 'zod';

import {CATEGORY_ICON_CHOICES} from '../../../design-system/icons';
import {CATEGORY_COLORS} from '../../../design-system/tokens';

export const CATEGORY_NAME_MAX_LENGTH = 40;

/**
 * Validation for the add/edit category form. Names are trimmed before
 * validation; icon and color must come from the design-system palettes so
 * seeded and custom categories stay visually consistent.
 */
export const categoryFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Give the category a name')
    .max(
      CATEGORY_NAME_MAX_LENGTH,
      `Keep the name under ${CATEGORY_NAME_MAX_LENGTH} characters`,
    ),
  type: z.enum(['expense', 'income']),
  icon: z
    .string()
    .refine(value => CATEGORY_ICON_CHOICES.includes(value), 'Pick an icon'),
  color: z
    .string()
    .refine(
      value => (CATEGORY_COLORS as readonly string[]).includes(value),
      'Pick a color',
    ),
});

export type CategoryFormValues = z.infer<typeof categoryFormSchema>;

/**
 * Adds a case-insensitive duplicate-name guard on top of the base schema.
 * Pass the names of sibling categories (same type), excluding the category
 * being edited.
 */
export function createCategoryFormSchema(existingNames: readonly string[]) {
  const taken = new Set(existingNames.map(name => name.trim().toLowerCase()));
  return categoryFormSchema.superRefine((values, ctx) => {
    if (taken.has(values.name.toLowerCase())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['name'],
        message: 'A category with this name already exists',
      });
    }
  });
}
