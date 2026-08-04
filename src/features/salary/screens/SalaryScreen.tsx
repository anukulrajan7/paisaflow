import React, {useMemo, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {ArrowLeft, Check, HandCoins, Pencil} from 'lucide-react-native';

import {
  AppHeader,
  AppScreen,
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  SectionHeader,
  Text,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {SettingsStackParamList} from '../../../app/navigation/types';
import {MarkCreditedSheet} from '../components/MarkCreditedSheet';
import {SalaryConfigFormSheet} from '../components/SalaryConfigFormSheet';
import {SalaryRecordRow} from '../components/SalaryRecordRow';
import {SalaryStateCard} from '../components/SalaryStateCard';
import {useSalaryData} from '../hooks/useSalaryData';
import {periodKeyFor} from '../utils/salaryState';

type Props = NativeStackScreenProps<SettingsStackParamList, 'Salary'>;

/**
 * Salary hub: this month's status card (expected / credited / partial /
 * bonus / delayed), the confirm flow, setup/edit and the month history.
 */
export function SalaryScreen({navigation}: Props) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {data, loading, error, reload} = useSalaryData();

  const [formVisible, setFormVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);

  const config = data?.config ?? null;
  // Single snapshot so the card and the list compare against the same "today".
  const now = Date.now();
  const periodKey = periodKeyFor(now);

  const currentRecord = useMemo(
    () => data?.records.find(record => record.periodKey === periodKey) ?? null,
    [data?.records, periodKey],
  );
  const history = useMemo(
    () => (data?.records ?? []).filter(record => record.periodKey !== periodKey),
    [data?.records, periodKey],
  );

  // A delayed (unpaid) record can still be confirmed when the money arrives.
  const canConfirm =
    config !== null &&
    (!currentRecord ||
      (currentRecord.status === 'delayed' && currentRecord.transactionId === null));

  return (
    <AppScreen>
      <AppHeader
        title="Salary"
        left={
          <IconButton
            icon={ArrowLeft}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
          />
        }
        right={
          config ? (
            <IconButton
              icon={Pencil}
              onPress={() => setFormVisible(true)}
              accessibilityLabel="Edit salary setup"
            />
          ) : undefined
        }
      />
      {loading && !data ? (
        <LoadingState message="Loading salary details" />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data ? (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {paddingHorizontal: theme.spacing.lg},
          ]}>
          {config ? (
            <>
              <View style={styles.section}>
                <SalaryStateCard
                  config={config}
                  record={currentRecord}
                  account={data.accountsById.get(config.accountId)}
                  now={now}
                  testID="salary-state-card"
                />
                {canConfirm ? (
                  <Button
                    title="Mark as credited"
                    icon={Check}
                    onPress={() => setConfirmVisible(true)}
                    fullWidth
                    accessibilityLabel="Record this month's salary"
                    testID="salary-mark-credited"
                  />
                ) : null}
              </View>

              <View style={styles.section}>
                <SectionHeader title="History" />
                {history.length > 0 ? (
                  history.map(record => (
                    <SalaryRecordRow
                      key={record.id}
                      record={record}
                      currency={config.currency}
                      testID={`salary-record-${record.periodKey}`}
                    />
                  ))
                ) : (
                  <Text variant="body" color="textSecondary">
                    No past records yet.
                  </Text>
                )}
              </View>
            </>
          ) : (
            <EmptyState
              icon={HandCoins}
              title="Set up your salary"
              message="Track when your salary is due each month, get reminded, and record it as income with one tap when it arrives."
              actionLabel="Set up salary"
              onAction={() => setFormVisible(true)}
              style={styles.empty}
              testID="salary-empty-state"
            />
          )}
        </ScrollView>
      ) : null}

      {data ? (
        <SalaryConfigFormSheet
          visible={formVisible}
          onClose={() => setFormVisible(false)}
          editing={config}
          accounts={data.accounts}
          currency={data.currency}
        />
      ) : null}

      {config ? (
        <MarkCreditedSheet
          visible={confirmVisible}
          onClose={() => setConfirmVisible(false)}
          config={config}
          periodKey={periodKey}
        />
      ) : null}
    </AppScreen>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    content: {
      gap: theme.spacing.xl,
      paddingBottom: theme.spacing.xxxl,
    },
    section: {gap: theme.spacing.sm},
    empty: {marginTop: theme.spacing.xxxl},
  });
