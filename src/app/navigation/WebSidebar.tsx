import React, {useMemo} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import type {PressableStateCallbackType} from 'react-native';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {Plus, ShieldCheck} from 'lucide-react-native';

import {Text} from '../../design-system/components';
import {SIDEBAR_WIDTH} from '../../design-system/layout';
import {useTheme} from '../../design-system/theme';
import type {AppTheme} from '../../design-system/tokens';

/** react-native-web adds `hovered` to the Pressable state; RN types do not. */
type WebPressableState = PressableStateCallbackType & {hovered?: boolean};

/**
 * Desktop web navigation: the same five tabs as the phone bottom bar, laid
 * out as a left sidebar with the brand mark on top and a short privacy note
 * at the bottom. Used by RootTabs when the wide layout is active.
 */
export function WebSidebar({state, descriptors, navigation}: BottomTabBarProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.root} accessibilityRole="menubar" testID="web-sidebar">
      <View style={styles.brand}>
        <View style={styles.mark}>
          <Text variant="title" color="onPrimary" style={styles.markGlyph}>
            ₹
          </Text>
        </View>
        <View>
          <Text variant="title">PaisaFlow</Text>
          <Text variant="caption" color="textMuted">
            Web · offline-first
          </Text>
        </View>
      </View>

      <View style={styles.nav}>
        {state.routes.map((route, index) => {
          const {options} = descriptors[route.key];
          const focused = state.index === index;
          const isAdd = route.name === 'AddTab';
          const label =
            typeof options.title === 'string' ? options.title : route.name;
          const color = focused ? theme.colors.primary : theme.colors.textSecondary;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityLabel={isAdd ? 'Add transaction' : label}
              accessibilityState={{selected: focused}}
              onPress={onPress}
              style={({pressed, hovered}: WebPressableState) => [
                styles.item,
                isAdd && styles.addItem,
                focused && !isAdd && styles.itemActive,
                (pressed || hovered) && !focused && styles.itemHover,
              ]}>
              {isAdd ? (
                <View style={styles.addIcon}>
                  <Plus size={16} color={theme.colors.onPrimary} strokeWidth={2.6} />
                </View>
              ) : (
                options.tabBarIcon?.({focused, color, size: 20})
              )}
              <Text
                variant={focused || isAdd ? 'bodyMedium' : 'body'}
                color={isAdd ? 'textPrimary' : focused ? 'primary' : 'textSecondary'}>
                {isAdd ? 'Add transaction' : label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        <ShieldCheck size={16} color={theme.colors.success} />
        <Text variant="caption" color="textSecondary" style={styles.footerText}>
          Your data lives in this browser only. Nothing is uploaded.
        </Text>
      </View>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    root: {
      width: SIDEBAR_WIDTH,
      backgroundColor: theme.colors.surface,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: theme.colors.border,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.xl,
      gap: theme.spacing.xxl,
    },
    brand: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingHorizontal: theme.spacing.xs,
    },
    mark: {
      width: 40,
      height: 40,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    markGlyph: {lineHeight: 24},
    nav: {flex: 1, gap: theme.spacing.xs},
    item: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.md,
    },
    itemActive: {backgroundColor: theme.colors.primarySoft},
    itemHover: {backgroundColor: theme.colors.background},
    addItem: {
      marginTop: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceElevated,
    },
    addIcon: {
      width: 24,
      height: 24,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing.xs,
    },
    footerText: {flex: 1},
  });
