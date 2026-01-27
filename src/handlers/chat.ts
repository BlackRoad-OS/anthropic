/**
 * Chat completion handler for Anthropic API integration
 */

import type { Env, ChatRequest, ChatResponse, StreamEvent } from '../types';
import { jsonResponse, errors, streamResponse, formatSSE } from '../utils/response';
import { validateChatRequest, parseJsonBody } from '../utils/validation';
import { Logger } from '../utils/logger';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';

interface AnthropicApiRequest {
  model: string;
  max_tokens: number;
  messages: ChatRequest['messages'];
  system?: string;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stream?: boolean;
  stop_sequences?: string[];
  tools?: ChatRequest['tools'];
  tool_choice?: ChatRequest['tool_choice'];
  metadata?: Record<string, string>;
}

/**
 * Handle chat completion request
 */
export async function handleChatCompletion(
  request: Request,
  env: Env,
  requestId: string,
  logger: Logger
): Promise<Response> {
  const startTime = Date.now();

  // Parse request body
  const { data: body, error: parseError } = await parseJsonBody<ChatRequest>(request);
  if (parseError || !body) {
    logger.warn('Invalid request body', { error: parseError });
    return errors.badRequest(requestId, parseError || 'Invalid request body');
  }

  // Validate request
  const validation = validateChatRequest(body);
  if (!validation.valid) {
    logger.warn('Validation failed', { errors: validation.errors });
    return errors.badRequest(requestId, 'Validation failed', { errors: validation.errors });
  }

  // Check for Anthropic API key
  if (!env.ANTHROPIC_API_KEY) {
    logger.error('Anthropic API key not configured');
    return errors.internalError(requestId, 'API configuration error');
  }

  // Build Anthropic API request
  const maxTokens = body.max_tokens ?? parseInt(env.MAX_TOKENS_DEFAULT || '4096', 10);
  const anthropicRequest: AnthropicApiRequest = {
    model: body.model || DEFAULT_MODEL,
    max_tokens: maxTokens,
    messages: body.messages,
    ...(body.system && { system: body.system }),
    ...(body.temperature !== undefined && { temperature: body.temperature }),
    ...(body.top_p !== undefined && { top_p: body.top_p }),
    ...(body.top_k !== undefined && { top_k: body.top_k }),
    ...(body.stream && { stream: true }),
    ...(body.stop_sequences && { stop_sequences: body.stop_sequences }),
    ...(body.tools && { tools: body.tools }),
    ...(body.tool_choice && { tool_choice: body.tool_choice }),
    ...(body.metadata && { metadata: body.metadata }),
  };

  logger.info('Sending request to Anthropic API', {
    model: anthropicRequest.model,
    max_tokens: anthropicRequest.max_tokens,
    stream: body.stream,
    message_count: body.messages.length,
  });

  try {
    // Make request to Anthropic API
    const anthropicResponse = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': env.ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify(anthropicRequest),
    });

    // Handle streaming response
    if (body.stream && anthropicResponse.body) {
      logger.info('Starting streaming response');
      return handleStreamingResponse(anthropicResponse, requestId, logger);
    }

    // Handle non-streaming response
    if (!anthropicResponse.ok) {
      const errorBody = await anthropicResponse.text();
      logger.error('Anthropic API error', {
        status: anthropicResponse.status,
        body: errorBody,
      });

      if (anthropicResponse.status === 401) {
        return errors.internalError(requestId, 'Invalid API key configuration');
      }
      if (anthropicResponse.status === 429) {
        return errors.rateLimited(requestId, 60);
      }
      if (anthropicResponse.status >= 500) {
        return errors.serviceUnavailable(requestId, 'Anthropic API is temporarily unavailable');
      }

      return errors.badRequest(requestId, `Anthropic API error: ${errorBody}`);
    }

    const responseData = await anthropicResponse.json() as ChatResponse;

    logger.info('Received response from Anthropic API', {
      id: responseData.id,
      model: responseData.model,
      stop_reason: responseData.stop_reason,
      input_tokens: responseData.usage?.input_tokens,
      output_tokens: responseData.usage?.output_tokens,
      latency_ms: Date.now() - startTime,
    });

    return jsonResponse(responseData, requestId, 200, startTime);
  } catch (error) {
    logger.exception(error instanceof Error ? error : new Error(String(error)));
    return errors.internalError(requestId, 'Failed to process chat completion');
  }
}

/**
 * Handle streaming response from Anthropic API
 */
function handleStreamingResponse(
  anthropicResponse: Response,
  requestId: string,
  logger: Logger
): Response {
  const encoder = new TextEncoder();

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      // Pass through the SSE data from Anthropic
      controller.enqueue(chunk);
    },
    flush(controller) {
      // Send a final done event
      const doneEvent = formatSSE('done', { request_id: requestId });
      controller.enqueue(encoder.encode(doneEvent));
      logger.info('Streaming response completed');
    },
  });

  const stream = anthropicResponse.body!.pipeThrough(transformStream);
  return streamResponse(stream, requestId);
}

/**
 * Handle chat completion with conversation history from Durable Object
 */
export async function handleChatWithHistory(
  request: Request,
  env: Env,
  requestId: string,
  conversationId: string,
  logger: Logger
): Promise<Response> {
  // Get or create the Durable Object for this conversation
  const id = env.CONVERSATION.idFromName(conversationId);
  const stub = env.CONVERSATION.get(id);

  // Forward the request to the Durable Object
  const url = new URL(request.url);
  url.pathname = '/chat';

  const doRequest = new Request(url.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });

  try {
    const response = await stub.fetch(doRequest);
    return response;
  } catch (error) {
    logger.exception(error instanceof Error ? error : new Error(String(error)));
    return errors.internalError(requestId, 'Failed to process conversation');
  }
}
