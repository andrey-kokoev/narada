import { describe, expect, it } from 'vitest';
import { createWorkspaceLaunchAdmissionPolicy } from '../../src/commands/workspace-launch-admission.js';
import type { WorkspaceLaunchRecord } from '../../src/commands/workspace-launch-types.js';
import {
  advanceWorkspaceLaunchTransaction,
  completeWorkspaceLaunchTransaction,
  createWorkspaceLaunchTransaction,
  failWorkspaceLaunchTransaction,
} from '../../src/commands/workspace-launch-contracts.js';
import { workspaceLaunchRollbackOwnedProcesses } from '../../src/commands/workspace-launch-process.js';

const record = {
  agent: 'sonar.resident',
  agent_identity_ref: {} as WorkspaceLaunchRecord['agent_identity_ref'],
  title: 'Sonar Resident',
  role: 'resident',
  site: 'sonar',
  narada_root: 'D:/code/narada.sonar',
  site_root: 'D:/code/narada.sonar',
  workspace_root: 'D:/code/narada.sonar',
  launcher_path: 'D:/code/narada.sonar/narada-sonar.ps1',
  operator_surface: 'agent-cli',
  runtime: 'narada-agent-runtime-server',
  authority: null,
  enable_native_shell: false,
  mcp_scope: 'all',
  config_path: 'D:/config/agents.psd1',
} satisfies WorkspaceLaunchRecord;

describe('workspace launch admission policy', () => {
  it('centralizes runtime, surface, and role admission without launcher intelligence selection', () => {
    const admission = createWorkspaceLaunchAdmissionPolicy();

    expect(admission.narsOperatorSurfaceKinds).toEqual(['agent-cli', 'agent-web-ui', 'agent-tui', 'agent-pi-tui']);
    expect(admission.resolveOperatorSurfaceRuntimeSelection('agent-web-ui', 'narada-agent-runtime-server')).toMatchObject({
      operator_surface_kind: 'agent-web-ui',
      runtime_host_kind: 'narada-agent-runtime-server',
    });
    expect(admission.roleChoicesForSelectedSites([record], ['sonar'])).toEqual(['resident']);
    expect(admission).not.toHaveProperty('providerRegistry');
    expect(admission).not.toHaveProperty('intelligenceProviderChoices');
  });

  it('enforces ordered launch transaction transitions and makes completion idempotent', () => {
    const planned = createWorkspaceLaunchTransaction('launch_test');
    const preflighted = advanceWorkspaceLaunchTransaction(planned, 'preflighted');
    const spawned = advanceWorkspaceLaunchTransaction(preflighted, 'spawned');
    const attached = advanceWorkspaceLaunchTransaction(spawned, 'attached');
    const completed = completeWorkspaceLaunchTransaction(attached);

    expect(completed.history).toEqual(['planned', 'preflighted', 'spawned', 'attached', 'completed']);
    expect(completeWorkspaceLaunchTransaction(completed)).toEqual(completed);
    expect(() => advanceWorkspaceLaunchTransaction(planned, 'attached')).toThrow('workspace_launch_transaction_transition_invalid');
    const handedOff = advanceWorkspaceLaunchTransaction(
      advanceWorkspaceLaunchTransaction(
        advanceWorkspaceLaunchTransaction(createWorkspaceLaunchTransaction('handoff_test'), 'preflighted'),
        'spawned',
      ),
      'handed_off',
    );
    expect(completeWorkspaceLaunchTransaction(handedOff).history).toEqual([
      'planned', 'preflighted', 'spawned', 'handed_off', 'completed',
    ]);
    expect(() => completeWorkspaceLaunchTransaction(spawned)).toThrow('workspace_launch_transaction_invalid');
    expect(() => advanceWorkspaceLaunchTransaction({
      ...planned,
      state: 'unknown',
      history: ['unknown'],
    }, 'preflighted')).toThrow('workspace_launch_transaction_invalid');
  });

  it('records failed transactions and bounded rollback evidence', () => {
    const preflighted = advanceWorkspaceLaunchTransaction(
      createWorkspaceLaunchTransaction('launch_failure'),
      'preflighted',
    );
    const rollback = workspaceLaunchRollbackOwnedProcesses([
      {
        posture: 'agent_runtime_server',
        execution_authority: 'structured_argv',
        command: 'capture',
        args: [],
        cwd: 'D:/code/site',
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        pid: null,
        owner_ref: 'launch_failure',
      },
    ]);
    const failed = failWorkspaceLaunchTransaction(preflighted, rollback);

    expect(rollback).toEqual({
      attempted: true,
      completed: true,
      orphan_count: 0,
      statuses: ['not_running'],
      targets: [{
        index: 0,
        agent_id: null,
        launch_session_id: null,
        pid: null,
        owner_ref: 'launch_failure',
        status: 'not_running',
        reason: 'no live process id was recorded',
      }],
    });
    expect(failed).toMatchObject({
      state: 'failed',
      history: ['planned', 'preflighted', 'failed'],
      rollback,
    });
  });
});
