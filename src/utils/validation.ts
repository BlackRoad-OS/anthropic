/**
 * Request validation utilities
 */

import type { ChatRequest, AnthropicMessage, Tool } from '../types';

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validate a chat completion request
 */
export function validateChatRequest(body: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: [{ field: 'body', message: 'Request body must be a JSON object' }] };
  }

  const request = body as Partial<ChatRequest>;

  // Validate messages (required)
  if (!request.messages) {
    errors.push({ field: 'messages', message: 'messages is required' });
  } else if (!Array.isArray(request.messages)) {
    errors.push({ field: 'messages', message: 'messages must be an array' });
  } else if (request.messages.length === 0) {
    errors.push({ field: 'messages', message: 'messages must not be empty' });
  } else {
    request.messages.forEach((msg, index) => {
      const msgErrors = validateMessage(msg, index);
      errors.push(...msgErrors);
    });
  }

  // Validate model (optional)
  if (request.model !== undefined && typeof request.model !== 'string') {
    errors.push({ field: 'model', message: 'model must be a string' });
  }

  // Validate max_tokens (optional)
  if (request.max_tokens !== undefined) {
    if (typeof request.max_tokens !== 'number') {
      errors.push({ field: 'max_tokens', message: 'max_tokens must be a number' });
    } else if (request.max_tokens < 1 || request.max_tokens > 200000) {
      errors.push({ field: 'max_tokens', message: 'max_tokens must be between 1 and 200000' });
    }
  }

  // Validate temperature (optional)
  if (request.temperature !== undefined) {
    if (typeof request.temperature !== 'number') {
      errors.push({ field: 'temperature', message: 'temperature must be a number' });
    } else if (request.temperature < 0 || request.temperature > 1) {
      errors.push({ field: 'temperature', message: 'temperature must be between 0 and 1' });
    }
  }

  // Validate top_p (optional)
  if (request.top_p !== undefined) {
    if (typeof request.top_p !== 'number') {
      errors.push({ field: 'top_p', message: 'top_p must be a number' });
    } else if (request.top_p < 0 || request.top_p > 1) {
      errors.push({ field: 'top_p', message: 'top_p must be between 0 and 1' });
    }
  }

  // Validate top_k (optional)
  if (request.top_k !== undefined) {
    if (typeof request.top_k !== 'number') {
      errors.push({ field: 'top_k', message: 'top_k must be a number' });
    } else if (request.top_k < 1) {
      errors.push({ field: 'top_k', message: 'top_k must be at least 1' });
    }
  }

  // Validate system (optional)
  if (request.system !== undefined && typeof request.system !== 'string') {
    errors.push({ field: 'system', message: 'system must be a string' });
  }

  // Validate stream (optional)
  if (request.stream !== undefined && typeof request.stream !== 'boolean') {
    errors.push({ field: 'stream', message: 'stream must be a boolean' });
  }

  // Validate tools (optional)
  if (request.tools !== undefined) {
    if (!Array.isArray(request.tools)) {
      errors.push({ field: 'tools', message: 'tools must be an array' });
    } else {
      request.tools.forEach((tool, index) => {
        const toolErrors = validateTool(tool, index);
        errors.push(...toolErrors);
      });
    }
  }

  // Validate stop_sequences (optional)
  if (request.stop_sequences !== undefined) {
    if (!Array.isArray(request.stop_sequences)) {
      errors.push({ field: 'stop_sequences', message: 'stop_sequences must be an array' });
    } else if (!request.stop_sequences.every((s) => typeof s === 'string')) {
      errors.push({ field: 'stop_sequences', message: 'stop_sequences must be an array of strings' });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a single message
 */
function validateMessage(message: unknown, index: number): ValidationError[] {
  const errors: ValidationError[] = [];
  const prefix = `messages[${index}]`;

  if (!message || typeof message !== 'object') {
    errors.push({ field: prefix, message: 'message must be an object' });
    return errors;
  }

  const msg = message as Partial<AnthropicMessage>;

  if (!msg.role) {
    errors.push({ field: `${prefix}.role`, message: 'role is required' });
  } else if (msg.role !== 'user' && msg.role !== 'assistant') {
    errors.push({ field: `${prefix}.role`, message: 'role must be "user" or "assistant"' });
  }

  if (msg.content === undefined || msg.content === null) {
    errors.push({ field: `${prefix}.content`, message: 'content is required' });
  } else if (typeof msg.content !== 'string' && !Array.isArray(msg.content)) {
    errors.push({ field: `${prefix}.content`, message: 'content must be a string or array' });
  }

  return errors;
}

/**
 * Validate a tool definition
 */
function validateTool(tool: unknown, index: number): ValidationError[] {
  const errors: ValidationError[] = [];
  const prefix = `tools[${index}]`;

  if (!tool || typeof tool !== 'object') {
    errors.push({ field: prefix, message: 'tool must be an object' });
    return errors;
  }

  const t = tool as Partial<Tool>;

  if (!t.name || typeof t.name !== 'string') {
    errors.push({ field: `${prefix}.name`, message: 'name is required and must be a string' });
  }

  if (!t.description || typeof t.description !== 'string') {
    errors.push({ field: `${prefix}.description`, message: 'description is required and must be a string' });
  }

  if (!t.input_schema || typeof t.input_schema !== 'object') {
    errors.push({ field: `${prefix}.input_schema`, message: 'input_schema is required and must be an object' });
  } else if (t.input_schema.type !== 'object') {
    errors.push({ field: `${prefix}.input_schema.type`, message: 'input_schema.type must be "object"' });
  }

  return errors;
}

/**
 * Validate that the request is JSON
 */
export async function parseJsonBody<T>(request: Request): Promise<{ data: T | null; error: string | null }> {
  const contentType = request.headers.get('content-type');

  if (!contentType?.includes('application/json')) {
    return { data: null, error: 'Content-Type must be application/json' };
  }

  try {
    const data = await request.json() as T;
    return { data, error: null };
  } catch {
    return { data: null, error: 'Invalid JSON in request body' };
  }
}
