import winston from 'winston';
import { env } from '../config/env.js';
import { metricsService } from '../services/metrics.service.js';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${stack || message}`;
  })
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp }) => {
    return `${timestamp} ${level}: ${message}`;
  })
);

// Environment-based log level
const getLogLevel = () => {
  if (env.NODE_ENV === 'test') return 'error';
  if (env.isDevelopment) return 'debug';
  if (env.NODE_ENV === 'production') return 'info';
  return 'info';
};

export const logger = winston.createLogger({
  level: getLogLevel(),
  format: logFormat,
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Metrics-aware logging: Convert log events to metrics
logger.on('data', (logEntry) => {
  try {
    // Extract metrics from structured logs
    if (logEntry.marketplace && logEntry.method) {
      // Integration operation metrics are handled in integration-base.ts
      // This is for other log-based metrics if needed
    }
  } catch (error) {
    // Silently fail metrics conversion to not break logging
  }
});

// Console transport based on environment
if (env.NODE_ENV !== 'test') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: env.isDevelopment ? 'debug' : 'info',
  }));
}

export default logger;

