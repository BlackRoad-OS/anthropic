/**
 * Structured logging utility for Cloudflare Workers
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  request_id?: string;
  user_id?: string;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Logger class for structured logging
 */
export class Logger {
  private minLevel: number;
  private context: LogContext;

  constructor(level: LogLevel = 'info', context: LogContext = {}) {
    this.minLevel = LOG_LEVELS[level];
    this.context = context;
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): Logger {
    const logger = new Logger();
    logger.minLevel = this.minLevel;
    logger.context = { ...this.context, ...context };
    return logger;
  }

  /**
   * Log a message at the specified level
   */
  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (LOG_LEVELS[level] < this.minLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...this.context, ...context },
    };

    const output = JSON.stringify(entry);

    switch (level) {
      case 'debug':
      case 'info':
        console.log(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'error':
        console.error(output);
        break;
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  /**
   * Log an error with stack trace
   */
  exception(error: Error, context?: LogContext): void {
    this.error(error.message, {
      ...context,
      error_name: error.name,
      stack: error.stack,
    });
  }

  /**
   * Log request details
   */
  request(request: Request, context?: LogContext): void {
    const url = new URL(request.url);
    this.info('Incoming request', {
      ...context,
      method: request.method,
      path: url.pathname,
      query: url.search,
      user_agent: request.headers.get('user-agent'),
      cf: request.cf ? {
        country: request.cf.country,
        city: request.cf.city,
        colo: request.cf.colo,
      } : undefined,
    });
  }

  /**
   * Log response details
   */
  response(status: number, latencyMs: number, context?: LogContext): void {
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    this.log(level, 'Response sent', {
      ...context,
      status_code: status,
      latency_ms: latencyMs,
    });
  }
}

/**
 * Create a logger from environment configuration
 */
export function createLogger(logLevel: string, requestId?: string): Logger {
  const level = (logLevel.toLowerCase() as LogLevel) || 'info';
  return new Logger(level, requestId ? { request_id: requestId } : {});
}
