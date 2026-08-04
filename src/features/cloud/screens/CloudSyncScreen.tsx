/**
 * Cloud sync: optional Supabase auth + manual/automatic backup sync.
 *
 * States:
 * - loading      — resolving credentials + restored session
 * - not configured — no bundled credentials and no runtime override: the
 *   setup card collects the project URL + anon key (stored in the keychain)
 * - signed out   — email/password with a Sign in / Create account toggle
 * - signed in    — masked email, last sync time, Sync now, auto-sync-on-open
 *   toggle (app_settings 'cloudAutoSync'), Sign out
 *
 * Everything here is optional: local SQLite stays the source of truth and
 * the rest of the app never touches this screen's state.
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Switch, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  CloudUpload,
  KeyRound,
  TriangleAlert,
} from 'lucide-react-native';

import {
  AppHeader,
  AppScreen,
  Button,
  Card,
  Divider,
  IconButton,
  Input,
  LoadingState,
  OfflineBanner,
  SegmentedControl,
  Text,
  useToast,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {SettingsStackParamList} from '../../../app/navigation/types';
import {SUPABASE_ANON_KEY, SUPABASE_URL} from '../../../config';
import {getSettingsRepository} from '../../../database/repositories';
import {useIsOnline} from '../../../services/connectivity';
import {
  clearSupabaseOverride,
  getSupabaseClient,
  resetSupabaseClient,
  resolveSupabaseCredentials,
  setSupabaseOverride,
} from '../../../services/supabase';
import type {SupabaseCredentials, SyncRunResult} from '../../../services/supabase';
import {
  CLOUD_SETTINGS_KEYS,
  getLastSyncAt,
  runSync,
} from '../../../services/supabase/syncService';
import {dayjs} from '../../../utils/date';

type Props = NativeStackScreenProps<SettingsStackParamList, 'CloudSync'>;

type AuthMode = 'sign_in' | 'sign_up';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Deep link the app passes as Supabase's emailRedirectTo, so the confirm
 * email opens the app instead of the dashboard's default localhost URL.
 * Matched by the paisaflow:// intent-filter in AndroidManifest.xml; must
 * also be listed under Authentication → URL Configuration → Redirect URLs.
 */
const AUTH_REDIRECT_URL = 'paisaflow://auth';

/** True when the build ships its own Supabase project (src/config/supabase.ts). */
const HAS_BUNDLED_PROJECT =
  SUPABASE_URL.trim().length > 0 && SUPABASE_ANON_KEY.trim().length > 0;

/** Show only the head of the local part: an***@example.com */
function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) {
    return '***';
  }
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}

