import { Logger } from '@nestjs/common';

import type { AiProviderConfigurationsService } from '../ai-provider-configurations.service';
import type { DecryptedAiProviderConfiguration } from '../ai-provider-configurations.types';
import { OpenRouterClient } from './openrouter-client';

const FAKE_API_KEY = 'sk-or-super-secret-test-key-do-not-leak-1234567890';

const baseConfig: DecryptedAiProviderConfiguration = {
  id: 'config-1',
  providerName: 'OpenRouter',
  providerType: 'openrouter',
  gatewayType: null,
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKeyLastFour: '7890',
  apiKey: FAKE_API_KEY,
  defaultModel: 'openai/gpt-4o',
  fallbackModel: null,
  environment: 'production',
  responseFormat: 'markdown',
  timeoutSeconds: 30,
  maxTokens: 4000,
  isActive: true,
  supportsMultipleModels: false,
  supportsFallback: false,
  connectionStatus: 'connected',
  lastConnectionTestAt: null,
  lastConnectionTestResult: null,
  lastConnectionError: null,
  createdByUserId: null,
  updatedByUserId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function buildFetchResponse(overrides: Partial<Response> & { jsonBody?: unknown } = {}): Response {
  const { jsonBody, ...rest } = overrides;
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(jsonBody ?? {}),
    ...rest,
  } as unknown as Response;
}

describe('OpenRouterClient.executeReview', () => {
  let providerConfigService: jest.Mocked<
    Pick<AiProviderConfigurationsService, 'getActiveConfigForExecution'>
  >;
  let client: OpenRouterClient;
  let warnSpy: jest.SpyInstance;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    providerConfigService = { getActiveConfigForExecution: jest.fn() };
    client = new OpenRouterClient(
      providerConfigService as unknown as AiProviderConfigurationsService,
    );
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** Every log line the client emitted during a test, flattened to strings, for the
   *  "never leaks the API key" assertions used across most cases below. */
  function allLoggedText(): string {
    return warnSpy.mock.calls.map((call) => call.join(' ')).join('\n');
  }

  it('returns a normalized success result and sends the prompt/document as system/user messages', async () => {
    providerConfigService.getActiveConfigForExecution.mockResolvedValue(baseConfig);
    fetchSpy.mockResolvedValue(
      buildFetchResponse({
        jsonBody: {
          model: 'openai/gpt-4o-2026',
          choices: [{ message: { role: 'assistant', content: 'Structured review output' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        },
      }),
    );

    const result = await client.executeReview({
      promptContent: 'system prompt',
      documentContent: 'document text',
    });

    expect(result).toEqual({
      ok: true,
      provider: 'openrouter',
      model: 'openai/gpt-4o-2026',
      content: 'Structured review output',
      rawResponse: expect.objectContaining({ model: 'openai/gpt-4o-2026' }),
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${FAKE_API_KEY}` });
    const body = JSON.parse(init.body as string) as {
      messages: { role: string; content: string }[];
    };
    expect(body.messages).toEqual([
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'document text' },
    ]);
  });

  it('fails with missing_configuration and never calls fetch when no provider config is active', async () => {
    providerConfigService.getActiveConfigForExecution.mockResolvedValue(null);

    const result = await client.executeReview({ promptContent: 'p', documentContent: 'd' });

    expect(result).toEqual({
      ok: false,
      errorCode: 'missing_configuration',
      errorMessage: expect.stringContaining('No active AI provider configuration'),
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails with missing_api_key and never calls fetch when the active config has no key', async () => {
    providerConfigService.getActiveConfigForExecution.mockResolvedValue({
      ...baseConfig,
      apiKey: '',
    });

    const result = await client.executeReview({ promptContent: 'p', documentContent: 'd' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe('missing_api_key');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps a 401 response to invalid_api_key', async () => {
    providerConfigService.getActiveConfigForExecution.mockResolvedValue(baseConfig);
    fetchSpy.mockResolvedValue(
      buildFetchResponse({ ok: false, status: 401, jsonBody: { error: { message: 'bad key' } } }),
    );

    const result = await client.executeReview({ promptContent: 'p', documentContent: 'd' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe('invalid_api_key');
      expect(result.errorMessage).not.toContain(FAKE_API_KEY);
    }
  });

  it('maps a generic non-2xx response to http_error', async () => {
    providerConfigService.getActiveConfigForExecution.mockResolvedValue(baseConfig);
    fetchSpy.mockResolvedValue(
      buildFetchResponse({ ok: false, status: 500, jsonBody: { error: { message: 'boom' } } }),
    );

    const result = await client.executeReview({ promptContent: 'p', documentContent: 'd' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe('http_error');
  });

  it('maps a rejected fetch (network failure) to network_error', async () => {
    providerConfigService.getActiveConfigForExecution.mockResolvedValue(baseConfig);
    fetchSpy.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

    const result = await client.executeReview({ promptContent: 'p', documentContent: 'd' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe('network_error');
  });

  it('maps a TimeoutError (as produced by AbortSignal.timeout) to timeout', async () => {
    providerConfigService.getActiveConfigForExecution.mockResolvedValue(baseConfig);
    const timeoutError = new Error('The operation timed out');
    timeoutError.name = 'TimeoutError';
    fetchSpy.mockRejectedValue(timeoutError);

    const result = await client.executeReview({ promptContent: 'p', documentContent: 'd' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe('timeout');
  });

  it('maps an unparseable JSON body to invalid_response', async () => {
    providerConfigService.getActiveConfigForExecution.mockResolvedValue(baseConfig);
    fetchSpy.mockResolvedValue(
      buildFetchResponse({ json: jest.fn().mockRejectedValue(new Error('not json')) }),
    );

    const result = await client.executeReview({ promptContent: 'p', documentContent: 'd' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe('invalid_response');
  });

  it('maps a well-formed but contentless response to invalid_response', async () => {
    providerConfigService.getActiveConfigForExecution.mockResolvedValue(baseConfig);
    fetchSpy.mockResolvedValue(buildFetchResponse({ jsonBody: { choices: [] } }));

    const result = await client.executeReview({ promptContent: 'p', documentContent: 'd' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe('invalid_response');
  });

  describe('security: the API key and Authorization header are never logged', () => {
    it('across every failure path exercised above', async () => {
      providerConfigService.getActiveConfigForExecution.mockResolvedValue(baseConfig);

      // 401
      fetchSpy.mockResolvedValueOnce(buildFetchResponse({ ok: false, status: 401 }));
      await client.executeReview({ promptContent: 'p', documentContent: 'd' });
      // 500
      fetchSpy.mockResolvedValueOnce(buildFetchResponse({ ok: false, status: 500 }));
      await client.executeReview({ promptContent: 'p', documentContent: 'd' });
      // network failure
      fetchSpy.mockRejectedValueOnce(new Error('network down'));
      await client.executeReview({ promptContent: 'p', documentContent: 'd' });

      const logged = allLoggedText();
      expect(logged).not.toContain(FAKE_API_KEY);
      expect(logged).not.toContain('Authorization');
      expect(logged).not.toContain('Bearer');
    });
  });
});
