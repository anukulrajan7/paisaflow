import React from 'react';
import {Path, Rect} from 'react-native-svg';

import {useTheme} from '../theme';
import {IllustrationFrame} from './IllustrationFrame';
import type {IllustrationProps} from './types';

/** Small bar chart with a sprout on the tallest bar — no insights yet. */
export function EmptyInsightsIllustration(props: IllustrationProps) {
  const {theme} = useTheme();
  const {colors} = theme;

  return (
    <IllustrationFrame {...props}>
      <Rect x={52} y={80} width={14} height={24} rx={4} fill={colors.primary} />
      <Rect x={73} y={68} width={14} height={36} rx={4} fill={colors.primary} />
      <Rect x={94} y={56} width={14} height={48} rx={4} fill={colors.primary} />
      <Path
        d="M101 56 v-8"
        stroke={colors.success}
        strokeWidth={4}
        strokeLinecap="round"
        fill="none"
      />
      <Path d="M101 48 q-11 -1 -13 -13 q11 1 13 13" fill={colors.success} />
      <Path d="M101 48 q11 -1 13 -13 q-11 1 -13 13" fill={colors.success} />
    </IllustrationFrame>
  );
}
