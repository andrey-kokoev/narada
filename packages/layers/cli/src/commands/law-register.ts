import type { Command } from 'commander';
import { directCommandAction } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';
import {
  lawAckCommand,
  lawChangeAddCommand,
  lawListCommand,
  lawStatusCommand,
  lawUnreadCommand,
} from './law.js';

export function registerLawCommands(program: Command): void {
  const law = program
    .command('law')
    .description('Law change propagation and agent receipt operators');

  const change = law.command('change').description('Durable law change records');
  change
    .command('add')
    .description('Record a durable law change for agent receipt')
    .requiredOption('--issuer <principal>', 'Principal issuing the law change')
    .requiredOption('--summary <text>', 'Law change summary')
    .option('--scope <scope>', 'Scope affected by this change', 'site')
    .option('--files <csv>', 'Comma-separated law source files')
    .option('--commit <sha>', 'Commit containing the law change')
    .option('--required-roles <csv>', 'Roles that must read/ack this change; default *')
    .option('--law-sources <csv>', 'Configured law sources affected by this change')
    .option('--change-id <id>', 'Explicit change id')
    .option('--dry-run', 'Preview without writing a record', false)
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'law change add',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => lawChangeAddCommand({
        issuer: opts.issuer as string | undefined,
        summary: opts.summary as string | undefined,
        scope: opts.scope as string | undefined,
        files: opts.files as string | undefined,
        commit: opts.commit as string | undefined,
        requiredRoles: opts.requiredRoles as string | undefined,
        lawSources: opts.lawSources as string | undefined,
        changeId: opts.changeId as string | undefined,
        dryRun: opts.dryRun as boolean | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  law
    .command('list')
    .description('List durable law changes')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'law list',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => lawListCommand({
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  law
    .command('unread')
    .description('Show unread mandatory law changes for an agent')
    .requiredOption('--agent <id>', 'Agent id')
    .option('--role <role>', 'Agent role for role-scoped applicability')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'law unread',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => lawUnreadCommand({
        agent: opts.agent as string | undefined,
        role: opts.role as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  law
    .command('ack <change-id>')
    .description('Record that an agent read or acknowledged a law change')
    .requiredOption('--agent <id>', 'Agent id')
    .option('--role <role>', 'Agent role')
    .option('--session <id>', 'Session id when available')
    .option('--operator-surface-identity <id>', 'Operator Surface identity when available')
    .option('--status <status>', 'Receipt status: read, acknowledged, question, blocked', 'acknowledged')
    .option('--questions-or-blockers <csv>', 'Optional comma-separated questions/blockers')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'law ack',
      emit: emitCommandResult,
      format: (_changeId: string, opts: Record<string, unknown>) => opts.format,
      invocation: (changeId, opts) => lawAckCommand({
        changeId,
        agent: opts.agent as string | undefined,
        role: opts.role as string | undefined,
        session: opts.session as string | undefined,
        operatorSurfaceIdentity: opts.operatorSurfaceIdentity as string | undefined,
        status: opts.status as 'read' | 'acknowledged' | 'question' | 'blocked' | undefined,
        questionsOrBlockers: opts.questionsOrBlockers as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  law
    .command('status')
    .description('Report law-sync admission status for an agent')
    .requiredOption('--agent <id>', 'Agent id')
    .option('--role <role>', 'Agent role for role-scoped applicability')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'law status',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => lawStatusCommand({
        agent: opts.agent as string | undefined,
        role: opts.role as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));
}
