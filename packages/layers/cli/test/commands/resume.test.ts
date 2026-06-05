import { vi } from 'vitest';

vi.unmock('node:child_process');
vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inboxShowCommand, inboxSubmitCommand } from '../../src/commands/inbox.js';
import { resumeCommand } from '../../src/commands/resume.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';

function setupRepo(tempDir: string): void {
  execFileSync('git', ['init', '-b', 'main'], { cwd: tempDir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tempDir });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: tempDir });
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
  const roster = {
    version: 2,
    schema: 'https://narada.dev/schemas/agent-roster/v2',
    updated_at: '2026-01-01T00:00:00Z',
    agents: [{
      agent_id: 'architect',
      role: 'architect',
      capabilities: ['claim', 'execute', 'review'],
      first_seen_at: '2026-01-01T00:00:00Z',
      last_active_at: '2026-01-01T00:00:00Z',
      status: 'idle',
      task: null,
      last_done: null,
      updated_at: '2026-01-01T00:00:00Z',
    }],
  };
  writeFileSync(join(tempDir, '.ai', 'agents', 'roster.json'), JSON.stringify(roster, null, 2));
  const store = openTaskLifecycleStore(tempDir);
  try {
    store.upsertRosterEntry({
      agent_id: 'architect',
      role: 'architect',
      capabilities_json: JSON.stringify(['claim', 'execute', 'review']),
      first_seen_at: '2026-01-01T00:00:00Z',
      last_active_at: '2026-01-01T00:00:00Z',
      status: 'idle',
      task_number: null,
      last_done: null,
      updated_at: '2026-01-01T00:00:00Z',
    });
  } finally {
    store.db.close();
  }
  writeFileSync(join(tempDir, 'README.md'), '# test\n');
  writeFileSync(join(tempDir, 'AGENTS.md'), '# Agent instructions\n');
  execFileSync('git', ['add', '.'], { cwd: tempDir });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: tempDir, stdio: 'ignore' });
}

