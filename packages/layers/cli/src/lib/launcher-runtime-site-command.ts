import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { SiteCommandResult } from './launcher-contracts.js';
import { runProcess, runProcessAsync, truncateText } from './launcher-runtime-process.js';
import { tryParseJson } from './launcher-runtime-results.js';

export function runSiteCliCommand(siteRootInput: string, args: string[]): SiteCommandResult {
  const siteRoot = resolve(siteRootInput);
  const cli = join(siteRoot, 'scripts', 'narada-sonar.ts');
  if (!existsSync(cli)) {
    return {
      schema: 'narada.site_command_result.v0',
      status: 'not_available',
      mutation_performed: false,
      site_root: siteRoot,
      command: args,
      error: `Site CLI not found: ${cli}`,
    };
  }
  const execution = runProcess(process.execPath, [cli, ...args, '--format', 'json'], siteRoot);
  return siteCommandResultFromExecution(siteRoot, args, execution);
}

/**
 * Async analogue of runSiteCliCommand for event-loop-sensitive callers (e.g.
 * console HTTP handlers). Identical semantics; the child process no longer
 * blocks the event loop.
 */
export async function runSiteCliCommandAsync(siteRootInput: string, args: string[]): Promise<SiteCommandResult> {
  const siteRoot = resolve(siteRootInput);
  const cli = join(siteRoot, 'scripts', 'narada-sonar.ts');
  if (!existsSync(cli)) {
    return {
      schema: 'narada.site_command_result.v0',
      status: 'not_available',
      mutation_performed: false,
      site_root: siteRoot,
      command: args,
      error: `Site CLI not found: ${cli}`,
    };
  }
  const execution = await runProcessAsync(process.execPath, [cli, ...args, '--format', 'json'], siteRoot);
  return siteCommandResultFromExecution(siteRoot, args, execution);
}

function siteCommandResultFromExecution(
  siteRoot: string,
  args: string[],
  execution: ReturnType<typeof runProcess>,
): SiteCommandResult {
  const parsed = tryParseJson(execution.stdout);
  return {
    schema: 'narada.site_command_result.v0',
    status: execution.status,
    mutation_performed: execution.status === 'success' && isMutatingSiteCommand(args),
    site_root: siteRoot,
    command: args,
    execution: {
      ...execution,
      stdout: parsed ? '' : truncateText(execution.stdout, 1000),
      stderr: truncateText(execution.stderr, 1000),
    },
    parsed_stdout: parsed,
  };
}

function isMutatingSiteCommand(args: string[]): boolean {
  const [domain, action] = args;
  if (domain === 'loop') return ['pause', 'resume', 'run', 'drain'].includes(String(action));
  if (domain === 'resident') {
    return ['summon', 'recover-carrier', 'recover-stale', 'resolve', 'refuse', 'cleanup-runtime'].includes(String(action));
  }
  return false;
}

