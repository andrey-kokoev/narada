import { execFile, execFileSync, execSync, spawn, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ChildProcess,
  ExecFileOptions,
  ExecFileSyncOptions,
  ExecSyncOptions,
  SpawnOptions,
  SpawnSyncOptions,
  SpawnSyncReturns,
  StdioOptions,
} from 'node:child_process';

type JsonRecord = Record<string, any>;
type SpawnImplementation = (...args: any[]) => any;
type SpawnSyncImplementation = (...args: any[]) => any;
type HiddenPosture = Exclude<ProcessLaunchPosture, 'operator_terminal' | 'elevated_or_operator_prompt'>;

export type ProcessLaunchPosture =
  | 'operator_terminal'
  | 'browser_open'
  | 'provider_subprocess'
  | 'mcp_server'
  | 'governed_command_execution'
  | 'operator_projection_host'
  | 'agent_runtime_server'
  | 'runtime_observer'
  | 'test_child'
  | 'elevated_or_operator_prompt';

export interface BrowserOpenResult {
  posture: 'browser_open';
  command: string;
  args: string[];
  detached: true;
  stdio: 'ignore';
  windowsHide: boolean;
  pid: number | null;
}

export function processSupervisorEntrypoint(options: { platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv } = {}): string | null {
  const platform = options.platform ?? process.platform;
  if (platform !== 'win32') return null;
  const override = options.env?.NARADA_PROCESS_SUPERVISOR_PATH ?? process.env.NARADA_PROCESS_SUPERVISOR_PATH;
  if (override) return resolve(override);
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', 'native', 'target', 'release', 'narada-process-supervisor.exe');
}

export function scheduledCommandEntrypoint(options: { platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv } = {}): string | null {
  return processSupervisorEntrypoint(options);
}

export function scheduledCommandSourceEntrypoint(options: { platform?: NodeJS.Platform } = {}): string | null {
  const platform = options.platform ?? process.platform;
  if (platform !== 'win32') return null;
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', 'native', 'src', 'main.rs');
}

export interface ScheduledCommandLaunchPlan {
  schema: 'narada.process_launch.scheduled_command.v1';
  launcher_path: string;
  launcher_arguments: string;
  launcher_argv: [string, string];
  target_command: string;
  target_arguments: string;
  console_window_policy: 'native_create_no_window';
}

export interface ScheduledCommandLaunchOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

export interface ScheduledCommandPlaceholderPlan {
  schema: 'narada.process_launch.scheduled_command_placeholder.v1';
  launcher_path: string;
  launcher_arguments: '--scheduled-noop-v1';
  launcher_argv: ['--scheduled-noop-v1'];
  console_window_policy: 'native_create_no_window';
}

export function createScheduledCommandPlaceholderPlan(
  options: ScheduledCommandLaunchOptions = {},
): ScheduledCommandPlaceholderPlan {
  const launcherPath = scheduledCommandEntrypoint(options);
  if (!launcherPath) throw new Error(`scheduled_command_windows_only:${options.platform ?? process.platform}`);
  return {
    schema: 'narada.process_launch.scheduled_command_placeholder.v1',
    launcher_path: launcherPath,
    launcher_arguments: '--scheduled-noop-v1',
    launcher_argv: ['--scheduled-noop-v1'],
    console_window_policy: 'native_create_no_window',
  };
}

export function createScheduledCommandLaunchPlan(
  command: string,
  argumentsText = '',
  options: ScheduledCommandLaunchOptions = {},
): ScheduledCommandLaunchPlan {
  const targetCommand = unwrapExecutable(command);
  const targetArguments = String(argumentsText ?? '');
  if (targetCommand.includes('\0') || targetArguments.includes('\0')) {
    throw new Error('scheduled_command_nul_refused');
  }
  const launcherPath = scheduledCommandEntrypoint(options);
  if (!launcherPath) throw new Error(`scheduled_command_windows_only:${options.platform ?? process.platform}`);
  const payload = Buffer.from(`${targetCommand}\0${targetArguments}`, 'utf8').toString('base64url');
  return {
    schema: 'narada.process_launch.scheduled_command.v1',
    launcher_path: launcherPath,
    launcher_arguments: `--scheduled-v1 ${payload}`,
    launcher_argv: ['--scheduled-v1', payload],
    target_command: targetCommand,
    target_arguments: targetArguments,
    console_window_policy: 'native_create_no_window',
  };
}

