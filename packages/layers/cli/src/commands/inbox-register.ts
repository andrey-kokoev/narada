import type { Command } from 'commander';
import {
  inboxListCommand,
  inboxPromoteCommand,
  inboxShowCommand,
  inboxSubmitCommand,
} from './inbox.js';
import { directCommandAction } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

export function registerInboxCommands(program: Command): void {
  const inboxCmd = program
    .command('inbox')
    .description('Canonical Inbox typed-envelope intake operators');

  inboxCmd
    .command('submit')
    .description('Submit an inert typed envelope into the Canonical Inbox')
    .requiredOption('--source-kind <kind>', 'Source kind')
    .requiredOption('--source-ref <ref>', 'Source reference')
    .requiredOption('--kind <kind>', 'Envelope kind')
    .requiredOption('--authority-level <level>', 'Authority level')
    .option('--principal <id>', 'Principal associated with authority')
    .option('--payload <json>', 'JSON payload', '{}')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'inbox submit',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => inboxSubmitCommand({
        sourceKind: opts.sourceKind as string | undefined,
        sourceRef: opts.sourceRef as string | undefined,
        kind: opts.kind as string | undefined,
        authorityLevel: opts.authorityLevel as string | undefined,
        principal: opts.principal as string | undefined,
        payload: opts.payload as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  inboxCmd
    .command('list')
    .description('List Canonical Inbox envelopes')
    .option('--status <status>', 'Filter by status')
    .option('--limit <n>', 'Maximum envelopes', '20')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'inbox list',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => inboxListCommand({
        status: opts.status as string | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  inboxCmd
    .command('show <envelope-id>')
    .description('Show one Canonical Inbox envelope')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'inbox show',
      emit: emitCommandResult,
      format: (_envelopeId: string, opts: Record<string, unknown>) => opts.format,
      invocation: (envelopeId, opts) => inboxShowCommand({
        envelopeId,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  inboxCmd
    .command('promote <envelope-id>')
    .description('Record governed promotion metadata for an inbox envelope')
    .requiredOption('--target-kind <kind>', 'Promotion target kind')
    .requiredOption('--target-ref <ref>', 'Promotion target reference')
    .requiredOption('--by <principal>', 'Principal recording promotion')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'inbox promote',
      emit: emitCommandResult,
      format: (_envelopeId: string, opts: Record<string, unknown>) => opts.format,
      invocation: (envelopeId, opts) => inboxPromoteCommand({
        envelopeId,
        targetKind: opts.targetKind as string | undefined,
        targetRef: opts.targetRef as string | undefined,
        by: opts.by as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));
}
