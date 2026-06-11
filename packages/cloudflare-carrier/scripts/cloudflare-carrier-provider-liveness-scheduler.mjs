#!/usr/bin/env node
import { execFile as execFileCallback } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const DEFAULT_TASK_NAME = '\\Narada\\CloudflareProviderLivenessRefresh';
const DEFAULT_INTERVAL_MINUTES = 2;
const DEFAULT_EXECUTION_TIMEOUT_MS = 30000;
const DEFAULT_HIDDEN_WRAPPER_RELATIVE_PATH = '.narada/site-continuity/cloudflare-provider-liveness-refresh.hidden.vbs';
const LIVE_SCHEDULER_READ_ACTIONS = new Set(['status']);
const execFile = promisify(execFileCallback);

export function buildProviderLivenessSchedulerPlan({
  action = 'status',
  repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..'),
  taskName = DEFAULT_TASK_NAME,
  intervalMinutes = DEFAULT_INTERVAL_MINUTES,
  refreshEntrypoint = 'packages/cloudflare-carrier/scripts/cloudflare-carrier-provider-liveness-refresh.mjs',
  scheduledTaskEntrypoint = 'packages/cloudflare-carrier/scripts/cloudflare-carrier-provider-liveness-scheduled-task.mjs',
  localRoot = null,
  nodeCommand = process.env.NARADA_NODE_COMMAND ?? 'node',
  hiddenWrapperPath = null,
  dryRun = true,
} = {}) {
  const root = resolve(repoRoot);
  const refreshEntryPoint = resolve(root, refreshEntrypoint);
  const taskEntryPoint = resolve(root, scheduledTaskEntrypoint);
  const effectiveLocalRoot = resolvePath(root, localRoot ?? root);
  const interval = normalizeIntervalMinutes(intervalMinutes);
  const directTaskCommand = buildTaskCommand({ nodeCommand, entrypoint: taskEntryPoint, localRoot: effectiveLocalRoot });
  const wrapperPath = resolvePath(root, hiddenWrapperPath ?? DEFAULT_HIDDEN_WRAPPER_RELATIVE_PATH);
  const hiddenWrapperContent = buildHiddenVbsWrapperContent(directTaskCommand);
  const taskCommand = buildHiddenTaskCommand({ wrapperPath });
  const status = readLocalSchedulerStatus({ root, refreshEntryPoint, taskEntryPoint, localRoot: effectiveLocalRoot });

  const base = {
    schema: 'narada.cloudflare_carrier.provider_liveness_scheduler_plan.v1',
    action,
    dry_run: dryRun,
    task_name: taskName,
    interval_minutes: interval,
    node_command: nodeCommand,
    repo_root: root,
    refresh_entrypoint: refreshEntryPoint,
    scheduled_task_entrypoint: taskEntryPoint,
    local_root: effectiveLocalRoot,
    hidden_wrapper_path: wrapperPath,
    hidden_wrapper_kind: 'windows_wscript_vbs_hidden',
    hidden_wrapper_content: hiddenWrapperContent,
    credential_posture: 'external_env_file_or_process_environment_only',
    embeds_credentials: false,
    cloudflare_mutation: 'provider_liveness_heartbeat_only',
    filesystem_mutation_admission: action === 'install' && !dryRun ? 'hidden_wrapper_file_write_admitted' : 'not_admitted',
    repository_publication_admission: 'not_admitted',
    task_command: taskCommand,
    direct_task_command: directTaskCommand,
    status,
  };

  switch (action) {
    case 'install':
      if (!dryRun) writeHiddenWrapper({ wrapperPath, content: hiddenWrapperContent });
      return {
        ...base,
        plan_status: dryRun ? 'dry_run_install_plan' : 'live_install_requires_operator_execution',
        scheduled_task_command: [
          'schtasks',
          '/Create',
          '/TN', taskName,
          '/SC', 'MINUTE',
          '/MO', String(interval),
          '/TR', taskCommand,
          '/F',
        ],
      };
    case 'disable':
    case 'pause':
      return {
        ...base,
        plan_status: dryRun ? 'dry_run_disable_plan' : 'live_disable_requires_operator_execution',
        scheduled_task_command: ['schtasks', '/Change', '/TN', taskName, '/DISABLE'],
      };
    case 'resume':
      return {
        ...base,
        plan_status: dryRun ? 'dry_run_resume_plan' : 'live_resume_requires_operator_execution',
        scheduled_task_command: ['schtasks', '/Change', '/TN', taskName, '/ENABLE'],
      };
    case 'uninstall':
      return {
        ...base,
        plan_status: dryRun ? 'dry_run_uninstall_plan' : 'live_uninstall_requires_operator_execution',
        scheduled_task_command: ['schtasks', '/Delete', '/TN', taskName, '/F'],
      };
    case 'status':
      return {
        ...base,
        plan_status: 'status_only_no_cloudflare_access',
        scheduled_task_command: ['schtasks', '/Query', '/TN', taskName, '/V', '/FO', 'LIST'],
      };
    default:
      throw new Error(`unknown_provider_liveness_scheduler_action:${action}`);
  }
}

