import type { AiProviderConfigurationRow } from './ai-provider-configurations.repository';

/** Public shape of a configuration — `apiKey` is never included. */
export type SanitizedAiProviderConfiguration = Omit<AiProviderConfigurationRow, 'apiKey'> & {
  hasApiKey: boolean;
};

/**
 * Server-internal shape with `apiKey` decrypted to plaintext. Only ever returned by
 * `AiProviderConfigurationsService.getActiveConfigForExecution()` for use by an outbound
 * provider client (e.g. `OpenRouterClient`) — never serialize this over HTTP or log it.
 * Client-facing code must keep using `SanitizedAiProviderConfiguration`/`list()`.
 */
export type DecryptedAiProviderConfiguration = Omit<AiProviderConfigurationRow, 'apiKey'> & {
  apiKey: string;
};
