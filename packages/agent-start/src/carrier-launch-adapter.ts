import { dirname, join } from 'node:path';

export function resolveToolFabricAdapter(carrierName, { schema, agentTuiCarrier, runtimeName = carrierName }) {
  const source = '.ai/mcp';
  if (carrierName === 'codex') {
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
  if (carrierName === 'agent-cli' || carrierName === 'agent-web-ui') {
    return {
      schema,
      tool_fabric_adapter_kind: 'narada-agent-runtime-server-mcp-client',
      tool_fabric_source: source,
      runtime_substrate_kind: runtimeName,
      adapter_entrypoint: 'package:@narada2/agent-runtime-server#narada-agent-runtime-server',
      expected_tools: ['agent_context_startup_sequence', 'mcp_output_show', 'task_lifecycle_next'],
      states: ['runtime_known', 'adapter_selected', 'source_declared', 'launch_ready'],
    };
  }
  if (carrierName === agentTuiCarrier) {
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
  if (carrierName === 'pi') {
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
  if (carrierName === 'claude-code') {
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
  if (carrierName === 'opencode') {
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

export function buildCarrierSpawnArgs(carrierName, {
  agentTuiCarrier,
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
  if (carrierName === 'codex') {
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

  if (carrierName === 'agent-cli' || carrierName === 'agent-web-ui') {
    const sessionId = carrierSessionRegistration?.carrier_session_id ?? agentCliSessionName(identity);
    return [
      agentRuntimeServerScriptPath(),
      '--identity',
      identity,
      '--session',
      sessionId,
      '--site-root',
      sessionSiteRoot,
      '--operator-surface',
      carrierName,
    ];
  }

  if (carrierName === agentTuiCarrier) {
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

  if (carrierName === 'pi') {
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

  if (carrierName === 'claude-code') {
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

  if (carrierName === 'opencode') {
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

export function resolveCarrierCommand(carrierName, {
  agentTuiCarrier,
  processPlatform,
  processExecPath,
  stableNodeCommand,
  defaultClaudeCodeCommand,
  claudeCodeCommand,
  opencodeCommand,
}) {
  if (carrierName === agentTuiCarrier) return 'cargo';
  if (processPlatform === 'win32' && carrierName === 'codex') return processExecPath;
  if (carrierName === 'agent-cli' || carrierName === 'agent-web-ui') return processExecPath;
  if (carrierName === 'pi') return stableNodeCommand();
  if (carrierName === 'claude-code') return claudeCodeCommand ?? defaultClaudeCodeCommand;
  if (carrierName === 'opencode') return opencodeCommand ?? 'opencode';
  return carrierName;
}

export function carrierSpawnOptions(carrierName) {
  if (carrierName === 'opencode') return { shell: false };
  return {};
}

export function carrierSpecificEnvironment(carrierName, {
  processEnv = {},
  defaultPiProvider,
  defaultPiModel,
  defaultClaudeCodeCommand,
  defaultClaudeCodeModel,
} = {}) {
  if (carrierName === 'pi') {
    return {
      NARADA_PI_COMMAND: processEnv.NARADA_PI_COMMAND ?? 'pi',
      NARADA_PI_PROVIDER: processEnv.NARADA_PI_PROVIDER ?? defaultPiProvider,
      NARADA_PI_MODEL: processEnv.NARADA_PI_MODEL ?? defaultPiModel,
    };
  }
  if (carrierName === 'claude-code') {
    return {
      NARADA_CLAUDE_CODE_COMMAND: processEnv.NARADA_CLAUDE_CODE_COMMAND ?? defaultClaudeCodeCommand,
      NARADA_CLAUDE_CODE_MODEL: processEnv.NARADA_CLAUDE_CODE_MODEL ?? defaultClaudeCodeModel,
    };
  }
  if (carrierName === 'opencode') {
    return {
      NARADA_OPENCODE_COMMAND: processEnv.NARADA_OPENCODE_COMMAND ?? 'opencode',
    };
  }
  return {};
}

export function redactEnvironmentForOutput(env = {}) {
  return Object.fromEntries(Object.entries(env).map(([key, value]) => [
    key,
    shouldRedactEnvironmentValue(key, value) ? '<set>' : value,
  ]));
}

export function stripCodexSubscriptionOpenAIEnvironment(env = {}) {
  const scrubbed = { ...env };
  delete scrubbed.OPENAI_API_KEY;
  delete scrubbed.OPENAI_BASE_URL;
  delete scrubbed.OPENAI_MODEL;
  return scrubbed;
}

function shouldRedactEnvironmentValue(key, value) {
  if (!value) return false;
  return /(_API_KEY|_TOKEN|_SECRET|PASSWORD|CREDENTIAL)/i.test(String(key));
}

export function buildCarrierEnvironmentProjection({
  carrierName,
  startResult,
  carrierEnvironment = {},
  intelligenceProviderEnv = {},
  mcpProviderCredentialEnv = {},
  agentTuiEnvironment = {},
  runtimeEnvironment = {},
  identity,
  agentStartEventId,
  targetSiteId,
  environmentSiteRoot,
  workspaceRoot,
  dbPath,
  siteConfig = null,
}) {
  const shouldStripOpenAIEnvironment = intelligenceProviderEnv.NARADA_INTELLIGENCE_PROVIDER === 'codex-subscription';
  const projectedCarrierEnvironment = shouldStripOpenAIEnvironment
    ? stripCodexSubscriptionOpenAIEnvironment(carrierEnvironment)
    : carrierEnvironment;
  const projectedStartRequiredEnvironment = shouldStripOpenAIEnvironment
    ? stripCodexSubscriptionOpenAIEnvironment(startResult.required_environment ?? {})
    : (startResult.required_environment ?? {});
  const projectedStartWouldSetEnvironment = shouldStripOpenAIEnvironment
    ? stripCodexSubscriptionOpenAIEnvironment(startResult.would_set_environment ?? {})
    : (startResult.would_set_environment ?? {});
  const commonEnvironment = {
    ...projectedCarrierEnvironment,
    ...intelligenceProviderEnv,
    ...mcpProviderCredentialEnv,
    ...agentTuiEnvironment,
    ...runtimeEnvironment,
    NARADA_AGENT_ID: identity,
    ...(startResult.role ? { NARADA_AGENT_ROLE: startResult.role } : {}),
    NARADA_AGENT_START_EVENT_ID: agentStartEventId,
    ...(targetSiteId ? { NARADA_SITE_ID: targetSiteId } : {}),
    NARADA_SITE_ROOT: environmentSiteRoot,
    NARADA_WORKSPACE_ROOT: workspaceRoot,
    NARADA_AGENT_CONTEXT_DB: dbPath,
    ...(siteConfig ? { NARADA_SITE_CONFIG: JSON.stringify(siteConfig) } : {}),
  };
  return {
    requiredEnvironment: redactEnvironmentForOutput({
      ...projectedStartRequiredEnvironment,
      ...commonEnvironment,
    }),
    wouldSetEnvironment: startResult.would_set_environment
      ? redactEnvironmentForOutput({
        ...projectedStartWouldSetEnvironment,
        ...commonEnvironment,
      })
      : startResult.would_set_environment,
    runtimeEnvironment,
    carrierName,
  };
}

export function buildNarsLaunchPacket(carrierName, {
  processExecPath,
  carrierSessionRegistration,
  targetSiteId,
  sessionSiteRoot,
  siteCarrierControlPath,
  siteCarrierSessionPath,
}) {
  if (carrierName !== 'agent-cli' && carrierName !== 'agent-web-ui') return null;
  const sessionId = carrierSessionRegistration.carrier_session_id;
  return {
    schema: 'narada.agent_start.nars_launch.v1',
    session_id: sessionId,
    runtime_session_id: sessionId,
    nars_session_id: sessionId,
    ...(targetSiteId ? { site_id: targetSiteId } : {}),
    runtime_host_kind: 'narada-agent-runtime-server',
    carrier_runtime_kind: 'narada-agent-runtime-server',
    launch_operator_surface_kind: carrierName,
    operator_surface_kind: carrierName,
    control_transport: 'jsonl_sideband_file',
    carrier_relation: 'narada_agent_runtime_server',
    runtime_server: {
      package: '@narada2/agent-runtime-server',
      entrypoint: 'narada-agent-runtime-server',
      runtime_kind: 'narada-agent-runtime-server',
    },
    command: processExecPath,
    session_dir: dirname(siteCarrierControlPath(sessionId)),
    control_path: siteCarrierControlPath(sessionId),
    session_path: siteCarrierSessionPath(sessionId),
    site_mcp_fabric: join(sessionSiteRoot, '.ai', 'mcp'),
    reads_only_target_site_mcp_fabric: true,
    user_site_mcp_injected: false,
    native_shell_authority_admitted: false,
  };
}

export function shellQuote(arg) {
  const text = String(arg);
  if (!/[\s"'\\]/.test(text)) return text;
  return '"' + text.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}
