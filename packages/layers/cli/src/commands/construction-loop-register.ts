import type { Command } from 'commander';
import {
  constructionLoopMetricsCommand,
  constructionLoopPauseCommand,
  constructionLoopPlanCommand,
  constructionLoopPolicyInitCommand,
  constructionLoopPolicyShowCommand,
  constructionLoopPolicyValidateCommand,
  constructionLoopResumeCommand,
  constructionLoopRunCommand,
} from './construction-loop.js';
import { directCommandAction } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

export function registerConstructionLoopCommands(program: Command): void {
  const constructionLoopCmd = program
    .command('construction-loop')
    .description('Construction loop controller — read-only plan composition');

  constructionLoopCmd
    .command('plan')
    .description('Generate an operator plan from current task state (read-only)')
    .option('--policy <path>', 'Path to construction loop policy file')
    .option('--max-tasks <n>', 'Override max tasks per cycle for this run')
    .option('--format <format>', 'Output format: json, human, or auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'construction-loop plan',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => constructionLoopPlanCommand({
        policyPath: opts.policy as string | undefined,
        maxTasks: opts.maxTasks ? Number(opts.maxTasks) : undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        cwd: opts.cwd as string | undefined,
      }),
    }));

  const policyCmd = constructionLoopCmd
    .command('policy')
    .description('Construction loop policy operators');

  policyCmd
    .command('show')
    .description('Display current construction loop policy')
    .option('--policy <path>', 'Path to policy file')
    .option('--format <format>', 'Output format: json, human, or auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'construction-loop policy show',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => constructionLoopPolicyShowCommand({
        policyPath: opts.policy as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        cwd: opts.cwd as string | undefined,
      }),
    }));

  policyCmd
    .command('init')
    .description('Create a default construction loop policy file')
    .option('--strict', 'Create a stricter variant of the default policy', false)
    .option('--policy <path>', 'Output path for policy file')
    .option('--format <format>', 'Output format: json, human, or auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'construction-loop policy init',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => constructionLoopPolicyInitCommand({
        strict: opts.strict as boolean | undefined,
        policyPath: opts.policy as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        cwd: opts.cwd as string | undefined,
      }),
    }));

  policyCmd
    .command('validate')
    .description('Validate an existing construction loop policy and report errors')
    .option('--policy <path>', 'Path to policy file')
    .option('--format <format>', 'Output format: json, human, or auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'construction-loop policy validate',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => constructionLoopPolicyValidateCommand({
        policyPath: opts.policy as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        cwd: opts.cwd as string | undefined,
      }),
    }));

  constructionLoopCmd
    .command('run')
    .description('Run the construction loop with bounded auto-promotion')
    .option('--policy <path>', 'Path to construction loop policy file')
    .option('--max-tasks <n>', 'Override max tasks per cycle for this run')
    .option('--dry-run', 'Preview promotions without mutating state', false)
    .option('--format <format>', 'Output format: json, human, or auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'construction-loop run',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => constructionLoopRunCommand({
        policyPath: opts.policy as string | undefined,
        maxTasks: opts.maxTasks ? Number(opts.maxTasks) : undefined,
        dryRun: opts.dryRun as boolean | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        cwd: opts.cwd as string | undefined,
      }),
    }));

  constructionLoopCmd
    .command('pause')
    .description('Pause the construction loop')
    .option('--reason <text>', 'Reason for pause')
    .option('--format <format>', 'Output format: json, human, or auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'construction-loop pause',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => constructionLoopPauseCommand({
        reason: opts.reason as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        cwd: opts.cwd as string | undefined,
      }),
    }));

  constructionLoopCmd
    .command('resume')
    .description('Resume the construction loop')
    .option('--format <format>', 'Output format: json, human, or auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'construction-loop resume',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => constructionLoopResumeCommand({
        format: resolveCommandFormat(opts.format, 'auto'),
        cwd: opts.cwd as string | undefined,
      }),
    }));

  constructionLoopCmd
    .command('metrics')
    .description('Show construction loop auto-promotion metrics')
    .option('--format <format>', 'Output format: json, human, or auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'construction-loop metrics',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => constructionLoopMetricsCommand({
        format: resolveCommandFormat(opts.format, 'auto'),
        cwd: opts.cwd as string | undefined,
      }),
    }));
}
