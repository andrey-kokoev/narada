/**
 * Testing Intent Zone types and helpers.
 *
 * Defines the canonical request and result artifacts for governed test execution.
 * Based on Decisions 600–603.
 */

export type TestRunScope = 'focused' | 'full';

export type TestRunStatus =
  | 'requested'
  | 'running'
  | 'passed'
  | 'failed'
  | 'timed_out'
  | 'blocked'
  | 'invalid_request';

export interface VerificationRequest {
  request_id: string;
  task_id: string | null;
  target_command: string;
  scope: TestRunScope;
  timeout_seconds: number;
  requester_identity: string;
  requested_at: string;
  rationale: string | null;
}

export interface VerificationResult {
  result_id: string;
  request_id: string;
  status: TestRunStatus;
  exit_code: number | null;
  duration_ms: number;
  stdout_digest: string | null;
  stderr_digest: string | null;
  stdout_excerpt: string | null;
  stderr_excerpt: string | null;
  completed_at: string;
}

export interface VerificationMetrics {
  test_count: number | null;
  pass_count: number | null;
  fail_count: number | null;
  skip_count: number | null;
}

/**
 * Row shape for SQLite persistence.
 */
export interface VerificationRunRow {
  run_id: string;
  request_id: string;
  task_id: string | null;
  target_command: string;
  scope: TestRunScope;
  timeout_seconds: number;
  requester_identity: string;
  requested_at: string;
  status: TestRunStatus;
  exit_code: number | null;
  duration_ms: number;
  metrics_json: string | null;
  stdout_digest: string | null;
  stderr_digest: string | null;
  stdout_excerpt: string | null;
  stderr_excerpt: string | null;
  completed_at: string | null;
}

/**
 * Generate a run ID.
 */
export function generateRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Simple SHA-256 hex digest of a string (for stdout/stderr digests).
 */
export async function digestText(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Truncate text to a bounded excerpt size.
 */
export function excerptText(text: string, maxChars = 2048): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n... [truncated]';
}

/**
 * Default timeout by scope.
 */
export function defaultTimeout(scope: TestRunScope): number {
  return scope === 'full' ? 300 : 60;
}

/**
 * Max timeout by scope.
 */
export function maxTimeout(scope: TestRunScope): number {
  return scope === 'full' ? 600 : 120;
}

/**
 * Classify command scope heuristically.
 */
export function classifyCommandScope(command: string): TestRunScope {
  const lower = command.toLowerCase().trim();
  if (lower.includes('test:full') || lower.includes('test:all') || lower === 'pnpm test') {
    return 'full';
  }
  return 'focused';
}
