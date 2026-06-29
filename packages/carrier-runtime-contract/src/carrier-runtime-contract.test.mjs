import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  loadLaunchSliceContract,
  loadMcpRuntimeContract,
  loadRuntimeBooleanValuesContract,
  loadRuntimeSubstrateKindsContract,
  loadTerminalRuntimeContract,
} from './carrier-runtime-contract.mjs';
import {
  defaultRuntimeForCarrier,
  normalizeRuntimeAlias,
  resolveCarrierRuntimeSelection,
} from './carrier-runtime-selection.mjs';

test('launch slice contract identifies the admitted carrier runtime', () => {
  const contract = loadLaunchSliceContract();
  assert.equal(contract.schema, 'narada.agent_tui.launch_slice_contract.v0');
  assert.equal(contract.admitted_runtime_slice, 'terminal_interactive_loop');
  assert.equal(contract.carrier_flag, '--interactive-loop');
  assert.equal(contract.terminal_mode, true);
});

test('agent-web-ui is an admitted NARS operator surface and launch carrier', () => {
  const contract = loadRuntimeSubstrateKindsContract();
  const accepted = resolveCarrierRuntimeSelection({
    carrierValue: 'agent-web-ui',
    runtimeValue: 'nars',
    admittedRuntimeSubstrateKinds: contract.admitted_runtime_substrate_kinds,
    runtimeContractSchema: contract.schema,
  });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.operator_surface_kind, 'agent-web-ui');
  assert.equal(accepted.carrier_kind, 'agent-web-ui');
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
  assert.equal(contract.admitted_runtime_substrate_kinds.includes('agent-tui'), true);
  assert.equal(contract.admitted_runtime_substrate_kinds.includes('kimi'), true);
  assert.equal(contract.admitted_runtime_substrate_kinds.includes('pi'), true);
  assert.equal(contract.admitted_runtime_substrate_kinds.includes('claude-code'), true);
  assert.equal(contract.admitted_runtime_substrate_kinds.includes('opencode'), true);
  assert.equal(contract.codex_context_isolation.runtime_substrate_kind, 'codex');
  assert.equal(contract.codex_context_isolation.forbidden_resume_modes.includes('codex resume --last'), true);
});

test('carrier runtime selection keeps agent-cli carrier separate from runtime server', () => {
  const contract = loadRuntimeSubstrateKindsContract();
  assert.equal(defaultRuntimeForCarrier('agent-cli'), 'narada-agent-runtime-server');
  assert.equal(defaultRuntimeForCarrier('agent-web-ui'), 'narada-agent-runtime-server');
  assert.equal(defaultRuntimeForCarrier('codex'), 'codex');

  const accepted = resolveCarrierRuntimeSelection({
    carrierValue: 'agent-cli',
    runtimeValue: 'narada-agent-runtime-server',
    admittedRuntimeSubstrateKinds: contract.admitted_runtime_substrate_kinds,
    runtimeContractSchema: contract.schema,
  });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.operator_surface_kind, 'agent-cli');
  assert.equal(accepted.runtime_host_kind, 'narada-agent-runtime-server');
  assert.equal(accepted.carrier_kind, 'agent-cli');
  assert.equal(accepted.runtime_substrate_kind, 'narada-agent-runtime-server');

  const refused = resolveCarrierRuntimeSelection({
    runtimeValue: 'agent-cli',
    admittedRuntimeSubstrateKinds: contract.admitted_runtime_substrate_kinds,
    runtimeContractSchema: contract.schema,
  });
  assert.equal(refused.status, 'refused');
  assert.equal(refused.reason_code, 'runtime_carrier_conflation_refused');
});

test('operator surface is the explicit primitive while carrier remains a legacy alias', () => {
  const contract = loadRuntimeSubstrateKindsContract();
  const accepted = resolveCarrierRuntimeSelection({
    operatorSurfaceValue: 'agent-cli',
    runtimeValue: 'narada-agent-runtime-server',
    admittedRuntimeSubstrateKinds: contract.admitted_runtime_substrate_kinds,
    runtimeContractSchema: contract.schema,
  });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.operator_surface_kind, 'agent-cli');
  assert.equal(accepted.runtime_host_kind, 'narada-agent-runtime-server');
  assert.equal(accepted.carrier_kind, 'agent-cli');
  assert.equal(accepted.runtime_substrate_kind, 'narada-agent-runtime-server');
  assert.equal(accepted.operator_surface_source_field, 'operator_surface');
  assert.equal(accepted.carrier_source_field, 'operator_surface');

  const overridden = resolveCarrierRuntimeSelection({
    carrierValue: 'codex',
    operatorSurfaceValue: 'agent-web-ui',
    runtimeValue: 'narada-agent-runtime-server',
    admittedRuntimeSubstrateKinds: contract.admitted_runtime_substrate_kinds,
    runtimeContractSchema: contract.schema,
  });
  assert.equal(overridden.status, 'accepted');
  assert.equal(overridden.operator_surface_kind, 'agent-web-ui');
  assert.equal(overridden.carrier_kind, 'agent-web-ui');
  assert.equal(overridden.operator_surface_source_field, 'operator_surface');
  assert.equal(overridden.carrier_source_field, 'carrier');
});

test('nars is a runtime input alias for narada-agent-runtime-server', () => {
  const contract = loadRuntimeSubstrateKindsContract();
  assert.equal(contract.admitted_runtime_substrate_kinds.includes('nars'), false);
  assert.equal(normalizeRuntimeAlias('nars'), 'narada-agent-runtime-server');

  const accepted = resolveCarrierRuntimeSelection({
    carrierValue: 'agent-cli',
    runtimeValue: 'nars',
    admittedRuntimeSubstrateKinds: contract.admitted_runtime_substrate_kinds,
    runtimeContractSchema: contract.schema,
  });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.carrier_kind, 'agent-cli');
  assert.equal(accepted.runtime_substrate_kind, 'narada-agent-runtime-server');
  assert.equal(accepted.runtime_source_field, 'runtime');
});

test('runtime boolean values contract defines shared env flag vocabulary', () => {
  const contract = loadRuntimeBooleanValuesContract();
  assert.equal(contract.schema, 'narada.carrier.runtime_boolean_values.v1');
  assert.deepEqual(contract.truthy, ['1', 'true', 'on', 'yes']);
  assert.deepEqual(contract.falsey, ['0', 'false', 'off', 'no']);
});
