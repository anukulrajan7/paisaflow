/**
 * Lenient JSON-object extraction for AI replies: models sometimes wrap JSON in
 * code fences or surround it with prose despite instructions. Same approach as
 * ai-summary's summarySchema, kept feature-local so features stay decoupled.
 */

/** Extract the first balanced {...} block, ignoring braces inside strings. */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) {
    return null;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

const CODE_FENCE_PATTERN = /```(?:json)?/gi;

/**
 * Candidate raw-JSON strings to try parsing, most faithful first: the raw
 * reply, the reply with code fences stripped, then the first balanced JSON
 * object found inside it.
 */
export function jsonCandidates(raw: string): string[] {
  const candidates = [raw.trim()];
  const unfenced = raw.replace(CODE_FENCE_PATTERN, '').trim();
  if (unfenced.length > 0 && unfenced !== candidates[0]) {
    candidates.push(unfenced);
  }
  const extracted = extractFirstJsonObject(raw);
  if (extracted) {
    candidates.push(extracted);
  }
  return candidates;
}
