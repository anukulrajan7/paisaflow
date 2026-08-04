import React from 'react';
import {Circle, Polygon, Rect} from 'react-native-svg';

import {useTheme} from '../theme';
import {IllustrationFrame} from './IllustrationFrame';
import type {IllustrationProps} from './types';

/** Overlapping basic shapes — no categories in this group yet. */
export function EmptyCategoriesIllustration(props: IllustrationProps) {
  const {theme} = useTheme();
  const {colors} = theme;

  return (
    <IllustrationFrame {...props}>
      <Rect x={86} y={58} width={26} height={26} rx={6} fill={colors.border} />
      <Circle cx={66} cy={70} r={15} fill={colors.primary} />
      <Polygon points="80,88 94,110 66,110" fill={colors.success} />
    </IllustrationFrame>
  );
}
