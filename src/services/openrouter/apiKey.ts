/**
 * Client-side helpers for the OpenRouter API key the user pastes into
 * AI settings. Pasted keys frequently carry a trailing newline or stray
 * spaces (copied from a web page or email) — sending that key as-is makes
 * OpenRouter return 401 and looks exactly like a "bad key".
 */

const OPENROUTER_KEY_PREFIX = 'sk-or-';

/**
 * Normalize a pasted key: strip ALL whitespace (leading, trailing, and any
 * newlines/tabs/spaces copied along with the key). Keys never contain
 * whitespace, so this is always safe. Returns '' for blank input.
 */
export function normalizeOpenRouterApiKey(raw: string): string {
  return raw.replace(/\s+/g, '');
}

/**
 * Gentle-format check: real OpenRouter keys start with 'sk-or-'.
 * Used to warn, never to block — OpenRouter could issue other formats.
 */
export function isLikelyOpenRouterKey(key: string): boolean {
  return normalizeOpenRouterApiKey(key).startsWith(OPENROUTER_KEY_PREFIX);
}
