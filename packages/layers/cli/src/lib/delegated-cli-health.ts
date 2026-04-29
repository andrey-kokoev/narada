import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface DelegatedCliScriptHealth {
  script_name: string;
  command: string;
  configured_entrypoint: string;
  resolved_entrypoint: string;
  exists: boolean;
  loadable: boolean;
  detail: string;
}

export interface DelegatedCliHealth {
  configured: boolean;
  ok: boolean;
  status: 'pass' | 'fail';
  detail: string;
  scripts: DelegatedCliScriptHealth[];
}

const CLI_ENTRYPOINT_RE = /(?:^|\s)node\s+(?:"([^"]*packages[\\/]+layers[\\/]+cli[\\/]+dist[\\/]+main\.js)"|'([^']*packages[\\/]+layers[\\/]+cli[\\/]+dist[\\/]+main\.js)'|(\S*packages[\\/]+layers[\\/]+cli[\\/]+dist[\\/]+main\.js))/g;

export function inspectDelegatedCliHealth(siteRootInput: string): DelegatedCliHealth {
  const siteRoot = resolve(siteRootInput);
  const packageJsonPath = join(siteRoot, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return {
      configured: false,
      ok: true,
      status: 'pass',
      detail: 'No Site-local package.json; no delegated Narada CLI embodiment configured.',
      scripts: [],
    };
  }

  let scripts: Record<string, string> = {};
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { scripts?: Record<string, string> };
    scripts = parsed.scripts ?? {};
  } catch (error) {
    return {
      configured: true,
      ok: false,
      status: 'fail',
      detail: `Cannot parse Site-local package.json: ${error instanceof Error ? error.message : String(error)}`,
      scripts: [],
    };
  }

  const inspected = Object.entries(scripts)
    .flatMap(([scriptName, command]) => extractCliEntrypoints(command).map((entrypoint) => inspectScript(siteRoot, scriptName, command, entrypoint)));

  if (inspected.length === 0) {
    return {
      configured: false,
      ok: true,
      status: 'pass',
      detail: 'No delegated Narada CLI scripts found in Site-local package.json.',
      scripts: [],
    };
  }

  const failed = inspected.filter((script) => !script.loadable);
  return {
    configured: true,
    ok: failed.length === 0,
    status: failed.length === 0 ? 'pass' : 'fail',
    detail: failed.length === 0
      ? `${inspected.length} delegated Narada CLI script(s) load.`
      : `${failed.length}/${inspected.length} delegated Narada CLI script(s) failed to load.`,
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
    };
  }

  try {
    const output = execFileSync(process.execPath, [resolvedEntrypoint, '--version'], {
      cwd: siteRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
    }).trim();
    return {
      script_name: scriptName,
      command,
      configured_entrypoint: entrypoint,
      resolved_entrypoint: resolvedEntrypoint,
      exists: true,
      loadable: true,
      detail: output ? `loads: ${output}` : 'loads',
    };
  } catch (error) {
    return {
      script_name: scriptName,
      command,
      configured_entrypoint: entrypoint,
      resolved_entrypoint: resolvedEntrypoint,
      exists: true,
      loadable: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
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
