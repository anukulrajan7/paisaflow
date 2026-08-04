import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';

import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import {Text} from '../../../design-system/components';

export interface StepProgressProps {
  /** Zero-based index of the current step. */
  step: number;
  total: number;
}

/** Segmented progress bar with a text label so progress isn't color-only. */
export function StepProgress({step, total}: StepProgressProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.root}>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={`Step ${step + 1} of ${total}`}
        accessibilityValue={{min: 1, max: total, now: step + 1}}
        style={styles.track}>
        {Array.from({length: total}, (_, index) => (
          <View
            key={index}
            style={[
              styles.segment,
              {
                backgroundColor:
                  index <= step ? theme.colors.primary : theme.colors.border,
                borderRadius: theme.radius.pill,
              },
            ]}
          />
        ))}
      </View>
      <Text variant="caption" color="textMuted">
        Step {step + 1} of {total}
      </Text>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    root: {
      gap: theme.spacing.sm,
    },
    track: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    segment: {
      flex: 1,
      height: 4,
    },
  });
