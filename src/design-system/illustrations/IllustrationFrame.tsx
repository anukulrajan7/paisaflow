import React from 'react';
import {View} from 'react-native';
import Svg, {Circle} from 'react-native-svg';

import {useTheme} from '../theme';
import type {IllustrationProps} from './types';

interface IllustrationFrameProps extends IllustrationProps {
  children?: React.ReactNode;
}

/**
 * Shared frame for spot illustrations: a soft tonal disc on which each motif
 * is drawn. Handles the accessibility contract — decorative by default, an
 * image with a label only when one is explicitly provided.
 */
export function IllustrationFrame({
  size = 160,
  accessibilityLabel,
  children,
}: IllustrationFrameProps) {
  const {theme} = useTheme();

  return (
    <View
      accessible={!!accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={
        accessibilityLabel ? 'auto' : 'no-hide-descendants'
      }
      style={{width: size, height: size}}>
      <Svg width={size} height={size} viewBox="0 0 160 160">
        <Circle cx={80} cy={80} r={64} fill={theme.colors.primarySoft} />
        {children}
      </Svg>
    </View>
  );
}
