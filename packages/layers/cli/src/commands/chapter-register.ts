import type { Command } from 'commander';
import { chapterCloseCommand } from './chapter-close.js';
import { chapterFinishRangeCommand } from './chapter-finish-range.js';
import { chapterInitCommand, chapterValidateTasksFileCommand } from './chapter-init.js';
import { chapterPreflightCommand } from './chapter-preflight.js';
import { chapterStatusCommand } from './chapter-status.js';
import { taskEvidenceAssertCompleteCommand } from './task-evidence-list.js';
import { directCommandAction } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

export function registerChapterCommands(program: Command): void {
  const chapterCmd = program
    .command('chapter')
    .description('Chapter governance operators');

  chapterCmd
    .command('finish-range <range>')
    .description('Sanctioned chapter task completion orchestration for a numeric range')
    .requiredOption('--agent <id>', 'Agent ID performing the finish path')
    .option('--summary-prefix <text>', 'Summary prefix for each task report')
    .option('--force', 'Continue after task-level failure', false)
    .option('--details', 'Include full per-task command results', false)
    .option('--format <format>', 'Output format: json, human, or auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'chapter finish-range',
      emit: emitCommandResult,
      format: (_range: string, opts: Record<string, unknown>) => opts.format,
      invocation: (range, opts) => chapterFinishRangeCommand({
        range,
        agent: opts.agent as string,
        summaryPrefix: opts.summaryPrefix as string | undefined,
        force: opts.force as boolean | undefined,
        details: opts.details as boolean | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'human'),
      }),
    }));

  chapterCmd
    .command('assert-complete <range>')
    .description('Fail unless every task in a numeric chapter range is evidence-complete')
    .option('--format <format>', 'Output format: json, human, or auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'chapter assert-complete',
      emit: emitCommandResult,
      format: (_range: string, opts: Record<string, unknown>) => {
        const localFormat = opts.format === 'auto' ? undefined : opts.format;
        return resolveCommandFormat(localFormat, 'human');
      },
      invocation: (range, opts) => {
        const localFormat = opts.format === 'auto' ? undefined : opts.format;
        const format = resolveCommandFormat(localFormat, 'human');
        return taskEvidenceAssertCompleteCommand({
          range,
          cwd: opts.cwd as string | undefined,
          format,
        });
      },
    }));

  chapterCmd
    .command('init <slug>')
    .description('Initialize a chapter skeleton with range file and child tasks')
    .requiredOption('--title <title>', 'Chapter title')
    .requiredOption('--from <number>', 'First task number (positive integer)')
    .requiredOption('--count <n>', 'Number of child tasks (>= 1)')
    .option('--depends-on <numbers>', 'Comma-separated dependency task numbers')
    .option('--tasks-file <path>', 'JSON array of detailed child task specifications')
    .option('--dry-run', 'Preview files without writing', false)
    .option('--format <format>', 'Output format: json, human, or auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'chapter init',
      emit: emitCommandResult,
      format: (_slug: string, opts: Record<string, unknown>) => resolveCommandFormat(opts.format, 'auto'),
      invocation: (slug, opts) => {
        const format = resolveCommandFormat(opts.format, 'auto');
        return chapterInitCommand({
          slug,
          title: opts.title as string | undefined,
          from: opts.from ? Number(opts.from) : undefined,
          count: opts.count ? Number(opts.count) : undefined,
          dependsOn: opts.dependsOn as string | undefined,
          tasksFile: opts.tasksFile as string | undefined,
          dryRun: opts.dryRun as boolean | undefined,
          cwd: opts.cwd as string | undefined,
          format,
        });
      },
    }));

  chapterCmd
    .command('validate-tasks-file <path>')
    .description('Validate a chapter task-spec JSON file without writing tasks')
    .requiredOption('--count <n>', 'Expected number of child task specs')
    .option('--format <format>', 'Output format: json, human, or auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'chapter validate-tasks-file',
      emit: emitCommandResult,
      format: (_path: string, opts: Record<string, unknown>) => opts.format,
      invocation: (path, opts) => chapterValidateTasksFileCommand({
        path,
        count: opts.count ? Number(opts.count) : undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'human'),
      }),
    }));

  chapterCmd
    .command('status <range>')
    .description('Derive and display chapter state from task statuses in a range')
    .option('--format <format>', 'Output format: json, human, or auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'chapter status',
      emit: emitCommandResult,
      format: (_range: string, opts: Record<string, unknown>) => resolveCommandFormat(opts.format, 'auto'),
      invocation: (range, opts) => {
        const format = resolveCommandFormat(opts.format, 'auto');
        return chapterStatusCommand({
          range,
          cwd: opts.cwd as string | undefined,
          format,
        });
      },
    }));

  chapterCmd
    .command('preflight <range>')
    .description('Check whether chapter execution/commit crossings are currently admissible')
    .option('--expect-commit', 'Check that Git metadata is writable for commit publication', false)
    .option('--expect-push', 'Check that Git metadata is writable and the branch has an upstream', false)
    .option('--format <format>', 'Output format: json, human, or auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'chapter preflight',
      emit: emitCommandResult,
      format: (_range: string, opts: Record<string, unknown>) => resolveCommandFormat(opts.format, 'auto'),
      invocation: (range, opts) => {
        const format = resolveCommandFormat(opts.format, 'auto');
        return chapterPreflightCommand({
          range,
          cwd: opts.cwd as string | undefined,
          expectCommit: opts.expectCommit as boolean | undefined,
          expectPush: opts.expectPush as boolean | undefined,
          format,
        });
      },
    }));

  chapterCmd
    .command('close <identifier>')
    .description('Close a chapter: verify tasks, generate closure artifact, or manage closure workflow')
    .option('--dry-run', 'Preview closure without mutating state (legacy chapter-name mode)', false)
    .option('--start', 'Generate closure decision draft (range mode)', false)
    .option('--finish', 'Accept closure and transition tasks to confirmed (range mode)', false)
    .option('--reopen', 'Reopen a closing/closed chapter (range mode)', false)
    .option('--by <operator-id>', 'Operator ID for closure decision')
    .option('--reason <text>', 'Reason for reopen')
    .option('--format <format>', 'Output format: json, human, or auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'chapter close',
      emit: emitCommandResult,
      format: (_identifier: string, opts: Record<string, unknown>) => resolveCommandFormat(opts.format, 'auto'),
      invocation: (identifier, opts) => {
        const isRange = /^\d+(?:-\d+)?$/.test(identifier);
        const format = resolveCommandFormat(opts.format, 'auto');
        return chapterCloseCommand({
          chapterName: isRange && !opts.start && !opts.finish && !opts.reopen ? undefined : (isRange ? undefined : identifier),
          range: isRange && (opts.start || opts.finish || opts.reopen) ? identifier : undefined,
          start: opts.start as boolean | undefined,
          finish: opts.finish as boolean | undefined,
          reopen: opts.reopen as boolean | undefined,
          by: opts.by as string | undefined,
          reason: opts.reason as string | undefined,
          dryRun: opts.dryRun as boolean | undefined,
          cwd: opts.cwd as string | undefined,
          format,
        });
      },
    }));
}
