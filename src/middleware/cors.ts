/**
 * CORS middleware for handling cross-origin requests
 */

export interface CorsOptions {
  origins?: string[];
  methods?: string[];
  headers?: string[];
  maxAge?: number;
  credentials?: boolean;
}

const DEFAULT_OPTIONS: Required<CorsOptions> = {
  origins: ['*'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  headers: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-API-Key'],
  maxAge: 86400, // 24 hours
  credentials: false,
};

/**
 * Check if the origin is allowed
 */
function isOriginAllowed(origin: string | null, allowedOrigins: string[]): boolean {
  if (!origin) return false;
  if (allowedOrigins.includes('*')) return true;
  return allowedOrigins.includes(origin);
}

/**
 * Get CORS headers for a request
 */
export function getCorsHeaders(
  request: Request,
  options: CorsOptions = {}
): Record<string, string> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const origin = request.headers.get('Origin');
  const headers: Record<string, string> = {};

  if (isOriginAllowed(origin, config.origins)) {
    headers['Access-Control-Allow-Origin'] = config.origins.includes('*') ? '*' : origin!;
  }

  if (config.credentials) {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  return headers;
}

/**
 * Handle CORS preflight requests
 */
export function handlePreflight(
  request: Request,
  options: CorsOptions = {}
): Response {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const origin = request.headers.get('Origin');

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': config.methods.join(', '),
    'Access-Control-Allow-Headers': config.headers.join(', '),
    'Access-Control-Max-Age': config.maxAge.toString(),
  };

  if (isOriginAllowed(origin, config.origins)) {
    headers['Access-Control-Allow-Origin'] = config.origins.includes('*') ? '*' : origin!;
  }

  if (config.credentials) {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  return new Response(null, { status: 204, headers });
}

/**
 * Add CORS headers to a response
 */
export function addCorsHeaders(
  response: Response,
  request: Request,
  options: CorsOptions = {}
): Response {
  const corsHeaders = getCorsHeaders(request, options);
  const newHeaders = new Headers(response.headers);

  for (const [key, value] of Object.entries(corsHeaders)) {
    newHeaders.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
