import React from 'react';
import {Circle, Path, Rect} from 'react-native-svg';

import {useTheme} from '../../../design-system/theme';
import {IllustrationFrame} from '../../../design-system/illustrations/IllustrationFrame';
import type {IllustrationProps} from '../../../design-system/illustrations/types';

/** Padlock — app-lock screens (lock gate + app-lock settings). */
export function LockIllustration(props: IllustrationProps) {
  const {theme} = useTheme();
  const {colors} = theme;

  return (
    <IllustrationFrame {...props}>
      {/* shackle */}
      <Path
        d="M62 80 v-12 a18 18 0 0 1 36 0 v12"
        stroke={colors.primary}
        strokeWidth={7}
        strokeLinecap="round"
        fill="none"
      />
      {/* body */}
      <Rect x={50} y={78} width={60} height={46} rx={10} fill={colors.primary} />
      {/* keyhole */}
      <Circle cx={80} cy={95} r={6} fill={colors.surface} />
      <Rect x={77} y={97} width={6} height={13} rx={3} fill={colors.surface} />
    </IllustrationFrame>
  );
}
