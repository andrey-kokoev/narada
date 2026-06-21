import { join } from 'node:path';

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

function codexTomlString(value) {
  return JSON.stringify(String(value));
}

function codexTomlArray(values) {
  return `[${values.map(codexTomlString).join(', ')}]`;
}

export function codexMcpDefinitionArgs(servers) {
  return servers.flatMap((server) => [
    '-c',
    `mcp_servers.${server.name}.command=${codexTomlString(server.command)}`,
    '-c',
    `mcp_servers.${server.name}.args=${codexTomlArray(server.args)}`,
    '-c',
    `mcp_servers.${server.name}.env_vars=${codexTomlArray(server.env_vars)}`,
    ...(server.startup_timeout_sec ? [
      '-c',
      `mcp_servers.${server.name}.startup_timeout_sec=${Number(server.startup_timeout_sec)}`,
    ] : []),
  ]);
}

function startupAffordancePrompt(identity, carrierDescription) {
  return `You are ${identity}. The human is Operator. This session was launched by Narada agent-start. ${carrierDescription} Use agent_context_startup_sequence first. Treat operator startup nudges as this MCP startup affordance, not shell or file discovery. If the startup MCP tool is unavailable, report the missing MCP capability. When a Narada tool returns reader_tool=mcp_output_show, call mcp_output_show with the returned output_ref before deciding next work.`;
}

export function buildCarrierSpawnArgs(runtimeName, {
  agentTuiRuntime,
  identity,
  yoloFlag,
  enableNativeShellFlag,
  processPlatform,
  codexCliScriptPath,
  codexMcpServerDefinitions,
  agentRuntimeServerScriptPath,
  agentCliSessionName,
  carrierSessionRegistration,
  sessionSiteRoot,
  naradaPackageRoot,
  siteCarrierControlPath,
  siteCarrierSessionPath,
  agentTuiRuntimeLoop,
  agentTuiMaxSteps,
  agentTuiInteractiveLoopMaxSteps,
  piCliScriptPath,
  rootDir,
  piProvider,
  piModel,
  claudeCodeMcpConfig,
  claudeCodeModel,
}) {
  if (runtimeName === 'codex') {
    const args = [
      '--ask-for-approval',
      'never',
      ...codexMcpDefinitionArgs(codexMcpServerDefinitions()),
    ];
    args.push('--disable', 'apps');
    if (!enableNativeShellFlag) {
      args.push('--disable', 'shell_tool');
    }
    if (processPlatform === 'win32') {
      return [codexCliScriptPath(), ...args];
    }
    return args;
  }

  if (runtimeName === 'agent-cli') {
    const sessionId = carrierSessionRegistration?.carrier_session_id ?? agentCliSessionName(identity);
    return [
      agentRuntimeServerScriptPath(),
      '--identity',
      identity,
      '--session',
      sessionId,
      '--site-root',
      sessionSiteRoot,
    ];
  }

  if (runtimeName === agentTuiRuntime) {
    const sessionId = carrierSessionRegistration?.carrier_session_id ?? agentCliSessionName(identity);
    return [
      'run',
      '--manifest-path',
      join(naradaPackageRoot('@narada2/agent-tui'), 'Cargo.toml'),
      '--bin',
      'narada-agent-tui',
      '--',
      '--identity',
      identity,
      '--session',
      sessionId,
      '--site-root',
      sessionSiteRoot,
      '--control-jsonl',
      siteCarrierControlPath(sessionId),
      '--session-jsonl',
      siteCarrierSessionPath(sessionId),
      agentTuiRuntimeLoop === true ? '--runtime-loop' : '--interactive-loop',
      '--max-steps',
      String(agentTuiMaxSteps ?? agentTuiInteractiveLoopMaxSteps),
    ];
  }

  if (runtimeName === 'pi') {
    return [
      piCliScriptPath(),
      '--provider',
      piProvider,
      '--model',
      piModel,
      '--session-dir',
      join(rootDir, '.ai', 'runtime', 'pi-sessions', identity),
      '--extension',
      join(rootDir, '.pi', 'extensions', 'narada-mcp-bridge.ts'),
      '--append-system-prompt',
      startupAffordancePrompt(identity, 'Narada tools are attached through the Narada-owned Pi MCP bridge generated from the Site-local .ai/mcp fabric.'),
    ];
  }

  if (runtimeName === 'claude-code') {
    return [
      '--model',
      claudeCodeModel,
      '--permission-mode',
      'dontAsk',
      '--disallowedTools',
      'Bash',
      'Edit',
      'Write',
      'MultiEdit',
      'NotebookEdit',
      'WebFetch',
      'WebSearch',
      '--strict-mcp-config',
      '--mcp-config',
      JSON.stringify(claudeCodeMcpConfig()),
      '--append-system-prompt',
      startupAffordancePrompt(identity, 'Narada tools are attached through Claude Code native MCP config generated from the Site MCP fabric.'),
    ];
  }

  if (runtimeName === 'opencode') {
    return [
      '--prompt',
      startupAffordancePrompt(identity, 'Narada tools are attached through the Site MCP fabric declared in .ai/mcp.'),
    ];
  }

  const spawnArgs = ['-S', identity];
  if (yoloFlag) {
    spawnArgs.push('-y');
  }
  return spawnArgs;
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
