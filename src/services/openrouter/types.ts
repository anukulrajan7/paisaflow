/**
 * Contract for AI summary providers.
 *
 * The app talks to a `SummaryProvider`, never to OpenRouter directly — a
 * backend proxy can implement this same interface later and be swapped in
 * without touching feature code.
 */

/** Model used when the user has not chosen one in AI settings. */
export const DEFAULT_AI_MODEL = 'meta-llama/llama-3.1-8b-instruct';

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

  constructor(kind: AiProviderErrorKind, message?: string) {
    super(message ?? `AI provider error: ${kind}`);
    this.name = 'ProviderError';
    this.kind = kind;
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
