import { describe, expect, it } from 'vitest';
import { workspaceLaunchRuntimeCommandSpec } from '../../src/commands/workspace-launch-command-spec.js';
import { buildAgentPlan } from '../../src/commands/workspace-launch-plan-builder.js';
import { createWorkspaceLaunchAdmissionPolicy } from '../../src/commands/workspace-launch-admission.js';
import type { WorkspaceLaunchRecord } from '../../src/commands/workspace-launch-types.js';

const baseOptions = {
  operatorSurface: 'agent-cli',
  siteRoot: 'C:/workspace/example',
  agent: 'example.resident',
  targetSiteId: 'example',
  runtime: 'narada-agent-runtime-server',
  workspaceRoot: 'C:/workspace/example',
  authority: 'auto',
  mcpScope: 'none',
  enableNativeShell: false,
  launchSessionId: 'launch-1',
};

describe('workspace runtime-engine selection', () => {
  it('carries a selected engine to the canonical runtime start argv', () => {
    const command = workspaceLaunchRuntimeCommandSpec({ ...baseOptions, runtimeEngine: 'rust' }, 'dry-run');
    const engineIndex = command.args.indexOf('--runtime-engine');
    expect(engineIndex).toBeGreaterThan(-1);
    expect(command.args[engineIndex + 1]).toBe('rust');
  });

  it('does not invent an engine for callers that did not select one', () => {
    const command = workspaceLaunchRuntimeCommandSpec(baseOptions, 'dry-run');
    expect(command.args).not.toContain('--runtime-engine');
  });

  it('records and carries the selected engine in a NARS workspace plan', () => {
    const record = {
      agent: 'example.resident',
      agent_identity_ref: { canonical_agent_id: 'example.resident' },
      title: 'Example Resident',
      role: 'resident',
      site: 'example',
      narada_root: 'C:/workspace/example',
      site_root: 'C:/workspace/example',
      workspace_root: 'C:/workspace/example',
      launcher_path: 'C:/workspace/example/narada-example.ps1',
      operator_surface: 'agent-cli',
      runtime: 'narada-agent-runtime-server',
      authority: null,
      enable_native_shell: false,
      mcp_scope: 'none',
      config_path: 'registry.json',
    } as unknown as WorkspaceLaunchRecord;
    const plan = buildAgentPlan(record, {
      operatorSurface: 'agent-cli',
      runtime: 'narada-agent-runtime-server',
      runtimeEngine: 'rust',
      mcpScope: 'none',
    }, { admission: createWorkspaceLaunchAdmissionPolicy() });

    expect(plan.runtime_engine_kind).toBe('rust');
    expect(plan.runtime_engine_selection).toMatchObject({
      status: 'accepted',
      runtime_engine_kind: 'rust',
    });
    expect(plan.hidden_runtime_start_command).toEqual(expect.arrayContaining(['--runtime-engine', 'rust']));
    expect(plan.smoke_command).toEqual(expect.arrayContaining(['--runtime-engine', 'rust']));
  });
});
