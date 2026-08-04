import type {NavigatorScreenParams} from '@react-navigation/native';

/** Per-tab native-stack param lists. Detail screens are added in later phases. */
export type HomeStackParamList = {
  Home: undefined;
  TransactionDetails: {transactionId: string};
  Budgets: undefined;
};

export type TransactionsStackParamList = {
  Transactions: undefined;
  TransactionDetails: {transactionId: string};
  ExpenseReview: undefined;
  TrackingSettings: undefined;
};

export type AddStackParamList = {
  AddTransaction: undefined;
};

export type InsightsStackParamList = {
  Insights: undefined;
};

export type SettingsStackParamList = {
  Settings: undefined;
  Accounts: undefined;
  Categories: undefined;
  AiSettings: undefined;
  About: undefined;
  Recurring: undefined;
  AppLock: undefined;
  CloudSync: undefined;
  People: undefined;
  PersonLedger: {personId: string};
  Salary: undefined;
  Investments: undefined;
  InvestmentDetails: {investmentId: string};
  SavingsGoals: undefined;
  SavingsGoalDetails: {goalId: string};
  MoneyReminders: undefined;
};

export type RootTabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList>;
  TransactionsTab: NavigatorScreenParams<TransactionsStackParamList>;
  AddTab: NavigatorScreenParams<AddStackParamList>;
  InsightsTab: NavigatorScreenParams<InsightsStackParamList>;
  SettingsTab: NavigatorScreenParams<SettingsStackParamList>;
};

/** Root stack: onboarding gate vs. the main tab shell. */
export type RootStackParamList = {
  Onboarding: undefined;
  Tabs: NavigatorScreenParams<RootTabParamList>;
};
