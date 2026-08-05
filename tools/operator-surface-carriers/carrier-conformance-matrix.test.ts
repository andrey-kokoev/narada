import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  ADMITTED_LAUNCH_SELECTION_KINDS,
  OPERATOR_SURFACE_LAUNCH_MATRIX_CONTRACT_SCHEMA,
} from '../../packages/operator-surface-runtime-contract/src/operator-surface-runtime-selection.js';
import {
  EVIDENCE_LEVELS,
  buildCarrierConformanceMatrix,
  currentLaunchRegistrySummary,
} from './carrier-conformance-matrix.js';

test('derives every conformance row from the canonical launch matrix', () => {
  const matrix = buildCarrierConformanceMatrix({
    launchRegistryPath: 'C:/tmp/narada-carrier-matrix-registry-that-does-not-exist.psd1',
  });

  assert.equal(matrix.schema, 'narada.carrier_conformance_matrix.v1');
  assert.equal(matrix.carrier_launch_matrix_schema, OPERATOR_SURFACE_LAUNCH_MATRIX_CONTRACT_SCHEMA);
  assert.equal(matrix.mutation_performed, false);
  assert.deepEqual(
    matrix.rows.map((row) => row.carrier),
    ADMITTED_LAUNCH_SELECTION_KINDS,
  );
  assert.equal(matrix.rows.find((row) => row.carrier === 'agent-cli')?.evidence_level, EVIDENCE_LEVELS.CODE_ENFORCED);
  assert.equal(matrix.rows.find((row) => row.carrier === 'kimi')?.evidence_level, EVIDENCE_LEVELS.UNVERIFIED);
});

test('summarizes registry runtimes and overlays Codex native-shell posture', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'narada-carrier-matrix-'));
  const registryPath = join(workspace, 'agents.psd1');
  try {
    writeFileSync(registryPath, `@{
  Agents = @(
    @{
      Agent = "narada.codex.a"
      NaradaRoot = "C:/Narada"
      Runtime = "codex"
      EnableNativeShell = $true
    }
    @{
      Agent = "narada.codex.b"
      NaradaRoot = "C:/Narada"
      Runtime = "codex"
      EnableNativeShell = $false
    }
    @{
      Agent = "narada.pi.a"
      NaradaRoot = "C:/Narada"
      Runtime = "pi"
    }
  )
}
`, 'utf8');

    const summary = currentLaunchRegistrySummary(registryPath);
    assert.equal(summary.status, 'loaded');
    assert.equal(summary.agent_count, 3);
    assert.equal(summary.runtime_counts.codex, 2);
    assert.equal(summary.runtime_counts.pi, 1);
    assert.equal(summary.native_shell_enabled_counts.codex, 1);

    const matrix = buildCarrierConformanceMatrix({ launchRegistryPath: registryPath });
    const codex = matrix.rows.find((row) => row.carrier === 'codex');
    assert.equal(
      codex?.configured_default_native_shell_posture,
      'native_shell_enabled_by_launch_registry_for_1_of_2_codex_agents',
    );
    assert.equal(
      codex?.known_gaps.some((gap) => gap.includes('Current launch registry enables native shell')),
      true,
    );
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
