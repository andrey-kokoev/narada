/**
 * Chapter preflight inspection operator.
 *
 * Read-only checks for chapter-level crossings that are easy to discover too late,
 * especially repository publication authority.
 */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { formattedResult } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import { scanTasksByRange } from '../lib/task-governance.js';

const execFileAsync = promisify(execFile);

export interface ChapterPreflightOptions {
  range: string;
  cwd?: string;
  expectCommit?: boolean;
  expectPush?: boolean;
  format?: 'json' | 'human' | 'auto';
}

export type ChapterPreflightCheckStatus = 'pass' | 'warn' | 'fail';

export interface ChapterPreflightCheck {
  name: string;
  status: ChapterPreflightCheckStatus;
  message: string;
  remediation?: string;
}

interface ParsedRange {
  start: number;
  end: number;
}

function parseRange(range: string): ParsedRange | null {
  const singleMatch = range.match(/^(\d+)$/);
  if (singleMatch) {
    const n = Number(singleMatch[1]);
    return { start: n, end: n };
  }
  const rangeMatch = range.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    if (start <= end) return { start, end };
  }
  return null;
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, windowsHide: true });
  return stdout.trim();
}

async function checkGitMetadataWritable(gitDir: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const probePath = resolve(gitDir, `.narada-preflight-${process.pid}-${randomUUID()}`);
  try {
    await writeFile(probePath, 'preflight\n', { flag: 'wx' });
    await unlink(probePath);
    return { ok: true };
  } catch (error) {
    try {
      await unlink(probePath);
    } catch {
      // Best-effort cleanup; original failure is the useful signal.
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function formatPreflightHuman(options: {
  range: string;
  ready: boolean;
  checks: ChapterPreflightCheck[];
}): string {
  const lines = [
    `Chapter preflight: ${options.range}`,
    `Ready: ${options.ready ? 'yes' : 'no'}`,
    '',
    'Checks:',
  ];
  for (const check of options.checks) {
    lines.push(`- ${check.status.toUpperCase()} ${check.name}: ${check.message}`);
    if (check.remediation) lines.push(`  Remediation: ${check.remediation}`);
  }
  return lines.join('\n');
}

export async function chapterPreflightCommand(
  options: ChapterPreflightOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const format = options.format ?? 'auto';
  const parsed = parseRange(options.range);

  if (!parsed) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Invalid range format: ${options.range}. Expected NNN or NNN-MMM.` },
    };
  }

  const checks: ChapterPreflightCheck[] = [];
  const expectedCount = parsed.end - parsed.start + 1;
  const tasks = await scanTasksByRange(cwd, parsed.start, parsed.end);

  if (tasks.length === expectedCount) {
    checks.push({
      name: 'chapter_tasks_present',
      status: 'pass',
      message: `${tasks.length}/${expectedCount} task(s) found`,
    });
  } else {
    checks.push({
      name: 'chapter_tasks_present',
      status: 'fail',
      message: `${tasks.length}/${expectedCount} task(s) found`,
      remediation: 'Create the missing task artifacts before executing the chapter.',
    });
  }

  const shouldCheckGit = options.expectCommit || options.expectPush;
  if (shouldCheckGit) {
    let gitDir: string | null = null;
    try {
      const inside = await runGit(cwd, ['rev-parse', '--is-inside-work-tree']);
      if (inside === 'true') {
        checks.push({ name: 'git_work_tree', status: 'pass', message: 'cwd is inside a Git work tree' });
      } else {
        checks.push({
          name: 'git_work_tree',
          status: 'fail',
          message: 'cwd is not inside a Git work tree',
          remediation: 'Run from a repository checkout before committing chapter work.',
        });
      }
      gitDir = await runGit(cwd, ['rev-parse', '--absolute-git-dir']);
    } catch (error) {
      checks.push({
        name: 'git_work_tree',
        status: 'fail',
        message: error instanceof Error ? error.message : String(error),
        remediation: 'Run from a repository checkout before committing chapter work.',
      });
    }

    if (gitDir) {
      try {
        await access(gitDir);
        const writable = await checkGitMetadataWritable(gitDir);
        if (writable.ok) {
          checks.push({ name: 'git_metadata_writable', status: 'pass', message: `Git metadata is writable: ${gitDir}` });
        } else {
          checks.push({
            name: 'git_metadata_writable',
            status: 'fail',
            message: writable.error,
            remediation: 'Restore write access to Git metadata before the chapter reaches commit/push.',
          });
        }
      } catch (error) {
        checks.push({
          name: 'git_metadata_writable',
          status: 'fail',
          message: error instanceof Error ? error.message : String(error),
          remediation: 'Restore readable and writable Git metadata before committing chapter work.',
        });
      }
    }
  }

  if (options.expectPush) {
    try {
      const upstream = await runGit(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
      checks.push({ name: 'git_upstream', status: 'pass', message: `Current branch tracks ${upstream}` });
    } catch (error) {
      checks.push({
        name: 'git_upstream',
        status: 'fail',
        message: error instanceof Error ? error.message : String(error),
        remediation: 'Set an upstream branch before relying on chapter push completion.',
      });
    }
  }

  const failed = checks.filter((check) => check.status === 'fail');
  const result = {
    status: failed.length === 0 ? 'success' : 'blocked',
    range: `${parsed.start}-${parsed.end}`,
    ready: failed.length === 0,
    expect_commit: Boolean(options.expectCommit),
    expect_push: Boolean(options.expectPush),
    checks,
  };

  return {
    exitCode: failed.length === 0 ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
    result: formattedResult(
      result,
      formatPreflightHuman({ range: result.range, ready: result.ready, checks }),
      format,
    ),
  };
}
