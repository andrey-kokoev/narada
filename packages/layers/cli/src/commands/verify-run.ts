/**
 * narada verify run --cmd "<command>"
 *
 * Diagnostic path: runs a verification command directly without creating
 * a durable Testing Intent Zone record.
 *
 * For canonical task verification, use `narada test-run run` instead.
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { ExitCode } from '../lib/exit-codes.js';
import type { CommandContext } from '../lib/command-wrapper.js';
import { checkCommandPolicy, classifyCommandScope } from '../lib/verify-policy.js';

export interface VerifyRunOptions {
  cmd?: string;
  format?: string;
  cwd?: string;
  allowMultiFile?: boolean;
  allowPackage?: boolean;
  allowFullSuite?: boolean;
}

function findRepoRoot(startDir: string): string {
  let dir = resolve(startDir);
  for (let i = 0; i < 10; i++) {
    const parent = dirname(dir);
    if (parent === dir) break;
    if (existsSync(resolve(parent, 'pnpm-workspace.yaml'))) {
      return parent;
    }
    dir = parent;
  }
  return startDir;
}

export async function verifyRunCommand(
  options: VerifyRunOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const command = options.cmd?.trim();
  if (!command) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: 'No command provided. Use --cmd "<command>"',
      },
    };
  }

  const policy = checkCommandPolicy(command, {
    allowMultiFile: options.allowMultiFile,
    allowPackage: options.allowPackage,
    allowFullSuite: options.allowFullSuite,
  });

  if (!policy.allowed) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Policy violation: ${policy.reason}`,
        command,
        scope: policy.scope,
      },
    };
  }

  const scope = classifyCommandScope(command);
  const cwd = options.cwd ? options.cwd : process.cwd();
  const repoRoot = findRepoRoot(cwd);

  try {
    if (scope === 'verify') {
      execSync('pnpm verify', { cwd: repoRoot, stdio: 'inherit' });
      return {
        exitCode: ExitCode.SUCCESS,
        result: { status: 'ok', command, scope, routed_through: 'pnpm verify' },
      };
    }

    // Focused test command: route through pnpm test:focused
    execSync(`pnpm test:focused "${command}"`, { cwd: repoRoot, stdio: 'inherit' });
    return {
      exitCode: ExitCode.SUCCESS,
      result: { status: 'ok', command, scope, routed_through: 'pnpm test:focused' },
    };
  } catch (err: any) {
    const exitStatus = err.status ?? 1;
    return {
      exitCode: exitStatus === 0 ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
      result: {
        status: exitStatus === 0 ? 'ok' : 'error',
        command,
        scope,
        exitStatus,
        error: err.message,
      },
    };
  }
}
