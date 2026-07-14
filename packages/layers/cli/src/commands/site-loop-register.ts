import type { Command } from 'commander';
import {directCommandAction, silentCommandContext, type CommanderOptionValues} from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';
import {
  siteLoopDrainCommand,
  siteLoopPauseCommand,
  siteLoopRecoverCommand,
  siteLoopResumeCommand,
  siteLoopStatusCommand,
} from './site-loop.js';

export function registerSiteLoopCommands(program: Command): void {
  const siteLoop = program
    .command('site-loop')
    .description('Canonical Site operating-loop status, pause, and recovery commands');

  siteLoop
    .command('status')
    .option('--site-root <path>', 'Target Site root')
    .option('--site <path>', 'Alias for --site-root')
    .option('--loop <id>', 'Loop id', 'sonar.email-resident')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'site-loop status',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => siteLoopStatusCommand(commandOptions(opts), silentCommandContext()),
    }));

  siteLoop
    .command('pause')
    .option('--site-root <path>', 'Target Site root')
    .option('--site <path>', 'Alias for --site-root')
    .option('--loop <id>', 'Loop id', 'sonar.email-resident')
    .option('--scope <scope>', 'Pause scope: dispatch|backlog|sync|source_sync|resident|all', 'all')
    .option('--reason <text>', 'Pause reason')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'site-loop pause',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => siteLoopPauseCommand(commandOptions(opts), silentCommandContext()),
    }));

  siteLoop
    .command('resume')
    .alias('unpause')
    .option('--site-root <path>', 'Target Site root')
    .option('--site <path>', 'Alias for --site-root')
    .option('--loop <id>', 'Loop id', 'sonar.email-resident')
    .option('--reason <text>', 'Resume reason')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'site-loop resume',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => siteLoopResumeCommand(commandOptions(opts), silentCommandContext()),
    }));

  siteLoop
    .command('drain')
    .option('--site-root <path>', 'Target Site root')
    .option('--site <path>', 'Alias for --site-root')
    .option('--loop <id>', 'Loop id', 'sonar.email-resident')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'site-loop drain',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => siteLoopDrainCommand(commandOptions(opts), silentCommandContext()),
    }));

  siteLoop
    .command('recover')
    .option('--site-root <path>', 'Target Site root')
    .option('--site <path>', 'Alias for --site-root')
    .option('--loop <id>', 'Loop id', 'sonar.email-resident')
    .option('--verify', 'Run loop health verification after recovery', false)
    .option('--safe-unpause', 'Resume the loop only after recovery succeeds', false)
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'site-loop recover',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => siteLoopRecoverCommand(commandOptions(opts), silentCommandContext()),
    }));
}

function commandOptions(opts: CommanderOptionValues) {
  return {
    siteRoot: opts.siteRoot as string | undefined,
    site: opts.site as string | undefined,
    loop: opts.loop as string | undefined,
    scope: opts.scope as string | undefined,
    reason: opts.reason as string | undefined,
    verify: opts.verify as boolean | undefined,
    safeUnpause: opts.safeUnpause as boolean | undefined,
    format: resolveCommandFormat(opts.format, 'auto'),
  };
}
