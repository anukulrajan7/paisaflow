import {SYSTEM_CATEGORY_IDS} from '../../../database/seeds/defaultData';
import {dayjs} from '../../../utils/date';
import {
  computeDedupeHash,
  guessCategoryId,
  parseBankMessage,
} from '../smsParser';

/**
 * Realistic Indian bank/UPI alert fixtures. Amounts are asserted in integer
 * minor units (paise): Rs.1,234.00 -> 123400.
 */
describe('parseBankMessage — transaction alerts', () => {
  it('parses an HDFC debit alert with commas and decimals', () => {
    const parsed = parseBankMessage(
      'Rs.1,234.00 debited from A/c XX1234 on 12-01-26 at SWIGGY BANGALORE. Avl Bal Rs.45,678.00',
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.direction).toBe('debit');
    expect(parsed?.amountMinor).toBe(123_400);
    expect(parsed?.merchant).toBe('SWIGGY BANGALORE');
    expect(parsed?.accountHint).toBe('1234');
    expect(parsed?.occurredAt).toBe(dayjs('2026-01-12').valueOf());
    expect(parsed?.categoryId).toBe(SYSTEM_CATEGORY_IDS.food);
  });

  it('parses an ICICI salary credit with INR prefix and named month', () => {
    const parsed = parseBankMessage(
      'ICICI Bank Acct XX4321 credited with INR 50,000.00 on 01-Feb-26. Info: SALARY ACME CORP. Avl Bal: Rs.75,000.00',
    );
    expect(parsed?.direction).toBe('credit');
    expect(parsed?.amountMinor).toBe(5_000_000);
    expect(parsed?.merchant).toBe('SALARY ACME CORP');
    expect(parsed?.accountHint).toBe('4321');
    expect(parsed?.occurredAt).toBe(dayjs('2026-02-01').valueOf());
    expect(parsed?.categoryId).toBe(SYSTEM_CATEGORY_IDS.salary);
  });

  it('parses an SBI UPI debit with VPA payee and reference number', () => {
    const parsed = parseBankMessage(
      'Dear Customer, Your A/c X9012 is debited by Rs.250.00 on 03/02/26 by UPI to VPA swiggy@paytm (Ref No 403712345678).',
    );
    expect(parsed?.direction).toBe('debit');
    expect(parsed?.amountMinor).toBe(25_000);
    expect(parsed?.merchant).toBe('swiggy');
    expect(parsed?.accountHint).toBe('9012');
    expect(parsed?.referenceId).toBe('403712345678');
    expect(parsed?.occurredAt).toBe(dayjs('2026-02-03').valueOf());
    expect(parsed?.categoryId).toBe(SYSTEM_CATEGORY_IDS.food);
  });

  it('parses an Axis card debit, preferring the merchant over the card hint', () => {
    const parsed = parseBankMessage(
      'INR 1499.00 debited from Axis Bank Card XX7788 at AMAZON PAY INDIA on 05-02-2026.',
    );
    expect(parsed?.direction).toBe('debit');
    expect(parsed?.amountMinor).toBe(149_900);
    expect(parsed?.merchant).toBe('AMAZON PAY INDIA');
    expect(parsed?.accountHint).toBe('7788');
    expect(parsed?.occurredAt).toBe(dayjs('2026-02-05').valueOf());
    expect(parsed?.categoryId).toBe(SYSTEM_CATEGORY_IDS.shopping);
  });

  it('parses a Kotak credit card "spent" alert', () => {
    const parsed = parseBankMessage(
      'Rs.80.00 was spent on your Kotak Credit Card XX3344 at UBER INDIA on 06/02/26.',
    );
    expect(parsed?.direction).toBe('debit');
    expect(parsed?.amountMinor).toBe(8_000);
    expect(parsed?.merchant).toBe('UBER INDIA');
    expect(parsed?.accountHint).toBe('3344');
    expect(parsed?.categoryId).toBe(SYSTEM_CATEGORY_IDS.transport);
  });

  it('parses a Paytm UPI payment', () => {
    const parsed = parseBankMessage(
      'Paid Rs.99 to Chai Point via Paytm UPI. Ref ID 987654321098.',
    );
    expect(parsed?.direction).toBe('debit');
    expect(parsed?.amountMinor).toBe(9_900);
    expect(parsed?.merchant).toBe('Chai Point');
    expect(parsed?.referenceId).toBe('987654321098');
    expect(parsed?.categoryId).toBe(SYSTEM_CATEGORY_IDS.food);
  });

  it('parses a PhonePe "sent ₹" message with rupee symbol', () => {
    const parsed = parseBankMessage(
      'You have sent ₹500.00 to Ramesh Kumar from your PhonePe linked account XX6677. UPI Ref: 312345678901.',
    );
    expect(parsed?.direction).toBe('debit');
    expect(parsed?.amountMinor).toBe(50_000);
    expect(parsed?.merchant).toBe('Ramesh Kumar');
    expect(parsed?.accountHint).toBe('6677');
    expect(parsed?.referenceId).toBe('312345678901');
    expect(parsed?.categoryId).toBe(SYSTEM_CATEGORY_IDS.other);
  });

  it('parses a Google Pay payment with symbol, commas and paise', () => {
    const parsed = parseBankMessage(
      'You paid ₹1,050.50 to BigBasket using Google Pay.',
    );
    expect(parsed?.direction).toBe('debit');
    expect(parsed?.amountMinor).toBe(105_050);
    expect(parsed?.merchant).toBe('BigBasket');
    expect(parsed?.categoryId).toBe(SYSTEM_CATEGORY_IDS.groceries);
  });

  it('parses a generic "INR credited to A/c" credit', () => {
    const parsed = parseBankMessage(
      'INR 500.00 credited to A/c XX1234 on 10-02-26. UPI Ref No 123456789012.',
    );
    expect(parsed?.direction).toBe('credit');
    expect(parsed?.amountMinor).toBe(50_000);
    expect(parsed?.merchant).toBeNull();
    expect(parsed?.accountHint).toBe('1234');
    expect(parsed?.referenceId).toBe('123456789012');
    expect(parsed?.categoryId).toBe(SYSTEM_CATEGORY_IDS.otherIncome);
  });

  it('parses a salary credit without a date', () => {
    const parsed = parseBankMessage(
      'Your salary of Rs.85,000.00 for Jan 2026 has been credited to A/c XX5555.',
    );
    expect(parsed?.direction).toBe('credit');
    expect(parsed?.amountMinor).toBe(8_500_000);
    expect(parsed?.accountHint).toBe('5555');
    expect(parsed?.occurredAt).toBeNull();
    expect(parsed?.categoryId).toBe(SYSTEM_CATEGORY_IDS.salary);
  });

  it('parses a refund as a credit in the refund category', () => {
    const parsed = parseBankMessage(
      'Rs.299.00 refunded to your A/c XX9988 for order from Flipkart. Ref: RF123456789.',
    );
    expect(parsed?.direction).toBe('credit');
    expect(parsed?.amountMinor).toBe(29_900);
    expect(parsed?.merchant).toBe('Flipkart');
    expect(parsed?.accountHint).toBe('9988');
    expect(parsed?.referenceId).toBe('RF123456789');
    expect(parsed?.categoryId).toBe(SYSTEM_CATEGORY_IDS.refund);
  });

  it('parses an electricity bill payment towards a utility', () => {
    const parsed = parseBankMessage(
      'Rs.1,450.00 debited from A/c XX2211 towards BESCOM ELECTRICITY bill payment.',
    );
    expect(parsed?.direction).toBe('debit');
    expect(parsed?.amountMinor).toBe(145_000);
    expect(parsed?.merchant).toContain('BESCOM');
    expect(parsed?.accountHint).toBe('2211');
    expect(parsed?.categoryId).toBe(SYSTEM_CATEGORY_IDS.bills);
  });

  it('parses a wallet recharge via Paytm', () => {
    const parsed = parseBankMessage(
      'Paid Rs.450 to Metro Card Recharge via Paytm Wallet. Txn ID: 8877665544.',
    );
    expect(parsed?.direction).toBe('debit');
    expect(parsed?.amountMinor).toBe(45_000);
    expect(parsed?.merchant).toBe('Metro Card Recharge');
    expect(parsed?.categoryId).toBe(SYSTEM_CATEGORY_IDS.transport);
  });
});