export async function runProviderLivenessSchedulerAction(
  options = {},
  { execFileImpl = execFile } = {},
) {
  const plan = buildProviderLivenessSchedulerPlan(options);
  if (options.dryRun === false && LIVE_SCHEDULER_READ_ACTIONS.has(plan.action)) {
    return executeProviderLivenessSchedulerReadback(plan, {
      execFileImpl,
      executionTimeoutMs: options.executionTimeoutMs,
    });
  }
  return plan;
}

async function executeProviderLivenessSchedulerReadback(plan, { execFileImpl = execFile, executionTimeoutMs = DEFAULT_EXECUTION_TIMEOUT_MS } = {}) {
  const scheduledTaskCommand = plan?.scheduled_task_command ?? [];
  const [command, ...args] = scheduledTaskCommand;
  const base = {
    ...plan,
    dry_run: false,
    host_scheduler_read_admission: 'bounded_schtasks_query_from_scheduler_plan',
    embeds_credentials: false,
  };
  if (command !== 'schtasks' || args[0] !== '/Query') {
    return {
      ...base,
      scheduler_task_readback: {
        state: 'refused',
        status: 'needs_attention',
        reason: 'unsupported_scheduler_query_command',
        command: command ?? null,
        args,
        embeds_credentials: false,
      },
    };
  }
  const timeout = normalizeExecutionTimeoutMs(executionTimeoutMs);
  try {
    const result = await execFileImpl(command, args, { cwd: plan.repo_root, timeout, windowsHide: true });
    return {
      ...base,
      scheduler_task_readback: summarizeProviderLivenessSchedulerReadback({
        state: 'completed',
        command,
        args,
        stdout: result?.stdout ?? '',
        stderr: result?.stderr ?? '',
        timeout_ms: timeout,
        parsed: parseSchedulerTaskListOutput(result?.stdout ?? ''),
        expectedIntervalMinutes: plan.interval_minutes,
        expectedTaskCommand: plan.task_command,
        expectedTaskEntrypoint: plan.scheduled_task_entrypoint,
      }),
    };
  } catch (error) {
    return {
      ...base,
      scheduler_task_readback: {
        state: 'failed',
        status: 'needs_attention',
        command,
        args,
        exit_code: error.code ?? null,
        signal: error.signal ?? null,
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? '',
        timeout_ms: timeout,
        embeds_credentials: false,
      },
    };
  }
}

