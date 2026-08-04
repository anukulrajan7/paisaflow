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
  DEFAULT_AI_MODEL,
  ProviderError,
  createOpenRouterProvider,
} from '../../../services/openrouter';
import {friendlyMessageFor} from '../../ai-summary/hooks/useAiInsight';

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
    if (!keyInput.trim()) {
      showToast('Enter an API key first.', {type: 'error'});
      return;
    }
    setSavingKey(true);
    try {
      await setOpenRouterApiKey(keyInput);
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
      setTestResult({ok: false, message: friendlyMessageFor(kind)});
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
            Stored only in your device&apos;s secure keychain. Get a key at
            openrouter.ai/keys.
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
          <Input
            label="Model name"
            value={modelInput}
            onChangeText={setModelInput}
            placeholder={DEFAULT_AI_MODEL}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
            hint={`Default: ${DEFAULT_AI_MODEL}`}
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
            A mobile app cannot fully protect a client-side API key. Anyone who
            extracts your key can spend your OpenRouter credits — use a key
            with a spending limit and rotate it if you lose your device.
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
