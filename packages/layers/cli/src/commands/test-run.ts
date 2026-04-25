/**
 * Testing Intent Zone command surface.
 *
 * Sanctioned path for governed test execution:
 *   narada test-run --cmd "pnpm test:unit" [--task 606]
 *   narada test-run inspect --run-id <id>
 *   narada test-run list [--task <num>]
 *
 * Creates a durable VerificationRequest, executes the command,
 * and stores a VerificationResult. Replaces ad hoc shell invocation
 * as the canonical task-verification path.
 */

import { resolve } from 'node:path';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { openTaskLifecycleStore, type TaskLifecycleStore } from '../lib/task-lifecycle-store.js';
import {
  generateRunId,
  classifyCommandScope,
  defaultTimeout,
  maxTimeout,
  type TestRunScope,
  type VerificationRunRow,
} from '../lib/testing-intent.js';
import { commandRunCommand } from './command-run.js';

export interface TestRunOptions {
  cmd?: string;
  taskNumber?: number;
  timeout?: number;
  scope?: TestRunScope;
  requester?: string;
  rationale?: string;
  cwd?: string;
  store?: TaskLifecycleStore;
  format?: 'json' | 'human' | 'auto';
}

export interface TestRunInspectOptions {
  runId?: string;
  cwd?: string;
  store?: TaskLifecycleStore;
  format?: 'json' | 'human' | 'auto';
}

export interface TestRunListOptions {
  taskNumber?: number;
  limit?: number;
  cwd?: string;
  store?: TaskLifecycleStore;
  format?: 'json' | 'human' | 'auto';
}

function nowIso(): string {
  return new Date().toISOString();
}

function getStore(cwd: string, store?: TaskLifecycleStore): TaskLifecycleStore {
  if (store) return store;
  return openTaskLifecycleStore(cwd);
}

function resolveTaskId(cwd: string, taskNumber: number | undefined, store: TaskLifecycleStore): string | null {
  if (taskNumber === undefined) return null;
  const lifecycle = store.getLifecycleByNumber(taskNumber);
  return lifecycle?.task_id ?? null;
}

export async function testRunCommand(
  options: TestRunOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const command = options.cmd?.trim();

  if (!command) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'No command provided. Use --cmd "<command>"' },
    };
  }

  const store = getStore(cwd, options.store);
  const taskId = resolveTaskId(cwd, options.taskNumber, store);
  const scope = options.scope ?? classifyCommandScope(command);
  const requester = options.requester ?? 'operator';

  // Full suite guard
  if (scope === 'full' && !process.env.ALLOW_FULL_TESTS) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: 'Full suite runs require ALLOW_FULL_TESTS=1. Use --scope focused for subset runs.',
      },
    };
  }

  const requestedTimeout = options.timeout ?? defaultTimeout(scope);
  const cappedTimeout = Math.min(requestedTimeout, maxTimeout(scope));

  const runId = generateRunId();
  const requestId = generateRunId();
  const requestedAt = nowIso();

  // Insert initial run record (status: requested -> running)
  const run: VerificationRunRow = {
    run_id: runId,
    request_id: requestId,
    task_id: taskId,
    target_command: command,
    scope,
    timeout_seconds: cappedTimeout,
    requester_identity: requester,
    requested_at: requestedAt,
    status: 'running',
    exit_code: null,
    duration_ms: 0,
    metrics_json: null,
    stdout_digest: null,
    stderr_digest: null,
    stdout_excerpt: null,
    stderr_excerpt: null,
    completed_at: null,
  };
  store.insertVerificationRun(run);

  // Execute through CEIZ. TIZ keeps VerificationRun as the evidence artifact.
  const commandRun = await commandRunCommand({
    cmd: command,
    shell: true,
    taskNumber: options.taskNumber,
    requester,
    requesterKind: requester === 'operator' ? 'operator' : 'agent',
    sideEffect: 'workspace_write',
    timeout: cappedTimeout,
    outputProfile: 'bounded_excerpt',
    rationale: options.rationale ?? `TIZ ${scope} verification run`,
    cwd,
    store,
    format: 'json',
  });
  const commandRunResult = commandRun.result as {
    run?: {
      run_id: string;
      status: string;
      exit_code: number | null;
      duration_ms: number | null;
      stdout_digest: string | null;
      stderr_digest: string | null;
      stdout_admitted_excerpt: string | null;
      stderr_admitted_excerpt: string | null;
    };
    error?: string;
  };
  const ceizRun = commandRunResult.run;
  if (!ceizRun) {
    store.updateVerificationRun(runId, {
      status: 'invalid_request',
      exit_code: 1,
      duration_ms: 0,
      metrics_json: JSON.stringify({ ceiz_error: commandRunResult.error ?? 'command_run_failed' }),
      completed_at: nowIso(),
    });
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', run_id: runId, error: commandRunResult.error ?? 'CEIZ command run failed' },
    };
  }

  const timedOut = ceizRun.status === 'timed_out';
  const status: VerificationRunRow['status'] = timedOut
      ? 'timed_out'
      : ceizRun.exit_code === 0
      ? 'passed'
      : 'failed';
  const exitCode = ceizRun.exit_code;
  const durationMs = ceizRun.duration_ms ?? 0;

  // Update run record with result
  store.updateVerificationRun(runId, {
    status,
    exit_code: exitCode,
    duration_ms: durationMs,
    metrics_json: JSON.stringify({ command_run_id: ceizRun.run_id }),
    stdout_digest: ceizRun.stdout_digest,
    stderr_digest: ceizRun.stderr_digest,
    stdout_excerpt: ceizRun.stdout_admitted_excerpt,
    stderr_excerpt: ceizRun.stderr_admitted_excerpt,
    completed_at: nowIso(),
  });

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: status === 'passed' ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
      result: {
        status: 'success',
        run_id: runId,
        request_id: requestId,
        command,
        scope,
        task_id: taskId,
        task_number: options.taskNumber ?? null,
        command_run_id: ceizRun.run_id,
        result: {
          status,
          exit_code: exitCode,
          duration_ms: durationMs,
          timed_out: timedOut,
        },
      },
    };
  }

  fmt.section('Test Run Result');
  fmt.message(`Run ${runId} completed`, status === 'passed' ? 'success' : 'error');
  fmt.kv('Command', command);
  fmt.kv('Scope', scope);
  fmt.kv('Status', status);
  fmt.kv('Duration', `${(durationMs / 1000).toFixed(1)}s`);
  if (options.taskNumber) fmt.kv('Linked task', options.taskNumber);
  fmt.kv('Run ID', runId);

  return {
    exitCode: status === 'passed' ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
    result: {
      status: 'success',
      run_id: runId,
      result: { status, exit_code: exitCode, duration_ms: durationMs, timed_out: timedOut },
    },
  };
}

