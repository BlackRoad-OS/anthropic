/**
 * Health check handlers for monitoring and load balancing
 */

import type { Env, HealthStatus, HealthCheck } from '../types';
import { jsonResponse } from '../utils/response';

const VERSION = '1.0.0';

/**
 * Simple liveness probe - always returns 200 if the worker is running
 */
export function handleLiveness(requestId: string): Response {
  return new Response('OK', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
      'X-Request-ID': requestId,
    },
  });
}

/**
 * Readiness probe - checks if the worker can handle requests
 */
export async function handleReadiness(
  env: Env,
  requestId: string
): Promise<Response> {
  const checks: HealthCheck[] = [];

  // Check KV namespace availability
  try {
    const start = Date.now();
    await env.CACHE.get('health_check_key');
    checks.push({
      name: 'kv_cache',
      status: 'pass',
      latency_ms: Date.now() - start,
    });
  } catch (error) {
    checks.push({
      name: 'kv_cache',
      status: 'fail',
      message: error instanceof Error ? error.message : 'KV check failed',
    });
  }

  // Check if Anthropic API key is configured
  checks.push({
    name: 'anthropic_api_key',
    status: env.ANTHROPIC_API_KEY ? 'pass' : 'fail',
    message: env.ANTHROPIC_API_KEY ? undefined : 'API key not configured',
  });

  const allPassed = checks.every((c) => c.status === 'pass');

  if (allPassed) {
    return new Response('OK', {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'X-Request-ID': requestId,
      },
    });
  }

  return new Response('Service Unavailable', {
    status: 503,
    headers: {
      'Content-Type': 'text/plain',
      'X-Request-ID': requestId,
    },
  });
}

/**
 * Detailed health check with status of all dependencies
 */
export async function handleHealthCheck(
  env: Env,
  requestId: string
): Promise<Response> {
  const checks: HealthCheck[] = [];

  // Check KV Cache namespace
  try {
    const start = Date.now();
    await env.CACHE.get('health_check_key');
    checks.push({
      name: 'kv_cache',
      status: 'pass',
      latency_ms: Date.now() - start,
    });
  } catch (error) {
    checks.push({
      name: 'kv_cache',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Check KV Sessions namespace
  try {
    const start = Date.now();
    await env.SESSIONS.get('health_check_key');
    checks.push({
      name: 'kv_sessions',
      status: 'pass',
      latency_ms: Date.now() - start,
    });
  } catch (error) {
    checks.push({
      name: 'kv_sessions',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Check D1 database
  try {
    const start = Date.now();
    await env.DB.prepare('SELECT 1').first();
    checks.push({
      name: 'd1_database',
      status: 'pass',
      latency_ms: Date.now() - start,
    });
  } catch (error) {
    checks.push({
      name: 'd1_database',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Check R2 bucket
  try {
    const start = Date.now();
    await env.ARTIFACTS.head('health_check_key');
    checks.push({
      name: 'r2_artifacts',
      status: 'pass',
      latency_ms: Date.now() - start,
    });
  } catch (error) {
    // R2 returns an error for non-existent keys, which is expected
    const errorMessage = error instanceof Error ? error.message : '';
    if (errorMessage.includes('not found') || errorMessage.includes('NoSuchKey')) {
      checks.push({
        name: 'r2_artifacts',
        status: 'pass',
        latency_ms: 0,
      });
    } else {
      checks.push({
        name: 'r2_artifacts',
        status: 'fail',
        message: errorMessage || 'Unknown error',
      });
    }
  }

  // Check Anthropic API key configuration
  checks.push({
    name: 'anthropic_api_key',
    status: env.ANTHROPIC_API_KEY ? 'pass' : 'fail',
    message: env.ANTHROPIC_API_KEY ? undefined : 'API key not configured',
  });

  // Determine overall status
  const failedChecks = checks.filter((c) => c.status === 'fail');
  let status: HealthStatus['status'] = 'healthy';

  if (failedChecks.length > 0) {
    // Critical services that cause unhealthy status
    const criticalServices = ['anthropic_api_key', 'd1_database'];
    const hasCriticalFailure = failedChecks.some((c) =>
      criticalServices.includes(c.name)
    );
    status = hasCriticalFailure ? 'unhealthy' : 'degraded';
  }

  const healthStatus: HealthStatus = {
    status,
    version: VERSION,
    environment: env.ENVIRONMENT || 'unknown',
    timestamp: new Date().toISOString(),
    checks,
  };

  const httpStatus = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;

  return jsonResponse(healthStatus, requestId, httpStatus);
}
