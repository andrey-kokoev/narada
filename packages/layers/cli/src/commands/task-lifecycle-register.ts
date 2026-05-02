import type { Command } from 'commander';
import { taskClaimCommand } from './task-claim.js';
import { taskReleaseCommand } from './task-release.js';
import { taskDeferCommand } from './task-defer.js';
import { taskUnblockCommand } from './task-unblock.js';
import { taskReviewCommand } from './task-review.js';
import { taskReportCommand } from './task-report.js';
import { taskFinishCommand } from './task-finish.js';
import { taskReviewRequestCommand } from './task-review-request.js';
import { taskStageCommand } from './task-stage.js';
import { taskContinueCommand } from './task-continue.js';
import { taskCloseCommand } from './task-close.js';
import { taskReopenCommand } from './task-reopen.js';
import { taskConfirmCommand } from './task-confirm.js';
import {
  taskLifecycleExportCommand,
  taskLifecycleInspectSnapshotCommand,
  taskLifecycleImportCommand,
} from './task-lifecycle-snapshot.js';
import { taskLifecycleStatusCommand } from './task-lifecycle-status.js';
import {
  directCommandAction,
  resourceScopedDirectCommandAction,
} from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';
import {
  openTaskLifecycleStore,
  type SqliteTaskLifecycleStore,
  type TaskClosureMode,
} from '../lib/task-lifecycle-store.js';

function closeStore(store: SqliteTaskLifecycleStore): void {
  store.db.close();
}

