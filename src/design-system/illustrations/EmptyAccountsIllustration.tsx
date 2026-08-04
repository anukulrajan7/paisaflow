import React from 'react';
import {Rect} from 'react-native-svg';

import {useTheme} from '../theme';
import {IllustrationFrame} from './IllustrationFrame';
import type {IllustrationProps} from './types';

/** Two stacked cards — no accounts added yet. */
export function EmptyAccountsIllustration(props: IllustrationProps) {
  const {theme} = useTheme();
  const {colors} = theme;

  return (
    <IllustrationFrame {...props}>
      <Rect x={52} y={58} width={60} height={38} rx={8} fill={colors.border} />
      <Rect x={48} y={76} width={64} height={40} rx={8} fill={colors.primary} />
      <Rect x={58} y={86} width={14} height={10} rx={2} fill={colors.surface} />
      <Rect x={58} y={102} width={26} height={4} rx={2} fill={colors.surface} />
    </IllustrationFrame>
  );
}
