/**
 * Worker Types
 *
 * First-class worker identities and explicit concurrency policies.
 */

export type ConcurrencyPolicy =
  | "singleton"
  | "parallel"
  | "drop_if_running"
  | "latest_wins";

export interface WorkerIdentity {
  worker_id: string;
  executor_family: string;
  concurrency_policy: ConcurrencyPolicy;
  description?: string;
}

export interface WorkerExecutionResult {
  processed: boolean;
  execution_id?: string;
}

export type WorkerFn = () => Promise<WorkerExecutionResult>;