export function summarizeProviderLivenessSchedulerReadback({ state, command, args, stdout, stderr, timeout_ms: timeoutMs, parsed, expectedIntervalMinutes, expectedTaskCommand, expectedTaskEntrypoint }) {
  const repeatEvery = parsed['Repeat: Every'] ?? null;
  const taskToRun = parsed['Task To Run'] ?? null;
  const actualIntervalMinutes = parseSchedulerRepeatMinutes(repeatEvery);
  const expectedInterval = normalizeIntervalMinutes(expectedIntervalMinutes);
  const lastResult = parsed['Last Result'] ?? null;
  const scheduledTaskState = parsed['Scheduled Task State'] ?? null;
  const statusText = parsed.Status ?? null;
  const cadenceStatus = actualIntervalMinutes === null
    ? 'unknown'
    : actualIntervalMinutes === expectedInterval ? 'matches_plan' : 'differs_from_plan';
  const expectedCommandNeedle = expectedTaskCommand ?? expectedTaskEntrypoint;
  const taskCommandMatches = taskToRun && expectedCommandNeedle
    ? normalizeCommandForComparison(taskToRun).includes(normalizeCommandForComparison(expectedCommandNeedle))
    : null;
  const taskCommandStatus = taskCommandMatches === null ? 'unknown' : taskCommandMatches ? 'matches_plan' : 'differs_from_plan';
  const attentionReasons = [
    cadenceStatus === 'differs_from_plan' ? 'scheduler_cadence_differs_from_plan' : null,
    taskCommandStatus === 'differs_from_plan' ? 'scheduler_task_command_differs_from_plan' : null,
    isSchedulerLastResultHealthy(lastResult, statusText) ? null : 'scheduler_last_result_nonzero',
    scheduledTaskState && !/^enabled$/i.test(scheduledTaskState) ? 'scheduler_task_disabled' : null,
  ].filter(Boolean);
  return {
    state,
    status: attentionReasons.length === 0 ? 'ok' : 'needs_attention',
    command,
    args,
    stdout,
    stderr,
    timeout_ms: timeoutMs,
    parsed,
    task_name: parsed.TaskName ?? null,
    scheduled_task_state: scheduledTaskState,
    status_text: statusText,
    last_run_time: parsed['Last Run Time'] ?? null,
    last_result: lastResult,
    next_run_time: parsed['Next Run Time'] ?? null,
    task_to_run: taskToRun,
    repeat_every: repeatEvery,
    expected_interval_minutes: expectedInterval,
    actual_interval_minutes: actualIntervalMinutes,
    cadence_status: cadenceStatus,
    task_command_status: taskCommandStatus,
    attention_reasons: attentionReasons,
    embeds_credentials: false,
  };
}

export function formatProviderLivenessSchedulerText(result) {
  const readback = result?.scheduler_task_readback ?? null;
  const status = readback?.status ?? result?.status?.state ?? 'unknown';
  const lines = [
    `Provider Liveness: ${status}`,
    `Task: ${result?.task_name ?? 'unknown'}`,
    `Plan: ${result?.plan_status ?? 'unknown'}`,
  ];
  if (readback) {
    lines.push(`Scheduler: state=${readback.scheduled_task_state ?? 'unknown'} status=${readback.status_text ?? 'unknown'} last=${readback.last_result ?? 'unknown'} next=${readback.next_run_time ?? 'unknown'}`);
    lines.push(`Cadence: expected=${readback.expected_interval_minutes ?? 'unknown'}m actual=${readback.actual_interval_minutes ?? 'unknown'}m ${readback.cadence_status ?? 'unknown'}`);
    lines.push(`Command: ${readback.task_command_status ?? 'unknown'}`);
    if (readback.task_to_run) lines.push(`Task To Run: ${readback.task_to_run}`);
    if (readback.attention_reasons?.length > 0) lines.push(`Attention: ${readback.attention_reasons.join(', ')}`);
  } else {
    lines.push(`Local Root: ${result?.local_root ?? 'unknown'}`);
    lines.push(`Task Scheduler: ${result?.status?.task_scheduler_query_required ? 'live readback required' : 'not required'}`);
  }
  return `${lines.join('\n')}\n`;
}

function isSchedulerLastResultHealthy(lastResult, statusText) {
  if (!lastResult || lastResult === '0') return true;
  const normalizedLastResult = String(lastResult).trim().toLowerCase();
  const normalizedStatus = String(statusText ?? '').trim().toLowerCase();
  return normalizedStatus === 'running' && ['267009', '0x41301'].includes(normalizedLastResult);
}

function parseSchedulerTaskListOutput(output) {
  const parsed = {};
  for (const line of String(output ?? '').split(/\r?\n/)) {
    const repeatEvery = /^Repeat:\s*Every:\s*(.*)$/i.exec(line);
    if (repeatEvery) {
      parsed['Repeat: Every'] = repeatEvery[1].trim();
      continue;
    }
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key) parsed[key] = value;
  }
  return parsed;
}

