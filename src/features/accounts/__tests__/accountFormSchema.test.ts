import {
  ACCOUNT_TYPES,
  accountFormSchema,
} from '../schemas/accountFormSchema';

describe('accountFormSchema', () => {
  const validInput = {
    name: 'HDFC Savings',
    type: 'bank' as const,
    openingBalanceMinor: 500_000,
  };

  it('accepts a valid payload', () => {
    const result = accountFormSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('trims the name', () => {
    const result = accountFormSchema.safeParse({...validInput, name: '  Cash  '});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Cash');
    }
  });

  it('rejects an empty name', () => {
    const result = accountFormSchema.safeParse({...validInput, name: ''});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Account name is required');
    }
  });

  it('rejects a whitespace-only name', () => {
    expect(
      accountFormSchema.safeParse({...validInput, name: '   '}).success,
    ).toBe(false);
  });

  it('rejects a name longer than 60 characters', () => {
    expect(
      accountFormSchema.safeParse({...validInput, name: 'a'.repeat(61)})
        .success,
    ).toBe(false);
  });

  it('accepts every supported account type', () => {
    for (const type of ACCOUNT_TYPES) {
      expect(
        accountFormSchema.safeParse({...validInput, type}).success,
      ).toBe(true);
    }
  });

  it('rejects an unknown account type', () => {
    const result = accountFormSchema.safeParse({
      ...validInput,
      type: 'crypto',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a null opening balance (treated as 0 on create)', () => {
    expect(
      accountFormSchema.safeParse({...validInput, openingBalanceMinor: null})
        .success,
    ).toBe(true);
  });

  it('accepts a zero opening balance', () => {
    expect(
      accountFormSchema.safeParse({...validInput, openingBalanceMinor: 0})
        .success,
    ).toBe(true);
  });

  it('rejects a fractional opening balance (money is integer minor units)', () => {
    expect(
      accountFormSchema.safeParse({...validInput, openingBalanceMinor: 100.5})
        .success,
    ).toBe(false);
  });

  it('rejects a non-numeric opening balance', () => {
    expect(
      accountFormSchema.safeParse({
        ...validInput,
        openingBalanceMinor: '1000',
      }).success,
    ).toBe(false);
  });

  it('rejects an opening balance beyond the safe integer range', () => {
    expect(
      accountFormSchema.safeParse({
        ...validInput,
        openingBalanceMinor: Number.MAX_SAFE_INTEGER + 1,
      }).success,
    ).toBe(false);
  });
});