export function decodeScheduledCommandLaunchArguments(argumentsText: string): Pick<ScheduledCommandLaunchPlan, 'target_command' | 'target_arguments'> {
  const match = /^--scheduled-v1\s+([A-Za-z0-9_-]+)$/.exec(String(argumentsText ?? '').trim());
  if (!match) throw new Error('scheduled_command_arguments_invalid');
  const payload = Buffer.from(match[1]!, 'base64url');
  if (payload.toString('base64url') !== match[1]) throw new Error('scheduled_command_payload_invalid');
  const separator = payload.indexOf(0);
  if (separator <= 0 || payload.indexOf(0, separator + 1) !== -1) {
    throw new Error('scheduled_command_payload_invalid');
  }
  return {
    target_command: payload.subarray(0, separator).toString('utf8'),
    target_arguments: payload.subarray(separator + 1).toString('utf8'),
  };
}

function unwrapExecutable(value: string): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) throw new Error('scheduled_command_target_required');
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    const unwrapped = trimmed.slice(1, -1);
    if (!unwrapped) throw new Error('scheduled_command_target_required');
    return unwrapped;
  }
  return trimmed;
}

export interface BrowserOpenOptions {
  platform?: NodeJS.Platform;
  spawnImpl?: SpawnImplementation;
}

export interface OperatorProjectionOpenCaller {
  package?: string | null;
  command?: string | null;
  module?: string | null;
}

export interface OperatorProjectionOpenPolicy {
  allow_visible_host_effect?: boolean;
  allowVisibleHostEffect?: boolean;
  suppress_reason?: string | null;
  suppressReason?: string | null;
}

export interface OperatorProjectionOpenRequestInput extends JsonRecord {
  projection_kind?: string;
  projectionKind?: string;
  target_ref?: string | null;
  targetRef?: string | null;
  target?: string | null;
  purpose?: string;
  caller?: OperatorProjectionOpenCaller;
  mode?: 'plan' | 'execute' | string;
  policy?: OperatorProjectionOpenPolicy;
  allowVisibleHostEffect?: boolean;
  suppressReason?: string | null;
}

export interface OperatorProjectionOpenRequest {
  schema: 'narada.operator_projection_open_request.v1';
  projection_kind: string;
  target_ref: string | null;
  purpose: string;
  caller: Required<OperatorProjectionOpenCaller>;
  mode: string;
  policy: { allow_visible_host_effect: boolean; suppress_reason: string | null };
  created_at: string;
}

export interface OperatorProjectionOpenOutcome extends OperatorProjectionOpenRequest {
  status: 'planned' | 'admitted' | 'opened' | 'suppressed' | 'refused' | 'failed';
  admission_reason: string;
  mutation_performed: boolean;
  opened_at?: string;
  executor_result?: unknown;
  error?: string;
}

export interface OperatorProjectionOpenExecutionOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  now?: Date;
  browserOpenOptions?: BrowserOpenOptions;
  openUrl?: (target: string) => Promise<void> | void;
  openBrowserUrl?: (target: string, options?: BrowserOpenOptions) => Promise<BrowserOpenResult | unknown>;
}

export interface OperatorTerminalResult {
  posture: 'operator_terminal' | 'elevated_or_operator_prompt';
  command: string;
  args: string[];
  stdio: StdioOptions;
  windowsHide: false;
  result: SpawnSyncReturns<Buffer>;
}

