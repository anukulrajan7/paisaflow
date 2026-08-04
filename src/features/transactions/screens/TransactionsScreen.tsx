import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {
  ArrowLeftRight,
  Inbox,
  Pencil,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react-native';

import {
  AppHeader,
  AppScreen,
  BottomSheet,
  Button,
  Chip,
  DateTimeField,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  LoadingState,
  SectionHeader,
  SegmentedControl,
  Text,
  TransactionItem,
  useToast,
} from '../../../design-system/components';
import type {SegmentedOption} from '../../../design-system/components';
import {getCategoryIcon} from '../../../design-system/icons';
import {EmptyTransactionsIllustration} from '../../../design-system/illustrations';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import {
  getAccountsRepository,
  getCategoriesRepository,
  getTransactionsRepository,
} from '../../../database/repositories';
import type {
  Account,
  Category,
  Transaction,
  TransactionType,
} from '../../../database/types';
import {useDataVersionStore, bumpDataVersion} from '../../../store/dataVersionStore';
import {dayjs} from '../../../utils/date';
import type {
  RootTabParamList,
  TransactionsStackParamList,
} from '../../../app/navigation/types';
import {
  countTransactions,
  queryTransactionPage,
} from '../services/transactionListService';
import {useEditTransactionStore} from '../store/editTransactionStore';
import {UndoToast} from '../components/UndoToast';

type Props = NativeStackScreenProps<TransactionsStackParamList, 'Transactions'>;

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 300;
const COUNT_DEBOUNCE_MS = 250;
/** Category grid gets a search field above this many options. */
const CATEGORY_SEARCH_THRESHOLD = 8;

type TypeFilterValue = 'all' | TransactionType;

const TYPE_OPTIONS: ReadonlyArray<SegmentedOption<TypeFilterValue>> = [
  {value: 'all', label: 'All'},
  {value: 'expense', label: 'Expense'},
  {value: 'income', label: 'Income'},
  {value: 'transfer', label: 'Transfer'},
];

type RangePreset = 'all' | 'today' | 'this_week' | 'this_month' | 'custom';

const RANGE_PRESETS: ReadonlyArray<{value: RangePreset; label: string}> = [
  {value: 'all', label: 'All time'},
  {value: 'today', label: 'Today'},
  {value: 'this_week', label: 'This week'},
  {value: 'this_month', label: 'This month'},
  {value: 'custom', label: 'Custom'},
];

interface FilterDraft {
  type: TransactionType | null;
  categoryId: string | null;
  accountId: string | null;
  rangePreset: RangePreset;
  /** Custom range: inclusive day starts (epoch ms). */
  customFrom: number | null;
  customTo: number | null;
}

const EMPTY_DRAFT: FilterDraft = {
  type: null,
  categoryId: null,
  accountId: null,
  rangePreset: 'all',
  customFrom: null,
  customTo: null,
};

type ListRow =
  | {key: string; kind: 'header'; label: string}
  | {key: string; kind: 'transaction'; transaction: Transaction};

function dayHeaderLabel(epochMs: number): string {
  const day = dayjs(epochMs);
  if (day.isSame(dayjs(), 'day')) {
    return 'Today';
  }
  if (day.isSame(dayjs().subtract(1, 'day'), 'day')) {
    return 'Yesterday';
  }
  return day.format('dddd, D MMM YYYY');
}

/** Resolved date bounds for a preset (`to` is exclusive). */
function rangeForPreset(
  preset: RangePreset,
  customFrom: number | null,
  customTo: number | null,
): {from?: number; to?: number} {
  switch (preset) {
    case 'today': {
      const start = dayjs().startOf('day');
      return {from: start.valueOf(), to: start.add(1, 'day').valueOf()};
    }
    case 'this_week': {
      const start = dayjs().startOf('week');
      return {from: start.valueOf(), to: start.add(1, 'week').valueOf()};
    }
    case 'this_month': {
      const start = dayjs().startOf('month');
      return {from: start.valueOf(), to: start.add(1, 'month').valueOf()};
    }
    case 'custom':
      return {
        from: customFrom ?? undefined,
        to: customTo ? dayjs(customTo).add(1, 'day').valueOf() : undefined,
      };
    default:
      return {};
  }
}

export function TransactionsScreen({navigation}: Props) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();
  const dataVersion = useDataVersionStore(state => state.dataVersion);
  const startEditing = useEditTransactionStore(state => state.startEditing);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TransactionType | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const [rangePreset, setRangePreset] = useState<RangePreset>('all');
  const [customFrom, setCustomFrom] = useState<number | null>(null);
  const [customTo, setCustomTo] = useState<number | null>(null);

  const [items, setItems] = useState<Transaction[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const loadedOnceRef = useRef(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [menuTx, setMenuTx] = useState<Transaction | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);

  // Filter sheet draft: staged edits until Apply, plus its result preview.
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_DRAFT);
  const [categoryQuery, setCategoryQuery] = useState('');
  const [resultCount, setResultCount] = useState<number | null>(null);
  const countRequestRef = useRef(0);

  // Debounce free-text search.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const range = useMemo(
    () => rangeForPreset(rangePreset, customFrom, customTo),
    [rangePreset, customFrom, customTo],
  );

  const query = useMemo(
    () => ({
      search,
      type: typeFilter ?? undefined,
      categoryId: categoryFilter ?? undefined,
      accountId: accountFilter ?? undefined,
      from: range.from,
      to: range.to,
    }),
    [search, typeFilter, categoryFilter, accountFilter, range],
  );

  const refresh = useCallback(async () => {
    if (!loadedOnceRef.current) {
      setInitialLoading(true);
    }
    try {
      const page = await queryTransactionPage({
        ...query,
        limit: PAGE_SIZE,
        offset: 0,
      });
      setItems(page);
      setHasMore(page.length === PAGE_SIZE);
      setError(false);
      loadedOnceRef.current = true;
    } catch {
      setError(true);
    } finally {
      setInitialLoading(false);
    }
  }, [query]);

  useEffect(() => {
    refresh();
  }, [refresh, dataVersion]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || error) {
      return;
    }
    setLoadingMore(true);
    try {
      const page = await queryTransactionPage({
        ...query,
        limit: PAGE_SIZE,
        offset: items.length,
      });
      setItems(previous => [...previous, ...page]);
      setHasMore(page.length === PAGE_SIZE);
    } catch {
      showToast('Could not load more transactions', {type: 'error'});
    } finally {
      setLoadingMore(false);
    }
  }, [query, items.length, loadingMore, hasMore, error, showToast]);

  // Reference data for row labels/icons (archived included so old rows resolve).
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getCategoriesRepository().listCategories({includeArchived: true}),
      getAccountsRepository().listAccounts({includeArchived: true}),
    ])
      .then(([cats, accs]) => {
        if (!cancelled) {
          setCategories(cats);
          setAccounts(accs);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [dataVersion]);

  const categoryMap = useMemo(
    () => new Map(categories.map(category => [category.id, category])),
    [categories],
  );
  const accountMap = useMemo(
    () => new Map(accounts.map(account => [account.id, account])),
    [accounts],
  );

  const rows = useMemo<ListRow[]>(() => {
    const out: ListRow[] = [];
    let lastDayKey = '';
    for (const tx of items) {
      const dayKey = dayjs(tx.occurredAt).format('YYYY-MM-DD');
      if (dayKey !== lastDayKey) {
        lastDayKey = dayKey;
        out.push({
          key: `header-${dayKey}`,
          kind: 'header',
          label: dayHeaderLabel(tx.occurredAt),
        });
      }
      out.push({key: tx.id, kind: 'transaction', transaction: tx});
    }
    return out;
  }, [items]);

  const openDetails = useCallback(
    (id: string) => navigation.navigate('TransactionDetails', {transactionId: id}),
    [navigation],
  );

  const handleEdit = useCallback(
    (tx: Transaction) => {
      setMenuTx(null);
      startEditing(tx.id);
      navigation
        .getParent<BottomTabNavigationProp<RootTabParamList>>()
        ?.navigate('AddTab', {screen: 'AddTransaction'});
    },
    [navigation, startEditing],
  );

  const handleDelete = useCallback(
    async (tx: Transaction) => {
      setMenuTx(null);
      try {
        await getTransactionsRepository().softDeleteTransaction(tx.id);
        bumpDataVersion();
        setUndoId(tx.id);
      } catch {
        showToast('Could not delete transaction', {type: 'error'});
      }
    },
    [showToast],
  );

  const handleUndo = useCallback(async () => {
    if (!undoId) {
      return;
    }
    const id = undoId;
    setUndoId(null);
    try {
      await getTransactionsRepository().restoreTransaction(id);
      bumpDataVersion();
      showToast('Transaction restored', {type: 'success'});
    } catch {
      showToast('Could not restore transaction', {type: 'error'});
    }
  }, [undoId, showToast]);

  const hasActiveFilters =
    typeFilter !== null ||
    categoryFilter !== null ||
    accountFilter !== null ||
    rangePreset !== 'all';

  const clearAllFilters = useCallback(() => {
    setTypeFilter(null);
    setCategoryFilter(null);
    setAccountFilter(null);
    setRangePreset('all');
    setCustomFrom(null);
    setCustomTo(null);
  }, []);

  // --- Filter sheet draft handling ----------------------------------------

  const draftHasFilters =
    draft.type !== null ||
    draft.categoryId !== null ||
    draft.accountId !== null ||
    draft.rangePreset !== 'all';

  const draftRange = useMemo(
    () => rangeForPreset(draft.rangePreset, draft.customFrom, draft.customTo),
    [draft.rangePreset, draft.customFrom, draft.customTo],
  );

  const draftRangeInvalid =
    draft.rangePreset === 'custom' &&
    draft.customFrom !== null &&
    draft.customTo !== null &&
    draft.customFrom > draft.customTo;

  const openFilterSheet = useCallback(() => {
    setDraft({
      type: typeFilter,
      categoryId: categoryFilter,
      accountId: accountFilter,
      rangePreset,
      customFrom,
      customTo,
    });
    setCategoryQuery('');
    setResultCount(null);
    setFilterSheetOpen(true);
  }, [typeFilter, categoryFilter, accountFilter, rangePreset, customFrom, customTo]);

  const applyDraft = useCallback(() => {
    setTypeFilter(draft.type);
    setCategoryFilter(draft.type === 'transfer' ? null : draft.categoryId);
    setAccountFilter(draft.accountId);
    setRangePreset(draft.rangePreset);
    setCustomFrom(draft.customFrom);
    setCustomTo(draft.customTo);
    setFilterSheetOpen(false);
  }, [draft]);

  const resetDraft = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    setCategoryQuery('');
  }, []);

  const handleDraftType = useCallback(
    (value: TypeFilterValue) => {
      setDraft(previous => {
        const type = value === 'all' ? null : value;
        let categoryId = previous.categoryId;
        // Transfers have no category; a type switch also drops a category
        // that only exists on the other type.
        if (type === 'transfer') {
          categoryId = null;
        } else if (type && categoryId) {
          const category = categoryMap.get(categoryId);
          if (category && category.type !== type) {
            categoryId = null;
          }
        }
        return {...previous, type, categoryId};
      });
    },
    [categoryMap],
  );

  const handleDraftPreset = useCallback((preset: RangePreset) => {
    setDraft(previous => {
      if (preset !== 'custom') {
        return {...previous, rangePreset: preset};
      }
      // Seed sensible bounds so the date fields never start empty.
      return {
        ...previous,
        rangePreset: 'custom',
        customFrom: previous.customFrom ?? dayjs().startOf('month').valueOf(),
        customTo: previous.customTo ?? dayjs().startOf('day').valueOf(),
      };
    });
  }, []);

  const toggleDraftCategory = useCallback((categoryId: string) => {
    setDraft(previous => ({
      ...previous,
      categoryId: previous.categoryId === categoryId ? null : categoryId,
    }));
  }, []);

  const toggleDraftAccount = useCallback((accountId: string) => {
    setDraft(previous => ({
      ...previous,
      accountId: previous.accountId === accountId ? null : accountId,
    }));
  }, []);

  const draftCategories = useMemo(
    () =>
      categories.filter(
        category => !draft.type || category.type === draft.type,
      ),
    [categories, draft.type],
  );

  const visibleDraftCategories = useMemo(() => {
    const term = categoryQuery.trim().toLowerCase();
    if (!term) {
      return draftCategories;
    }
    return draftCategories.filter(category =>
      category.name.toLowerCase().includes(term),
    );
  }, [draftCategories, categoryQuery]);

  // Live result preview for the apply button (committed search included, so
  // the count matches what the list will show).
  useEffect(() => {
    if (!filterSheetOpen || draftRangeInvalid) {
      return;
    }
    const requestId = ++countRequestRef.current;
    const timer = setTimeout(() => {
      countTransactions({
        search,
        type: draft.type ?? undefined,
        categoryId: draft.categoryId ?? undefined,
        accountId: draft.accountId ?? undefined,
        from: draftRange.from,
        to: draftRange.to,
      })
        .then(count => {
          if (countRequestRef.current === requestId) {
            setResultCount(count);
          }
        })
        .catch(() => undefined);
    }, COUNT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filterSheetOpen, draft, draftRange, draftRangeInvalid, search]);

  const applyLabel =
    resultCount === null || draftRangeInvalid
      ? 'Apply filters'
      : `Show ${resultCount} ${resultCount === 1 ? 'result' : 'results'}`;

  // --- List rendering ------------------------------------------------------

  const renderRow = ({item}: {item: ListRow}) => {
    if (item.kind === 'header') {
      return <SectionHeader title={item.label} style={styles.dayHeader} />;
    }
    const tx = item.transaction;
    const category = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
    const account = accountMap.get(tx.accountId);
    const destination = tx.destinationAccountId
      ? accountMap.get(tx.destinationAccountId)
      : undefined;
    const time = dayjs(tx.occurredAt).format('h:mm A');
    const title =
      tx.merchant ??
      category?.name ??
      (tx.type === 'transfer' ? 'Transfer' : 'Uncategorized');
    const subtitle =
      tx.type === 'transfer'
        ? `${account?.name ?? 'Account'} → ${destination?.name ?? 'Account'} · ${time}`
        : `${account?.name ?? 'Account'} · ${time}`;
    return (
      <TransactionItem
        title={title}
        subtitle={subtitle}
        amountMinor={tx.amountMinor}
        type={tx.type}
        currency={tx.currency}
        categoryIcon={
          tx.type === 'transfer'
            ? ArrowLeftRight
            : getCategoryIcon(category?.icon)
        }
        categoryColor={
          tx.type === 'transfer' ? theme.colors.textSecondary : category?.color
        }
        onPress={() => openDetails(tx.id)}
        onLongPress={() => setMenuTx(tx)}
        accessibilityLabel={`${title}, ${subtitle}`}
      />
    );
  };

  const renderFooter = () => {
    if (!loadingMore) {
      return null;
    }
    return (
      <ActivityIndicator
        color={theme.colors.primary}
        style={styles.footerSpinner}
      />
    );
  };

  // Removable summary chips under the search bar — the committed filters.
  const activeFilterChips: Array<{key: string; label: string; clear: () => void}> = [];
  if (typeFilter) {
    activeFilterChips.push({
      key: 'type',
      label: TYPE_OPTIONS.find(option => option.value === typeFilter)?.label ?? 'Type',
      clear: () => setTypeFilter(null),
    });
  }
  if (rangePreset !== 'all') {
    const label =
      rangePreset === 'custom'
        ? customFrom && customTo
          ? `${dayjs(customFrom).format('D MMM')} – ${dayjs(customTo).format('D MMM')}`
          : 'Custom range'
        : RANGE_PRESETS.find(preset => preset.value === rangePreset)?.label ?? 'Range';
    activeFilterChips.push({
      key: 'range',
      label,
      clear: () => setRangePreset('all'),
    });
  }
  if (categoryFilter) {
    activeFilterChips.push({
      key: 'category',
      label: categoryMap.get(categoryFilter)?.name ?? 'Category',
      clear: () => setCategoryFilter(null),
    });
  }
  if (accountFilter) {
    activeFilterChips.push({
      key: 'account',
      label: accountMap.get(accountFilter)?.name ?? 'Account',
      clear: () => setAccountFilter(null),
    });
  }

  let body: React.ReactNode;
  if (initialLoading && items.length === 0) {
    body = <LoadingState message="Loading transactions" />;
  } else if (error && items.length === 0) {
    body = (
      <ErrorState
        message="Could not load transactions."
        onRetry={refresh}
      />
    );
  } else {
    body = (
      <FlatList
        data={rows}
        renderItem={renderRow}
        keyExtractor={row => row.key}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={
          <EmptyState
            illustration={<EmptyTransactionsIllustration />}
            title={search || hasActiveFilters ? 'No matches' : 'No transactions yet'}
            message={
              search || hasActiveFilters
                ? 'Try a different search or clear the filters.'
                : 'Add your first transaction with the + button below.'
            }
            actionLabel={search || hasActiveFilters ? 'Clear filters' : undefined}
            onAction={
              search || hasActiveFilters
                ? () => {
                    setSearchInput('');
                    clearAllFilters();
                  }
                : undefined
            }
          />
        }
        showsVerticalScrollIndicator={false}
      />
    );
  }

  return (
    <AppScreen padded>
      <AppHeader
        title="Transactions"
        right={
          <View style={styles.headerActions}>
            <IconButton
              icon={Inbox}
              onPress={() => navigation.navigate('ExpenseReview')}
              accessibilityLabel="Open detected expense review inbox"
            />
            <View>
              <IconButton
                icon={SlidersHorizontal}
                onPress={openFilterSheet}
                accessibilityLabel="Open filters"
              />
              {hasActiveFilters ? (
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={[
                    styles.filterDot,
                    {backgroundColor: theme.colors.primary},
                  ]}
                />
              ) : null}
            </View>
          </View>
        }
      />
      <Input
        placeholder="Search merchant, note or category"
        value={searchInput}
        onChangeText={setSearchInput}
        leftIcon={Search}
        accessibilityLabel="Search transactions"
        autoCapitalize="none"
        returnKeyType="search"
        containerStyle={styles.search}
      />
      {activeFilterChips.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          style={styles.chipsScroll}
          keyboardShouldPersistTaps="handled">
          {activeFilterChips.map(chip => (
            <Chip
              key={chip.key}
              label={chip.label}
              icon={X}
              selected
              onPress={chip.clear}
              accessibilityLabel={`Clear ${chip.label} filter`}
            />
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.listWrap}>{body}</View>

      <UndoToast
        visible={undoId !== null}
        message="Transaction deleted"
        onUndo={handleUndo}
        onDismiss={() => setUndoId(null)}
      />

      <BottomSheet
        visible={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        title="Filters"
        maxHeightFraction={0.9}
        footer={
          <View style={styles.sheetFooter}>
            <Button
              title="Reset all"
              variant="ghost"
              onPress={resetDraft}
              disabled={!draftHasFilters}
            />
            <Button
              title={applyLabel}
              onPress={applyDraft}
              disabled={draftRangeInvalid}
              style={styles.applyButton}
            />
          </View>
        }>
        <View style={styles.sheetContent}>
          <View style={styles.sheetSection}>
            <Text
              variant="label"
              color="textSecondary"
              style={styles.sheetLabel}>
              Type
            </Text>
            <SegmentedControl<TypeFilterValue>
              options={TYPE_OPTIONS}
              value={draft.type ?? 'all'}
              onChange={handleDraftType}
              accessibilityLabel="Filter by type"
            />
          </View>

          <View style={styles.sheetSection}>
            <Text
              variant="label"
              color="textSecondary"
              style={styles.sheetLabel}>
              Date range
            </Text>
            <View style={styles.chipsWrap}>
              {RANGE_PRESETS.map(preset => (
                <Chip
                  key={preset.value}
                  label={preset.label}
                  selected={draft.rangePreset === preset.value}
                  onPress={() => handleDraftPreset(preset.value)}
                />
              ))}
            </View>
            {draft.rangePreset === 'custom' ? (
              <View style={styles.dateSection}>
                <View style={styles.dateRow}>
                  <DateTimeField
                    label="From"
                    value={draft.customFrom ?? dayjs().startOf('month').valueOf()}
                    onChange={value =>
                      setDraft(previous => ({
                        ...previous,
                        customFrom: dayjs(value).startOf('day').valueOf(),
                      }))
                    }
                    containerStyle={styles.dateField}
                  />
                  <DateTimeField
                    label="To"
                    value={draft.customTo ?? dayjs().startOf('day').valueOf()}
                    onChange={value =>
                      setDraft(previous => ({
                        ...previous,
                        customTo: dayjs(value).startOf('day').valueOf(),
                      }))
                    }
                    containerStyle={styles.dateField}
                  />
                </View>
                {draftRangeInvalid ? (
                  <Text variant="caption" color="danger">
                    Start date is after the end date.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>

          {draft.type !== 'transfer' ? (
            <View style={styles.sheetSection}>
              <Text
                variant="label"
                color="textSecondary"
                style={styles.sheetLabel}>
                Category
              </Text>
              {draftCategories.length > CATEGORY_SEARCH_THRESHOLD ? (
                <Input
                  placeholder="Search categories"
                  value={categoryQuery}
                  onChangeText={setCategoryQuery}
                  leftIcon={Search}
                  accessibilityLabel="Search categories"
                  autoCapitalize="none"
                  returnKeyType="search"
                />
              ) : null}
              {visibleDraftCategories.length > 0 ? (
                <View style={styles.chipsWrap}>
                  {visibleDraftCategories.map(category => (
                    <Chip
                      key={category.id}
                      label={category.name}
                      icon={getCategoryIcon(category.icon)}
                      iconColor={category.color}
                      selected={draft.categoryId === category.id}
                      onPress={() => toggleDraftCategory(category.id)}
                    />
                  ))}
                </View>
              ) : (
                <Text variant="caption" color="textMuted">
                  No categories match your search.
                </Text>
              )}
            </View>
          ) : null}

          <View style={styles.sheetSection}>
            <Text
              variant="label"
              color="textSecondary"
              style={styles.sheetLabel}>
              Account
            </Text>
            <View style={styles.chipsWrap}>
              {accounts.map(account => (
                <Chip
                  key={account.id}
                  label={account.name}
                  selected={draft.accountId === account.id}
                  onPress={() => toggleDraftAccount(account.id)}
                />
              ))}
            </View>
          </View>
        </View>
      </BottomSheet>

      <BottomSheet
        visible={menuTx !== null}
        onClose={() => setMenuTx(null)}
        title={menuTx?.merchant ?? 'Transaction'}>
        <View style={styles.menuContent}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit transaction"
            onPress={() => menuTx && handleEdit(menuTx)}
            style={({pressed}) => [styles.menuRow, pressed && styles.pressed]}>
            <Pencil size={18} color={theme.colors.textSecondary} />
            <Text variant="body">Edit</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete transaction"
            onPress={() => menuTx && handleDelete(menuTx)}
            style={({pressed}) => [styles.menuRow, pressed && styles.pressed]}>
            <Trash2 size={18} color={theme.colors.danger} />
            <Text variant="body" color="danger">
              Delete
            </Text>
          </Pressable>
        </View>
      </BottomSheet>
    </AppScreen>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    search: {marginBottom: theme.spacing.sm},
    headerActions: {flexDirection: 'row', gap: theme.spacing.xs},
    filterDot: {
      position: 'absolute',
      top: theme.spacing.sm,
      right: theme.spacing.sm,
      width: 8,
      height: 8,
      borderRadius: theme.radius.pill,
    },
    chipsScroll: {flexGrow: 0},
    chipsRow: {
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    listWrap: {flex: 1},
    dayHeader: {marginTop: theme.spacing.sm},
    footerSpinner: {marginVertical: theme.spacing.lg},
    sheetContent: {
      gap: theme.spacing.xl,
      paddingTop: theme.spacing.xs,
      paddingBottom: theme.spacing.lg,
    },
    sheetSection: {gap: theme.spacing.sm},
    sheetLabel: {textTransform: 'uppercase'},
    chipsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    dateSection: {gap: theme.spacing.xs},
    dateRow: {
      flexDirection: 'row',
      gap: theme.spacing.md,
    },
    dateField: {flex: 1},
    sheetFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
    },
    applyButton: {flex: 1},
    menuContent: {
      gap: theme.spacing.xs,
      paddingBottom: theme.spacing.md,
    },
    menuRow: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.radius.sm,
    },
    pressed: {opacity: 0.7},
  });
