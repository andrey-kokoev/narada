import { existsSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

type AnyRecord = Record<string, any>;
type CommandResult = {
  command: string;
  prefixArgs: string[];
  source: string;
};

function envValue(processEnv: AnyRecord, name: string): string | null {
  const value = processEnv?.[name];
  return value === undefined || value === null || value === '' ? null : String(value);
}

function pathValue(processEnv: AnyRecord): string {
  return envValue(processEnv, 'PATH') ?? envValue(processEnv, 'Path') ?? '';
}

function pathEntries(processEnv: AnyRecord): string[] {
  return pathValue(processEnv).split(delimiter).filter(Boolean);
}

function parseJsonArrayEnv(value: any): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item: any) => String(item)) : [];
  } catch {
    return [];
  }
}

function findCommandOnPath(
  names: string[],
  { processEnv = process.env, exists = existsSync }: AnyRecord = {},
): string | null {
  for (const dir of pathEntries(processEnv)) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (exists(candidate)) return candidate;
    }
  }
  return null;
}

function windowsCommand(
  commandPath: any,
  { exists = existsSync }: AnyRecord = {},
): CommandResult {
  const normalized = String(commandPath ?? '');
  if (normalized.toLowerCase().endsWith('.ps1')) {
    const basedir = dirname(normalized);
    const nodeCommand = join(basedir, 'node.exe');
    const codexScript = join(basedir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (exists(nodeCommand) && exists(codexScript)) {
      return { command: nodeCommand, prefixArgs: [codexScript], source: 'path_ps1_node_shim' };
    }
    return { command: 'pwsh', prefixArgs: ['-NoProfile', '-NonInteractive', '-File', normalized], source: 'path_ps1' };
  }
  return { command: normalized, prefixArgs: [], source: 'path_executable' };
}

function codexCommand(
  { processEnv = process.env, platform = process.platform, exists = existsSync }: AnyRecord = {},
): CommandResult {
  const explicitExec = envValue(processEnv, 'NARADA_CODEX_EXEC_COMMAND');
  if (explicitExec) {
    return {
      command: explicitExec,
      prefixArgs: parseJsonArrayEnv(processEnv.NARADA_CODEX_EXEC_PREFIX_ARGS),
      source: 'NARADA_CODEX_EXEC_COMMAND',
    };
  }

  const explicitCodex = envValue(processEnv, 'NARADA_CODEX_COMMAND') ?? envValue(processEnv, 'CODEX_COMMAND');
  if (explicitCodex) return {
    command: explicitCodex,
    prefixArgs: [],
    source: envValue(processEnv, 'NARADA_CODEX_COMMAND') ? 'NARADA_CODEX_COMMAND' : 'CODEX_COMMAND',
  };

  if (platform === 'win32') {
    const found = findCommandOnPath(['codex.ps1', 'codex.cmd', 'codex.exe'], { processEnv, exists });
    if (found) return windowsCommand(found, { exists });
  }

  return { command: 'codex', prefixArgs: [], source: 'default' };
}

export {
  codexCommand,
  findCommandOnPath,
  parseJsonArrayEnv,
};
