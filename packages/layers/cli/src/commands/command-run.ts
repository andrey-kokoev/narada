/**
 * Command Execution Intent Zone command surface.
 *
 * Narrow first slice: execute a governed command request, persist a bounded
 * result, and inspect/list command runs without emitting unbounded output.
 */

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { openTaskLifecycleStore, type TaskLifecycleStore } from '../lib/task-lifecycle-store.js';
import { digestText, excerptText, generateRunId } from '../lib/testing-intent.js';
import { readTaskGraph, renderJson } from '../lib/task-graph.js';
import { workbenchDiagnoseCommand } from './workbench-server.js';
import {
  buildCommandExecutionRegime,
  commandRequestIdempotencyKey,
  type CommandApprovalPosture,
  type CommandOutputAdmissionProfile,
  type CommandRunRow,
  type CommandRunStatus,
  type CommandSideEffectClass,
} from '../lib/command-execution-intent.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export type CommandRunPresetName = 'cli-build' | 'task-graph-json' | 'workbench-diagnose';
const COMMAND_RUN_PRESETS = new Set<string>(['cli-build', 'task-graph-json', 'workbench-diagnose']);

export interface CommandRunOptions {
  cmd?: string;
  argv?: string;
  preset?: CommandRunPresetName;
  shell?: boolean;
  taskNumber?: number;
  agent?: string;
  requester?: string;
  requesterKind?: 'operator' | 'agent' | 'system';
  sideEffect?: CommandSideEffectClass;
  timeout?: number;
  outputProfile?: CommandOutputAdmissionProfile;
  rationale?: string;
  cwd?: string;
  store?: TaskLifecycleStore;
  format?: 'json' | 'human' | 'auto';
}

export interface ResolvedCommandRunPreset {
  argv: string[];
  sideEffect: CommandSideEffectClass;
  timeoutSeconds: number;
  outputProfile: CommandOutputAdmissionProfile;
  rationale: string;
}

export interface CommandRunInspectOptions {
  runId?: string;
  full?: boolean;
  cwd?: string;
  store?: TaskLifecycleStore;
  format?: 'json' | 'human' | 'auto';
}

export interface CommandRunListOptions {
  taskNumber?: number;
  agent?: string;
  limit?: number;
  cwd?: string;
  store?: TaskLifecycleStore;
  format?: 'json' | 'human' | 'auto';
}

function nowIso(): string {
  return new Date().toISOString();
}

function getStore(cwd: string, store?: TaskLifecycleStore): TaskLifecycleStore {
  mkdirSync(resolve(cwd, '.ai'), { recursive: true });
  return store ?? openTaskLifecycleStore(cwd);
}

function parseArgv(options: CommandRunOptions): string[] {
  if (options.argv) {
    const parsed = JSON.parse(options.argv) as unknown;
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
      throw new Error('--argv must be a JSON array of strings');
    }
    return parsed as string[];
  }
  const command = options.cmd?.trim();
  if (!command) throw new Error('No command provided. Use --argv \'["cmd"]\' or --cmd "<command>"');
  return options.shell ? [command] : command.split(/\s+/).filter(Boolean);
}

export function resolveCommandRunPreset(name: CommandRunPresetName, cwd: string): ResolvedCommandRunPreset {
  const cliEntry = resolve(__dirname, '..', 'main.js');
  switch (name) {
    case 'cli-build':
      return {
        argv: ['pnpm', '--filter', '@narada2/cli', 'build'],
        sideEffect: 'workspace_write',
        timeoutSeconds: 180,
        outputProfile: 'bounded_excerpt',
        rationale: 'CEIZ preset: CLI package build diagnostic',
      };
    case 'task-graph-json':
      return {
        argv: [process.execPath, cliEntry, 'task', 'graph', '--format', 'json', '--include-closed', '--cwd', cwd],
        sideEffect: 'read_only',
        timeoutSeconds: 30,
        outputProfile: 'bounded_excerpt',
        rationale: 'CEIZ preset: bounded task graph diagnostic',
      };
    case 'workbench-diagnose':
      return {
        argv: [process.execPath, cliEntry, 'workbench', 'diagnose', '--format', 'json', '--cwd', cwd],
        sideEffect: 'read_only',
        timeoutSeconds: 30,
        outputProfile: 'bounded_excerpt',
        rationale: 'CEIZ preset: bounded workbench diagnostic',
      };
  }
}

function resolveTaskId(store: TaskLifecycleStore, taskNumber: number | undefined): string | null {
  if (taskNumber === undefined) return null;
  return store.getLifecycleByNumber(taskNumber)?.task_id ?? null;
}

