/**
 * AI assistant settings: OpenRouter API key (stored in the device keychain,
 * never in the DB) and model selection (stored via settingsRepository).
 * Includes a minimal 'Test connection' call and a client-side key warning.
 */
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {ArrowLeft, Check, TriangleAlert} from 'lucide-react-native';

import {
  AppHeader,
  AppScreen,
  Button,
  Card,
  Chip,
  Divider,
  IconButton,
  Input,
  Text,
  useToast,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {SettingsStackParamList} from '../../../app/navigation/types';
import {getSettingsRepository} from '../../../database/repositories';
import {
  deleteOpenRouterApiKey,
  getOpenRouterApiKey,
  setOpenRouterApiKey,
} from '../../../services/security/secureKeyStore';
import {
  CHEAP_PAID_AI_MODELS,
  DEFAULT_AI_MODEL,
  FREE_AI_MODELS,
  ProviderError,
  createOpenRouterProvider,
  isLikelyOpenRouterKey,
  normalizeOpenRouterApiKey,
} from '../../../services/openrouter';
import {friendlyMessageFor} from '../../ai-summary/hooks/useAiInsight';
import {hasHardwareBackedSecrets} from '../../../platform';

type Props = NativeStackScreenProps<SettingsStackParamList, 'AiSettings'>;

type TestResult = {ok: boolean; message: string} | null;

export function AiSettingsScreen({navigation}: Props) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();

  const [loading, setLoading] = useState(true);
  const [hasKey, setHasKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [modelInput, setModelInput] = useState(DEFAULT_AI_MODEL);
  const [savingModel, setSavingModel] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [key, model] = await Promise.all([
        getOpenRouterApiKey(),
        getSettingsRepository().getAiModel(),
      ]);
      if (!cancelled) {
        setHasKey(key != null);
        setModelInput(model ?? DEFAULT_AI_MODEL);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSaveKey = useCallback(async () => {
    // Pasted keys often carry a trailing newline or stray spaces, which
    // OpenRouter rejects with a 401 that looks exactly like a bad key.
    const normalized = normalizeOpenRouterApiKey(keyInput);
    if (!normalized) {
      showToast('Enter an API key first.', {type: 'error'});
      return;
    }
    setSavingKey(true);
    try {
      await setOpenRouterApiKey(normalized);
      setHasKey(true);
      setKeyInput('');
      setTestResult(null);
      showToast('API key saved securely.', {type: 'success'});
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'Could not save the API key. Please try again.',
        {type: 'error'},
      );
    } finally {
      setSavingKey(false);
    }
  }, [keyInput, showToast]);

  const onRemoveKey = useCallback(async () => {
    await deleteOpenRouterApiKey();
    setHasKey(false);
    setTestResult(null);
    showToast('API key removed.', {type: 'info'});
  }, [showToast]);

  const onSaveModel = useCallback(async () => {
    const model = modelInput.trim() || DEFAULT_AI_MODEL;
    setSavingModel(true);
    try {
      await getSettingsRepository().setAiModel(model);
      setModelInput(model);
      showToast('Model saved.', {type: 'success'});
    } catch {
      showToast('Could not save the model. Please try again.', {type: 'error'});
    } finally {
      setSavingModel(false);
    }
  }, [modelInput, showToast]);

  const onTestConnection = useCallback(async () => {
    const apiKey = await getOpenRouterApiKey();
    if (!apiKey) {
      setTestResult({ok: false, message: 'Save an API key first.'});
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      await createOpenRouterProvider().generateSummary({
        apiKey,
        model: modelInput.trim() || DEFAULT_AI_MODEL,
        messages: [{role: 'user', content: 'Reply with the word: ok'}],
        maxTokens: 5,
        timeoutMs: 20_000,
      });
      setTestResult({ok: true, message: 'Connection successful.'});
    } catch (error) {
      const kind =
        error instanceof ProviderError ? error.kind : 'unknown';
      const details =
        error instanceof ProviderError ? error.details : undefined;
      setTestResult({
        ok: false,
        message: details
          ? `${friendlyMessageFor(kind)}\nProvider says: ${details}`
          : friendlyMessageFor(kind),
      });
    } finally {
      setTesting(false);
    }
  }, [modelInput]);

  return (
    <AppScreen>
      <AppHeader
        title="AI assistant"
        left={
          <IconButton
            icon={ArrowLeft}
            accessibilityLabel="Back"
            onPress={() => navigation.goBack()}
          />
        }
      />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {paddingHorizontal: theme.spacing.lg},
        ]}
        keyboardShouldPersistTaps="handled">
        <Card>
          <Text variant="bodyMedium">OpenRouter API key</Text>
          <Text variant="caption" color="textSecondary" style={styles.cardHint}>
            {hasHardwareBackedSecrets
              ? 'Stored only in your device\u2019s secure keychain. Get a key at openrouter.ai/keys.'
              : 'Stored encrypted in this browser\u2019s storage \u2014 never in the database. Get a key at openrouter.ai/keys.'}
          </Text>

          {hasKey ? (
            <View style={styles.configuredRow}>
              <Check size={18} color={theme.colors.success} />
              <Text
                variant="body"
                color="success"
                style={styles.configuredText}>
                API key configured
              </Text>
            </View>
          ) : null}

          <Input
            label={hasKey ? 'Replace key' : 'API key'}
            value={keyInput}
            onChangeText={setKeyInput}
            placeholder="sk-or-…"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
            containerStyle={styles.field}
          />
          {keyInput.length > 0 && !isLikelyOpenRouterKey(keyInput) ? (
            <Text variant="caption" color="warning" style={styles.cardHint}>
              This doesn&apos;t look like an OpenRouter key (they start with
              sk-or-). You can still save it.
            </Text>
          ) : null}
          <View style={styles.buttonRow}>
            <Button
              title={hasKey ? 'Replace key' : 'Save key'}
              onPress={onSaveKey}
              loading={savingKey}
              disabled={loading || !keyInput.trim()}
              size="sm"
            />
            {hasKey ? (
              <Button
                title="Remove key"
                onPress={onRemoveKey}
                variant="danger"
                size="sm"
              />
            ) : null}
          </View>
        </Card>

        <Card>
          <Text variant="bodyMedium">Model</Text>
          <Text variant="caption" color="textSecondary" style={styles.cardHint}>
            Free
          </Text>
          <View style={styles.chipRow}>
            {FREE_AI_MODELS.map(model => (
              <Chip
                key={model.id}
                label={model.id}
                selected={modelInput.trim() === model.id}
                onPress={() => setModelInput(model.id)}
                disabled={loading}
              />
            ))}
          </View>
          <Text variant="caption" color="textSecondary" style={styles.cardHint}>
            Cheap paid (need OpenRouter credits)
          </Text>
          <View style={styles.chipRow}>
            {CHEAP_PAID_AI_MODELS.map(model => (
              <Chip
                key={model.id}
                label={`${model.id} · paid`}
                selected={modelInput.trim() === model.id}
                onPress={() => setModelInput(model.id)}
                disabled={loading}
                accessibilityLabel={`${model.id}, paid, ${model.priceHint ?? ''}`}
              />
            ))}
          </View>
          <Text variant="caption" color="textMuted" style={styles.cardHint}>
            {CHEAP_PAID_AI_MODELS.map(m => `${m.id} ${m.priceHint}`).join('\n')}
          </Text>
          <Input
            label="Model name"
            value={modelInput}
            onChangeText={setModelInput}
            placeholder={DEFAULT_AI_MODEL}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
            hint={`Default: ${DEFAULT_AI_MODEL} — auto-picks a free model, so it keeps working even when individual models are retired.`}
            containerStyle={styles.field}
          />
          <View style={styles.buttonRow}>
            <Button
              title="Save model"
              onPress={onSaveModel}
              loading={savingModel}
              disabled={loading}
              size="sm"
            />
            <Button
              title="Test connection"
              onPress={onTestConnection}
              loading={testing}
              disabled={loading || !hasKey}
              variant="secondary"
              size="sm"
            />
          </View>
          {testResult ? (
            <View style={styles.configuredRow}>
              {testResult.ok ? (
                <Check size={18} color={theme.colors.success} />
              ) : (
                <TriangleAlert size={18} color={theme.colors.danger} />
              )}
              <Text
                variant="body"
                color={testResult.ok ? 'success' : 'danger'}
                style={styles.configuredText}>
                {testResult.message}
              </Text>
            </View>
          ) : null}
        </Card>

        <View
          style={[
            styles.warningBox,
            {
              backgroundColor: theme.colors.warningSoft,
              borderRadius: theme.radius.md,
            },
          ]}>
          <TriangleAlert size={18} color={theme.colors.warning} />
          <Text variant="caption" color="textPrimary" style={styles.warningText}>
            {hasHardwareBackedSecrets
              ? 'A mobile app cannot fully protect a client-side API key. Anyone who extracts your key can spend your OpenRouter credits \u2014 use a key with a spending limit and rotate it if you lose your device.'
              : 'Browser storage is less protected than a phone keystore: anyone with access to this browser profile could recover the key. Use a key with a low spending limit, and remove it from here on shared computers.'}
          </Text>
        </View>

        <Divider spacing="lg" />
        <Text variant="caption" color="textMuted">
          AI is optional — everything in PaisaFlow works without it.
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
    cardHint: {marginTop: theme.spacing.xs},
    field: {marginTop: theme.spacing.md},
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
      marginTop: theme.spacing.xs,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: theme.spacing.md,
      marginTop: theme.spacing.md,
    },
    configuredRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      marginTop: theme.spacing.md,
    },
    configuredText: {flex: 1},
    warningBox: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
      padding: theme.spacing.md,
    },
    warningText: {flex: 1},
  });
