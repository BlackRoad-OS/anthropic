/**
 * Rate limiting middleware using Cloudflare KV
 */

import type { Env, RateLimitInfo } from '../types';

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Get the rate limit key for a request
 */
function getRateLimitKey(identifier: string): string {
  return `rate_limit:${identifier}`;
}

/**
 * Check and update rate limit for an identifier
 */
export async function checkRateLimit(
  identifier: string,
  env: Env,
  config?: Partial<RateLimitConfig>
): Promise<{ allowed: boolean; info: RateLimitInfo }> {
  const maxRequests = config?.maxRequests ?? parseInt(env.RATE_LIMIT_REQUESTS || '100', 10);
  const windowSeconds = config?.windowSeconds ?? parseInt(env.RATE_LIMIT_WINDOW_SECONDS || '60', 10);

  const key = getRateLimitKey(identifier);
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  // Get current rate limit entry from KV
  const entryJson = await env.CACHE.get(key);
  let entry: RateLimitEntry;

  if (entryJson) {
    entry = JSON.parse(entryJson) as RateLimitEntry;

    // Check if the window has expired
    if (now >= entry.resetAt) {
      // Start a new window
      entry = { count: 1, resetAt: now + windowMs };
    } else {
      // Increment the count
      entry.count++;
    }
  } else {
    // Create new entry
    entry = { count: 1, resetAt: now + windowMs };
  }

  // Calculate remaining requests
  const remaining = Math.max(0, maxRequests - entry.count);
  const allowed = entry.count <= maxRequests;

  // Store updated entry (with TTL matching the window)
  const ttlSeconds = Math.ceil((entry.resetAt - now) / 1000);
  await env.CACHE.put(key, JSON.stringify(entry), {
    expirationTtl: ttlSeconds > 0 ? ttlSeconds : windowSeconds,
  });

  return {
    allowed,
    info: {
      remaining,
      limit: maxRequests,
      reset_at: new Date(entry.resetAt).toISOString(),
    },
  };
}

/**
 * Get rate limit identifier from request
 * Uses user ID if authenticated, otherwise falls back to IP address
 */
export function getRateLimitIdentifier(request: Request, userId?: string): string {
  if (userId) {
    return `user:${userId}`;
  }

  // Use CF-Connecting-IP if available (Cloudflare provides this)
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp) {
    return `ip:${cfIp}`;
  }

  // Fall back to X-Forwarded-For
  const forwardedFor = request.headers.get('X-Forwarded-For');
  if (forwardedFor) {
    const ip = forwardedFor.split(',')[0]?.trim();
    if (ip) {
      return `ip:${ip}`;
    }
  }

  // Last resort: use a generic identifier
  return 'ip:unknown';
}

/**
 * Add rate limit headers to a response
 */
export function addRateLimitHeaders(
  response: Response,
  info: RateLimitInfo
): Response {
  const headers = new Headers(response.headers);
  headers.set('X-RateLimit-Limit', info.limit.toString());
  headers.set('X-RateLimit-Remaining', info.remaining.toString());
  headers.set('X-RateLimit-Reset', info.reset_at);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
