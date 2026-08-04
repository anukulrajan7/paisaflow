import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {ArrowLeft, CircleAlert, Pencil, Trash2} from 'lucide-react-native';

import {
  AmountText,
  AppHeader,
  AppScreen,
  BottomSheet,
  Button,
  Card,
  Chip,
  Divider,
  ErrorState,
  IconButton,
  LoadingState,
  Text,
  useToast,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import {
  getAccountsRepository,
  getCategoriesRepository,
  getTransactionsRepository,
} from '../../../database/repositories';
import type {Transaction} from '../../../database/types';
import {useDataVersionStore, bumpDataVersion} from '../../../store/dataVersionStore';
import {dayjs} from '../../../utils/date';
import type {
  HomeStackParamList,
  RootTabParamList,
  TransactionsStackParamList,
} from '../../../app/navigation/types';
import {
  isPaymentMethod,
  PAYMENT_METHOD_LABELS,
} from '../schemas/transactionFormSchema';
import {useEditTransactionStore} from '../store/editTransactionStore';
import {getTagsForTransaction} from '../services/tagsService';

/** Reachable from both HomeStack and TransactionsStack with identical params. */
type Props =
  | NativeStackScreenProps<HomeStackParamList, 'TransactionDetails'>
  | NativeStackScreenProps<TransactionsStackParamList, 'TransactionDetails'>;

const DATE_FORMAT = 'D MMM YYYY · h:mm A';

const TYPE_LABELS: Record<Transaction['type'], string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
};

interface DetailsState {
  tx: Transaction | null;
  tags: string[];
  categoryName: string | null;
  accountName: string | null;
  destinationName: string | null;
  loading: boolean;
  notFound: boolean;
}

