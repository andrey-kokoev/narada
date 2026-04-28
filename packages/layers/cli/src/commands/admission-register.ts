import type { Command } from 'commander';
import {
  admissionExplainCommand,
  admissionListCommand,
  admissionRecordCommand,
} from './admission.js';
import { directCommandAction, silentCommandContext } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

export function registerAdmissionCommands(program: Command): void {
  const admissionCmd = program
    .command('admission')
    .description('Admission and rejection ledger operators');

  admissionCmd
    .command('record')
    .description('Record an admitted, rejected, deferred, or superseded candidate decision')
    .requiredOption('--candidate-id <id>', 'Candidate identifier')
    .requiredOption('--source-kind <kind>', 'Source kind, e.g. file_drop, mailbox, inbox, site_absorption')
    .requiredOption('--source-ref <ref>', 'Source reference')
    .requiredOption('--candidate-kind <kind>', 'Candidate kind, e.g. envelope, proposal, task, knowledge')
    .requiredOption('--decision <decision>', 'Decision: admitted, rejected, deferred, superseded')
    .requiredOption('--reasons <csv>', 'Reason codes')
    .option('--evidence-refs <csv>', 'Evidence references')
    .requiredOption('--by <id>', 'Principal or system actor recording the decision')
    .option('--system-rule <id>', 'System rule used for the decision')
    .option('--authority-level <level>', 'Authority level', 'operator_confirmed')
    .option('--resulting-envelope-id <id>', 'Envelope id when admitted')
    .option('--supersedes <id>', 'Decision or candidate superseded by this decision')
    .option('--retry-of <id>', 'Prior decision or candidate retried by this candidate')
    .option('--observed-at <iso>', 'When the candidate was observed')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'admission record',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => admissionRecordCommand({
        candidateId: opts.candidateId as string | undefined,
        sourceKind: opts.sourceKind as string | undefined,
        sourceRef: opts.sourceRef as string | undefined,
        candidateKind: opts.candidateKind as string | undefined,
        decision: opts.decision as string | undefined,
        reasons: opts.reasons as string | undefined,
        evidenceRefs: opts.evidenceRefs as string | undefined,
        by: opts.by as string | undefined,
        systemRule: opts.systemRule as string | undefined,
        authorityLevel: opts.authorityLevel as string | undefined,
        resultingEnvelopeId: opts.resultingEnvelopeId as string | undefined,
        supersedes: opts.supersedes as string | undefined,
        retryOf: opts.retryOf as string | undefined,
        observedAt: opts.observedAt as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  admissionCmd
    .command('list')
    .description('List admission/rejection ledger entries')
    .option('--source-kind <kind>', 'Filter by source kind')
    .option('--candidate-kind <kind>', 'Filter by candidate kind')
    .option('--decision <decision>', 'Filter by decision')
    .option('--limit <n>', 'Maximum entries', '20')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'admission list',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => admissionListCommand({
        sourceKind: opts.sourceKind as string | undefined,
        candidateKind: opts.candidateKind as string | undefined,
        decision: opts.decision as string | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  admissionCmd
    .command('explain <decision-id>')
    .description('Explain one admission/rejection decision')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'admission explain',
      emit: emitCommandResult,
      format: (_decisionId: string, opts: Record<string, unknown>) => opts.format,
      invocation: (decisionId, opts) => admissionExplainCommand({
        decisionId,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));
}
