import type { ChildProcess, ExecFileOptions, ExecFileSyncOptions, ExecSyncOptions, SpawnOptions, SpawnSyncOptions, SpawnSyncReturns, StdioOptions } from 'node:child_process';

export type ProcessLaunchPosture =
  | 'operator_terminal'
  | 'browser_open'
  | 'provider_subprocess'
  | 'mcp_server'
  | 'governed_command_execution'
  | 'operator_projection_host'
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

export interface BrowserOpenOptions {
  platform?: NodeJS.Platform;
  spawnImpl?: typeof import('node:child_process').spawn;
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

export interface OperatorProjectionOpenRequestInput {
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
  spawnSyncImpl?: typeof import('node:child_process').spawnSync;
}

export interface HiddenPostureOptions extends SpawnOptions {
  platform?: NodeJS.Platform;
  spawnImpl?: typeof import('node:child_process').spawn;
}

export interface HiddenPostureSyncOptions extends SpawnSyncOptions {
  platform?: NodeJS.Platform;
  spawnSyncImpl?: typeof import('node:child_process').spawnSync;
}

export interface HiddenPostureExecFileOptions extends ExecFileOptions {
  platform?: NodeJS.Platform;
}

export interface HiddenPostureExecFileSyncOptions extends ExecFileSyncOptions {
  platform?: NodeJS.Platform;
}

export function browserOpenCommand(target: string, options?: { platform?: NodeJS.Platform }): {
  posture: 'browser_open';
  command: string;
  args: string[];
};

export function normalizeHiddenCommand(command: string, args?: string[], options?: { platform?: NodeJS.Platform }): {
  command: string;
  args: string[];
};

export function openBrowserUrl(target: string, options?: BrowserOpenOptions): Promise<BrowserOpenResult>;

export function createOperatorProjectionOpenRequest(input?: OperatorProjectionOpenRequestInput, options?: { now?: Date }): OperatorProjectionOpenRequest;

export function admitOperatorProjectionOpenRequest(input?: OperatorProjectionOpenRequestInput, options?: Pick<OperatorProjectionOpenExecutionOptions, 'env' | 'platform' | 'now'>): OperatorProjectionOpenOutcome;

export function executeOperatorProjectionOpenRequest(input?: OperatorProjectionOpenRequestInput, options?: OperatorProjectionOpenExecutionOptions): Promise<OperatorProjectionOpenOutcome>;

export function startOperatorTerminal(command: string, args?: string[], options?: OperatorTerminalOptions): OperatorTerminalResult;

export function spawnOperatorTerminal(command: string, args?: string[], options?: SpawnOptions & {
  spawnImpl?: typeof import('node:child_process').spawn;
  stdio?: StdioOptions;
}): ChildProcess;

export function spawnHiddenPostureProcess(command: string, args: string[], options: SpawnOptions & {
  posture: Exclude<ProcessLaunchPosture, 'operator_terminal' | 'elevated_or_operator_prompt'>;
  platform?: NodeJS.Platform;
  spawnImpl?: typeof import('node:child_process').spawn;
  stdio?: StdioOptions;
}): ChildProcess;

export function spawnProviderSubprocess(command: string, args?: string[], options?: HiddenPostureOptions): ChildProcess;

export function spawnMcpServer(command: string, args?: string[], options?: HiddenPostureOptions): ChildProcess;

export function runGovernedCommand(command: string, args?: string[], options?: HiddenPostureOptions): ChildProcess;

export function runHiddenPostureCommandSync(command: string, args: string[], options: HiddenPostureSyncOptions & {
  posture: Exclude<ProcessLaunchPosture, 'operator_terminal' | 'elevated_or_operator_prompt'>;
}): SpawnSyncReturns<Buffer>;

export function runGovernedCommandSync(command: string, args?: string[], options?: HiddenPostureSyncOptions): SpawnSyncReturns<Buffer>;

export function execFileHiddenPosture(command: string, args: string[], options: HiddenPostureExecFileOptions & {
  posture: Exclude<ProcessLaunchPosture, 'operator_terminal' | 'elevated_or_operator_prompt'>;
}): Promise<{ stdout: string | Buffer; stderr: string | Buffer }>;

export function execFileGoverned(command: string, args?: string[], options?: HiddenPostureExecFileOptions): Promise<{ stdout: string | Buffer; stderr: string | Buffer }>;

export function execFileHiddenPostureSync(command: string, args: string[], options: HiddenPostureExecFileSyncOptions & {
  posture: Exclude<ProcessLaunchPosture, 'operator_terminal' | 'elevated_or_operator_prompt'>;
}): string | Buffer;

export function execFileGovernedSync(command: string, args?: string[], options?: HiddenPostureExecFileSyncOptions): string | Buffer;

export function execGovernedSync(command: string, options?: ExecSyncOptions): string | Buffer;

export function spawnTestChild(command: string, args?: string[], options?: HiddenPostureOptions): ChildProcess;

export function startElevatedOrOperatorPrompt(command: string, args?: string[], options?: OperatorTerminalOptions & { reason: string }): OperatorTerminalResult;