function publicRun(row: CommandRunRow, options?: { full?: boolean }): Record<string, unknown> {
  const base = {
    run_id: row.run_id,
    request_id: row.request_id,
    requester_id: row.requester_id,
    requester_kind: row.requester_kind,
    command_argv: row.command_argv,
    cwd: row.cwd,
    task_id: row.task_id,
    task_number: row.task_number,
    agent_id: row.agent_id,
    side_effect_class: row.side_effect_class,
    approval_posture: row.approval_posture,
    output_admission_profile: row.output_admission_profile,
    requested_at: row.requested_at,
    status: row.status,
    exit_code: row.exit_code,
    signal: row.signal,
    started_at: row.started_at,
    completed_at: row.completed_at,
    duration_ms: row.duration_ms,
    stdout_digest: row.stdout_digest,
    stderr_digest: row.stderr_digest,
    stdout_admitted_excerpt: row.stdout_admitted_excerpt,
    stderr_admitted_excerpt: row.stderr_admitted_excerpt,
    full_output_artifact_uri: row.full_output_artifact_uri,
    error_class: row.error_class,
    approval_outcome: row.approval_outcome,
  };
  if (!options?.full) return base;
  return {
    ...base,
    telemetry: row.telemetry_json ? JSON.parse(row.telemetry_json) : null,
    full_output_available: row.full_output_artifact_uri !== null,
  };
}

function executeCommand(argv: string[], options: { cwd: string; timeoutMs: number; shell: boolean }): Promise<{
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}> {
  return new Promise((done) => {
    const started = Date.now();
    const child = options.shell
      ? spawn(argv[0]!, { cwd: options.cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
      : spawn(argv[0]!, argv.slice(1), { cwd: options.cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000);
    }, options.timeoutMs);

    child.stdout?.on('data', (data: Buffer) => { stdout += data.toString('utf8'); });
    child.stderr?.on('data', (data: Buffer) => { stderr += data.toString('utf8'); });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timeout);
      done({ exitCode, signal, stdout, stderr, durationMs: Date.now() - started, timedOut });
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      done({ exitCode: 1, signal: null, stdout, stderr: stderr + error.message, durationMs: Date.now() - started, timedOut });
    });
  });
}

async function executePresetInProcess(
  preset: CommandRunPresetName,
  cwd: string,
): Promise<{
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
} | null> {
  if (preset === 'cli-build') return null;
  const started = Date.now();
  try {
    if (preset === 'task-graph-json') {
      const graph = await readTaskGraph({ cwd, includeClosed: true });
      return {
        exitCode: 0,
        signal: null,
        stdout: JSON.stringify({ status: 'success', ...renderJson(graph) }, null, 2),
        stderr: '',
        durationMs: Date.now() - started,
        timedOut: false,
      };
    }
    if (preset === 'workbench-diagnose') {
      const result = await workbenchDiagnoseCommand({ cwd, format: 'json' });
      return {
        exitCode: result.exitCode,
        signal: null,
        stdout: JSON.stringify(result.result, null, 2),
        stderr: '',
        durationMs: Date.now() - started,
        timedOut: false,
      };
    }
  } catch (error) {
    return {
      exitCode: 1,
      signal: null,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - started,
      timedOut: false,
    };
  }
  return null;
}