describe('resume continuity brief', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-resume-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns a read-only continuity brief without claiming inbox work', async () => {
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      sourceKind: 'user_chat',
      sourceRef: 'chat:resume',
      kind: 'observation',
      authorityLevel: 'user_statement',
      principal: 'operator',
      payload: '{"title":"Resume me"}',
      format: 'json',
    });
    const envelopeId = (submitted.result as { envelope: { envelope_id: string } }).envelope.envelope_id;

    const result = await resumeCommand({ agent: 'architect', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const resume = result.result as {
      status: string;
      agent_id: string;
      locus: { kind: string };
      repo: { repo_root: string; branch: string; dirty_count: number; dirty_summary: { count: number; categories: Record<string, number> } };
      inbox: { received: number; handling: number; pending: number; next: { envelope_id: string } | null };
      next_work: { action_kind: string; primary: { envelope_id?: string } | null };
      tool_hydration: unknown;
    };
    expect(resume.status).toBe('success');
    expect(resume.agent_id).toBe('architect');
    expect(resume.locus.kind).toBe('git_worktree');
    expect(resume.repo.repo_root).toBe(tempDir.replaceAll('\\', '/'));
    expect(resume.repo.branch).toBe('main');
    expect(resume.repo.dirty_count).toEqual(expect.any(Number));
    expect(resume.repo.dirty_summary.count).toEqual(expect.any(Number));
    expect(resume.repo.dirty_summary.categories).toEqual(expect.any(Object));
    expect(resume.inbox).toMatchObject({ received: 1, handling: 0, pending: 0 });
    expect(resume.inbox.next?.envelope_id).toBe(envelopeId);
    expect(resume.next_work.action_kind).toBe('inbox_work');
    expect(resume.next_work.primary?.envelope_id).toBe(envelopeId);
    expect(resume.tool_hydration).toBeNull();

    const shown = await inboxShowCommand({ cwd: tempDir, envelopeId, format: 'json' });
    expect((shown.result as { envelope: { status: string } }).envelope.status).toBe('received');
  });

  it('summarizes dirty repo state without dumping unbounded file lists', async () => {
    writeFileSync(join(tempDir, 'README.md'), '# changed\n');
    writeFileSync(join(tempDir, 'new-file.txt'), 'new\n');

    const result = await resumeCommand({ agent: 'architect', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      repo: {
        dirty_summary: {
          count: 2,
          categories: {
            modified: 1,
            untracked: 1,
          },
          truncated: false,
        },
      },
    });
  });

  it('reports current task work without claiming additional work', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'agents', 'roster.json'),
      JSON.stringify({
        version: 2,
        schema: 'https://narada.dev/schemas/agent-roster/v2',
        updated_at: '2026-01-01T00:00:00Z',
        agents: [{
          agent_id: 'architect',
          role: 'architect',
          capabilities: ['claim', 'execute', 'review'],
          first_seen_at: '2026-01-01T00:00:00Z',
          last_active_at: '2026-01-01T00:00:00Z',
          status: 'working',
          task: 100,
          last_done: null,
          updated_at: '2026-01-01T00:00:00Z',
        }],
      }, null, 2),
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-100-current.md'),
      '---\ntask_id: 100\nstatus: claimed\n---\n\n# Current Task\n\n## Acceptance Criteria\n- [x] Current work\n',
    );
    const store = openTaskLifecycleStore(tempDir);
    try {
      store.upsertLifecycle({
        task_id: '20260420-100-current',
        task_number: 100,
        status: 'claimed',
        governed_by: 'architect',
        closed_at: null,
        closed_by: null,
        closure_mode: null,
        relative_priority: null,
        priority_reason: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-01-01T00:00:00Z',
      });
      store.insertAssignment({
        assignment_id: 'assign-20260420-100-current-architect',
        task_id: '20260420-100-current',
        agent_id: 'architect',
        claimed_at: '2026-01-01T00:00:00Z',
        released_at: null,
        release_reason: null,
        intent: 'primary',
      });
      store.upsertRosterEntry({
        agent_id: 'architect',
        role: 'architect',
        capabilities_json: JSON.stringify(['claim', 'execute', 'review']),
        first_seen_at: '2026-01-01T00:00:00Z',
        last_active_at: '2026-01-01T00:00:00Z',
        status: 'working',
        task_number: 100,
        last_done: null,
        updated_at: '2026-01-01T00:00:00Z',
      });
    } finally {
      store.db.close();
    }

    const result = await resumeCommand({ agent: 'architect', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      tasks: {
        current: {
          task_number: 100,
          current: true,
        },
      },
      next_work: {
        action_kind: 'task_work',
        primary: {
          task_number: 100,
        },
      },
    });
  });
  it('keeps codex hydration advisory and separate from continuity recovery', async () => {
    const result = await resumeCommand({ agent: 'architect', cwd: tempDir, withTool: 'codex', format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      tool_hydration: {
        status: 'advisory',
        tool: 'codex',
        command: expect.stringContaining('codex'),
      },
    });
  });

  it('routes explicit tool hydration execution through CEIZ policy', async () => {
    const result = await resumeCommand({
      agent: 'architect',
      cwd: tempDir,
      withTool: 'codex',
      executeTool: true,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      tool_hydration: {
        execution_requested: true,
        ceiz: {
          status: 'blocked_by_policy',
          run: {
            requester_id: 'architect',
            side_effect_class: 'process_control',
            output_admission_profile: 'bounded_excerpt',
            status: 'blocked_by_policy',
            command_argv: ['codex'],
          },
        },
      },
    });

    const store = openTaskLifecycleStore(tempDir);
    try {
      const runs = store.listCommandRuns(10, null, 'architect');
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({
        requester_id: 'architect',
        side_effect_class: 'process_control',
        status: 'blocked_by_policy',
      });
      expect(runs[0]?.rationale).toContain('AGENTS.md');
    } finally {
      store.db.close();
    }
  });

  it('refuses explicit tool hydration when locus is ambiguous', async () => {
    const noRepo = mkdtempSync(join(tmpdir(), 'narada-resume-no-locus-'));
    try {
      const result = await resumeCommand({
        agent: 'architect',
        cwd: noRepo,
        withTool: 'codex',
        executeTool: true,
        format: 'json',
      });

      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      expect(result.result).toMatchObject({
        reason: 'ambiguous_locus',
      });
    } finally {
      rmSync(noRepo, { recursive: true, force: true });
    }
  });

  it('writes a bounded resume handoff artifact with stable digest', async () => {
    const first = await resumeCommand({
      agent: 'architect',
      cwd: tempDir,
      writeHandoff: true,
      format: 'json',
    });
    const second = await resumeCommand({
      agent: 'architect',
      cwd: tempDir,
      writeHandoff: true,
      format: 'json',
    });

    expect(first.exitCode).toBe(ExitCode.SUCCESS);
    expect(second.exitCode).toBe(ExitCode.SUCCESS);
    const firstHandoff = (first.result as { handoff: { path: string; brief_digest: string; read_only_input: boolean } }).handoff;
    const secondHandoff = (second.result as { handoff: { path: string; brief_digest: string } }).handoff;
    expect(firstHandoff.brief_digest).toBe(secondHandoff.brief_digest);
    expect(firstHandoff.path).toBe(secondHandoff.path);
    expect(firstHandoff.read_only_input).toBe(true);
    expect(existsSync(firstHandoff.path)).toBe(true);

    const artifact = JSON.parse(readFileSync(firstHandoff.path, 'utf8')) as {
      schema: string;
      brief_digest: string;
      source_command: string[];
      read_only_input: boolean;
      brief: { agent_id: string; next_action: string };
    };
    expect(artifact.schema).toBe('https://narada.dev/schemas/resume-handoff/v1');
    expect(artifact.brief_digest).toBe(firstHandoff.brief_digest);
    expect(artifact.source_command).toContain('--write-handoff');
    expect(artifact.read_only_input).toBe(true);
    expect(artifact.brief.agent_id).toBe('architect');
  });
});
