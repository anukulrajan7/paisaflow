import {isLikelyOpenRouterKey, normalizeOpenRouterApiKey} from '../apiKey';

describe('normalizeOpenRouterApiKey', () => {
  it('strips a trailing newline (the classic pasted-key 401)', () => {
    expect(normalizeOpenRouterApiKey('sk-or-abc123\n')).toBe('sk-or-abc123');
  });

  it('strips leading/trailing spaces and tabs', () => {
    expect(normalizeOpenRouterApiKey('  sk-or-abc123\t')).toBe('sk-or-abc123');
  });

  it('strips whitespace inside the key (multi-line copy)', () => {
    expect(normalizeOpenRouterApiKey('sk-or-abc\n123 456')).toBe(
      'sk-or-abc123456',
    );
  });

  it('returns an empty string for blank input', () => {
    expect(normalizeOpenRouterApiKey('')).toBe('');
    expect(normalizeOpenRouterApiKey('   \n ')).toBe('');
  });

  it('leaves an already-clean key untouched', () => {
    expect(normalizeOpenRouterApiKey('sk-or-abc123')).toBe('sk-or-abc123');
  });
});

describe('isLikelyOpenRouterKey', () => {
  it('accepts the sk-or- prefix', () => {
    expect(isLikelyOpenRouterKey('sk-or-abc123')).toBe(true);
  });

  it('accepts a prefixed key even with pasted whitespace', () => {
    expect(isLikelyOpenRouterKey('  sk-or-abc123\n')).toBe(true);
  });

  it('rejects other formats (warning only, never a hard block)', () => {
    expect(isLikelyOpenRouterKey('sk-ant-abc123')).toBe(false);
    expect(isLikelyOpenRouterKey('abc123')).toBe(false);
    expect(isLikelyOpenRouterKey('')).toBe(false);
  });
});
