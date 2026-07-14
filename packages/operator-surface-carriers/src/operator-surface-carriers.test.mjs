import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

async function listScripts(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...await listScripts(path));
    } else if (/\.(mjs|ps1|py)$/i.test(entry.name)) {
      result.push(path);
    }
  }
  return result;
}

test('operator surface carrier package owns executable carrier scripts', async () => {
  assert.equal(existsSync(join(root, 'windows-glue', 'Start-AgentOperatorSurfaceCarrierChild.ps1')), true);
  const scripts = await listScripts(root);
  assert.ok(scripts.length >= 50, `expected substantial carrier surface, got ${scripts.length}`);
  for (const script of scripts) {
    const text = await readFile(script, 'utf8');
    assert.notEqual(text.trim(), '', `${script} has content`);
  }
});

test('operator surface carrier lifecycle declares claim, resolution, binding, and refusal paths', async () => {
  const lifecyclePath = join(root, 'windows-glue', 'OperatorSurfaceCarrierLifecycle.ps1');
  const lifecycle = await readFile(lifecyclePath, 'utf8');
  for (const state of ['requested', 'claim_written', 'resolving', 'resolved', 'binding', 'bound', 'verified', 'refused', 'failed']) {
    assert.match(lifecycle, new RegExp(`\\b${state}\\b`), `${state} is declared`);
  }
  assert.match(lifecycle, /invalid_operator_surface_carrier_transition/);
});

test('desktop shortcut projection consumes the canonical runtime contract', async () => {
  const scriptPath = join(root, 'Install-AgentDesktopShortcuts.ps1');
  const script = await readFile(scriptPath, 'utf8');
  assert.match(script, /RuntimeContractPath/);
  assert.match(script, /NARADA_RUNTIME_SUBSTRATE_CONTRACT_PATH/);
  assert.match(script, /NARADA_PROPER_ROOT/);
  assert.match(script, /Get-RuntimeSubstrateContract/);
  assert.match(script, /runtime_substrate_contract_not_found/);
  assert.match(script, /LaunchMatrixContractPath/);
  assert.match(script, /NARADA_CARRIER_LAUNCH_MATRIX_CONTRACT_PATH/);
  assert.match(script, /Get-CarrierLaunchMatrixContract/);
  assert.match(script, /carrier_kind_required_for_runtime_substrate_kind/);
  assert.match(script, /projection_capabilities/);
  assert.match(script, /carrier_launch_matrix_contract_row_invalid_projection_capabilities/);
  assert.match(script, /default_intelligence_auth_path/);
  assert.match(script, /carrier_launch_matrix_contract_row_invalid_conformance/);
  assert.doesNotMatch(script, /return 'agent-cli'/);
  assert.doesNotMatch(script, /\$AdmittedRuntimeSubstrateKinds\s*=\s*@\(\s*'/);
});
