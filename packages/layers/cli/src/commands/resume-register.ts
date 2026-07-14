import type { Command } from 'commander';
import {directCommandAction, type CommanderOptionValues} from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';
import { resumeCommand } from './resume.js';

export function registerResumeCommands(program: Command): void {
  program
    .command('resume')
    .description('Read-only inhabited continuity brief for an agent')
    .requiredOption('--agent <id>', 'Agent ID')
    .option('--with <tool>', 'Advisory tool hydration target, e.g. codex')
    .option('--execute-tool', 'Request tool hydration through CEIZ instead of returning only advisory text', false)
    .option('--write-handoff', 'Write a bounded resume handoff artifact', false)
    .option('--handoff-dir <path>', 'Resume handoff artifact directory', '.ai/resume-handoffs')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'resume',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => resumeCommand({
        agent: opts.agent as string | undefined,
        cwd: opts.cwd as string | undefined,
        withTool: opts.with as string | undefined,
        executeTool: opts.executeTool as boolean | undefined,
        writeHandoff: opts.writeHandoff as boolean | undefined,
        handoffDir: opts.handoffDir as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));
}
