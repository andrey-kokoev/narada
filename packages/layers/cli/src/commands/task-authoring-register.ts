import type { Command } from 'commander';
import { taskAllocateCommand } from './task-allocate.js';
import { taskCreateCommand } from './task-create.js';
import { taskAmendCommand, taskMakeActionableCommand } from './task-amend.js';
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
    .option('--title <title>', 'Task title; optional when --input-json supplies title')
    .option('--goal <text>', 'Task goal (defaults to title)')
    .option('--context <text>', 'Task context')
    .option('--required-work <text>', 'Concrete executable Required Work; use --input-json for multiline text')
    .option('--chapter <name>', 'Chapter name for task grouping')
    .option('--depends-on <numbers>', 'Comma-separated dependency task numbers')
    .option('--criteria <text>', 'Acceptance criterion; repeatable; preserves commas inside the criterion', collectCriteriaValue, [])
    .option('--criteria-csv <csv>', 'Explicit CSV acceptance criteria input; use --criteria for comma-containing text')
    .option('--number <n>', 'Use a pre-allocated task number (skips allocation)')
    .option('--input-json <path>', 'Read structured task fields from JSON; preserves rich shell-sensitive text literally')
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
          title: opts.title as string | undefined,
          goal: opts.goal as string | undefined,
          context: opts.context as string | undefined,
          requiredWork: opts.requiredWork as string | undefined,
          chapter: opts.chapter as string | undefined,
          dependsOn: opts.dependsOn as string | undefined,
          criteria: mergeCriteriaInputs(opts.criteria, opts.criteriaCsv),
          number: opts.number ? Number(opts.number) : undefined,
          dryRun: opts.dryRun as boolean,
          fromFile: opts.fromFile as string | undefined,
          inputJson: opts.inputJson as string | undefined,
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
    .option('--criteria <text>', 'Replacement acceptance criterion; repeatable; preserves commas inside the criterion', collectCriteriaValue, [])
    .option('--criteria-csv <csv>', 'Explicit CSV replacement criteria input; use --criteria for comma-containing text')
    .option('--append-criteria <text>', 'Acceptance criterion to append; repeatable; preserves commas inside the criterion', collectCriteriaValue, [])
    .option('--append-criteria-csv <csv>', 'Explicit CSV append criteria input; use --append-criteria for comma-containing text')
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
        criteria: mergeCriteriaInputs(opts.criteria, opts.criteriaCsv),
        appendCriteria: mergeCriteriaInputs(opts.appendCriteria, opts.appendCriteriaCsv),
        checkAllCriteria: opts.checkAllCriteria as boolean | undefined,
        dependsOn: opts.dependsOn ? String(opts.dependsOn).split(',').map((s: string) => Number(s.trim())).filter((n: number) => Number.isFinite(n)) : undefined,
        fromFile: opts.fromFile as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        cwd: opts.cwd as string | undefined,
      }),
    }));

  taskCmd
    .command('make-actionable <task-number>')
    .description('Guided repair for an underspecified executable task handoff')
    .requiredOption('--by <id>', 'Operator or agent ID performing the repair')
    .requiredOption('--required-work <text>', 'Concrete executable Required Work; use shell-safe quoting or a task amend --from-file path for larger changes')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'task make-actionable',
      emit: emitCommandResult,
      format: (_taskNumber: string, opts: Record<string, unknown>) => opts.format,
      invocation: (taskNumber, opts) => taskMakeActionableCommand({
        taskNumber,
        by: opts.by as string,
        requiredWork: opts.requiredWork as string | undefined,
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

export function collectCriteriaValue(value: string, previous: string[]): string[] {
  const trimmed = value.trim();
  return trimmed ? [...previous, trimmed] : previous;
}

export function collectCriteriaCsvValues(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function mergeCriteriaInputs(criteria: unknown, criteriaCsv: unknown): string[] | undefined {
  const repeated = Array.isArray(criteria) ? criteria.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
  const csv = typeof criteriaCsv === 'string' && criteriaCsv.trim().length > 0 ? collectCriteriaCsvValues(criteriaCsv) : [];
  const merged = [...repeated, ...csv];
  return merged.length > 0 ? merged : undefined;
}
