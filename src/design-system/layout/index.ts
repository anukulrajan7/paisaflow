import {useWindowDimensions} from 'react-native';

import {isWeb} from '../../platform';

/**
 * Responsive layout primitives for the web target. On phones the app is
 * full-screen exactly as on Android; from WIDE_BREAKPOINT up (web only) the
 * tab bar becomes a left sidebar and screen content is capped at a readable
 * column width instead of stretching across a desktop monitor.
 */
export const WIDE_BREAKPOINT = 1024;

/** Max width of a screen's content column on wide web layouts. */
export const CONTENT_MAX_WIDTH = 760;

/** Max width of sheets/dialogs on wide web layouts. */
export const SHEET_MAX_WIDTH = 560;

export const SIDEBAR_WIDTH = 248;

/** True when the wide (sidebar) web layout should be used. */
export function useIsWideLayout(): boolean {
  const {width} = useWindowDimensions();
  return isWeb && width >= WIDE_BREAKPOINT;
}
