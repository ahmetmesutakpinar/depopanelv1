/**
 * Workflow Types
 * 
 * Defines workflow orchestration types for multi-step job execution
 */

export type RetryStrategy = 'exponential' | 'linear' | 'fixed';

export interface JobDependency {
  jobName: string;
  dependsOn?: string[]; // Job names that must complete before this job
  priority: number; // 1-10, higher number = higher priority
  retryStrategy: RetryStrategy;
  maxRetries?: number;
  timeout?: number; // milliseconds
}

export interface WorkflowStep {
  stepId: string;
  jobName: string;
  condition?: (context: WorkflowContext) => boolean; // Conditional execution
  parallel?: boolean; // Can run in parallel with other steps
  onError?: 'continue' | 'stop' | 'rollback'; // Error handling strategy
  retryStrategy?: RetryStrategy;
  maxRetries?: number;
}

export interface WorkflowDefinition {
  workflowId: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  parallel?: boolean; // Can steps run in parallel?
  onError?: 'continue' | 'stop' | 'rollback';
}

export interface WorkflowContext {
  workflowId: string;
  startTime: number;
  endTime?: number;
  currentStep?: string;
  completedSteps: string[];
  failedSteps: string[];
  stepResults: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface WorkflowResult {
  workflowId: string;
  success: boolean;
  duration: number;
  completedSteps: string[];
  failedSteps: string[];
  results: Record<string, any>;
  error?: string;
}

export interface JobStatus {
  jobId: string;
  jobName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime?: number;
  endTime?: number;
  duration?: number;
  result?: any;
  error?: string;
  retryCount?: number;
  dependsOn?: string[];
}

