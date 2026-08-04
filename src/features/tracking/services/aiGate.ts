/**
 * Shared AI gating for the tracking feature: the app works fully offline and
 * the OpenRouter key is optional, so every AI entry point checks connectivity
 * and the keychain before touching the network. Mirrors the gating order in
 * ai-summary's aiSummaryService. The key is never logged or stored elsewhere.
 */
import NetInfo from '@react-native-community/netinfo';

import {getSettingsRepository} from '../../../database/repositories';
import {getOpenRouterApiKey} from '../../../services/security/secureKeyStore';
import {DEFAULT_AI_MODEL, ProviderError} from '../../../services/openrouter';

export interface AiRequestContext {
  apiKey: string;
  model: string;
}

/**
 * Resolve the API key + model for one AI call, throwing
 * ProviderError('offline' | 'missing_key') when AI is unavailable.
 */
export async function resolveAiRequestContext(): Promise<AiRequestContext> {
  try {
    const state = await NetInfo.fetch();
    if (state.isConnected === false) {
      throw new ProviderError('offline');
    }
  } catch (error) {
    if (error instanceof ProviderError) {
      throw error;
    }
    // NetInfo itself failed — proceed and let fetch decide.
  }
  const apiKey = await getOpenRouterApiKey();
  if (!apiKey) {
    throw new ProviderError('missing_key');
  }
  const model = (await getSettingsRepository().getAiModel()) ?? DEFAULT_AI_MODEL;
  return {apiKey, model};
}

/** True when an OpenRouter key exists in the keychain (UI hint gating). */
export async function hasAiApiKey(): Promise<boolean> {
  return (await getOpenRouterApiKey()) != null;
}
