import type { ChildProcess, SpawnOptions, SpawnSyncOptions, SpawnSyncReturns, StdioOptions } from 'node:child_process';

export type ProcessLaunchPosture =
  | 'operator_terminal'
  | 'browser_open'
  | 'provider_subprocess'
  | 'mcp_server'
  | 'governed_command_execution'
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

export function startOperatorTerminal(command: string, args?: string[], options?: OperatorTerminalOptions): OperatorTerminalResult;

export function spawnHiddenPostureProcess(command: string, args: string[], options: SpawnOptions & {
  posture: Exclude<ProcessLaunchPosture, 'operator_terminal' | 'elevated_or_operator_prompt'>;
  platform?: NodeJS.Platform;
  spawnImpl?: typeof import('node:child_process').spawn;
  stdio?: StdioOptions;
}): ChildProcess;

export function spawnProviderSubprocess(command: string, args?: string[], options?: HiddenPostureOptions): ChildProcess;

export function spawnMcpServer(command: string, args?: string[], options?: HiddenPostureOptions): ChildProcess;

export function runGovernedCommand(command: string, args?: string[], options?: HiddenPostureOptions): ChildProcess;

export function spawnTestChild(command: string, args?: string[], options?: HiddenPostureOptions): ChildProcess;

export function startElevatedOrOperatorPrompt(command: string, args?: string[], options?: OperatorTerminalOptions & { reason: string }): OperatorTerminalResult;