function parseSchedulerRepeatMinutes(value) {
  const text = String(value ?? '').trim();
  const match = /(?:(\d+)\s*Hour\(s\))?,?\s*(?:(\d+)\s*Minute\(s\))?/i.exec(text);
  if (!match) return null;
  if (match[1] === undefined && match[2] === undefined) return null;
  const hours = Number.parseInt(match[1] ?? '0', 10);
  const minutes = Number.parseInt(match[2] ?? '0', 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function normalizeCommandForComparison(value) {
  return String(value ?? '')
    .replaceAll('"', '')
    .replaceAll('\\', '/')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeExecutionTimeoutMs(value) {
  const parsed = Number.parseInt(value ?? DEFAULT_EXECUTION_TIMEOUT_MS, 10);
  if (!Number.isFinite(parsed) || parsed < 1000) return DEFAULT_EXECUTION_TIMEOUT_MS;
  return Math.min(parsed, 300000);
}

export function readLocalSchedulerStatus({ root, refreshEntryPoint, taskEntryPoint, localRoot }) {
  const envPath = resolve(root, '.env');
  const envKeys = existsSync(envPath) ? readEnvKeys(envPath) : [];
  return {
    state: 'not_queried',
    task_scheduler_query_required: true,
    repo_root_exists: existsSync(root),
    refresh_entrypoint_exists: existsSync(refreshEntryPoint),
    scheduled_task_entrypoint_exists: existsSync(taskEntryPoint),
    local_root_exists: existsSync(localRoot),
    env_file_present: existsSync(envPath),
    required_env_keys_observed: [
      'CLOUDFLARE_CARRIER_URL',
      envKeys.includes('CLOUDFLARE_CARRIER_TOKEN_FILE') ? 'CLOUDFLARE_CARRIER_TOKEN_FILE' : envKeys.includes('CLOUDFLARE_CARRIER_TOKEN') ? 'CLOUDFLARE_CARRIER_TOKEN' : null,
    ].filter(Boolean),
    embeds_credentials: false,
  };
}

function buildTaskCommand({ nodeCommand, entrypoint, localRoot }) {
  return [
    quote(nodeCommand),
    quote(entrypoint),
    '--local-root', quote(localRoot),
  ].join(' ');
}

function buildHiddenTaskCommand({ wrapperPath }) {
  return [
    'wscript.exe',
    '//B',
    quote(wrapperPath),
  ].join(' ');
}

export function buildHiddenVbsWrapperContent(command) {
  return [
    'Set shell = CreateObject("WScript.Shell")',
    `shell.Run ${vbsString(command)}, 0, False`,
    '',
  ].join('\r\n');
}

function writeHiddenWrapper({ wrapperPath, content }) {
  mkdirSync(dirname(wrapperPath), { recursive: true });
  writeFileSync(wrapperPath, content, 'utf8');
}

function readEnvKeys(envPath) {
  const keys = [];
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) keys.push(trimmed.slice(0, eq).trim());
  }
  return keys;
}

function normalizeIntervalMinutes(value) {
  const parsed = Number.parseInt(value ?? DEFAULT_INTERVAL_MINUTES, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_INTERVAL_MINUTES;
  return Math.min(parsed, 60);
}

function resolvePath(root, value) {
  return isAbsolute(value) ? value : resolve(root, value);
}

function quote(value) {
  return `"${String(value).replaceAll('"', '\\"')}"`;
}

function vbsString(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function parseArgs(argv) {
  const args = { action: 'status', dryRun: true, format: 'json' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--live') args.dryRun = false;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--action') args.action = argv[++index];
    else if (arg === '--repo-root') args.repoRoot = argv[++index];
    else if (arg === '--task-name') args.taskName = argv[++index];
    else if (arg === '--interval-minutes') args.intervalMinutes = argv[++index];
    else if (arg === '--refresh-entrypoint') args.refreshEntrypoint = argv[++index];
    else if (arg === '--scheduled-task-entrypoint') args.scheduledTaskEntrypoint = argv[++index];
    else if (arg === '--local-root') args.localRoot = argv[++index];
    else if (arg === '--node-command') args.nodeCommand = argv[++index];
    else if (arg === '--hidden-wrapper-path') args.hiddenWrapperPath = argv[++index];
    else if (arg === '--format') args.format = argv[++index];
    else throw new Error(`unknown_argument:${arg}`);
  }
  return args;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  runProviderLivenessSchedulerAction(args)
    .then((plan) => {
      if (args.format === 'text') process.stdout.write(formatProviderLivenessSchedulerText(plan));
      else console.log(JSON.stringify(plan, null, 2));
    })
    .catch((error) => {
      console.error(error.stack ?? error.message);
      process.exitCode = 1;
    });
}
