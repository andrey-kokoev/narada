import type { CommandContext } from '../lib/command-wrapper.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import { runSiteCliCommand } from '../lib/launcher-runtime.js';

export interface SiteLoopOptions {
  siteRoot?: string;
  site?: string;
  loop?: string;
  scope?: string;
  reason?: string;
  verify?: boolean;
  safeUnpause?: boolean;
  format?: CliFormat;
}

const DEFAULT_LOOP = 'sonar.email-resident';

export async function siteLoopStatusCommand(
  options: SiteLoopOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  return runLoopCommand(options, ['loop', 'status']);
}

export async function siteLoopPauseCommand(
  options: SiteLoopOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  return runLoopCommand(options, [
    'loop',
    'pause',
    options.loop ?? DEFAULT_LOOP,
    '--scope',
    normalizeScope(options.scope),
    ...(options.reason ? ['--reason', options.reason] : []),
  ]);
}

export async function siteLoopResumeCommand(
  options: SiteLoopOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  return runLoopCommand(options, [
    'loop',
    'resume',
    options.loop ?? DEFAULT_LOOP,
    ...(options.reason ? ['--reason', options.reason] : []),
  ]);
}

export async function siteLoopDrainCommand(
  options: SiteLoopOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  return runLoopCommand(options, [
    'loop',
    'drain',
    options.loop ?? DEFAULT_LOOP,
  ]);
}

export async function siteLoopRecoverCommand(
  options: SiteLoopOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const siteRoot = requireSiteRoot(options);
  const recover = runSiteCliCommand(siteRoot, [
    'loop',
    'run',
    options.loop ?? DEFAULT_LOOP,
    '--once',
    '--ensure-resident',
  ]);
  const verify = options.verify
    ? runSiteCliCommand(siteRoot, ['loop', 'health'])
    : null;
  const unpause = options.safeUnpause && recover.status === 'success'
    ? runSiteCliCommand(siteRoot, [
        'loop',
        'resume',
        options.loop ?? DEFAULT_LOOP,
        '--reason',
        'safe_unpause_after_recover',
      ])
    : null;
  const success = recover.status === 'success'
    && (!verify || verify.status === 'success')
    && (!unpause || unpause.status === 'success');
  const result = {
    schema: 'narada.site_loop.recover_result.v0',
    status: success ? 'success' : 'failed',
    mutation_performed: recover.mutation_performed || Boolean(unpause?.mutation_performed),
    site_root: siteRoot,
    loop_id: options.loop ?? DEFAULT_LOOP,
    recover,
    verify,
    safe_unpause: unpause,
  };
  return {
    exitCode: success ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
    result: formattedResult(result, `site-loop recover ${result.status}`, options.format ?? 'auto'),
  };
}

function runLoopCommand(
  options: SiteLoopOptions,
  args: string[],
): { exitCode: ExitCode; result: unknown } {
  const siteRoot = requireSiteRoot(options);
  const siteResult = runSiteCliCommand(siteRoot, args);
  const result = {
    schema: 'narada.site_loop.command_result.v0',
    status: siteResult.status,
    mutation_performed: siteResult.mutation_performed,
    site_root: siteRoot,
    loop_id: options.loop ?? DEFAULT_LOOP,
    site_command: siteResult,
  };
  return {
    exitCode: siteResult.status === 'success' ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
    result: formattedResult(result, `site-loop ${args.slice(1).join(' ')} ${siteResult.status}`, options.format ?? 'auto'),
  };
}

function requireSiteRoot(options: SiteLoopOptions): string {
  const siteRoot = options.siteRoot ?? options.site;
  if (!siteRoot) {
    throw new Error('site_root_required: pass --site-root <path> or --site <path>');
  }
  return siteRoot;
}

function normalizeScope(scope?: string): string {
  if (!scope || scope === 'sync') return 'source_sync';
  if (scope === 'backlog') return 'backlog';
  if (scope === 'dispatch') return 'dispatch';
  if (scope === 'resident') return 'resident';
  if (scope === 'all') return 'all';
  throw new Error(`site_loop_scope_unsupported: ${scope}`);
}
