import { dirname, join } from 'node:path';
import {
  operatorSurfaceLaunchMatrixRow,
  NARADA_AGENT_RUNTIME_SERVER_KIND,
  normalizeRuntimeAlias,
  operatorSurfaceKindsForRuntimeHost,
} from '@narada-core/operator-surface-runtime-contract/operator-surface-runtime-selection';

const NARS_OPERATOR_SURFACE_KINDS: any = new Set(operatorSurfaceKindsForRuntimeHost(NARADA_AGENT_RUNTIME_SERVER_KIND));

export function stripLegacyIntelligenceSelectionEnvironment(env: any = {}) : any{
  const scrubbed: any = { ...env };
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

export function stripInheritedIntelligenceLaunchContextEnvironment(env: any = {}) : any{
  const scrubbed: any = { ...env };
  delete scrubbed.NARADA_INTELLIGENCE_REGISTRY_DB;
  delete scrubbed.NARADA_INTELLIGENCE_TARGET_SITE;
  delete scrubbed.NARADA_INTELLIGENCE_USER_SITE;
  delete scrubbed.NARADA_INTELLIGENCE_HOST_SITE;
  delete scrubbed.NARADA_INTELLIGENCE_PRINCIPAL_ID;
  delete scrubbed.NARADA_INTELLIGENCE_KERNEL;
  return scrubbed;
}

function isNarsOperatorSurface(carrierName: any) : any{
  return NARS_OPERATOR_SURFACE_KINDS.has(carrierName);
}

function requireCarrierLaunchMatrixRow(launchSelectionKind: any) : any{
  const matrixRow: any = operatorSurfaceLaunchMatrixRow(launchSelectionKind);
  if (!matrixRow) {
    throw new Error('carrier_launch_matrix_row_missing:' + launchSelectionKind);
  }
  return matrixRow;
}

export function resolveToolFabricAdapter(carrierName: any, { schema, agentTuiCarrier, runtimeName }: any = {}) : any{
  const launchSelectionKind: any = carrierName === agentTuiCarrier ? 'agent-tui' : carrierName;
  const matrixRow: any = requireCarrierLaunchMatrixRow(launchSelectionKind);
  const effectiveRuntimeName: any = runtimeName == null
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

function codexTomlString(value: any) : any{
  return JSON.stringify(String(value));
}

function codexTomlArray(values: any) : any{
  return `[${values.map(codexTomlString).join(', ')}]`;
}

export function codexMcpDefinitionArgs(servers: any) : any{
  return servers.flatMap((server: any) => [
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

function startupAffordancePrompt(identity: any, carrierDescription: any) : any{
  return `You are ${identity}. The human is Operator. This session was launched by Narada agent-start. ${carrierDescription} Use agent_context_startup_sequence first. Treat operator startup nudges as this MCP startup affordance, not shell or file discovery. If the startup MCP tool is unavailable, report the missing MCP capability. When a Narada tool returns reader_tool=mcp_output_show, call mcp_output_show with the returned output_ref before deciding next work.`;
}

export function buildCarrierSpawnArgs(carrierName: any, {
  agentTuiCarrier,
  identity,
  yoloFlag,
  enableNativeShellFlag,
  processPlatform,
  runtimeEngineKind = 'node',
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
}: any) : any{
  const launchSelectionKind: any = carrierName === agentTuiCarrier ? 'agent-tui' : carrierName;
  const matrixRow: any = requireCarrierLaunchMatrixRow(launchSelectionKind);

  if (carrierName === 'codex') {
    const args: any = [
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
    const sessionId: any = carrierSessionRegistration?.carrier_session_id ?? agentCliSessionName(identity);
    const runtimeArgs: any[] = [
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
    return runtimeEngineKind === 'rust'
      ? runtimeArgs
      : [agentRuntimeServerScriptPath(), ...runtimeArgs];
  }

  if (carrierName === agentTuiCarrier) {
    const sessionId: any = carrierSessionRegistration?.carrier_session_id ?? agentCliSessionName(identity);
    return [
      'run',
      '--manifest-path',
      join(naradaPackageRoot('@narada-core/agent-tui'), 'Cargo.toml'),
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

  const spawnArgs: any = ['-S', identity];
  if (yoloFlag) {
    spawnArgs.push('-y');
  }
  return spawnArgs;
}

export function resolveCarrierCommand(carrierName: any, {
  agentTuiCarrier,
  processPlatform,
  processExecPath,
  runtimeEngineKind = 'node',
  runtimeEngineCommand = null,
  stableNodeCommand,
  defaultClaudeCodeCommand,
  claudeCodeCommand,
  opencodeCommand,
}: any) : any{
  const launchSelectionKind: any = carrierName === agentTuiCarrier ? 'agent-tui' : carrierName;
  const matrixRow: any = requireCarrierLaunchMatrixRow(launchSelectionKind);
  if (processPlatform === 'win32' && carrierName === 'codex') return processExecPath;
  if (matrixRow.runtime_host_kind === NARADA_AGENT_RUNTIME_SERVER_KIND) {
    return runtimeEngineCommand ?? (runtimeEngineKind === 'node' ? processExecPath : runtimeEngineKind);
  }
  if (carrierName === agentTuiCarrier) return 'cargo';
  if (carrierName === 'pi') return stableNodeCommand();
  if (carrierName === 'claude-code') return claudeCodeCommand ?? defaultClaudeCodeCommand;
  if (carrierName === 'opencode') return opencodeCommand ?? 'opencode';
  return carrierName;
}

export function carrierSpawnOptions(carrierName: any) : any{
  requireCarrierLaunchMatrixRow(carrierName);
  if (carrierName === 'opencode') return { shell: false, windowsHide: true };
  return { windowsHide: true };
}

export function carrierSpecificEnvironment(carrierName: any, {
  processEnv = {},
  defaultPiProvider,
  defaultPiModel,
  defaultClaudeCodeCommand,
  defaultClaudeCodeModel,
}: any = {}) : any{
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

export function redactEnvironmentForOutput(env: any = {}) : any{
  return Object.fromEntries(Object.entries(env).map(([key, value]: any) => [
    key,
    shouldRedactEnvironmentValue(key, value) ? '<set>' : value,
  ]));
}

export function stripCodexSubscriptionOpenAIEnvironment(env: any = {}) : any{
  const scrubbed: any = { ...env };
  delete scrubbed.OPENAI_API_KEY;
  delete scrubbed.OPENAI_BASE_URL;
  delete scrubbed.OPENAI_MODEL;
  return scrubbed;
}

function shouldRedactEnvironmentValue(key: any, value: any) : any{
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
  intelligenceEnvironment = {},
  launchSessionId = null,
  processOwnership = null,
  processRole = null,
  createdByPid = null,
}: any) : any{
  const projectedCarrierEnvironment: any = isNarsOperatorSurface(carrierName)
    ? stripInheritedIntelligenceLaunchContextEnvironment(stripLegacyIntelligenceSelectionEnvironment(carrierEnvironment))
    : carrierEnvironment;
  const projectedStartRequiredEnvironment: any = isNarsOperatorSurface(carrierName)
    ? stripInheritedIntelligenceLaunchContextEnvironment(stripLegacyIntelligenceSelectionEnvironment(startResult.required_environment ?? {}))
    : (startResult.required_environment ?? {});
  const projectedStartWouldSetEnvironment: any = isNarsOperatorSurface(carrierName)
    ? stripInheritedIntelligenceLaunchContextEnvironment(stripLegacyIntelligenceSelectionEnvironment(startResult.would_set_environment ?? {}))
    : (startResult.would_set_environment ?? {});
  const commonEnvironment: any = {
    ...projectedCarrierEnvironment,
    ...agentTuiEnvironment,
    ...runtimeEnvironment,
    ...(isNarsOperatorSurface(carrierName) ? intelligenceEnvironment : {}),
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
  intelligenceEnvironment = {},
  launchSessionId = null,
  processOwnership = null,
  processRole = null,
  createdByPid = null,
  runtimeProcessCreatorPid = null,
  runtimeProcessRole = 'runtime_server',
}: any) : any{
  const processEnvironment: any = buildCarrierProcessEnvironment({
    processEnvironment: {},
    carrierEnvironment,
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
    intelligenceEnvironment,
    launchSessionId,
    processOwnership,
    processRole,
    createdByPid,
    runtimeProcessCreatorPid,
    runtimeProcessRole,
  });
  const startRequiredEnvironment: any = isNarsOperatorSurface(carrierName)
    ? stripLegacyIntelligenceSelectionEnvironment(startResult.required_environment ?? {})
    : (startResult.required_environment ?? {});
  return {
    ...startRequiredEnvironment,
    ...processEnvironment,
  };
}

export function buildCarrierProcessEnvironment({
  processEnvironment = process.env,
  carrierEnvironment = {},
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
  intelligenceEnvironment = {},
  launchSessionId = null,
  processOwnership = null,
  processRole = null,
  createdByPid = null,
  runtimeProcessCreatorPid = null,
  runtimeProcessRole = null,
}: any) : any{
  const effectiveLaunchSessionId: any = launchSessionId ?? processEnvironment?.NARADA_LAUNCH_SESSION_ID ?? null;
  const effectiveProcessOwnership: any = processOwnership ?? processEnvironment?.NARADA_PROCESS_OWNERSHIP ?? null;
  const effectiveProcessRole: any = processRole ?? processEnvironment?.NARADA_PROCESS_ROLE ?? null;
  const effectiveCreatedByPid: any = createdByPid ?? processEnvironment?.NARADA_CREATED_BY_PID ?? null;
  const launchProcessEnvironment: any = {
    ...(effectiveLaunchSessionId ? { NARADA_LAUNCH_SESSION_ID: effectiveLaunchSessionId } : {}),
    ...(effectiveProcessOwnership ? { NARADA_PROCESS_OWNERSHIP: effectiveProcessOwnership } : {}),
    ...(effectiveProcessRole ? { NARADA_PROCESS_ROLE: effectiveProcessRole } : {}),
    ...(effectiveCreatedByPid ? { NARADA_CREATED_BY_PID: effectiveCreatedByPid } : {}),
  };
  const inheritedEnvironment: any = isNarsOperatorSurface(carrierName)
    ? stripInheritedIntelligenceLaunchContextEnvironment(stripLegacyIntelligenceSelectionEnvironment(processEnvironment))
    : processEnvironment;
  const projectedCarrierEnvironment: any = isNarsOperatorSurface(carrierName)
    ? stripInheritedIntelligenceLaunchContextEnvironment(stripLegacyIntelligenceSelectionEnvironment(carrierEnvironment))
    : carrierEnvironment;
  return {
    ...inheritedEnvironment,
    ...projectedCarrierEnvironment,
    ...(carrierName === 'pi' ? {} : runtimeEnvironment),
    ...(isNarsOperatorSurface(carrierName) ? intelligenceEnvironment : {}),
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

function runtimeProcessOwnershipEnvironment({ processEnvironment, runtimeProcessCreatorPid, runtimeProcessRole }: any) : any{
  if (!processEnvironment?.NARADA_LAUNCH_SESSION_ID) return {};
  const createdByPid: any = Number.isInteger(runtimeProcessCreatorPid) ? String(runtimeProcessCreatorPid) : null;
  return {
    NARADA_PROCESS_OWNERSHIP: processEnvironment.NARADA_PROCESS_OWNERSHIP ?? 'session_owned',
    NARADA_PROCESS_ROLE: runtimeProcessRole ?? processEnvironment.NARADA_PROCESS_ROLE ?? 'runtime_server',
    ...(createdByPid ? { NARADA_CREATED_BY_PID: createdByPid } : {}),
  };
}

export function buildNarsLaunchPacket(carrierName: any, {
  processExecPath,
  runtimeEngineKind = 'node',
  runtimeProfileKind = null,
  runtimeEngineCommand = null,
  carrierSessionRegistration,
  targetSiteId,
  sessionSiteRoot,
  siteMcpFabricPath = null,
  siteCarrierControlPath,
  siteCarrierSessionPath,
  intelligenceKernelKind = null,
}: any) : any{
  const matrixRow: any = operatorSurfaceLaunchMatrixRow(carrierName);
  if (!matrixRow || matrixRow.runtime_host_kind !== NARADA_AGENT_RUNTIME_SERVER_KIND) return null;
  const sessionId: any = carrierSessionRegistration.carrier_session_id;
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
    intelligence_kernel_kind: intelligenceKernelKind ?? 'narada-native',
    control_transport: 'jsonl_sideband_file',
    carrier_relation: 'narada_agent_runtime_server',
    runtime_server: {
      package: '@narada-core/agent-runtime-server',
      entrypoint: 'narada-agent-runtime-server',
      runtime_kind: matrixRow.runtime_host_kind,
    },
    runtime_engine_kind: runtimeEngineKind,
     runtime_profile_kind: runtimeProfileKind,
    command: runtimeEngineCommand ?? processExecPath,
    session_dir: dirname(siteCarrierControlPath(sessionId)),
    control_path: siteCarrierControlPath(sessionId),
    session_path: siteCarrierSessionPath(sessionId),
    site_mcp_fabric: siteMcpFabricPath ?? join(sessionSiteRoot, '.ai', 'mcp'),
    reads_only_target_site_mcp_fabric: true,
    user_site_mcp_injected: false,
    native_shell_authority_admitted: false,
  };
}

export function shellQuote(arg: any) : any{
  const text: any = String(arg);
  if (!/[\s"'\\]/.test(text)) return text;
  return '"' + text.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}
