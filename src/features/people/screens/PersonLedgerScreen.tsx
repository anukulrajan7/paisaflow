import React, {useCallback, useMemo, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {
  ArrowLeft,
  MessageCircle,
  Pencil,
  Phone,
} from 'lucide-react-native';

import {
  AmountText,
  AppHeader,
  AppScreen,
  Button,
  Card,
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
import type {AppTheme} from '../../../design-system/tokens';
import {RemindersIllustration} from '../../../design-system/illustrations';
import type {SettingsStackParamList} from '../../../app/navigation/types';
import {bumpDataVersion} from '../../../store/dataVersionStore';
import {dayjs} from '../../../utils/date';
import {formatMoney} from '../../../utils/money';
import {ContactActionsSheet} from '../components/ContactActionsSheet';
import {LedgerEntryCard} from '../components/LedgerEntryCard';
import {LedgerEntryFormSheet} from '../components/LedgerEntryFormSheet';
import {PersonFormSheet} from '../components/PersonFormSheet';
import {RepaymentSheet} from '../components/RepaymentSheet';
import {UndoBar} from '../components/UndoBar';
import {usePersonLedgerData} from '../hooks/usePersonLedgerData';
import {getPeopleRepository} from '../services/peopleRepository';
import {remainingMinor} from '../types/person';
import type {LedgerEntry} from '../types/person';
import {balanceCaption} from '../utils/ledgerDisplay';

type Props = NativeStackScreenProps<SettingsStackParamList, 'PersonLedger'>;

interface EntryFormState {
  visible: boolean;
  editing: LedgerEntry | null;
}

const CLOSED_ENTRY_FORM: EntryFormState = {visible: false, editing: null};

/** One person's lending ledger: balance, entries, repayments, reminders. */
export function PersonLedgerScreen({navigation, route}: Props) {
  const {personId} = route.params;
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();
  // Snapshot "today" once per mount; entries compare due dates against it.
  const [todayStart] = useState(() => dayjs().startOf('day').valueOf());
  const {data, loading, error, reload} = usePersonLedgerData(personId);

  const [entryForm, setEntryForm] = useState<EntryFormState>(CLOSED_ENTRY_FORM);
  const [repaying, setRepaying] = useState<LedgerEntry | null>(null);
  const [settling, setSettling] = useState<LedgerEntry | null>(null);
  const [settleBusy, setSettleBusy] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState(false);
  const [deletedEntry, setDeletedEntry] = useState<LedgerEntry | null>(null);

  const openAddEntry = useCallback(
    () => setEntryForm({visible: true, editing: null}),
    [],
  );
  const openEditEntry = useCallback(
    (entry: LedgerEntry) => setEntryForm({visible: true, editing: entry}),
    [],
  );

  const confirmSettle = useCallback(async () => {
    if (!settling) {
      return;
    }
    setSettleBusy(true);
    try {
      await getPeopleRepository().settleEntry(settling.id);
      bumpDataVersion();
      showToast('Entry settled', {type: 'success'});
      setSettling(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not settle the entry', {
        type: 'error',
      });
    } finally {
      setSettleBusy(false);
    }
  }, [settling, showToast]);

  const deleteEntry = useCallback(
    async (entry: LedgerEntry) => {
      try {
        await getPeopleRepository().softDeleteEntry(entry.id);
        bumpDataVersion();
        setDeletedEntry(entry);
      } catch (e) {
        showToast(
          e instanceof Error ? e.message : 'Could not delete the entry',
          {type: 'error'},
        );
      }
    },
    [showToast],
  );

  const undoDelete = useCallback(async () => {
    if (!deletedEntry) {
      return;
    }
    try {
      await getPeopleRepository().restoreEntry(deletedEntry.id);
      bumpDataVersion();
      showToast('Entry restored', {type: 'success'});
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Could not restore the entry',
        {type: 'error'},
      );
    } finally {
      setDeletedEntry(null);
    }
  }, [deletedEntry, showToast]);

  const person = data?.person ?? null;
  const hasEntries = (data?.entries.length ?? 0) > 0;
  const openCount =
    data?.entries.filter(entry => entry.status !== 'completed').length ?? 0;

  return (
    <AppScreen>
      <AppHeader
        title={person?.name ?? 'Ledger'}
        subtitle={person?.phone ?? undefined}
        left={
          <IconButton
            icon={ArrowLeft}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
          />
        }
        right={
          person ? (
            <View style={styles.headerActions}>
              {person.phone ? (
                <IconButton
                  icon={Phone}
                  onPress={() => setContactOpen(true)}
                  accessibilityLabel={`Contact ${person.name}`}
                />
              ) : null}
              <IconButton
                icon={Pencil}
                onPress={() => setEditingPerson(true)}
                accessibilityLabel={`Edit ${person.name}`}
              />
            </View>
          ) : undefined
        }
      />
      {loading && !data ? (
        <LoadingState message="Loading ledger" />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data && person ? (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {paddingHorizontal: theme.spacing.lg},
          ]}>
          <Card style={styles.summary}>
            <Text variant="label" color="textSecondary" style={styles.summaryLabel}>
              Net balance
            </Text>
            <AmountText
              amountMinor={data.balanceMinor}
              currency={data.currency}
              type="neutral"
              size="large"
              showSign={false}
              color={
                data.balanceMinor > 0
                  ? 'income'
                  : data.balanceMinor < 0
                    ? 'expense'
                    : 'textMuted'
              }
              testID="person-balance"
            />
            <Text variant="caption" color="textMuted">
              {`${balanceCaption(data.balanceMinor)} · ${openCount} open ${
                openCount === 1 ? 'entry' : 'entries'
              }`}
            </Text>
            {person.notes ? (
              <Text variant="caption" color="textSecondary">
                {person.notes}
              </Text>
            ) : null}
            {person.phone ? (
              <View style={styles.contactRow}>
                <Button
                  title="Call"
                  variant="ghost"
                  size="sm"
                  icon={Phone}
                  onPress={() => setContactOpen(true)}
                  accessibilityLabel={`Call ${person.name}`}
                />
                <Button
                  title="Message"
                  variant="ghost"
                  size="sm"
                  icon={MessageCircle}
                  onPress={() => setContactOpen(true)}
                  accessibilityLabel={`Message ${person.name}`}
                />
                <Button
                  title="WhatsApp"
                  variant="ghost"
                  size="sm"
                  icon={MessageCircle}
                  onPress={() => setContactOpen(true)}
                  accessibilityLabel={`WhatsApp ${person.name}`}
                />
              </View>
            ) : null}
          </Card>

          <View style={styles.section}>
            <SectionHeader
              title="Ledger"
              actionLabel={hasEntries ? 'Add entry' : undefined}
              onAction={hasEntries ? openAddEntry : undefined}
            />
            {hasEntries ? (
              data.entries.map(entry => (
                <LedgerEntryCard
                  key={entry.id}
                  entry={entry}
                  currency={entry.currency}
                  accountsById={data.accountsById}
                  todayStart={todayStart}
                  onRepay={setRepaying}
                  onEdit={openEditEntry}
                  onSettle={setSettling}
                  onDelete={deleteEntry}
                  testID={`ledger-entry-${entry.id}`}
                />
              ))
            ) : (
              <EmptyState
                illustration={<RemindersIllustration />}
                title="No entries yet"
                message={`Record the first amount you gave to or borrowed from ${person.name}. A virtual account tracks what is still owed.`}
                actionLabel="Add entry"
                onAction={openAddEntry}
              />
            )}
          </View>
        </ScrollView>
      ) : null}

      {data && person ? (
        <>
          <LedgerEntryFormSheet
            visible={entryForm.visible}
            onClose={() => setEntryForm(CLOSED_ENTRY_FORM)}
            personId={person.id}
            editing={entryForm.editing}
            paymentAccounts={data.paymentAccounts}
            currency={data.currency}
          />
          <RepaymentSheet
            visible={repaying !== null}
            onClose={() => setRepaying(null)}
            entry={repaying}
            personName={person.name}
          />
          <ContactActionsSheet
            visible={contactOpen}
            onClose={() => setContactOpen(false)}
            personName={person.name}
            phone={person.phone}
          />
          <PersonFormSheet
            visible={editingPerson}
            onClose={() => setEditingPerson(false)}
            editing={person}
          />
        </>
      ) : null}

      <Modal
        visible={settling !== null}
        onClose={() => setSettling(null)}
        title="Settle in full?"
        actions={
          <>
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => setSettling(null)}
            />
            <Button
              title="Settle"
              onPress={confirmSettle}
              loading={settleBusy}
              testID="confirm-settle"
            />
          </>
        }>
        <Text variant="body" color="textSecondary">
          {settling
            ? `Records a repayment of ${formatMoney(
                remainingMinor(settling),
                settling.currency,
              )} through the original account and marks the entry completed.`
            : ''}
        </Text>
      </Modal>

      <UndoBar
        message={deletedEntry ? 'Entry deleted' : null}
        onUndo={undoDelete}
        onDismiss={() => setDeletedEntry(null)}
        testID="entry-undo-bar"
      />
    </AppScreen>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    content: {
      gap: theme.spacing.xl,
      paddingBottom: theme.spacing.xxxl,
    },
    summary: {gap: theme.spacing.xs},
    summaryLabel: {textTransform: 'uppercase'},
    contactRow: {
      flexDirection: 'row',
      gap: theme.spacing.xs,
      marginTop: theme.spacing.sm,
    },
    section: {gap: theme.spacing.sm},
  });
