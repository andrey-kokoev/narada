export function resolveToolFabricAdapter(runtimeName, { schema, agentTuiRuntime }) {
  const source = '.ai/mcp';
  if (runtimeName === 'codex') {
    return {
      schema,
      tool_fabric_adapter_kind: 'codex-native-mcp',
      tool_fabric_source: source,
      runtime_substrate_kind: runtimeName,
      adapter_entrypoint: null,
      expected_tools: ['agent_context_startup_sequence', 'mcp_output_show', 'task_lifecycle_next'],
      states: ['runtime_known', 'adapter_selected', 'source_declared', 'launch_ready'],
    };
  }
  if (runtimeName === 'agent-cli') {
    return {
      schema,
      tool_fabric_adapter_kind: 'narada-agent-cli-mcp-client',
      tool_fabric_source: source,
      runtime_substrate_kind: runtimeName,
      adapter_entrypoint: 'package:@narada2/agent-cli#narada-agent-cli',
      expected_tools: ['agent_context_startup_sequence', 'mcp_output_show', 'task_lifecycle_next'],
      states: ['runtime_known', 'adapter_selected', 'source_declared', 'launch_ready'],
    };
  }
  if (runtimeName === agentTuiRuntime) {
    return {
      schema,
      tool_fabric_adapter_kind: 'narada-agent-tui-terminal-interactive-loop',
      tool_fabric_source: 'control_jsonl_session_jsonl',
      runtime_substrate_kind: runtimeName,
      adapter_entrypoint: 'package:@narada2/agent-tui#narada-agent-tui',
      expected_tools: ['agent_context_startup_sequence', 'mcp_output_show', 'task_lifecycle_next'],
      states: ['runtime_known', 'adapter_selected', 'terminal_loop_carrier', 'launch_ready'],
    };
  }
  if (runtimeName === 'pi') {
    return {
      schema,
      tool_fabric_adapter_kind: 'pi-extension-mcp-bridge',
      tool_fabric_source: source,
      runtime_substrate_kind: runtimeName,
      adapter_entrypoint: '.pi/extensions/narada-mcp-bridge.ts',
      expected_tools: ['agent_context_startup_sequence', 'mcp_output_show', 'task_lifecycle_next', 'task_lifecycle_un_defer'],
      states: ['runtime_known', 'adapter_selected', 'source_declared', 'narada_owned_extension_bridge', 'launch_ready'],
      admission_basis: 'Narada-owned Pi extension bridges Site-local .ai/mcp tools into Pi; MCP servers remain Site-local authority surfaces.',
    };
  }
  if (runtimeName === 'claude-code') {
    return {
      schema,
      tool_fabric_adapter_kind: 'claude-code-native-mcp',
      tool_fabric_source: source,
      runtime_substrate_kind: runtimeName,
      adapter_entrypoint: 'claude --mcp-config',
      expected_tools: ['agent_context_startup_sequence', 'mcp_output_show', 'task_lifecycle_next', 'task_lifecycle_un_defer'],
      states: ['runtime_known', 'adapter_selected', 'source_declared', 'native_mcp_config_required', 'launch_ready'],
    };
  }
  if (runtimeName === 'opencode') {
    return {
      schema,
      tool_fabric_adapter_kind: 'opencode-native-mcp',
      tool_fabric_source: 'substrate-native',
      runtime_substrate_kind: runtimeName,
      adapter_entrypoint: 'opencode --prompt',
      expected_tools: ['agent_context_startup_sequence', 'mcp_output_show', 'task_lifecycle_next'],
      states: ['runtime_known', 'adapter_selected', 'source_declared', 'native_prompt_injection_required', 'launch_ready'],
    };
  }
  return {
    schema,
    tool_fabric_adapter_kind: 'ambient-carrier-tools',
    tool_fabric_source: 'substrate-native',
    runtime_substrate_kind: runtimeName,
    adapter_entrypoint: null,
    expected_tools: [],
    states: ['runtime_known', 'adapter_selected', 'no_narada_mcp_claim'],
  };
}

export function resolveRuntimeCommand(runtimeName, {
  agentTuiRuntime,
  processPlatform,
  processExecPath,
  stableNodeCommand,
  defaultClaudeCodeCommand,
  claudeCodeCommand,
  opencodeCommand,
}) {
  if (runtimeName === agentTuiRuntime) return 'cargo';
  if (processPlatform === 'win32' && runtimeName === 'codex') return processExecPath;
  if (runtimeName === 'agent-cli') return processExecPath;
  if (runtimeName === 'pi') return stableNodeCommand();
  if (runtimeName === 'claude-code') return claudeCodeCommand ?? defaultClaudeCodeCommand;
  if (runtimeName === 'opencode') return opencodeCommand ?? 'opencode';
  return runtimeName;
}

export function runtimeSpawnOptions(runtimeName) {
  if (runtimeName === 'opencode') return { shell: false };
  return {};
}

export function shellQuote(arg) {
  const text = String(arg);
  if (!/[\s"'\\]/.test(text)) return text;
  return '"' + text.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}
