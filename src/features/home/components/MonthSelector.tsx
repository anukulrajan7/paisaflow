import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import {ChevronLeft, ChevronRight} from 'lucide-react-native';

import {IconButton, Text} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';

export interface MonthSelectorProps {
  label: string;
  /** False when the current cycle is shown (no future months). */
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  testID?: string;
}

/** Prev/next chevrons around the current budget-cycle month label. */
export function MonthSelector({
  label,
  canGoNext,
  onPrevious,
  onNext,
  testID,
}: MonthSelectorProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View testID={testID} style={styles.root}>
      <IconButton
        icon={ChevronLeft}
        onPress={onPrevious}
        accessibilityLabel="Previous month"
      />
      <Text
        variant="title"
        align="center"
        numberOfLines={1}
        style={styles.label}>
        {label}
      </Text>
      <IconButton
        icon={ChevronRight}
        onPress={onNext}
        disabled={!canGoNext}
        accessibilityLabel="Next month"
      />
    </View>
  );
}

const createStyles = (_theme: AppTheme) =>
  StyleSheet.create({
    root: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    label: {flex: 1},
  });
