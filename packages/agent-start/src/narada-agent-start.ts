#!/usr/bin/env node
/**
 * narada-agent-start
 *
 * Thin carrier for agent-context session start.
 *
 * Authority lives in agent_context_start_session / session-start.mjs:
 * - roster validation
 * - agent_start_event materialization
 * - execution/intelligence context materializations
 * - MCP startup sequence
 *
 * The carrier only prepares substrate-local affordances and starts the runtime
 * with NARADA_AGENT_ID and NARADA_AGENT_START_EVENT_ID in the environment.
 *
 * Usage:
 *   narada-agent-start <identity> [--operator-surface <surface>] [--carrier <legacy-carrier>] [--runtime <runtime>] [--authority <auto|read|write>] [--db <path>] [--json] [--dry-run] [--exec] [--wait] [--visible-runtime-terminal] [--yolo] [--enable-native-shell] [--strict-mcp-registry] [--target-site-id <site-id>] [--target-site-root <path>]
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { buildAgentIdentityRefV2, resolveAgentIdentityRef } from '@narada2/agent-identity';
import { buildNarsAttachCommands } from '@narada2/nars-client-projection-contract';
import {
  ADMITTED_CARRIER_KINDS,
  AGENT_CLI_CARRIER_KIND,
  resolveCarrierRuntimeSelection,
} from '@narada2/carrier-runtime-contract/carrier-runtime-selection';
import {
  carrierControlPath,
  carrierSessionPath,
  materializeCarrierLaunchFiles as materializeCarrierLaunchFilesArtifact,
  materializeCarrierSessionRecord as materializeCarrierSessionRecordArtifact,
  siteNaradaRoot,
  writeLaunchResultFile,
} from './carrier-launch-artifacts.ts';
import {
  buildNarsLaunchPacket,
  buildCarrierEnvironmentProjection,
  buildCarrierSpawnEnvironmentDelta,
  buildCarrierProcessEnvironment,
  buildCarrierSpawnArgs,
  carrierSpecificEnvironment,
  resolveCarrierCommand,
  resolveToolFabricAdapter as resolveCarrierToolFabricAdapter,
  carrierSpawnOptions,
  shellQuote,
  stripCodexSubscriptionOpenAIEnvironment,
} from './carrier-launch-adapter.ts';
import { createNaradaPackageResolver } from './narada-package-resolver.ts';
import {
  codexContextIsolationStatus,
  codexSubscriptionPreflight as runCodexSubscriptionPreflight,
  resolveCodexCliScriptPath,
} from './codex-subscription-support.ts';
import {
  INTELLIGENCE_PROVIDER_CONTRACT_SCHEMA,
  loadIntelligenceProviderRegistry,
  loadSiteEnvFiles,
  resolveIntelligenceProviderInputSource,
  resolveIntelligenceProviderLaunch,
  withResolutionStates,
} from './provider-resolution.ts';
import {
  annotateIntelligenceProviderCredential,
  intelligenceProviderEnvironmentProjection as projectIntelligenceProviderEnvironment,
  mcpProviderCredentialEnvironment as projectMcpProviderCredentialEnvironment,
  providerCredentialRefusal as buildProviderCredentialRefusal,
} from './provider-credential-projection.ts';
import { resolveAgentStartExecutionPosture, spawnCarrierProcessAndExit, waitForEnterBeforeCarrier } from './carrier-process-launch.ts';
import { canonicalJson, identityToken, mcpScopeLoci, normalizeMcpScope, parseArgs } from './launcher-cli-contract.ts';
import { buildLauncherContracts, buildRuntimeHealthPosture, startupCommandFromSequence } from './launch-result-contracts.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRootDir = join(__dirname, '..');
const naradaProperRoot = join(packageRootDir, '..', '..');

const SITE_ENV_BINDINGS = new Map();

const args = parseArgs(process.argv.slice(2));
const identity = args.identity;
const rootDir = args.site_root ?? args.target_site_root ?? process.env.NARADA_LAUNCH_REGISTRY_SITE_ROOT ?? process.env.NARADA_TARGET_SITE_ROOT ?? process.cwd();
const NARADA_PROPER_ROOT = process.env.NARADA_PROPER_ROOT ?? naradaProperRoot;
const candidateSiteToolsRoot = args.site_tools_root ?? join(rootDir, 'tools');
const siteLocalToolsRoot = join(siteNaradaRoot(rootDir), 'tools');
const packagedCommonToolsRoot = join(NARADA_PROPER_ROOT, 'packages', 'site-common-tools', 'src');
let packagedAgentContextSessionStartPath;
try {
  packagedAgentContextSessionStartPath = require.resolve('@narada2/agent-context-mcp/session-start');
} catch {
  packagedAgentContextSessionStartPath = join(NARADA_PROPER_ROOT, 'packages', 'agent-context-tools', 'src', 'session-start.mjs');
}
const commonToolsRoot = existsSync(join(candidateSiteToolsRoot, 'incubation', 'write-file-utf8.mjs'))
  ? candidateSiteToolsRoot
  : existsSync(join(siteLocalToolsRoot, 'incubation', 'write-file-utf8.mjs'))
    ? siteLocalToolsRoot
    : packagedCommonToolsRoot;
const explicitAgentContextSessionStartPath = args.site_tools_root
  ? join(candidateSiteToolsRoot, 'agent-context', 'session-start.mjs')
  : null;
const agentContextSessionStartPath = explicitAgentContextSessionStartPath && existsSync(explicitAgentContextSessionStartPath)
  ? explicitAgentContextSessionStartPath
  : packagedAgentContextSessionStartPath;
const { writeJsonFile } = await import(pathToFileURL(join(commonToolsRoot, 'incubation', 'write-file-utf8.mjs')));
const { beginCodexSessionAdmission, getCodexSessionAdmission, materializeAgentSessionStart } = await import(pathToFileURL(agentContextSessionStartPath));
const { McpFabricError, loadSiteMcpFabric, mcpServerNames, projectFabricForAgentTui, projectFabricForClaudeCode, projectFabricForCodex } = await import(pathToFileURL(join(NARADA_PROPER_ROOT, 'packages', 'mcp-fabric', 'src', 'mcp-fabric.mjs')));
const runtimeInput = args.runtime ?? null;
const jsonOutput = !!args.json;
const jsonOutputFile = args.json_output_file ? resolve(String(args.json_output_file)) : null;
const operatorSurfaceInput = args.operator_surface ?? null;
const legacyCarrierInput = args.carrier ?? null;
if (operatorSurfaceInput && legacyCarrierInput && String(operatorSurfaceInput) !== String(legacyCarrierInput)) {
  const refusal = {
    schema: 'narada.operator_surface_runtime_selection.v1',
    status: 'refused',
    reason_code: 'operator_surface_carrier_conflict',
    candidate_operator_surface_kind: String(operatorSurfaceInput),
    candidate_carrier_kind: String(legacyCarrierInput),
    reason: 'Canonical --operator-surface and legacy --carrier must agree when both are provided.',
    required_next_step: 'Use --operator-surface <surface> for new launches, or keep --carrier only for compatibility callers.',
  };
  if (jsonOutput) await writeStdout(`${JSON.stringify(refusal, null, 2)}\n`);
  else console.error(`[FAIL] ${refusal.reason_code}: ${refusal.reason}`);
  process.exit(1);
}
const carrierInput = operatorSurfaceInput ?? legacyCarrierInput;
const execFlag = !!args.exec;
const dryRun = !!args.dry_run;
const waitFlag = !!args.wait || process.env.NARADA_AGENT_START_WAIT === '1';
const visibleRuntimeTerminalFlag = !!args.visible_runtime_terminal;
const yoloFlag = !!args.yolo;
const enableNativeShellFlag = !!args.enable_native_shell;
const ADMITTED_MCP_SCOPES = Object.freeze(['all', 'host', 'user-site', 'local-site', 'none']);
const mcpScope = normalizeMcpScope(args.mcp_scope ?? process.env.NARADA_MCP_SCOPE ?? 'all');
const mcpRuntimeKind = runtimeInput === 'nars' ? 'nars' : null;
const strictMcpRegistry = !!args.strict_mcp_registry;
const pcSiteRoot = args.pc_site_root ?? process.env.NARADA_PC_SITE_ROOT ?? 'C:/ProgramData/Narada/sites/pc/desktop-sunroom-2';
const launchSource = args.launch_source ?? 'agent-start';
const admitSessionFlag = !!args.admit_session;
const showAdmission = args.show_admission ?? null;
const targetSiteId = args.target_site_id ?? process.env.NARADA_TARGET_SITE_ID ?? null;
const targetSiteRoot = args.target_site_root ?? process.env.NARADA_TARGET_SITE_ROOT ?? null;
const sessionSiteRoot = targetSiteRoot ?? rootDir;
const userSiteRoot = resolveUserSiteRoot();
loadSiteEnvFiles(sessionSiteRoot, { siteNaradaRoot, processEnv: process.env, siteEnvBindings: SITE_ENV_BINDINGS });
const dbPath = args.db ?? join(sessionSiteRoot, '.ai', 'state', 'agent-context.sqlite');
const require = createRequire(import.meta.url);
const naradaPackages = createNaradaPackageResolver({
  naradaProperRoot: NARADA_PROPER_ROOT,
  importerUrl: import.meta.url,
});
const RUNTIME_SUBSTRATE_KINDS_PACKET = Object.freeze(JSON.parse(readFileSync(resolveNaradaPackageExport('@narada2/carrier-runtime-contract', './runtime-substrate-kinds'), 'utf8')));
const RUNTIME_CONTRACT_SCHEMA = RUNTIME_SUBSTRATE_KINDS_PACKET.schema;
const AGENT_TUI_CARRIER = 'agent-tui';
const AGENT_TUI_TERMINAL_RENDERING_ENV = 'NARADA_AGENT_TUI_ENABLE_TERMINAL_RENDERING';
const AGENT_TUI_TERMINAL_MODE_ENV = 'NARADA_AGENT_TUI_TERMINAL_MODE';
const AGENT_TUI_TERMINAL_MODE = 'interactive_loop';
const AGENT_TUI_INTERACTIVE_LOOP_MAX_STEPS = '100000';
const ADMITTED_RUNTIME_SUBSTRATE_KINDS = Object.freeze(RUNTIME_SUBSTRATE_KINDS_PACKET.admitted_runtime_substrate_kinds);
const TOOL_FABRIC_ADAPTER_CONTRACT_SCHEMA = 'narada.tool_fabric_adapter_kind.v1';
const ADMITTED_TOOL_FABRIC_ADAPTER_KINDS = Object.freeze([
  'codex-native-mcp',
  'narada-agent-runtime-server-mcp-client',
  'narada-agent-tui-terminal-interactive-loop',
  'pi-extension-mcp-bridge',
  'claude-code-native-mcp',
  'opencode-native-mcp',
  'ambient-carrier-tools',
]);

function naradaPackageRoot(packageName) {
  return naradaPackages.packageRoot(packageName);
}

function resolveNaradaPackageExport(packageName, exportName = '.') {
  return naradaPackages.resolvePackageExport(packageName, exportName);
}

function resolveNaradaPackageBin(packageName, binName) {
  return naradaPackages.resolvePackageBin(packageName, binName);
}
const INTELLIGENCE_PROVIDER_METADATA_PATH = process.env.NARADA_INTELLIGENCE_PROVIDER_METADATA_PATH ?? resolveNaradaPackageExport('@narada2/carrier-provider-contract', './provider-registry');
const INTELLIGENCE_PROVIDER_REGISTRY = loadIntelligenceProviderRegistry(INTELLIGENCE_PROVIDER_METADATA_PATH);
const INTELLIGENCE_PROVIDER_METADATA = INTELLIGENCE_PROVIDER_REGISTRY.metadata;
const ADMITTED_INTELLIGENCE_PROVIDERS = INTELLIGENCE_PROVIDER_REGISTRY.admittedProviders;
const DEFAULT_AGENT_CLI_INTELLIGENCE_PROVIDER = INTELLIGENCE_PROVIDER_REGISTRY.defaultProvider;
const DEFAULT_PI_PROVIDER = 'openai-codex';
const DEFAULT_PI_MODEL = 'gpt-5.5';
const DEFAULT_CLAUDE_CODE_COMMAND = 'claude';
const DEFAULT_CLAUDE_CODE_MODEL = 'sonnet';
let mcpFabric = null;
let mcpScopeResolution = null;
let agentStartRenderer = null;
function resolveToolFabricAdapter(carrierName, runtimeName) {
  return resolveCarrierToolFabricAdapter(carrierName, {
    schema: TOOL_FABRIC_ADAPTER_CONTRACT_SCHEMA,
    agentTuiCarrier: AGENT_TUI_CARRIER,
    runtimeName,
  });
}

async function failRuntimeRefusal(refusal) {
  if (jsonOutput) {
    await writeStdout(`${JSON.stringify(refusal, null, 2)}\n`);
  } else {
    console.error(`[FAIL] ${refusal.reason_code}: ${refusal.candidate_runtime_substrate_kind ?? refusal.candidate_carrier_kind}`);
  }
  process.exit(1);
}

async function failToolFabricRefusal(error) {
  const reasonCode = error instanceof McpFabricError ? error.code : 'mcp_fabric_unavailable';
  const refusal = {
    schema: TOOL_FABRIC_ADAPTER_CONTRACT_SCHEMA,
    status: 'refused',
    reason_code: reasonCode,
    runtime_substrate_kind: runtime,
    tool_fabric_source: '.ai/mcp',
    site_root: sessionSiteRoot,
    reason: error instanceof Error ? error.message : String(error),
    details: error instanceof McpFabricError ? error.details : {},
    required_next_step: 'Materialize a valid Site-local .ai/mcp fabric that matches the Site surface registry before launching this runtime.',
  };
  if (jsonOutput) {
    await writeStdout(`${JSON.stringify(refusal, null, 2)}\n`);
  } else {
    console.error(`[FAIL] ${reasonCode}: ${refusal.reason}`);
  }
  process.exit(1);
}

async function failIntelligenceProviderRefusal(refusal) {
  if (jsonOutput) {
    await writeStdout(`${JSON.stringify(refusal, null, 2)}\n`);
  } else {
    console.error(`[FAIL] ${refusal.reason_code}: ${refusal.candidate_intelligence_provider ?? refusal.intelligence_provider}`);
    if (refusal.reason) console.error(refusal.reason);
  }
  process.exit(1);
}

function normalizeIntelligenceProvider(value, carrierName, inputSource = { source_field: null }) {
  return resolveIntelligenceProviderLaunch(value, carrierName, inputSource, {
    metadataByProvider: INTELLIGENCE_PROVIDER_METADATA,
    admittedProviders: ADMITTED_INTELLIGENCE_PROVIDERS,
    defaultProvider: DEFAULT_AGENT_CLI_INTELLIGENCE_PROVIDER,
    schema: INTELLIGENCE_PROVIDER_CONTRACT_SCHEMA,
  });
}

function resolveRuntimeAuthority(value, carrierName) {
  const normalized = String(value ?? process.env.NARADA_RUNTIME_AUTHORITY ?? 'auto').trim().toLowerCase();
  if (!['auto', 'read', 'write'].includes(normalized)) {
    throw new Error(`runtime_authority_not_admitted: ${normalized}. Admitted values: auto, read, write`);
  }
  const narsOperatorSurface = carrierName === AGENT_CLI_CARRIER_KIND || carrierName === 'agent-web-ui';
  const effective = normalized === 'auto'
    ? (narsOperatorSurface ? 'write' : 'read')
    : normalized;
  return {
    schema: 'narada.runtime_authority_selection.v1',
    requested: normalized,
    effective,
    source: value ? 'launch_argument' : process.env.NARADA_RUNTIME_AUTHORITY ? 'environment' : 'default',
  };
}

function codexSubscriptionPreflight(provider) {
  return runCodexSubscriptionPreflight(provider, {
    processEnv: process.env,
    processPlatform: process.platform,
    sessionSiteRoot,
    userSiteRoot,
    dryRun,
  });
}

function intelligenceProviderEnvironment(providerResolution) {
  return projectIntelligenceProviderEnvironment(providerResolution, {
    metadataByProvider: INTELLIGENCE_PROVIDER_METADATA,
    processEnv: process.env,
    codexSubscriptionPreflight,
  }).env;
}

function intelligenceProviderEnvironmentProjection(providerResolution) {
  return projectIntelligenceProviderEnvironment(providerResolution, {
    metadataByProvider: INTELLIGENCE_PROVIDER_METADATA,
    processEnv: process.env,
    codexSubscriptionPreflight,
  });
}

function mcpProviderCredentialEnvironment() {
  return {
    ...projectMcpProviderCredentialEnvironment({
      carrier,
      agentTuiCarrier: AGENT_TUI_CARRIER,
      metadataByProvider: INTELLIGENCE_PROVIDER_METADATA,
      processEnv: process.env,
      codexSubscriptionPreflight,
    }),
  };
}

function providerCredentialRefusal(providerResolution, credential) {
  return buildProviderCredentialRefusal(providerResolution, credential, {
    schema: INTELLIGENCE_PROVIDER_CONTRACT_SCHEMA,
    withResolutionStates,
  });
}

function materializeAgentTuiMcpConfig() {
  const configDir = join(sessionSiteRoot, '.ai', 'mcp', 'agent-tui', carrierSessionRegistration.carrier_session_id);
  const configPath = join(configDir, 'mcp-config.json');
  const config = projectFabricForAgentTui(mcpFabric, mcpEnvironmentValues());
  const serialized = JSON.stringify(config, null, 2) + '\n';
  if (execFlag) {
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, serialized, 'utf8');
  }
  return configPath;
}

function agentTuiTerminalEnvironment() {
  if (carrier !== AGENT_TUI_CARRIER) return {};
  const mcpConfigPath = materializeAgentTuiMcpConfig();
  const providerEnv = intelligenceProviderEnvironment({ intelligence_provider: DEFAULT_AGENT_CLI_INTELLIGENCE_PROVIDER });
  return {
    [AGENT_TUI_TERMINAL_RENDERING_ENV]: 'yes',
    [AGENT_TUI_TERMINAL_MODE_ENV]: AGENT_TUI_TERMINAL_MODE,
    NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION: 'true',
    NARADA_AGENT_TUI_PROVIDER_ADAPTER_KIND: 'codex_subscription_adapter',
    ...providerEnv,
    NARADA_AGENT_TUI_ENABLE_MCP_FABRIC: 'yes',
    NARADA_AGENT_TUI_MCP_CONFIG: mcpConfigPath,
    NARADA_SITE_MCP_FABRIC: join(sessionSiteRoot, '.ai', 'mcp'),
  };
}
function firstEnvironmentValue(names = []) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  return null;
}

function firstEnvironmentValueWithName(names = []) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return { name, value };
  }
  return null;
}

async function loadAgentStartRenderer() {
  if (agentStartRenderer) return agentStartRenderer;
  const rendererUrl = pathToFileURL(resolveNaradaPackageExport('@narada2/agent-start-renderer')).href;
  agentStartRenderer = await import(rendererUrl);
  return agentStartRenderer;
}

const runtimeResolution = resolveCarrierRuntimeSelection({
  carrierValue: legacyCarrierInput,
  operatorSurfaceValue: operatorSurfaceInput,
  runtimeValue: runtimeInput,
  admittedRuntimeSubstrateKinds: ADMITTED_RUNTIME_SUBSTRATE_KINDS,
  runtimeContractSchema: RUNTIME_CONTRACT_SCHEMA,
});
if (runtimeResolution.status === 'refused') {
  await failRuntimeRefusal(runtimeResolution);
}
const runtime = runtimeResolution.runtime_substrate_kind;
const carrier = runtimeResolution.carrier_kind;
const runtimeAuthoritySelection = resolveRuntimeAuthority(args.authority, carrier);
const intelligenceProviderArgInput = args.intelligence_provider ?? null;
const intelligenceProviderEnvInput = carrier === AGENT_CLI_CARRIER_KIND || carrier === 'agent-web-ui' ? process.env.NARADA_INTELLIGENCE_PROVIDER : null;
const intelligenceProviderInput = intelligenceProviderArgInput ?? intelligenceProviderEnvInput ?? null;
const intelligenceProviderInputSource = resolveIntelligenceProviderInputSource(intelligenceProviderArgInput, intelligenceProviderEnvInput, carrier, {
  processEnv: process.env,
  siteEnvBindings: SITE_ENV_BINDINGS,
});
const intelligenceProviderResolution = normalizeIntelligenceProvider(intelligenceProviderInput, carrier, intelligenceProviderInputSource);
if (intelligenceProviderResolution?.status === 'refused') {
  await failIntelligenceProviderRefusal(intelligenceProviderResolution);
}

if (!identity) {
  console.error('Usage: node start-agent.mjs <identity> [--operator-surface <surface>] [--carrier <legacy-carrier>] [--runtime <runtime>] [--authority <auto|read|write>] [--db <path>] [--json] [--dry-run] [--exec] [--wait] [--visible-runtime-terminal] [--yolo] [--enable-native-shell] [--strict-mcp-registry] [--target-site-id <site-id>] [--target-site-root <path>]');
  process.exit(1);
}

const intelligenceProviderProjection = intelligenceProviderEnvironmentProjection(intelligenceProviderResolution);
const intelligenceProviderEnv = intelligenceProviderProjection.env;
const intelligenceProviderCredential = intelligenceProviderProjection.credential;
const intelligenceProviderOutputResolution = {
  ...annotateIntelligenceProviderCredential(intelligenceProviderResolution, intelligenceProviderCredential),
  ...(intelligenceProviderProjection.runtime_binding ? { runtime_binding: intelligenceProviderProjection.runtime_binding } : {}),
};
if (intelligenceProviderCredential?.credential_required && !intelligenceProviderCredential.credential_present) {
  await failIntelligenceProviderRefusal(providerCredentialRefusal(intelligenceProviderOutputResolution, intelligenceProviderCredential));
}

function kimiSessionDir(identity) {
  const cwdHash = createHash('md5').update(process.cwd()).digest('hex');
  return join(homedir(), '.kimi', 'sessions', cwdHash, identity);
}

function stableNodeInstallDir() {
  if (process.env.FNM_MULTISHELL_PATH) return process.env.FNM_MULTISHELL_PATH;
  return dirname(process.execPath);
}

function stableNodeCommand() {
  return join(stableNodeInstallDir(), process.platform === 'win32' ? 'node.exe' : 'node');
}

function piCliScriptPath() {
  return join(stableNodeInstallDir(), 'node_modules', '@earendil-works', 'pi-coding-agent', 'dist', 'cli.js');
}

function agentRuntimeServerScriptPath() {
  return resolveNaradaPackageBin('@narada2/agent-runtime-server', 'narada-agent-runtime-server');
}

function agentCliSessionName(identityName) {
  return identityName.replace(/\./g, '-');
}

function siteCarrierControlPath(sessionId) {
  return carrierControlPath(sessionSiteRoot, sessionId);
}

function siteCarrierSessionPath(sessionId) {
  return carrierSessionPath(sessionSiteRoot, sessionId);
}

function materializeCarrierLaunchFiles(sessionId, startingCarrierInput) {
  return materializeCarrierLaunchFilesArtifact({
    siteRoot: sessionSiteRoot,
    sessionId,
    startingCarrierInput,
    agentStartEventId: startResult.agent_start_event,
    identityToken,
  });
}

function resolveStartingCarrierInput() {
  const sources = [
    args.starting_carrier_input !== undefined ? 'starting_carrier_input' : null,
    args.starting_carrier_input_file !== undefined ? 'starting_carrier_input_file' : null,
  ].filter(Boolean);
  if (sources.length === 0) return null;
  if (sources.length > 1) {
    throw new Error('starting_carrier_input_source_ambiguous');
  }
  const source = sources[0];
  const file = source.endsWith('_file')
    ? args.starting_carrier_input_file
    : undefined;
  const inline = source === 'starting_carrier_input'
    ? args.starting_carrier_input
    : undefined;
  if (file !== undefined && !existsSync(file)) {
    throw new Error(`starting_carrier_input_file_missing: ${file}`);
  }
  const text = file !== undefined ? readFileSync(file, 'utf8') : String(inline ?? '');
  if (text.trim().length === 0) {
    throw new Error('starting_carrier_input_empty');
  }
  return {
    schema: 'narada.agent_start.starting_carrier_input.v1',
    status: 'configured',
    source,
    file: file ?? null,
    content: text.trimEnd(),
  };
}

function startingCarrierInputOutput(startingCarrierInput) {
  if (!startingCarrierInput) return { schema: 'narada.agent_start.starting_carrier_input.v1', status: 'none' };
  return {
    schema: startingCarrierInput.schema,
    status: startingCarrierInput.status,
    source: startingCarrierInput.source,
    file: startingCarrierInput.file,
    content_preview: startingCarrierInput.content.slice(0, 160),
  };
}

function resolveCarrierExecutableCommand(carrierName) {
  return resolveCarrierCommand(carrierName, {
    agentTuiCarrier: AGENT_TUI_CARRIER,
    processPlatform: process.platform,
    processExecPath: process.execPath,
    stableNodeCommand,
    defaultClaudeCodeCommand: DEFAULT_CLAUDE_CODE_COMMAND,
    claudeCodeCommand: process.env.NARADA_CLAUDE_CODE_COMMAND,
    opencodeCommand: process.env.NARADA_OPENCODE_COMMAND,
  });
}

function materializeCarrierSessionRecord({ identity, carrier, runtime, startResult, dryRun = false } = {}) {
  return materializeCarrierSessionRecordArtifact({
    identity,
    carrier,
    runtime,
    startResult,
    dryRun,
    pcSiteRoot,
    userSiteRoot,
    runtimeContractSchema: RUNTIME_CONTRACT_SCHEMA,
    launchSource,
    workspace: process.cwd(),
    processId: process.pid,
    writeJsonFile,
  });
}

function nativeShellExceptionStatus() {
  if (carrier !== 'codex') return null;
  if (!enableNativeShellFlag) {
    return {
      status: 'disabled',
      runtime: 'codex',
      reason: 'Default Narada Codex posture disables the native shell_tool.',
    };
  }

  return {
    status: 'enabled_by_break_glass_flag',
    runtime: 'codex',
    authority_basis: process.env.NARADA_NATIVE_SHELL_AUTHORITY_REF ?? null,
    scope: {
      identity,
      workspace: process.cwd(),
      duration: 'this launched session',
      destructive_operations: 'separately_prohibited',
    },
    note: 'This flag only prevents the launcher from passing --disable shell_tool. Codex must still expose the native shell tool in this runtime build/config.',
  };
}

function buildCodexAdmissionCeremony(admission) {
  return {
    schema: 'narada.codex.session_admission.ceremony.v0',
    admission_id: admission.admission_id,
    status: admission.status,
    agent_id: admission.agent_id,
    cwd: admission.cwd,
    required_environment: admission.required_environment,
    agent_start_event_id: admission.agent_start_event_id,
    start_event_status: 'not_materialized',
    start_event_note: 'Admission creation is not an agent session start; no NARADA_AGENT_START_EVENT_ID exists until a future bind step materializes one.',
    forbidden_resume_modes: ['codex resume --last', 'ambient picker selection', 'manual session selection as authority'],
    steps: [
      'Start a fresh Codex session with NARADA_AGENT_ID and NARADA_CODEX_ADMISSION_ID only.',
      'Do not set NARADA_AGENT_START_EVENT_ID during admission-intent creation.',
      'Inside the fresh Codex session, materialize a real agent start event and bind it to this Narada admission id before treating the session as admitted.',
      'Capture exact Codex session id and session file evidence from Codex output or session metadata.',
      'Verify `codex resume <codex_session_id>` resumes the same session without --last or picker state.',
      'Complete the admission only after start-event evidence and Codex session evidence are unique, exact, and bound to this Narada admission id.',
    ],
    stable_mcp_registration: 'Codex MCP registration is a stable prerequisite. Agent identity is supplied by the launcher process environment, not by rewriting global MCP config.',
  };
}

function clearKimiSession(identity) {
  if (carrier !== 'kimi' || dryRun) return null;

  const sessionDir = kimiSessionDir(identity);
  if (!existsSync(sessionDir)) {
    return { status: 'not_found', session_dir: sessionDir };
  }

  rmSync(sessionDir, { recursive: true, force: true });
  return { status: 'cleared', session_dir: sessionDir };
}

function setKimiSessionTitle(identity, role) {
  if (carrier !== 'kimi' || dryRun) return null;

  const sessionDir = kimiSessionDir(identity);
  if (!existsSync(sessionDir)) {
    mkdirSync(sessionDir, { recursive: true });
  }

  const statePath = join(sessionDir, 'state.json');
  let state = {};
  if (existsSync(statePath)) {
    state = JSON.parse(readFileSync(statePath, 'utf8'));
  }

  state.custom_title = `[Narada] ${identity} (${role})`;
  state.title_generated = false;
  state.role_of_work_done = role;
  state.last_worked_at = new Date().toISOString();
  writeJsonFile(statePath, state);

  return { status: 'set', state_path: statePath };
}

function codexMcpApprovalArgs(serverNames) {
  return serverNames.flatMap((serverName) => [
    '-c',
    `mcp_servers.${serverName}.default_tools_approval_mode="approve"`,
  ]);
}

function codexCliScriptPath() {
  return resolveCodexCliScriptPath({ processEnv: process.env, requireLike: require, exists: existsSync });
}
function claudeCodeMcpConfig() {
  return projectFabricForClaudeCode(mcpFabric, mcpEnvironmentValues());
}

function mcpEnvironmentValues() {
  return Object.fromEntries(Object.entries({
    NARADA_AGENT_ID: identity,
    NARADA_AGENT_START_EVENT_ID: startResult.agent_start_event,
    NARADA_CARRIER_SESSION_ID: carrierSessionRegistration.carrier_session_id,
    ...(targetSiteId ? { NARADA_SITE_ID: targetSiteId } : {}),
    NARADA_SITE_ROOT: sessionSiteRoot,
    NARADA_WORKSPACE_ROOT: process.cwd(),
    NARADA_AGENT_CONTEXT_DB: dbPath,
  }).filter(([, value]) => value !== null && value !== undefined && value !== ''));
}

function codexMcpServerDefinitions() {
  return mcpFabric ? projectFabricForCodex(mcpFabric) : [];
}

function codexMcpServerNames() {
  return mcpFabric ? mcpServerNames(mcpFabric) : [];
}

function resolveUserSiteRoot() {
  return resolve(args.user_site_root ?? process.env.NARADA_USER_SITE_ROOT ?? join(homedir(), 'Narada'));
}

function resolveHostSiteRoot() {
  return resolve(args.host_site_root ?? process.env.NARADA_HOST_SITE_ROOT ?? process.env.NARADA_PC_SITE_ROOT ?? pcSiteRoot);
}

function mcpLocusRoot(locus) {
  if (locus === 'host') return resolveHostSiteRoot();
  if (locus === 'user-site') return resolveUserSiteRoot();
  return sessionSiteRoot;
}

function missingFabricDirectory(root) {
  return !existsSync(join(root, '.ai', 'mcp')) && !existsSync(join(siteControlRoot(root), '.ai', 'mcp'));
}

function siteControlRoot(siteRoot) {
  const root = resolve(siteRoot);
  return basename(root).toLowerCase() === '.narada' ? root : join(root, '.narada');
}

function emptyScopedMcpFabric() {
  return {
    schema: 'narada.mcp.fabric.loaded.v1',
    site_root: sessionSiteRoot,
    source: `mcp-scope:${mcpScope}`,
    mcp_dir: null,
    candidate_mcp_dirs: [],
    files: [],
    candidate_files: [],
    servers: {},
    sources: {},
    skipped: [],
    runtime_kind: mcpRuntimeKind,
    registry_validation: undefined,
    scope_loci: [],
    locus_fabrics: [],
    missing_loci: [],
  };
}

function composeMcpFabrics(locusFabrics, missingLoci) {
  const composed = emptyScopedMcpFabric();
  composed.source = `mcp-scope:${mcpScope}`;
  composed.scope_loci = locusFabrics.map((entry) => entry.locus);
  composed.locus_fabrics = locusFabrics.map((entry) => ({
    locus: entry.locus,
    site_root: entry.root,
    source: entry.fabric.source,
    mcp_dir: entry.fabric.mcp_dir,
    candidate_files: entry.fabric.candidate_files ?? entry.fabric.files ?? [],
    server_names: mcpServerNames(entry.fabric),
  }));
  composed.missing_loci = missingLoci;
  for (const entry of locusFabrics) {
    for (const file of entry.fabric.files ?? []) composed.files.push(`${entry.locus}:${file}`);
    for (const file of entry.fabric.candidate_files ?? entry.fabric.files ?? []) composed.candidate_files.push(`${entry.locus}:${file}`);
    for (const skipped of entry.fabric.skipped ?? []) composed.skipped.push({ locus: entry.locus, ...skipped });
    for (const [serverName, server] of Object.entries(entry.fabric.servers ?? {})) {
      if (composed.servers[serverName] && canonicalJson(composed.servers[serverName]) !== canonicalJson(server)) {
        throw new McpFabricError('mcp_scope_duplicate_server_conflict', `Conflicting MCP server definition for ${serverName} across MCP scope loci`, {
          scope: mcpScope,
          serverName,
          existing_source: composed.sources[serverName],
          conflicting_locus: entry.locus,
          conflicting_root: entry.root,
        });
      }
      composed.servers[serverName] = server;
      composed.sources[serverName] = `${entry.locus}:${entry.fabric.sources?.[serverName] ?? 'unknown'}`;
    }
  }
  return composed;
}

function loadScopedMcpFabric() {
  const loci = mcpScopeLoci(mcpScope);
  if (loci.length === 0) {
    const empty = emptyScopedMcpFabric();
    mcpScopeResolution = {
      schema: 'narada.mcp.scope_resolution.v1',
      scope: mcpScope,
      requested_loci: [],
      loaded_loci: [],
      missing_loci: [],
      enforcement: 'empty_explicit_fabric',
    };
    return empty;
  }
  const locusFabrics = [];
  const missingLoci = [];
  for (const locus of loci) {
    const root = mcpLocusRoot(locus);
    const required = mcpScope !== 'all' || locus === 'local-site';
    if (!required && missingFabricDirectory(root)) {
      missingLoci.push({ locus, site_root: root, reason: 'mcp_fabric_missing_optional_for_all_scope' });
      continue;
    }
    const fabric = loadSiteMcpFabric(root, {
      required,
      validateRegistry: strictMcpRegistry ? true : 'diagnostic',
      injectionScope: locus,
      runtime_kind: mcpRuntimeKind,
    });
    if (Object.keys(fabric.servers ?? {}).length === 0) {
      const runtimeFiltered = (fabric.skipped ?? []).filter((entry) => entry.reason === 'runtime_kind_not_requested');
      missingLoci.push({
        locus,
        site_root: root,
        reason: runtimeFiltered.length > 0 ? 'mcp_fabric_runtime_filtered' : 'mcp_fabric_empty',
        runtime_kind: mcpRuntimeKind,
        ...(runtimeFiltered.length > 0 ? { runtime_filtered_server_count: runtimeFiltered.length } : {}),
      });
      continue;
    }
    locusFabrics.push({ locus, root, fabric });
  }
  const composed = composeMcpFabrics(locusFabrics, missingLoci);
  mcpScopeResolution = {
    schema: 'narada.mcp.scope_resolution.v1',
    scope: mcpScope,
    requested_loci: loci,
    loaded_loci: locusFabrics.map((entry) => entry.locus),
    missing_loci: missingLoci,
    enforcement: mcpScope === 'all' ? 'explicit_locus_composition' : 'single_locus_explicit_fabric',
  };
  return composed;
}

const CODEX_AUTH_FILE_NAMES = Object.freeze(['auth.json', 'credentials.json', 'credential.json', 'token.json', 'tokens.json', 'session.json', 'sessions.json']);

function codexConfigTomlString(value) {
  return JSON.stringify(String(value).replaceAll('\\', '/'));
}

function codexConfigTomlArray(values) {
  return `[${values.map(codexConfigTomlString).join(', ')}]`;
}

function codexScopedConfigToml(servers, scope) {
  const lines = [
    `# Generated by narada-agent-start for McpScope=${scope}.`,
    '# Contains only explicitly composed Narada MCP fabric; user-level Codex MCP config is not inherited.',
    '',
  ];
  for (const server of servers) {
    lines.push(`[mcp_servers.${JSON.stringify(server.name)}]`);
    lines.push(`command = ${codexConfigTomlString(server.command)}`);
    lines.push(`args = ${codexConfigTomlArray(server.args)}`);
    lines.push(`env_vars = ${codexConfigTomlArray(server.env_vars)}`);
    lines.push('default_tools_approval_mode = "approve"');
    if (server.startup_timeout_sec) lines.push(`startup_timeout_sec = ${Number(server.startup_timeout_sec)}`);
    lines.push('');
  }
  return lines.join('\n');
}

function projectCodexAuthFiles(sourceHome, targetHome) {
  if (!sourceHome || !existsSync(sourceHome)) return [];
  const copied = [];
  for (const fileName of CODEX_AUTH_FILE_NAMES) {
    const sourcePath = join(sourceHome, fileName);
    if (!existsSync(sourcePath)) continue;
    try {
      if (!statSync(sourcePath).isFile()) continue;
      copyFileSync(sourcePath, join(targetHome, fileName));
      copied.push(fileName);
    } catch {
      // Optional auth projection should not block env/API-key based starts.
    }
  }
  return copied;
}

function codexMcpScopeProjection() {
  if (carrier !== 'codex') {
    return {
      status: 'enforced_by_carrier_adapter',
      scope: mcpScope,
      carrier,
      inherited_user_config_possible: false,
      evidence: 'This runtime adapter receives MCP servers from the launcher-selected Site fabric path instead of reading Codex global config.',
    };
  }
  const sessionKey = carrierSessionRegistration.carrier_session_id ?? startResult.agent_start_event;
  const codexHome = join(sessionSiteRoot, '.ai', 'runtime', 'codex-home', sessionKey);
  const configPath = join(codexHome, 'config.toml');
  if (dryRun) {
    return { status: 'planned', scope: mcpScope, carrier, inherited_codex_home_allowed: false, codex_home: codexHome, config_path: configPath, projected_server_names: codexMcpServerNames() };
  }
  mkdirSync(codexHome, { recursive: true });
  const authSourceHome = process.env.NARADA_CODEX_AUTH_HOME ?? join(homedir(), '.codex');
  const inherited_auth_files = projectCodexAuthFiles(authSourceHome, codexHome);
  writeFileSync(configPath, `${codexScopedConfigToml(codexMcpServerDefinitions(), mcpScope)}\n`, 'utf8');
  return { status: 'materialized', scope: mcpScope, carrier, inherited_codex_home_allowed: false, codex_home: codexHome, config_path: configPath, inherited_auth_files, projected_server_names: codexMcpServerNames() };
}

function mcpToolApprovalPacket({ approved, note }) {
  return {
    status: 'approved_by_launcher_config',
    server_names: approved,
    note,
  };
}

function mcpToolApprovalStatus() {
  if (carrier !== 'codex') return null;
  return mcpToolApprovalPacket({
    approved: codexMcpServerNames(),
    note: 'Approves configured Narada MCP tool calls at the Codex runtime adapter layer. Native Codex shell_tool remains disabled by default; shell execution still goes through the policy-aware Narada shell MCP.',
  });
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => String(value)))];
}

function mcpAllowedRootsFromFabric(fabric) {
  const roots = [];
  for (const server of Object.values(fabric?.servers ?? {})) {
    const args = Array.isArray(server?.args) ? server.args : [];
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] !== '--allowed-root' || index + 1 >= args.length) continue;
      roots.push(String(args[index + 1]));
      index += 1;
    }
  }
  return uniqueStrings(roots);
}

function siteConfigProjection() {
  return {
    schema: 'narada.nars.site_config.v1',
    site_id: targetSiteId,
    site_root: sessionSiteRoot,
    narada_root: siteNaradaRoot(sessionSiteRoot),
    workspace_root: process.cwd(),
    pc_site_root: pcSiteRoot,
    mcp_scope: mcpScope,
    mcp_loci: mcpScopeResolution?.loaded_loci ?? [],
    allowed_roots: mcpAllowedRootsFromFabric(mcpFabric),
  };
}

function buildSpawnArgs(carrierName, identity, carrierSessionRegistration = null) {
  return buildCarrierSpawnArgs(carrierName, {
    agentTuiCarrier: AGENT_TUI_CARRIER,
    identity,
    yoloFlag,
    enableNativeShellFlag,
    processPlatform: process.platform,
    codexCliScriptPath,
    codexMcpServerDefinitions,
    agentRuntimeServerScriptPath,
    agentCliSessionName,
    carrierSessionRegistration,
    sessionSiteRoot,
    naradaPackageRoot,
    siteCarrierControlPath,
    siteCarrierSessionPath,
    agentTuiRuntimeLoop: args.agent_tui_runtime_loop,
    agentTuiMaxSteps: args.agent_tui_max_steps,
    agentTuiInteractiveLoopMaxSteps: AGENT_TUI_INTERACTIVE_LOOP_MAX_STEPS,
    piCliScriptPath,
    rootDir,
    piProvider: process.env.NARADA_PI_PROVIDER ?? DEFAULT_PI_PROVIDER,
    piModel: process.env.NARADA_PI_MODEL ?? DEFAULT_PI_MODEL,
    claudeCodeMcpConfig,
    claudeCodeModel: process.env.NARADA_CLAUDE_CODE_MODEL ?? DEFAULT_CLAUDE_CODE_MODEL,
    runtimeAuthority: runtimeAuthoritySelection.effective,
  });
}

function codexMcpRegistrationStatus(identity, eventId) {
  if (carrier !== 'codex') return null;
  return {
    status: 'not_mutated',
    scope: 'codex_stable_global_mcp_registry',
    identity,
    agent_start_event: eventId,
    identity_source: 'carrier_process_environment',
    required_config: 'Stable Codex MCP server entries must whitelist NARADA_AGENT_ID, NARADA_AGENT_START_EVENT_ID, NARADA_CARRIER_SESSION_ID, NARADA_SITE_ROOT, and NARADA_AGENT_CONTEXT_DB via env_vars.',
    mutation_policy: 'Agent startup must not run codex mcp remove/add or write session identity into global config.',
  };
}

function writeLaunchResult(result) {
  const path = writeLaunchResultFile(displayLaunchResult(result), { siteRoot: rootDir });
  result.launch_result_path = path;
  return path;
}

function writeStdout(payload) {
  return new Promise((resolve, reject) => {
    process.stdout.write(payload, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function printResult(result) {
  if (jsonOutputFile) {
    mkdirSync(dirname(jsonOutputFile), { recursive: true });
    writeFileSync(jsonOutputFile, `${JSON.stringify(displayLaunchResult(result), null, 2)}\n`, 'utf8');
  }
  if (jsonOutput) {
    const sentinel = result.exec && !dryRun && result.agent_start_event
      ? `\nagent_start_result_end: ${result.agent_start_event}\n\n\n`
      : '\n';
    await writeStdout(`${JSON.stringify(result, null, 2)}${sentinel}`);
    return;
  }

  const { formatAgentStartResult } = await loadAgentStartRenderer();
  await writeStdout(formatAgentStartResult(result, {
    colorEnabled: process.stdout.isTTY && !process.env.NO_COLOR,
    runtime,
    dryRun,
  }));
}

function displayLaunchResult(result) {
  const display = { ...result };
  delete display.spawn_environment_delta;
  return display;
}

if (showAdmission) {
  try {
    await printResult(getCodexSessionAdmission({
      siteRoot: rootDir,
      admissionId: String(showAdmission),
      dbPath,
    }));
    process.exit(0);
  } catch (error) {
    console.error(`[FAIL] ${error.message}`);
    process.exit(1);
  }
}

if (admitSessionFlag) {
  try {
    const admission = beginCodexSessionAdmission({
      siteRoot: rootDir,
      identity,
      runtime,
      dbPath,
      cwd: process.cwd(),
      dryRun,
      evidence: {
        requested_by: 'agent-start --admit-session',
        normal_codex_exec_refusal_preserved: true,
      },
    });
const output = {
      ...admission,
      exec: false,
      admission_mode: 'discovery_only',
      context_isolation: {
        status: 'creating',
        code: 'codex_session_admission_creating',
        runtime: 'codex',
        admission_id: admission.admission_id,
      },
      ceremony: buildCodexAdmissionCeremony(admission),
    };
    await printResult(output);
    process.exit(0);
  } catch (error) {
    console.error(`[FAIL] ${error.message}`);
    process.exit(1);
  }
}

let startResult;
try {
  startResult = materializeAgentSessionStart({
    siteRoot: sessionSiteRoot,
    identity,
    runtime,
    dbPath,
    cwd: process.cwd(),
    dryRun,
  });
} catch (error) {
  console.error(`[FAIL] ${error.message}`);
  process.exit(1);
}

const carrierSessionPlanOnly = dryRun || !execFlag;
let carrierSessionRegistration;
try {
  carrierSessionRegistration = materializeCarrierSessionRecord({ identity, carrier, runtime, startResult, dryRun: carrierSessionPlanOnly });
} catch (error) {
  console.error(JSON.stringify({
    schema: 'narada.pc_runtime.carrier_session.registration.v0',
    status: 'refused',
    reason_code: 'carrier_session_registration_failed',
    reason: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
}

if (carrier !== 'kimi' && carrier !== 'opencode') {
  try {
    mcpFabric = loadScopedMcpFabric();
  } catch (error) {
    await failToolFabricRefusal(error);
  }
} else {
  mcpFabric = emptyScopedMcpFabric();
  mcpScopeResolution = {
    schema: 'narada.mcp.scope_resolution.v1',
    scope: mcpScope,
    requested_loci: mcpScopeLoci(mcpScope),
    loaded_loci: [],
    missing_loci: [],
    enforcement: 'carrier_without_narada_mcp_adapter',
  };
}

const spawnArgs = buildSpawnArgs(carrier, identity, carrierSessionRegistration);
const toolFabricAdapter = resolveToolFabricAdapter(carrier, runtime);
const execCommand = [resolveCarrierExecutableCommand(carrier), ...spawnArgs.map(shellQuote)].join(' ');
const agentStartExecutionPosture = resolveAgentStartExecutionPosture({
  runtime,
  exec: execFlag,
  wait: waitFlag,
  visibleRuntimeTerminal: visibleRuntimeTerminalFlag,
});
const hiddenRuntimeOutputFiles = agentStartExecutionPosture.agent_start_execution_mode === 'hidden_detached'
  ? {
      schema: 'narada.agent_start.hidden_runtime_output_files.v1',
      stdout_path: join(rootDir, '.ai', 'runtime', 'agent-start-processes', carrierSessionRegistration.carrier_session_id ?? identityToken(identity), 'stdout.log'),
      stderr_path: join(rootDir, '.ai', 'runtime', 'agent-start-processes', carrierSessionRegistration.carrier_session_id ?? identityToken(identity), 'stderr.log'),
    }
  : null;
const carrierEnvironment = {
  ...(carrierSessionRegistration.environment ?? {}),
  NARADA_RUNTIME_AUTHORITY: runtimeAuthoritySelection.effective,
};
const agentTuiEnvironment = agentTuiTerminalEnvironment();
const mcpProviderCredentialEnv = mcpProviderCredentialEnvironment();
const codexMcpScope = codexMcpScopeProjection();
const carrierActions = {
  cleared_kimi_session: clearKimiSession(identity),
  set_kimi_title: setKimiSessionTitle(identity, startResult.role),
  carrier_session_registration: carrierSessionRegistration,
  codex_mcp_registration: codexMcpRegistrationStatus(identity, startResult.agent_start_event),
  codex_mcp_scope: codexMcpScope,
};
const startingCarrierInput = resolveStartingCarrierInput();
const environmentSiteRoot = sessionSiteRoot;
const workspaceRoot = process.cwd();
const runtimeEnvironment = carrierSpecificEnvironment(carrier, {
  processEnv: process.env,
  defaultPiProvider: DEFAULT_PI_PROVIDER,
  defaultPiModel: DEFAULT_PI_MODEL,
  defaultClaudeCodeCommand: DEFAULT_CLAUDE_CODE_COMMAND,
  defaultClaudeCodeModel: DEFAULT_CLAUDE_CODE_MODEL,
});
const siteConfig = siteConfigProjection();
const resolvedAgentIdentityRef = resolveAgentIdentityRef(identity, {
  role: startResult.role,
  site_id: targetSiteId,
});
const agentIdentityRef = resolvedAgentIdentityRef.status === 'resolved'
  ? resolvedAgentIdentityRef.value
  : buildAgentIdentityRefV2({
    identity_scope: { kind: 'unscoped' },
    local_agent_id: identity,
    role: startResult.role ?? identity,
    legacy_agent_id: identity,
  });
const { requiredEnvironment, wouldSetEnvironment } = buildCarrierEnvironmentProjection({
  carrierName: carrier,
  startResult,
  carrierEnvironment,
  intelligenceProviderEnv,
  mcpProviderCredentialEnv,
  agentTuiEnvironment,
  runtimeEnvironment,
  identity,
  agentStartEventId: startResult.agent_start_event,
  targetSiteId,
  environmentSiteRoot,
  workspaceRoot,
  dbPath,
  siteConfig,
  mcpScope,
  runtimeProcessCreatorPid: process.pid,
  runtimeProcessRole: 'runtime_server',
});
const spawnEnvironmentDelta = buildCarrierSpawnEnvironmentDelta({
  carrierName: carrier,
  startResult,
  carrierEnvironment,
  intelligenceProviderEnv,
  mcpProviderCredentialEnv,
  agentTuiEnvironment,
  runtimeEnvironment,
  identity,
  role: startResult.role,
  agentStartEventId: startResult.agent_start_event,
  carrierSessionId: carrierSessionRegistration.carrier_session_id,
  targetSiteId,
  agentIdentityRef,
  operatorSurfaceKind: carrier,
  environmentSiteRoot,
  workspaceRoot,
  dbPath,
  siteConfig,
  mcpScope,
  codexMcpScope,
  runtimeProcessCreatorPid: process.pid,
  runtimeProcessRole: 'runtime_server',
});
const narsLaunch = buildNarsLaunchPacket(carrier, {
  processExecPath: process.execPath,
  carrierSessionRegistration,
  targetSiteId,
  sessionSiteRoot,
  siteCarrierControlPath,
  siteCarrierSessionPath,
});

const output = {
  ...startResult,
  schema: 'narada.agent_start.result.v0',
  agent_identity_ref: agentIdentityRef,
  runtime_contract_schema: RUNTIME_CONTRACT_SCHEMA,
  operator_surface_kind: carrier,
  runtime_host_kind: runtime,
  carrier_kind: carrier,
  runtime_substrate_kind: runtime,
  target_site_id: targetSiteId,
  target_site_root: targetSiteRoot,
  session_site_root: sessionSiteRoot,
  pc_site_root: pcSiteRoot,
  site_config: siteConfig,
  site_tools_root: candidateSiteToolsRoot,
  launch_source: launchSource,
  wait: waitFlag,
  visible_runtime_terminal: visibleRuntimeTerminalFlag,
  yolo: yoloFlag,
  runtime_resolution: runtimeResolution,
  tool_fabric_adapter_contract_schema: TOOL_FABRIC_ADAPTER_CONTRACT_SCHEMA,
  admitted_tool_fabric_adapter_kinds: [...ADMITTED_TOOL_FABRIC_ADAPTER_KINDS],
  tool_fabric_adapter: toolFabricAdapter,
  tool_fabric_adapter_kind: toolFabricAdapter.tool_fabric_adapter_kind,
  mcp_registry_validation: strictMcpRegistry ? 'strict' : 'diagnostic',
  nars_launch: narsLaunch,
  mcp_fabric: mcpFabric ? {
    source: mcpFabric.source,
    site_root: mcpFabric.site_root,
    files: mcpFabric.files,
    candidate_files: mcpFabric.candidate_files,
    server_names: mcpServerNames(mcpFabric),
    skipped: mcpFabric.skipped,
    runtime_kind: mcpFabric.runtime_kind ?? mcpRuntimeKind,
    scope_loci: mcpFabric.scope_loci ?? ['local-site'],
    locus_fabrics: mcpFabric.locus_fabrics ?? [],
    missing_loci: mcpFabric.missing_loci ?? [],
  } : null,
  mcp_scope: {
    requested: mcpScope,
    runtime_kind: mcpRuntimeKind,
    admitted_scopes: [...ADMITTED_MCP_SCOPES],
    requested_loci: mcpScopeLoci(mcpScope),
    effective_loci: mcpScopeResolution?.loaded_loci ?? [],
    missing_loci: mcpScopeResolution?.missing_loci ?? [],
    registry_validation: strictMcpRegistry ? 'strict' : 'diagnostic',
    resolution: mcpScopeResolution,
    enforcement: codexMcpScope,
  },
  runtime_authority_selection: runtimeAuthoritySelection,
  intelligence_provider_contract_schema: INTELLIGENCE_PROVIDER_CONTRACT_SCHEMA,
  intelligence_provider: intelligenceProviderOutputResolution?.intelligence_provider ?? null,
  intelligence_provider_resolution: intelligenceProviderOutputResolution,
  display_environment: requiredEnvironment,
  required_environment: requiredEnvironment,
  would_set_environment: wouldSetEnvironment,
  ...(process.env.NARADA_AGENT_START_EMIT_SPAWN_ENVIRONMENT_DELTA === '1'
    ? { spawn_environment_delta: spawnEnvironmentDelta }
    : {}),
  carrier_session: carrierSessionRegistration,
  starting_carrier_input: startingCarrierInputOutput(startingCarrierInput),
  exec: execFlag,
  agent_start_execution_mode: agentStartExecutionPosture.agent_start_execution_mode,
  detach_decision: agentStartExecutionPosture.detach_decision,
  detach_refusal_reasons: agentStartExecutionPosture.detach_refusal_reasons,
  hidden_runtime_output_files: hiddenRuntimeOutputFiles,
  carrier_actions: carrierActions,
  native_shell_exception: nativeShellExceptionStatus(),
  mcp_tool_approval: mcpToolApprovalStatus(),
  runtime_args: spawnArgs,
  exec_command: execFlag ? execCommand : null,
  context_isolation: carrier === 'codex' ? codexContextIsolationStatus({ exec: execFlag, dryRun }) : { status: 'isolated', carrier, runtime },
  nars_health: carrier === 'agent-cli' || carrier === 'agent-web-ui' ? {
    schema: 'narada.agent_start.nars_health_discovery.v1',
    owner: '@narada2/agent-runtime-server',
    method: 'session.health',
    http_path: '/health',
    endpoint: null,
    endpoint_available_at_launch_materialization: false,
    discovery_field: 'session_started.health_endpoint',
    note: 'The loopback HTTP endpoint is bound by the runtime server after process start; inspect session_started.health_endpoint or session.health for the live URL.',
  } : null,
  nars_events: carrier === 'agent-cli' || carrier === 'agent-web-ui' ? {
    schema: 'narada.agent_start.nars_event_stream_discovery.v1',
    owner: '@narada2/agent-runtime-server',
    method: 'session.events.subscribe',
    transport_kind: 'websocket',
    websocket_path: '/events',
    endpoint: null,
    endpoint_available_at_launch_materialization: false,
    discovery_field: 'session_started.event_endpoint',
    supports_replay: true,
    locality: 'loopback_only_by_default',
    attach_commands: buildNarsAttachCommands(),
    note: 'The loopback WebSocket endpoint is bound by the runtime server after process start; inspect session_started.event_endpoint for the live URL.',
  } : null,
  launch_result_path: null,
};

output.runtime_health_posture = buildRuntimeHealthPosture(output);
output.launcher_contracts = buildLauncherContracts(output);

output.startup_command = startupCommandFromSequence(output.startup_sequence);
output.startup_command_name = output.startup_command?.name ?? null;

if (!dryRun) {
  writeLaunchResult(output);
}

await printResult(output);

if (!execFlag || dryRun) {
  process.exit(0);
}

if (waitFlag) {
  await waitForEnterBeforeCarrier({
    agentId: identity,
    agentIdentityRef,
    carrierName: runtime === 'narada-agent-runtime-server' ? 'agent-runtime-server' : carrier,
    writeStdout,
    loadAgentStartRenderer,
  });
}

if (carrierSessionRegistration.status !== 'registered') {
  console.error(`[FAIL] carrier_session_registration_required: ${carrierSessionRegistration.reason ?? carrierSessionRegistration.status}`);
  process.exit(1);
}

if (carrier === 'agent-cli' || carrier === 'agent-web-ui' || carrier === AGENT_TUI_CARRIER) {
  materializeCarrierLaunchFiles(carrierSessionRegistration.carrier_session_id, startingCarrierInput);
}

const isOpencodeWin32 = carrier === 'opencode' && process.platform === 'win32';
const spawnCommand = isOpencodeWin32 ? 'cmd.exe' : resolveCarrierExecutableCommand(carrier);
const spawnCommandArgs = isOpencodeWin32 ? ['/c', resolveCarrierExecutableCommand(carrier), ...spawnArgs] : spawnArgs;
const processEnvironment = buildCarrierProcessEnvironment({
  processEnvironment: process.env,
  intelligenceProviderEnv,
  mcpProviderCredentialEnv,
  runtimeEnvironment,
  agentTuiEnvironment,
  codexMcpScope,
  carrierName: carrier,
  identity,
  role: startResult.role,
  agentStartEventId: startResult.agent_start_event,
  carrierSessionId: carrierSessionRegistration.carrier_session_id,
  targetSiteId,
  agentIdentityRef,
  operatorSurfaceKind: carrier,
  environmentSiteRoot,
  workspaceRoot,
  dbPath,
  siteConfig,
  mcpScope,
});
const launchEnvironment = intelligenceProviderResolution?.intelligence_provider === 'codex-subscription'
  ? stripCodexSubscriptionOpenAIEnvironment(processEnvironment)
  : processEnvironment;
const aiProcessInvocation = carrier === 'codex'
  ? {
      adapterKind: 'codex',
      projection: 'direct-carrier',
      purpose: 'operator_surface_runtime',
      siteRoot: sessionSiteRoot,
      workspaceRoot,
      agentId: identity,
      sessionId: carrierSessionRegistration.carrier_session_id,
      threadId: startResult.agent_start_event,
    }
  : null;

spawnCarrierProcessAndExit({
  command: spawnCommand,
  args: spawnCommandArgs,
  cwd: process.cwd(),
  env: launchEnvironment,
  spawnOptions: carrierSpawnOptions(carrier),
  aiProcessInvocation,
  executionMode: agentStartExecutionPosture.agent_start_execution_mode,
  hiddenOutputFiles: hiddenRuntimeOutputFiles,
});
