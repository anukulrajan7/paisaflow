import React from 'react';
import {Circle, Path} from 'react-native-svg';

import {useTheme} from '../theme';
import {IllustrationFrame} from './IllustrationFrame';
import type {IllustrationProps} from './types';

/** Bell flanked by a small sun and moon — morning/evening reminders. */
export function RemindersIllustration(props: IllustrationProps) {
  const {theme} = useTheme();
  const {colors} = theme;

  return (
    <IllustrationFrame {...props}>
      <Circle cx={46} cy={52} r={9} fill={colors.textMuted} />
      <Circle cx={50} cy={49} r={8} fill={colors.primarySoft} />
      <Circle cx={114} cy={48} r={10} fill={colors.warning} />
      <Path
        d="M80 54 c-12 0 -19 9 -19 21 v13 l-6 10 h50 l-6 -10 v-13 c0 -12 -7 -21 -19 -21"
        fill={colors.primary}
      />
      <Circle cx={80} cy={103} r={5} fill={colors.primary} />
    </IllustrationFrame>
  );
}
