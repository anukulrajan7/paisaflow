import React, {useCallback, useMemo} from 'react';
import {Linking, ScrollView, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {ArrowLeft, ExternalLink, ShieldCheck, Sparkles} from 'lucide-react-native';

import {
  AppHeader,
  AppScreen,
  Card,
  IconButton,
  SectionHeader,
  Text,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {SettingsStackParamList} from '../../../app/navigation/types';
import {SettingsRow} from '../components/SettingsRow';
import {hasHardwareBackedSecrets, isWeb} from '../../../platform';

type Props = NativeStackScreenProps<SettingsStackParamList, 'About'>;

/** Keep in sync with package.json "version". */
const APP_VERSION = '0.0.1';
const OPENROUTER_KEYS_URL = 'https://openrouter.ai/keys';

export function AboutScreen({navigation}: Props) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const openOpenRouter = useCallback(() => {
    Linking.openURL(OPENROUTER_KEYS_URL).catch(() => {
      // No browser available — nothing actionable to show here.
    });
  }, []);

  return (
    <AppScreen>
      <AppHeader
        title="About"
        left={
          <IconButton
            icon={ArrowLeft}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Back"
          />
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.identity}>
          <Text variant="display" align="center">
            PaisaFlow
          </Text>
          <Text variant="body" color="textSecondary" align="center">
            Offline-first expense tracker
          </Text>
          <Text variant="caption" color="textMuted" align="center">
            Version {APP_VERSION}
            {isWeb ? ' · Web' : ''}
          </Text>
        </View>

        <SectionHeader title="Privacy" />
        <Card style={styles.card}>
          <SettingsRow
            icon={ShieldCheck}
            title={
              isWeb ? 'Your data stays in this browser' : 'Your data stays on this device'
            }
            subtitle={
              isWeb
                ? 'Transactions, accounts and budgets live in a local SQLite database stored by this browser. There is no account, no server and no analytics.'
                : 'Transactions, accounts and budgets live only in the local database. There is no account, no cloud sync and no analytics.'
            }
          />
          <Text variant="body" color="textSecondary">
            Your data never leaves this device — the one exception is optional
            AI summaries, which send only aggregate totals (never transaction
            notes or full history) when you explicitly enable them with your
            own API key.
          </Text>
        </Card>

        <SectionHeader title="AI summaries" style={styles.sectionGap} />
        <Card style={styles.card}>
          <SettingsRow
            icon={Sparkles}
            title="Powered by OpenRouter"
            subtitle={
              hasHardwareBackedSecrets
                ? 'AI insights are optional and need your own OpenRouter API key, stored in the device Keychain — never in the database.'
                : 'AI insights are optional and need your own OpenRouter API key, stored encrypted in this browser — never in the database.'
            }
          />
          <SettingsRow
            icon={ExternalLink}
            title="Get an OpenRouter key"
            subtitle={OPENROUTER_KEYS_URL}
            onPress={openOpenRouter}
            accessibilityHint="Opens openrouter.ai in your browser"
          />
        </Card>
      </ScrollView>
    </AppScreen>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.xxxxl,
    },
    identity: {
      alignItems: 'center',
      gap: theme.spacing.xs,
      paddingVertical: theme.spacing.xxl,
    },
    card: {gap: theme.spacing.lg},
    sectionGap: {marginTop: theme.spacing.xxl},
  });
