/**
 * State for the AiInsightCard: cached-summary loading (on mount and whenever
 * dataVersion changes), on-demand generation, connectivity tracking, and
 * user cancellation. Every failure mode maps to a human-friendly message.
 */
import {useCallback, useEffect, useRef, useState} from 'react';
import NetInfo from '@react-native-community/netinfo';

import {ProviderError} from '../../../services/openrouter';
import type {AiProviderErrorKind} from '../../../services/openrouter';
import {useDataVersionStore} from '../../../store/dataVersionStore';
import {
  generateAiInsight,
  getCachedInsightForCurrentPeriod,
} from '../services/aiSummaryService';
import type {AiInsightSuccess} from '../services/aiSummaryService';

export function friendlyMessageFor(kind: AiProviderErrorKind): string {
  switch (kind) {
    case 'missing_key':
      return 'Add your OpenRouter API key in Settings → AI assistant to generate insights.';
    case 'invalid_key':
      return 'Your API key was rejected. Check it in Settings → AI assistant.';
    case 'offline':
      return 'You are offline. Connect to the internet to refresh AI insights.';
    case 'timeout':
      return 'The AI service took too long to respond. Please try again.';
    case 'cancelled':
      return 'Generation cancelled.';
    case 'rate_limited':
      return 'Rate limit reached. Wait a moment and try again.';
    case 'insufficient_credits':
      return 'Your OpenRouter account is out of credits.';
    case 'model_unavailable':
      return 'The selected model is unavailable. Try another model in AI settings.';
    case 'invalid_response':
    case 'unknown':
    default:
      return 'Something went wrong while contacting the AI service. Please try again.';
  }
}

export interface AiInsightState {
  /** Loaded summary (cached or freshly generated). */
  insight: AiInsightSuccess | null;
  /** Initial cache load in progress. */
  loadingCached: boolean;
  /** Generation in progress. */
  generating: boolean;
  /** Human-friendly error for the last failed generation, if any. */
  errorMessage: string | null;
  isOnline: boolean;
  refresh: () => Promise<void>;
  cancel: () => void;
}

export function useAiInsight(): AiInsightState {
  const dataVersion = useDataVersionStore(s => s.dataVersion);
  const [insight, setInsight] = useState<AiInsightSuccess | null>(null);
  const [loadingCached, setLoadingCached] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  // Load the cached summary on mount and after any data mutation.
  useEffect(() => {
    let cancelled = false;
    setLoadingCached(true);
    getCachedInsightForCurrentPeriod()
      .then(cached => {
        if (!cancelled && cached) {
          setInsight(cached);
        }
      })
      .catch(() => {
        // Cache read failure is non-fatal — the card stays in its idle state.
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingCached(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dataVersion]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected !== false);
    });
    return unsubscribe;
  }, []);

  // Abort any in-flight request when the card unmounts.
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const refresh = useCallback(async () => {
    if (!isOnline) {
      setErrorMessage(friendlyMessageFor('offline'));
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating(true);
    setErrorMessage(null);
    try {
      const result = await generateAiInsight({signal: controller.signal});
      setInsight(result);
    } catch (error) {
      if (error instanceof ProviderError) {
        if (error.kind !== 'cancelled') {
          setErrorMessage(friendlyMessageFor(error.kind));
        }
      } else {
        setErrorMessage(friendlyMessageFor('unknown'));
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setGenerating(false);
    }
  }, [isOnline]);

  return {
    insight,
    loadingCached,
    generating,
    errorMessage,
    isOnline,
    refresh,
    cancel,
  };
}
