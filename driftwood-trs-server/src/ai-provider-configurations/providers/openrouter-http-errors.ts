/**
 * Shared error-message sanitization for any OpenRouter HTTP call — used by both
 * `openrouter-connection-tester.ts` (test-connection ping) and `openrouter-client.ts` (real
 * chat completions), so the "what's safe to surface" rules stay in one place.
 */

/**
 * OpenRouter's error body (`{ error: { message, code } }`) describes account/billing/model
 * problems in plain language — safe to surface since it's about the account, not the key itself.
 * Falls back to a status-code-based message if the body can't be parsed.
 */
export async function describeOpenRouterHttpError(response: Response): Promise<string> {
  const providerMessage = await extractProviderMessage(response);

  switch (response.status) {
    case 401:
    case 403:
      return 'The AI provider rejected the API key — it may be invalid or revoked';
    case 402:
      return providerMessage
        ? `The AI provider account has insufficient credits: ${providerMessage}`
        : 'The AI provider account has insufficient credits or requires payment (HTTP 402)';
    case 404:
      return 'The configured model was not found — check the model name';
    case 429:
      return 'The AI provider rate-limited this request — try again shortly';
    default:
      return providerMessage
        ? `The AI provider returned an error (HTTP ${response.status}): ${providerMessage}`
        : `The AI provider returned an error (HTTP ${response.status})`;
  }
}

async function extractProviderMessage(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    const message = body.error?.message;
    return typeof message === 'string' && message.length > 0 ? message.slice(0, 300) : null;
  } catch {
    return null;
  }
}