export function TransactionDetailsScreen({route, navigation}: Props) {
  const {transactionId} = route.params;
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();
  const dataVersion = useDataVersionStore(state => state.dataVersion);
  const startEditing = useEditTransactionStore(state => state.startEditing);

  const [state, setState] = useState<DetailsState>({
    tx: null,
    tags: [],
    categoryName: null,
    accountName: null,
    destinationName: null,
    loading: true,
    notFound: false,
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tx = await getTransactionsRepository().getTransactionById(
          transactionId,
        );
        if (!tx) {
          if (!cancelled) {
            setState(previous => ({
              ...previous,
              tx: null,
              loading: false,
              notFound: true,
            }));
          }
          return;
        }
        const [tags, category, account, destination] = await Promise.all([
          getTagsForTransaction(transactionId),
          tx.categoryId
            ? getCategoriesRepository().getCategoryById(tx.categoryId)
            : Promise.resolve(null),
          getAccountsRepository().getAccountById(tx.accountId),
          tx.destinationAccountId
            ? getAccountsRepository().getAccountById(tx.destinationAccountId)
            : Promise.resolve(null),
        ]);
        if (!cancelled) {
          setState({
            tx,
            tags,
            categoryName: category?.name ?? null,
            accountName: account?.name ?? null,
            destinationName: destination?.name ?? null,
            loading: false,
            notFound: false,
          });
        }
      } catch {
        if (!cancelled) {
          setState(previous => ({...previous, loading: false, notFound: true}));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [transactionId, dataVersion]);

  const handleEdit = useCallback(() => {
    startEditing(transactionId);
    navigation
      .getParent<BottomTabNavigationProp<RootTabParamList>>()
      ?.navigate('AddTab', {screen: 'AddTransaction'});
  }, [navigation, startEditing, transactionId]);

  const handleDelete = useCallback(async () => {
    if (deleting) {
      return;
    }
    setDeleting(true);
    try {
      await getTransactionsRepository().softDeleteTransaction(transactionId);
      bumpDataVersion();
      setConfirmDelete(false);
      showToast('Transaction deleted', {type: 'success'});
      navigation.goBack();
    } catch {
      showToast('Could not delete transaction', {type: 'error'});
    } finally {
      setDeleting(false);
    }
  }, [deleting, navigation, showToast, transactionId]);

  const handleRestore = useCallback(async () => {
    try {
      await getTransactionsRepository().restoreTransaction(transactionId);
      bumpDataVersion();
      showToast('Transaction restored', {type: 'success'});
    } catch {
      showToast('Could not restore transaction', {type: 'error'});
    }
  }, [showToast, transactionId]);

  const {tx} = state;
  const isDeleted = tx?.deletedAt != null;

  const backButton = (
    <IconButton
      icon={ArrowLeft}
      onPress={() => navigation.goBack()}
      accessibilityLabel="Back"
    />
  );

  if (state.loading) {
    return (
      <AppScreen padded>
        <AppHeader title="Transaction" left={backButton} />
        <LoadingState message="Loading transaction" />
      </AppScreen>
    );
  }

  if (state.notFound || !tx) {
    return (
      <AppScreen padded>
        <AppHeader title="Transaction" left={backButton} />
        <ErrorState
          title="Transaction not found"
          message="It may have been removed."
          retryLabel="Go back"
          onRetry={() => navigation.goBack()}
        />
      </AppScreen>
    );
  }

  const amountType = tx.type === 'transfer' ? 'neutral' : tx.type;
  const paymentLabel =
    tx.paymentMethod === null
      ? null
      : isPaymentMethod(tx.paymentMethod)
        ? PAYMENT_METHOD_LABELS[tx.paymentMethod]
        : tx.paymentMethod;

  return (
    <AppScreen padded>
      <AppHeader
        title="Transaction"
        left={backButton}
        right={
          !isDeleted ? (
            <IconButton
              icon={Pencil}
              onPress={handleEdit}
              accessibilityLabel="Edit transaction"
            />
          ) : null
        }
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}>
        {isDeleted ? (
          <View
            style={[
              styles.deletedBanner,
              {borderRadius: theme.radius.md},
            ]}
            accessibilityRole="alert">
            <CircleAlert size={18} color={theme.colors.danger} />
            <Text variant="body" color="danger" style={styles.deletedText}>
              This transaction was deleted. It no longer counts toward totals.
            </Text>
          </View>
        ) : null}

        <View style={styles.amountBlock}>
          <AmountText
            amountMinor={tx.amountMinor}
            currency={tx.currency}
            type={amountType}
            size="large"
            color={isDeleted ? 'textMuted' : undefined}
          />
          <Text variant="caption" color="textMuted">
            {TYPE_LABELS[tx.type]}
          </Text>
        </View>

        <Card>
          <DetailRow label="Type" value={TYPE_LABELS[tx.type]} />
          {tx.type !== 'transfer' ? (
            <DetailRow
              label="Category"
              value={state.categoryName ?? 'Uncategorized'}
            />
          ) : null}
          <DetailRow
            label={tx.type === 'transfer' ? 'From account' : 'Account'}
            value={state.accountName ?? 'Unknown account'}
          />
          {tx.type === 'transfer' ? (
            <DetailRow
              label="To account"
              value={state.destinationName ?? 'Unknown account'}
            />
          ) : null}
          <DetailRow label="Date" value={dayjs(tx.occurredAt).format(DATE_FORMAT)} />
          {tx.merchant ? (
            <DetailRow
              label={tx.type === 'income' ? 'Source' : 'Merchant'}
              value={tx.merchant}
            />
          ) : null}
          {tx.note ? <DetailRow label="Note" value={tx.note} /> : null}
          {paymentLabel ? (
            <DetailRow label="Payment method" value={paymentLabel} />
          ) : null}
          {state.tags.length > 0 ? (
            <>
              <Divider spacing="md" />
              <View style={styles.tagsBlock}>
                <Text variant="caption" color="textMuted">
                  Tags
                </Text>
                <View style={styles.tagsWrap}>
                  {state.tags.map(tag => (
                    <Chip key={tag} label={tag} />
                  ))}
                </View>
              </View>
            </>
          ) : null}
          <Divider spacing="md" />
          <DetailRow
            label="Created"
            value={dayjs(tx.createdAt).format(DATE_FORMAT)}
          />
          <DetailRow
            label="Updated"
            value={dayjs(tx.updatedAt).format(DATE_FORMAT)}
          />
        </Card>

        {isDeleted ? (
          <Button
            title="Restore transaction"
            onPress={handleRestore}
            fullWidth
          />
        ) : (
          <View style={styles.actions}>
            <Button
              title="Edit"
              variant="secondary"
              icon={Pencil}
              onPress={handleEdit}
              style={styles.actionButton}
            />
            <Button
              title="Delete"
              variant="danger"
              icon={Trash2}
              onPress={() => setConfirmDelete(true)}
              style={styles.actionButton}
            />
          </View>
        )}
      </ScrollView>

      <BottomSheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete transaction?">
        <View style={styles.sheetContent}>
          <Text variant="body" color="textSecondary">
            This moves the transaction to trash and updates your totals. You can
            restore it from this screen while it stays open elsewhere.
          </Text>
          <View style={styles.sheetActions}>
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => setConfirmDelete(false)}
              disabled={deleting}
            />
            <Button
              title="Delete"
              variant="danger"
              onPress={handleDelete}
              loading={deleting}
              disabled={deleting}
            />
          </View>
        </View>
      </BottomSheet>
    </AppScreen>
  );
}

function DetailRow({label, value}: {label: string; value: string}) {
  const {theme} = useTheme();
  return (
    <View
      style={[
        detailStyles.row,
        {gap: theme.spacing.md, paddingVertical: theme.spacing.xs},
      ]}>
      <Text variant="caption" color="textMuted" style={detailStyles.label}>
        {label}
      </Text>
      <Text variant="body" style={detailStyles.value}>
        {value}
      </Text>
    </View>
  );
}

const detailStyles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {flex: 2},
  value: {flex: 3},
});

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    content: {
      gap: theme.spacing.lg,
      paddingBottom: theme.spacing.xxxxl,
    },
    deletedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      padding: theme.spacing.md,
      backgroundColor: theme.colors.dangerSoft,
    },
    deletedText: {flex: 1},
    amountBlock: {
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    tagsBlock: {gap: theme.spacing.sm},
    tagsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    actions: {
      flexDirection: 'row',
      gap: theme.spacing.md,
    },
    actionButton: {flex: 1},
    sheetContent: {
      gap: theme.spacing.lg,
      paddingBottom: theme.spacing.md,
    },
    sheetActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: theme.spacing.md,
    },
  });
