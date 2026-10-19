import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import {
  ArrowLeft,
  Check,
  ClipboardPaste,
  History,
  MailQuestion,
  RefreshCw,
  ShieldCheck,
  Sparkles,
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
import {supportsSmsInbox} from '../../../platform';
import {ProviderError} from '../../../services/openrouter';
import type {AiProviderErrorKind} from '../../../services/openrouter';
import {friendlyMessageFor} from '../../ai-summary/hooks/useAiInsight';
import type {DetectedExpense} from '../services/detectedExpensesRepository';
import {getDetectedExpensesRepository} from '../services/detectedExpensesRepository';
import {hasAiApiKey} from '../services/aiGate';
import {getSavingsHint} from '../services/aiSavingsHint';
import {
  HISTORY_SCAN_CAP,
  approveDetectedExpense,
  createHistoryScanState,
  dismissDetectedExpense,
  importManualText,
  importManualTextWithAi,
  isAutoScanOnOpenEnabled,
  reanalyzeDetectedExpenseWithAi,
  scanOlderSmsBatch,
  scanSmsInbox,
} from '../services/trackingService';

type Props = NativeStackScreenProps<TransactionsStackParamList, 'ExpenseReview'>;

/** Low-confidence / AI-parsed markers stored inside the staged parsedJson. */
function parsedFlags(parsedJson: string): {
  lowConfidence: boolean;
  aiParsed: boolean;
} {
  try {
    const parsed = JSON.parse(parsedJson) as {
      confidence?: string;
      aiParsed?: boolean;
    };
    return {
      lowConfidence: parsed.confidence === 'low',
      aiParsed: parsed.aiParsed === true,
    };
  } catch {
    return {lowConfidence: false, aiParsed: false};
  }
}

function friendlyAiError(error: unknown): string {
  const kind: AiProviderErrorKind =
    error instanceof ProviderError ? error.kind : 'unknown';
  return friendlyMessageFor(kind);
}

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

  // Full history scan ('Scan older messages').
  const historyStateRef = useRef(createHistoryScanState());
  const [historyScanning, setHistoryScanning] = useState(false);
  const [historyNote, setHistoryNote] = useState<string | null>(null);
  const [historyDone, setHistoryDone] = useState(false);

  // AI availability: a key in the keychain + connectivity. Checked on focus;
  // AI buttons stay visible and explain themselves when gated.
  const [aiKeyPresent, setAiKeyPresent] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [aiBusyId, setAiBusyId] = useState<string | null>(null);
  const [aiError, setAiError] = useState<{id: string; message: string} | null>(null);
  const [pasteAiOffered, setPasteAiOffered] = useState(false);
  const [pasteAiBusy, setPasteAiBusy] = useState(false);
  const [pasteAiError, setPasteAiError] = useState<string | null>(null);

  // AI savings hint (session-cached in the service).
  const [hintBusy, setHintBusy] = useState(false);
  const [hintSuggestions, setHintSuggestions] = useState<string[] | null>(null);
  const [hintError, setHintError] = useState<string | null>(null);

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

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected !== false);
    });
    return unsubscribe;
  }, []);

  // Re-check the keychain on every focus — the user may have just added a key.
  useFocusEffect(
    useCallback(() => {
      hasAiApiKey()
        .then(setAiKeyPresent)
        .catch(() => setAiKeyPresent(false));
    }, []),
  );

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
    setPasteAiError(null);
    try {
      const result = await importManualText(text);
      if (result === 'inserted') {
        showToast('Message added to the review list', {type: 'success'});
        setPasteText('');
        setPasteOpen(false);
        setPasteAiOffered(false);
        await load();
      } else if (result === 'duplicate') {
        showToast('That message is already in the list', {type: 'info'});
      } else {
        // Regex found nothing — offer the per-item AI fallback inline.
        setPasteAiOffered(true);
      }
    } catch {
      showToast('Could not import message', {type: 'error'});
    } finally {
      setPasting(false);
    }
  }, [pasteText, load, showToast]);

  const handleScanOlder = useCallback(async () => {
    if (historyScanning || historyDone) {
      return;
    }
    setHistoryScanning(true);
    try {
      const result = await scanOlderSmsBatch(historyStateRef.current, fetched => {
        setHistoryNote(
          `Scanning… ${fetched} of up to ${HISTORY_SCAN_CAP} messages covered`,
        );
      });
      await load();
      setHistoryDone(result.exhausted || result.capReached);
      if (result.fetchedTotal === 0 && !result.exhausted) {
        return; // No SMS permission — the permission view handles messaging.
      }
      if (result.exhausted) {
        setHistoryNote('Reached the oldest message in your inbox.');
      } else if (result.capReached) {
        setHistoryNote(
          `Scan limit reached (${HISTORY_SCAN_CAP} messages). Older messages are not scanned.`,
        );
      } else {
        setHistoryNote(
          `Scanned ${result.fetchedTotal} of up to ${HISTORY_SCAN_CAP} messages.`,
        );
      }
      if (result.inserted > 0) {
        showToast(
          `Found ${result.inserted} new transaction${result.inserted === 1 ? '' : 's'}`,
          {type: 'success'},
        );
      }
    } catch {
      showToast('Could not scan older messages', {type: 'error'});
    } finally {
      setHistoryScanning(false);
    }
  }, [historyScanning, historyDone, load, showToast]);

  const handleAnalyze = useCallback(
    async (item: DetectedExpense) => {
      setAiError(null);
      // Gate: explain instead of calling when AI is unavailable.
      if (!isOnline) {
        setAiError({id: item.id, message: friendlyMessageFor('offline')});
        return;
      }
      if (!aiKeyPresent) {
        setAiError({id: item.id, message: friendlyMessageFor('missing_key')});
        return;
      }
      setAiBusyId(item.id);
      try {
        const result = await reanalyzeDetectedExpenseWithAi(item);
        if (result === 'updated') {
          showToast('AI analysis applied — check the details', {type: 'success'});
          await load();
        } else {
          setAiError({
            id: item.id,
            message: 'AI could not find a transaction in this message.',
          });
        }
      } catch (analysisError) {
        setAiError({id: item.id, message: friendlyAiError(analysisError)});
      } finally {
        setAiBusyId(null);
      }
    },
    [aiKeyPresent, isOnline, load, showToast],
  );

  const handlePasteAi = useCallback(async () => {
    const text = pasteText.trim();
    if (!text) {
      return;
    }
    setPasteAiError(null);
    if (!isOnline) {
      setPasteAiError(friendlyMessageFor('offline'));
      return;
    }
    if (!aiKeyPresent) {
      setPasteAiError(friendlyMessageFor('missing_key'));
      return;
    }
    setPasteAiBusy(true);
    try {
      const result = await importManualTextWithAi(text);
      if (result === 'inserted') {
        showToast('Message added to the review list', {type: 'success'});
        setPasteText('');
        setPasteOpen(false);
        setPasteAiOffered(false);
        await load();
      } else if (result === 'duplicate') {
        showToast('That message is already in the list', {type: 'info'});
      } else {
        setPasteAiError('AI could not find a transaction in that text.');
      }
    } catch (analysisError) {
      setPasteAiError(friendlyAiError(analysisError));
    } finally {
      setPasteAiBusy(false);
    }
  }, [pasteText, aiKeyPresent, isOnline, load, showToast]);

  const handleHint = useCallback(async () => {
    setHintError(null);
    setHintBusy(true);
    try {
      const result = await getSavingsHint();
      setHintSuggestions(result.suggestions);
    } catch (hintFetchError) {
      setHintError(friendlyAiError(hintFetchError));
    } finally {
      setHintBusy(false);
    }
  }, []);

  const renderItem = ({item}: {item: DetectedExpense}) => {
    const category = item.categoryId ? categories.get(item.categoryId) : undefined;
    const type = item.direction === 'debit' ? 'expense' : 'income';
    const flags = parsedFlags(item.parsedJson);
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
          {flags.aiParsed ? (
            <Chip
              label="AI parsed"
              icon={Sparkles}
              accessibilityLabel="Parsed with AI"
            />
          ) : null}
          {flags.lowConfidence && !flags.aiParsed ? (
            <Chip
              label="Uncertain"
              accessibilityLabel="Low parsing confidence"
            />
          ) : null}
        </View>
        {aiError?.id === item.id ? (
          <Text variant="caption" color="danger">
            {aiError.message}
          </Text>
        ) : null}
        <View style={styles.itemActions}>
          <Button
            title="Approve"
            size="sm"
            icon={Check}
            loading={busyId === item.id}
            disabled={busyId !== null || aiBusyId !== null}
            onPress={() => handleApprove(item)}
            accessibilityLabel={`Approve ${item.merchant ?? 'transaction'}`}
            style={styles.actionButton}
          />
          <Button
            title="Dismiss"
            size="sm"
            variant="ghost"
            icon={X}
            disabled={busyId !== null || aiBusyId !== null}
            onPress={() => handleDismiss(item)}
            accessibilityLabel={`Dismiss ${item.merchant ?? 'transaction'}`}
            style={styles.actionButton}
          />
          {flags.lowConfidence && !flags.aiParsed ? (
            <Button
              title="Analyze with AI"
              size="sm"
              variant="ghost"
              icon={Sparkles}
              loading={aiBusyId === item.id}
              disabled={busyId !== null || aiBusyId !== null}
              onPress={() => handleAnalyze(item)}
              accessibilityLabel={`Analyze ${item.merchant ?? 'transaction'} with AI`}
              style={styles.actionButton}
            />
          ) : null}
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

  // Subtle one-line AI savings hint, offered once approvals/loading settle.
  const hintHeader =
    aiKeyPresent && isOnline && !loading && busyId === null ? (
      <View style={styles.hintWrap}>
        {hintSuggestions ? (
          <Card style={styles.hintCard}>
            <View style={styles.hintTitleRow}>
              <Sparkles size={14} color={theme.colors.primary} />
              <Text variant="bodyMedium">Saving suggestions for this week</Text>
            </View>
            {hintSuggestions.map((suggestion, index) => (
              <Text key={index} variant="body" color="textSecondary">
                {`• ${suggestion}`}
              </Text>
            ))}
          </Card>
        ) : (
          <Pressable
            onPress={handleHint}
            disabled={hintBusy}
            accessibilityRole="button"
            accessibilityLabel="Ask AI for saving suggestions"
            style={styles.hintLink}>
            <Sparkles size={14} color={theme.colors.textSecondary} />
            <Text variant="caption" color="textSecondary">
              {hintBusy ? 'Asking AI…' : 'Ask AI for saving suggestions'}
            </Text>
          </Pressable>
        )}
        {hintError ? (
          <Text variant="caption" color="danger">
            {hintError}
          </Text>
        ) : null}
      </View>
    ) : null;

  const historyFooter = (
    <View style={styles.footer}>
      {historyNote ? (
        <Text variant="caption" color="textSecondary" align="center">
          {historyNote}
        </Text>
      ) : null}
      {!historyDone ? (
        <Button
          title="Scan older messages"
          variant="ghost"
          icon={History}
          loading={historyScanning}
          disabled={refreshing}
          onPress={handleScanOlder}
          accessibilityLabel="Scan older SMS messages"
        />
      ) : null}
    </View>
  );

  let body: React.ReactNode;
  if (loading) {
    body = <LoadingState message="Loading review inbox" />;
  } else if (error) {
    body = (
      <ErrorState message="Could not load detected expenses." onRetry={load} />
    );
  } else if (permission === false && supportsSmsInbox) {
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
        ListHeaderComponent={hintHeader}
        ListFooterComponent={supportsSmsInbox ? historyFooter : null}
        refreshControl={
          supportsSmsInbox ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
              accessibilityLabel="Scan SMS inbox"
            />
          ) : undefined
        }
        ListEmptyComponent={
          supportsSmsInbox ? (
            <EmptyState
              icon={MailQuestion}
              title="Nothing to review"
              message={
                'Pull down to scan your SMS inbox, or paste a bank message manually.'
              }
              actionLabel="Scan SMS inbox"
              onAction={handleRefresh}
            />
          ) : (
            <EmptyState
              icon={ClipboardPaste}
              title="Paste a bank alert"
              message={
                'SMS scanning needs the Android app. Here you can paste the text of a bank SMS or email alert — it is parsed in this browser and never uploaded.'
              }
              actionLabel="Paste a message"
              onAction={() => setPasteOpen(true)}
            />
          )
        }
        showsVerticalScrollIndicator={false}
      />
    );
  }

  return (
    <AppScreen>
      <AppHeader
        title="Review detected"
        subtitle={
          supportsSmsInbox
            ? 'Approve to add as transactions'
            : 'Pasted alerts — approve to add as transactions'
        }
        left={backButton}
        right={
          <View style={styles.headerActions}>
            <IconButton
              icon={ClipboardPaste}
              onPress={() => setPasteOpen(true)}
              accessibilityLabel="Paste a bank message"
            />
            {supportsSmsInbox ? (
              <IconButton
                icon={RefreshCw}
                onPress={handleRefresh}
                accessibilityLabel="Scan SMS inbox"
              />
            ) : null}
          </View>
        }
      />
      <View style={styles.body}>{body}</View>

      <BottomSheet
        visible={pasteOpen}
        onClose={() => {
          setPasteOpen(false);
          setPasteAiOffered(false);
          setPasteAiError(null);
        }}
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
          {pasteAiOffered ? (
            <View style={styles.pasteAiWrap}>
              <Text variant="caption" color="textSecondary">
                The on-device parser found no transaction in that text. You can
                send this one message to the AI assistant for extraction — it
                leaves your device only when you tap the button below.
              </Text>
              <Button
                title="Analyze with AI"
                variant="secondary"
                icon={Sparkles}
                fullWidth
                loading={pasteAiBusy}
                onPress={handlePasteAi}
                accessibilityLabel="Analyze pasted message with AI"
              />
              {pasteAiError ? (
                <Text variant="caption" color="danger">
                  {pasteAiError}
                </Text>
              ) : null}
            </View>
          ) : null}
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
    itemMeta: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    itemActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    actionButton: {flexGrow: 1},
    hintWrap: {gap: theme.spacing.sm},
    hintLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.xs,
      minHeight: 44,
    },
    hintCard: {gap: theme.spacing.sm},
    hintTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    footer: {gap: theme.spacing.sm, paddingTop: theme.spacing.md},
    pasteAiWrap: {gap: theme.spacing.md},
    permissionWrap: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.lg,
      gap: theme.spacing.md,
    },
    pasteSheet: {gap: theme.spacing.lg, paddingBottom: theme.spacing.md},
    pasteInput: {minHeight: 120, textAlignVertical: 'top'},
  });
