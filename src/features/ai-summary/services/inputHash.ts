/**
 * Stable hash of the aggregate payload, used as the ai_summaries cache key.
 * Pure function: same payload → same hash, regardless of object key order.
 */

/** JSON.stringify with object keys sorted recursively (arrays keep order). */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map(
    key => `${JSON.stringify(key)}:${stableStringify(record[key])}`,
  );
  return `{${entries.join(',')}}`;
}

/** cyrb53 — fast, deterministic 53-bit hash (public domain). */
/* eslint-disable no-bitwise -- hashing is inherently bitwise */
function cyrb53(text: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (
    (h2 >>> 0).toString(16).padStart(8, '0') +
    (h1 >>> 0).toString(16).padStart(8, '0')
  );
}
/* eslint-enable no-bitwise */

export function hashAggregatePayload(payload: unknown): string {
  return cyrb53(stableStringify(payload));
}
