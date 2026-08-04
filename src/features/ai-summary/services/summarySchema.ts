/**
 * Zod validation for AI summary responses, with one safe extraction retry:
 * strip code fences / locate the first {...} block, then re-validate.
 */
import {z} from 'zod';

export const summaryContentSchema = z.object({
  headline: z.string().trim().min(1),
  overview: z.string().trim().min(1),
  highlights: z.array(z.string()).catch([]).default([]),
  warnings: z.array(z.string()).catch([]).default([]),
  suggestions: z.array(z.string()).catch([]).default([]),
  comparison: z.string().catch('').default(''),
});

export type SummaryContent = z.infer<typeof summaryContentSchema>;

function validate(candidate: string): SummaryContent | null {
  try {
    const parsed: unknown = JSON.parse(candidate);
    const result = summaryContentSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

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
 * Parse raw model output into a validated SummaryContent.
 * Returns null when no valid summary can be recovered — callers then fall
 * back to the deterministic local summary.
 */
export function parseSummaryContent(raw: string): SummaryContent | null {
  const direct = validate(raw.trim());
  if (direct) {
    return direct;
  }
  const unfenced = raw.replace(CODE_FENCE_PATTERN, '').trim();
  if (unfenced !== raw.trim()) {
    const fromFence = validate(unfenced);
    if (fromFence) {
      return fromFence;
    }
  }
  const extracted = extractFirstJsonObject(raw);
  return extracted ? validate(extracted) : null;
}
