/**
 * Sandbox invocation contract.
 *
 * Defines the input and output shapes for bounded execution
 * inside a Cloudflare Sandbox or Container.
 */

export interface SandboxInvocation {
  /** Charter identifier (e.g., "support_steward") */
  charter_id: string;
  /** Serialized CharterInvocationEnvelope */
  envelope_json: string;
  /** Hard timeout in milliseconds */
  timeout_ms: number;
  /** Memory ceiling in megabytes */
  max_memory_mb: number;
}

export interface SandboxResult {
  /** Overall execution status */
  status: "success" | "timeout" | "oom" | "error";
  /** Serialized output (CharterOutputEnvelope or CycleSmokeResult) */
  output_json?: string;
  /** Human-readable error when status is not success */
  error_message?: string;
  /** Actual wall-clock duration */
  duration_ms: number;
}

/**
 * Cycle-smoke result — used when the real charter runtime is not yet
 * portable to the Sandbox. Proves that bounded execution works.
 */
export interface CycleSmokeResult {
  status: "success" | "timeout" | "oom" | "error";
  /** Phases that were executed in order */
  phases_run: string[];
  /** Wall-clock duration */
  duration_ms: number;
  /** Simulated peak memory usage in MB */
  memory_peak_mb: number;
}
