import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { discoverNarsSessions } from '@narada2/nars-session-core/session-index';
import { workspaceLaunchRecoveryCommand } from '../../src/commands/workspace-launch-recovery.js';
import {
  createWorkspaceLaunchExecutionAttempt,
  listWorkspaceLaunchExecutionAttempts,
  readWorkspaceLaunchExecutionAttempt,
  writeWorkspaceLaunchExecutionAttempt,
  updateWorkspaceLaunchExecutionAttempt,
  workspaceLaunchExecutionAttemptPath,
} from '../../src/commands/workspace-launch-execution-attempt-store.js';

vi.mock('@narada2/nars-session-core/session-index', () => ({
  discoverNarsSessions: vi.fn(),
}));

describe('workspace launch execution attempts', () => {
  it('survives a process restart boundary through an atomic user-site record', async () => {
    const root = await mkdtemp('/tmp/workspace-launch-attempt-');
    const previous = process.env.NARADA_USER_SITE_ROOT;
    process.env.NARADA_USER_SITE_ROOT = root;
    try {
      const attempt = await createWorkspaceLaunchExecutionAttempt({
        site: ['sonar'],
        role: ['resident'],
        operatorSurface: 'agent-web-ui',
        runtime: 'narada-agent-runtime-server',
        intelligenceProvider: 'codex-subscription',
      }, ['D:/registry/agents.psd1']);
      expect(attempt.state).toBe('queued');

      await updateWorkspaceLaunchExecutionAttempt(attempt, 'launching', {
        processes: [{
          posture: 'agent_runtime_server',
          execution_authority: 'structured_argv',
          command: 'node',
          args: ['runtime.js'],
          cwd: 'D:/code/narada',
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
          pid: 1234,
          owner_ref: attempt.launch_attempt_id,
          agent_id: 'sonar.resident',
          launch_session_id: 'launch-1',
        }],
      });
      await updateWorkspaceLaunchExecutionAttempt(attempt, 'recoverable', {
        failure: {
          reason_code: 'workspace_launch_session_attachment_failed',
          message: 'runtime remained unavailable',
          required_next_step: 'run workspace-recover',
        },
      });

      const persistedPath = workspaceLaunchExecutionAttemptPath(attempt.launch_attempt_id);
      const reloaded = await readWorkspaceLaunchExecutionAttempt(persistedPath);
      expect(reloaded).toMatchObject({
        launch_attempt_id: attempt.launch_attempt_id,
        state: 'recoverable',
        history: ['queued', 'launching', 'recoverable'],
        processes: [{ launch_session_id: 'launch-1', owner_ref: attempt.launch_attempt_id }],
      });
      expect(await listWorkspaceLaunchExecutionAttempts()).toEqual([
        expect.objectContaining({ launch_attempt_id: attempt.launch_attempt_id, state: 'recoverable' }),
      ]);

      const files = await readdir(dirname(persistedPath));
      expect(files.some((file) => file.endsWith('.tmp'))).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.NARADA_USER_SITE_ROOT;
      else process.env.NARADA_USER_SITE_ROOT = previous;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps recovery recoverable when the exact session is absent from the index', async () => {
    const root = await mkdtemp('/tmp/workspace-launch-recovery-');
    const previous = process.env.NARADA_USER_SITE_ROOT;
    process.env.NARADA_USER_SITE_ROOT = root;
    try {
      const attempt = await createWorkspaceLaunchExecutionAttempt({
        site: ['sonar'],
        role: ['resident'],
        operatorSurface: 'agent-web-ui',
        runtime: 'narada-agent-runtime-server',
      }, []);
      await updateWorkspaceLaunchExecutionAttempt(attempt, 'launching', {
        lease: {
          lease_id: 'test-lease',
          owner_pid: null,
          acquired_at: new Date(0).toISOString(),
          heartbeat_at: new Date(0).toISOString(),
          expires_at: new Date(0).toISOString(),
        },
        bindings: [{
          agent: 'sonar.resident',
          site: 'sonar',
          site_root: 'D:/code/site',
          launch_session_id: 'launch-1',
          owner_ref: attempt.launch_attempt_id,
        }],
      });
      vi.mocked(discoverNarsSessions).mockReturnValue({ sessions: [] } as never);

      const recovery = await workspaceLaunchRecoveryCommand({
        attempt: [attempt.launch_attempt_id],
        format: 'json',
      });

      expect(recovery.exitCode).not.toBe(0);
      expect(recovery.result).toMatchObject({
        schema: 'narada.workspace_launch.recovery.v1',
        status: 'partial',
        attempts: [{
          launch_attempt_id: attempt.launch_attempt_id,
          status: 'recoverable',
          sessions: [{ reason_code: 'exact_session_not_indexed', status: 'recoverable' }],
        }],
      });
      expect(await readWorkspaceLaunchExecutionAttempt(workspaceLaunchExecutionAttemptPath(attempt.launch_attempt_id)))
        .toMatchObject({ state: 'recoverable' });
    } finally {
      vi.mocked(discoverNarsSessions).mockReset();
      if (previous === undefined) delete process.env.NARADA_USER_SITE_ROOT;
      else process.env.NARADA_USER_SITE_ROOT = previous;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps recovery recoverable when exact session cleanup is not admitted', async () => {
    const root = await mkdtemp('/tmp/workspace-launch-recovery-refusal-');
    const previous = process.env.NARADA_USER_SITE_ROOT;
    process.env.NARADA_USER_SITE_ROOT = root;
    try {
      const attempt = await createWorkspaceLaunchExecutionAttempt({
        site: ['sonar'],
        role: ['resident'],
        operatorSurface: 'agent-web-ui',
        runtime: 'narada-agent-runtime-server',
      }, []);
      await updateWorkspaceLaunchExecutionAttempt(attempt, 'launching', {
        lease: {
          lease_id: 'test-lease',
          owner_pid: null,
          acquired_at: new Date(0).toISOString(),
          heartbeat_at: new Date(0).toISOString(),
          expires_at: new Date(0).toISOString(),
        },
        bindings: [{
          agent: 'sonar.resident',
          site: 'sonar',
          site_root: 'D:/code/site',
          launch_session_id: 'launch-1',
          owner_ref: attempt.launch_attempt_id,
        }],
      });
      vi.mocked(discoverNarsSessions).mockReturnValue({ sessions: [{
        launch_session_id: 'launch-1',
        session_id: 'session-1',
        site_root: 'D:/code/site',
      }] } as never);

      const recovery = await workspaceLaunchRecoveryCommand({
        attempt: [attempt.launch_attempt_id],
        format: 'json',
      });

      expect(recovery.exitCode).not.toBe(0);
      expect(recovery.result).toMatchObject({
        status: 'partial',
        attempts: [{
          status: 'recoverable',
          mutation_performed: false,
          sessions: [{ reason_code: 'exact_session_cleanup_not_admitted', status: 'recoverable' }],
        }],
      });
    } finally {
      vi.mocked(discoverNarsSessions).mockReset();
      if (previous === undefined) delete process.env.NARADA_USER_SITE_ROOT;
      else process.env.NARADA_USER_SITE_ROOT = previous;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('refuses explicit recovery while the attempt owner lease is still active', async () => {
    const root = await mkdtemp('/tmp/workspace-launch-recovery-owner-');
    const previous = process.env.NARADA_USER_SITE_ROOT;
    process.env.NARADA_USER_SITE_ROOT = root;
    try {
      const attempt = await createWorkspaceLaunchExecutionAttempt({
        site: ['sonar'],
        role: ['resident'],
        operatorSurface: 'agent-web-ui',
        runtime: 'narada-agent-runtime-server',
      }, []);
      await updateWorkspaceLaunchExecutionAttempt(attempt, 'launching');

      const recovery = await workspaceLaunchRecoveryCommand({
        attempt: [attempt.launch_attempt_id],
        format: 'json',
      });

      expect(recovery.exitCode).not.toBe(0);
      expect(recovery.result).toMatchObject({
        status: 'partial',
        attempts: [{ status: 'owner_active', reason_code: 'launch_attempt_owner_active' }],
      });
    } finally {
      if (previous === undefined) delete process.env.NARADA_USER_SITE_ROOT;
      else process.env.NARADA_USER_SITE_ROOT = previous;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps a requested close pending until a later observation proves the session is gone', async () => {
    const root = await mkdtemp('/tmp/workspace-launch-recovery-pending-');
    const previous = process.env.NARADA_USER_SITE_ROOT;
    process.env.NARADA_USER_SITE_ROOT = root;
    try {
      const attempt = await createWorkspaceLaunchExecutionAttempt({
        site: ['sonar'],
        role: ['resident'],
        operatorSurface: 'agent-web-ui',
        runtime: 'narada-agent-runtime-server',
      }, []);
      await updateWorkspaceLaunchExecutionAttempt(attempt, 'launching', {
        lease: {
          lease_id: 'stale-test-lease',
          owner_pid: null,
          acquired_at: new Date(0).toISOString(),
          heartbeat_at: new Date(0).toISOString(),
          expires_at: new Date(0).toISOString(),
        },
        bindings: [{
          agent: 'sonar.resident',
          site: 'sonar',
          site_root: 'D:/code/site',
          launch_session_id: 'launch-pending',
          owner_ref: attempt.launch_attempt_id,
        }],
      });
      const controlPath = `${root}/control.jsonl`;
      await writeWorkspaceLaunchExecutionAttempt(attempt);
      const activeSession = {
        launch_session_id: 'launch-pending',
        session_id: 'session-pending',
        site_root: 'D:/code/site',
        control_path: controlPath,
        display_state: 'active',
        terminal_state: null,
      };
      await import('node:fs/promises').then(({ writeFile }) => writeFile(controlPath, '', 'utf8'));
      vi.mocked(discoverNarsSessions).mockReturnValue({ sessions: [activeSession] } as never);

      const first = await workspaceLaunchRecoveryCommand({ attempt: [attempt.launch_attempt_id], format: 'json' });
      expect(first.result).toMatchObject({
        status: 'partial',
        attempts: [{ status: 'recovery_requested', sessions: [{ status: 'recovery_requested' }] }],
      });
      expect(await readWorkspaceLaunchExecutionAttempt(workspaceLaunchExecutionAttemptPath(attempt.launch_attempt_id)))
        .toMatchObject({ state: 'recovery_requested' });

      const pending = await readWorkspaceLaunchExecutionAttempt(workspaceLaunchExecutionAttemptPath(attempt.launch_attempt_id));
      if (!pending) throw new Error('pending attempt was not persisted');
      pending.lease = {
        lease_id: 'stale-test-lease-2',
        owner_pid: null,
        acquired_at: new Date(0).toISOString(),
        heartbeat_at: new Date(0).toISOString(),
        expires_at: new Date(0).toISOString(),
      };
      await writeWorkspaceLaunchExecutionAttempt(pending);
      vi.mocked(discoverNarsSessions).mockReturnValue({ sessions: [] } as never);

      const second = await workspaceLaunchRecoveryCommand({ attempt: [attempt.launch_attempt_id], format: 'json' });
      expect(second.result).toMatchObject({
        status: 'completed',
        attempts: [{ status: 'recovered', sessions: [{ status: 'recovered' }] }],
      });
    } finally {
      vi.mocked(discoverNarsSessions).mockReset();
      if (previous === undefined) delete process.env.NARADA_USER_SITE_ROOT;
      else process.env.NARADA_USER_SITE_ROOT = previous;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects illegal durable attempt state transitions', async () => {
    const root = await mkdtemp('/tmp/workspace-launch-recovery-state-');
    const previous = process.env.NARADA_USER_SITE_ROOT;
    process.env.NARADA_USER_SITE_ROOT = root;
    try {
      const attempt = await createWorkspaceLaunchExecutionAttempt({}, []);
      await expect(updateWorkspaceLaunchExecutionAttempt(attempt, 'recovered')).rejects.toThrow(
        'workspace_launch_invalid_attempt_state_transition',
      );
    } finally {
      if (previous === undefined) delete process.env.NARADA_USER_SITE_ROOT;
      else process.env.NARADA_USER_SITE_ROOT = previous;
      await rm(root, { recursive: true, force: true });
    }
  });
});
