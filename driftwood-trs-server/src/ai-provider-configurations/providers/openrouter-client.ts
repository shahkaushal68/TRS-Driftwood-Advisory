import { Injectable, Logger } from '@nestjs/common';

import { AiProviderConfigurationsService } from '../ai-provider-configurations.service';
import { describeOpenRouterHttpError } from './openrouter-http-errors';

export interface ExecuteReviewParams {
  /** The active prompt version's content — sent as the `system` message. */
  promptContent: string;
  /** The evidence document's extracted text — sent as the `user` message. */
  documentContent: string;
  /** Overrides the active configuration's `defaultModel`, if provided. */
  model?: string;
}

export interface OpenRouterReviewSuccess {
  ok: true;
  provider: 'openrouter';
  /** The model that actually produced the response (from the provider's response body,
   *  falling back to the requested model if the provider didn't echo one back). */
  model: string;
  /** The assistant message's text content — raw model output, not yet parsed. */
  content: string;
  /** Full raw provider response body, for audit/debugging. */
  rawResponse: Record<string, unknown>;
  usage?:
    | {
        promptTokens?: number | undefined;
        completionTokens?: number | undefined;
        totalTokens?: number | undefined;
      }
    | undefined;
}

export type OpenRouterReviewErrorCode =
  | 'missing_configuration'
  | 'missing_api_key'
  | 'invalid_api_key'
  | 'http_error'
  | 'timeout'
  | 'invalid_response'
  | 'network_error';

export interface OpenRouterReviewFailure {
  ok: false;
  errorCode: OpenRouterReviewErrorCode;
  /** Sanitized, safe to log/persist — never includes the API key or raw provider payload. */
  errorMessage: string;
}

export type OpenRouterReviewResult = OpenRouterReviewSuccess | OpenRouterReviewFailure;

/**
 * Talks to OpenRouter's chat completions API — nothing else. `AIReviewService` (a separate,
 * later piece of work) is expected to gather `promptContent`/`documentContent` itself
 * (eligibility, document retrieval, prompt retrieval) and persist whatever `executeReview`
 * returns; this class has no knowledge of any of that.
 *
 * Every call reads `baseUrl`/`apiKey`/`defaultModel`/`timeoutSeconds`/`maxTokens` fresh from
 * the active `AiProviderConfiguration` — nothing here is hardcoded, and nothing here decides
 * what "active" means (that's `AiProviderConfigurationsService`'s job).
 *
 * Never throws for an anticipated failure (missing config, bad key, HTTP error, timeout,
 * malformed response, network failure) — every one of those resolves to
 * `{ ok: false, errorCode, errorMessage }` so a caller can persist the outcome directly
 * without try/catch. Only genuinely unexpected errors (bugs) would bubble as exceptions.
 */
@Injectable()
export class OpenRouterClient {
  private readonly logger = new Logger(OpenRouterClient.name);

  constructor(private readonly providerConfigService: AiProviderConfigurationsService) {}

  async executeReview(params: ExecuteReviewParams): Promise<OpenRouterReviewResult> {
    const config = await this.providerConfigService.getActiveConfigForExecution();

    if (!config) {
      return this.fail('missing_configuration', 'No active AI provider configuration is set up');
    }
    if (!config.apiKey) {
      return this.fail('missing_api_key', 'The active AI provider configuration has no API key');
    }

    const model = params.model ?? config.defaultModel;
    const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: config.maxTokens,
          messages: [
            { role: 'system', content: params.promptContent },
            { role: 'user', content: params.documentContent },
          ],
        }),
        signal: AbortSignal.timeout(config.timeoutSeconds * 1000),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        return this.fail(
          'timeout',
          `The AI provider did not respond within ${String(config.timeoutSeconds)}s`,
        );
      }
      return this.fail('network_error', 'Could not reach the AI provider gateway');
    }

    if (!response.ok) {
      const message = await describeOpenRouterHttpError(response);
      const errorCode: OpenRouterReviewErrorCode =
        response.status === 401 || response.status === 403 ? 'invalid_api_key' : 'http_error';
      return this.fail(errorCode, message);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return this.fail(
        'invalid_response',
        'The AI provider returned a response that was not valid JSON',
      );
    }

    const content = extractMessageContent(body);
    if (content === null) {
      return this.fail(
        'invalid_response',
        'The AI provider response did not contain a chat completion message',
      );
    }

    return {
      ok: true,
      provider: 'openrouter',
      model: extractResponseModel(body) ?? model,
      content,
      rawResponse: body as Record<string, unknown>,
      usage: extractUsage(body),
    };
  }

  private fail(
    errorCode: OpenRouterReviewErrorCode,
    errorMessage: string,
  ): OpenRouterReviewFailure {
    // `errorMessage` is always already sanitized by this point (see `describeOpenRouterHttpError`
    // and the literals above) — never includes the API key, the Authorization header, or a
    // raw provider payload.
    this.logger.warn(`OpenRouter review request failed [${errorCode}]: ${errorMessage}`);
    return { ok: false, errorCode, errorMessage };
  }
}

function extractMessageContent(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;

  const first: unknown = choices[0];
  if (typeof first !== 'object' || first === null) return null;
  const message = (first as { message?: unknown }).message;
  if (typeof message !== 'object' || message === null) return null;

  const content = (message as { content?: unknown }).content;
  return typeof content === 'string' && content.length > 0 ? content : null;
}

function extractResponseModel(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const model = (body as { model?: unknown }).model;
  return typeof model === 'string' && model.length > 0 ? model : null;
}

function extractUsage(body: unknown): OpenRouterReviewSuccess['usage'] {
  if (typeof body !== 'object' || body === null) return undefined;
  const usage = (body as { usage?: unknown }).usage;
  if (typeof usage !== 'object' || usage === null) return undefined;

  const u = usage as Record<string, unknown>;
  const promptTokens = typeof u['prompt_tokens'] === 'number' ? u['prompt_tokens'] : undefined;
  const completionTokens =
    typeof u['completion_tokens'] === 'number' ? u['completion_tokens'] : undefined;
  const totalTokens = typeof u['total_tokens'] === 'number' ? u['total_tokens'] : undefined;

  if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
    return undefined;
  }
  return { promptTokens, completionTokens, totalTokens };
}
