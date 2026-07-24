import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  loadLaunchSliceContract,
  loadOperatorSurfaceLaunchMatrixContract,
  loadMcpRuntimeContract,
  loadRuntimeBooleanValuesContract,
  loadRuntimeSubstrateKindsContract,
  loadTerminalRuntimeContract,
} from './operator-surface-runtime-contract.mjs';
import {
  ADMITTED_LAUNCH_SELECTION_KINDS,
  ADMITTED_RUNTIME_IMPLEMENTATION_KINDS,
  ADMITTED_RUNTIME_SUBSTRATE_KINDS,
  ADMITTED_TOOL_FABRIC_ADAPTER_KINDS,
  OPERATOR_SURFACE_LAUNCH_MATRIX_CONTRACT_SCHEMA,
  defaultRuntimeForOperatorSurface,
  normalizeRuntimeAlias,
  operatorSurfaceKindsForProjectionCapability,
  operatorSurfaceKindsForRuntimeHost,
  resolveOperatorSurfaceRuntimeSelection,
} from './operator-surface-runtime-selection.mjs';
import { buildCarrierConformanceMatrix } from '../../../tools/operator-surface-carriers/carrier-conformance-matrix.mjs';

test('launch slice contract identifies the admitted carrier runtime', () => {
  const contract = loadLaunchSliceContract();
  assert.equal(contract.schema, 'narada.agent_tui.attach_projection_contract.v1');
  assert.equal(contract.admitted_runtime_slice, 'nars_attach_projection');
  assert.equal(contract.carrier_flag, '--attach');
  assert.equal(contract.terminal_mode, true);
});

test('carrier conformance report derives every row from the launch matrix', () => {
  const contract = loadOperatorSurfaceLaunchMatrixContract();
  const report = buildCarrierConformanceMatrix({
    launchRegistryPath: 'C:/tmp/narada-cross-carrier-matrix-test-registry-that-does-not-exist.psd1',
  });
  assert.equal(report.carrier_launch_matrix_schema, OPERATOR_SURFACE_LAUNCH_MATRIX_CONTRACT_SCHEMA);
  assert.deepEqual(
    report.rows.map((row) => row.carrier),
    contract.rows.map((row) => row.launch_selection_kind),
  );
  assert.equal(report.rows.find((row) => row.carrier === 'agent-web-ui').operator_surface_kind, 'agent-web-ui');
  assert.equal(report.rows.find((row) => row.carrier === 'agent-tui').runtime_host_kind, 'narada-agent-runtime-server');
  assert.equal(report.rows.find((row) => row.carrier === 'kimi').evidence_level, 'unverified');
  assert.equal(report.rows.find((row) => row.carrier === 'opencode').evidence_level, 'documented_advisory');
  for (const row of contract.rows) {
    const reportRow = report.rows.find((candidate) => candidate.carrier === row.launch_selection_kind);
    assert.ok(reportRow);
    assert.equal(reportRow.runtime_substrate_kind, row.runtime_substrate_kind);
    assert.equal(reportRow.tool_fabric_source, row.tool_fabric_source);
    assert.equal(reportRow.adapter_entrypoint, row.adapter_entrypoint);
    assert.deepEqual(reportRow.projection_capabilities, row.projection_capabilities);
    assert.deepEqual(reportRow.expected_tools, row.expected_tools);
    assert.deepEqual(reportRow.states, row.states);
    assert.equal(reportRow.admission_basis, row.admission_basis);
  }
});

test('runtime selection refuses a carrier surface paired with the wrong runtime', () => {
  const contract = loadRuntimeSubstrateKindsContract();
  const refused = resolveOperatorSurfaceRuntimeSelection({
    carrierValue: 'agent-cli',
    runtimeValue: 'codex',
    admittedRuntimeSubstrateKinds: contract.admitted_runtime_substrate_kinds,
    runtimeContractSchema: contract.schema,
  });
  assert.equal(refused.status, 'refused');
  assert.equal(refused.reason_code, 'operator_surface_runtime_mismatch');
  assert.equal(refused.candidate_operator_surface_kind, 'agent-cli');
});

