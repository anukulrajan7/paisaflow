import React, {useMemo} from 'react';
import {Pressable, StyleSheet} from 'react-native';
import {Archive, ArchiveRestore, Pencil, Star} from 'lucide-react-native';
import type {LucideIcon} from 'lucide-react-native';

import {BottomSheet, Text} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {Account} from '../../../database/types';

export interface AccountActionsSheetProps {
  account: Account | null;
  onClose: () => void;
  onEdit: (account: Account) => void;
  onSetDefault: (account: Account) => void;
  onToggleArchived: (account: Account) => void;
}

interface Action {
  key: string;
  label: string;
  icon: LucideIcon;
  onPress: () => void;
}

/** Per-account action menu: edit, set default, archive/unarchive. */
export function AccountActionsSheet({
  account,
  onClose,
  onEdit,
  onSetDefault,
  onToggleArchived,
}: AccountActionsSheetProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (!account) {
    return null;
  }

  const actions: Action[] = [
    {
      key: 'edit',
      label: 'Edit details',
      icon: Pencil,
      onPress: () => onEdit(account),
    },
  ];
  if (!account.isDefault && !account.isArchived) {
    actions.push({
      key: 'default',
      label: 'Set as default',
      icon: Star,
      onPress: () => onSetDefault(account),
    });
  }
  actions.push(
    account.isArchived
      ? {
          key: 'unarchive',
          label: 'Unarchive',
          icon: ArchiveRestore,
          onPress: () => onToggleArchived(account),
        }
      : {
          key: 'archive',
          label: 'Archive',
          icon: Archive,
          onPress: () => onToggleArchived(account),
        },
  );

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={account.name}
      maxHeightFraction={0.5}>
      {actions.map(action => {
        const Icon = action.icon;
        return (
          <Pressable
            key={action.key}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={action.onPress}
            style={({pressed}) => [
              styles.action,
              {borderRadius: theme.radius.sm},
              pressed && styles.pressed,
            ]}>
            <Icon size={18} color={theme.colors.textSecondary} />
            <Text variant="body">{action.label}</Text>
          </Pressable>
        );
      })}
    </BottomSheet>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    action: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingHorizontal: theme.spacing.sm,
    },
    pressed: {opacity: 0.8},
  });
