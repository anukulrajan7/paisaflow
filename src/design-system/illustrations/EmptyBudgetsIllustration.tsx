import React from 'react';
import {Circle} from 'react-native-svg';

import {useTheme} from '../theme';
import {IllustrationFrame} from './IllustrationFrame';
import type {IllustrationProps} from './types';

/** Concentric target rings — no budgets set yet. */
export function EmptyBudgetsIllustration(props: IllustrationProps) {
  const {theme} = useTheme();
  const {colors} = theme;

  return (
    <IllustrationFrame {...props}>
      <Circle cx={80} cy={80} r={38} fill={colors.surface} />
      <Circle cx={80} cy={80} r={26} fill={colors.primary} />
      <Circle cx={80} cy={80} r={14} fill={colors.surface} />
      <Circle cx={80} cy={80} r={5} fill={colors.primary} />
    </IllustrationFrame>
  );
}
