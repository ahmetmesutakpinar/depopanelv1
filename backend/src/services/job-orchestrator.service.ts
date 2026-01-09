import { logger } from '../utils/logger.js';
import { metricsService } from './metrics.service.js';
import { tracer } from '../utils/tracing.js';
import type {
  JobDependency,
  WorkflowDefinition,
  WorkflowContext,
  WorkflowResult,
  JobStatus,
  RetryStrategy,
  WorkflowStep,
} from '../types/workflow.types.js';

/**
 * Job Orchestrator Service
 * 
 * Provides:
 * - Job dependency management
 * - Workflow orchestration (multi-step job workflows)
 * - Job priority queue system
 * - Job execution coordination
 * - Retry strategies per job type
 */
class JobOrchestrator {
  private jobQueue: Map<string, JobDependency> = new Map();
  private runningJobs: Map<string, JobStatus> = new Map();
  private completedJobs: Map<string, JobStatus> = new Map();
  private jobExecutors: Map<string, () => Promise<any>> = new Map();
  private readonly maxConcurrentJobs = 5;

  /**
   * Register a job executor function
   */
  registerJob(jobName: string, executor: () => Promise<any>): void {
    this.jobExecutors.set(jobName, executor);
  }

  /**
   * Schedule a job with dependencies
   */
  async scheduleJob(job: JobDependency): Promise<string> {
    const jobId = `${job.jobName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.jobQueue.set(jobId, job);

    logger.info(`[Orchestrator] Job scheduled: ${job.jobName} (${jobId})`, {
      priority: job.priority,
      dependsOn: job.dependsOn,
    });

    // Try to execute if dependencies are met
    this.processQueue();

    return jobId;
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(workflow: WorkflowDefinition): Promise<WorkflowResult> {
    const traceId = tracer.startTrace(`workflow:${workflow.workflowId}`);
    const startTime = Date.now();

    const context: WorkflowContext = {
      workflowId: workflow.workflowId,
      startTime,
      completedSteps: [],
      failedSteps: [],
      stepResults: {},
      metadata: {},
    };

    logger.info(`[Orchestrator] Workflow started: ${workflow.name} (${workflow.workflowId})`);

    try {
      if (workflow.parallel) {
        // Execute steps in parallel
        await this.executeStepsParallel(workflow, context);
      } else {
        // Execute steps sequentially
        await this.executeStepsSequential(workflow, context);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      const result: WorkflowResult = {
        workflowId: workflow.workflowId,
        success: context.failedSteps.length === 0,
        duration,
        completedSteps: context.completedSteps,
        failedSteps: context.failedSteps,
        results: context.stepResults,
      };

      tracer.endSpan(traceId, result.success ? 'completed' : 'error', result.failedSteps.length > 0 ? 'Some steps failed' : undefined);
      metricsService.recordJobExecution(workflow.workflowId, result.success, duration);

      logger.info(`[Orchestrator] Workflow completed: ${workflow.name}`, {
        success: result.success,
        duration: `${duration}ms`,
        completed: context.completedSteps.length,
        failed: context.failedSteps.length,
      });

      return result;
    } catch (error: any) {
      const endTime = Date.now();
      const duration = endTime - startTime;

      const result: WorkflowResult = {
        workflowId: workflow.workflowId,
        success: false,
        duration,
        completedSteps: context.completedSteps,
        failedSteps: context.failedSteps,
        error: error.message || 'Unknown error',
        results: context.stepResults,
      };

      tracer.endSpan(traceId, 'error', error.message);
      metricsService.recordJobExecution(workflow.workflowId, false, duration, error.name);

      logger.error(`[Orchestrator] Workflow failed: ${workflow.name}`, error);

      return result;
    }
  }

  /**
   * Execute steps sequentially
   */
  private async executeStepsSequential(
    workflow: WorkflowDefinition,
    context: WorkflowContext
  ): Promise<void> {
    for (const step of workflow.steps) {
      context.currentStep = step.stepId;

      // Check condition
      if (step.condition && !step.condition(context)) {
        logger.info(`[Orchestrator] Step skipped (condition not met): ${step.stepId}`);
        continue;
      }

      // Check dependencies
      if (step.jobName && this.hasUncompletedDependencies(step.jobName, context)) {
        logger.warn(`[Orchestrator] Step waiting for dependencies: ${step.stepId}`);
        continue;
      }

      try {
        const stepResult = await this.executeStep(step, context);
        context.completedSteps.push(step.stepId);
        context.stepResults[step.stepId] = stepResult;
      } catch (error: any) {
        context.failedSteps.push(step.stepId);
        logger.error(`[Orchestrator] Step failed: ${step.stepId}`, error);

        if (step.onError === 'stop' || workflow.onError === 'stop') {
          throw error;
        } else if (step.onError === 'rollback' || workflow.onError === 'rollback') {
          // TODO: Implement rollback logic
          logger.warn(`[Orchestrator] Rollback not yet implemented for step: ${step.stepId}`);
        }
        // If 'continue', just log and move to next step
      }
    }
  }

  /**
   * Execute steps in parallel
   */
  private async executeStepsParallel(
    workflow: WorkflowDefinition,
    context: WorkflowContext
  ): Promise<void> {
    const parallelSteps = workflow.steps.filter(step => step.parallel !== false);
    const sequentialSteps = workflow.steps.filter(step => step.parallel === false);

    // Execute sequential steps first
    for (const step of sequentialSteps) {
      await this.executeStepsSequential({ ...workflow, steps: [step] }, context);
    }

    // Execute parallel steps
    const parallelPromises = parallelSteps.map(step => {
      if (step.condition && !step.condition(context)) {
        return Promise.resolve(null);
      }
      return this.executeStep(step, context)
        .then(result => {
          context.completedSteps.push(step.stepId);
          context.stepResults[step.stepId] = result;
        })
        .catch(error => {
          context.failedSteps.push(step.stepId);
          logger.error(`[Orchestrator] Parallel step failed: ${step.stepId}`, error);
        });
    });

    await Promise.all(parallelPromises);
  }

  /**
   * Execute a single step
   */
  private async executeStep(step: WorkflowStep, context: WorkflowContext): Promise<any> {
    const executor = this.jobExecutors.get(step.jobName);
    if (!executor) {
      throw new Error(`Job executor not found: ${step.jobName}`);
    }

    const spanId = tracer.startSpan(`step:${step.stepId}`, undefined, context.workflowId);
    const startTime = Date.now();

    try {
      const result = await this.executeWithRetry(
        executor,
        step.retryStrategy || 'exponential',
        step.maxRetries || 3
      );

      const duration = Date.now() - startTime;
      tracer.endSpan(spanId, 'completed');
      metricsService.recordJobExecution(step.jobName, true, duration);

      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      tracer.endSpan(spanId, 'error', error.message);
      metricsService.recordJobExecution(step.jobName, false, duration, error.name);
      throw error;
    }
  }

  /**
   * Execute with retry strategy
   */
  private async executeWithRetry(
    executor: () => Promise<any>,
    strategy: RetryStrategy,
    maxRetries: number
  ): Promise<any> {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await executor();
      } catch (error: any) {
        lastError = error;

        if (attempt < maxRetries) {
          const delay = this.calculateRetryDelay(strategy, attempt);
          logger.warn(`[Orchestrator] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Calculate retry delay based on strategy
   */
  private calculateRetryDelay(strategy: RetryStrategy, attempt: number): number {
    switch (strategy) {
      case 'exponential':
        return Math.min(1000 * Math.pow(2, attempt), 30000); // Max 30s
      case 'linear':
        return 1000 * (attempt + 1); // 1s, 2s, 3s...
      case 'fixed':
        return 5000; // Fixed 5s
      default:
        return 1000;
    }
  }

  /**
   * Check if job has uncompleted dependencies
   */
  private hasUncompletedDependencies(jobName: string, context: WorkflowContext): boolean {
    // This is a simplified check - in a real implementation, you'd check actual job dependencies
    return false;
  }

  /**
   * Process job queue
   */
  private async processQueue(): Promise<void> {
    const availableSlots = this.maxConcurrentJobs - this.runningJobs.size;
    if (availableSlots <= 0) {
      return;
    }

    // Sort jobs by priority
    const sortedJobs = Array.from(this.jobQueue.entries())
      .sort((a, b) => b[1].priority - a[1].priority);

    for (const [jobId, job] of sortedJobs.slice(0, availableSlots)) {
      // Check dependencies
      if (job.dependsOn && !this.areDependenciesCompleted(job.dependsOn)) {
        continue;
      }

      this.jobQueue.delete(jobId);
      this.executeJob(jobId, job);
    }
  }

  /**
   * Check if dependencies are completed
   */
  private areDependenciesCompleted(dependsOn: string[]): boolean {
    return dependsOn.every(depJobName => {
      return Array.from(this.completedJobs.values()).some(
        job => job.jobName === depJobName && job.status === 'completed'
      );
    });
  }

  /**
   * Execute a job
   */
  private async executeJob(jobId: string, job: JobDependency): Promise<void> {
    const executor = this.jobExecutors.get(job.jobName);
    if (!executor) {
      logger.error(`[Orchestrator] Job executor not found: ${job.jobName}`);
      return;
    }

    const status: JobStatus = {
      jobId,
      jobName: job.jobName,
      status: 'running',
      startTime: Date.now(),
      retryCount: 0,
      dependsOn: job.dependsOn,
    };

    this.runningJobs.set(jobId, status);

    try {
      const result = await this.executeWithRetry(
        executor,
        job.retryStrategy,
        job.maxRetries || 3
      );

      status.status = 'completed';
      status.endTime = Date.now();
      status.duration = status.endTime - status.startTime!;
      status.result = result;

      this.completedJobs.set(jobId, status);
      this.runningJobs.delete(jobId);

      metricsService.recordJobExecution(job.jobName, true, status.duration);

      // Process queue for next jobs
      this.processQueue();
    } catch (error: any) {
      status.status = 'failed';
      status.endTime = Date.now();
      status.duration = status.endTime - status.startTime!;
      status.error = error.message;

      this.completedJobs.set(jobId, status);
      this.runningJobs.delete(jobId);

      metricsService.recordJobExecution(job.jobName, false, status.duration, error.name);

      logger.error(`[Orchestrator] Job failed: ${job.jobName} (${jobId})`, error);

      // Process queue for next jobs
      this.processQueue();
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    return (
      this.runningJobs.get(jobId) ||
      this.completedJobs.get(jobId) ||
      null
    );
  }

  /**
   * Get all job statuses
   */
  getAllJobStatuses(): JobStatus[] {
    return [
      ...Array.from(this.runningJobs.values()),
      ...Array.from(this.completedJobs.values()),
    ];
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const jobOrchestrator = new JobOrchestrator();

