import React from 'react';
import {Circle, Polygon, Rect} from 'react-native-svg';

import {useTheme} from '../theme';
import {IllustrationFrame} from './IllustrationFrame';
import type {IllustrationProps} from './types';

/** Blank receipt with a torn edge — no transactions yet. */
export function EmptyTransactionsIllustration(props: IllustrationProps) {
  const {theme} = useTheme();
  const {colors} = theme;

  return (
    <IllustrationFrame {...props}>
      <Polygon
        points="56,44 104,44 104,108 98,102 92,108 86,102 80,108 74,102 68,108 62,102 56,108"
        fill={colors.surface}
      />
      <Rect x={64} y={56} width={32} height={5} rx={2.5} fill={colors.border} />
      <Rect x={64} y={67} width={24} height={5} rx={2.5} fill={colors.border} />
      <Rect x={64} y={78} width={28} height={5} rx={2.5} fill={colors.border} />
      <Circle cx={80} cy={93} r={5} fill={colors.primary} />
    </IllustrationFrame>
  );
}
