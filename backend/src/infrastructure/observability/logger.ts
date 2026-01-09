/**
 * Structured Logger
 * 
 * Production-grade structured logging using pino.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - JSON structured logs
 * - Context-aware logging
 * - Error serialization
 * - Child logger support
 * 
 * NOTE: pino must be installed: npm install pino
 * After installation, remove @ts-ignore comments and use proper types.
 */

import { getContext } from './context.js';
import { ObservabilityContext } from './context.js';

/**
 * Log Context
 * 
 * Additional context to attach to log entries.
 */
export interface LogContext extends ObservabilityContext {
  [key: string]: unknown;
}

/**
 * Logger Interface
 * 
 * Abstraction for logger operations.
 */
export interface Logger {
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error | unknown, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
  child(bindings: LogContext): Logger;
}

/**
 * Create Logger
 * 
 * Creates a logger instance with optional base context.
 * 
 * @param baseContext Base context to attach to all logs
 * @returns Logger instance
 */
export function createLogger(baseContext?: LogContext): Logger {
  // Check if pino is available
  let pino: any;
  try {
    // @ts-ignore - pino will be available after installation
    pino = require('pino');
  } catch (error) {
    // Fallback to console if pino is not installed
    return createConsoleLogger(baseContext);
  }

  // Create pino logger
  const logger = pino({
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    formatters: {
      level: (label: string) => {
        return { level: label };
      },
    },
    serializers: {
      err: pino.stdSerializers.err,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });

  return new PinoLogger(logger, baseContext);
}

/**
 * Pino Logger Implementation
 * 
 * Wraps pino logger with context propagation.
 */
class PinoLogger implements Logger {
  constructor(
    private readonly pinoLogger: any,
    private readonly baseContext?: LogContext
  ) {}

  private mergeContext(context?: LogContext): LogContext {
    const asyncContext = getContext() || {};
    return {
      ...this.baseContext,
      ...asyncContext,
      ...context,
      metadata: {
        ...(this.baseContext?.metadata || {}),
        ...(asyncContext.metadata || {}),
        ...(context?.metadata || {}),
      },
    };
  }

  info(message: string, context?: LogContext): void {
    this.pinoLogger.info(this.mergeContext(context), message);
  }

  warn(message: string, context?: LogContext): void {
    this.pinoLogger.warn(this.mergeContext(context), message);
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const mergedContext = this.mergeContext(context);
    
    if (error instanceof Error) {
      this.pinoLogger.error(
        {
          ...mergedContext,
          err: error,
          errorMessage: error.message,
          errorStack: error.stack,
        },
        message
      );
    } else if (error) {
      this.pinoLogger.error(
        {
          ...mergedContext,
          error: String(error),
        },
        message
      );
    } else {
      this.pinoLogger.error(mergedContext, message);
    }
  }

  debug(message: string, context?: LogContext): void {
    this.pinoLogger.debug(this.mergeContext(context), message);
  }

  child(bindings: LogContext): Logger {
    const childPino = this.pinoLogger.child(bindings);
    const mergedBaseContext = {
      ...this.baseContext,
      ...bindings,
    };
    return new PinoLogger(childPino, mergedBaseContext);
  }
}

/**
 * Console Logger Fallback
 * 
 * Fallback logger when pino is not installed.
 * Outputs structured JSON to console.
 */
class ConsoleLogger implements Logger {
  constructor(private readonly baseContext?: LogContext) {}

  private mergeContext(context?: LogContext): LogContext {
    const asyncContext = getContext() || {};
    return {
      ...this.baseContext,
      ...asyncContext,
      ...context,
      metadata: {
        ...(this.baseContext?.metadata || {}),
        ...(asyncContext.metadata || {}),
        ...(context?.metadata || {}),
      },
    };
  }

  private log(level: string, message: string, context?: LogContext, error?: Error | unknown): void {
    const mergedContext = this.mergeContext(context);
    const logEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...mergedContext,
      ...(error instanceof Error
        ? {
            error: {
              message: error.message,
              stack: error.stack,
              name: error.name,
            },
          }
        : error
        ? { error: String(error) }
        : {}),
    };
    console.log(JSON.stringify(logEntry));
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    this.log('error', message, context, error);
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  child(bindings: LogContext): Logger {
    return new ConsoleLogger({
      ...this.baseContext,
      ...bindings,
    });
  }
}

/**
 * Create Console Logger
 * 
 * Creates a console-based logger (fallback when pino is not available).
 */
function createConsoleLogger(baseContext?: LogContext): Logger {
  return new ConsoleLogger(baseContext);
}

/**
 * Default Logger Instance
 * 
 * Global logger instance.
 * Use this for application-wide logging.
 */
export const logger = createLogger();

