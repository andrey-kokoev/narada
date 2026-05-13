import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planLaunchFocusBindRequest } from './crew-launch-focus-bind-request-planner.mjs';

function tempSite() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-launch-request-'));
  fs.mkdirSync(path.join(root, '.narada/crew'), { recursive: true });
  fs.mkdirSync(path.join(root, '.narada/capabilities'), { recursive: true });
  fs.writeFileSync(path.join(root, '.narada/capabilities/mcp-surfaces.json'), JSON.stringify({
    schema: 'narada.site.capabilities.v0',
    site_id: 'narada-proper',
    mcp_surfaces: [
      {
        surface_id: 'fixture',
        registered_live_tools: [
          'site_task_lifecycle.read_task',
          'agent_context_memory.plan_hydration',
          'agent_context_memory.read_checkpoint_summary',
        ],
      },
    ],
  }, null, 2));
  fs.writeFileSync(path.join(root, '.narada/crew/architect.launch-intent-sequence.json'), JSON.stringify(sequence(), null, 2));
  return root;
}

function sequence() {
  return {
    schema: 'narada.crew_startup_shortcut.launch_intent_sequence.v0',
    requestId: 'narada-proper.crew.architect.startup-request.v0',
    siteId: 'narada-proper',
    role: 'architect',
    agentIdentity: 'narada.architect',
    status: 'ready_for_admitted_carrier',
    sequence: [
      { step: 'read_task_lifecycle_context', requiredTool: 'site_task_lifecycle.read_task' },
      { step: 'plan_agent_context_hydration', requiredTool: 'agent_context_memory.plan_hydration' },
      { step: 'read_checkpoint_summary_if_available', requiredTool: 'agent_context_memory.read_checkpoint_summary' },
    ],
    launchHandoff: { carrierRequired: 'operator_surface_launch_focus_bind', executionAdmitted: false },
    noImportGuarantees: [],
    notAdmitted: [
      'Windows .lnk creation',
      'process launch',
      'direct substrate shortcut execution',
      'native shell fallback',
      'PC-locus mutation',
      'operator-surface runtime mutation',
      'operator-surface runtime copying',
    ],
    packageExecutedLaunch: false,
    packageMutatedPcState: false,
    operatorSurfaceRuntimeMutated: false,
    nativeShellFallbackAllowed: false,
  };
}

test('plans a launch/focus/bind request without writing by default', () => {
  const root = tempSite();
  const result = planLaunchFocusBindRequest({ site_root: root });

  assert.equal(result.status, 'planned');
  assert.equal(result.request.status, 'awaiting_admitted_carrier');
  assert.equal(result.request.carrier_id, 'narada-proper.carrier.crew-launch-focus-bind.v0');
  assert.equal(result.package_executed_launch, false);
  assert.equal(fs.existsSync(result.request_path), false);
});

test('apply is authority gated and writes only the request artifact', () => {
  const root = tempSite();

  const refused = planLaunchFocusBindRequest({ site_root: root, mode: 'apply' });
  assert.equal(refused.status, 'refused');
  assert.deepEqual(refused.refusals, ['launch_request_write_authority_missing']);

  const applied = planLaunchFocusBindRequest({ site_root: root, mode: 'apply', mutation_authorized: true });
  assert.equal(applied.status, 'applied');
  assert.equal(applied.created_or_changed.length, 1);
  const artifact = JSON.parse(fs.readFileSync(applied.request_path, 'utf8'));
  assert.equal(artifact.status, 'awaiting_admitted_carrier');
  assert.equal(artifact.package_executed_launch, false);

  const verified = planLaunchFocusBindRequest({ site_root: root, mode: 'verify' });
  assert.equal(verified.status, 'verified');
});

test('refuses direct launch and runtime side effect requests', () => {
  const root = tempSite();
  const result = planLaunchFocusBindRequest({
    site_root: root,
    direct_launch_execution: true,
    native_shell_fallback: true,
    pc_locus_mutation: true,
    copy_operator_surface_runtime: true,
  });

  assert.equal(result.status, 'refused');
  assert.ok(result.refusals.includes('direct_launch_execution_refused'));
  assert.ok(result.refusals.includes('native_shell_fallback_refused'));
  assert.ok(result.refusals.includes('pc_locus_mutation_refused'));
  assert.ok(result.refusals.includes('operator_surface_runtime_copying_refused'));
});

test('refuses when sequence verification fails', () => {
  const root = tempSite();
  const sequencePath = path.join(root, '.narada/crew/architect.launch-intent-sequence.json');
  const bad = sequence();
  bad.launchHandoff.executionAdmitted = true;
  fs.writeFileSync(sequencePath, JSON.stringify(bad, null, 2));

  const result = planLaunchFocusBindRequest({ site_root: root });

  assert.equal(result.status, 'refused');
  assert.ok(result.refusals.some((item) => item.startsWith('sequence_verification_failed:')));
});