export interface OperatorTerminalOptions extends Omit<SpawnSyncOptions, 'windowsHide'> {
  spawnSyncImpl?: SpawnSyncImplementation;
}

export interface HiddenPostureOptions extends SpawnOptions {
  posture?: string;
  platform?: NodeJS.Platform;
  spawnImpl?: SpawnImplementation;
}

export interface HiddenPostureSyncOptions extends SpawnSyncOptions {
  posture?: string;
  platform?: NodeJS.Platform;
  spawnSyncImpl?: SpawnSyncImplementation;
}

export interface HiddenPostureExecFileOptions extends ExecFileOptions {
  posture?: string;
  platform?: NodeJS.Platform;
  stdio?: StdioOptions;
}

const HIDDEN_POSTURES = new Set<HiddenPosture>([
  'browser_open',
  'provider_subprocess',
  'mcp_server',
  'governed_command_execution',
  'operator_projection_host',
  'agent_runtime_server',
  'runtime_observer',
  'test_child',
]);

function browserOpenCommand(target: string, { platform = process.platform }: { platform?: NodeJS.Platform } = {}): {
  posture: 'browser_open';
  command: string;
  args: string[];
} {
  if (!target || typeof target !== 'string') throw new Error('browser_open_target_required');
  if (platform === 'win32') return { posture: 'browser_open', command: 'cmd.exe', args: ['/c', 'start', '', target] };
  if (platform === 'darwin') return { posture: 'browser_open', command: 'open', args: [target] };
  return { posture: 'browser_open', command: 'xdg-open', args: [target] };
}

function spawnOperatorTerminal(
  command: string,
  args: string[] = [],
  options: SpawnOptions & { spawnImpl?: SpawnImplementation; stdio?: StdioOptions } = {},
): ChildProcess {
  if (!command || typeof command !== 'string') throw new Error('operator_terminal_command_required');
  const { spawnImpl = spawn, ...spawnOptions } = options;
  const stdio = spawnOptions.stdio ?? 'inherit';
  return spawnImpl(command, args, {
    ...spawnOptions,
    stdio,
    windowsHide: false,
  });
}

function spawnHiddenPostureProcess(
  command: string,
  args: string[] = [],
  options: HiddenPostureOptions = {},
): ChildProcess {
  const { posture, spawnImpl = spawn, platform = process.platform, ...restOptions } = options;
  if (!posture || !HIDDEN_POSTURES.has(posture as HiddenPosture)) throw new Error(`hidden_process_posture_required: ${posture ?? 'missing'}`);
  const normalized = normalizeHiddenCommand(command, args, { platform });
  const spawnOptions: SpawnOptions = {
    ...restOptions,
    windowsHide: true,
  };
  return spawnImpl(normalized.command, normalized.args, spawnOptions);
}

function normalizeHiddenCommand(
  command: string,
  args: string[] = [],
  { platform = process.platform }: { platform?: NodeJS.Platform } = {},
): { command: string; args: string[] } {
  if (platform === 'win32' && /\.(?:cmd|bat)$/i.test(String(command))) {
    return {
      command: process.env.ComSpec || process.env.COMSPEC || 'cmd.exe',
      args: ['/d', '/s', '/c', String(command), ...args],
    };
  }
  return { command, args };
}

function spawnProviderSubprocess(command: string, args: string[] = [], options: HiddenPostureOptions = {}): ChildProcess {
  return spawnHiddenPostureProcess(command, args, { ...options, posture: 'provider_subprocess' });
}

function spawnMcpServer(command: string, args: string[] = [], options: HiddenPostureOptions = {}): ChildProcess {
  return spawnHiddenPostureProcess(command, args, { ...options, posture: 'mcp_server' });
}

function runGovernedCommand(command: string, args: string[] = [], options: HiddenPostureOptions = {}): ChildProcess {
  return spawnHiddenPostureProcess(command, args, { ...options, posture: 'governed_command_execution' });
}

