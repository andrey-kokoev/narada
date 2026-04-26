import type { Command } from 'commander';
import { taskAllocateCommand } from './task-allocate.js';
import { taskCreateCommand } from './task-create.js';
import { taskAmendCommand } from './task-amend.js';
import { taskPromoteRecommendationCommand } from './task-promote-recommendation.js';
import { directCommandAction } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

export function registerTaskAuthoringCommands(taskCmd: Command): void {
  taskCmd
    .command('allocate')
    .description('Allocate the next task number atomically')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .option('--count <n>', 'Allocate N sequential task numbers atomically', (value) => Number(value), 1)
    .option('--dry-run', 'Preview next number without mutating registry', false)
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'task allocate',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => taskAllocateCommand({
        cwd: opts.cwd as string | undefined,
        format: opts.format as 'json' | 'human' | 'auto',
        dryRun: opts.dryRun as boolean,
        count: opts.count as number,
      }),
    }));

  taskCmd
    .command('create')
    .description('Create a standalone task (allocate number + write spec + init lifecycle)')
    .requiredOption('--title <title>', 'Task title')
    .option('--goal <text>', 'Task goal (defaults to title)')
    .option('--chapter <name>', 'Chapter name for task grouping')
    .option('--depends-on <numbers>', 'Comma-separated dependency task numbers')
    .option('--criteria <csv>', 'Comma-separated acceptance criteria')
    .option('--number <n>', 'Use a pre-allocated task number (skips allocation)')
    .option('--from-file <path>', 'Read task body from a file instead of generating scaffold')
    .option('--dry-run', 'Preview task without creating files', false)
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'task create',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => {
        const cwd = opts.cwd as string | undefined;
        return taskCreateCommand({
          title: opts.title as string,
          goal: opts.goal as string | undefined,
          chapter: opts.chapter as string | undefined,
          dependsOn: opts.dependsOn as string | undefined,
          criteria: opts.criteria ? String(opts.criteria).split(',').map((s: string) => s.trim()).filter(Boolean) : undefined,
          number: opts.number ? Number(opts.number) : undefined,
          dryRun: opts.dryRun as boolean,
          fromFile: opts.fromFile as string | undefined,
          format: resolveCommandFormat(opts.format, 'auto'),
          cwd,
        });
      },
    }));

  taskCmd
    .command('amend <task-number>')
    .description('Amend task specification without direct markdown editing')
    .requiredOption('--by <id>', 'Operator or agent ID performing the amendment')
    .option('--title <title>', 'New task title')
    .option('--goal <text>', 'New goal text')
    .option('--context <text>', 'New context text')
    .option('--required-work <text>', 'New required work text')
    .option('--non-goals <text>', 'New non-goals text')
    .option('--criteria <csv>', 'Replace acceptance criteria (comma-separated)')
    .option('--append-criteria <csv>', 'Append acceptance criteria (comma-separated)')
    .option('--check-all-criteria', 'Deprecated; use task evidence prove-criteria <task-number> --by <id>')
    .option('--depends-on <csv>', 'Replace dependencies (comma-separated task numbers)')
    .option('--from-file <path>', 'Replace entire body from file')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'task amend',
      emit: emitCommandResult,
      format: (_taskNumber: string, opts: Record<string, unknown>) => opts.format,
      invocation: (taskNumber, opts) => taskAmendCommand({
        taskNumber,
        by: opts.by as string,
        title: opts.title as string | undefined,
        goal: opts.goal as string | undefined,
        context: opts.context as string | undefined,
        requiredWork: opts.requiredWork as string | undefined,
        nonGoals: opts.nonGoals as string | undefined,
        criteria: opts.criteria ? String(opts.criteria).split(',').map((s: string) => s.trim()).filter(Boolean) : undefined,
        appendCriteria: opts.appendCriteria ? String(opts.appendCriteria).split(',').map((s: string) => s.trim()).filter(Boolean) : undefined,
        checkAllCriteria: opts.checkAllCriteria as boolean | undefined,
        dependsOn: opts.dependsOn ? String(opts.dependsOn).split(',').map((s: string) => Number(s.trim())).filter((n: number) => Number.isFinite(n)) : undefined,
        fromFile: opts.fromFile as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        cwd: opts.cwd as string | undefined,
      }),
    }));

  taskCmd
    .command('promote-recommendation')
    .description('Promote an advisory recommendation to a durable assignment')
    .requiredOption('--task <task-number>', 'Task number to promote')
    .requiredOption('--agent <agent-id>', 'Agent to assign')
    .requiredOption('--by <operator-id>', 'Operator requesting the promotion')
    .option('--recommendation-id <id>', 'Original recommendation ID for audit linkage')
    .option('--override-risk <reason>', 'Proceed despite stale or write-set risk')
    .option('--dry-run', 'Validate only; do not mutate', false)
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'task promote-recommendation',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => taskPromoteRecommendationCommand({
        cwd: opts.cwd as string | undefined,
        format: opts.format as 'json' | 'human' | 'auto',
        taskNumber: opts.task as string | undefined,
        agent: opts.agent as string | undefined,
        by: opts.by as string | undefined,
        recommendationId: opts.recommendationId as string | undefined,
        overrideRisk: opts.overrideRisk as string | undefined,
        dryRun: opts.dryRun as boolean,
      }),
    }));
}
