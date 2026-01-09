import { Registry, Counter, Gauge, Histogram, Summary, collectDefaultMetrics } from 'prom-client';
import { MarketplaceType } from '@prisma/client';
import { logger } from '../utils/logger.js';

/**
 * Metrics Service
 * 
 * Provides centralized metrics collection for:
 * - Integration operations (success/failure rates, latency)
 * - Job execution (duration, success/failure counts)
 * - System metrics (memory, CPU, database connections)
 * - Business metrics (orders/day, products synced, stock updates)
 */
class MetricsService {
  private registry: Registry;
  
  // Integration Metrics
  private integrationRequestsTotal: Counter<string>;
  private integrationErrorsTotal: Counter<string>;
  private integrationDuration: Histogram<string>;
  private activeIntegrations: Gauge<string>;
  
  // Job Metrics
  private jobExecutionsTotal: Counter<string>;
  private jobErrorsTotal: Counter<string>;
  private jobDuration: Histogram<string>;
  private jobQueueSize: Gauge<string>;
  
  // Business Metrics
  private ordersProcessedTotal: Counter<string>;
  private productsSyncedTotal: Counter<string>;
  private stockUpdatesTotal: Counter<string>;
  
  // System Metrics
  private systemMemoryUsage: Gauge<string>;
  private systemCpuUsage: Gauge<string>;
  private databaseConnections: Gauge<string>;