export async function testRunInspectCommand(
  options: TestRunInspectOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const runId = options.runId?.trim();

  if (!runId) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'No run ID provided. Use --run-id <id>' },
    };
  }

  const store = getStore(cwd, options.store);
  const run = store.getVerificationRun(runId);

  if (!run) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Run ${runId} not found` },
    };
  }

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: { status: 'success', run },
    };
  }

  fmt.section(`Test Run ${run.run_id}`);
  fmt.kv('Command', run.target_command);
  fmt.kv('Scope', run.scope);
  fmt.kv('Status', run.status);
  fmt.kv('Duration', run.duration_ms > 0 ? `${(run.duration_ms / 1000).toFixed(1)}s` : '—');
  fmt.kv('Exit code', run.exit_code ?? '—');
  fmt.kv('Requested at', run.requested_at);
  fmt.kv('Completed at', run.completed_at ?? '—');
  if (run.task_id) fmt.kv('Task ID', run.task_id);
  if (run.stdout_excerpt) {
    console.log('\n  Stdout excerpt:');
    console.log(run.stdout_excerpt.split('\n').map((l) => `    ${l}`).join('\n'));
  }
  if (run.stderr_excerpt) {
    console.log('\n  Stderr excerpt:');
    console.log(run.stderr_excerpt.split('\n').map((l) => `    ${l}`).join('\n'));
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: { status: 'success', run },
  };
}

export async function testRunListCommand(
  options: TestRunListOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const store = getStore(cwd, options.store);

  let runs: VerificationRunRow[];
  if (options.taskNumber !== undefined) {
    const lifecycle = store.getLifecycleByNumber(options.taskNumber);
    if (!lifecycle) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Task ${options.taskNumber} not found` },
      };
    }
    runs = store.listVerificationRunsForTask(lifecycle.task_id);
  } else {
    runs = store.listRecentVerificationRuns(options.limit ?? 20);
  }

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: { status: 'success', count: runs.length, runs },
    };
  }

  fmt.section(`Test Runs (${runs.length})`);
  if (runs.length === 0) {
    fmt.message('No test runs found', 'info');
    return { exitCode: ExitCode.SUCCESS, result: { status: 'success', count: 0, runs: [] } };
  }

  fmt.table(
    [
      { key: 'run_id' as const, label: 'Run ID', width: 24 },
      { key: 'status' as const, label: 'Status', width: 12 },
      { key: 'command' as const, label: 'Command', width: 30 },
      { key: 'duration' as const, label: 'Duration', width: 10 },
      { key: 'requested_at' as const, label: 'Requested', width: 20 },
    ],
    runs.map((r) => ({
      run_id: r.run_id,
      status: r.status,
      command: r.target_command.length > 27 ? r.target_command.slice(0, 27) + '...' : r.target_command,
      duration: r.duration_ms > 0 ? `${(r.duration_ms / 1000).toFixed(1)}s` : '—',
      requested_at: r.requested_at.slice(0, 19).replace('T', ' '),
    })),
  );

  return {
    exitCode: ExitCode.SUCCESS,
    result: { status: 'success', count: runs.length, runs },
  };
}
