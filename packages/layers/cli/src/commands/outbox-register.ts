import type { Command } from 'commander';
import {
  outboxApproveCommand,
  outboxArchiveCommand,
  outboxComposeCommand,
  outboxConfirmCommand,
  outboxExportCommand,
  outboxListCommand,
  outboxPreviewCommand,
  outboxShowCommand,
  outboxSupersedeCommand,
} from './outbox.js';
import {directCommandAction, silentCommandContext, type CommanderOptionValues} from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

export function registerOutboxCommands(program: Command): void {
  const outboxCmd = program
    .command('outbox')
    .description('Canonical Outbox outbound effect intent operators');

  outboxCmd
    .command('compose')
    .description('Compose an inert outbound effect intent')
    .requiredOption('--target-kind <kind>', 'Target kind')
    .requiredOption('--target-ref <ref>', 'Target reference')
    .requiredOption('--transport <transport>', 'Transport kind')
    .option('--payload-ref <ref>', 'Payload artifact reference')
    .option('--payload-body <text>', 'Small inline payload body')
    .option('--authority-level <level>', 'Authority level', 'operator_confirmed')
    .option('--principal <id>', 'Principal associated with authority')
    .option('--no-approval-required', 'Mark approval as not required', false)
    .option('--route-id <id>', 'Resolved route id')
    .option('--capability-grant-id <id>', 'Capability grant id')
    .option('--retry-of <id>', 'Prior outbox item retried by this item')
    .option('--supersedes <id>', 'Prior outbox item superseded by this item')
    .requiredOption('--by <id>', 'Principal composing the item')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'outbox compose',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => outboxComposeCommand({
        targetKind: opts.targetKind as string | undefined,
        targetRef: opts.targetRef as string | undefined,
        transport: opts.transport as string | undefined,
        payloadRef: opts.payloadRef as string | undefined,
        payloadBody: opts.payloadBody as string | undefined,
        authorityLevel: opts.authorityLevel as string | undefined,
        principal: opts.principal as string | undefined,
        noApprovalRequired: opts.noApprovalRequired as boolean | undefined,
        routeId: opts.routeId as string | undefined,
        capabilityGrantId: opts.capabilityGrantId as string | undefined,
        retryOf: opts.retryOf as string | undefined,
        supersedes: opts.supersedes as string | undefined,
        by: opts.by as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  outboxCmd.command('list')
    .description('List canonical outbox items')
    .option('--status <status>', 'Filter by status')
    .option('--target-kind <kind>', 'Filter by target kind')
    .option('--transport <transport>', 'Filter by transport')
    .option('--limit <n>', 'Maximum items', '20')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'outbox list',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => outboxListCommand({
        status: opts.status as string | undefined,
        targetKind: opts.targetKind as string | undefined,
        transport: opts.transport as string | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  for (const [name, description, command] of [
    ['show', 'Show one canonical outbox item', outboxShowCommand],
    ['preview', 'Render bounded dry-run output for one outbox item', outboxPreviewCommand],
  ] as const) {
    outboxCmd.command(`${name} <outbox-id>`)
      .description(description)
      .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
      .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
      .action(directCommandAction<[string, CommanderOptionValues]>({
        command: `outbox ${name}`,
        emit: emitCommandResult,
        format: (_outboxId: string, opts: CommanderOptionValues) => opts.format,
        invocation: (outboxId, opts) => command({
          outboxId,
          cwd: opts.cwd as string | undefined,
          format: resolveCommandFormat(opts.format, 'auto'),
        }, silentCommandContext()),
      }));
  }

  outboxCmd.command('approve <outbox-id>')
    .description('Approve an outbox item without executing transport')
    .requiredOption('--by <id>', 'Principal approving the item')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, CommanderOptionValues]>({
      command: 'outbox approve',
      emit: emitCommandResult,
      format: (_outboxId: string, opts: CommanderOptionValues) => opts.format,
      invocation: (outboxId, opts) => outboxApproveCommand({
        outboxId,
        by: opts.by as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  outboxCmd.command('confirm <outbox-id>')
    .description('Record delivery confirmation evidence for an outbox item')
    .requiredOption('--by <id>', 'Principal confirming the item')
    .requiredOption('--confirmation-ref <ref>', 'Delivery confirmation reference')
    .option('--evidence-ref <ref>', 'Execution evidence reference')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, CommanderOptionValues]>({
      command: 'outbox confirm',
      emit: emitCommandResult,
      format: (_outboxId: string, opts: CommanderOptionValues) => opts.format,
      invocation: (outboxId, opts) => outboxConfirmCommand({
        outboxId,
        by: opts.by as string | undefined,
        confirmationRef: opts.confirmationRef as string | undefined,
        evidenceRef: opts.evidenceRef as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  outboxCmd.command('archive <outbox-id>')
    .description('Archive an outbox item without executing transport')
    .requiredOption('--by <id>', 'Principal archiving the item')
    .option('--reason <text>', 'Archive reason')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, CommanderOptionValues]>({
      command: 'outbox archive',
      emit: emitCommandResult,
      format: (_outboxId: string, opts: CommanderOptionValues) => opts.format,
      invocation: (outboxId, opts) => outboxArchiveCommand({
        outboxId,
        by: opts.by as string | undefined,
        reason: opts.reason as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  outboxCmd.command('supersede <outbox-id>')
    .description('Mark an outbox item as superseded')
    .requiredOption('--by <id>', 'Principal recording supersession')
    .requiredOption('--superseded-by <id>', 'Replacement outbox item id')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, CommanderOptionValues]>({
      command: 'outbox supersede',
      emit: emitCommandResult,
      format: (_outboxId: string, opts: CommanderOptionValues) => opts.format,
      invocation: (outboxId, opts) => outboxSupersedeCommand({
        outboxId,
        by: opts.by as string | undefined,
        supersededBy: opts.supersededBy as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  outboxCmd.command('export')
    .description('Export outbox items as Git-visible JSON artifacts')
    .option('--status <status>', 'Filter by status')
    .option('--out-dir <path>', 'Output directory', '.ai/outbox-items')
    .option('--limit <n>', 'Maximum items', '200')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'outbox export',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => outboxExportCommand({
        status: opts.status as string | undefined,
        outDir: opts.outDir as string | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));
}