export function CloudSyncScreen({navigation}: Props) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();
  const online = useIsOnline();

  const [loading, setLoading] = useState(true);
  const [credentials, setCredentials] = useState<SupabaseCredentials | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [autoSync, setAutoSync] = useState(false);

  const [authMode, setAuthMode] = useState<AuthMode>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncRunResult | null>(null);

  const [overrideUrl, setOverrideUrl] = useState('');
  const [overrideKey, setOverrideKey] = useState('');
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const autoSyncedOnce = useRef(false);

  const runSyncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await runSync();
      setLastResult(result);
      if (result.status === 'ok') {
        setLastSyncAt(result.syncedAt);
        showToast('Backup is up to date.', {type: 'success'});
      } else if (result.status === 'partial') {
        showToast(result.message ?? 'Some tables failed to sync.', {type: 'error'});
      } else if (result.status === 'signed_out') {
        setSessionEmail(null);
      } else {
        showToast(result.message ?? 'Cloud sync is not configured.', {type: 'info'});
      }
    } finally {
      setSyncing(false);
    }
  }, [showToast]);

  /** (Re)initialise credentials + session. Also used after override changes. */
  const initialize = useCallback(async () => {
    setLoading(true);
    try {
      const [creds, storedLastSync, storedAutoSync] = await Promise.all([
        resolveSupabaseCredentials(),
        getLastSyncAt(),
        getSettingsRepository().getValue(CLOUD_SETTINGS_KEYS.autoSync),
      ]);
      setCredentials(creds);
      setLastSyncAt(storedLastSync);
      setAutoSync(storedAutoSync === 'true');

      let emailFromSession: string | null = null;
      if (creds) {
        const client = await getSupabaseClient();
        if (client) {
          try {
            const {data} = await client.auth.getSession();
            emailFromSession = data.session?.user?.email ?? null;
          } catch {
            emailFromSession = null;
          }
        }
      }
      setSessionEmail(emailFromSession);

      if (
        emailFromSession &&
        storedAutoSync === 'true' &&
        !autoSyncedOnce.current
      ) {
        autoSyncedOnce.current = true;
        // Fire and forget; outcomes surface via state/toasts inside.
        runSyncNow();
      }
    } finally {
      setLoading(false);
    }
  }, [runSyncNow]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const onSubmitAuth = useCallback(async () => {
    const trimmedEmail = email.trim();
    const nextEmailError = !EMAIL_PATTERN.test(trimmedEmail)
      ? 'Enter a valid email address.'
      : null;
    const nextPasswordError =
      password.length < 6 ? 'Password must be at least 6 characters.' : null;
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setFormError(null);
    setFormNotice(null);
    if (nextEmailError || nextPasswordError) {
      return;
    }
    if (!online) {
      setFormError('You are offline — connect to the internet to sign in.');
      return;
    }

    setAuthBusy(true);
    try {
      const client = await getSupabaseClient();
      if (!client) {
        setFormError('Set up your Supabase project first.');
        return;
      }
      if (authMode === 'sign_in') {
        const {data, error} = await client.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (error) {
          setFormError(error.message);
        } else if (data.session) {
          setSessionEmail(data.session.user?.email ?? trimmedEmail);
          setPassword('');
          showToast('Signed in.', {type: 'success'});
        }
      } else {
        const {data, error} = await client.auth.signUp({
          email: trimmedEmail,
          password,
          options: {emailRedirectTo: AUTH_REDIRECT_URL},
        });
        if (error) {
          setFormError(error.message);
        } else if (data.session) {
          setSessionEmail(data.session.user?.email ?? trimmedEmail);
          setPassword('');
          showToast('Account created — signed in.', {type: 'success'});
        } else {
          setFormNotice(
            'Account created. Check your email to confirm, then sign in. ' +
              'If the link opens localhost, ask the project owner to update ' +
              'the Supabase Auth URL settings (Authentication → URL ' +
              'Configuration) or disable email confirmation ' +
              '(Authentication → Sign In / Up → Email).',
          );
          setPassword('');
        }
      }
    } catch {
      setFormError('Could not reach Supabase. Check your connection and try again.');
    } finally {
      setAuthBusy(false);
    }
  }, [authMode, email, online, password, showToast]);

  const onSignOut = useCallback(async () => {
    try {
      const client = await getSupabaseClient();
      await client?.auth.signOut();
    } catch {
      // Signing out locally is enough; ignore remote errors.
    }
    autoSyncedOnce.current = false;
    setSessionEmail(null);
    setLastResult(null);
    showToast('Signed out. Your local data is untouched.', {type: 'info'});
  }, [showToast]);

  const onToggleAutoSync = useCallback(
    async (value: boolean) => {
      setAutoSync(value);
      try {
        await getSettingsRepository().setValue(
          CLOUD_SETTINGS_KEYS.autoSync,
          value ? 'true' : 'false',
        );
      } catch {
        showToast('Could not save setting', {type: 'error'});
      }
    },
    [showToast],
  );

  const onSaveOverride = useCallback(async () => {
    setOverrideBusy(true);
    try {
      await setSupabaseOverride({url: overrideUrl, anonKey: overrideKey});
      resetSupabaseClient();
      autoSyncedOnce.current = false;
      setSessionEmail(null);
      setLastResult(null);
      setOverrideUrl('');
      setOverrideKey('');
      showToast('Project saved securely.', {type: 'success'});
      await initialize();
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'Could not save the project. Please try again.',
        {type: 'error'},
      );
    } finally {
      setOverrideBusy(false);
    }
  }, [initialize, overrideKey, overrideUrl, showToast]);

  const onClearOverride = useCallback(async () => {
    await clearSupabaseOverride();
    resetSupabaseClient();
    autoSyncedOnce.current = false;
    setSessionEmail(null);
    setLastResult(null);
    showToast('Custom project removed.', {type: 'info'});
    await initialize();
  }, [initialize, showToast]);

  const switchColors = {
    trackColor: {false: theme.colors.border, true: theme.colors.primarySoft},
  };

  const configured = credentials != null;
  // With a bundled project the override UI is an advanced escape hatch —
  // collapsed by default. An active override always shows it expanded.
  const showAdvanced = advancedOpen || credentials?.source === 'override';
  const failedTables = lastResult?.tables.filter(t => t.status === 'error') ?? [];

  return (
    <AppScreen>
      <AppHeader
        title="Cloud sync"
        left={
          <IconButton
            icon={ArrowLeft}
            accessibilityLabel="Go back"
            onPress={() => navigation.goBack()}
          />
        }
      />
      <OfflineBanner />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {paddingHorizontal: theme.spacing.lg},
        ]}
        keyboardShouldPersistTaps="handled">
        <Card>
          <View style={styles.cardTitleRow}>
            <CloudUpload size={20} color={theme.colors.textSecondary} />
            <Text variant="bodyMedium">Optional backup</Text>
          </View>
          <Text variant="caption" color="textSecondary" style={styles.cardHint}>
            {HAS_BUNDLED_PROJECT
              ? 'Optional. Local data stays the source of truth; sync keeps a backup copy in the built-in cloud project. Just create an account below — no setup needed.'
              : 'Optional. Local data stays the source of truth; sync keeps a backup copy in YOUR Supabase project. PaisaFlow works exactly the same without it.'}
          </Text>
        </Card>

        {loading ? (
          <LoadingState message="Loading cloud sync…" />
        ) : !configured ? (
          <Card>
            <Text variant="bodyMedium">Set up your Supabase project</Text>
            <Text variant="caption" color="textSecondary" style={styles.cardHint}>
              1. Create a free project at supabase.com.{'\n'}
              2. In the SQL editor, run the script from supabase/schema.sql
              (see supabase/README.md).{'\n'}
              3. Paste your Project URL and anon key from Settings → API.
            </Text>
            <Input
              label="Project URL"
              value={overrideUrl}
              onChangeText={setOverrideUrl}
              placeholder="https://your-project.supabase.co"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              containerStyle={styles.field}
            />
            <Input
              label="Anon key"
              value={overrideKey}
              onChangeText={setOverrideKey}
              placeholder="eyJhbGciOi…"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              hint="Stored only in your device's secure keychain."
              containerStyle={styles.field}
            />
            <View style={styles.buttonRow}>
              <Button
                title="Save project"
                onPress={onSaveOverride}
                loading={overrideBusy}
                disabled={!overrideUrl.trim() || !overrideKey.trim()}
                size="sm"
              />
            </View>
          </Card>
        ) : sessionEmail ? (
          <>
            <Card>
              <View style={styles.cardTitleRow}>
                <Check size={18} color={theme.colors.success} />
                <Text variant="bodyMedium">Signed in as {maskEmail(sessionEmail)}</Text>
              </View>
              <Text variant="caption" color="textSecondary" style={styles.cardHint}>
                {lastSyncAt
                  ? `Last sync: ${dayjs(lastSyncAt).format('D MMM YYYY, h:mm A')}`
                  : 'Never synced yet.'}
              </Text>
              {!online ? (
                <Text variant="caption" color="warning" style={styles.cardHint}>
                  You are offline — sync is paused until you reconnect.
                </Text>
              ) : null}
              <View style={styles.switchRow}>
                <View style={styles.switchLabel}>
                  <Text variant="body">Sync when this screen opens</Text>
                  <Text variant="caption" color="textSecondary">
                    {autoSync ? 'On' : 'Off'}
                  </Text>
                </View>
                <Switch
                  value={autoSync}
                  onValueChange={onToggleAutoSync}
                  trackColor={switchColors.trackColor}
                  thumbColor={autoSync ? theme.colors.primary : theme.colors.textMuted}
                  accessibilityLabel="Sync when this screen opens"
                />
              </View>
              <View style={styles.buttonRow}>
                <Button
                  title="Sync now"
                  onPress={runSyncNow}
                  loading={syncing}
                  disabled={!online}
                  size="sm"
                />
                <Button
                  title="Sign out"
                  onPress={onSignOut}
                  variant="secondary"
                  size="sm"
                />
              </View>
            </Card>

            {failedTables.length > 0 ? (
              <Card>
                <View style={styles.cardTitleRow}>
                  <TriangleAlert size={18} color={theme.colors.danger} />
                  <Text variant="bodyMedium">Sync problems</Text>
                </View>
                {failedTables.map(t => (
                  <Text
                    key={t.table}
                    variant="caption"
                    color="danger"
                    style={styles.cardHint}>
                    {t.table}: {t.error}
                  </Text>
                ))}
              </Card>
            ) : null}
          </>
        ) : (
          <Card>
            <SegmentedControl<AuthMode>
              options={[
                {value: 'sign_in', label: 'Sign in'},
                {value: 'sign_up', label: 'Create account'},
              ]}
              value={authMode}
              onChange={mode => {
                setAuthMode(mode);
                setFormError(null);
                setFormNotice(null);
              }}
              accessibilityLabel="Sign in or create account"
            />
            <Input
              label="Email"
              value={email}
              onChangeText={text => {
                setEmail(text);
                setEmailError(null);
              }}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              error={emailError ?? undefined}
              containerStyle={styles.field}
            />
            <Input
              label="Password"
              value={password}
              onChangeText={text => {
                setPassword(text);
                setPasswordError(null);
              }}
              placeholder="At least 6 characters"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              error={passwordError ?? undefined}
              containerStyle={styles.field}
            />
            {formError ? (
              <Text variant="caption" color="danger" style={styles.field}>
                {formError}
              </Text>
            ) : null}
            {formNotice ? (
              <Text variant="caption" color="textSecondary" style={styles.field}>
                {formNotice}
              </Text>
            ) : null}
            {!online ? (
              <Text variant="caption" color="warning" style={styles.field}>
                You are offline — signing in needs an internet connection.
              </Text>
            ) : null}
            <View style={styles.buttonRow}>
              <Button
                title={authMode === 'sign_in' ? 'Sign in' : 'Create account'}
                onPress={onSubmitAuth}
                loading={authBusy}
                disabled={!online}
                size="sm"
              />
            </View>
          </Card>
        )}

        {!loading && configured ? (
          <Card>
            {HAS_BUNDLED_PROJECT ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{expanded: showAdvanced}}
                accessibilityLabel="Advanced: use your own Supabase project"
                onPress={() => setAdvancedOpen(open => !open)}
                style={styles.advancedHeader}>
                {showAdvanced ? (
                  <ChevronDown size={18} color={theme.colors.textSecondary} />
                ) : (
                  <ChevronRight size={18} color={theme.colors.textSecondary} />
                )}
                <Text variant="bodyMedium" style={styles.advancedTitle}>
                  Advanced: use your own Supabase project
                </Text>
              </Pressable>
            ) : (
              <View style={styles.cardTitleRow}>
                <KeyRound size={18} color={theme.colors.textSecondary} />
                <Text variant="bodyMedium">Custom project</Text>
              </View>
            )}
            {!HAS_BUNDLED_PROJECT || showAdvanced ? (
              <>
                <Text variant="caption" color="textSecondary" style={styles.cardHint}>
                  {credentials.source === 'override'
                    ? 'Using a custom project saved on this device. Remove it to fall back to the bundled project.'
                    : 'Point the app at a different Supabase project. Switching projects signs you out of the current one.'}
                </Text>
                <Input
                  label="Project URL"
                  value={overrideUrl}
                  onChangeText={setOverrideUrl}
                  placeholder="https://your-project.supabase.co"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  containerStyle={styles.field}
                />
                <Input
                  label="Anon key"
                  value={overrideKey}
                  onChangeText={setOverrideKey}
                  placeholder="eyJhbGciOi…"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  containerStyle={styles.field}
                />
                <View style={styles.buttonRow}>
                  <Button
                    title="Use this project"
                    onPress={onSaveOverride}
                    loading={overrideBusy}
                    disabled={!overrideUrl.trim() || !overrideKey.trim()}
                    size="sm"
                  />
                  {credentials.source === 'override' ? (
                    <Button
                      title="Remove override"
                      onPress={onClearOverride}
                      variant="danger"
                      size="sm"
                    />
                  ) : null}
                </View>
              </>
            ) : null}
          </Card>
        ) : null}

        <Divider spacing="lg" />
        <Text variant="caption" color="textMuted">
          Backups are protected by row level security — only your account can
          read or write your rows. Setup help lives in supabase/README.md.
        </Text>
      </ScrollView>
    </AppScreen>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    scrollContent: {
      paddingBottom: theme.spacing.xxxxl,
      gap: theme.spacing.lg,
    },
    cardTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    cardHint: {marginTop: theme.spacing.xs},
    field: {marginTop: theme.spacing.md},
    buttonRow: {
      flexDirection: 'row',
      gap: theme.spacing.md,
      marginTop: theme.spacing.md,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      marginTop: theme.spacing.md,
      minHeight: 44,
    },
    switchLabel: {flex: 1, gap: 2},
    advancedHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      minHeight: 44,
    },
    advancedTitle: {flex: 1},
  });
