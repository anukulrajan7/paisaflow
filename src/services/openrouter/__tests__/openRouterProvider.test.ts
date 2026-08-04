/**
 * Provider error surfacing: the exact OpenRouter error body must reach the
 * caller as ProviderError.details so the UI can show "model not found" vs
 * "bad key" vs "no credits". fetch is stubbed; no network involved.
 */
import {createOpenRouterProvider} from '../openRouterProvider';
import {ProviderError} from '../types';

const REQUEST = {
  apiKey: 'sk-or-test',
  model: 'openrouter/free',
  messages: [{role: 'user' as const, content: 'hi'}],
};

function mockResponse({
  ok,
  status,
  jsonBody,
  textBody,
}: {
  ok: boolean;
  status: number;
  jsonBody?: unknown;
  textBody?: string;
}) {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(jsonBody),
    text: jest.fn().mockResolvedValue(textBody ?? JSON.stringify(jsonBody)),
  } as unknown as Response;
}

const mockFetch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

describe('createOpenRouterProvider error details', () => {
  it('surfaces the provider message for a dead model id (404)', async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        ok: false,
        status: 404,
        jsonBody: {
          error: {
            message: 'No endpoints found for meta-llama/llama-3.1-8b-instruct.',
            code: 404,
          },
        },
      }),
    );

    const error = await createOpenRouterProvider()
      .generateSummary(REQUEST)
      .catch(e => e);

    expect(error).toBeInstanceOf(ProviderError);
    expect(error.kind).toBe('model_unavailable');
    expect(error.details).toBe(
      'No endpoints found for meta-llama/llama-3.1-8b-instruct.',
    );
  });

  it('surfaces the provider message for a rejected key (401)', async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        ok: false,
        status: 401,
        jsonBody: {error: {message: 'User not found.'}},
      }),
    );

    const error = await createOpenRouterProvider()
      .generateSummary(REQUEST)
      .catch(e => e);

    expect(error.kind).toBe('invalid_key');
    expect(error.details).toBe('User not found.');
  });

  it('maps 402 to insufficient_credits', async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        ok: false,
        status: 402,
        jsonBody: {
          error: {message: 'Insufficient credits. Add more using https://openrouter.ai/credits'},
        },
      }),
    );

    const error = await createOpenRouterProvider()
      .generateSummary(REQUEST)
      .catch(e => e);

    expect(error.kind).toBe('insufficient_credits');
    expect(error.details).toContain('Insufficient credits');
  });

  it('falls back to the raw body when it is not JSON', async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        ok: false,
        status: 429,
        textBody: 'Rate limit exceeded',
      }),
    );

    const error = await createOpenRouterProvider()
      .generateSummary(REQUEST)
      .catch(e => e);

    expect(error.kind).toBe('rate_limited');
    expect(error.details).toBe('Rate limit exceeded');
  });

  it('leaves details undefined when the body is empty', async () => {
    mockFetch.mockResolvedValue(
      mockResponse({ok: false, status: 500, textBody: '  '}),
    );

    const error = await createOpenRouterProvider()
      .generateSummary(REQUEST)
      .catch(e => e);

    expect(error.kind).toBe('unknown');
    expect(error.details).toBeUndefined();
  });

  it('truncates very long error bodies', async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        ok: false,
        status: 400,
        jsonBody: {error: {message: 'x'.repeat(1000)}},
      }),
    );

    const error = await createOpenRouterProvider()
      .generateSummary(REQUEST)
      .catch(e => e);

    expect(error.details).toHaveLength(300);
  });

  it('returns the assistant content on success', async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        jsonBody: {choices: [{message: {content: 'ok'}}]},
      }),
    );

    await expect(
      createOpenRouterProvider().generateSummary(REQUEST),
    ).resolves.toBe('ok');
  });
});