describe('parseBankMessage — rejection', () => {
  it('rejects OTP messages even when they mention an amount', () => {
    expect(
      parseBankMessage(
        'Your OTP for transaction of Rs.500 is 123456. Do not share it with anyone.',
      ),
    ).toBeNull();
    expect(
      parseBankMessage('123456 is your Google verification code.'),
    ).toBeNull();
    expect(
      parseBankMessage(
        'One Time Password for INR 2,000.00 purchase is 998877. Valid for 10 mins.',
      ),
    ).toBeNull();
  });

  it('rejects promotional messages', () => {
    expect(
      parseBankMessage(
        'Congratulations! Get 20% cashback up to Rs.200 on your next recharge. Offer valid till Sunday. T&C apply.',
      ),
    ).toBeNull();
    expect(
      parseBankMessage(
        'Pre-approved personal loan of Rs.5,00,000! Apply now.',
      ),
    ).toBeNull();
    expect(
      parseBankMessage(
        'Weekend deal: flat Rs.150 discount on orders above Rs.499. Shop now!',
      ),
    ).toBeNull();
  });

  it('rejects non-transaction noise', () => {
    expect(parseBankMessage('Your order has been shipped')).toBeNull();
    expect(parseBankMessage('')).toBeNull();
    expect(parseBankMessage('   ')).toBeNull();
    expect(
      parseBankMessage('Your KYC update is due. Visit your nearest branch.'),
    ).toBeNull();
  });
});

