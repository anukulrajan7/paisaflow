import React, {useCallback, useMemo, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {ArrowLeft, Plus} from 'lucide-react-native';

import {
  AppHeader,
  AppScreen,
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  Modal,
  SectionHeader,
  Text,
  useToast,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import {RemindersIllustration} from '../../../design-system/illustrations';
import type {AppTheme} from '../../../design-system/tokens';
import type {SettingsStackParamList} from '../../../app/navigation/types';
import {bumpDataVersion} from '../../../store/dataVersionStore';
import {RecurringRuleFormSheet} from '../components/RecurringRuleFormSheet';
import {RecurringRuleRow} from '../components/RecurringRuleRow';
import {useRecurringRulesData} from '../hooks/useRecurringRulesData';
import {getRecurringRulesRepository} from '../services/recurringRulesRepository';
import type {RecurringRule} from '../types/recurringRule';
import {ruleTitle} from '../utils/ruleDisplay';

type Props = NativeStackScreenProps<SettingsStackParamList, 'Recurring'>;

interface FormState {
  visible: boolean;
  editing: RecurringRule | null;
}

const CLOSED_FORM: FormState = {visible: false, editing: null};

/** Lists recurring payment rules; add/edit via a bottom-sheet form. */
export function RecurringRulesScreen({navigation}: Props) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();
  const {data, loading, error, reload} = useRecurringRulesData();

  const [form, setForm] = useState<FormState>(CLOSED_FORM);
  const [deleting, setDeleting] = useState<RecurringRule | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const openCreate = useCallback(
    () => setForm({visible: true, editing: null}),
    [],
  );
  const openEdit = useCallback(
    (rule: RecurringRule) => setForm({visible: true, editing: rule}),
    [],
  );

  const toggleActive = useCallback(
    async (rule: RecurringRule) => {
      try {
        await getRecurringRulesRepository().setRuleActive(rule.id, !rule.isActive);
        bumpDataVersion();
        showToast(rule.isActive ? 'Rule paused' : 'Rule resumed', {
          type: 'success',
        });
      } catch (e) {
        showToast(
          e instanceof Error ? e.message : 'Could not update the rule',
          {type: 'error'},
        );
      }
    },
    [showToast],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleting) {
      return;
    }
    setDeleteBusy(true);
    try {
      await getRecurringRulesRepository().deleteRule(deleting.id);
      bumpDataVersion();
      showToast('Recurring payment deleted', {type: 'success'});
      setDeleting(null);
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Could not delete the recurring payment',
        {type: 'error'},
      );
    } finally {
      setDeleteBusy(false);
    }
  }, [deleting, showToast]);

  const activeRules = useMemo(
    () => data?.rules.filter(rule => rule.isActive) ?? [],
    [data?.rules],
  );
  const pausedRules = useMemo(
    () => data?.rules.filter(rule => !rule.isActive) ?? [],
    [data?.rules],
  );
  const hasRules = activeRules.length > 0 || pausedRules.length > 0;
  // Single snapshot so every row compares against the same "today".
  const now = Date.now();

  return (
    <AppScreen>
      <AppHeader
        title="Recurring payments"
        left={
          <IconButton
            icon={ArrowLeft}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
          />
        }
        right={
          hasRules ? (
            <IconButton
              icon={Plus}
              onPress={openCreate}
              accessibilityLabel="Add recurring payment"
            />
          ) : undefined
        }
      />
      {loading && !data ? (
        <LoadingState message="Loading recurring payments" />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data ? (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {paddingHorizontal: theme.spacing.lg},
          ]}>
          {hasRules ? (
            <>
              <View style={styles.section}>
                <SectionHeader title="Active" />
                {activeRules.length > 0 ? (
                  activeRules.map(rule => (
                    <RecurringRuleRow
                      key={rule.id}
                      rule={rule}
                      accountsById={data.accountsById}
                      categoriesById={data.categoriesById}
                      now={now}
                      onEdit={openEdit}
                      onToggleActive={toggleActive}
                      onDelete={setDeleting}
                      testID={`recurring-rule-${rule.id}`}
                    />
                  ))
                ) : (
                  <Text variant="body" color="textSecondary">
                    All rules are paused.
                  </Text>
                )}
              </View>
              {pausedRules.length > 0 ? (
                <View style={styles.section}>
                  <SectionHeader title="Paused" />
                  {pausedRules.map(rule => (
                    <RecurringRuleRow
                      key={rule.id}
                      rule={rule}
                      accountsById={data.accountsById}
                      categoriesById={data.categoriesById}
                      now={now}
                      onEdit={openEdit}
                      onToggleActive={toggleActive}
                      onDelete={setDeleting}
                      testID={`recurring-rule-${rule.id}`}
                    />
                  ))}
                </View>
              ) : null}
            </>
          ) : (
            <EmptyState
              illustration={<RemindersIllustration />}
              title="No recurring payments yet"
              message="Track subscriptions, rent and credit card bills here. When one comes due, confirm it on Home to record the transaction."
              actionLabel="Add recurring payment"
              onAction={openCreate}
              style={styles.empty}
            />
          )}
        </ScrollView>
      ) : null}

      {data ? (
        <RecurringRuleFormSheet
          visible={form.visible}
          onClose={() => setForm(CLOSED_FORM)}
          editing={form.editing}
          accounts={[...data.accountsById.values()]}
          categories={[...data.categoriesById.values()]}
          currency={data.currency}
        />
      ) : null}

      <Modal
        visible={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete recurring payment?"
        actions={
          <>
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => setDeleting(null)}
            />
            <Button
              title="Delete"
              variant="danger"
              onPress={confirmDelete}
              loading={deleteBusy}
              testID="confirm-delete-rule"
            />
          </>
        }>
        <Text variant="body" color="textSecondary">
          {deleting
            ? `This stops future occurrences of ${ruleTitle(
                deleting,
                data?.accountsById ?? new Map(),
                data?.categoriesById ?? new Map(),
              )}. Transactions already recorded are not affected.`
            : ''}
        </Text>
      </Modal>
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
