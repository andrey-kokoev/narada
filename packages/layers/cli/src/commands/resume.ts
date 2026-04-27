import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { SqliteInboxStore, type InboxEnvelope } from '@narada2/control-plane';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import { openTaskLifecycleStore } from '../lib/task-lifecycle-store.js';
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

function dirtySummary(cwd: string): Record<string, unknown> {
  const raw = git(cwd, ['status', '--porcelain']);
  const lines = raw ? raw.split('\n').filter(Boolean) : [];
  const categories: Record<string, number> = {};
  for (const line of lines) {
    const status = line.slice(0, 2);
    const key = status.includes('?')
      ? 'untracked'
      : status.includes('M')
        ? 'modified'
        : status.includes('A')
          ? 'added'
          : status.includes('D')
            ? 'deleted'
            : 'other';
    categories[key] = (categories[key] ?? 0) + 1;
  }
  return {
    count: lines.length,
    categories,
    files: lines.slice(0, 10),
    truncated: lines.length > 10,
  };
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
  const inbox = asRecord(result.inbox);
  const tasks = asRecord(result.tasks);
  const hydration = result.tool_hydration ? asRecord(result.tool_hydration) : null;
  const lines = [
    'Resume brief',
    `Agent: ${String(result.agent_id)}`,
    `CWD: ${String(result.cwd)}`,
    `Repo: ${String(repo.repo_root ?? 'unknown')}`,
    `Branch: ${String(repo.branch ?? 'unknown')}`,
    `HEAD: ${String(repo.head_commit ?? 'unknown')}`,
    `Dirty: ${String(repo.dirty_count ?? 0)}`,
    `Unpushed: ${String(repo.unpushed_commits ?? 'unknown')}`,
    `Inbox: received=${String(inbox.received ?? 0)} handling=${String(inbox.handling ?? 0)} pending=${String(inbox.pending ?? 0)}`,
    `Current task: ${String(asRecord(tasks.current).task_number ?? 'none')}`,
    `Review work: ${String(asRecord(tasks.open_review).task_number ?? 'none')}`,
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

function inboxSummary(cwd: string): Record<string, unknown> {
  const store = new SqliteInboxStore(join(cwd, '.ai', 'inbox.db'));
  try {
    const envelopes = store.list({ limit: 200 });
    const received = envelopes.filter((envelope) => envelope.status === 'received');
    const handling = envelopes.filter((envelope) => envelope.status === 'handling');
    const pending = envelopes.filter((envelope) => envelope.promotion?.enactment_status === 'pending');
    const next = received[0] ?? null;
    return {
      received: received.length,
      handling: handling.length,
      pending: pending.length,
      next: next ? summarizeEnvelope(next) : null,
    };
  } finally {
    store.close();
  }
}

function summarizeEnvelope(envelope: InboxEnvelope): Record<string, unknown> {
  return {
    envelope_id: envelope.envelope_id,
    status: envelope.status,
    kind: envelope.kind,
    source: `${envelope.source.kind}:${envelope.source.ref}`,
    title: envelope.payload && typeof envelope.payload === 'object' && !Array.isArray(envelope.payload)
      ? stringField(envelope.payload as Record<string, unknown>, 'title')
      : null,
  };
}

function taskTraceSummary(cwd: string, nextWork: Record<string, unknown>): Record<string, unknown> {
  const primary = asRecord(nextWork.primary);
  const checked = Array.isArray(nextWork.checked) ? nextWork.checked.map(asRecord) : [];
  const reviewSelected = checked.find((entry) => entry.zone === 'review_work' && entry.status === 'selected');
  const store = openTaskLifecycleStore(cwd);
  try {
    const recentClosed = store
      .getAllLifecycle()
      .filter((row) => row.status === 'closed' || row.status === 'confirmed')
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 5)
      .map((row) => ({
        task_id: row.task_id,
        task_number: row.task_number,
        status: row.status,
        updated_at: row.updated_at,
        governed_by: row.governed_by,
      }));
    return {
      current: nextWork.action_kind === 'task_work' ? primary : null,
      open_review: reviewSelected?.selected_ref ? { ref: reviewSelected.selected_ref } : null,
      recent_closed: recentClosed,
    };
  } finally {
    store.db.close();
  }
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  return typeof record[key] === 'string' ? String(record[key]) : null;
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
  const dirtyDetails = repoRoot ? dirtySummary(gitCwd) : { count: 0, categories: {}, files: [], truncated: false };
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
      unpushed_commits: repoRoot ? Number(git(gitCwd, ['rev-list', '--count', '@{u}..HEAD']) ?? 0) : null,
      dirty_count: dirty.length,
      dirty_files: dirty,
      dirty_truncated: dirty.length === 10,
      dirty_summary: dirtyDetails,
    },
    tasks: taskTraceSummary(cwd, nextWorkRecord),
    inbox: inboxSummary(cwd),
    next_work: nextWorkRecord,
    next_action: nextWorkRecord.next_step ?? 'Inspect the resume brief and choose the next governed action.',
    tool_hydration: toolHydration(options.withTool, cwd, options.agent),
  };

  return {
    exitCode: nextWork.exitCode,
    result: formattedResult(result, formatHuman(result), options.format ?? 'auto'),
  };
}
