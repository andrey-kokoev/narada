import { dirname, join } from 'node:path';
import {
  operatorSurfaceLaunchMatrixRow,
  NARADA_AGENT_RUNTIME_SERVER_KIND,
  normalizeRuntimeAlias,
  operatorSurfaceKindsForRuntimeHost,
} from '@narada2/operator-surface-runtime-contract/operator-surface-runtime-selection';

const NARS_OPERATOR_SURFACE_KINDS = new Set(operatorSurfaceKindsForRuntimeHost(NARADA_AGENT_RUNTIME_SERVER_KIND));

export function stripLegacyIntelligenceSelectionEnvironment(env = {}) {
  const scrubbed = { ...env };
  delete scrubbed.NARADA_INTELLIGENCE_PROVIDER;
  delete scrubbed.NARADA_INTELLIGENCE_PROVIDER_SOURCE_FIELD;
  delete scrubbed.NARADA_INTELLIGENCE_PROVIDER_SOURCE_PATH;
  delete scrubbed.NARADA_INTELLIGENCE_PROVIDER_METADATA_PATH;
  delete scrubbed.NARADA_AI_MODEL;
  delete scrubbed.NARADA_AI_BASE_URL;
  delete scrubbed.NARADA_AI_THINKING;
  delete scrubbed.NARADA_THINKING_LEVEL;
  delete scrubbed.CODEX_MODEL;
  delete scrubbed.NARADA_CODEX_MODEL;
  delete scrubbed.OPENAI_MODEL;
  delete scrubbed.OPENAI_BASE_URL;
  delete scrubbed.KIMI_MODEL;
  delete scrubbed.KIMI_API_BASE_URL;
  delete scrubbed.KIMI_CODE_MODEL;
  delete scrubbed.KIMI_CODE_API_BASE_URL;
  delete scrubbed.ANTHROPIC_MODEL;
  delete scrubbed.ANTHROPIC_BASE_URL;
  delete scrubbed.DEEPSEEK_MODEL;
  delete scrubbed.DEEPSEEK_API_BASE_URL;
  delete scrubbed.GLM_MODEL;
  delete scrubbed.GLM_API_BASE_URL;
  delete scrubbed.OPENROUTER_MODEL;
  delete scrubbed.OPENROUTER_BASE_URL;
  delete scrubbed.OPENROUTER_API_BASE_URL;
  delete scrubbed.CLOUDFLARE_CARRIER_AI_MODEL;
  return scrubbed;
}

function isNarsOperatorSurface(carrierName) {
  return NARS_OPERATOR_SURFACE_KINDS.has(carrierName);
}

function requireCarrierLaunchMatrixRow(launchSelectionKind) {
  const matrixRow = operatorSurfaceLaunchMatrixRow(launchSelectionKind);
  if (!matrixRow) {
    throw new Error('carrier_launch_matrix_row_missing:' + launchSelectionKind);
  }
  return matrixRow;
}

