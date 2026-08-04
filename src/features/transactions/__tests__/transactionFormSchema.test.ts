import {
  defaultTransactionFormValues,
  isPaymentMethod,
  transactionFormSchema,
} from '../schemas/transactionFormSchema';
import type {TransactionFormValues} from '../schemas/transactionFormSchema';

function validExpense(): TransactionFormValues {
  return {
    ...defaultTransactionFormValues(),
    amountMinor: 12345,
    accountId: 'acc_cash',
    categoryId: 'cat_food',
    paymentMethod: 'upi',
  };
}

function issuePaths(values: TransactionFormValues): string[] {
  const result = transactionFormSchema.safeParse(values);
  if (result.success) {
    return [];
  }
  return result.error.issues.map(issue => issue.path.join('.'));
}

describe('transactionFormSchema', () => {
  it('accepts a valid expense', () => {
    const result = transactionFormSchema.safeParse(validExpense());
    expect(result.success).toBe(true);
  });

  it('accepts a valid income without a category', () => {
    const result = transactionFormSchema.safeParse({
      ...validExpense(),
      type: 'income',
      categoryId: null,
      merchant: 'Acme Corp',
    });
    expect(result.success).toBe(true);
  });

  it('requires an amount', () => {
    const issues = issuePaths({...validExpense(), amountMinor: null});
    expect(issues).toContain('amountMinor');
  });

  it('rejects zero and negative amounts', () => {
    expect(issuePaths({...validExpense(), amountMinor: 0})).toContain(
      'amountMinor',
    );
    expect(issuePaths({...validExpense(), amountMinor: -500})).toContain(
      'amountMinor',
    );
  });

  it('requires an account', () => {
    const issues = issuePaths({...validExpense(), accountId: ''});
    expect(issues).toContain('accountId');
  });

  it('requires a destination account for transfers', () => {
    const issues = issuePaths({
      ...validExpense(),
      type: 'transfer',
      categoryId: null,
      destinationAccountId: null,
    });
    expect(issues).toContain('destinationAccountId');
  });

  it('rejects a transfer to the same account', () => {
    const issues = issuePaths({
      ...validExpense(),
      type: 'transfer',
      categoryId: null,
      destinationAccountId: 'acc_cash',
    });
    expect(issues).toContain('destinationAccountId');
  });

  it('accepts a valid transfer', () => {
    const result = transactionFormSchema.safeParse({
      ...validExpense(),
      type: 'transfer',
      categoryId: null,
      destinationAccountId: 'acc_bank',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an over-long merchant and note', () => {
    expect(
      issuePaths({...validExpense(), merchant: 'x'.repeat(121)}),
    ).toContain('merchant');
    expect(issuePaths({...validExpense(), note: 'x'.repeat(501)})).toContain(
      'note',
    );
  });
});

describe('isPaymentMethod', () => {
  it('accepts known methods and rejects anything else', () => {
    expect(isPaymentMethod('cash')).toBe(true);
    expect(isPaymentMethod('net_banking')).toBe(true);
    expect(isPaymentMethod('cheque')).toBe(false);
    expect(isPaymentMethod(null)).toBe(false);
  });
});