function collectValues(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

export function registerTaskLifecycleCommands(taskCmd: Command): void {
  const lifecycleCmd = taskCmd
    .command('lifecycle')
    .description('Task lifecycle SQLite authority snapshot operators');

  lifecycleCmd
    .command('status')
    .description('Read-only task lifecycle allocation and Builder done posture')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'task lifecycle status',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => taskLifecycleStatusCommand({
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  lifecycleCmd
    .command('export')
    .description('Export task lifecycle SQLite authority as a deterministic JSON snapshot')
    .option('--output <path>', 'Snapshot output path', '.ai/task-lifecycle-snapshot.json')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'task lifecycle export',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => taskLifecycleExportCommand({
        output: opts.output as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  lifecycleCmd
    .command('inspect-snapshot')
    .description('Compactly inspect a lifecycle snapshot without dumping raw artifact content')
    .option('--input <path>', 'Snapshot input path', '.ai/task-lifecycle-snapshot.json')
    .option('--raw', 'Include raw snapshot payload explicitly', false)
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'task lifecycle inspect-snapshot',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => taskLifecycleInspectSnapshotCommand({
        input: opts.input as string | undefined,
        raw: opts.raw as boolean | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  lifecycleCmd
    .command('import')
    .description('Import task lifecycle SQLite authority from a JSON snapshot')
    .option('--input <path>', 'Snapshot input path', '.ai/task-lifecycle-snapshot.json')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'task lifecycle import',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => taskLifecycleImportCommand({
        input: opts.input as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  taskCmd
    .command('claim <task-number>')
    .description('Lifecycle/assignment transition: claim a task for an agent')
    .requiredOption('--agent <id>', 'Agent ID from roster')
    .option('--reason <text>', 'Claim justification')
    .option('--update-principal-runtime', 'Update PrincipalRuntime state after claim', false)
    .option('--principal-state-dir <path>', 'Directory containing PrincipalRuntime state file')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'task claim',
      emit: emitCommandResult,
      invocation: (taskNumber, opts) => taskClaimCommand({
        taskNumber,
        agent: opts.agent as string,
        reason: opts.reason as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(),
        updatePrincipalRuntime: opts.updatePrincipalRuntime as boolean | undefined,
        principalStateDir: opts.principalStateDir as string | undefined,
      }),
    }));

  taskCmd
    .command('release <task-number>')
    .description('Release a claimed task')
    .requiredOption('--reason <reason>', 'Release reason: completed, abandoned, superseded, transferred, budget_exhausted')
    .option('--continuation <path>', 'Path to continuation packet JSON (required for budget_exhausted)')
    .option('--principal-state-dir <path>', 'Directory containing PrincipalRuntime state file')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'task release',
      emit: emitCommandResult,
      invocation: (taskNumber, opts) => taskReleaseCommand({
        taskNumber,
        reason: opts.reason as 'completed' | 'abandoned' | 'superseded' | 'transferred' | 'budget_exhausted',
        continuation: opts.continuation as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
        principalStateDir: opts.principalStateDir as string | undefined,
      }),
    }));

  taskCmd
    .command('defer <task-number>')
    .description('Defer a task on explicit external unblock evidence')
    .requiredOption('--agent <id>', 'Agent ID recording the deferral')
    .requiredOption('--reason <text>', 'Why the task cannot progress now')
    .requiredOption('--unblock <text>', 'Concrete unblock condition or command')
    .option('--residuals <json>', 'JSON array or comma-separated residuals')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'task defer',
      emit: emitCommandResult,
      invocation: (taskNumber, opts) => taskDeferCommand({
        taskNumber,
        agent: opts.agent as string,
        reason: opts.reason as string,
        unblock: opts.unblock as string,
        residuals: opts.residuals as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      }),
    }));

  taskCmd
    .command('unblock <task-number>')
    .description('Resume a deferred task into opened state with explicit unblock evidence')
    .requiredOption('--agent <id>', 'Agent ID recording the unblock')
    .requiredOption('--evidence <text>', 'Evidence that the deferred blocker is satisfied')
    .requiredOption('--rationale <text>', 'Why the task should re-enter normal runnable work')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'task unblock',
      emit: emitCommandResult,
      invocation: (taskNumber, opts) => taskUnblockCommand({
        taskNumber,
        agent: opts.agent as string,
        evidence: opts.evidence as string,
        rationale: opts.rationale as string,
        cwd: opts.cwd as string | undefined,
        format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      }),
    }));

  taskCmd
    .command('report <task-number>')
    .description('Lifecycle handoff: submit a WorkResultReport and move a claimed task to in_review')
    .requiredOption('--agent <id>', 'Reporting agent ID from roster')
    .option('--summary <text>', 'Human-readable result summary')
    .option('--reviewer <agent-or-role>', 'Create a directed review_request obligation for an exact agent id or unique role alias')
    .option('--report-file <path>', 'Read summary, reviewer, changed_files, verification, and residuals from a JSON report file')
    .option('--changed-files <csv>', 'Comma-separated list of changed file paths')
    .option('--verification <json>', 'JSON array of {command, result} objects, e.g. \'[{"command":"pnpm verify","result":"passed"}]\'')
    .option('--residuals <json>', 'JSON array of known residual strings')
    .option('--principal-state-dir <path>', 'Directory containing PrincipalRuntime state file')
    .option('--override-rationale <text>', 'Explicit durable override rationale for role-guarded lifecycle actions')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('-v, --verbose', 'Show accepted-learning guidance and expanded rationale', false)
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'task report',
      emit: emitCommandResult,
      invocation: (taskNumber, opts) => taskReportCommand({
        taskNumber,
        agent: opts.agent as string,
        reviewer: opts.reviewer as string | undefined,
        summary: opts.summary as string | undefined,
        reportFile: opts.reportFile as string | undefined,
        changedFiles: opts.changedFiles as string | undefined,
        verification: opts.verification as string | undefined,
        residuals: opts.residuals as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(),
        principalStateDir: opts.principalStateDir as string | undefined,
        overrideRationale: opts.overrideRationale as string | undefined,
        verbose: opts.verbose as boolean | undefined,
      }),
    }));

  taskCmd
    .command('review-request <task-number>')
    .description('Create a directed review_request obligation from an existing task report')
    .requiredOption('--agent <id>', 'Reporting agent ID that owns the report')
    .requiredOption('--reviewer <agent-or-role>', 'Exact reviewer agent id or unique role alias')
    .option('--report <id>', 'Specific WorkResultReport ID; defaults to latest report for task')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(resourceScopedDirectCommandAction<SqliteTaskLifecycleStore, [string, Record<string, unknown>]>({
      command: 'task review-request',
      emit: emitCommandResult,
      open: (_taskNumber, opts) => openTaskLifecycleStore((opts.cwd as string | undefined) || process.cwd()),
      close: closeStore,
      invocation: (store, taskNumber, opts) => taskReviewRequestCommand({
        taskNumber,
        agent: opts.agent as string,
        reviewer: opts.reviewer as string,
        report: opts.report as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(),
        store,
      }),
    }));

  taskCmd
    .command('stage <task-number>')
    .description('Stage declared task files while reporting unrelated dirty work')
    .option('--agent <id>', 'Agent requesting task-scoped staging')
    .option('--include <path>', 'Path to stage for the task (repeatable)', collectValues, [])
    .option('--from-report', 'Stage changed_files from the latest task report', false)
    .option('--report <id>', 'Stage changed_files from a specific WorkResultReport ID')
    .option('--dry-run', 'Show what would be staged without mutating Git index', false)
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'task stage',
      emit: emitCommandResult,
      format: (_taskNumber: string, opts: Record<string, unknown>) => opts.format,
      invocation: (taskNumber, opts) => taskStageCommand({
        taskNumber,
        agent: opts.agent as string | undefined,
        include: opts.include as string[] | undefined,
        fromReport: opts.fromReport as boolean | undefined,
        report: opts.report as string | undefined,
        dryRun: opts.dryRun as boolean | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  taskCmd
    .command('continue <task-number>')
    .description('Continue or take over an already-claimed task')
    .requiredOption('--agent <id>', 'Continuation agent ID from roster')
    .requiredOption('--reason <reason>', 'Continuation reason: evidence_repair, review_fix, handoff, blocked_agent, operator_override')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'task continue',
      emit: emitCommandResult,
      invocation: (taskNumber, opts) => taskContinueCommand({
        taskNumber,
        agent: opts.agent as string,
        reason: opts.reason as 'evidence_repair' | 'review_fix' | 'handoff' | 'blocked_agent' | 'operator_override',
        cwd: opts.cwd as string | undefined,
        format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      }),
    }));

  taskCmd
    .command('finish <task-number>')
    .description('Canonical agent completion: report/review -> optional evidence admit/close -> roster done')
    .requiredOption('--agent <id>', 'Agent ID from roster')
    .option('--summary <text>', 'Implementer: Work result summary')
    .option('--reviewer <agent-or-role>', 'Implementer: create a directed review_request obligation with the report')
    .option('--report-file <path>', 'Implementer: read summary, reviewer, changed_files, verification, and residuals from a JSON report file')
    .option('--changed-files <csv>', 'Implementer: Comma-separated changed file paths')
    .option('--verification <json>', 'Implementer: JSON array of {command, result}')
    .option('--residuals <json>', 'Implementer: JSON array of known residual strings')
    .option('--verdict <verdict>', 'Reviewer: accepted, accepted_with_notes, or rejected')
    .option('--findings <json>', 'Reviewer: JSON array of review findings')
    .option('--report <id>', 'Reviewer: Link to a specific report ID')
    .option('--allow-incomplete', 'Record roster availability even when evidence is missing', false)
    .option('--close', 'After report/review, admit evidence and close lifecycle if admissible', false)
    .option('--prove-criteria', 'Before evidence admission, prove all acceptance criteria for this task', false)
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('-v, --verbose', 'Show accepted-learning guidance and expanded rationale', false)
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'task finish',
      emit: emitCommandResult,
      invocation: (taskNumber, opts) => taskFinishCommand({
        taskNumber,
        agent: opts.agent as string,
        reviewer: opts.reviewer as string | undefined,
        summary: opts.summary as string | undefined,
        reportFile: opts.reportFile as string | undefined,
        changedFiles: opts.changedFiles as string | undefined,
        verification: opts.verification as string | undefined,
        residuals: opts.residuals as string | undefined,
        verdict: opts.verdict as 'accepted' | 'accepted_with_notes' | 'rejected' | undefined,
        findings: opts.findings as string | undefined,
        report: opts.report as string | undefined,
        allowIncomplete: opts.allowIncomplete as boolean | undefined,
        close: opts.close as boolean | undefined,
        proveCriteria: opts.proveCriteria as boolean | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(),
        verbose: opts.verbose as boolean | undefined,
      }),
    }));

  taskCmd
    .command('review <task-number>')
    .description('Review admission: record verdict and admit/reject lifecycle closure')
    .requiredOption('--agent <id>', 'Reviewer agent ID from roster')
    .requiredOption('--verdict <verdict>', 'Review verdict: accepted, accepted_with_notes, rejected')
    .option('--findings <json>', 'JSON array of findings')
    .option('--report <id>', 'WorkResultReport ID to link to this review')
    .option('--no-capa-reason <text>', 'One-line rationale when rejected findings do not warrant CAPA routing')
    .option('--principal-state-dir <path>', 'Directory containing PrincipalRuntime state file')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(resourceScopedDirectCommandAction<SqliteTaskLifecycleStore, [string, Record<string, unknown>]>({
      command: 'task review',
      emit: emitCommandResult,
      open: (_taskNumber, opts) => openTaskLifecycleStore((opts.cwd as string | undefined) || process.cwd()),
      close: closeStore,
      invocation: (store, taskNumber, opts) => taskReviewCommand({
        taskNumber,
        agent: opts.agent as string,
        verdict: opts.verdict as 'accepted' | 'accepted_with_notes' | 'rejected',
        findings: opts.findings as string | undefined,
        report: opts.report as string | undefined,
        noCapaReason: opts.noCapaReason as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(),
        principalStateDir: opts.principalStateDir as string | undefined,
        store,
      }),
    }));

  taskCmd
    .command('close <task-number>')
    .description('Operator closure: close by consuming latest admitted evidence; peer review may auto-close via task review --verdict accepted')
    .requiredOption('--by <id>', 'Operator or agent ID performing the close')
    .requiredOption('--mode <mode>', 'Closure mode: operator_direct, peer_reviewed, agent_finish, emergency. Use peer_reviewed only for explicit review-driven closure; task review --verdict accepted normally handles that path.')
    .option('--format <fmt>', 'Output format: json or human', 'human')
    .option('--override-rationale <text>', 'Explicit durable override rationale for role-guarded lifecycle actions')
    .option('--no-continuation-needed <text>', 'One-line rationale for closing facade/prototype/spike/design-only scope without follow-up task linkage')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(resourceScopedDirectCommandAction<SqliteTaskLifecycleStore, [string, Record<string, unknown>]>({
      command: 'task close',
      emit: emitCommandResult,
      format: (_taskNumber: string, opts: Record<string, unknown>) => opts.format,
      open: (_taskNumber, opts) => openTaskLifecycleStore((opts.cwd as string | undefined) || process.cwd()),
      close: closeStore,
      invocation: (store, taskNumber, opts) => taskCloseCommand({
        taskNumber,
        by: opts.by as string | undefined,
        mode: opts.mode as TaskClosureMode,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'human'),
        store,
        overrideRationale: opts.overrideRationale as string | undefined,
        noContinuationNeeded: typeof opts.noContinuationNeeded === 'string'
          ? opts.noContinuationNeeded
          : typeof opts.continuationNeeded === 'string'
            ? opts.continuationNeeded
            : undefined,
      }),
    }));

  taskCmd
    .command('reopen <task-number>')
    .description('Reopen a terminal task with governance violations so it can be re-closed through a governed operator')
    .option('--by <id>', 'Operator or agent ID performing the reopen', 'operator')
    .option('--force', 'Reopen even if the task is valid by evidence', false)
    .option('--format <fmt>', 'Output format: json or human', 'human')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'task reopen',
      emit: emitCommandResult,
      format: (_taskNumber: string, opts: Record<string, unknown>) => opts.format,
      invocation: (taskNumber, opts) => taskReopenCommand({
        taskNumber,
        by: opts.by as string | undefined,
        force: opts.force as boolean | undefined,
        cwd: opts.cwd as string | undefined,
        format: (opts.format as 'json' | 'human' | 'auto') || process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      }),
    }));

  taskCmd
    .command('confirm <task-number>')
    .description('Confirm a closed task as complete (terminal step)')
    .requiredOption('--by <id>', 'Operator or agent ID performing the confirmation')
    .option('--format <fmt>', 'Output format: json or human', 'human')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'task confirm',
      emit: emitCommandResult,
      format: (_taskNumber: string, opts: Record<string, unknown>) => opts.format,
      invocation: (taskNumber, opts) => taskConfirmCommand({
        taskNumber,
        by: opts.by as string | undefined,
        format: (opts.format as 'json' | 'human' | 'auto') || process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
        cwd: opts.cwd as string | undefined,
      }),
    }));
}
