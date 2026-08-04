import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  FlatList,
  Linking,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {
  ArrowLeft,
  Check,
  ClipboardPaste,
  MailQuestion,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react-native';

import {
  AmountText,
  AppHeader,
  AppScreen,
  BottomSheet,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  LoadingState,
  Text,
  useToast,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {TransactionsStackParamList} from '../../../app/navigation/types';
import {getCategoriesRepository} from '../../../database/repositories';
import type {Category} from '../../../database/types';
import {useDataVersionStore} from '../../../store/dataVersionStore';
import {dayjs} from '../../../utils/date';
import {hasSmsPermission, requestSmsPermission} from '../../../services/sms';
import type {DetectedExpense} from '../services/detectedExpensesRepository';
import {getDetectedExpensesRepository} from '../services/detectedExpensesRepository';
import {
  approveDetectedExpense,
  dismissDetectedExpense,
  importManualText,
  isAutoScanOnOpenEnabled,
  scanSmsInbox,
} from '../services/trackingService';

type Props = NativeStackScreenProps<TransactionsStackParamList, 'ExpenseReview'>;

/**
 * Review inbox for auto-detected expenses. Pending SMS/manual parses are
 * staged here; approving creates a real transaction, dismissing drops it.
 */
export function ExpenseReviewScreen({navigation}: Props) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();
  const dataVersion = useDataVersionStore(state => state.dataVersion);

  const [permission, setPermission] = useState<boolean | null>(null);
  const [items, setItems] = useState<DetectedExpense[]>([]);
  const [categories, setCategories] = useState<Map<string, Category>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasting, setPasting] = useState(false);
  const autoScanDoneRef = useRef(false);

  const refreshPermission = useCallback(async () => {
    setPermission(await hasSmsPermission());
  }, []);

  const load = useCallback(async () => {
    try {
      const [pending, cats] = await Promise.all([
        getDetectedExpensesRepository().listPending(),
        getCategoriesRepository().listCategories({includeArchived: true}),
      ]);
      setItems(pending);
      setCategories(new Map(cats.map(category => [category.id, category])));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshPermission();
    load();
  }, [refreshPermission, load, dataVersion]);

  const runScan = useCallback(async (): Promise<boolean> => {
    const granted = await hasSmsPermission();
    setPermission(granted);
    if (!granted) {
      return false;
    }
    const result = await scanSmsInbox();
    await load();
    if (result.inserted > 0) {
      showToast(
        `Found ${result.inserted} new transaction${result.inserted === 1 ? '' : 's'}`,
        {type: 'success'},
      );
    } else if (result.scanned > 0) {
      showToast('No new transactions found', {type: 'info'});
    }
    return true;
  }, [load, showToast]);

  // Optional auto-scan: once per visit when the setting is on.
  useFocusEffect(
    useCallback(() => {
      if (autoScanDoneRef.current) {
        return;
      }
      autoScanDoneRef.current = true;
      (async () => {
        if (await isAutoScanOnOpenEnabled()) {
          await runScan();
        }
      })().catch(() => undefined);
    }, [runScan]),
  );

  const handleAllowSms = useCallback(async () => {
    const granted = await requestSmsPermission();
    setPermission(granted);
    if (granted) {
      await runScan();
    } else {
      showToast(
        'SMS access denied. You can enable it later in system settings, or paste messages manually.',
        {type: 'error', duration: 5000},
      );
    }
  }, [runScan, showToast]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await runScan();
    } finally {
      setRefreshing(false);
    }
  }, [runScan]);

  const handleApprove = useCallback(
    async (item: DetectedExpense) => {
      setBusyId(item.id);
      try {
        await approveDetectedExpense(item);
        setItems(previous => previous.filter(row => row.id !== item.id));
        showToast('Transaction added', {type: 'success'});
      } catch {
        showToast('Could not add transaction', {type: 'error'});
      } finally {
        setBusyId(null);
      }
    },
    [showToast],
  );

  const handleDismiss = useCallback(
    async (item: DetectedExpense) => {
      setBusyId(item.id);
      try {
        await dismissDetectedExpense(item);
        setItems(previous => previous.filter(row => row.id !== item.id));
      } catch {
        showToast('Could not dismiss item', {type: 'error'});
      } finally {
        setBusyId(null);
      }
    },
    [showToast],
  );

  const handlePasteImport = useCallback(async () => {
    const text = pasteText.trim();
    if (!text) {
      return;
    }
    setPasting(true);
    try {
      const result = await importManualText(text);
      if (result === 'inserted') {
        showToast('Message added to the review list', {type: 'success'});
        setPasteText('');
        setPasteOpen(false);
        await load();
      } else if (result === 'duplicate') {
        showToast('That message is already in the list', {type: 'info'});
      } else {
        showToast(
          'No transaction found in that text — it needs an amount and a debit/credit keyword.',
          {type: 'error', duration: 5000},
        );
      }
    } catch {
      showToast('Could not import message', {type: 'error'});
    } finally {
      setPasting(false);
    }
  }, [pasteText, load, showToast]);

  const renderItem = ({item}: {item: DetectedExpense}) => {
    const category = item.categoryId ? categories.get(item.categoryId) : undefined;
    const type = item.direction === 'debit' ? 'expense' : 'income';
    return (
      <Card style={styles.itemCard}>
        <View style={styles.itemHeader}>
          <View style={styles.itemTitleWrap}>
            <Text variant="bodyMedium" numberOfLines={1}>
              {item.merchant ?? 'Unknown merchant'}
            </Text>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {dayjs(item.occurredAt).format('D MMM YYYY, h:mm A')}
              {item.accountHint ? ` · A/c XX${item.accountHint}` : ''}
            </Text>
          </View>
          <AmountText amountMinor={item.amountMinor} type={type} size="body" />
        </View>
        <View style={styles.itemMeta}>
          <Chip label={category?.name ?? 'Uncategorized'} />
          <Chip
            label={item.source === 'sms' ? 'SMS' : 'Pasted'}
            accessibilityLabel={
              item.source === 'sms' ? 'Detected from SMS' : 'Pasted manually'
            }
          />
        </View>
        <View style={styles.itemActions}>
          <Button
            title="Approve"
            size="sm"
            icon={Check}
            loading={busyId === item.id}
            disabled={busyId !== null}
            onPress={() => handleApprove(item)}
            accessibilityLabel={`Approve ${item.merchant ?? 'transaction'}`}
            style={styles.actionButton}
          />
          <Button
            title="Dismiss"
            size="sm"
            variant="ghost"
            icon={X}
            disabled={busyId !== null}
            onPress={() => handleDismiss(item)}
            accessibilityLabel={`Dismiss ${item.merchant ?? 'transaction'}`}
            style={styles.actionButton}
          />
        </View>
      </Card>
    );
  };

  const backButton = (
    <IconButton
      icon={ArrowLeft}
      onPress={() => navigation.goBack()}
      accessibilityLabel="Go back"
    />
  );

  let body: React.ReactNode;
  if (loading) {
    body = <LoadingState message="Loading review inbox" />;
  } else if (error) {
    body = (
      <ErrorState message="Could not load detected expenses." onRetry={load} />
    );
  } else if (permission === false) {
    body = (
      <View style={styles.permissionWrap}>
        <EmptyState
          icon={ShieldCheck}
          title="SMS access is off"
          message={
            'PaisaFlow can read bank and UPI alerts to suggest transactions. ' +
            'Everything is parsed on this device — messages never leave your phone. ' +
            'You can also paste messages manually, no permission needed.'
          }
          actionLabel="Allow SMS access"
          onAction={handleAllowSms}
        />
        <Button
          title="Open system settings"
          variant="ghost"
          onPress={() => Linking.openSettings()}
          accessibilityHint="Opens Android app settings to enable SMS permission"
        />
      </View>
    );
  } else {
    body = (
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
            accessibilityLabel="Scan SMS inbox"
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon={MailQuestion}
            title="Nothing to review"
            message={
              'Pull down to scan your SMS inbox, or paste a bank message manually.'
            }
            actionLabel="Scan SMS inbox"
            onAction={handleRefresh}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    );
  }

  return (
    <AppScreen>
      <AppHeader
        title="Review detected"
        subtitle="Approve to add as transactions"
        left={backButton}
        right={
          <View style={styles.headerActions}>
            <IconButton
              icon={ClipboardPaste}
              onPress={() => setPasteOpen(true)}
              accessibilityLabel="Paste a bank message"
            />
            <IconButton
              icon={RefreshCw}
              onPress={handleRefresh}
              accessibilityLabel="Scan SMS inbox"
            />
          </View>
        }
      />
      <View style={styles.body}>{body}</View>

      <BottomSheet
        visible={pasteOpen}
        onClose={() => setPasteOpen(false)}
        title="Paste a bank message">
        <View style={styles.pasteSheet}>
          <Text variant="body" color="textSecondary">
            Paste any bank email or SMS text (transaction alerts only — not
            OTPs). It is parsed on this device and added to the review list.
          </Text>
          <Input
            label="Message text"
            value={pasteText}
            onChangeText={setPasteText}
            placeholder="e.g. Rs.1,234.00 debited from A/c XX1234 at SWIGGY…"
            multiline
            numberOfLines={5}
            autoCapitalize="none"
            inputStyle={styles.pasteInput}
            testID="paste-message-input"
          />
          <Button
            title="Parse message"
            fullWidth
            loading={pasting}
            disabled={!pasteText.trim()}
            onPress={handlePasteImport}
          />
        </View>
      </BottomSheet>
    </AppScreen>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    headerActions: {flexDirection: 'row', gap: theme.spacing.xs},
    body: {flex: 1},
    listContent: {
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.xxxxl,
      gap: theme.spacing.md,
      flexGrow: 1,
    },
    itemCard: {gap: theme.spacing.md},
    itemHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.spacing.md,
    },
    itemTitleWrap: {flex: 1, gap: 2},
    itemMeta: {flexDirection: 'row', gap: theme.spacing.sm},
    itemActions: {flexDirection: 'row', gap: theme.spacing.sm},
    actionButton: {flex: 1},
    permissionWrap: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.lg,
      gap: theme.spacing.md,
    },
    pasteSheet: {gap: theme.spacing.lg, paddingBottom: theme.spacing.md},
    pasteInput: {minHeight: 120, textAlignVertical: 'top'},
  });
