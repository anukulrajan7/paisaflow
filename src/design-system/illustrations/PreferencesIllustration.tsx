import React from 'react';
import {Circle, Rect} from 'react-native-svg';

import {useTheme} from '../theme';
import {IllustrationFrame} from './IllustrationFrame';
import type {IllustrationProps} from './types';

/** Three abstract sliders — onboarding preferences step. */
export function PreferencesIllustration(props: IllustrationProps) {
  const {theme} = useTheme();
  const {colors} = theme;

  return (
    <IllustrationFrame {...props}>
      <Rect x={40} y={56} width={80} height={6} rx={3} fill={colors.border} />
      <Rect x={40} y={77} width={80} height={6} rx={3} fill={colors.border} />
      <Rect x={40} y={98} width={80} height={6} rx={3} fill={colors.border} />
      <Circle
        cx={64}
        cy={59}
        r={9}
        fill={colors.primary}
        stroke={colors.surface}
        strokeWidth={3}
      />
      <Circle
        cx={98}
        cy={80}
        r={9}
        fill={colors.primary}
        stroke={colors.surface}
        strokeWidth={3}
      />
      <Circle
        cx={54}
        cy={101}
        r={9}
        fill={colors.primary}
        stroke={colors.surface}
        strokeWidth={3}
      />
    </IllustrationFrame>
  );
}