test('carrier launch matrix is the complete admitted launch-selection authority', () => {
  const contract = loadOperatorSurfaceLaunchMatrixContract();
  assert.equal(contract.schema, OPERATOR_SURFACE_LAUNCH_MATRIX_CONTRACT_SCHEMA);
  assert.deepEqual(
    contract.rows.map((row) => row.launch_selection_kind),
    ['agent-cli', 'agent-web-ui', 'agent-tui', 'agent-pi-tui', 'codex', 'kimi', 'pi', 'claude-code', 'opencode'],
  );
  assert.deepEqual(
    contract.rows.map((row) => row.operator_surface_kind),
    contract.rows.map((row) => row.launch_selection_kind),
  );
  assert.deepEqual([...ADMITTED_LAUNCH_SELECTION_KINDS], contract.rows.map((row) => row.launch_selection_kind));
  assert.deepEqual([...ADMITTED_RUNTIME_SUBSTRATE_KINDS], loadRuntimeSubstrateKindsContract().admitted_runtime_substrate_kinds);
  assert.equal(contract.rows.every((row) => ADMITTED_RUNTIME_SUBSTRATE_KINDS.includes(row.runtime_host_kind)), true);
  assert.deepEqual([...operatorSurfaceKindsForRuntimeHost('narada-agent-runtime-server')], ['agent-cli', 'agent-web-ui', 'agent-tui', 'agent-pi-tui']);
  assert.deepEqual([...operatorSurfaceKindsForProjectionCapability('nars_attach')], ['agent-cli', 'agent-web-ui', 'agent-tui', 'agent-pi-tui']);
  assert.equal(contract.rows.every((row) => Array.isArray(row.projection_capabilities)), true);
  assert.equal(contract.rows.every((row) => row.conformance && Array.isArray(row.conformance.known_gaps)), true);
  assert.deepEqual(
    contract.rows.map((row) => row.conformance.evidence_level),
    ['code_enforced', 'code_enforced', 'code_enforced', 'code_enforced', 'config_enforced', 'unverified', 'config_enforced', 'config_enforced', 'documented_advisory'],
  );
  assert.equal(contract.rows.find((row) => row.launch_selection_kind === 'opencode').conformance.evidence_level, 'documented_advisory');
  assert.deepEqual([...ADMITTED_RUNTIME_IMPLEMENTATION_KINDS].sort(), [
    'claude-code',
    'codex',
    'kimi',
    'narada-agent-runtime-server',
    'opencode',
    'pi',
  ].sort());
  assert.deepEqual(
    [...ADMITTED_TOOL_FABRIC_ADAPTER_KINDS].sort(),
    [...new Set(contract.rows.map((row) => row.tool_fabric_adapter_kind))].sort(),
  );
  assert.equal(contract.rows.find((row) => row.launch_selection_kind === 'agent-cli').carrier_implementation_kind, 'narada-agent-runtime-server');
  assert.equal(contract.rows.find((row) => row.launch_selection_kind === 'agent-web-ui').runtime_host_kind, 'narada-agent-runtime-server');
  assert.equal(contract.rows.find((row) => row.launch_selection_kind === 'agent-tui').tool_fabric_adapter_kind, 'narada-agent-runtime-server-mcp-client');
  assert.equal(contract.rows.find((row) => row.launch_selection_kind === 'codex').tool_fabric_adapter_kind, 'codex-native-mcp');
  assert.equal(contract.rows.find((row) => row.launch_selection_kind === 'kimi').tool_fabric_adapter_kind, 'ambient-carrier-tools');
  assert.equal(contract.rows.find((row) => row.launch_selection_kind === 'pi').tool_fabric_adapter_kind, 'pi-extension-mcp-bridge');
  assert.equal(contract.rows.find((row) => row.launch_selection_kind === 'claude-code').tool_fabric_adapter_kind, 'claude-code-native-mcp');
  assert.equal(contract.rows.find((row) => row.launch_selection_kind === 'opencode').tool_fabric_adapter_kind, 'ambient-carrier-tools');
  assert.equal(contract.rows.find((row) => row.launch_selection_kind === 'opencode').adapter_entrypoint, null);
  assert.equal(contract.rows.find((row) => row.launch_selection_kind === 'opencode').expected_tools.length, 0);
  for (const row of contract.rows.filter((candidate) => candidate.expected_tools_scope === 'none')) {
    assert.equal(row.adapter_entrypoint, null);
    assert.equal(row.states.includes('no_narada_mcp_claim'), true);
  }
});

