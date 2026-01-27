# Anthropic Workers

Cloudflare Workers for Anthropic models and integrations for the BlackRoad system.

## Features

- **Chat Completions API** - Proxy and enhancement layer for Claude API
- **Streaming Support** - Real-time streaming responses via SSE
- **Conversation History** - Stateful conversations using Durable Objects
- **Rate Limiting** - Configurable rate limits per user/IP via KV
- **Caching** - Response caching and session management
- **Health Monitoring** - Health, liveness, and readiness endpoints
- **Analytics** - Request tracking via Analytics Engine
- **Async Processing** - Queue-based background task processing

## Quick Start

### Prerequisites

- Node.js 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- Cloudflare account
- Anthropic API key

### Installation

```bash
# Install dependencies
npm install

# Set up secrets
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put API_SECRET_KEY
```

### Development

```bash
# Start local development server
npm run dev

# Run type checking
npm run typecheck

# Run tests
npm run test
```

### Deployment

```bash
# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy:production
```

## API Endpoints

### Health Checks

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Detailed health status with dependency checks |
| `/live` | GET | Liveness probe (always returns 200) |
| `/ready` | GET | Readiness probe (checks dependencies) |

### Chat API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/messages` | POST | Send a chat completion request |
| `/v1/chat/completions` | POST | OpenAI-compatible chat endpoint |
| `/v1/conversations/:id/messages` | POST | Chat with conversation history |
| `/v1/models` | GET | List available models |

### Authentication

Include your API key in requests using one of these methods:

```bash
# Bearer token
curl -H "Authorization: Bearer YOUR_API_KEY" ...

# X-API-Key header
curl -H "X-API-Key: YOUR_API_KEY" ...
```

## Usage Examples

### Basic Chat Completion

```bash
curl -X POST https://your-worker.workers.dev/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Hello, Claude!"}
    ]
  }'
```

### Streaming Response

```bash
curl -X POST https://your-worker.workers.dev/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "stream": true,
    "messages": [
      {"role": "user", "content": "Tell me a story"}
    ]
  }'
```

### Conversation with History

```bash
# First message
curl -X POST https://your-worker.workers.dev/v1/conversations/my-session/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "messages": [{"role": "user", "content": "My name is Alice"}]
  }'

# Follow-up (remembers context)
curl -X POST https://your-worker.workers.dev/v1/conversations/my-session/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "messages": [{"role": "user", "content": "What is my name?"}]
  }'
```

### With System Prompt and Tools

```bash
curl -X POST https://your-worker.workers.dev/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "system": "You are a helpful coding assistant.",
    "messages": [
      {"role": "user", "content": "Calculate 15% of 85"}
    ],
    "tools": [
      {
        "name": "calculator",
        "description": "Perform mathematical calculations",
        "input_schema": {
          "type": "object",
          "properties": {
            "expression": {"type": "string", "description": "Math expression to evaluate"}
          },
          "required": ["expression"]
        }
      }
    ]
  }'
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ENVIRONMENT` | Deployment environment | `development` |
| `LOG_LEVEL` | Logging level (debug/info/warn/error) | `debug` |
| `API_VERSION` | API version string | `v1` |
| `MAX_TOKENS_DEFAULT` | Default max tokens for completions | `4096` |
| `RATE_LIMIT_REQUESTS` | Max requests per window | `100` |
| `RATE_LIMIT_WINDOW_SECONDS` | Rate limit window duration | `60` |

### Secrets

Set these using `wrangler secret put`:

- `ANTHROPIC_API_KEY` - Your Anthropic API key
- `API_SECRET_KEY` - API key for authenticating requests

### Cloudflare Bindings

Configure these in `wrangler.toml`:

- **KV Namespaces**: `CACHE`, `SESSIONS`
- **R2 Bucket**: `ARTIFACTS`
- **D1 Database**: `DB`
- **Durable Objects**: `CONVERSATION`
- **Queues**: `TASK_QUEUE`
- **Analytics Engine**: `ANALYTICS`

## Project Structure

```
├── src/
│   ├── index.ts              # Worker entry point
│   ├── types/
│   │   └── index.ts          # TypeScript type definitions
│   ├── handlers/
│   │   ├── chat.ts           # Chat completion handlers
│   │   └── health.ts         # Health check handlers
│   ├── middleware/
│   │   ├── auth.ts           # Authentication middleware
│   │   ├── cors.ts           # CORS handling
│   │   └── rate-limit.ts     # Rate limiting
│   ├── durable-objects/
│   │   └── conversation.ts   # Conversation state management
│   └── utils/
│       ├── logger.ts         # Structured logging
│       ├── response.ts       # Response helpers
│       └── validation.ts     # Request validation
├── wrangler.toml             # Cloudflare Workers config
├── package.json
├── tsconfig.json
└── README.md
```

## Development

### Local Development

```bash
# Start dev server with local bindings
npm run dev

# The worker will be available at http://localhost:8787
```

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Type Checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
npm run format
```

## Deployment Checklist

1. **Create KV namespaces**:
   ```bash
   wrangler kv:namespace create CACHE
   wrangler kv:namespace create SESSIONS
   ```

2. **Create R2 bucket**:
   ```bash
   wrangler r2 bucket create anthropic-artifacts
   ```

3. **Create D1 database**:
   ```bash
   wrangler d1 create anthropic-db
   ```

4. **Create Queue**:
   ```bash
   wrangler queues create anthropic-tasks
   ```

5. **Update `wrangler.toml`** with the generated IDs

6. **Set secrets**:
   ```bash
   wrangler secret put ANTHROPIC_API_KEY
   wrangler secret put API_SECRET_KEY
   ```

7. **Deploy**:
   ```bash
   npm run deploy:production
   ```

## Rate Limiting

The API implements rate limiting using Cloudflare KV:

- Default: 100 requests per 60 seconds per user/IP
- Rate limit headers are included in responses:
  - `X-RateLimit-Limit`: Maximum requests allowed
  - `X-RateLimit-Remaining`: Requests remaining in window
  - `X-RateLimit-Reset`: When the limit resets (ISO timestamp)

## Error Handling

All errors follow a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {}
  },
  "meta": {
    "request_id": "req_xxx",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "version": "v1"
  }
}
```

## License

MIT
