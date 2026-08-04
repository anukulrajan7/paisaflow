import React from 'react';
import {Circle, Path, Rect} from 'react-native-svg';

import {useTheme} from '../theme';
import {IllustrationFrame} from './IllustrationFrame';
import type {IllustrationProps} from './types';

/** Wallet with a gentle inflow arc — onboarding welcome. */
export function WelcomeIllustration(props: IllustrationProps) {
  const {theme} = useTheme();
  const {colors} = theme;

  return (
    <IllustrationFrame {...props}>
      <Path
        d="M54 54 a32 32 0 0 1 52 0"
        stroke={colors.success}
        strokeWidth={5}
        strokeLinecap="round"
        fill="none"
      />
      <Rect x={44} y={66} width={72} height={50} rx={10} fill={colors.primary} />
      <Rect x={88} y={82} width={28} height={18} rx={9} fill={colors.surface} />
      <Circle cx={97} cy={91} r={4} fill={colors.primary} />
    </IllustrationFrame>
  );
}