describe('computeDedupeHash', () => {
  const BODY =
    'Rs.1,234.00 debited from A/c XX1234 on 12-01-26 at SWIGGY BANGALORE.';

  it('is stable for the same input', () => {
    expect(computeDedupeHash(BODY, 123_400, 'debit')).toBe(
      computeDedupeHash(BODY, 123_400, 'debit'),
    );
  });

  it('is insensitive to case and whitespace differences', () => {
    const messy = '  rs.1,234.00   DEBITED from A/c XX1234\non 12-01-26 at swiggy bangalore. ';
    expect(computeDedupeHash(messy, 123_400, 'debit')).toBe(
      computeDedupeHash(BODY, 123_400, 'debit'),
    );
  });

  it('changes with the amount', () => {
    expect(computeDedupeHash(BODY, 123_400, 'debit')).not.toBe(
      computeDedupeHash(BODY, 123_401, 'debit'),
    );
  });

  it('changes with the direction', () => {
    expect(computeDedupeHash(BODY, 123_400, 'debit')).not.toBe(
      computeDedupeHash(BODY, 123_400, 'credit'),
    );
  });

  it('changes with the body', () => {
    expect(computeDedupeHash(BODY, 123_400, 'debit')).not.toBe(
      computeDedupeHash('Rs.1,234.00 debited from A/c XX9999 at ZOMATO.', 123_400, 'debit'),
    );
  });
});

describe('guessCategoryId', () => {
  it.each([
    ['Swiggy Instamart order', SYSTEM_CATEGORY_IDS.food],
    ['ZOMATO', SYSTEM_CATEGORY_IDS.food],
    ['UBER INDIA', SYSTEM_CATEGORY_IDS.transport],
    ['Ola Cabs', SYSTEM_CATEGORY_IDS.transport],
    ['AMAZON PAY INDIA', SYSTEM_CATEGORY_IDS.shopping],
    ['Flipkart', SYSTEM_CATEGORY_IDS.shopping],
    ['BigBasket', SYSTEM_CATEGORY_IDS.groceries],
    ['BESCOM ELECTRICITY', SYSTEM_CATEGORY_IDS.bills],
    ['Jio Recharge', SYSTEM_CATEGORY_IDS.bills],
    ['NETFLIX', SYSTEM_CATEGORY_IDS.entertainment],
    ['Apollo Pharmacy', SYSTEM_CATEGORY_IDS.health],
    ['MakeMyTrip', SYSTEM_CATEGORY_IDS.travel],
    ['Udemy', SYSTEM_CATEGORY_IDS.education],
    ['Corner Store', SYSTEM_CATEGORY_IDS.other],
  ] as const)('debit merchant "%s" -> %s', (merchant, expected) => {
    expect(guessCategoryId('debit', merchant, '')).toBe(expected);
  });

  it('maps salary credits to the salary category', () => {
    expect(guessCategoryId('credit', 'ACME CORP', 'salary credited')).toBe(
      SYSTEM_CATEGORY_IDS.salary,
    );
  });

  it('maps refunds to the refund category', () => {
    expect(guessCategoryId('credit', null, 'refund of Rs.299.00')).toBe(
      SYSTEM_CATEGORY_IDS.refund,
    );
  });

  it('falls back per direction', () => {
    expect(guessCategoryId('debit', null, 'debited')).toBe(
      SYSTEM_CATEGORY_IDS.other,
    );
    expect(guessCategoryId('credit', null, 'credited')).toBe(
      SYSTEM_CATEGORY_IDS.otherIncome,
    );
  });
});
