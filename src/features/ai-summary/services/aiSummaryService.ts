/**
 * Orchestrates AI insight generation:
 * offline check → key lookup → aggregate payload → hash-based cache →
 * provider call → Zod validation → deterministic local fallback → persist.
 *
 * The provider is only ever called when the input hash has no cached row.
 */
import NetInfo from '@react-native-community/netinfo';

import {
  getAiSummariesRepository,
  getSettingsRepository,
} from '../../../database/repositories';
import {getOpenRouterApiKey} from '../../../services/security/secureKeyStore';
import {
  DEFAULT_AI_MODEL,
  ProviderError,
  createOpenRouterProvider,
} from '../../../services/openrouter';
import type {SummaryProvider} from '../../../services/openrouter';
import {buildAggregatePayload, getCurrentAiPeriod} from './aggregatePayload';
import {hashAggregatePayload} from './inputHash';
import {buildLocalSummary} from './localSummary';
import {buildSummaryPrompt} from './prompt';
import {parseSummaryContent} from './summarySchema';
import type {SummaryContent} from './summarySchema';

export interface AiInsightSuccess {
  content: SummaryContent;
  /** epoch ms when the summary was generated. */
  createdAt: number;
  model: string;
  /** True when served from the ai_summaries cache (no API call made). */
  fromCache: boolean;
  /** True when the AI response was unusable and the local summary was used. */
  usedFallback: boolean;
}

export interface GenerateOptions {
  signal?: AbortSignal;
  /** Injectable for tests / future backend proxy. */
  provider?: SummaryProvider;
}

async function assertOnline(): Promise<void> {
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
}

export async function generateAiInsight(
  options: GenerateOptions = {},
): Promise<AiInsightSuccess> {
  await assertOnline();

  const apiKey = await getOpenRouterApiKey();
  if (!apiKey) {
    throw new ProviderError('missing_key');
  }

  const payload = await buildAggregatePayload();
  const inputHash = hashAggregatePayload(payload);
  const aiSummaries = getAiSummariesRepository();

  const cached = await aiSummaries.findByInputHash(inputHash);
  if (cached) {
    const cachedContent = parseSummaryContent(cached.summaryJson);
    if (cachedContent) {
      return {
        content: cachedContent,
        createdAt: cached.createdAt,
        model: cached.model,
        fromCache: true,
        usedFallback: false,
      };
    }
    // Corrupt cache row — fall through and regenerate.
  }

  const model = (await getSettingsRepository().getAiModel()) ?? DEFAULT_AI_MODEL;
  const provider = options.provider ?? createOpenRouterProvider();

  const raw = await provider.generateSummary({
    apiKey,
    model,
    messages: buildSummaryPrompt(payload),
    signal: options.signal,
  });

  const parsed = parseSummaryContent(raw);
  const content = parsed ?? buildLocalSummary(payload);

  const period = await getCurrentAiPeriod();
  const saved = await aiSummaries.createSummary({
    periodType: 'monthly',
    periodStart: period.start,
    periodEnd: period.end,
    inputHash,
    model,
    summaryJson: JSON.stringify(content),
  });

  return {
    content,
    createdAt: saved.createdAt,
    model,
    fromCache: false,
    usedFallback: parsed == null,
  };
}

/**
 * Load the most recent cached summary for the current monthly period without
 * calling the provider. Used on mount and whenever dataVersion changes.
 */
export async function getCachedInsightForCurrentPeriod(): Promise<AiInsightSuccess | null> {
  const period = await getCurrentAiPeriod();
  const row = await getAiSummariesRepository().findLatestForPeriod(
    'monthly',
    period.start,
    period.end,
  );
  if (!row) {
    return null;
  }
  const content = parseSummaryContent(row.summaryJson);
  if (!content) {
    return null;
  }
  return {
    content,
    createdAt: row.createdAt,
    model: row.model,
    fromCache: true,
    usedFallback: false,
  };
}
