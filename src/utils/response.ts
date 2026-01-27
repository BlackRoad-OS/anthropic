/**
 * Response utility functions for consistent API responses
 */

import type { ApiResponse, ApiError, ResponseMeta } from '../types';

const API_VERSION = 'v1';

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `req_${timestamp}_${random}`;
}

/**
 * Create response metadata
 */
export function createMeta(requestId: string, startTime?: number): ResponseMeta {
  return {
    request_id: requestId,
    timestamp: new Date().toISOString(),
    version: API_VERSION,
    ...(startTime && { latency_ms: Date.now() - startTime }),
  };
}

/**
 * Create a successful JSON response
 */
export function jsonResponse<T>(
  data: T,
  requestId: string,
  status = 200,
  startTime?: number
): Response {
  const body: ApiResponse<T> = {
    success: true,
    data,
    meta: createMeta(requestId, startTime),
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
    },
  });
}

/**
 * Create an error JSON response
 */
export function errorResponse(
  code: string,
  message: string,
  requestId: string,
  status = 400,
  details?: Record<string, unknown>
): Response {
  const error: ApiError = {
    code,
    message,
    ...(details && { details }),
  };

  const body: ApiResponse = {
    success: false,
    error,
    meta: createMeta(requestId),
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
    },
  });
}

/**
 * Common error responses
 */
export const errors = {
  badRequest: (requestId: string, message = 'Bad request', details?: Record<string, unknown>) =>
    errorResponse('BAD_REQUEST', message, requestId, 400, details),

  unauthorized: (requestId: string, message = 'Unauthorized') =>
    errorResponse('UNAUTHORIZED', message, requestId, 401),

  forbidden: (requestId: string, message = 'Forbidden') =>
    errorResponse('FORBIDDEN', message, requestId, 403),

  notFound: (requestId: string, message = 'Not found') =>
    errorResponse('NOT_FOUND', message, requestId, 404),

  methodNotAllowed: (requestId: string, allowed: string[]) =>
    errorResponse('METHOD_NOT_ALLOWED', `Method not allowed. Allowed: ${allowed.join(', ')}`, requestId, 405),

  rateLimited: (requestId: string, retryAfter: number) => {
    const response = errorResponse(
      'RATE_LIMITED',
      'Too many requests. Please try again later.',
      requestId,
      429
    );
    response.headers.set('Retry-After', retryAfter.toString());
    return response;
  },

  internalError: (requestId: string, message = 'Internal server error') =>
    errorResponse('INTERNAL_ERROR', message, requestId, 500),

  serviceUnavailable: (requestId: string, message = 'Service temporarily unavailable') =>
    errorResponse('SERVICE_UNAVAILABLE', message, requestId, 503),
};

/**
 * Create a streaming response for SSE
 */
export function streamResponse(
  stream: ReadableStream,
  requestId: string
): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Request-ID': requestId,
    },
  });
}

/**
 * Format Server-Sent Event data
 */
export function formatSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
