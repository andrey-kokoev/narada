import type { Command } from 'commander';
import { directCommandAction, silentCommandContext, type CommanderOptionValues } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';
import { carrierRestartCommand, carrierRestartOutcomeCommand } from './carrier-restart.js';

export function registerCarrierRestartCommands(program: Command): void {
  const carrier = program.command('carrier').description('PC-owned carrier lifecycle operations');

  carrier
    .command('restart')
    .description('Restart one local NARS carrier through the PC-owned successor/drain supervisor.')
    .requiredOption('--site-root <path>', 'Owning Site root.')
    .requiredOption('--site-id <site-id>', 'Owning Site identifier.')
    .requiredOption('--carrier-session-id <session-id>', 'Active source carrier session identifier.')
    .requiredOption('--operation-id <operation-id>', 'Durable idempotent restart operation identifier.')
    .requiredOption('--requested-by <principal>', 'Requesting principal.')
    .requiredOption('--expected-state-json <json>', 'Bounded expected observation/state evidence as a JSON object.')
    .requiredOption('--reason <reason>', 'Reason for the controlled restart.')
    .option('--pc-site-root <path>', 'PC authority Site root.')
    .option('--timeout-ms <milliseconds>', 'Bounded restart timeout.', '60000')
    .option('--mutating-authorized <token>', 'Authority evidence for carrier.restart mutation.')
    .option('--dry-run', 'Plan only.', false)
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'carrier restart',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => carrierRestartCommand({
        siteRoot: opts.siteRoot as string,
        pcSiteRoot: opts.pcSiteRoot as string | undefined,
        siteId: opts.siteId as string,
        carrierSessionId: opts.carrierSessionId as string,
        operationId: opts.operationId as string,
        requestedBy: opts.requestedBy as string,
        expectedStateJson: opts.expectedStateJson as string,
        reason: opts.reason as string,
        timeoutMs: Number(opts.timeoutMs),
        mutatingAuthorized: opts.mutatingAuthorized as string | undefined,
        dryRun: opts.dryRun === true,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  carrier
    .command('restart-outcome <operation-id>')
    .description('Read one durable PC-owned carrier restart outcome.')
    .option('--pc-site-root <path>', 'PC authority Site root.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, CommanderOptionValues]>({
      command: 'carrier restart-outcome',
      emit: emitCommandResult,
      format: (_operationId: string, opts: CommanderOptionValues) => opts.format,
      invocation: (operationId, opts) => carrierRestartOutcomeCommand(operationId, {
        pcSiteRoot: opts.pcSiteRoot as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));
}
