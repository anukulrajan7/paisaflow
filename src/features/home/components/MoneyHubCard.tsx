import React, {useCallback, useMemo} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NavigatorScreenParams} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import {
  BadgeIndianRupee,
  HandCoins,
  PiggyBank,
  Repeat,
  TrendingUp,
  Wallet,
} from 'lucide-react-native';
import type {LucideIcon} from 'lucide-react-native';

import {Card, SectionHeader, Text} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {
  RootTabParamList,
  SettingsStackParamList,
} from '../../../app/navigation/types';
import {useMoneyHubBadges} from '../hooks/useMoneyHubBadges';

interface HubTile {
  screen: keyof SettingsStackParamList;
  label: string;
  icon: LucideIcon;
}

const TILES: ReadonlyArray<HubTile> = [
  {screen: 'People', label: 'People & money', icon: HandCoins},
  {screen: 'Salary', label: 'Salary', icon: BadgeIndianRupee},
  {screen: 'Investments', label: 'Investments', icon: TrendingUp},
  {screen: 'SavingsGoals', label: 'Savings goals', icon: PiggyBank},
  {screen: 'Recurring', label: 'Recurring', icon: Repeat},
  {screen: 'Accounts', label: 'Accounts', icon: Wallet},
];

function badgeCountFor(
  screen: keyof SettingsStackParamList,
  badges: {overdueLedgerCount: number; salaryUnconfirmed: boolean},
): number {
  if (screen === 'People') {
    return badges.overdueLedgerCount;
  }
  if (screen === 'Salary') {
    return badges.salaryUnconfirmed ? 1 : 0;
  }
  return 0;
}

/**
 * Home-screen shortcut grid into the phase-9 money hub (People, Salary,
 * Investments, Savings goals, Recurring, Accounts), which otherwise lives
 * only under Settings. Tiles carry small attention badges (overdue ledger
 * entries, unconfirmed salary) computed read-only by useMoneyHubBadges.
 */
export function MoneyHubCard(): React.JSX.Element {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation();
  const badges = useMoneyHubBadges();

  const openScreen = useCallback(
    (screen: keyof SettingsStackParamList) => {
      // All hub screens are param-less; the cast just collapses the
      // per-screen params union NavigatorScreenParams generates.
      const params = {screen} as NavigatorScreenParams<SettingsStackParamList>;
      navigation
        .getParent<BottomTabNavigationProp<RootTabParamList>>()
        ?.navigate('SettingsTab', params);
    },
    [navigation],
  );

  return (
    <View>
      <SectionHeader title="Money hub" />
      <Card style={styles.card} testID="money-hub-card">
        <View style={styles.grid}>
          {TILES.map(tile => {
            const badgeCount = badgeCountFor(tile.screen, badges);
            const Icon = tile.icon;
            return (
              <Pressable
                key={tile.screen}
                accessibilityRole="button"
                accessibilityLabel={
                  badgeCount > 0
                    ? `${tile.label}, ${badgeCount} ${
                        tile.screen === 'Salary' ? 'unconfirmed' : 'overdue'
                      }`
                    : tile.label
                }
                onPress={() => openScreen(tile.screen)}
                style={({pressed}) => [
                  styles.tile,
                  pressed && styles.tilePressed,
                ]}
                testID={`money-hub-tile-${tile.screen}`}>
                <View style={styles.tileIconWrap}>
                  <Icon size={20} color={theme.colors.primary} />
                </View>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {tile.label}
                </Text>
                {badgeCount > 0 ? (
                  <View style={styles.badge}>
                    <Text variant="caption" style={styles.badgeText}>
                      {badgeCount > 9 ? '9+' : badgeCount}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </Card>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    card: {marginTop: theme.spacing.sm},
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.md,
    },
    tile: {
      flexBasis: '45%',
      flexGrow: 1,
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.background,
    },
    tilePressed: {opacity: 0.85},
    tileIconWrap: {
      width: 36,
      height: 36,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
    },
    badge: {
      position: 'absolute',
      top: 2,
      right: 2,
      minWidth: 20,
      height: 20,
      paddingHorizontal: theme.spacing.xs,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.danger,
    },
    badgeText: {color: theme.colors.onPrimary},
  });
