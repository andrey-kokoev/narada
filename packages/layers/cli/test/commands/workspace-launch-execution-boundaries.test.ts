import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { NarsSessionObservation } from '@narada2/nars-session-core/session-index';
import { executeWorkspaceLaunchPlan } from '../../src/commands/workspace-launch-executor.js';
import {
  awaitWorkspaceLaunchSessionAttachments,
  type WorkspaceLaunchAttachmentDependencies,
} from '../../src/commands/workspace-launch-attachment.js';
import {
  redactWorkspaceLaunchArgv,
  redactWorkspaceLaunchCommand,
  redactWorkspaceLaunchText,
  workspaceLaunchRollbackOwnedProcesses,
  workspaceLaunchTerminateProcess,
} from '../../src/commands/workspace-launch-process.js';
import { writeWorkspacePlanResult } from '../../src/commands/workspace-launch-persistence.js';
import type { WorkspaceLaunchAgentPlan, WorkspaceLaunchProcessLaunch } from '../../src/commands/workspace-launch-types.js';

const plan = {
  agent: 'sonar.resident',
  launch_session_id: 'launch-1',
  site_root: 'D:/code/site',
} as unknown as WorkspaceLaunchAgentPlan;

describe('workspace launch execution boundaries', () => {
  it('attaches only to the exact launch binding and a healthy endpoint', async () => {
    const candidate = {
      launch_session_id: 'launch-1',
      session_id: 'session-1',
      site_root: 'D:/code/site',
      health_endpoint: 'http://127.0.0.1:1/health',
      health_status: 'starting',
    } as unknown as NarsSessionObservation;
    const otherSession = {
      ...candidate,
      launch_session_id: 'launch-other',
      session_id: 'session-other',
      health_status: 'healthy',
    } as unknown as NarsSessionObservation;
    const discover = (() => ({ sessions: [otherSession, candidate] })) as unknown as WorkspaceLaunchAttachmentDependencies['discover'];

    const attachment = await awaitWorkspaceLaunchSessionAttachments([plan], {
      discover,
      probeHealth: async (endpoint) => endpoint === candidate.health_endpoint
        ? { status: 'healthy', session_id: 'session-1' }
        : { status: 'unavailable', session_id: null },
      timeoutMs: 0,
      pollMs: 0,
      now: () => 0,
    });

    expect(attachment).toMatchObject({
      status: 'attached',
      exact_session: true,
      launch_session_ids: ['launch-1'],
      sessions: [{
        launch_session_id: 'launch-1',
        session_id: 'session-1',
        health_session_id: 'session-1',
        health_identity_match: true,
        health_status: 'healthy',
      }],
    });
  });

  it('refuses a nonhealthy or mismatched health identity', async () => {
    let clock = 0;
    const candidate = {
      launch_session_id: 'launch-1',
      session_id: 'session-1',
      site_root: 'D:/code/site',
      health_endpoint: 'http://127.0.0.1:1/health',
      health_status: 'starting',
    } as unknown as NarsSessionObservation;
    const discover = (() => ({ sessions: [candidate] })) as unknown as WorkspaceLaunchAttachmentDependencies['discover'];

    await expect(awaitWorkspaceLaunchSessionAttachments([plan], {
      discover,
      probeHealth: async () => ({ status: 'healthy', session_id: 'session-other' }),
      timeoutMs: 20,
      pollMs: 10,
      now: () => clock,
      sleep: async () => { clock += 10; },
    })).rejects.toMatchObject({
      evidence: { sessions: [{ reason: 'session_health_session_mismatch', health_identity_match: false }] },
    });

    clock = 0;
    await expect(awaitWorkspaceLaunchSessionAttachments([plan], {
      discover,
      probeHealth: async () => ({ status: 'unavailable', session_id: 'session-1' }),
      timeoutMs: 20,
      pollMs: 10,
      now: () => clock,
      sleep: async () => { clock += 10; },
    })).rejects.toMatchObject({
      evidence: { sessions: [{ reason: 'session_health_unavailable', health_identity_match: true }] },
    });
  });

  it('does not attach a healthy session with the wrong canonical identity', async () => {
    const identityPlan = {
      ...plan,
      agent: 'sonar.resident',
      site: 'sonar',
    } as unknown as WorkspaceLaunchAgentPlan;
    const candidate = {
      launch_session_id: 'launch-1',
      session_id: 'session-1',
      agent_id: 'sonar.architect',
      site_id: 'sonar',
      site_root: 'D:/code/site',
      health_endpoint: 'http://127.0.0.1:1/health',
    } as unknown as NarsSessionObservation;

    await expect(awaitWorkspaceLaunchSessionAttachments([identityPlan], {
      discover: (() => ({ sessions: [candidate] })) as unknown as WorkspaceLaunchAttachmentDependencies['discover'],
      probeHealth: async () => ({
        status: 'healthy',
        session_id: 'session-1',
        agent_id: 'sonar.architect',
        site_id: 'sonar',
      }),
      timeoutMs: 0,
      pollMs: 0,
      now: () => 0,
    })).rejects.toMatchObject({
      evidence: {
        sessions: [{
          canonical_identity_match: false,
          reason: 'session_identity_mismatch',
        }],
      },
    });
  });

  it('persists a typed failure artifact for a malformed plan before execution', async () => {
    const tempDir = await mkdtemp('/tmp/workspace-launch-malformed-');
    const resultPath = `${tempDir}/failure.json`;
    try {
      await expect(executeWorkspaceLaunchPlan({ resultPath }, {} as never)).rejects.toMatchObject({
        name: 'WorkspaceLaunchContractError',
        reasonCode: 'workspace_launch_plan_schema_invalid',
      });
      const failure = JSON.parse(await readFile(resultPath, 'utf8')) as {
        schema: string;
        failure: { schema: string; stage: string; artifact_status: string };
      };
      expect(failure).toMatchObject({
        schema: 'narada.workspace_launch.failure.v1',
        failure: {
          schema: 'narada.workspace_launch.failure_evidence.v1',
          stage: 'planning',
          artifact_status: 'written',
        },
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('preserves bare stable planning reason codes in the failure artifact', async () => {
    const tempDir = await mkdtemp('/tmp/workspace-launch-bare-reason-');
    const resultPath = `${tempDir}/failure.json`;
    try {
      await expect(executeWorkspaceLaunchPlan({ resultPath }, {
        schema: 'narada.workspace_launch.plan.v1',
        status: 'planned',
        mutation_performed: true,
      } as never)).rejects.toMatchObject({
        name: 'WorkspaceLaunchContractError',
        reasonCode: 'workspace_launch_plan_mutation_or_status_invalid',
      });
      const failure = JSON.parse(await readFile(resultPath, 'utf8')) as {
        failure: { reason_code: string };
      };
      expect(failure.failure.reason_code).toBe('workspace_launch_plan_mutation_or_status_invalid');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('returns bounded pending evidence when the exact session never becomes healthy', async () => {
    let clock = 0;
    await expect(awaitWorkspaceLaunchSessionAttachments([plan], {
      discover: (() => ({ sessions: [] })) as unknown as WorkspaceLaunchAttachmentDependencies['discover'],
      timeoutMs: 20,
      pollMs: 10,
      now: () => clock,
      sleep: async () => { clock += 10; },
    })).rejects.toMatchObject({
      name: 'WorkspaceLaunchAttachmentError',
      evidence: {
        status: 'handoff_pending',
        exact_session: false,
        launch_session_ids: ['launch-1'],
        sessions: [{
          launch_session_id: 'launch-1',
          reason: 'session_not_indexed',
        }],
      },
    });
  });

  it('redacts secret argv values while preserving option names', () => {
    expect(redactWorkspaceLaunchArgv([
      'node',
      '--api-key', 'secret-value',
      '--token=inline-secret',
      '--model', 'gpt-5.5',
    ])).toEqual([
      'node',
      '--api-key', '<redacted>',
      '--token=<redacted>',
      '--model', 'gpt-5.5',
    ]);
  });

  it('redacts quoted shell-command and JSON secret values', () => {
    expect(redactWorkspaceLaunchCommand("& 'node' '--api-key' 'secret value' --token=inline-secret")).toBe(
      "& 'node' '--api-key' '<redacted>' --token=<redacted>",
    );
    expect(redactWorkspaceLaunchText('{"api_key":"secret-value","token":"another-secret"}')).toBe(
      '{"api_key":"<redacted>","token":"<redacted>"}',
    );
  });

  it('redacts persisted command arrays and nested evidence atomically', async () => {
    const tempDir = await mkdtemp('/tmp/workspace-launch-redaction-');
    const resultPath = `${tempDir}/result.json`;
    try {
      await writeWorkspacePlanResult(resultPath, {
        runtime_start_command: ['node', '--api-key', 'secret-value'],
        operator_terminal_handoff: { command: "node --token='secret-value'" },
        nested: { token: 'secret-value' },
      });
      const persisted = JSON.parse(await readFile(resultPath, 'utf8')) as Record<string, unknown>;
      expect(persisted.runtime_start_command).toEqual(['node', '--api-key', '<redacted>']);
      expect(persisted.operator_terminal_handoff).toMatchObject({ command: 'node --token=<redacted>' });
      expect(persisted.nested).toEqual({ token: '<redacted>' });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('refuses forged process records and emits per-target rollback evidence', () => {
    const forged = {
      posture: 'agent_runtime_server',
      execution_authority: 'structured_argv',
      command: 'node',
      args: [],
      cwd: 'D:/code/site',
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      pid: process.pid,
      owner_ref: 'forged-owner',
    } as WorkspaceLaunchProcessLaunch;

    expect(workspaceLaunchTerminateProcess(forged)).toBe('refused');
    expect(workspaceLaunchRollbackOwnedProcesses([forged])).toMatchObject({
      attempted: true,
      completed: false,
      orphan_count: 1,
      statuses: ['refused'],
      targets: [{
        index: 0,
        pid: process.pid,
        owner_ref: 'forged-owner',
        launch_session_id: null,
        status: 'refused',
      }],
    });
  });
});
