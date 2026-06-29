import type { Command } from 'commander';
import { directCommandAction, silentCommandContext } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';
import { narsAttachCommandCommand, narsSessionsCommand } from './nars.js';

export function registerNarsCommands(program: Command): void {
  const nars = program
    .command('nars')
    .description('NARS session discovery and attachment helpers');

  nars
    .command('sessions')
    .description('Discover Site-local Narada Agent Runtime Server sessions')
    .option('--site-root <path>', 'Target Site root')
    .option('--site <id>', 'Registered Site id')
    .option('--no-health', 'Skip bounded HTTP /health probes')
    .option('--health-timeout-ms <ms>', 'Per-session health probe timeout', '500')
    .option('--limit <n>', 'Maximum sessions to print', '20')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'nars sessions',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => narsSessionsCommand({
        siteRoot: opts.siteRoot as string | undefined,
        site: opts.site as string | undefined,
        health: opts.health as boolean | undefined,
        healthTimeoutMs: opts.healthTimeoutMs ? Number(opts.healthTimeoutMs) : undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  nars
    .command('attach-command')
    .description('Resolve the command for attaching a projection to one NARS session')
    .requiredOption('--session <id>', 'NARS session id')
    .option('--surface <surface>', 'Projection surface: agent-web-ui|agent-cli|agent-tui', 'agent-web-ui')
    .option('--site-root <path>', 'Target Site root')
    .option('--site <id>', 'Registered Site id')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'nars attach-command',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => narsAttachCommandCommand({
        siteRoot: opts.siteRoot as string | undefined,
        site: opts.site as string | undefined,
        session: opts.session as string | undefined,
        surface: opts.surface as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));
}
