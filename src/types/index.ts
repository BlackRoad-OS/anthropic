/**
 * TypeScript type definitions for Anthropic Workers
 */

// Environment bindings for Cloudflare Workers
export interface Env {
  // KV Namespaces
  CACHE: KVNamespace;
  SESSIONS: KVNamespace;

  // R2 Bucket
  ARTIFACTS: R2Bucket;

  // D1 Database
  DB: D1Database;

  // Durable Objects
  CONVERSATION: DurableObjectNamespace;

  // Analytics
  ANALYTICS: AnalyticsEngineDataset;

  // Queue
  TASK_QUEUE: Queue<QueueMessage>;

  // Environment variables
  ENVIRONMENT: string;
  LOG_LEVEL: string;
  API_VERSION: string;
  MAX_TOKENS_DEFAULT: string;
  RATE_LIMIT_REQUESTS: string;
  RATE_LIMIT_WINDOW_SECONDS: string;

  // Secrets (set via wrangler secret)
  ANTHROPIC_API_KEY: string;
  API_SECRET_KEY: string;
}

// Anthropic API types
export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  text?: string;
  source?: ImageSource;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

export interface ImageSource {
  type: 'base64' | 'url';
  media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  data?: string;
  url?: string;
}

export interface ChatRequest {
  model?: string;
  messages: AnthropicMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  system?: string;
  stream?: boolean;
  metadata?: Record<string, string>;
  stop_sequences?: string[];
  tools?: Tool[];
  tool_choice?: ToolChoice;
}

export interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolChoice {
  type: 'auto' | 'any' | 'tool';
  name?: string;
}

export interface ChatResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: ContentBlock[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null;
  stop_sequence: string | null;
  usage: Usage;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

export interface StreamEvent {
  type: string;
  index?: number;
  delta?: {
    type: string;
    text?: string;
    stop_reason?: string;
  };
  content_block?: ContentBlock;
  message?: ChatResponse;
  usage?: Usage;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ResponseMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ResponseMeta {
  request_id: string;
  timestamp: string;
  version: string;
  latency_ms?: number;
}

// Session types
export interface Session {
  id: string;
  user_id?: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  metadata: Record<string, string>;
}

// Conversation types
export interface Conversation {
  id: string;
  session_id: string;
  messages: AnthropicMessage[];
  model: string;
  system_prompt?: string;
  created_at: string;
  updated_at: string;
  total_tokens: number;
}

// Queue message types
export interface QueueMessage {
  type: 'completion' | 'embedding' | 'moderation' | 'artifact';
  payload: Record<string, unknown>;
  metadata: {
    request_id: string;
    timestamp: string;
    priority?: 'low' | 'normal' | 'high';
  };
}

// Rate limiting types
export interface RateLimitInfo {
  remaining: number;
  limit: number;
  reset_at: string;
}

// Health check types
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  environment: string;
  timestamp: string;
  checks: HealthCheck[];
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail';
  latency_ms?: number;
  message?: string;
}

// Artifact types
export interface Artifact {
  id: string;
  conversation_id: string;
  type: 'code' | 'document' | 'image' | 'data';
  content: string;
  filename?: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

// Analytics event types
export interface AnalyticsEvent {
  event: string;
  request_id: string;
  user_id?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  latency_ms?: number;
  status_code?: number;
  error_code?: string;
}
