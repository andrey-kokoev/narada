import type { Command } from 'commander';
import { directCommandAction } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';
import {
  qualificationEffectivenessCheckCommand,
  qualificationEffectivenessRecordCommand,
  qualificationRecordAddCommand,
  qualificationStatusCommand,
} from './qualification.js';

export function registerQualificationCommands(program: Command): void {
  const qualification = program
    .command('qualification')
    .description('Site role/principal qualification inspection');

  qualification
    .command('record-add')
    .description('Admit or update a Git-visible Site qualification record')
    .requiredOption('--agent <id>', 'Agent or principal ID')
    .option('--role <role>', 'Role ID')
    .option('--site <site>', 'Site ID')
    .option('--work-class <class>', 'Governed work class', 'task_construction')
    .option('--law-sources <refs>', 'Comma-separated law/context law refs')
    .option('--context-surfaces <refs>', 'Comma-separated context surface refs')
    .option('--evidence <refs>', 'Comma-separated evidence refs')
    .option('--issuer <id>', 'Issuer principal')
    .option('--admitted-by <id>', 'Admitter principal')
    .option('--effective-at <iso>', 'Effective timestamp')
    .option('--expires-at <iso>', 'Expiry timestamp')
    .option('--sensitive-work-admitted', 'Admit sensitive work for this work class', false)
    .option('--effectiveness-interval <count>', 'Require effectiveness check every N completed tasks')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'qualification record-add',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => qualificationRecordAddCommand({
        agent: opts.agent as string | undefined,
        role: opts.role as string | undefined,
        site: opts.site as string | undefined,
        workClass: opts.workClass as string | undefined,
        lawSources: opts.lawSources as string | undefined,
        contextSurfaces: opts.contextSurfaces as string | undefined,
        evidence: opts.evidence as string | undefined,
        issuer: opts.issuer as string | undefined,
        admittedBy: opts.admittedBy as string | undefined,
        effectiveAt: opts.effectiveAt as string | undefined,
        expiresAt: opts.expiresAt as string | undefined,
        sensitiveWorkAdmitted: opts.sensitiveWorkAdmitted as boolean | undefined,
        effectivenessInterval: opts.effectivenessInterval as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  qualification
    .command('status')
    .description('Inspect qualification state for a governed work class')
    .requiredOption('--agent <id>', 'Agent or principal ID')
    .option('--role <role>', 'Role ID')
    .option('--work-class <class>', 'Governed work class', 'task_construction')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'qualification status',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => qualificationStatusCommand({
        agent: opts.agent as string | undefined,
        role: opts.role as string | undefined,
        workClass: opts.workClass as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  qualification
    .command('effectiveness-check')
    .description('Inspect whether qualification effectiveness evidence is required')
    .requiredOption('--agent <id>', 'Agent or principal ID')
    .option('--role <role>', 'Role ID')
    .option('--work-class <class>', 'Governed work class', 'task_construction')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'qualification effectiveness-check',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => qualificationEffectivenessCheckCommand({
        agent: opts.agent as string | undefined,
        role: opts.role as string | undefined,
        workClass: opts.workClass as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  qualification
    .command('effectiveness-record')
    .description('Record a qualification effectiveness pass/fail result')
    .requiredOption('--agent <id>', 'Agent or principal ID')
    .requiredOption('--result <pass|fail>', 'Effectiveness result')
    .option('--role <role>', 'Role ID')
    .option('--work-class <class>', 'Governed work class', 'task_construction')
    .option('--checked-by <id>', 'Checker principal')
    .option('--evidence <refs>', 'Comma-separated evidence refs')
    .option('--escalation-command <cmd>', 'Escalation/CAPA command when result fails')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'qualification effectiveness-record',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => qualificationEffectivenessRecordCommand({
        agent: opts.agent as string | undefined,
        role: opts.role as string | undefined,
        workClass: opts.workClass as string | undefined,
        result: opts.result as 'pass' | 'fail' | undefined,
        checkedBy: opts.checkedBy as string | undefined,
        evidence: opts.evidence as string | undefined,
        escalationCommand: opts.escalationCommand as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));
}
