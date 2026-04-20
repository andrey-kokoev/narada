/**
 * narada verify explain --task <task-number>
 *
 * Reports recent verification related to files likely touched by a task.
 * If no files can be inferred from the task content, says so clearly.
 */

import { resolve } from 'node:path';
import { ExitCode } from '../lib/exit-codes.js';
import type { CommandContext } from '../lib/command-wrapper.js';
import { findTaskFile, readTaskFile } from '../lib/task-governance.js';
import { suggestVerification } from '../lib/file-to-test-mapper.js';
import { getCommandHistory, loadVerificationHistory } from '../lib/verification-state.js';
import { checkCommandPolicy } from '../lib/verify-policy.js';

export interface VerifyExplainOptions {
  taskNumber?: string;
  format?: string;
  cwd?: string;
}

/**
 * Extract likely source file paths from task markdown content.
 */
function extractFilePaths(content: string): string[] {
  const patterns = [
    // Backtick-quoted paths: `packages/layers/cli/src/commands/foo.ts`
    /`([^`]*packages\/[^`]+\.(?:ts|tsx|js|jsx|md|json))`/g,
    // Bare paths starting with packages/ or src/
    /(?:^|\s)(packages\/[\w\/\-\.]+\.(?:ts|tsx|js|jsx|md|json))\b/g,
    /(?:^|\s)(src\/[\w\/\-\.]+\.(?:ts|tsx|js|jsx))\b/g,
    // Test file references
    /(?:^|\s)([\w\/\-\.]+\.(?:test|spec)\.[cm]?[tj]sx?)\b/g,
  ];

  const found = new Set<string>();
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const path = match[1];
      if (path && !path.includes('node_modules')) {
        found.add(path);
      }
    }
  }

  return [...found];
}

export async function verifyExplainCommand(
  options: VerifyExplainOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const taskNumber = options.taskNumber;
  if (!taskNumber) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'Task number is required. Use --task <number>' },
    };
  }

  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();

  const taskFile = await findTaskFile(cwd, taskNumber);
  if (!taskFile) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Task ${taskNumber} not found` },
    };
  }

  const { body } = await readTaskFile(taskFile.path);
  const inferredFiles = extractFilePaths(body);

  if (inferredFiles.length === 0) {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'ok',
        task_id: taskFile.taskId,
        inference: 'none',
        message: 'Could not infer touched files from task content. No file paths found in task description.',
        suggestion: {
          command: 'pnpm verify',
          explanation: 'Run baseline verification since focused inference is not possible.',
        },
      },
    };
  }

  const suggestion = suggestVerification(inferredFiles, cwd);
  const policy = checkCommandPolicy(suggestion.command);

  // Load recent verification history for the inferred files / suggested command
  const history = loadVerificationHistory(cwd);
  const relatedRuns = history
    .filter((r) => {
      // Match if the run command touches any of the inferred files
      return inferredFiles.some((f) => r.command.includes(f));
    })
    .slice(-5);

  const suggestedCommandHistory = getCommandHistory(cwd, suggestion.command).slice(-3);

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'ok',
      task_id: taskFile.taskId,
      inference: 'derived',
      inferred_files: inferredFiles,
      suggestion: {
        command: suggestion.command,
        scope: suggestion.scope,
        confidence: suggestion.confidence,
        explanation: suggestion.explanation,
        policy: {
          allowed: policy.allowed,
          reason: policy.reason,
        },
      },
      recent_related_runs: relatedRuns.map((r) => ({
        command: r.command,
        duration_sec: (r.durationMs / 1000).toFixed(1),
        classification: r.classification,
        freshness: r.freshness,
        finished_at: r.finishedAt,
      })),
      suggested_command_history: suggestedCommandHistory.map((r) => ({
        duration_sec: (r.durationMs / 1000).toFixed(1),
        classification: r.classification,
        freshness: r.freshness,
        finished_at: r.finishedAt,
      })),
      next_steps: [
        ...(policy.allowed
          ? [`Run: narada verify run --cmd "${suggestion.command}"`]
          : [`Policy blocks: ${policy.reason}`]),
      ],
    },
  };
}