test('agent-web-ui is an admitted NARS operator surface and launch carrier', () => {
  const contract = loadRuntimeSubstrateKindsContract();
  const accepted = resolveOperatorSurfaceRuntimeSelection({
    carrierValue: 'agent-web-ui',
    runtimeValue: 'nars',
    admittedRuntimeSubstrateKinds: contract.admitted_runtime_substrate_kinds,
    runtimeContractSchema: contract.schema,
  });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.schema, 'narada.operator_surface_runtime_selection.v1');
  assert.equal(accepted.legacy_schema, 'narada.carrier_runtime_selection.v1');
  assert.equal(accepted.operator_surface_kind, 'agent-web-ui');
  assert.equal(accepted.launch_operator_surface_kind, 'agent-web-ui');
  assert.equal(accepted.launch_selection_kind, 'agent-web-ui');
  assert.equal(accepted.carrier_kind, 'agent-web-ui');
  assert.equal(accepted.carrier_implementation_kind, 'narada-agent-runtime-server');
  assert.equal(accepted.runtime_host_kind, 'narada-agent-runtime-server');
  assert.equal(accepted.runtime_substrate_kind, 'narada-agent-runtime-server');
});

test('mcp runtime contract defines fabric environment boundary', () => {
  const contract = loadMcpRuntimeContract();
  assert.equal(contract.schema, 'narada.agent_tui.mcp_runtime_contract.v0');
  assert.equal(contract.mcp_fabric_env_var, 'NARADA_AGENT_TUI_ENABLE_MCP_FABRIC');
  assert.equal(contract.mcp_config_path_policy, 'inside_site_mcp_fabric_without_parent_traversal');
});

test('terminal runtime contract defines terminal mode environment boundary', () => {
  const contract = loadTerminalRuntimeContract();
  assert.equal(contract.schema, 'narada.agent_tui.terminal_runtime_contract.v0');
  assert.equal(contract.terminal_mode_env_var, 'NARADA_AGENT_TUI_TERMINAL_MODE');
  assert.equal(contract.required_terminal_mode, 'interactive_loop');
});

test('runtime substrate contract admits carrier substrates and codex isolation boundary', () => {
  const contract = loadRuntimeSubstrateKindsContract();
  assert.equal(contract.schema, 'narada.runtime_substrate_kind.v1');
  assert.equal(contract.admitted_runtime_substrate_kinds.includes('codex'), true);
  assert.equal(contract.admitted_runtime_substrate_kinds.includes('agent-cli'), false);
  assert.equal(contract.admitted_runtime_substrate_kinds.includes('narada-agent-runtime-server'), true);
  assert.equal(contract.admitted_runtime_substrate_kinds.includes('agent-tui'), false);
  assert.equal(contract.admitted_runtime_substrate_kinds.includes('kimi'), true);
  assert.equal(contract.admitted_runtime_substrate_kinds.includes('pi'), true);
  assert.equal(contract.admitted_runtime_substrate_kinds.includes('claude-code'), true);
  assert.equal(contract.admitted_runtime_substrate_kinds.includes('opencode'), true);
  assert.equal(contract.codex_context_isolation.runtime_substrate_kind, 'codex');
  assert.equal(contract.codex_context_isolation.forbidden_resume_modes.includes('codex resume --last'), true);
});

test('carrier runtime selection keeps agent-cli carrier separate from runtime server', () => {
  const contract = loadRuntimeSubstrateKindsContract();
  assert.equal(defaultRuntimeForOperatorSurface('agent-cli'), 'narada-agent-runtime-server');
  assert.equal(defaultRuntimeForOperatorSurface('agent-web-ui'), 'narada-agent-runtime-server');
  assert.equal(defaultRuntimeForOperatorSurface('codex'), 'codex');
  assert.throws(() => defaultRuntimeForOperatorSurface('future-carrier'), /carrier_launch_matrix_row_missing:future-carrier/);

  const accepted = resolveOperatorSurfaceRuntimeSelection({
    carrierValue: 'agent-cli',
    runtimeValue: 'narada-agent-runtime-server',
    admittedRuntimeSubstrateKinds: contract.admitted_runtime_substrate_kinds,
    runtimeContractSchema: contract.schema,
  });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.schema, 'narada.operator_surface_runtime_selection.v1');
  assert.equal(accepted.legacy_schema, 'narada.carrier_runtime_selection.v1');
  assert.equal(accepted.operator_surface_kind, 'agent-cli');
  assert.equal(accepted.runtime_host_kind, 'narada-agent-runtime-server');
  assert.equal(accepted.launch_operator_surface_kind, 'agent-cli');
  assert.equal(accepted.launch_selection_kind, 'agent-cli');
  assert.equal(accepted.carrier_kind, 'agent-cli');
  assert.equal(accepted.carrier_implementation_kind, 'narada-agent-runtime-server');
  assert.equal(accepted.runtime_substrate_kind, 'narada-agent-runtime-server');

  const refused = resolveOperatorSurfaceRuntimeSelection({
    runtimeValue: 'agent-cli',
    admittedRuntimeSubstrateKinds: contract.admitted_runtime_substrate_kinds,
    runtimeContractSchema: contract.schema,
  });
  assert.equal(refused.status, 'refused');
  assert.equal(refused.reason_code, 'runtime_carrier_conflation_refused');
});

