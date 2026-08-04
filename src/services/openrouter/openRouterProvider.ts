/**
 * OpenRouter implementation of SummaryProvider.
 *
 * Direct client-to-OpenRouter calls using the key from the device keychain.
 * A backend proxy can replace this provider later (same interface) to keep
 * keys off the device entirely.
 *
 * Never log the API key, request bodies, or full responses here.
 */
import {ProviderError} from './types';
import type {AiProviderErrorKind, SummaryProvider} from './types';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 30_000;

function errorFromStatus(status: number): ProviderError {
  const kindByStatus: Record<number, AiProviderErrorKind> = {
    401: 'invalid_key',
    402: 'insufficient_credits',
    403: 'invalid_key',
    404: 'model_unavailable',
    429: 'rate_limited',
  };
  return new ProviderError(kindByStatus[status] ?? 'unknown');
}

const MAX_DETAILS_LENGTH = 300;

/**
 * Pull the provider's own error message out of an error response body so the
 * user can see the precise reason ("model not found" vs "bad key" vs "no
 * credits"). OpenRouter error bodies never contain the request API key.
 */
async function extractErrorDetails(response: Response): Promise<string | undefined> {
  let body: string;
  try {
    body = await response.text();
  } catch {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === 'object' && parsed !== null) {
      const message = (parsed as {error?: {message?: unknown}}).error?.message;
      if (typeof message === 'string' && message.trim().length > 0) {
        return message.trim().slice(0, MAX_DETAILS_LENGTH);
      }
    }
  } catch {
    // Not JSON — fall through to the raw body.
  }
  const trimmed = body.trim();
  return trimmed.length > 0 ? trimmed.slice(0, MAX_DETAILS_LENGTH) : undefined;
}

/** Pull the assistant text out of a chat-completion response. */
function extractContent(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const choices = (data as {choices?: unknown}).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }
  const first = choices[0] as {message?: {content?: unknown}} | undefined;
  const content = first?.message?.content;
  return typeof content === 'string' && content.trim().length > 0
    ? content
    : null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function createOpenRouterProvider(): SummaryProvider {
  return {
    name: 'openrouter',

    async generateSummary({
      apiKey,
      model,
      messages,
      signal,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      maxTokens,
    }) {
      if (signal?.aborted) {
        throw new ProviderError('cancelled');
      }

      // One controller governs both the client timeout and user cancellation.
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      const onExternalAbort = () => controller.abort();
      signal?.addEventListener('abort', onExternalAbort);

      try {
        const response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://paisaflow.app',
            'X-Title': 'PaisaFlow',
          },
          body: JSON.stringify({
            model,
            messages,
            ...(maxTokens != null ? {max_tokens: maxTokens} : {}),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const base = errorFromStatus(response.status);
          const details = await extractErrorDetails(response);
          throw new ProviderError(base.kind, base.message, details);
        }

        const data: unknown = await response.json();
        const content = extractContent(data);
        if (content == null) {
          throw new ProviderError('invalid_response');
        }
        return content;
      } catch (error) {
        if (error instanceof ProviderError) {
          throw error;
        }
        if (timedOut) {
          throw new ProviderError('timeout');
        }
        if (isAbortError(error)) {
          throw new ProviderError(signal?.aborted ? 'cancelled' : 'timeout');
        }
        // Network failures (DNS, no connectivity) land here.
        throw new ProviderError('unknown');
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onExternalAbort);
      }
    },
  };
}
