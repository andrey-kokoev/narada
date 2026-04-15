/**
 * Process Execution Types
 *
 * Durable execution records for the process executor family.
 */

export interface ProcessExecution {
  execution_id: string;
  intent_id: string;
  command: string;
  args_json: string;
  cwd: string | null;
  env_json: string | null;
  status: "pending" | "running" | "completed" | "failed";
  exit_code: number | null;
  stdout: string;
  stderr: string;
  started_at: string | null;
  completed_at: string | null;
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
