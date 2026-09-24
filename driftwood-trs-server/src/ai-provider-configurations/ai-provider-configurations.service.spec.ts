jest.mock('../libs/encryption', () => ({
  encryptSecret: jest.fn((plain: string) => `encrypted(${plain})`),
  decryptSecret: jest.fn((cipher: string) => {
    const match = /^encrypted\((.*)\)$/.exec(cipher);
    if (!match?.[1]) throw new Error('not a value produced by the mocked encryptSecret');
    return match[1];
  }),
  lastFourOf: jest.fn((plain: string) => plain.slice(-4)),
}));

import type { AiProviderConfigurationRow } from './ai-provider-configurations.repository';
import type { AiProviderConfigurationsRepository } from './ai-provider-configurations.repository';
import { AiProviderConfigurationsService } from './ai-provider-configurations.service';

const FAKE_API_KEY = 'sk-or-real-secret-that-must-never-leave-the-server';

const storedRow: AiProviderConfigurationRow = {
  id: 'config-1',
  providerName: 'OpenRouter',
  providerType: 'openrouter',
  gatewayType: null,
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: `encrypted(${FAKE_API_KEY})`,
  apiKeyLastFour: FAKE_API_KEY.slice(-4),
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

describe('AiProviderConfigurationsService — security: API key handling', () => {
  let repository: jest.Mocked<Pick<AiProviderConfigurationsRepository, 'findAll' | 'findActive'>>;
  let service: AiProviderConfigurationsService;

  beforeEach(() => {
    repository = {
      findAll: jest.fn().mockResolvedValue([storedRow]),
      findActive: jest.fn().mockResolvedValue(storedRow),
    };
    service = new AiProviderConfigurationsService(
      repository as unknown as AiProviderConfigurationsRepository,
    );
  });

  it('list() never returns the API key, only a hasApiKey flag', async () => {
    const result = await service.list();

    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('apiKey');
    expect(JSON.stringify(result)).not.toContain(FAKE_API_KEY);
    expect(result[0]?.hasApiKey).toBe(true);
    expect(result[0]?.apiKeyLastFour).toBe(FAKE_API_KEY.slice(-4));
  });

  it('getActiveConfigForExecution() returns null when nothing is active (not an error)', async () => {
    repository.findActive.mockResolvedValue(null);

    await expect(service.getActiveConfigForExecution()).resolves.toBeNull();
  });

  it('getActiveConfigForExecution() decrypts the API key for server-internal use only', async () => {
    const config = await service.getActiveConfigForExecution();

    expect(config?.apiKey).toBe(FAKE_API_KEY);
  });
});
