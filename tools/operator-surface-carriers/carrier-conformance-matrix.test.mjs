import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EVIDENCE_LEVELS, buildCarrierConformanceMatrix, currentLaunchRegistrySummary } from './carrier-conformance-matrix.mjs';

const workspace = mkdtempSync(join(tmpdir(), 'narada-carrier-matrix-'));
const registryPath = join(workspace, 'agents.psd1');
writeFileSync(registryPath, `@{
  Agents = @(
    @{
      Agent = "narada.codex.a"
      NaradaRoot = "C:\\Narada"
      Runtime = "codex"
      EnableNativeShell = $true
    }
    @{
      Agent = "narada.codex.b"
      NaradaRoot = "C:\\Narada"
      Runtime = "codex"
      EnableNativeShell = $false
    }
    @{
      Agent = "narada.pi.a"
      NaradaRoot = "C:\\Narada"
      Runtime = "pi"
    }
  )
}
`, 'utf8');

const summary = currentLaunchRegistrySummary(registryPath);
assert.equal(summary.status, 'loaded');
assert.equal(summary.runtime_counts.codex, 2);
assert.equal(summary.native_shell_enabled_counts.codex, 1);

const matrix = buildCarrierConformanceMatrix({ launchRegistryPath: registryPath });
assert.equal(matrix.schema, 'narada.carrier_conformance_matrix.v1');
assert.equal(matrix.mutation_performed, false);
assert.equal(matrix.launch_registry_summary.runtime_counts.codex, 2);
assert.deepEqual(
  matrix.rows.map((row) => row.carrier).sort(),
  ['agent-cli', 'claude-code', 'codex', 'pi'],
);

const byCarrier = Object.fromEntries(matrix.rows.map((row) => [row.carrier, row]));
assert.equal(byCarrier['agent-cli'].evidence_level, EVIDENCE_LEVELS.CODE_ENFORCED);
assert.equal(byCarrier.codex.evidence_level, EVIDENCE_LEVELS.CONFIG_ENFORCED);
assert.equal(byCarrier.codex.configured_default_native_shell_posture, 'native_shell_enabled_by_launch_registry_for_1_of_2_codex_agents');
assert.equal(byCarrier.codex.known_gaps.some((gap) => gap.includes('Current launch registry enables native shell')), true);
assert.equal(byCarrier['claude-code'].evidence_level, EVIDENCE_LEVELS.CONFIG_ENFORCED);
assert.equal(byCarrier.pi.evidence_level, EVIDENCE_LEVELS.CONFIG_ENFORCED);
assert.equal(byCarrier.pi.launch_supported, true);
assert.equal(byCarrier.pi.coherent_launch_supported, true);
assert.equal(byCarrier.pi.support_posture, 'narada_owned_extension_bridge');

for (const row of matrix.rows) {
  assert.equal(typeof row.mcp_fabric_source, 'string');
  assert.equal(typeof row.mutating_call_handling, 'string');
  assert.equal(Array.isArray(row.known_gaps), true);
}

rmSync(workspace, { recursive: true, force: true });
console.log('carrier-conformance-matrix tests PASSED.');
