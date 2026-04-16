/**
 * Process Execution Types
 *
 * Durable execution records for the process executor family.
 * Aligned with the unified executor lifecycle model.
 */

import type { ExecutionPhase, ConfirmationStatus } from "./lifecycle.js";

export interface ProcessExecution {
  execution_id: string;
  intent_id: string;
  executor_family: string;
  phase: ExecutionPhase;
  confirmation_status: ConfirmationStatus;
  command: string;
  args_json: string;
  cwd: string | null;
  env_json: string | null;
  /** Backward-compatible alias for phase */
  status: ExecutionPhase;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  started_at: string | null;
  completed_at: string | null;
  confirmed_at: string | null;
  error_message: string | null;
  artifact_id: string | null;
  result_json: string;
  lease_expires_at: string | null;
  lease_runner_id: string | null;
  created_at: string;
}

export interface ProcessRunPayload {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout_ms?: number;
}
