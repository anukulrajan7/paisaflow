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
  Pencil,
  Search,
  SlidersHorizontal,
  Trash2,
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
  SelectField,
  Text,
  TransactionItem,
  useToast,
} from '../../../design-system/components';
import {getCategoryIcon} from '../../../design-system/icons';
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
import {queryTransactionPage} from '../services/transactionListService';
import {useEditTransactionStore} from '../store/editTransactionStore';
import {UndoToast} from '../components/UndoToast';

type Props = NativeStackScreenProps<TransactionsStackParamList, 'Transactions'>;

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 300;

const TYPE_FILTERS: ReadonlyArray<{
  value: TransactionType | null;
  label: string;
}> = [
  {value: null, label: 'All'},
  {value: 'expense', label: 'Expense'},
  {value: 'income', label: 'Income'},
  {value: 'transfer', label: 'Transfer'},
];

type RangePreset = 'all' | 'this_month' | 'last_month' | 'custom';

const RANGE_PRESETS: ReadonlyArray<{value: RangePreset; label: string}> = [
  {value: 'all', label: 'All time'},
  {value: 'this_month', label: 'This month'},
  {value: 'last_month', label: 'Last month'},
  {value: 'custom', label: 'Custom'},
];

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
  /** Custom range: inclusive day starts (epoch ms). */
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

  // Debounce free-text search.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const range = useMemo<{from?: number; to?: number}>(() => {
    if (rangePreset === 'this_month') {
      return {from: dayjs().startOf('month').valueOf()};
    }
    if (rangePreset === 'last_month') {
      const start = dayjs().subtract(1, 'month').startOf('month');
      return {from: start.valueOf(), to: start.add(1, 'month').valueOf()};
    }
    if (rangePreset === 'custom') {
      return {
        from: customFrom ?? undefined,
        to: customTo ? dayjs(customTo).add(1, 'day').valueOf() : undefined,
      };
    }
    return {};
  }, [rangePreset, customFrom, customTo]);

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

  const categoryOptions = useMemo(
    () =>
      categories
        .filter(category => !typeFilter || category.type === typeFilter)
        .map(category => ({value: category.id, label: category.name})),
    [categories, typeFilter],
  );
  const accountOptions = useMemo(
    () => accounts.map(account => ({value: account.id, label: account.name})),
    [accounts],
  );

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

  const activeFilterChips: Array<{key: string; label: string; clear: () => void}> = [];
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
  if (rangePreset !== 'all') {
    activeFilterChips.push({
      key: 'range',
      label: RANGE_PRESETS.find(preset => preset.value === rangePreset)?.label ?? 'Range',
      clear: () => setRangePreset('all'),
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
          <IconButton
            icon={SlidersHorizontal}
            onPress={() => setFilterSheetOpen(true)}
            accessibilityLabel="Open filters"
          />
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
        style={styles.chipsScroll}
        keyboardShouldPersistTaps="handled">
        {TYPE_FILTERS.map(option => (
          <Chip
            key={option.label}
            label={option.label}
            selected={typeFilter === option.value}
            onPress={() => {
              setTypeFilter(option.value);
              if (option.value === 'transfer') {
                setCategoryFilter(null);
              }
            }}
          />
        ))}
        {activeFilterChips.map(chip => (
          <Chip
            key={chip.key}
            label={`${chip.label} ✕`}
            selected
            onPress={chip.clear}
            accessibilityLabel={`Clear ${chip.label} filter`}
          />
        ))}
      </ScrollView>

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
        title="Filters">
        <View style={styles.sheetContent}>
          <View style={styles.field}>
            <Text variant="label" color="textSecondary" style={styles.fieldLabel}>
              DATE RANGE
            </Text>
            <View style={styles.chipsWrap}>
              {RANGE_PRESETS.map(preset => (
                <Chip
                  key={preset.value}
                  label={preset.label}
                  selected={rangePreset === preset.value}
                  onPress={() => {
                    setRangePreset(preset.value);
                    if (preset.value === 'custom') {
                      setCustomFrom(previous =>
                        previous ?? dayjs().startOf('month').valueOf(),
                      );
                      setCustomTo(previous =>
                        previous ?? dayjs().startOf('day').valueOf(),
                      );
                    }
                  }}
                />
              ))}
            </View>
          </View>
          {rangePreset === 'custom' ? (
            <View style={styles.dateRow}>
              <DateTimeField
                label="From"
                value={customFrom ?? dayjs().startOf('month').valueOf()}
                onChange={value =>
                  setCustomFrom(dayjs(value).startOf('day').valueOf())
                }
                containerStyle={styles.dateField}
              />
              <DateTimeField
                label="To"
                value={customTo ?? dayjs().startOf('day').valueOf()}
                onChange={value =>
                  setCustomTo(dayjs(value).startOf('day').valueOf())
                }
                containerStyle={styles.dateField}
              />
            </View>
          ) : null}
          {typeFilter !== 'transfer' ? (
            <SelectField
              label="Category"
              placeholder="All categories"
              value={categoryFilter}
              options={categoryOptions}
              onSelect={setCategoryFilter}
            />
          ) : null}
          <SelectField
            label="Account"
            placeholder="All accounts"
            value={accountFilter}
            options={accountOptions}
            onSelect={setAccountFilter}
          />
          <View style={styles.sheetActions}>
            <Button
              title="Clear all"
              variant="ghost"
              onPress={clearAllFilters}
              disabled={!hasActiveFilters}
            />
            <Button title="Done" onPress={() => setFilterSheetOpen(false)} />
          </View>
        </View>
      </BottomSheet>

      <BottomSheet
        visible={menuTx !== null}
        onClose={() => setMenuTx(null)}
        title={menuTx?.merchant ?? 'Transaction'}>
        <View style={styles.sheetContent}>
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
    chipsScroll: {flexGrow: 0},
    chipsRow: {
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    listWrap: {flex: 1},
    dayHeader: {marginTop: theme.spacing.sm},
    footerSpinner: {marginVertical: theme.spacing.lg},
    sheetContent: {
      gap: theme.spacing.lg,
      paddingBottom: theme.spacing.md,
    },
    field: {gap: theme.spacing.xs},
    fieldLabel: {textTransform: 'uppercase'},
    chipsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    dateRow: {
      flexDirection: 'row',
      gap: theme.spacing.md,
    },
    dateField: {flex: 1},
    sheetActions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: theme.spacing.md,
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
