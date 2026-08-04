import React, {useEffect, useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';

import {
  BottomSheet,
  Button,
  MoneyInput,
  Text,
  useToast,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import {bumpDataVersion} from '../../../store/dataVersionStore';
import {formatMoney} from '../../../utils/money';
import {getPeopleRepository} from '../services/peopleRepository';
import {remainingMinor} from '../types/person';
import type {LedgerEntry} from '../types/person';

export interface RepaymentSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Entry being repaid; null hides the sheet. */
  entry: LedgerEntry | null;
  personName: string;
}

/**
 * Records a full or partial repayment. The money moves between the person's
 * virtual account and the entry's payment account; repaid_minor accrues and
 * the entry completes when it reaches the full amount.
 */
export function RepaymentSheet({
  visible,
  onClose,
  entry,
  personName,
}: RepaymentSheetProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();
  const [amountMinor, setAmountMinor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remaining = entry ? remainingMinor(entry) : 0;

  useEffect(() => {
    if (visible && entry) {
      setAmountMinor(remainingMinor(entry));
      setError(null);
    }
  }, [visible, entry]);

  if (!entry) {
    return null;
  }

  const received = entry.direction === 'lent';

  const submit = async () => {
    if (amountMinor === null || amountMinor <= 0) {
      setError('Enter an amount greater than zero');
      return;
    }
    if (amountMinor > remaining) {
      setError(`Only ${formatMoney(remaining, entry.currency)} is left`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await getPeopleRepository().recordRepayment(
        entry.id,
        amountMinor,
      );
      bumpDataVersion();
      showToast(
        updated.status === 'completed'
          ? 'Entry settled'
          : 'Repayment recorded',
        {type: 'success'},
      );
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not record the repayment',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={received ? 'Record repayment received' : 'Record repayment made'}>
      <View key={entry.id} style={styles.form}>
        <Text variant="body" color="textSecondary">
          {received
            ? `${personName} still owes you ${formatMoney(
                remaining,
                entry.currency,
              )}.`
            : `You still owe ${personName} ${formatMoney(
                remaining,
                entry.currency,
              )}.`}
        </Text>

        <MoneyInput
          label="Repayment amount"
          valueMinor={amountMinor}
          onChangeMinor={setAmountMinor}
          currency={entry.currency}
          error={error ?? undefined}
          hint="Money moves through the same account as the original entry"
          accessibilityLabel="Repayment amount"
          testID="repayment-amount"
        />

        <View style={styles.actions}>
          <Button title="Cancel" variant="ghost" onPress={onClose} />
          <Button
            title="Record repayment"
            onPress={submit}
            loading={busy}
            testID="repayment-submit"
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    form: {gap: theme.spacing.lg, paddingBottom: theme.spacing.lg},
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: theme.spacing.sm,
    },
  });
