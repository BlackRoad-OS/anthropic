/**
 * Authentication middleware for API key validation
 */

import type { Env } from '../types';

export interface AuthResult {
  authenticated: boolean;
  error?: string;
  userId?: string;
}

/**
 * Extract API key from request headers
 * Supports both "Authorization: Bearer <key>" and "X-API-Key: <key>" formats
 */
export function extractApiKey(request: Request): string | null {
  // Try Authorization header first (Bearer token)
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Fall back to X-API-Key header
  const apiKeyHeader = request.headers.get('X-API-Key');
  if (apiKeyHeader) {
    return apiKeyHeader;
  }

  return null;
}

/**
 * Validate the API key
 * In production, this should validate against a database or external service
 */
export async function validateApiKey(
  apiKey: string,
  env: Env
): Promise<AuthResult> {
  // Check if API key is provided
  if (!apiKey) {
    return { authenticated: false, error: 'API key is required' };
  }

  // Validate against the secret API key
  // In production, you'd want to hash keys and compare, or use a database
  if (apiKey !== env.API_SECRET_KEY) {
    // For development, also check if it's a valid-looking key format
    if (!apiKey.startsWith('sk-') && !apiKey.startsWith('ak-')) {
      return { authenticated: false, error: 'Invalid API key format' };
    }

    // In a real implementation, you would:
    // 1. Hash the API key
    // 2. Look it up in D1 database or KV
    // 3. Check if it's active and not expired
    // 4. Return the associated user ID

    // For now, we'll check against the secret key only
    if (env.API_SECRET_KEY && apiKey !== env.API_SECRET_KEY) {
      return { authenticated: false, error: 'Invalid API key' };
    }
  }

  return { authenticated: true, userId: 'user_default' };
}

/**
 * Authenticate a request
 */
export async function authenticateRequest(
  request: Request,
  env: Env
): Promise<AuthResult> {
  const apiKey = extractApiKey(request);

  if (!apiKey) {
    return { authenticated: false, error: 'API key is required. Use Authorization: Bearer <key> or X-API-Key header.' };
  }

  return validateApiKey(apiKey, env);
}

/**
 * Check if a path should skip authentication
 */
export function shouldSkipAuth(path: string): boolean {
  const publicPaths = [
    '/health',
    '/ready',
    '/live',
    '/v1/health',
    '/api/health',
    '/',
  ];

  return publicPaths.includes(path);
}
