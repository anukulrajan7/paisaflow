import React, {useMemo} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import type {BottomTabBarButtonProps} from '@react-navigation/bottom-tabs';
import {ChartPie, House, Plus, Receipt, Settings} from 'lucide-react-native';

import {useTheme} from '../../design-system/theme';
import type {AppTheme} from '../../design-system/tokens';
import {
  AddStackNavigator,
  HomeStackNavigator,
  InsightsStackNavigator,
  SettingsStackNavigator,
  TransactionsStackNavigator,
} from './stacks';
import type {RootTabParamList} from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

const TAB_ICON_SIZE = 22;

interface TabIconProps {
  color: string;
  focused: boolean;
}

const renderHouseIcon = ({color, focused}: TabIconProps) => (
  <House size={TAB_ICON_SIZE} color={color} strokeWidth={focused ? 2.4 : 2} />
);
const renderReceiptIcon = ({color, focused}: TabIconProps) => (
  <Receipt size={TAB_ICON_SIZE} color={color} strokeWidth={focused ? 2.4 : 2} />
);
const renderChartPieIcon = ({color, focused}: TabIconProps) => (
  <ChartPie size={TAB_ICON_SIZE} color={color} strokeWidth={focused ? 2.4 : 2} />
);
const renderSettingsIcon = ({color, focused}: TabIconProps) => (
  <Settings size={TAB_ICON_SIZE} color={color} strokeWidth={focused ? 2.4 : 2} />
);
const renderEmptyLabel = () => null;
const renderAddButton = (props: BottomTabBarButtonProps) => (
  <AddTabButton {...props} />
);

/**
 * Prominent center "Add" button: elevated primary circle, kept inside the
 * bar so it stays within one-hand reach.
 */
function AddTabButton({onPress, accessibilityState}: BottomTabBarButtonProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const selected = accessibilityState?.selected ?? false;

  return (
    <View style={styles.addWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
        accessibilityState={{selected}}
        onPress={onPress}
        style={({pressed}) => [
          styles.addButton,
          {borderRadius: theme.radius.pill},
          pressed && styles.addPressed,
        ]}>
        <Plus size={26} color={theme.colors.onPrimary} />
      </Pressable>
    </View>
  );
}

export function RootTabs() {
  const {theme} = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        tabBarLabelStyle: {
          fontSize: theme.typography.label.fontSize,
          fontWeight: theme.typography.label.fontWeight,
        },
      }}>
      <Tab.Screen
        name="HomeTab"
        component={HomeStackNavigator}
        options={{
          title: 'Home',
          tabBarIcon: renderHouseIcon,
        }}
      />
      <Tab.Screen
        name="TransactionsTab"
        component={TransactionsStackNavigator}
        options={{
          title: 'Transactions',
          tabBarIcon: renderReceiptIcon,
        }}
      />
      <Tab.Screen
        name="AddTab"
        component={AddStackNavigator}
        options={{
          title: 'Add',
          tabBarLabel: renderEmptyLabel,
          tabBarButton: renderAddButton,
        }}
      />
      <Tab.Screen
        name="InsightsTab"
        component={InsightsStackNavigator}
        options={{
          title: 'Insights',
          tabBarIcon: renderChartPieIcon,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsStackNavigator}
        options={{
          title: 'Settings',
          tabBarIcon: renderSettingsIcon,
        }}
      />
    </Tab.Navigator>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    addWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addButton: {
      width: 52,
      height: 52,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primary,
      shadowColor: theme.colors.textPrimary,
      shadowOffset: {width: 0, height: 3},
      shadowOpacity: theme.dark ? 0.35 : 0.2,
      shadowRadius: 6,
      elevation: 5,
    },
    addPressed: {opacity: 0.85},
  });
