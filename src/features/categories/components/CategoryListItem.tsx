import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import {Archive, ArchiveRestore, Pencil} from 'lucide-react-native';

import {
  CategoryIcon,
  IconButton,
  Text,
} from '../../../design-system/components';
import {getCategoryIcon} from '../../../design-system/icons';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {Category} from '../../../database/types';

export interface CategoryListItemProps {
  category: Category;
  /** Shown only for custom categories (system categories cannot be renamed). */
  onEdit?: (category: Category) => void;
  onToggleArchive: (category: Category) => void;
  testID?: string;
}

/** One category row: tinted icon, name, system/archived flags, actions. */
export function CategoryListItem({
  category,
  onEdit,
  onToggleArchive,
  testID,
}: CategoryListItemProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const flags: string[] = [];
  if (category.isSystem) {
    flags.push('System');
  }
  if (category.isArchived) {
    flags.push('Archived');
  }

  return (
    <View testID={testID} style={styles.row}>
      <View style={category.isArchived && styles.dimmed}>
        <CategoryIcon
          icon={getCategoryIcon(category.icon)}
          color={category.color}
          size={40}
        />
      </View>
      <View style={[styles.info, category.isArchived && styles.dimmed]}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {category.name}
        </Text>
        {flags.length > 0 ? (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {flags.join(' · ')}
          </Text>
        ) : null}
      </View>
      {onEdit ? (
        <IconButton
          icon={Pencil}
          onPress={() => onEdit(category)}
          accessibilityLabel={`Edit ${category.name}`}
          iconSize={20}
        />
      ) : null}
      <IconButton
        icon={category.isArchived ? ArchiveRestore : Archive}
        onPress={() => onToggleArchive(category)}
        accessibilityLabel={
          category.isArchived
            ? `Unarchive ${category.name}`
            : `Archive ${category.name}`
        }
        iconSize={20}
      />
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    row: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    info: {flex: 1, gap: theme.spacing.xs},
    dimmed: {opacity: 0.55},
  });
