import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import {HomeScreen} from '../../features/home/screens/HomeScreen';
import {TransactionsScreen} from '../../features/transactions/screens/TransactionsScreen';
import {TransactionDetailsScreen} from '../../features/transactions/screens/TransactionDetailsScreen';
import {AddTransactionScreen} from '../../features/transactions/screens/AddTransactionScreen';
import {ExpenseReviewScreen} from '../../features/tracking/screens/ExpenseReviewScreen';
import {TrackingSettingsScreen} from '../../features/tracking/screens/TrackingSettingsScreen';
import {BudgetsScreen} from '../../features/budgets/screens/BudgetsScreen';
import {InsightsScreen} from '../../features/insights/screens/InsightsScreen';
import {SettingsScreen} from '../../features/settings/screens/SettingsScreen';
import {AccountsScreen} from '../../features/accounts/screens/AccountsScreen';
import {CategoriesScreen} from '../../features/categories/screens/CategoriesScreen';
import {AiSettingsScreen} from '../../features/settings/screens/AiSettingsScreen';
import {AboutScreen} from '../../features/settings/screens/AboutScreen';
import {RecurringRulesScreen} from '../../features/recurring/screens/RecurringRulesScreen';
import {AppLockSettingsScreen} from '../../features/security/screens/AppLockSettingsScreen';
import {CloudSyncScreen} from '../../features/cloud/screens/CloudSyncScreen';

import type {
  AddStackParamList,
  HomeStackParamList,
  InsightsStackParamList,
  SettingsStackParamList,
  TransactionsStackParamList,
} from './types';

const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const TransactionsStack =
  createNativeStackNavigator<TransactionsStackParamList>();
const AddStack = createNativeStackNavigator<AddStackParamList>();
const InsightsStack = createNativeStackNavigator<InsightsStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

const screenOptions = {headerShown: false};

export function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={screenOptions}>
      <HomeStack.Screen name="Home" component={HomeScreen} />
      <HomeStack.Screen
        name="TransactionDetails"
        component={TransactionDetailsScreen}
      />
      <HomeStack.Screen name="Budgets" component={BudgetsScreen} />
    </HomeStack.Navigator>
  );
}

export function TransactionsStackNavigator() {
  return (
    <TransactionsStack.Navigator screenOptions={screenOptions}>
      <TransactionsStack.Screen
        name="Transactions"
        component={TransactionsScreen}
      />
      <TransactionsStack.Screen
        name="TransactionDetails"
        component={TransactionDetailsScreen}
      />
      <TransactionsStack.Screen
        name="ExpenseReview"
        component={ExpenseReviewScreen}
      />
      <TransactionsStack.Screen
        name="TrackingSettings"
        component={TrackingSettingsScreen}
      />
    </TransactionsStack.Navigator>
  );
}

export function AddStackNavigator() {
  return (
    <AddStack.Navigator screenOptions={screenOptions}>
      <AddStack.Screen
        name="AddTransaction"
        component={AddTransactionScreen}
      />
    </AddStack.Navigator>
  );
}

export function InsightsStackNavigator() {
  return (
    <InsightsStack.Navigator screenOptions={screenOptions}>
      <InsightsStack.Screen name="Insights" component={InsightsScreen} />
    </InsightsStack.Navigator>
  );
}

export function SettingsStackNavigator() {
  return (
    <SettingsStack.Navigator screenOptions={screenOptions}>
      <SettingsStack.Screen name="Settings" component={SettingsScreen} />
      <SettingsStack.Screen name="Accounts" component={AccountsScreen} />
      <SettingsStack.Screen name="Categories" component={CategoriesScreen} />
      <SettingsStack.Screen name="AiSettings" component={AiSettingsScreen} />
      <SettingsStack.Screen name="About" component={AboutScreen} />
      <SettingsStack.Screen
        name="Recurring"
        component={RecurringRulesScreen}
      />
      <SettingsStack.Screen name="AppLock" component={AppLockSettingsScreen} />
      <SettingsStack.Screen name="CloudSync" component={CloudSyncScreen} />
    </SettingsStack.Navigator>
  );
}
