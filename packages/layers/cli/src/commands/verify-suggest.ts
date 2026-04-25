/**
 * narada verify suggest --files <file...>
 *
 * Maps changed files to the smallest likely useful verification command.
 */

import { ExitCode } from '../lib/exit-codes.js';
import type { CommandContext } from '../lib/command-wrapper.js';
import { suggestVerification } from '../lib/file-to-test-mapper.js';
import { checkCommandPolicy, classifyCommandScope } from '../lib/verify-policy.js';

export interface VerifySuggestOptions {
  files?: string[];
  format?: string;
  cwd?: string;
}

export async function verifySuggestCommand(
  options: VerifySuggestOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? options.cwd : process.cwd();
  const files = options.files ?? [];

  if (files.length === 0) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: 'No files provided. Use --files <path> [<path>...]',
      },
    };
  }

  const suggestion = suggestVerification(files, cwd);
  const policy = checkCommandPolicy(suggestion.command);

  const result = {
    status: 'ok',
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
    mapped_files: suggestion.mappedFiles,
    next_steps: [
      ...(policy.allowed
        ? [`Run: narada test-run run --cmd "${suggestion.command}"`]
        : [`Policy blocks this command: ${policy.reason}`, 'Add override env vars or use a narrower command.']),
    ],
  };

  return { exitCode: ExitCode.SUCCESS, result };
}