export function resolveToolFabricAdapter(carrierName, { schema, agentTuiCarrier, runtimeName } = {}) {
  const launchSelectionKind = carrierName === agentTuiCarrier ? 'agent-tui' : carrierName;
  const matrixRow = requireCarrierLaunchMatrixRow(launchSelectionKind);
  const effectiveRuntimeName = runtimeName == null
    ? matrixRow.runtime_substrate_kind
    : normalizeRuntimeAlias(runtimeName);
  if (effectiveRuntimeName !== matrixRow.runtime_substrate_kind) {
    throw new Error(`carrier_launch_matrix_runtime_mismatch:${launchSelectionKind}:${effectiveRuntimeName}:${matrixRow.runtime_substrate_kind}`);
  }
  return {
    schema,
    tool_fabric_adapter_kind: matrixRow.tool_fabric_adapter_kind,
    tool_fabric_source: matrixRow.tool_fabric_source,
    runtime_substrate_kind: effectiveRuntimeName,
    runtime_host_kind: matrixRow.runtime_host_kind,
    launch_selection_kind: matrixRow.launch_selection_kind,
    operator_surface_kind: matrixRow.operator_surface_kind,
    carrier_implementation_kind: matrixRow.carrier_implementation_kind,
    adapter_entrypoint: matrixRow.adapter_entrypoint,
    projection_capabilities: [...matrixRow.projection_capabilities],
    expected_tools: [...matrixRow.expected_tools],
    expected_tools_scope: matrixRow.expected_tools_scope,
    states: [...matrixRow.states],
    ...(matrixRow.admission_basis ? { admission_basis: matrixRow.admission_basis } : {}),
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
  runtimeAuthority,
}) {
  const launchSelectionKind = carrierName === agentTuiCarrier ? 'agent-tui' : carrierName;
  const matrixRow = requireCarrierLaunchMatrixRow(launchSelectionKind);

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

  if (matrixRow.runtime_host_kind === NARADA_AGENT_RUNTIME_SERVER_KIND) {
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
      '--authority',
      runtimeAuthority ?? 'read',
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
      startupAffordancePrompt(identity, 'This carrier path injects the Narada startup affordance as a prompt only; it does not attach or verify Narada MCP servers.'),
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
  const launchSelectionKind = carrierName === agentTuiCarrier ? 'agent-tui' : carrierName;
  const matrixRow = requireCarrierLaunchMatrixRow(launchSelectionKind);
  if (processPlatform === 'win32' && carrierName === 'codex') return processExecPath;
  if (matrixRow.runtime_host_kind === NARADA_AGENT_RUNTIME_SERVER_KIND) return processExecPath;
  if (carrierName === agentTuiCarrier) return 'cargo';
  if (carrierName === 'pi') return stableNodeCommand();
  if (carrierName === 'claude-code') return claudeCodeCommand ?? defaultClaudeCodeCommand;
  if (carrierName === 'opencode') return opencodeCommand ?? 'opencode';
  return carrierName;
}

export function carrierSpawnOptions(carrierName) {
  requireCarrierLaunchMatrixRow(carrierName);
  if (carrierName === 'opencode') return { shell: false, windowsHide: true };
  return { windowsHide: true };
}

export function carrierSpecificEnvironment(carrierName, {
  processEnv = {},
  defaultPiProvider,
  defaultPiModel,
  defaultClaudeCodeCommand,
  defaultClaudeCodeModel,
} = {}) {
  requireCarrierLaunchMatrixRow(carrierName);
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
  agentTuiEnvironment = {},
  runtimeEnvironment = {},
  identity,
  agentStartEventId,
  targetSiteId,
  environmentSiteRoot,
  workspaceRoot,
  dbPath,
  siteConfig = null,
  mcpScope = null,
  launchSessionId = null,
  processOwnership = null,
  processRole = null,
  createdByPid = null,
}) {
  const projectedCarrierEnvironment = isNarsOperatorSurface(carrierName)
    ? stripLegacyIntelligenceSelectionEnvironment(carrierEnvironment)
    : carrierEnvironment;
  const projectedStartRequiredEnvironment = isNarsOperatorSurface(carrierName)
    ? stripLegacyIntelligenceSelectionEnvironment(startResult.required_environment ?? {})
    : (startResult.required_environment ?? {});
  const projectedStartWouldSetEnvironment = isNarsOperatorSurface(carrierName)
    ? stripLegacyIntelligenceSelectionEnvironment(startResult.would_set_environment ?? {})
    : (startResult.would_set_environment ?? {});
  const commonEnvironment = {
    ...projectedCarrierEnvironment,
    ...agentTuiEnvironment,
    ...runtimeEnvironment,
    NARADA_AGENT_ID: identity,
    ...(startResult.role ? { NARADA_AGENT_ROLE: startResult.role } : {}),
    NARADA_AGENT_START_EVENT_ID: agentStartEventId,
    ...(targetSiteId ? { NARADA_SITE_ID: targetSiteId } : {}),
    ...(launchSessionId ? { NARADA_LAUNCH_SESSION_ID: launchSessionId } : {}),
    ...(processOwnership ? { NARADA_PROCESS_OWNERSHIP: processOwnership } : {}),
    ...(processRole ? { NARADA_PROCESS_ROLE: processRole } : {}),
    ...(createdByPid ? { NARADA_CREATED_BY_PID: createdByPid } : {}),
    NARADA_SITE_ROOT: environmentSiteRoot,
    NARADA_WORKSPACE_ROOT: workspaceRoot,
    NARADA_AGENT_CONTEXT_DB: dbPath,
    ...(siteConfig ? { NARADA_SITE_CONFIG: JSON.stringify(siteConfig) } : {}),
    ...((mcpScope ?? siteConfig?.mcp_scope) ? { NARADA_MCP_SCOPE: mcpScope ?? siteConfig.mcp_scope } : {}),
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

export function buildCarrierSpawnEnvironmentDelta({
  carrierName,
  startResult,
  carrierEnvironment = {},
  agentTuiEnvironment = {},
  runtimeEnvironment = {},
  identity,
  role,
  agentStartEventId,
  carrierSessionId,
  targetSiteId,
  agentIdentityRef,
  operatorSurfaceKind,
  environmentSiteRoot,
  workspaceRoot,
  dbPath,
  siteConfig = null,
  codexMcpScope = null,
  mcpScope = null,
  launchSessionId = null,
  processOwnership = null,
  processRole = null,
  createdByPid = null,
  runtimeProcessCreatorPid = null,
  runtimeProcessRole = 'runtime_server',
}) {
  const processEnvironment = buildCarrierProcessEnvironment({
    processEnvironment: {},
    runtimeEnvironment,
    agentTuiEnvironment,
    codexMcpScope,
    carrierName,
    identity,
    role,
    agentStartEventId,
    carrierSessionId,
    targetSiteId,
    agentIdentityRef,
    operatorSurfaceKind,
    environmentSiteRoot,
    workspaceRoot,
    dbPath,
    siteConfig,
    mcpScope,
    launchSessionId,
    processOwnership,
    processRole,
    createdByPid,
    runtimeProcessCreatorPid,
    runtimeProcessRole,
  });
  const startRequiredEnvironment = isNarsOperatorSurface(carrierName)
    ? stripLegacyIntelligenceSelectionEnvironment(startResult.required_environment ?? {})
    : (startResult.required_environment ?? {});
  return {
    ...startRequiredEnvironment,
    ...processEnvironment,
  };
}

export function buildCarrierProcessEnvironment({
  processEnvironment = process.env,
  runtimeEnvironment = {},
  agentTuiEnvironment = {},
  codexMcpScope = null,
  carrierName,
  identity,
  role,
  agentStartEventId,
  carrierSessionId,
  targetSiteId,
  agentIdentityRef,
  operatorSurfaceKind,
  environmentSiteRoot,
  workspaceRoot,
  dbPath,
  siteConfig,
  mcpScope,
  launchSessionId = null,
  processOwnership = null,
  processRole = null,
  createdByPid = null,
  runtimeProcessCreatorPid = null,
  runtimeProcessRole = null,
}) {
  const effectiveLaunchSessionId = launchSessionId ?? processEnvironment?.NARADA_LAUNCH_SESSION_ID ?? null;
  const effectiveProcessOwnership = processOwnership ?? processEnvironment?.NARADA_PROCESS_OWNERSHIP ?? null;
  const effectiveProcessRole = processRole ?? processEnvironment?.NARADA_PROCESS_ROLE ?? null;
  const effectiveCreatedByPid = createdByPid ?? processEnvironment?.NARADA_CREATED_BY_PID ?? null;
  const launchProcessEnvironment = {
    ...(effectiveLaunchSessionId ? { NARADA_LAUNCH_SESSION_ID: effectiveLaunchSessionId } : {}),
    ...(effectiveProcessOwnership ? { NARADA_PROCESS_OWNERSHIP: effectiveProcessOwnership } : {}),
    ...(effectiveProcessRole ? { NARADA_PROCESS_ROLE: effectiveProcessRole } : {}),
    ...(effectiveCreatedByPid ? { NARADA_CREATED_BY_PID: effectiveCreatedByPid } : {}),
  };
  const inheritedEnvironment = isNarsOperatorSurface(carrierName)
    ? stripLegacyIntelligenceSelectionEnvironment(processEnvironment)
    : processEnvironment;
  return {
    ...inheritedEnvironment,
    ...(carrierName === 'pi' ? {} : runtimeEnvironment),
    NARADA_AGENT_ID: identity,
    ...(role ? { NARADA_AGENT_ROLE: role } : {}),
    NARADA_AGENT_START_EVENT_ID: agentStartEventId,
    NARADA_CARRIER_SESSION_ID: carrierSessionId,
    NARADA_OPERATOR_SURFACE_KIND: operatorSurfaceKind,
    ...(targetSiteId ? { NARADA_SITE_ID: targetSiteId } : {}),
    ...(agentIdentityRef ? { NARADA_AGENT_IDENTITY_REF: JSON.stringify(agentIdentityRef) } : {}),
    NARADA_SITE_ROOT: environmentSiteRoot,
    NARADA_WORKSPACE_ROOT: workspaceRoot,
    NARADA_AGENT_CONTEXT_DB: dbPath,
    ...(siteConfig ? { NARADA_SITE_CONFIG: JSON.stringify(siteConfig) } : {}),
    ...((mcpScope ?? siteConfig?.mcp_scope) ? { NARADA_MCP_SCOPE: mcpScope ?? siteConfig.mcp_scope } : {}),
    ...launchProcessEnvironment,
    ...runtimeProcessOwnershipEnvironment({
      processEnvironment: { ...processEnvironment, ...launchProcessEnvironment },
      runtimeProcessCreatorPid,
      runtimeProcessRole,
    }),
    ...agentTuiEnvironment,
    ...(codexMcpScope?.status === 'materialized' ? { CODEX_HOME: codexMcpScope.codex_home, CODEX_CONFIG_DIR: codexMcpScope.codex_home } : {}),
  };
}

function runtimeProcessOwnershipEnvironment({ processEnvironment, runtimeProcessCreatorPid, runtimeProcessRole }) {
  if (!processEnvironment?.NARADA_LAUNCH_SESSION_ID) return {};
  const createdByPid = Number.isInteger(runtimeProcessCreatorPid) ? String(runtimeProcessCreatorPid) : null;
  return {
    NARADA_PROCESS_OWNERSHIP: processEnvironment.NARADA_PROCESS_OWNERSHIP ?? 'session_owned',
    NARADA_PROCESS_ROLE: runtimeProcessRole ?? processEnvironment.NARADA_PROCESS_ROLE ?? 'runtime_server',
    ...(createdByPid ? { NARADA_CREATED_BY_PID: createdByPid } : {}),
  };
}

export function buildNarsLaunchPacket(carrierName, {
  processExecPath,
  carrierSessionRegistration,
  targetSiteId,
  sessionSiteRoot,
  siteMcpFabricPath = null,
  siteCarrierControlPath,
  siteCarrierSessionPath,
}) {
  const matrixRow = operatorSurfaceLaunchMatrixRow(carrierName);
  if (!matrixRow || matrixRow.runtime_host_kind !== NARADA_AGENT_RUNTIME_SERVER_KIND) return null;
  const sessionId = carrierSessionRegistration.carrier_session_id;
  return {
    schema: 'narada.agent_start.nars_launch.v1',
    session_id: sessionId,
    runtime_session_id: sessionId,
    nars_session_id: sessionId,
    ...(targetSiteId ? { site_id: targetSiteId } : {}),
    runtime_host_kind: matrixRow.runtime_host_kind,
    carrier_runtime_kind: matrixRow.carrier_implementation_kind,
    launch_operator_surface_kind: matrixRow.operator_surface_kind,
    operator_surface_kind: matrixRow.operator_surface_kind,
    control_transport: 'jsonl_sideband_file',
    carrier_relation: 'narada_agent_runtime_server',
    runtime_server: {
      package: '@narada2/agent-runtime-server',
      entrypoint: 'narada-agent-runtime-server',
      runtime_kind: matrixRow.runtime_host_kind,
    },
    command: processExecPath,
    session_dir: dirname(siteCarrierControlPath(sessionId)),
    control_path: siteCarrierControlPath(sessionId),
    session_path: siteCarrierSessionPath(sessionId),
    site_mcp_fabric: siteMcpFabricPath ?? join(sessionSiteRoot, '.ai', 'mcp'),
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
