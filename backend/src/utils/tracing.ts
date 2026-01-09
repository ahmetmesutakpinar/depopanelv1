import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger.js';

/**
 * Trace Span Interface
 */
export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tags: Record<string, string>;
  logs: TraceLog[];
  status: 'started' | 'completed' | 'error';
  error?: string;
}

/**
 * Trace Log Entry
 */
export interface TraceLog {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: Record<string, any>;
}

/**
 * Trace Data (complete trace)
 */
export interface TraceData {
  traceId: string;
  rootSpan: TraceSpan;
  spans: TraceSpan[];
  startTime: number;
  endTime?: number;
  duration?: number;
}

/**
 * Distributed Tracing System
 * 
 * Provides requestId-based tracing with span tracking
 * - Span creation for operations
 * - Trace context propagation
 * - Trace export (JSON format, log-based)
 */
class Tracer {
  private traces: Map<string, TraceData> = new Map();
  private spans: Map<string, TraceSpan> = new Map();
  private readonly maxTraces = 1000; // Keep last 1000 traces in memory

  /**
   * Start a new trace
   */
  startTrace(operation: string, requestId?: string): string {
    const traceId = requestId || uuidv4();
    const spanId = uuidv4();
    const startTime = Date.now();

    const rootSpan: TraceSpan = {
      traceId,
      spanId,
      operation,
      startTime,
      tags: {},
      logs: [],
      status: 'started',
    };

    const trace: TraceData = {
      traceId,
      rootSpan,
      spans: [rootSpan],
      startTime,
    };

    this.traces.set(traceId, trace);
    this.spans.set(spanId, rootSpan);

    // Cleanup old traces if needed
    if (this.traces.size > this.maxTraces) {
      const oldestTrace = Array.from(this.traces.values())[0];
      this.deleteTrace(oldestTrace.traceId);
    }

    return traceId;
  }

  /**
   * Start a new span within a trace
   */
  startSpan(operation: string, parentSpanId?: string, traceId?: string): string {
    const spanId = uuidv4();
    const startTime = Date.now();

    // If traceId not provided, try to find it from parent span
    let actualTraceId = traceId;
    if (!actualTraceId && parentSpanId) {
      const parentSpan = this.spans.get(parentSpanId);
      if (parentSpan) {
        actualTraceId = parentSpan.traceId;
      }
    }

    // If still no traceId, create a new trace
    if (!actualTraceId) {
      actualTraceId = this.startTrace(operation);
      const trace = this.traces.get(actualTraceId);
      if (trace) {
        trace.rootSpan.spanId = spanId;
        this.spans.set(spanId, trace.rootSpan);
        return actualTraceId;
      }
    }

    const span: TraceSpan = {
      traceId: actualTraceId!,
      spanId,
      parentSpanId,
      operation,
      startTime,
      tags: {},
      logs: [],
      status: 'started',
    };

    this.spans.set(spanId, span);

    // Add span to trace
    const trace = this.traces.get(actualTraceId!);
    if (trace) {
      trace.spans.push(span);
    }

    return spanId;
  }

  /**
   * End a span
   */
  endSpan(spanId: string, status: 'completed' | 'error' = 'completed', error?: string): void {
    const span = this.spans.get(spanId);
    if (!span) {
      logger.warn(`[Tracing] Span not found: ${spanId}`);
      return;
    }

    const endTime = Date.now();
    span.endTime = endTime;
    span.duration = endTime - span.startTime;
    span.status = status;
    if (error) {
      span.error = error;
    }

    // If this is the root span, end the trace
    const trace = this.traces.get(span.traceId);
    if (trace && trace.rootSpan.spanId === spanId) {
      trace.endTime = endTime;
      trace.duration = endTime - trace.startTime;
    }
  }

  /**
   * Add tag to span
   */
  addTag(spanId: string, key: string, value: string): void {
    const span = this.spans.get(spanId);
    if (!span) {
      logger.warn(`[Tracing] Span not found: ${spanId}`);
      return;
    }

    span.tags[key] = value;
  }

  /**
   * Add log to span
   */
  addLog(spanId: string, level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: Record<string, any>): void {
    const span = this.spans.get(spanId);
    if (!span) {
      logger.warn(`[Tracing] Span not found: ${spanId}`);
      return;
    }

    span.logs.push({
      timestamp: Date.now(),
      level,
      message,
      data,
    });
  }

  /**
   * Export trace data
   */
  exportTrace(traceId: string): TraceData | null {
    const trace = this.traces.get(traceId);
    if (!trace) {
      return null;
    }

    // Deep clone to prevent modification
    return JSON.parse(JSON.stringify(trace));
  }

  /**
   * Get all traces (for debugging)
   */
  getAllTraces(): TraceData[] {
    return Array.from(this.traces.values());
  }

  /**
   * Delete trace
   */
  deleteTrace(traceId: string): void {
    const trace = this.traces.get(traceId);
    if (trace) {
      // Delete all spans
      trace.spans.forEach(span => {
        this.spans.delete(span.spanId);
      });
      this.traces.delete(traceId);
    }
  }

  /**
   * Cleanup old traces (older than specified milliseconds)
   */
  cleanupOldTraces(maxAge: number = 3600000): void { // Default: 1 hour
    const now = Date.now();
    const tracesToDelete: string[] = [];

    this.traces.forEach((trace, traceId) => {
      if (trace.endTime && (now - trace.endTime) > maxAge) {
        tracesToDelete.push(traceId);
      }
    });

    tracesToDelete.forEach(traceId => {
      this.deleteTrace(traceId);
    });

    if (tracesToDelete.length > 0) {
      logger.info(`[Tracing] Cleaned up ${tracesToDelete.length} old traces`);
    }
  }
}

// Singleton instance
export const tracer = new Tracer();

// Auto-cleanup old traces every hour
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    try {
      tracer.cleanupOldTraces();
    } catch (error) {
      logger.error('[Tracing] Failed to cleanup old traces:', error);
    }
  }, 3600000); // 1 hour
}

