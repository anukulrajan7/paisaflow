import React from 'react';
import {Switch as RNSwitch} from 'react-native';
import type {SwitchProps as RNSwitchProps} from 'react-native';

import {useTheme} from '../theme';
import {isWeb} from '../../platform';

export type SwitchProps = RNSwitchProps;

/**
 * Themed toggle. Defaults the track/thumb colors to design tokens so call
 * sites only pass `value`/`onValueChange`. On web, react-native-web styles
 * the "on" thumb with `activeThumbColor` (RN's `thumbColor` only covers the
 * off state there), so we forward the resolved on-color to keep the accent
 * consistent across platforms.
 */
export function Switch({
  value,
  trackColor,
  thumbColor,
  ...rest
}: SwitchProps) {
  const {theme} = useTheme();
  const resolvedTrack = trackColor ?? {
    false: theme.colors.border,
    true: theme.colors.primarySoft,
  };
  const resolvedThumb =
    thumbColor ?? (value ? theme.colors.primary : theme.colors.textMuted);
  const webProps = isWeb ? {activeThumbColor: theme.colors.primary} : {};

  return (
    <RNSwitch
      value={value}
      trackColor={resolvedTrack}
      thumbColor={resolvedThumb}
      {...webProps}
      {...rest}
    />
  );
}
