import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import { workNextCommand } from './work-next.js';

export interface ResumeOptions {
  agent?: string;
  cwd?: string;
  withTool?: string;
  format?: CliFormat;
}

interface CommandEnvelope {
  exitCode: ExitCode;
  result: unknown;
}

function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

function dirtyFiles(cwd: string): string[] {
  const raw = git(cwd, ['status', '--porcelain']);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).slice(0, 10);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function toolHydration(tool: string | undefined, cwd: string, agent: string): Record<string, unknown> | null {
  if (!tool) return null;
  if (tool !== 'codex') {
    return {
      status: 'unsupported',
      tool,
      note: 'Resume brief produced; no tool process was launched.',
    };
  }
  return {
    status: 'advisory',
    tool,
    command: `cd ${JSON.stringify(cwd)} && codex`,
    note: `Hydrate ${agent} after reading the resume brief; this command is advisory and was not launched.`,
  };
}

function formatHuman(result: Record<string, unknown>): string {
  const repo = asRecord(result.repo);
  const work = asRecord(result.next_work);
  const hydration = result.tool_hydration ? asRecord(result.tool_hydration) : null;
  const lines = [
    'Resume brief',
    `Agent: ${String(result.agent_id)}`,
    `CWD: ${String(result.cwd)}`,
    `Repo: ${String(repo.repo_root ?? 'unknown')}`,
    `Branch: ${String(repo.branch ?? 'unknown')}`,
    `HEAD: ${String(repo.head_commit ?? 'unknown')}`,
    `Dirty: ${String(repo.dirty_count ?? 0)}`,
    `Next work: ${String(work.action_kind ?? work.status ?? 'unknown')}`,
  ];
  if (work.primary) {
    const primary = asRecord(work.primary);
    if (primary.task_number) lines.push(`Task: ${String(primary.task_number)}`);
    if (primary.envelope_id) lines.push(`Envelope: ${String(primary.envelope_id)}`);
  }
  if (result.next_action) lines.push(`Next action: ${String(result.next_action)}`);
  if (hydration) {
    lines.push(`Tool hydration: ${String(hydration.status)} ${String(hydration.tool ?? '')}`.trim());
    if (hydration.command) lines.push(`Tool command: ${String(hydration.command)}`);
  }
  return lines.join('\n');
}

export async function resumeCommand(options: ResumeOptions): Promise<CommandEnvelope> {
  if (!options.agent) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: '--agent is required' },
    };
  }

  const cwd = resolve(options.cwd ?? process.cwd());
  const repoRoot = git(cwd, ['rev-parse', '--show-toplevel']);
  const gitCwd = repoRoot ?? cwd;
  const dirty = repoRoot ? dirtyFiles(gitCwd) : [];
  const nextWork = await workNextCommand({
    agent: options.agent,
    cwd,
    peek: true,
    format: 'json',
  });
  const nextWorkRecord = asRecord(nextWork.result);
  const result = {
    status: nextWork.exitCode === ExitCode.SUCCESS ? 'success' : 'attention_required',
    agent_id: options.agent,
    cwd,
    locus: {
      kind: repoRoot ? 'git_worktree' : 'filesystem',
      authority_note: 'Resume recovers inhabited work from durable traces; it does not resume a tool process.',
    },
    repo: {
      repo_root: repoRoot,
      branch: repoRoot ? git(gitCwd, ['rev-parse', '--abbrev-ref', 'HEAD']) : null,
      head_commit: repoRoot ? git(gitCwd, ['rev-parse', 'HEAD']) : null,
      upstream: repoRoot ? git(gitCwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']) : null,
      dirty_count: dirty.length,
      dirty_files: dirty,
      dirty_truncated: dirty.length === 10,
    },
    next_work: nextWorkRecord,
    next_action: nextWorkRecord.next_step ?? 'Inspect the resume brief and choose the next governed action.',
    tool_hydration: toolHydration(options.withTool, cwd, options.agent),
  };

  return {
    exitCode: nextWork.exitCode,
    result: formattedResult(result, formatHuman(result), options.format ?? 'auto'),
  };
}
