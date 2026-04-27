import type { Command } from 'commander';
import { directCommandAction } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';
import { resumeCommand } from './resume.js';

export function registerResumeCommands(program: Command): void {
  program
    .command('resume')
    .description('Read-only inhabited continuity brief for an agent')
    .requiredOption('--agent <id>', 'Agent ID')
    .option('--with <tool>', 'Advisory tool hydration target, e.g. codex')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'resume',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => resumeCommand({
        agent: opts.agent as string | undefined,
        cwd: opts.cwd as string | undefined,
        withTool: opts.with as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));
}
