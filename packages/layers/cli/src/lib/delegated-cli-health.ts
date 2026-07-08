import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileGovernedSync } from '@narada2/process-launch-posture';

export type DelegatedCliFailureKind =
  | 'missing_config'
  | 'missing_build_output'
  | 'missing_node'
  | 'stale_dist'
  | 'broken_shim'
  | 'execution_failed';

export interface DelegatedCliScriptHealth {
  script_name: string;
  command: string;
  configured_entrypoint: string;
  resolved_entrypoint: string;
  exists: boolean;
  loadable: boolean;
  detail: string;
  failure_kind: DelegatedCliFailureKind | null;
  repair_command: string | null;
}

export interface DelegatedCliHealth {
  configured: boolean;
  ok: boolean;
  status: 'pass' | 'fail';
  detail: string;
  invocation_contract: DelegatedCliInvocationContract | null;
  repair_command: string | null;
  scripts: DelegatedCliScriptHealth[];
}

const CLI_ENTRYPOINT_RE = /(?:^|\s)node\s+(?:"([^"]*packages[\\/]+layers[\\/]+cli[\\/]+dist[\\/]+main\.js)"|'([^']*packages[\\/]+layers[\\/]+cli[\\/]+dist[\\/]+main\.js)'|(\S*packages[\\/]+layers[\\/]+cli[\\/]+dist[\\/]+main\.js))/g;
const DEFAULT_REPAIR_COMMAND = 'pnpm --filter @narada2/cli build && pnpm run narada:install-shim';

export interface DelegatedCliInvocationContract {
  command: string;
  cwd: string;
  shell: 'login' | 'non_login' | 'direct';
  repair_command: string;
  source: 'package_json_narada_delegated_cli_embodiment' | 'package_json_script_legacy';
}

export function inspectDelegatedCliHealth(siteRootInput: string): DelegatedCliHealth {
  const siteRoot = resolve(siteRootInput);
  const packageJsonPath = join(siteRoot, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return {
      configured: false,
      ok: true,
      status: 'pass',
      detail: 'No Site-local package.json; no delegated Narada CLI embodiment configured.',
      invocation_contract: null,
      repair_command: null,
      scripts: [],
    };
  }

  let scripts: Record<string, string> = {};
  let contract: DelegatedCliInvocationContract | null = null;
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      scripts?: Record<string, string>;
      narada?: { delegated_cli_embodiment?: Partial<DelegatedCliInvocationContract> };
    };
    scripts = parsed.scripts ?? {};
    contract = parseInvocationContract(siteRoot, parsed.narada?.delegated_cli_embodiment);
  } catch (error) {
    return {
      configured: true,
      ok: false,
      status: 'fail',
      detail: `Cannot parse Site-local package.json: ${error instanceof Error ? error.message : String(error)}`,
      invocation_contract: null,
      repair_command: DEFAULT_REPAIR_COMMAND,
      scripts: [],
    };
  }

  const contractHealth = contract ? [inspectContract(siteRoot, contract)] : [];
  const scriptHealth = Object.entries(scripts)
    .flatMap(([scriptName, command]) => extractCliEntrypoints(command).map((entrypoint) => inspectScript(siteRoot, scriptName, command, entrypoint)));
  const inspected = [...contractHealth, ...scriptHealth];

  if (inspected.length === 0) {
    return {
      configured: false,
      ok: true,
      status: 'pass',
      detail: 'No delegated Narada CLI invocation contract or legacy scripts found in Site-local package.json.',
      invocation_contract: null,
      repair_command: DEFAULT_REPAIR_COMMAND,
      scripts: [],
    };
  }

  const failed = inspected.filter((script) => !script.loadable);
  return {
    configured: true,
    ok: failed.length === 0,
    status: failed.length === 0 ? 'pass' : 'fail',
    detail: failed.length === 0
      ? `${inspected.length} delegated Narada CLI embodiment invocation(s) load.`
      : `${failed.length}/${inspected.length} delegated Narada CLI embodiment invocation(s) failed to load.`,
    invocation_contract: contract,
    repair_command: failed[0]?.repair_command ?? contract?.repair_command ?? DEFAULT_REPAIR_COMMAND,
    scripts: inspected,
  };
}

function extractCliEntrypoints(command: string): string[] {
  const results: string[] = [];
  for (const match of command.matchAll(CLI_ENTRYPOINT_RE)) {
    const entrypoint = match[1] ?? match[2] ?? match[3];
    if (entrypoint) results.push(entrypoint);
  }
  return results;
}

function inspectScript(siteRoot: string, scriptName: string, command: string, entrypoint: string): DelegatedCliScriptHealth {
  const resolvedEntrypoint = resolveCliEntrypoint(siteRoot, entrypoint);
  if (!existsSync(resolvedEntrypoint)) {
    return {
      script_name: scriptName,
      command,
      configured_entrypoint: entrypoint,
      resolved_entrypoint: resolvedEntrypoint,
      exists: false,
      loadable: false,
      detail: `Configured Narada CLI entrypoint is missing: ${resolvedEntrypoint}`,
      failure_kind: 'missing_build_output',
      repair_command: DEFAULT_REPAIR_COMMAND,
    };
  }

  try {
    const output = (execFileGovernedSync(process.execPath, [resolvedEntrypoint, '--version'], {
      cwd: siteRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
    }) as string).trim();
    return {
      script_name: scriptName,
      command,
      configured_entrypoint: entrypoint,
      resolved_entrypoint: resolvedEntrypoint,
      exists: true,
      loadable: true,
      detail: output ? `loads: ${output}` : 'loads',
      failure_kind: null,
      repair_command: null,
    };
  } catch (error) {
    const detail = errorDetail(error);
    return {
      script_name: scriptName,
      command,
      configured_entrypoint: entrypoint,
      resolved_entrypoint: resolvedEntrypoint,
      exists: true,
      loadable: false,
      detail,
      failure_kind: classifyFailure(detail, command),
      repair_command: DEFAULT_REPAIR_COMMAND,
    };
  }
}

