import {CATEGORY_ICON_CHOICES} from '../../../design-system/icons';
import {CATEGORY_COLORS} from '../../../design-system/tokens';
import {
  CATEGORY_NAME_MAX_LENGTH,
  categoryFormSchema,
  createCategoryFormSchema,
} from '../schemas/categoryFormSchema';

const VALID_INPUT = {
  name: 'Pets',
  type: 'expense',
  icon: CATEGORY_ICON_CHOICES[0],
  color: CATEGORY_COLORS[0],
};

describe('categoryFormSchema', () => {
  it('accepts a valid category', () => {
    const result = categoryFormSchema.safeParse(VALID_INPUT);
    expect(result.success).toBe(true);
  });

  it('trims whitespace around the name', () => {
    const result = categoryFormSchema.safeParse({
      ...VALID_INPUT,
      name: '  Pets  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Pets');
    }
  });

  it('rejects an empty name', () => {
    const result = categoryFormSchema.safeParse({...VALID_INPUT, name: ''});
    expect(result.success).toBe(false);
  });

  it('rejects a whitespace-only name', () => {
    const result = categoryFormSchema.safeParse({...VALID_INPUT, name: '   '});
    expect(result.success).toBe(false);
  });

  it('rejects a name longer than the limit', () => {
    const result = categoryFormSchema.safeParse({
      ...VALID_INPUT,
      name: 'a'.repeat(CATEGORY_NAME_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a type other than expense or income', () => {
    const result = categoryFormSchema.safeParse({
      ...VALID_INPUT,
      type: 'transfer',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an icon outside CATEGORY_ICON_CHOICES', () => {
    const result = categoryFormSchema.safeParse({
      ...VALID_INPUT,
      icon: 'NotARealIcon',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a color outside CATEGORY_COLORS', () => {
    const result = categoryFormSchema.safeParse({
      ...VALID_INPUT,
      color: '#123456',
    });
    expect(result.success).toBe(false);
  });

  it('accepts every offered icon and color', () => {
    for (const icon of CATEGORY_ICON_CHOICES) {
      expect(
        categoryFormSchema.safeParse({...VALID_INPUT, icon}).success,
      ).toBe(true);
    }
    for (const color of CATEGORY_COLORS) {
      expect(
        categoryFormSchema.safeParse({...VALID_INPUT, color}).success,
      ).toBe(true);
    }
  });
});

describe('createCategoryFormSchema (duplicate guard)', () => {
  it('rejects a duplicate name, case-insensitively', () => {
    const schema = createCategoryFormSchema(['Pets']);
    const result = schema.safeParse({...VALID_INPUT, name: 'pets'});
    expect(result.success).toBe(false);
    if (!result.success) {
      const nameIssue = result.error.issues.find(issue =>
        issue.path.includes('name'),
      );
      expect(nameIssue?.message).toBe(
        'A category with this name already exists',
      );
    }
  });

  it('ignores surrounding whitespace when checking duplicates', () => {
    const schema = createCategoryFormSchema(['  Pets  ']);
    expect(schema.safeParse({...VALID_INPUT, name: 'Pets'}).success).toBe(
      false,
    );
  });

  it('allows a name that is not taken', () => {
    const schema = createCategoryFormSchema(['Pets']);
    expect(
      schema.safeParse({...VALID_INPUT, name: 'Travel'}).success,
    ).toBe(true);
  });

  it('still enforces the base rules', () => {
    const schema = createCategoryFormSchema([]);
    expect(schema.safeParse({...VALID_INPUT, name: ''}).success).toBe(false);
  });
});
