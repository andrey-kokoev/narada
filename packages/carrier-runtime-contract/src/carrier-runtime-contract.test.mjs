import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  loadLaunchSliceContract,
  loadMcpRuntimeContract,
  loadRuntimeSubstrateKindsContract,
  loadTerminalRuntimeContract,
} from './carrier-runtime-contract.mjs';

test('launch slice contract identifies the admitted carrier runtime', () => {
  const contract = loadLaunchSliceContract();
  assert.equal(contract.schema, 'narada.agent_tui.launch_slice_contract.v0');
  assert.equal(contract.admitted_runtime_slice, 'terminal_interactive_loop');
  assert.equal(contract.carrier_flag, '--interactive-loop');
  assert.equal(contract.terminal_mode, true);
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
  assert.equal(contract.admitted_runtime_substrate_kinds.includes('agent-cli'), true);
  assert.equal(contract.admitted_runtime_substrate_kinds.includes('agent-tui'), true);
  assert.equal(contract.codex_context_isolation.runtime_substrate_kind, 'codex');
  assert.equal(contract.codex_context_isolation.forbidden_resume_modes.includes('codex resume --last'), true);
});