test('runtime selection uses the canonical runtime contract by default', () => {
  const accepted = resolveOperatorSurfaceRuntimeSelection({
    carrierValue: 'agent-cli',
    runtimeValue: 'nars',
  });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.runtime_contract_schema, 'narada.runtime_substrate_kind.v1');
  assert.equal(accepted.runtime_substrate_kind, 'narada-agent-runtime-server');
});

test('operator surface is the explicit primitive while carrier remains a legacy alias', () => {
  const contract = loadRuntimeSubstrateKindsContract();
  const accepted = resolveOperatorSurfaceRuntimeSelection({
    operatorSurfaceValue: 'agent-cli',
    runtimeValue: 'narada-agent-runtime-server',
    admittedRuntimeSubstrateKinds: contract.admitted_runtime_substrate_kinds,
    runtimeContractSchema: contract.schema,
  });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.schema, 'narada.operator_surface_runtime_selection.v1');
  assert.equal(accepted.operator_surface_kind, 'agent-cli');
  assert.equal(accepted.launch_operator_surface_kind, 'agent-cli');
  assert.equal(accepted.runtime_host_kind, 'narada-agent-runtime-server');
  assert.equal(accepted.launch_selection_kind, 'agent-cli');
  assert.equal(accepted.carrier_kind, 'agent-cli');
  assert.equal(accepted.carrier_implementation_kind, 'narada-agent-runtime-server');
  assert.equal(accepted.runtime_substrate_kind, 'narada-agent-runtime-server');
  assert.equal(accepted.compatibility.schema, 'narada.operator_surface_runtime_compatibility.v1');
  assert.equal(accepted.compatibility.status, 'transitional');
  assert.equal(accepted.compatibility.legacy_selection_field, 'carrier');
  assert.equal(accepted.operator_surface_source_field, 'operator_surface');
  assert.equal(accepted.carrier_source_field, 'operator_surface');

  const overridden = resolveOperatorSurfaceRuntimeSelection({
    carrierValue: 'codex',
    operatorSurfaceValue: 'agent-web-ui',
    runtimeValue: 'narada-agent-runtime-server',
    admittedRuntimeSubstrateKinds: contract.admitted_runtime_substrate_kinds,
    runtimeContractSchema: contract.schema,
  });
  assert.equal(overridden.status, 'accepted');
  assert.equal(overridden.schema, 'narada.operator_surface_runtime_selection.v1');
  assert.equal(overridden.operator_surface_kind, 'agent-web-ui');
  assert.equal(overridden.launch_operator_surface_kind, 'agent-web-ui');
  assert.equal(overridden.launch_selection_kind, 'agent-web-ui');
  assert.equal(overridden.carrier_kind, 'agent-web-ui');
  assert.equal(overridden.carrier_implementation_kind, 'narada-agent-runtime-server');
  assert.equal(overridden.operator_surface_source_field, 'operator_surface');
  assert.equal(overridden.carrier_source_field, 'carrier');
});

test('nars is a runtime input alias for narada-agent-runtime-server', () => {
  const contract = loadRuntimeSubstrateKindsContract();
  assert.equal(contract.admitted_runtime_substrate_kinds.includes('nars'), false);
  assert.equal(normalizeRuntimeAlias('nars'), 'narada-agent-runtime-server');

  const accepted = resolveOperatorSurfaceRuntimeSelection({
    carrierValue: 'agent-cli',
    runtimeValue: 'nars',
    admittedRuntimeSubstrateKinds: contract.admitted_runtime_substrate_kinds,
    runtimeContractSchema: contract.schema,
  });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.schema, 'narada.operator_surface_runtime_selection.v1');
  assert.equal(accepted.launch_selection_kind, 'agent-cli');
  assert.equal(accepted.carrier_kind, 'agent-cli');
  assert.equal(accepted.carrier_implementation_kind, 'narada-agent-runtime-server');
  assert.equal(accepted.runtime_substrate_kind, 'narada-agent-runtime-server');
  assert.equal(accepted.runtime_source_field, 'runtime');
});

test('runtime boolean values contract defines shared env flag vocabulary', () => {
  const contract = loadRuntimeBooleanValuesContract();
  assert.equal(contract.schema, 'narada.carrier.runtime_boolean_values.v1');
  assert.deepEqual(contract.truthy, ['1', 'true', 'on', 'yes']);
  assert.deepEqual(contract.falsey, ['0', 'false', 'off', 'no']);
});
