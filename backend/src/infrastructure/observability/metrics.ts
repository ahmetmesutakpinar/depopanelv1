/**
 * Metrics Abstraction
 * 
 * Lightweight metrics hooks for observability.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - Abstraction for metrics collection
 * - No Prometheus integration yet (just hooks)
 * - Can be extended later with actual metrics backend
 * 
 * Usage:
 * ```ts
 * metrics.increment('job.started')
 * metrics.timing('adapter.execution', duration)
 * metrics.increment('error.count', { errorType: 'AdapterError' })
 * ```
 */

import { getContext } from './context.js';

/**
 * Metric Labels
 * 
 * Key-value pairs for metric dimensions.
 */
export interface MetricLabels {
  [key: string]: string | number | boolean;
}

/**
 * Metrics Interface
 * 
 * Abstraction for metrics collection.
 */
export interface Metrics {
  /**
   * Increment a counter
   * 
   * @param name Metric name
   * @param labels Optional labels
   * @param value Optional increment value (default: 1)
   */
  increment(name: string, labels?: MetricLabels, value?: number): void;

  /**
   * Record a timing/duration
   * 
   * @param name Metric name
   * @param duration Duration in milliseconds
   * @param labels Optional labels
   */
  timing(name: string, duration: number, labels?: MetricLabels): void;

  /**
   * Record a gauge value
   * 
   * @param name Metric name
   * @param value Gauge value
   * @param labels Optional labels
   */
  gauge(name: string, value: number, labels?: MetricLabels): void;

  /**
   * Record a histogram value
   * 
   * @param name Metric name
   * @param value Histogram value
   * @param labels Optional labels
   */
  histogram(name: string, value: number, labels?: MetricLabels): void;
}

/**
 * Metrics Implementation
 * 
 * Lightweight in-memory metrics collector.
 * Can be extended to send to Prometheus, StatsD, etc.
 */
class MetricsImpl implements Metrics {
  private counters: Map<string, number> = new Map();
  private timings: Map<string, number[]> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();

  private getMetricKey(name: string, labels?: MetricLabels): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${labelStr}}`;
  }

  private enrichLabels(labels?: MetricLabels): MetricLabels {
    const context = getContext();
    return {
      ...labels,
      ...(context?.companyId && { companyId: context.companyId }),
      ...(context?.marketplace && { marketplace: context.marketplace }),
      ...(context?.requestId && { requestId: context.requestId }),
      ...(context?.jobId && { jobId: context.jobId }),
    };
  }

  increment(name: string, labels?: MetricLabels, value: number = 1): void {
    const key = this.getMetricKey(name, this.enrichLabels(labels));
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);

    // TODO: Send to metrics backend (Prometheus, StatsD, etc.)
    // For now, just log in development
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[METRICS] increment ${key} = ${current + value}`);
    }
  }

  timing(name: string, duration: number, labels?: MetricLabels): void {
    const key = this.getMetricKey(name, this.enrichLabels(labels));
    const timings = this.timings.get(key) || [];
    timings.push(duration);
    this.timings.set(key, timings);

    // TODO: Send to metrics backend
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[METRICS] timing ${key} = ${duration}ms`);
    }
  }

  gauge(name: string, value: number, labels?: MetricLabels): void {
    const key = this.getMetricKey(name, this.enrichLabels(labels));
    this.gauges.set(key, value);

    // TODO: Send to metrics backend
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[METRICS] gauge ${key} = ${value}`);
    }
  }

  histogram(name: string, value: number, labels?: MetricLabels): void {
    const key = this.getMetricKey(name, this.enrichLabels(labels));
    const values = this.histograms.get(key) || [];
    values.push(value);
    this.histograms.set(key, values);

    // TODO: Send to metrics backend
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[METRICS] histogram ${key} = ${value}`);
    }
  }

  /**
   * Get all metrics (for debugging/testing)
   * 
   * @returns All collected metrics
   */
  getMetrics(): {
    counters: Map<string, number>;
    timings: Map<string, number[]>;
    gauges: Map<string, number>;
    histograms: Map<string, number[]>;
  } {
    return {
      counters: new Map(this.counters),
      timings: new Map(this.timings),
      gauges: new Map(this.gauges),
      histograms: new Map(this.histograms),
    };
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    this.counters.clear();
    this.timings.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}

/**
 * Default Metrics Instance
 * 
 * Global metrics instance.
 * Use this for application-wide metrics collection.
 */
export const metrics = new MetricsImpl();

