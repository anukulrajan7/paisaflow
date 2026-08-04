import React, {useCallback, useMemo, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {ArrowLeft, Plus, Shapes} from 'lucide-react-native';

import {
  AppHeader,
  AppScreen,
  Chip,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  SectionHeader,
  SegmentedControl,
  Text,
  useToast,
} from '../../../design-system/components';
import type {SegmentedOption} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {SettingsStackParamList} from '../../../app/navigation/types';
import type {Category, CategoryType} from '../../../database/types';
import {CategoryFormSheet} from '../components/CategoryFormSheet';
import {CategoryListItem} from '../components/CategoryListItem';
import {
  useCategories,
  useCategoryMutations,
} from '../hooks/useCategories';

type Props = NativeStackScreenProps<SettingsStackParamList, 'Categories'>;

const TYPE_OPTIONS: ReadonlyArray<SegmentedOption<CategoryType>> = [
  {value: 'expense', label: 'Expense'},
  {value: 'income', label: 'Income'},
];

/** Category management: browse by type, add custom categories, archive any. */
export function CategoriesScreen({navigation}: Props) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();

  const [type, setType] = useState<CategoryType>('expense');
  const [showArchived, setShowArchived] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);

  const {categories, loading, error, reload} = useCategories(type);
  const {setCategoryArchived} = useCategoryMutations();

  const active = useMemo(
    () => (categories ?? []).filter(category => !category.isArchived),
    [categories],
  );
  const archived = useMemo(
    () => (categories ?? []).filter(category => category.isArchived),
    [categories],
  );

  const openCreate = useCallback(() => {
    setEditing(null);
    setSheetVisible(true);
  }, []);

  const openEdit = useCallback((category: Category) => {
    setEditing(category);
    setSheetVisible(true);
  }, []);

  const closeSheet = useCallback(() => setSheetVisible(false), []);

  const handleToggleArchive = useCallback(
    async (category: Category) => {
      try {
        await setCategoryArchived(category.id, !category.isArchived);
        showToast(
          category.isArchived
            ? `${category.name} restored`
            : `${category.name} archived`,
          {type: 'success'},
        );
      } catch {
        showToast('Could not update the category.', {type: 'error'});
      }
    },
    [setCategoryArchived, showToast],
  );

  const renderItem = (category: Category, isLast: boolean) => (
    <View key={category.id}>
      <CategoryListItem
        category={category}
        onEdit={category.isSystem ? undefined : openEdit}
        onToggleArchive={handleToggleArchive}
        testID={`category-item-${category.id}`}
      />
      {isLast ? null : <Divider />}
    </View>
  );

  let content: React.ReactNode;
  if (loading) {
    content = <LoadingState message="Loading categories…" />;
  } else if (error) {
    content = (
      <ErrorState
        title="Couldn't load categories"
        message={error}
        onRetry={reload}
      />
    );
  } else {
    content = (
      <ScrollView
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled">
        {active.length === 0 ? (
          <EmptyState
            icon={Shapes}
            title={`No ${type} categories`}
            message="Create a custom category to organise your transactions."
            actionLabel="Add category"
            onAction={openCreate}
          />
        ) : (
          active.map((category, index) =>
            renderItem(category, index === active.length - 1),
          )
        )}
        {showArchived ? (
          <>
            <SectionHeader title="Archived" style={styles.archivedHeader} />
            {archived.length === 0 ? (
              <Text variant="caption" color="textMuted">
                No archived categories.
              </Text>
            ) : (
              archived.map((category, index) =>
                renderItem(category, index === archived.length - 1),
              )
            )}
          </>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <AppScreen>
      <AppHeader
        title="Categories"
        left={
          <IconButton
            icon={ArrowLeft}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
          />
        }
        right={
          <IconButton
            icon={Plus}
            onPress={openCreate}
            accessibilityLabel="Add category"
          />
        }
      />
      <View style={styles.controls}>
        <SegmentedControl
          options={TYPE_OPTIONS}
          value={type}
          onChange={setType}
          accessibilityLabel="Category type"
          testID="categories-type"
        />
        <View style={styles.toggleRow}>
          <Chip
            label="Show archived"
            selected={showArchived}
            onPress={() => setShowArchived(current => !current)}
            testID="categories-show-archived"
          />
        </View>
      </View>
      {content}
      <CategoryFormSheet
        visible={sheetVisible}
        onClose={closeSheet}
        editing={editing}
        initialType={type}
      />
    </AppScreen>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    controls: {
      paddingHorizontal: theme.spacing.lg,
      gap: theme.spacing.md,
      paddingBottom: theme.spacing.sm,
    },
    toggleRow: {flexDirection: 'row', justifyContent: 'flex-end'},
    listContent: {
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.xxl,
    },
    archivedHeader: {marginTop: theme.spacing.lg},
  });
