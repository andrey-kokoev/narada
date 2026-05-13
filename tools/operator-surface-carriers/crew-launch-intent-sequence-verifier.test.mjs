import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verifyLaunchIntentSequence } from './crew-launch-intent-sequence-verifier.mjs';

test('verifies a read-only launch intent sequence when required MCP tools are live', () => {
  const root = makeSiteRoot();
  writeJson(path.join(root, '.narada/capabilities/mcp-surfaces.json'), {
    mcp_surfaces: [
      { registered_live_tools: ['site_task_lifecycle.read_task'] },
      { registered_live_tools: ['agent_context_memory.plan_hydration', 'agent_context_memory.read_checkpoint_summary'] },
    ],
  });
  writeJson(path.join(root, '.narada/crew/architect.launch-intent-sequence.json'), validSequence());

  const result = verifyLaunchIntentSequence({ site_root: root });

  assert.equal(result.status, 'verified');
  assert.deepEqual(result.refusals, []);
  assert.equal(result.package_executed_launch, false);
  assert.equal(result.operator_surface_runtime_mutated, false);
});

test('refuses sequence when direct launch execution is marked admitted', () => {
  const root = makeSiteRoot();
  writeJson(path.join(root, '.narada/capabilities/mcp-surfaces.json'), {
    mcp_surfaces: [
      { registered_live_tools: ['site_task_lifecycle.read_task', 'agent_context_memory.plan_hydration', 'agent_context_memory.read_checkpoint_summary'] },
    ],
  });
  writeJson(path.join(root, '.narada/crew/architect.launch-intent-sequence.json'), {
    ...validSequence(),
    launchHandoff: { ...validSequence().launchHandoff, executionAdmitted: true },
  });

  const result = verifyLaunchIntentSequence({ site_root: root });

  assert.equal(result.status, 'refused');
  assert.ok(result.refusals.includes('launch_handoff_execution_not_admitted'));
});

test('refuses sequence when a required MCP tool is not live', () => {
  const root = makeSiteRoot();
  writeJson(path.join(root, '.narada/capabilities/mcp-surfaces.json'), {
    mcp_surfaces: [
      { registered_live_tools: ['site_task_lifecycle.read_task'] },
    ],
  });
  writeJson(path.join(root, '.narada/crew/architect.launch-intent-sequence.json'), validSequence());

  const result = verifyLaunchIntentSequence({ site_root: root });

  assert.equal(result.status, 'refused');
  assert.ok(result.refusals.includes('required_mcp_tool_not_live:agent_context_memory.plan_hydration'));
});

function makeSiteRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'narada-crew-sequence-'));
  fs.mkdirSync(path.join(root, '.narada/capabilities'), { recursive: true });
  fs.mkdirSync(path.join(root, '.narada/crew'), { recursive: true });
  return root;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function validSequence() {
  return {
    requestId: 'narada-proper.crew.architect.startup-request.v0',
    sequenceSteps: [
      { requiredTool: 'site_task_lifecycle.read_task' },
      { requiredTool: 'agent_context_memory.plan_hydration' },
      { requiredTool: 'agent_context_memory.read_checkpoint_summary' },
    ],
    launchHandoff: { executionAdmitted: false },
    packageExecutedLaunch: false,
    packageMutatedPcState: false,
    operatorSurfaceRuntimeMutated: false,
    nativeShellFallbackAllowed: false,
    notAdmitted: [
      'Windows .lnk creation',
      'process launch',
      'direct substrate shortcut execution',
      'native shell fallback',
      'PC-locus mutation',
      'operator-surface runtime mutation',
      'operator-surface runtime copying',
    ],
  };
}
