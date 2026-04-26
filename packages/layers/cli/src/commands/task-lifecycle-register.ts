import type { Command } from 'commander';
import { taskClaimCommand } from './task-claim.js';
import { taskReleaseCommand } from './task-release.js';
import { taskReviewCommand } from './task-review.js';
import { taskReportCommand } from './task-report.js';
import { taskFinishCommand } from './task-finish.js';
import { taskContinueCommand } from './task-continue.js';
import { taskCloseCommand } from './task-close.js';
import { taskReopenCommand } from './task-reopen.js';
import { taskConfirmCommand } from './task-confirm.js';
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

export function registerTaskLifecycleCommands(taskCmd: Command): void {
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
    .command('report <task-number>')
    .description('Lifecycle handoff: submit a WorkResultReport and move a claimed task to in_review')
    .requiredOption('--agent <id>', 'Reporting agent ID from roster')
    .requiredOption('--summary <text>', 'Human-readable result summary')
    .option('--changed-files <csv>', 'Comma-separated list of changed file paths')
    .option('--verification <json>', 'JSON array of {command, result} objects')
    .option('--residuals <json>', 'JSON array of known residual strings')
    .option('--principal-state-dir <path>', 'Directory containing PrincipalRuntime state file')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('-v, --verbose', 'Show accepted-learning guidance and expanded rationale', false)
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'task report',
      emit: emitCommandResult,
      invocation: (taskNumber, opts) => taskReportCommand({
        taskNumber,
        agent: opts.agent as string,
        summary: opts.summary as string | undefined,
        changedFiles: opts.changedFiles as string | undefined,
        verification: opts.verification as string | undefined,
        residuals: opts.residuals as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(),
        principalStateDir: opts.principalStateDir as string | undefined,
        verbose: opts.verbose as boolean | undefined,
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
        summary: opts.summary as string | undefined,
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
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(),
        principalStateDir: opts.principalStateDir as string | undefined,
        store,
      }),
    }));

  taskCmd
    .command('close <task-number>')
    .description('Lifecycle transition: close by consuming latest admitted evidence')
    .requiredOption('--by <id>', 'Operator or agent ID performing the close')
    .requiredOption('--mode <mode>', 'Closure mode: operator_direct, peer_reviewed, agent_finish, emergency')
    .option('--format <fmt>', 'Output format: json or human', 'human')
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
