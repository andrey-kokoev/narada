import type { Command } from 'commander';
import {
  inboxClaimCommand,
  inboxDoctorCommand,
  inboxExportCommand,
  inboxIngestFilesCommand,
  inboxImportCommand,
  inboxListCommand,
  inboxNextCommand,
  inboxPendingCommand,
  inboxPromoteCommand,
  inboxReleaseCommand,
  inboxShowCommand,
  inboxSubmitObservationCommand,
  inboxSubmitCommand,
  inboxTaskCommand,
  inboxTriageCommand,
  inboxWorkNextCommand,
} from './inbox.js';
import { directCommandAction } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

function collectOption(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

export function registerInboxCommands(program: Command): void {
  const inboxCmd = program
    .command('inbox')
    .description('Canonical Inbox typed-envelope intake operators');

  inboxCmd
    .command('doctor')
    .description('Check Canonical Inbox delivery coordinates and local readiness')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'inbox doctor',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => inboxDoctorCommand({
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  inboxCmd
    .command('submit')
    .description('Submit an inert typed envelope into the Canonical Inbox')
    .requiredOption('--source-kind <kind>', 'Source kind: user_chat|email|diagnostic|agent_report|file_drop|cli|webhook|system_observation')
    .requiredOption('--source-ref <ref>', 'Source reference')
    .requiredOption('--kind <kind>', 'Envelope kind: proposal|observation|command_request|question|knowledge_candidate|task_candidate|incident|upstream_task_candidate')
    .requiredOption('--authority-level <level>', 'Authority level: none|user_statement|operator_confirmed|system_observed|agent_reported')
    .option('--principal <id>', 'Principal associated with authority')
    .option('--payload <json>', 'JSON payload')
    .option('--payload-file <path>', 'Read JSON payload from a file')
    .option('--payload-stdin', 'Read JSON payload from stdin', false)
    .option('--allow-empty-payload', 'Allow empty object payload for envelope kinds that normally require content', false)
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
        payloadFile: opts.payloadFile as string | undefined,
        payloadStdin: opts.payloadStdin as boolean | undefined,
        allowEmptyPayload: opts.allowEmptyPayload as boolean | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  inboxCmd
    .command('submit-observation')
    .description('Submit a shell-safe observation with read-back confirmation')
    .requiredOption('--source-ref <ref>', 'Source reference')
    .requiredOption('--title <title>', 'Observation title')
    .option('--summary <text>', 'Observation summary')
    .option('--source-kind <kind>', 'Source kind (default: user_chat): user_chat|email|diagnostic|agent_report|file_drop|cli|webhook|system_observation', 'user_chat')
    .option('--authority-level <level>', 'Authority level (default: agent_reported): none|user_statement|operator_confirmed|system_observed|agent_reported', 'agent_reported')
    .option('--principal <id>', 'Principal associated with authority')
    .option('--evidence <text>', 'Evidence line; repeatable', collectOption, [])
    .option('--proposal <text>', 'Proposal line; repeatable', collectOption, [])
    .option('--recommendation <text>', 'Recommended handling')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'inbox submit-observation',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => inboxSubmitObservationCommand({
        sourceKind: opts.sourceKind as string | undefined,
        sourceRef: opts.sourceRef as string | undefined,
        authorityLevel: opts.authorityLevel as string | undefined,
        principal: opts.principal as string | undefined,
        title: opts.title as string | undefined,
        summary: opts.summary as string | undefined,
        evidence: opts.evidence as string[] | undefined,
        proposal: opts.proposal as string[] | undefined,
        recommendation: opts.recommendation as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  inboxCmd
    .command('export')
    .description('Bulk/replay export inbox envelopes as append-only JSON artifacts')
    .option('--status <status>', 'Filter by status')
    .option('--kind <kind>', 'Filter by envelope kind')
    .option('--out-dir <path>', 'Output directory', '.ai/inbox-envelopes')
    .option('--limit <n>', 'Maximum envelopes', '200')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'inbox export',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => inboxExportCommand({
        status: opts.status as string | undefined,
        kind: opts.kind as string | undefined,
        outDir: opts.outDir as string | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  inboxCmd
    .command('import')
    .description('Import append-only JSON inbox envelope artifacts')
    .option('--from-dir <path>', 'Input directory', '.ai/inbox-envelopes')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'inbox import',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => inboxImportCommand({
        fromDir: opts.fromDir as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  inboxCmd
    .command('ingest-files')
    .description('Dry-run or admit dated numbered human file-drop items into the Canonical Inbox')
    .option('--from <path>', 'File-drop directory', '.ai/inbox-drop')
    .option('--admit', 'Admit admissible candidates into the Canonical Inbox', false)
    .option('--by <principal>', 'Principal admitting candidates; required with --admit')
    .option('--authority-level <level>', 'Default authority level for admitted envelopes', 'user_statement')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'inbox ingest-files',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => inboxIngestFilesCommand({
        fromDir: opts.from as string | undefined,
        admit: opts.admit as boolean | undefined,
        by: opts.by as string | undefined,
        authorityLevel: opts.authorityLevel as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  inboxCmd
    .command('list')
    .description('List Canonical Inbox envelopes')
    .option('--status <status>', 'Filter by status')
    .option('--kind <kind>', 'Filter by envelope kind')
    .option('--limit <n>', 'Maximum envelopes', '20')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'inbox list',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => inboxListCommand({
        status: opts.status as string | undefined,
        kind: opts.kind as string | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  inboxCmd
    .command('next')
    .description('Show the next inbox envelope without mutating it')
    .option('--status <status>', 'Filter by status', 'received')
    .option('--kind <kind>', 'Filter by envelope kind')
    .option('--limit <n>', 'Maximum envelopes including alternatives', '5')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'inbox next',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => inboxNextCommand({
        status: opts.status as string | undefined,
        kind: opts.kind as string | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  inboxCmd
    .command('work-next')
    .description('Show next inbox work with admissible actions')
    .option('--status <status>', 'Filter by status', 'received')
    .option('--kind <kind>', 'Filter by envelope kind')
    .option('--limit <n>', 'Maximum envelopes including alternatives', '5')
    .option('--claim', 'Claim the selected envelope before returning it', false)
    .option('--by <principal>', 'Principal claiming the selected envelope')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'inbox work-next',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => inboxWorkNextCommand({
        status: opts.status as string | undefined,
        kind: opts.kind as string | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        claim: opts.claim as boolean | undefined,
        by: opts.by as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  inboxCmd
    .command('claim <envelope-id>')
    .description('Claim an inbox envelope for handling')
    .requiredOption('--by <principal>', 'Principal claiming the envelope')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'inbox claim',
      emit: emitCommandResult,
      format: (_envelopeId: string, opts: Record<string, unknown>) => opts.format,
      invocation: (envelopeId, opts) => inboxClaimCommand({
        envelopeId,
        by: opts.by as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  inboxCmd
    .command('release <envelope-id>')
    .description('Release a claimed inbox envelope back to received')
    .requiredOption('--by <principal>', 'Principal releasing the envelope')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'inbox release',
      emit: emitCommandResult,
      format: (_envelopeId: string, opts: Record<string, unknown>) => opts.format,
      invocation: (envelopeId, opts) => inboxReleaseCommand({
        envelopeId,
        by: opts.by as string | undefined,
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
    .description('Promote an inbox envelope across a governed target crossing')
    .requiredOption('--target-kind <kind>', 'Promotion target kind')
    .option('--target-ref <ref>', 'Promotion target reference')
    .requiredOption('--by <principal>', 'Principal recording promotion')
    .option('--title <title>', 'Task title override for task promotion')
    .option('--goal <goal>', 'Task goal override for task promotion')
    .option('--criteria <text>', 'Task acceptance criterion override (repeatable)', collectValues, [])
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
        title: opts.title as string | undefined,
        goal: opts.goal as string | undefined,
        criteria: opts.criteria as string[] | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  inboxCmd
    .command('task <envelope-id>')
    .description('Promote an inbox task candidate into a task')
    .requiredOption('--by <principal>', 'Principal recording promotion')
    .option('--title <title>', 'Task title override')
    .option('--goal <goal>', 'Task goal override')
    .option('--criteria <text>', 'Task acceptance criterion override (repeatable)', collectValues, [])
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'inbox task',
      emit: emitCommandResult,
      format: (_envelopeId: string, opts: Record<string, unknown>) => opts.format,
      invocation: (envelopeId, opts) => inboxTaskCommand({
        envelopeId,
        by: opts.by as string | undefined,
        title: opts.title as string | undefined,
        goal: opts.goal as string | undefined,
        criteria: opts.criteria as string[] | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  inboxCmd
    .command('triage <envelope-id>')
    .description('Handle an inbox envelope with an explicit triage action')
    .requiredOption('--action <action>', 'Triage action: archive, task, or pending')
    .requiredOption('--by <principal>', 'Principal recording triage')
    .option('--target-kind <kind>', 'Pending target kind for --action pending')
    .option('--target-ref <ref>', 'Pending target reference')
    .option('--title <title>', 'Task title override for --action task')
    .option('--goal <goal>', 'Task goal override for --action task')
    .option('--criteria <text>', 'Task acceptance criterion override (repeatable)', collectValues, [])
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'inbox triage',
      emit: emitCommandResult,
      format: (_envelopeId: string, opts: Record<string, unknown>) => opts.format,
      invocation: (envelopeId, opts) => inboxTriageCommand({
        envelopeId,
        action: opts.action as string | undefined,
        by: opts.by as string | undefined,
        targetKind: opts.targetKind as string | undefined,
        targetRef: opts.targetRef as string | undefined,
        title: opts.title as string | undefined,
        goal: opts.goal as string | undefined,
        criteria: opts.criteria as string[] | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  inboxCmd
    .command('pending <envelope-id>')
    .description('Record a concise pending crossing: --to <kind>:<ref>')
    .requiredOption('--to <target>', 'Pending target as <kind>:<ref>')
    .requiredOption('--by <principal>', 'Principal recording pending crossing')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'inbox pending',
      emit: emitCommandResult,
      format: (_envelopeId: string, opts: Record<string, unknown>) => opts.format,
      invocation: (envelopeId, opts) => inboxPendingCommand({
        envelopeId,
        to: opts.to as string | undefined,
        by: opts.by as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));
}

function collectValues(value: string, previous: string[]): string[] {
  return [...previous, value];
}