export async function commandRunCommand(options: CommandRunOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const fmt = createFormatter({ format: options.format ?? 'auto' });
  let store: TaskLifecycleStore | null = null;
  try {
    if (options.preset && (options.cmd || options.argv)) {
      return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: '--preset cannot be combined with --cmd or --argv' } };
    }
    if (options.preset && !COMMAND_RUN_PRESETS.has(options.preset)) {
      return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: `Unknown command-run preset: ${options.preset}` } };
    }
    const preset = options.preset ? resolveCommandRunPreset(options.preset, cwd) : null;
    const argv = preset?.argv ?? parseArgv(options);
    const sideEffect = options.sideEffect ?? preset?.sideEffect ?? 'read_only';
    const regime = buildCommandExecutionRegime(sideEffect);
    const shell = Boolean(options.shell);
    if (shell && !regime.shell_mode_allowed) {
      return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', reason: 'shell_mode_blocked' } };
    }
    store = getStore(cwd, options.store);
    const taskId = resolveTaskId(store, options.taskNumber);
    const requestedAt = nowIso();
    const runId = generateRunId();
    const requestId = generateRunId();
    const requesterId = options.requester ?? options.agent ?? 'operator';
    const approvalPosture: CommandApprovalPosture = regime.requires_approval ? 'required' : 'not_required';
    const timeoutSeconds = Math.min(options.timeout ?? preset?.timeoutSeconds ?? regime.default_timeout_seconds, regime.max_timeout_seconds);
    const base: CommandRunRow = {
      run_id: runId,
      request_id: requestId,
      requester_id: requesterId,
      requester_kind: options.requesterKind ?? (options.agent ? 'agent' : 'operator'),
      command_argv: argv,
      command_argv_json: JSON.stringify(argv),
      cwd,
      env_policy: { mode: 'inherit' },
      env_policy_json: JSON.stringify({ mode: 'inherit' }),
      timeout_seconds: timeoutSeconds,
      stdin_policy: { mode: 'none' },
      stdin_policy_json: JSON.stringify({ mode: 'none' }),
      task_id: taskId,
      task_number: options.taskNumber ?? null,
      agent_id: options.agent ?? null,
      side_effect_class: sideEffect,
      approval_posture: approvalPosture,
      output_admission_profile: options.outputProfile ?? preset?.outputProfile ?? 'bounded_excerpt',
      idempotency_key: commandRequestIdempotencyKey({ requester_id: requesterId, command_argv: argv, cwd, task_id: taskId, side_effect_class: sideEffect }),
      requested_at: requestedAt,
      rationale: options.rationale ?? preset?.rationale ?? null,
      status: regime.requires_approval ? 'blocked_by_policy' : 'running',
      exit_code: null,
      signal: null,
      started_at: regime.requires_approval ? null : requestedAt,
      completed_at: regime.requires_approval ? requestedAt : null,
      duration_ms: regime.requires_approval ? 0 : null,
      stdout_digest: null,
      stderr_digest: null,
      stdout_admitted_excerpt: null,
      stderr_admitted_excerpt: null,
      full_output_artifact_uri: null,
      error_class: regime.requires_approval ? 'approval_required' : null,
      approval_outcome: approvalPosture,
      telemetry_json: null,
      updated_at: requestedAt,
    };
    store.insertCommandRun(base);

    if (regime.requires_approval) {
      const result = { status: 'blocked_by_policy', run: publicRun(base) };
      return { exitCode: ExitCode.GENERAL_ERROR, result: fmt.getFormat() === 'json' ? result : `Command run blocked by policy: ${runId}` };
    }

    const executed = await executePresetInProcess(options.preset as CommandRunPresetName, cwd)
      ?? await executeCommand(argv, { cwd, timeoutMs: timeoutSeconds * 1000, shell });
    const completedAt = nowIso();
    const status: CommandRunStatus = executed.timedOut
      ? 'timed_out'
      : executed.exitCode === 0 ? 'succeeded' : 'failed';
    const updates: Partial<CommandRunRow> = {
      status,
      exit_code: executed.exitCode,
      signal: executed.signal,
      completed_at: completedAt,
      duration_ms: executed.durationMs,
      stdout_digest: await digestText(executed.stdout),
      stderr_digest: await digestText(executed.stderr),
      stdout_admitted_excerpt: excerptText(executed.stdout),
      stderr_admitted_excerpt: excerptText(executed.stderr),
      telemetry_json: JSON.stringify({
        stdout_bytes: Buffer.byteLength(executed.stdout),
        stderr_bytes: Buffer.byteLength(executed.stderr),
        shell,
      }),
      updated_at: completedAt,
    };
    store.updateCommandRun(runId, updates);
    const row = store.getCommandRun(runId)!;
    const result = { status: 'success', run: publicRun(row) };
    return { exitCode: status === 'succeeded' ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR, result: fmt.getFormat() === 'json' ? result : `Command run ${runId}: ${status}` };
  } catch (error) {
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: error instanceof Error ? error.message : String(error) } };
  } finally {
    if (store && !options.store) store.db.close();
  }
}

export async function commandRunInspectCommand(options: CommandRunInspectOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const fmt = createFormatter({ format: options.format ?? 'auto' });
  if (!options.runId) {
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: '--run-id is required' } };
  }
  const store = getStore(cwd, options.store);
  try {
    const row = store.getCommandRun(options.runId);
    if (!row) return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: `Command run not found: ${options.runId}` } };
    const result = { status: 'success', run: publicRun(row, { full: options.full }) };
    return { exitCode: ExitCode.SUCCESS, result: fmt.getFormat() === 'json' ? result : `Command run ${row.run_id}: ${row.status}` };
  } finally {
    if (!options.store) store.db.close();
  }
}

export async function commandRunListCommand(options: CommandRunListOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const fmt = createFormatter({ format: options.format ?? 'auto' });
  const store = getStore(cwd, options.store);
  try {
    const taskId = options.taskNumber !== undefined ? resolveTaskId(store, options.taskNumber) : null;
    const runs = store.listCommandRuns(options.limit ?? 20, taskId, options.agent ?? null);
    const result = {
      status: 'success',
      count: runs.length,
      runs: runs.map((row) => ({
        run_id: row.run_id,
        request_id: row.request_id,
        status: row.status,
        exit_code: row.exit_code,
        duration_ms: row.duration_ms,
        task_number: row.task_number,
        agent_id: row.agent_id,
        requested_at: row.requested_at,
        command_argv: row.command_argv,
      })),
    };
    return { exitCode: ExitCode.SUCCESS, result: fmt.getFormat() === 'json' ? result : `Command runs: ${runs.length}` };
  } finally {
    if (!options.store) store.db.close();
  }
}