function inspectContract(siteRoot: string, contract: DelegatedCliInvocationContract): DelegatedCliScriptHealth {
  const configuredEntrypoint = firstCommandToken(contract.command);
  const resolvedEntrypoint = resolveCliEntrypoint(siteRoot, configuredEntrypoint);
  const exists = existsSync(resolvedEntrypoint) || commandLooksPathless(configuredEntrypoint);
  if (!exists) {
    return {
      script_name: 'narada.delegated_cli_embodiment',
      command: contract.command,
      configured_entrypoint: configuredEntrypoint,
      resolved_entrypoint: resolvedEntrypoint,
      exists: false,
      loadable: false,
      detail: `Configured delegated CLI wrapper is missing: ${resolvedEntrypoint}`,
      failure_kind: 'broken_shim',
      repair_command: contract.repair_command,
    };
  }

  try {
    const output = (execFileGovernedSync(contract.command, ['--version'], {
      cwd: resolve(siteRoot, contract.cwd),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
      shell: contract.shell !== 'direct',
    }) as string).trim();
    return {
      script_name: 'narada.delegated_cli_embodiment',
      command: contract.command,
      configured_entrypoint: configuredEntrypoint,
      resolved_entrypoint: resolvedEntrypoint,
      exists: true,
      loadable: true,
      detail: output ? `loads: ${output}` : 'loads',
      failure_kind: null,
      repair_command: null,
    };
  } catch (error) {
    const detail = errorDetail(error);
    return {
      script_name: 'narada.delegated_cli_embodiment',
      command: contract.command,
      configured_entrypoint: configuredEntrypoint,
      resolved_entrypoint: resolvedEntrypoint,
      exists: true,
      loadable: false,
      detail,
      failure_kind: classifyFailure(detail, contract.command),
      repair_command: contract.repair_command,
    };
  }
}

function parseInvocationContract(siteRoot: string, raw: Partial<DelegatedCliInvocationContract> | undefined): DelegatedCliInvocationContract | null {
  if (!raw || typeof raw.command !== 'string' || raw.command.trim().length === 0) return null;
  const shell = raw.shell === 'direct' || raw.shell === 'non_login' || raw.shell === 'login' ? raw.shell : 'login';
  return {
    command: raw.command.trim(),
    cwd: typeof raw.cwd === 'string' && raw.cwd.trim().length > 0 ? raw.cwd.trim() : '.',
    shell,
    repair_command: typeof raw.repair_command === 'string' && raw.repair_command.trim().length > 0
      ? raw.repair_command.trim()
      : DEFAULT_REPAIR_COMMAND,
    source: 'package_json_narada_delegated_cli_embodiment',
  };
}

function resolveCliEntrypoint(siteRoot: string, entrypoint: string): string {
  const trimmed = entrypoint.trim();
  const wslPath = windowsPathToWslPath(trimmed);
  if (wslPath && existsSync(wslPath)) return wslPath;
  if (/^[A-Za-z]:[\\/]/.test(trimmed)) return trimmed;
  return resolve(siteRoot, trimmed);
}

function windowsPathToWslPath(pathValue: string): string | null {
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(pathValue);
  if (!match) return null;
  const drive = match[1].toLowerCase();
  const rest = match[2].replace(/\\/g, '/');
  return `/mnt/${drive}/${rest}`;
}

function firstCommandToken(command: string): string {
  const trimmed = command.trim();
  const quoted = /^"([^"]+)"|'([^']+)'/.exec(trimmed);
  if (quoted) return quoted[1] ?? quoted[2] ?? trimmed;
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

function commandLooksPathless(command: string): boolean {
  return !command.includes('/') && !command.includes('\\');
}

function errorDetail(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const maybe = error as Error & { stderr?: Buffer | string; stdout?: Buffer | string };
  const stderr = maybe.stderr ? String(maybe.stderr).trim() : '';
  const stdout = maybe.stdout ? String(maybe.stdout).trim() : '';
  return [error.message, stderr, stdout].filter(Boolean).join('\n');
}

function classifyFailure(detail: string, command: string): DelegatedCliFailureKind {
  if (/node(?:\.exe)?: not found|exec: node: not found|node: command not found/i.test(detail)) return 'missing_node';
  if (/source files are newer than dist|dist is stale|stale/i.test(detail)) return 'stale_dist';
  if (/node_modules[\\/]\.bin[\\/]narada|SyntaxError: missing \) after argument list/i.test(`${command}\n${detail}`)) return 'broken_shim';
  if (/packages[\\/]+layers[\\/]+cli[\\/]+dist[\\/]+main\.js.*missing|Cannot find module .*dist[\\/]+main\.js/i.test(detail)) return 'missing_build_output';
  return 'execution_failed';
}