  constructor() {
    this.registry = new Registry();
    
    // Integration Metrics
    this.integrationRequestsTotal = new Counter({
      name: 'depopanel_integration_requests_total',
      help: 'Total number of integration API requests',
      labelNames: ['marketplace', 'method', 'status'],
      registers: [this.registry],
    });

    this.integrationErrorsTotal = new Counter({
      name: 'depopanel_integration_errors_total',
      help: 'Total number of integration errors',
      labelNames: ['marketplace', 'method', 'error_code'],
      registers: [this.registry],
    });

    this.integrationDuration = new Histogram({
      name: 'depopanel_integration_duration_seconds',
      help: 'Integration operation duration in seconds',
      labelNames: ['marketplace', 'method'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
      registers: [this.registry],
    });

    this.activeIntegrations = new Gauge({
      name: 'depopanel_active_integrations',
      help: 'Number of active integrations',
      labelNames: ['marketplace'],
      registers: [this.registry],
    });

    // Job Metrics
    this.jobExecutionsTotal = new Counter({
      name: 'depopanel_job_executions_total',
      help: 'Total number of job executions',
      labelNames: ['job_name', 'status'],
      registers: [this.registry],
    });

    this.jobErrorsTotal = new Counter({
      name: 'depopanel_job_errors_total',
      help: 'Total number of job errors',
      labelNames: ['job_name', 'error_type'],
      registers: [this.registry],
    });

    this.jobDuration = new Histogram({
      name: 'depopanel_job_duration_seconds',
      help: 'Job execution duration in seconds',
      labelNames: ['job_name'],
      buckets: [1, 5, 10, 30, 60, 120, 300, 600],
      registers: [this.registry],
    });

    this.jobQueueSize = new Gauge({
      name: 'depopanel_job_queue_size',
      help: 'Current job queue size',
      labelNames: ['job_name', 'status'],
      registers: [this.registry],
    });

    // Business Metrics
    this.ordersProcessedTotal = new Counter({
      name: 'depopanel_orders_processed_total',
      help: 'Total number of orders processed',
      labelNames: ['marketplace', 'status'],
      registers: [this.registry],
    });

    this.productsSyncedTotal = new Counter({
      name: 'depopanel_products_synced_total',
      help: 'Total number of products synced',
      labelNames: ['marketplace', 'status'],
      registers: [this.registry],
    });

    this.stockUpdatesTotal = new Counter({
      name: 'depopanel_stock_updates_total',
      help: 'Total number of stock updates',
      labelNames: ['marketplace', 'status'],
      registers: [this.registry],
    });

    // System Metrics
    this.systemMemoryUsage = new Gauge({
      name: 'depopanel_system_memory_usage_bytes',
      help: 'System memory usage in bytes',
      labelNames: ['type'], // rss, heapTotal, heapUsed, external
      registers: [this.registry],
    });

    this.systemCpuUsage = new Gauge({
      name: 'depopanel_system_cpu_usage_microseconds',
      help: 'System CPU usage in microseconds',
      labelNames: ['type'], // user, system
      registers: [this.registry],
    });

    this.databaseConnections = new Gauge({
      name: 'depopanel_database_connections',
      help: 'Number of active database connections',
      registers: [this.registry],
    });

    // Collect default metrics (CPU, memory, etc.)
    collectDefaultMetrics({ register: this.registry });
  }

  /**
   * Record integration operation
   */
  recordIntegrationOperation(
    marketplace: MarketplaceType,
    method: string,
    success: boolean,
    duration: number,
    errorCode?: string
  ): void {
    const status = success ? 'success' : 'error';
    
    this.integrationRequestsTotal.inc({ marketplace, method, status });
    this.integrationDuration.observe({ marketplace, method }, duration / 1000); // Convert ms to seconds

    if (!success) {
      this.integrationErrorsTotal.inc({
        marketplace,
        method,
        error_code: errorCode || 'UNKNOWN',
      });
    }
  }

  /**
   * Record job execution
   */
  recordJobExecution(
    jobName: string,
    success: boolean,
    duration: number,
    errorType?: string
  ): void {
    const status = success ? 'success' : 'error';
    
    this.jobExecutionsTotal.inc({ job_name: jobName, status });
    this.jobDuration.observe({ job_name: jobName }, duration / 1000); // Convert ms to seconds

    if (!success && errorType) {
      this.jobErrorsTotal.inc({ job_name: jobName, error_type: errorType });
    }
  }

  /**
   * Update active integrations count
   */
  updateActiveIntegrations(marketplace: MarketplaceType, count: number): void {
    this.activeIntegrations.set({ marketplace }, count);
  }

  /**
   * Update job queue size
   */
  updateJobQueueSize(jobName: string, status: string, size: number): void {
    this.jobQueueSize.set({ job_name: jobName, status }, size);
  }

  /**
   * Record order processed
   */
  recordOrderProcessed(marketplace: MarketplaceType, status: string): void {
    this.ordersProcessedTotal.inc({ marketplace, status });
  }

  /**
   * Record product synced
   */
  recordProductSynced(marketplace: MarketplaceType, status: string): void {
    this.productsSyncedTotal.inc({ marketplace, status });
  }

  /**
   * Record stock update
   */
  recordStockUpdate(marketplace: MarketplaceType, status: string): void {
    this.stockUpdatesTotal.inc({ marketplace, status });
  }

  /**
   * Update system memory metrics
   */
  updateSystemMemory(): void {
    const memory = process.memoryUsage();
    this.systemMemoryUsage.set({ type: 'rss' }, memory.rss);
    this.systemMemoryUsage.set({ type: 'heapTotal' }, memory.heapTotal);
    this.systemMemoryUsage.set({ type: 'heapUsed' }, memory.heapUsed);
    this.systemMemoryUsage.set({ type: 'external' }, memory.external);
  }

  /**
   * Update system CPU metrics
   */
  updateSystemCpu(): void {
    const cpuUsage = process.cpuUsage();
    this.systemCpuUsage.set({ type: 'user' }, cpuUsage.user);
    this.systemCpuUsage.set({ type: 'system' }, cpuUsage.system);
  }

  /**
   * Update database connections count
   */
  updateDatabaseConnections(count: number): void {
    this.databaseConnections.set(count);
  }

  /**
   * Get Prometheus metrics in text format
   */
  async getPrometheusMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Get metrics summary for custom endpoint
   */
  async getMetricsSummary(): Promise<{
    integrations: Record<string, any>;
    jobs: Record<string, any>;
    business: Record<string, any>;
    system: Record<string, any>;
  }> {
    const metrics = await this.registry.getMetricsAsJSON();

    // Extract integration metrics
    const integrations = {
      requestsTotal: this.extractMetricValue(metrics, 'depopanel_integration_requests_total'),
      errorsTotal: this.extractMetricValue(metrics, 'depopanel_integration_errors_total'),
      duration: this.extractMetricValue(metrics, 'depopanel_integration_duration_seconds'),
      active: this.extractMetricValue(metrics, 'depopanel_active_integrations'),
    };

    // Extract job metrics
    const jobs = {
      executionsTotal: this.extractMetricValue(metrics, 'depopanel_job_executions_total'),
      errorsTotal: this.extractMetricValue(metrics, 'depopanel_job_errors_total'),
      duration: this.extractMetricValue(metrics, 'depopanel_job_duration_seconds'),
      queueSize: this.extractMetricValue(metrics, 'depopanel_job_queue_size'),
    };

    // Extract business metrics
    const business = {
      ordersProcessed: this.extractMetricValue(metrics, 'depopanel_orders_processed_total'),
      productsSynced: this.extractMetricValue(metrics, 'depopanel_products_synced_total'),
      stockUpdates: this.extractMetricValue(metrics, 'depopanel_stock_updates_total'),
    };

    // Extract system metrics
    const system = {
      memoryUsage: this.extractMetricValue(metrics, 'depopanel_system_memory_usage_bytes'),
      cpuUsage: this.extractMetricValue(metrics, 'depopanel_system_cpu_usage_microseconds'),
      databaseConnections: this.extractMetricValue(metrics, 'depopanel_database_connections'),
    };

    return { integrations, jobs, business, system };
  }

  /**
   * Extract metric value from metrics JSON
   */
  private extractMetricValue(metrics: any[], metricName: string): any {
    const metric = metrics.find(m => m.name === metricName);
    if (!metric) return null;

    if (metric.type === 'counter' || metric.type === 'gauge') {
      return metric.values || [];
    } else if (metric.type === 'histogram' || metric.type === 'summary') {
      return metric.values || [];
    }

    return null;
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset(): void {
    this.registry.resetMetrics();
  }

  /**
   * Get registry (for advanced usage)
   */
  getRegistry(): Registry {
    return this.registry;
  }
}

// Singleton instance
export const metricsService = new MetricsService();

// Auto-update system metrics every 30 seconds
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    try {
      metricsService.updateSystemMemory();
      metricsService.updateSystemCpu();
    } catch (error) {
      logger.error('[Metrics] Failed to update system metrics:', error);
    }
  }, 30000);
}

