import React from 'react';
import {Path, Polygon, Rect} from 'react-native-svg';

import {useTheme} from '../theme';
import {IllustrationFrame} from './IllustrationFrame';
import type {IllustrationProps} from './types';

/** Message bubble with a check — nothing left to review. */
export function EmptyReviewIllustration(props: IllustrationProps) {
  const {theme} = useTheme();
  const {colors} = theme;

  return (
    <IllustrationFrame {...props}>
      <Rect x={48} y={52} width={64} height={44} rx={12} fill={colors.surface} />
      <Polygon points="60,94 60,110 76,94" fill={colors.surface} />
      <Path
        d="M65 74 l10 10 l20 -20"
        stroke={colors.success}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </IllustrationFrame>
  );
}
