/**
 * Cloudflare Workers entry point for Anthropic API integrations
 *
 * This worker provides a proxy and enhancement layer for Anthropic's Claude API,
 * with support for:
 * - Chat completions (streaming and non-streaming)
 * - Conversation history via Durable Objects
 * - Rate limiting via KV
 * - Caching and session management
 * - Health checks and monitoring
 */

import type { Env, QueueMessage } from './types';
import { generateRequestId, errors } from './utils/response';
import { createLogger } from './utils/logger';
import { handlePreflight, addCorsHeaders } from './middleware/cors';
import { authenticateRequest, shouldSkipAuth } from './middleware/auth';
import { checkRateLimit, getRateLimitIdentifier, addRateLimitHeaders } from './middleware/rate-limit';
import { handleChatCompletion, handleChatWithHistory } from './handlers/chat';
import { handleHealthCheck, handleLiveness, handleReadiness } from './handlers/health';

// Re-export Durable Object class
export { ConversationDurableObject } from './durable-objects/conversation';

export default {
  /**
   * Main fetch handler for incoming HTTP requests
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startTime = Date.now();
    const requestId = generateRequestId();
    const logger = createLogger(env.LOG_LEVEL || 'info', requestId);

    // Log incoming request
    logger.request(request);

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return handlePreflight(request);
    }

    try {
      // Route the request
      let response = await routeRequest(request, env, ctx, path, method, requestId, logger);

      // Add CORS headers to response
      response = addCorsHeaders(response, request);

      // Log response
      logger.response(response.status, Date.now() - startTime);

      return response;
    } catch (error) {
      logger.exception(error instanceof Error ? error : new Error(String(error)));
      const response = errors.internalError(requestId, 'An unexpected error occurred');
      return addCorsHeaders(response, request);
    }
  },

  /**
   * Queue consumer for async task processing
   */
  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    const logger = createLogger(env.LOG_LEVEL || 'info');

    for (const message of batch.messages) {
      try {
        logger.info('Processing queue message', {
          type: message.body.type,
          request_id: message.body.metadata.request_id,
        });

        // Process based on message type
        switch (message.body.type) {
          case 'completion':
            // Handle async completion tasks
            await processCompletionTask(message.body, env);
            break;
          case 'embedding':
            // Handle embedding generation
            await processEmbeddingTask(message.body, env);
            break;
          case 'artifact':
            // Handle artifact storage
            await processArtifactTask(message.body, env);
            break;
          default:
            logger.warn('Unknown queue message type', { type: message.body.type });
        }

        message.ack();
      } catch (error) {
        logger.exception(error instanceof Error ? error : new Error(String(error)));
        message.retry();
      }
    }
  },

  /**
   * Scheduled handler for cron jobs
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const logger = createLogger(env.LOG_LEVEL || 'info');

    logger.info('Running scheduled task', {
      cron: event.cron,
      scheduled_time: new Date(event.scheduledTime).toISOString(),
    });

    // Add scheduled task logic here
    // Example: cleanup expired sessions, generate reports, etc.
  },
};

/**
 * Route incoming requests to appropriate handlers
 */
