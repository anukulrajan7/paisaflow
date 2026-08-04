import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';

import {Text} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {SalaryState} from '../types/salary';

type Tone = 'muted' | 'success' | 'warning' | 'danger';

const STATE_TONE: Record<SalaryState, Tone> = {
  expected: 'muted',
  credited: 'success',
  bonus: 'success',
  partial: 'warning',
  delayed: 'danger',
};

const STATE_LABEL: Record<SalaryState, string> = {
  expected: 'Expected',
  credited: 'Credited',
  bonus: 'Credited',
  partial: 'Partially received',
  delayed: 'Delayed',
};

export interface StatusPillProps {
  state: SalaryState;
  testID?: string;
}

/** Small semantic status badge for a salary period. */
export function StatusPill({state, testID}: StatusPillProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const tone = STATE_TONE[state];
  const backgroundColor =
    tone === 'success'
      ? theme.colors.successSoft
      : tone === 'warning'
        ? theme.colors.warningSoft
        : tone === 'danger'
          ? theme.colors.dangerSoft
          : theme.colors.surface;
  const color =
    tone === 'muted' ? theme.colors.textSecondary : theme.colors[tone];

  return (
    <View
      testID={testID}
      accessibilityLabel={`Status: ${STATE_LABEL[state]}`}
      style={[
        styles.pill,
        {backgroundColor, borderRadius: theme.radius.pill},
      ]}>
      <Text variant="label" style={{color}}>
        {STATE_LABEL[state]}
      </Text>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    pill: {
      alignSelf: 'flex-start',
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
  });
