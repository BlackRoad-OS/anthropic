/**
 * Durable Object for managing conversation state
 * Maintains message history and provides stateful conversation management
 */

import type { Env, AnthropicMessage, ChatRequest, Conversation } from '../types';

interface ConversationState {
  id: string;
  messages: AnthropicMessage[];
  model: string;
  system_prompt?: string;
  created_at: string;
  updated_at: string;
  total_tokens: number;
}

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const MAX_MESSAGES = 100;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';

export class ConversationDurableObject implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private conversation: ConversationState | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  /**
   * Initialize or load conversation state
   */
  private async loadConversation(): Promise<ConversationState> {
    if (this.conversation) {
      return this.conversation;
    }

    const stored = await this.state.storage.get<ConversationState>('conversation');

    if (stored) {
      this.conversation = stored;
    } else {
      this.conversation = {
        id: this.state.id.toString(),
        messages: [],
        model: DEFAULT_MODEL,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        total_tokens: 0,
      };
      await this.saveConversation();
    }

    return this.conversation;
  }

  /**
   * Save conversation state
   */
  private async saveConversation(): Promise<void> {
    if (this.conversation) {
      this.conversation.updated_at = new Date().toISOString();
      await this.state.storage.put('conversation', this.conversation);
    }
  }

  /**
   * Handle incoming requests
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      switch (path) {
        case '/chat':
          return this.handleChat(request);
        case '/messages':
          return this.handleGetMessages();
        case '/clear':
          return this.handleClear();
        case '/info':
          return this.handleGetInfo();
        default:
          return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      console.error('Durable Object error:', error);
      return new Response(
        JSON.stringify({
          error: 'Internal error',
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }

  /**
   * Handle chat request with conversation history
   */
  private async handleChat(request: Request): Promise<Response> {
    const conversation = await this.loadConversation();

    // Parse the incoming request
    const body = await request.json() as ChatRequest;

    // Update model if specified
    if (body.model) {
      conversation.model = body.model;
    }

    // Update system prompt if specified
    if (body.system) {
      conversation.system_prompt = body.system;
    }

    // Add new messages to history
    for (const msg of body.messages) {
      conversation.messages.push(msg);
    }

    // Trim message history if too long
    if (conversation.messages.length > MAX_MESSAGES) {
      const trimCount = conversation.messages.length - MAX_MESSAGES;
      conversation.messages = conversation.messages.slice(trimCount);
    }

    // Build request to Anthropic API with full history
    const anthropicRequest = {
      model: conversation.model,
      max_tokens: body.max_tokens ?? 4096,
      messages: conversation.messages,
      ...(conversation.system_prompt && { system: conversation.system_prompt }),
      ...(body.temperature !== undefined && { temperature: body.temperature }),
      ...(body.tools && { tools: body.tools }),
      ...(body.tool_choice && { tool_choice: body.tool_choice }),
    };

    // Make request to Anthropic API
    const anthropicResponse = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.env.ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify(anthropicRequest),
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      return new Response(errorText, {
        status: anthropicResponse.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const responseData = await anthropicResponse.json() as {
      content: Array<{ type: string; text?: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };

    // Extract assistant's response and add to history
    const assistantContent = responseData.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    conversation.messages.push({
      role: 'assistant',
      content: assistantContent,
    });

    // Update token count
    if (responseData.usage) {
      conversation.total_tokens +=
        responseData.usage.input_tokens + responseData.usage.output_tokens;
    }

    // Save updated conversation
    await this.saveConversation();

    return new Response(JSON.stringify(responseData), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Get conversation messages
   */
  private async handleGetMessages(): Promise<Response> {
    const conversation = await this.loadConversation();

    return new Response(
      JSON.stringify({
        messages: conversation.messages,
        total: conversation.messages.length,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  /**
   * Clear conversation history
   */
  private async handleClear(): Promise<Response> {
    const conversation = await this.loadConversation();

    conversation.messages = [];
    conversation.total_tokens = 0;
    await this.saveConversation();

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Get conversation info
   */
  private async handleGetInfo(): Promise<Response> {
    const conversation = await this.loadConversation();

    const info: Conversation = {
      id: conversation.id,
      session_id: conversation.id,
      messages: conversation.messages,
      model: conversation.model,
      system_prompt: conversation.system_prompt,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
      total_tokens: conversation.total_tokens,
    };

    return new Response(JSON.stringify(info), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