async function routeRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  path: string,
  method: string,
  requestId: string,
  logger: ReturnType<typeof createLogger>
): Promise<Response> {
  // Health check endpoints (no auth required)
  if (path === '/health' || path === '/v1/health') {
    return handleHealthCheck(env, requestId);
  }

  if (path === '/live' || path === '/v1/live') {
    return handleLiveness(requestId);
  }

  if (path === '/ready' || path === '/v1/ready') {
    return handleReadiness(env, requestId);
  }

  // Root endpoint
  if (path === '/' && method === 'GET') {
    return new Response(
      JSON.stringify({
        name: 'Anthropic Workers API',
        version: env.API_VERSION || 'v1',
        documentation: 'https://docs.anthropic.com',
      }),
      {
        headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId },
      }
    );
  }

  // Authenticate request for protected endpoints
  if (!shouldSkipAuth(path)) {
    const authResult = await authenticateRequest(request, env);
    if (!authResult.authenticated) {
      logger.warn('Authentication failed', { error: authResult.error });
      return errors.unauthorized(requestId, authResult.error);
    }

    // Check rate limit
    const identifier = getRateLimitIdentifier(request, authResult.userId);
    const rateLimitResult = await checkRateLimit(identifier, env);

    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', { identifier });
      const retryAfter = Math.ceil(
        (new Date(rateLimitResult.info.reset_at).getTime() - Date.now()) / 1000
      );
      return errors.rateLimited(requestId, retryAfter);
    }

    // Apply rate limit headers to subsequent responses
    ctx.waitUntil(
      (async () => {
        // Track analytics asynchronously
        try {
          env.ANALYTICS.writeDataPoint({
            blobs: [authResult.userId || 'anonymous', path, method],
            doubles: [1], // request count
            indexes: [requestId],
          });
        } catch {
          // Ignore analytics errors
        }
      })()
    );
  }

  // API v1 routes
  if (path.startsWith('/v1/')) {
    return routeV1Api(request, env, path, method, requestId, logger);
  }

  // Legacy routes (without /v1 prefix)
  if (path === '/chat/completions' || path === '/messages') {
    if (method !== 'POST') {
      return errors.methodNotAllowed(requestId, ['POST']);
    }
    return handleChatCompletion(request, env, requestId, logger);
  }

  // Not found
  return errors.notFound(requestId, `Endpoint not found: ${method} ${path}`);
}

/**
 * Route v1 API requests
 */
async function routeV1Api(
  request: Request,
  env: Env,
  path: string,
  method: string,
  requestId: string,
  logger: ReturnType<typeof createLogger>
): Promise<Response> {
  // Chat completions
  if (path === '/v1/chat/completions' || path === '/v1/messages') {
    if (method !== 'POST') {
      return errors.methodNotAllowed(requestId, ['POST']);
    }
    return handleChatCompletion(request, env, requestId, logger);
  }

  // Conversations with history (using Durable Objects)
  const conversationMatch = path.match(/^\/v1\/conversations\/([^/]+)\/messages$/);
  if (conversationMatch) {
    const conversationId = conversationMatch[1];
    if (!conversationId) {
      return errors.badRequest(requestId, 'Conversation ID is required');
    }

    if (method !== 'POST') {
      return errors.methodNotAllowed(requestId, ['POST']);
    }
    return handleChatWithHistory(request, env, requestId, conversationId, logger);
  }

  // Models list
  if (path === '/v1/models' && method === 'GET') {
    return new Response(
      JSON.stringify({
        object: 'list',
        data: [
          { id: 'claude-opus-4-20250514', object: 'model', created: 1715644800, owned_by: 'anthropic' },
          { id: 'claude-sonnet-4-20250514', object: 'model', created: 1715644800, owned_by: 'anthropic' },
          { id: 'claude-3-5-haiku-20241022', object: 'model', created: 1729555200, owned_by: 'anthropic' },
        ],
      }),
      {
        headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId },
      }
    );
  }

  return errors.notFound(requestId, `API endpoint not found: ${method} ${path}`);
}

/**
 * Process async completion task from queue
 */
async function processCompletionTask(message: QueueMessage, env: Env): Promise<void> {
  // Implement async completion processing
  // This could be used for long-running completions or batch processing
  console.log('Processing completion task:', message.metadata.request_id);
}

/**
 * Process embedding generation task from queue
 */
async function processEmbeddingTask(message: QueueMessage, env: Env): Promise<void> {
  // Implement embedding generation
  console.log('Processing embedding task:', message.metadata.request_id);
}

/**
 * Process artifact storage task from queue
 */
async function processArtifactTask(message: QueueMessage, env: Env): Promise<void> {
  // Implement artifact storage to R2
  console.log('Processing artifact task:', message.metadata.request_id);
}
