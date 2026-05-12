import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMaterializer } from './agent-launch-affordance-materializer.mjs';

function tempSite() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-launch-affordance-'));
  fs.mkdirSync(path.join(root, '.narada'), { recursive: true });
  fs.mkdirSync(path.join(root, 'operator-surfaces'), { recursive: true });
  fs.writeFileSync(path.join(root, 'operator-surfaces/identities.json'), JSON.stringify({
    schema: 'https://narada.dev/schemas/operator-surface-identities/v1',
    identities: [
      { identity_id: 'architect', site_id: 'narada', role: 'architect', admitted_by: 'operator' },
      { identity_id: 'builder', site_id: 'narada', role: 'builder', admitted_by: 'operator' },
    ],
  }, null, 2));
  fs.writeFileSync(path.join(root, 'operator-surfaces/agent-launch-affordances.json'), JSON.stringify({
    schema: 'narada.operator_surface.agent_launch_affordances.v0',
    site_id: 'narada',
    affordances: [
      affordance('narada.architect', 'architect'),
      affordance('narada.builder', 'builder'),
    ],
  }, null, 2));
  return root;
}

function affordance(identityName, role) {
  return {
    affordance_id: `${identityName}.codex`,
    label: `Narada Agent - ${role} (codex)`,
    identity_name: identityName,
    runtime: 'codex',
    role,
    enabled: true,
    materializations: [{ kind: 'desktop_shortcut', default_projection_dir: '.crew/agent-shortcuts' }],
    required_binding_proof: {
      before_window_snapshot: true,
      unique_new_carrier_window: true,
      inhabited_child_claim: true,
      exactly_one_new_visible_cascadia_hwnd: true,
      sqlite_binding_to_admitted_identity: true,
      osl_projection_refresh: true,
      fail_closed_on_ambiguous_or_missing_window_delta: true,
    },
  };
}

test('plans projection-only launch affordances without writing by default', () => {
  const root = tempSite();
  const result = runMaterializer({ site_root: root });

  assert.equal(result.status, 'planned');
  assert.equal(result.package_executed_launch, false);
  assert.equal(result.package_mutated_pc_state, false);
  assert.equal(result.proof_before_bind_required, true);
  assert.equal(fs.existsSync(path.join(root, '.crew/agent-shortcuts')), false);
  assert.deepEqual(result.selected_identities, ['narada.architect', 'narada.builder']);
});

test('apply is authority gated and writes only projection files', () => {
  const root = tempSite();

  const refused = runMaterializer({ site_root: root, mode: 'apply' });
  assert.equal(refused.status, 'refused');
  assert.ok(refused.refusals.includes('projection_write_authority_missing'));

  const applied = runMaterializer({ site_root: root, mode: 'apply', mutation_authorized: true });
  assert.equal(applied.status, 'applied');
  assert.equal(applied.created_or_changed.length, 2);

  const verify = runMaterializer({ site_root: root, mode: 'verify' });
  assert.equal(verify.status, 'verified');
  assert.equal(verify.verification.projection_count, 2);

  const projection = JSON.parse(fs.readFileSync(applied.created_or_changed[0], 'utf8'));
  assert.equal(projection.projection_only, true);
  assert.ok(projection.not_admitted.includes('runtime_binding_mutation'));
});

test('refuses non-admitted identities and source-state import requests', () => {
  const root = tempSite();
  const affordancesPath = path.join(root, 'operator-surfaces/agent-launch-affordances.json');
  const affordances = JSON.parse(fs.readFileSync(affordancesPath, 'utf8'));
  affordances.affordances.push(affordance('narada.unknown', 'unknown'));
  fs.writeFileSync(affordancesPath, JSON.stringify(affordances, null, 2));

  const unknown = runMaterializer({ site_root: root, identity_names: ['narada.unknown'] });
  assert.equal(unknown.status, 'refused');
  assert.ok(unknown.refusals.includes('identity_not_admitted:narada.unknown'));

  const sourceImport = runMaterializer({ site_root: root, import_source_runtime_state: true });
  assert.equal(sourceImport.status, 'refused');
  assert.ok(sourceImport.refusals.includes('source_runtime_state_import_refused'));
});

test('refuses direct execution, shell fallback, runtime copy, and missing proof gates', () => {
  const root = tempSite();
  const affordancesPath = path.join(root, 'operator-surfaces/agent-launch-affordances.json');
  const affordances = JSON.parse(fs.readFileSync(affordancesPath, 'utf8'));
  affordances.affordances[0].required_binding_proof.unique_new_carrier_window = false;
  fs.writeFileSync(affordancesPath, JSON.stringify(affordances, null, 2));

  const result = runMaterializer({
    site_root: root,
    identity_names: ['narada.architect'],
    direct_shortcut_execution: true,
    native_shell_fallback: true,
    copy_operator_surface_runtime: true,
  });

  assert.equal(result.status, 'refused');
  assert.ok(result.refusals.includes('direct_substrate_shortcut_execution_refused'));
  assert.ok(result.refusals.includes('native_shell_fallback_refused'));
  assert.ok(result.refusals.includes('operator_surface_runtime_copying_refused'));
  assert.ok(result.refusals.includes('binding_proof_missing:narada.architect:unique_new_carrier_window'));
});
