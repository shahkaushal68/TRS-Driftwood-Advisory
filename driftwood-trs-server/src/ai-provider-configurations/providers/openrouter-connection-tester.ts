import { describeOpenRouterHttpError } from './openrouter-http-errors';

export interface ConnectionTestResult {
  ok: boolean;
  /** Sanitized, user-facing message — never includes the API key or raw provider payload. */
  message: string;
}

/**
 * Sends a minimal chat completion request to verify an OpenRouter API key + model work.
 * Swap this function's body for another gateway (e.g. Vercel AI Gateway) without touching
 * the service — `AiProviderConfigurationsService.testConnection` only depends on this signature.
 */
export async function testOpenRouterConnection(
  baseUrl: string,
  apiKey: string,
  model: string,
  timeoutSeconds: number,
  maxTokens: number,
): Promise<ConnectionTestResult> {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: 'Hello' }],
      }),
      signal: AbortSignal.timeout(timeoutSeconds * 1000),
    });
  } catch {
    return { ok: false, message: 'Could not reach the AI provider gateway' };
  }

  if (!response.ok) {
    return { ok: false, message: await describeOpenRouterHttpError(response) };
  }

  return { ok: true, message: 'Connection successful' };
}