function runHiddenPostureCommandSync(
  command: string,
  args: string[] = [],
  options: HiddenPostureSyncOptions = {},
): SpawnSyncReturns<Buffer> {
  const { posture, spawnSyncImpl = spawnSync, platform = process.platform, ...restOptions } = options;
  if (!posture || !HIDDEN_POSTURES.has(posture as HiddenPosture)) throw new Error(`hidden_process_posture_required: ${posture ?? 'missing'}`);
  const normalized = normalizeHiddenCommand(command, args, { platform });
  return spawnSyncImpl(normalized.command, normalized.args, {
    ...restOptions,
    windowsHide: true,
  });
}

function runGovernedCommandSync(command: string, args: string[] = [], options: HiddenPostureSyncOptions = {}): SpawnSyncReturns<Buffer> {
  return runHiddenPostureCommandSync(command, args, { ...options, posture: 'governed_command_execution' });
}

function execFileHiddenPosture(
  command: string,
  args: string[] = [],
  options: HiddenPostureExecFileOptions = {},
): Promise<{ stdout: string | Buffer; stderr: string | Buffer }> {
  const { posture, platform = process.platform, ...restOptions } = options;
  if (!posture || !HIDDEN_POSTURES.has(posture as HiddenPosture)) throw new Error(`hidden_process_posture_required: ${posture ?? 'missing'}`);
  const normalized = normalizeHiddenCommand(command, args, { platform });
  return new Promise((resolve, reject) => {
    execFile(normalized.command, normalized.args, {
      ...restOptions,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error) {
        const execError = error as Error & { stdout?: string | Buffer; stderr?: string | Buffer };
        execError.stdout = stdout;
        execError.stderr = stderr;
        reject(execError);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function execFileGoverned(command: string, args: string[] = [], options: HiddenPostureExecFileOptions = {}): Promise<{ stdout: string | Buffer; stderr: string | Buffer }> {
  return execFileHiddenPosture(command, args, { ...options, posture: 'governed_command_execution' });
}

function execFileHiddenPostureSync(
  command: string,
  args: string[] = [],
  options: HiddenPostureExecFileOptions = {},
): string | Buffer {
  const { posture, platform = process.platform, ...restOptions } = options;
  if (!posture || !HIDDEN_POSTURES.has(posture as HiddenPosture)) throw new Error(`hidden_process_posture_required: ${posture ?? 'missing'}`);
  const normalized = normalizeHiddenCommand(command, args, { platform });
  return execFileSync(normalized.command, normalized.args, {
    ...restOptions,
    windowsHide: true,
  } as ExecFileSyncOptions);
}

function execFileGovernedSync(command: string, args: string[] = [], options: HiddenPostureExecFileOptions = {}): string | Buffer {
  return execFileHiddenPostureSync(command, args, { ...options, posture: 'governed_command_execution' });
}

function execGovernedSync(command: string, options: ExecSyncOptions = {}): string | Buffer {
  return execSync(command, {
    ...options,
    windowsHide: true,
  });
}

function spawnTestChild(command: string, args: string[] = [], options: HiddenPostureOptions = {}): ChildProcess {
  return spawnHiddenPostureProcess(command, args, { ...options, posture: 'test_child' });
}

function openBrowserUrl(target: string, { platform = process.platform, spawnImpl = spawn }: BrowserOpenOptions = {}): Promise<BrowserOpenResult> {
  const plan = browserOpenCommand(target, { platform });
  return new Promise((resolve, reject) => {
    const child = spawnImpl(plan.command, plan.args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('spawn', () => {
      resolve({
        ...plan,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        pid: typeof child.pid === 'number' ? child.pid : null,
      });
    });
    child.unref();
  });
}

const OPERATOR_PROJECTION_OPEN_REQUEST_SCHEMA = 'narada.operator_projection_open_request.v1';

function createOperatorProjectionOpenRequest(
  input: OperatorProjectionOpenRequestInput = {},
  options: { now?: Date } = {},
): OperatorProjectionOpenRequest {
  const targetRef = input.target_ref ?? input.targetRef ?? input.target ?? null;
  const projectionKind = input.projection_kind ?? input.projectionKind ?? 'browser_url';
  const caller = normalizeOperatorProjectionCaller(input.caller);
  const policy = normalizeOperatorProjectionPolicy(input.policy, input);
  return {
    schema: OPERATOR_PROJECTION_OPEN_REQUEST_SCHEMA,
    projection_kind: String(projectionKind),
    target_ref: targetRef === null || targetRef === undefined ? null : String(targetRef),
    purpose: String(input.purpose ?? 'operator_projection'),
    caller,
    mode: String(input.mode ?? 'execute'),
    policy,
    created_at: options.now instanceof Date ? options.now.toISOString() : new Date().toISOString(),
  };
}

function admitOperatorProjectionOpenRequest(
  input: OperatorProjectionOpenRequestInput = {},
  options: Pick<OperatorProjectionOpenExecutionOptions, 'env' | 'platform' | 'now'> = {},
): OperatorProjectionOpenOutcome {
  const request = createOperatorProjectionOpenRequest(input, options);
  if (request.mode === 'plan') {
    return operatorProjectionOpenOutcome(request, 'planned', {
      admission_reason: 'plan_mode',
      mutation_performed: false,
    });
  }
  if (!request.target_ref) {
    return operatorProjectionOpenOutcome(request, 'refused', {
      admission_reason: 'target_ref_required',
      mutation_performed: false,
    });
  }
  if (request.projection_kind !== 'browser_url') {
    return operatorProjectionOpenOutcome(request, 'refused', {
      admission_reason: `unsupported_projection_kind:${request.projection_kind}`,
      mutation_performed: false,
    });
  }
  const suppressReason = request.policy.suppress_reason ?? operatorProjectionEnvironmentSuppressReason(options.env ?? process.env, options.platform ?? process.platform);
  if (suppressReason) {
    return operatorProjectionOpenOutcome(request, 'suppressed', {
      admission_reason: suppressReason,
      mutation_performed: false,
    });
  }
  if (request.policy.allow_visible_host_effect !== true) {
    return operatorProjectionOpenOutcome(request, 'refused', {
      admission_reason: 'visible_host_effect_not_admitted',
      mutation_performed: false,
    });
  }
  return operatorProjectionOpenOutcome(request, 'admitted', {
    admission_reason: 'visible_host_effect_admitted',
    mutation_performed: false,
  });
}

async function executeOperatorProjectionOpenRequest(
  input: OperatorProjectionOpenRequestInput = {},
  options: OperatorProjectionOpenExecutionOptions = {},
): Promise<OperatorProjectionOpenOutcome> {
  const admitted = admitOperatorProjectionOpenRequest(input, options);
  if (admitted.status !== 'admitted') return admitted;
  const executor = options.openUrl
    ? async (target: string): Promise<JsonRecord> => {
      await options.openUrl?.(target);
      return { posture: 'browser_open', command: 'injected_open_url', args: [target], detached: true, stdio: 'ignore', windowsHide: true, pid: null };
    }
    : (options.openBrowserUrl ?? openBrowserUrl);
  try {
    const executorResult = await executor(admitted.target_ref!, options.browserOpenOptions ?? {});
    return operatorProjectionOpenOutcome(admitted, 'opened', {
      admission_reason: admitted.admission_reason,
      mutation_performed: true,
      opened_at: options.now instanceof Date ? options.now.toISOString() : new Date().toISOString(),
      executor_result: executorResult,
    });
  } catch (error) {
    return operatorProjectionOpenOutcome(admitted, 'failed', {
      admission_reason: admitted.admission_reason,
      mutation_performed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function normalizeOperatorProjectionCaller(caller: unknown): Required<OperatorProjectionOpenCaller> {
  const record = caller && typeof caller === 'object' && !Array.isArray(caller) ? caller as JsonRecord : {};
  return {
    package: typeof record.package === 'string' ? record.package : null,
    command: typeof record.command === 'string' ? record.command : null,
    module: typeof record.module === 'string' ? record.module : null,
  };
}

function normalizeOperatorProjectionPolicy(
  policy: unknown,
  input: OperatorProjectionOpenRequestInput,
): { allow_visible_host_effect: boolean; suppress_reason: string | null } {
  const record = policy && typeof policy === 'object' && !Array.isArray(policy) ? policy as JsonRecord : {};
  const allowVisibleHostEffect = record.allow_visible_host_effect ?? record.allowVisibleHostEffect ?? input.allowVisibleHostEffect;
  const suppressReason = record.suppress_reason ?? record.suppressReason ?? input.suppressReason ?? null;
  return {
    allow_visible_host_effect: allowVisibleHostEffect === undefined ? true : allowVisibleHostEffect === true,
    suppress_reason: typeof suppressReason === 'string' && suppressReason.trim() ? suppressReason.trim() : null,
  };
}

function operatorProjectionEnvironmentSuppressReason(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string | null {
  if (env.NARADA_NO_BROWSER) return 'operator_policy:NARADA_NO_BROWSER';
  if (env.CI) return 'headless:CI';
  if (env.HEADLESS) return 'headless:HEADLESS';
  if (platform === 'linux' && !env.DISPLAY) return 'headless:linux_without_DISPLAY';
  return null;
}

function operatorProjectionOpenOutcome(
  request: OperatorProjectionOpenRequest,
  status: OperatorProjectionOpenOutcome['status'],
  fields: JsonRecord,
): OperatorProjectionOpenOutcome {
  return {
    ...request,
    status,
    ...fields,
  } as OperatorProjectionOpenOutcome;
}

function startOperatorTerminal(
  command: string,
  args: string[] = [],
  options: OperatorTerminalOptions = {},
): OperatorTerminalResult {
  if (!command || typeof command !== 'string') throw new Error('operator_terminal_command_required');
  const { spawnSyncImpl = spawnSync, ...spawnOptions } = options;
  const stdio = spawnOptions.stdio ?? 'inherit';
  const result = spawnSyncImpl(command, args, {
    ...spawnOptions,
    stdio,
    windowsHide: false,
  });
  return {
    posture: 'operator_terminal',
    command,
    args,
    stdio,
    windowsHide: false,
    result,
  };
}

function startElevatedOrOperatorPrompt(
  command: string,
  args: string[] = [],
  options: OperatorTerminalOptions & { reason?: string } = {},
): OperatorTerminalResult {
  const { reason, ...terminalOptions } = options;
  if (!reason || typeof reason !== 'string') throw new Error('elevated_or_operator_prompt_reason_required');
  return {
    ...startOperatorTerminal(command, args, terminalOptions),
    posture: 'elevated_or_operator_prompt',
  };
}

export {
  browserOpenCommand,
  createOperatorProjectionOpenRequest,
  admitOperatorProjectionOpenRequest,
  executeOperatorProjectionOpenRequest,
  execFileGoverned,
  execFileGovernedSync,
  execFileHiddenPosture,
  execFileHiddenPostureSync,
  execGovernedSync,
  normalizeHiddenCommand,
  openBrowserUrl,
  runGovernedCommand,
  runGovernedCommandSync,
  runHiddenPostureCommandSync,
  spawnMcpServer,
  spawnOperatorTerminal,
  spawnProviderSubprocess,
  startOperatorTerminal,
  startElevatedOrOperatorPrompt,
  spawnTestChild,
  spawnHiddenPostureProcess,
};
