/**
 * Contract for AI summary providers.
 *
 * The app talks to a `SummaryProvider`, never to OpenRouter directly — a
 * backend proxy can implement this same interface later and be swapped in
 * without touching feature code.
 */

/**
 * Model used when the user has not chosen one in AI settings.
 * 'openrouter/free' is OpenRouter's auto-router across currently-available
 * free models — immune to individual free models being retired (a hardcoded
 * free model id going away is what broke AI summaries before).
 */
export const DEFAULT_AI_MODEL = 'openrouter/free';

export interface AiModelSuggestion {
  /** OpenRouter model id. */
  id: string;
  /** Approx input/output price per million tokens; undefined = free. */
  priceHint?: string;
}

/** Free models that exist on OpenRouter today. */
export const FREE_AI_MODELS: readonly AiModelSuggestion[] = [
  {id: DEFAULT_AI_MODEL},
  {id: 'openai/gpt-oss-20b:free'},
  {id: 'google/gemma-4-31b-it:free'},
];

/** Low-cost paid models; require OpenRouter credits. */
export const CHEAP_PAID_AI_MODELS: readonly AiModelSuggestion[] = [
  {id: 'z-ai/glm-4.7-flash', priceHint: '~$0.06/$0.40 per M tokens'},
  {id: 'qwen/qwen3-30b-a3b-instruct-2507', priceHint: '~$0.05/$0.19 per M tokens'},
  {id: 'deepseek/deepseek-v3.2', priceHint: '~$0.27/$0.40 per M tokens'},
  {id: 'moonshotai/kimi-k2', priceHint: '~$0.57/$2.30 per M tokens'},
];

export type AiProviderErrorKind =
  /** No API key configured. */
  | 'missing_key'
  /** API key rejected by the provider (401/403). */
  | 'invalid_key'
  /** Device is offline. */
  | 'offline'
  /** Request exceeded the client-side timeout. */
  | 'timeout'
  /** User aborted the request. */
  | 'cancelled'
  /** HTTP 429. */
  | 'rate_limited'
  /** HTTP 402 — OpenRouter credits exhausted. */
  | 'insufficient_credits'
  /** HTTP 404 — model id not available. */
  | 'model_unavailable'
  /** Response was not a usable chat completion. */
  | 'invalid_response'
  | 'unknown';

/**
 * Error thrown by providers. `message` is safe for developers but MUST never
 * contain the API key, request payloads, or transaction notes.
 */
export class ProviderError extends Error {
  readonly kind: AiProviderErrorKind;
  /**
   * The provider's own error message (e.g. OpenRouter's `error.message`
   * body), so users can tell "model not found" apart from "bad key" or
   * "no credits". Never includes the API key or request payload.
   */
  readonly details?: string;

  constructor(kind: AiProviderErrorKind, message?: string, details?: string) {
    super(message ?? `AI provider error: ${kind}`);
    this.name = 'ProviderError';
    this.kind = kind;
    this.details = details;
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface SummaryRequest {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  /** External cancellation (e.g. user tapped Cancel). */
  signal?: AbortSignal;
  /** Client-side timeout; defaults to 30s. */
  timeoutMs?: number;
  /** Cap response size (used by cheap connectivity tests). */
  maxTokens?: number;
}

export interface SummaryProvider {
  readonly name: string;
  /**
   * Returns the raw assistant message text.
   * Throws ProviderError for every failure mode.
   */
  generateSummary(request: SummaryRequest): Promise<string>;
}
