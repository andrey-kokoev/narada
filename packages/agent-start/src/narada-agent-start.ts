#!/usr/bin/env node
/**
 * start-agent.mjs
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
 *   node tools/agent-start/start-agent.mjs <identity> [--runtime <runtime>] [--db <path>] [--json] [--dry-run] [--exec] [--wait] [--yolo] [--enable-native-shell] [--target-site-id <site-id>] [--target-site-root <path>]
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import {
  carrierControlPath,
  carrierSessionPath,
  materializeCarrierLaunchFiles as materializeCarrierLaunchFilesArtifact,
  materializeCarrierSessionRecord as materializeCarrierSessionRecordArtifact,
  siteNaradaRoot,
  writeLaunchResultFile,
} from './carrier-launch-artifacts.ts';
import {
  buildAgentCliLaunchPacket,
  buildCarrierEnvironmentProjection,
  buildCarrierSpawnArgs,
  runtimeSpecificEnvironment,
  resolveRuntimeCommand as resolveCarrierRuntimeCommand,
  resolveToolFabricAdapter as resolveCarrierToolFabricAdapter,
  runtimeSpawnOptions,
  shellQuote,
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRootDir = join(__dirname, '..');
const naradaProperRoot = join(packageRootDir, '..', '..');

function runNaradaProperLegacyLauncherIfNeeded(argv, rootDir, naradaProperRoot) {
  if (normalizePath(rootDir) !== normalizePath(naradaProperRoot)) return;
  const legacyLauncher = join(naradaProperRoot, 'tools', 'agent-start', 'start-agent.mjs');
  if (!existsSync(legacyLauncher)) return;
  const passThrough = [];
  let i = 0;
  if (argv.length > 0 && !argv[0].startsWith('--')) {
    passThrough.push(argv[0]);
    i = 1;
  }
  const admittedFlagsWithValues = new Set([
    '--runtime',
    '--startup-task-number',
    '--agent-tui-max-steps',
    '--starting-carrier-input',
    '--starting-carrier-input-file',
    '--agent-tui-starting-directive',
    '--agent-tui-starting-directive-file',
  ]);
  const admittedSwitches = new Set([
    '--json',
    '--dry-run',
    '--exec',
    '--enable-native-shell',
    '--agent-tui-interactive-loop',
    '--agent-tui-provider-execution',
    '--agent-tui-mcp-fabric',
  ]);
  for (; i < argv.length; i += 1) {
    const arg = argv[i];
    if (admittedFlagsWithValues.has(arg)) {
      passThrough.push(arg, argv[++i]);
    } else if (admittedSwitches.has(arg)) {
      passThrough.push(arg);
    } else if (arg.startsWith('--') && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      i += 1;
    }
  }
  const result = spawnSync(process.execPath, [legacyLauncher, ...passThrough], {
    cwd: naradaProperRoot,
    stdio: 'inherit',
    env: { ...process.env, NARADA_PROPER_ROOT: naradaProperRoot },
  });
  process.exit(result.status ?? 1);
}

function normalizePath(value) {
  return resolve(String(value ?? '')).replace(/[\\/]+$/, '').toLowerCase();
}

const SITE_ENV_BINDINGS = new Map();

function parseArgs(argv) {
  const result = {};
  let i = 0;
  if (argv.length > 0 && !argv[0].startsWith('--')) {
    result.identity = argv[0];
    i = 1;
  }
  for (; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;

    const key = arg.slice(2).replace(/-/g, '_');
    if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      result[key] = argv[i + 1];
      i++;
    } else {
      result[key] = true;
    }
  }
  return result;
}

function identityToken(identity) {
  return String(identity).replace(/[^A-Za-z0-9]+/g, '_');
}

const args = parseArgs(process.argv.slice(2));
const identity = args.identity;
const rootDir = args.site_root ?? args.target_site_root ?? process.env.NARADA_LAUNCH_REGISTRY_SITE_ROOT ?? process.env.NARADA_TARGET_SITE_ROOT ?? process.cwd();
const NARADA_PROPER_ROOT = process.env.NARADA_PROPER_ROOT ?? naradaProperRoot;
if ((args.runtime ?? 'kimi') !== 'agent-tui') {
  runNaradaProperLegacyLauncherIfNeeded(process.argv.slice(2), rootDir, NARADA_PROPER_ROOT);
}
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
const runtimeInput = args.runtime ?? 'agent-cli';
const jsonOutput = !!args.json;
const execFlag = !!args.exec;
const dryRun = !!args.dry_run;
const waitFlag = !!args.wait || process.env.NARADA_AGENT_START_WAIT === '1';
const yoloFlag = !!args.yolo;
const enableNativeShellFlag = !!args.enable_native_shell;
const pcSiteRoot = args.pc_site_root ?? process.env.NARADA_PC_SITE_ROOT ?? 'C:/ProgramData/Narada/sites/pc/desktop-sunroom-2';
const launchSource = args.launch_source ?? 'agent-start';
const admitSessionFlag = !!args.admit_session;
const showAdmission = args.show_admission ?? null;
const targetSiteId = args.target_site_id ?? process.env.NARADA_TARGET_SITE_ID ?? null;
const targetSiteRoot = args.target_site_root ?? process.env.NARADA_TARGET_SITE_ROOT ?? null;
const sessionSiteRoot = targetSiteRoot ?? rootDir;
loadSiteEnvFiles(sessionSiteRoot, { siteNaradaRoot, processEnv: process.env, siteEnvBindings: SITE_ENV_BINDINGS });
const intelligenceProviderArgInput = args.intelligence_provider ?? null;
const intelligenceProviderEnvInput = runtimeInput === 'agent-cli' ? process.env.NARADA_INTELLIGENCE_PROVIDER : null;
const intelligenceProviderInput = intelligenceProviderArgInput ?? intelligenceProviderEnvInput ?? null;
const intelligenceProviderInputSource = resolveIntelligenceProviderInputSource(intelligenceProviderArgInput, intelligenceProviderEnvInput, runtimeInput, {
  processEnv: process.env,
  siteEnvBindings: SITE_ENV_BINDINGS,
});
const dbPath = args.db ?? join(sessionSiteRoot, '.ai', 'state', 'agent-context.sqlite');
const require = createRequire(import.meta.url);
const naradaPackages = createNaradaPackageResolver({
  naradaProperRoot: NARADA_PROPER_ROOT,
  importerUrl: import.meta.url,
});
const RUNTIME_SUBSTRATE_KINDS_PACKET = Object.freeze(JSON.parse(readFileSync(resolveNaradaPackageExport('@narada2/carrier-runtime-contract', './runtime-substrate-kinds'), 'utf8')));
const RUNTIME_CONTRACT_SCHEMA = RUNTIME_SUBSTRATE_KINDS_PACKET.schema;
const AGENT_TUI_RUNTIME = 'agent-tui';
const AGENT_TUI_TERMINAL_RENDERING_ENV = 'NARADA_AGENT_TUI_ENABLE_TERMINAL_RENDERING';
const AGENT_TUI_TERMINAL_MODE_ENV = 'NARADA_AGENT_TUI_TERMINAL_MODE';
const AGENT_TUI_TERMINAL_MODE = 'interactive_loop';
const AGENT_TUI_INTERACTIVE_LOOP_MAX_STEPS = '100000';
const ADMITTED_RUNTIME_SUBSTRATE_KINDS = Object.freeze(RUNTIME_SUBSTRATE_KINDS_PACKET.admitted_runtime_substrate_kinds);
const TOOL_FABRIC_ADAPTER_CONTRACT_SCHEMA = 'narada.tool_fabric_adapter_kind.v1';
const ADMITTED_TOOL_FABRIC_ADAPTER_KINDS = Object.freeze([
  'codex-native-mcp',
  'narada-agent-cli-mcp-client',
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
let agentStartRenderer = null;
function runtimeRefusal(candidate) {
  const candidateRuntime = String(candidate ?? '');
  return {
    schema: RUNTIME_CONTRACT_SCHEMA,
    status: 'refused',
    reason_code: 'runtime_substrate_kind_unsupported',
    candidate_runtime_substrate_kind: candidateRuntime,
    admitted_runtime_substrate_kinds: [...ADMITTED_RUNTIME_SUBSTRATE_KINDS],
    reason: 'runtime_substrate_kind is not admitted by narada.runtime_substrate_kind.v1',
    required_next_step: 'Admit the new runtime in a later contract version before startup or materialization accepts it.',
  };
}

function resolveToolFabricAdapter(runtimeName) {
  return resolveCarrierToolFabricAdapter(runtimeName, {
    schema: TOOL_FABRIC_ADAPTER_CONTRACT_SCHEMA,
    agentTuiRuntime: AGENT_TUI_RUNTIME,
  });
}

async function failRuntimeRefusal(refusal) {
  if (jsonOutput) {
    await writeStdout(`${JSON.stringify(refusal, null, 2)}\n`);
  } else {
    console.error(`[FAIL] ${refusal.reason_code}: ${refusal.candidate_runtime_substrate_kind}`);
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
    required_next_step: error instanceof McpFabricError && error.details?.temporary_leak_identification_tool === true
      ? 'Rename or remove non-canonical MCP server entries so every launched server name starts with narada-. This temporary gate exists to identify MCP authority leaks.'
      : 'Materialize a valid Site-local .ai/mcp fabric before launching this runtime.',
  };
  if (jsonOutput) {
    await writeStdout(`${JSON.stringify(refusal, null, 2)}\n`);
  } else {
    console.error(`[FAIL] ${reasonCode}: ${refusal.reason}`);
  }
  process.exit(1);
}

function assertTemporaryNaradaPrefixedMcpServerNameGate(fabric) {
  const serverNames = mcpServerNames(fabric);
  const offendingServerNames = serverNames.filter((serverName) => !serverName.startsWith('narada-'));
  if (offendingServerNames.length === 0) return;
  throw new McpFabricError(
    'temporary_mcp_server_name_missing_narada_prefix',
    `Temporary MCP leak identification gate refused non-canonical server names: ${offendingServerNames.join(', ')}`,
    {
      temporary_leak_identification_tool: true,
      lifecycle_decision: 'retain_until_registry_authority_gate_replaces_prefix_heuristic',
      replacement_path: 'Replace this temporary prefix gate with registry-backed authority validation that proves every launchable MCP server is generated from or matched to the target Site surface registry.',
      expected_server_name_prefix: 'narada-',
      offending_server_names: offendingServerNames,
      admitted_server_names: serverNames,
    },
  );
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

function normalizeIntelligenceProvider(value, runtimeName, inputSource = { source_field: null }) {
  return resolveIntelligenceProviderLaunch(value, runtimeName, inputSource, {
    metadataByProvider: INTELLIGENCE_PROVIDER_METADATA,
    admittedProviders: ADMITTED_INTELLIGENCE_PROVIDERS,
    defaultProvider: DEFAULT_AGENT_CLI_INTELLIGENCE_PROVIDER,
    schema: INTELLIGENCE_PROVIDER_CONTRACT_SCHEMA,
  });
}

function codexSubscriptionPreflight(provider) {
  return runCodexSubscriptionPreflight(provider, {
    processEnv: process.env,
    processPlatform: process.platform,
    sessionSiteRoot,
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
      runtime,
      agentTuiRuntime: AGENT_TUI_RUNTIME,
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
  if (runtime !== AGENT_TUI_RUNTIME) return {};
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

function normalizeRuntimeSubstrateKind(value) {
  const runtimeName = String(value ?? '').trim();
  if (ADMITTED_RUNTIME_SUBSTRATE_KINDS.includes(runtimeName)) {
    return {
      runtime_substrate_kind: runtimeName,
      runtime_contract_schema: RUNTIME_CONTRACT_SCHEMA,
      source_field: 'runtime',
      legacy_runtime: runtimeName,
    };
  }
  return runtimeRefusal(runtimeName);
}

const runtimeResolution = normalizeRuntimeSubstrateKind(runtimeInput);
if (runtimeResolution.status === 'refused') {
  await failRuntimeRefusal(runtimeResolution);
}
const runtime = runtimeResolution.runtime_substrate_kind;
const intelligenceProviderResolution = normalizeIntelligenceProvider(intelligenceProviderInput, runtime, intelligenceProviderInputSource);
if (intelligenceProviderResolution?.status === 'refused') {
  await failIntelligenceProviderRefusal(intelligenceProviderResolution);
}

if (!identity) {
  console.error('Usage: node start-agent.mjs <identity> [--runtime <runtime>] [--db <path>] [--json] [--dry-run] [--exec] [--wait] [--yolo] [--enable-native-shell] [--target-site-id <site-id>] [--target-site-root <path>]');
  process.exit(1);
}

const intelligenceProviderProjection = intelligenceProviderEnvironmentProjection(intelligenceProviderResolution);
const intelligenceProviderEnv = intelligenceProviderProjection.env;
const intelligenceProviderCredential = intelligenceProviderProjection.credential;
const intelligenceProviderOutputResolution = annotateIntelligenceProviderCredential(intelligenceProviderResolution, intelligenceProviderCredential);
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

function agentCliLauncherScriptPath() {
  return join(rootDir, 'tools', 'operator-surface-carriers', 'Start-AgentCliSession.ps1');
}

function agentCliScriptPath() {
  return resolveNaradaPackageBin('@narada2/agent-cli', 'narada-agent-cli');
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
    args.agent_tui_starting_directive !== undefined ? 'agent_tui_starting_directive' : null,
    args.agent_tui_starting_directive_file !== undefined ? 'agent_tui_starting_directive_file' : null,
  ].filter(Boolean);
  if (sources.length === 0) return null;
  const legacyOnly = sources.every((source) => String(source).startsWith('agent_tui_'));
  if (sources.length > 1) {
    if (legacyOnly) throw new Error('agent_tui_starting_directive_source_ambiguous');
    throw new Error('starting_carrier_input_source_ambiguous');
  }
  const source = sources[0];
  const file = source.endsWith('_file')
    ? source === 'starting_carrier_input_file'
      ? args.starting_carrier_input_file
      : args.agent_tui_starting_directive_file
    : undefined;
  const inline = source === 'starting_carrier_input'
    ? args.starting_carrier_input
    : source === 'agent_tui_starting_directive'
      ? args.agent_tui_starting_directive
      : undefined;
  if (file !== undefined && !existsSync(file)) {
    if (source === 'agent_tui_starting_directive_file') throw new Error(`agent_tui_starting_directive_file_missing: ${file}`);
    throw new Error(`starting_carrier_input_file_missing: ${file}`);
  }
  const text = file !== undefined ? readFileSync(file, 'utf8') : String(inline ?? '');
  if (text.trim().length === 0) {
    if (source.startsWith('agent_tui_')) throw new Error('agent_tui_starting_directive_empty');
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

function resolveRuntimeCommand(runtimeName) {
  return resolveCarrierRuntimeCommand(runtimeName, {
    agentTuiRuntime: AGENT_TUI_RUNTIME,
    processPlatform: process.platform,
    processExecPath: process.execPath,
    stableNodeCommand,
    defaultClaudeCodeCommand: DEFAULT_CLAUDE_CODE_COMMAND,
    claudeCodeCommand: process.env.NARADA_CLAUDE_CODE_COMMAND,
    opencodeCommand: process.env.NARADA_OPENCODE_COMMAND,
  });
}

function materializeCarrierSessionRecord({ identity, runtime, startResult, dryRun = false } = {}) {
  return materializeCarrierSessionRecordArtifact({
    identity,
    runtime,
    startResult,
    dryRun,
    pcSiteRoot,
    userSiteRoot: rootDir,
    runtimeContractSchema: RUNTIME_CONTRACT_SCHEMA,
    launchSource,
    workspace: process.cwd(),
    processId: process.pid,
    writeJsonFile,
  });
}

function carrierSessionLegacyUnbound(error) {
  return {
    schema: 'narada.pc_runtime.carrier_session.registration.v0',
    status: 'legacy_unbound_carrier_session',
    reason: error instanceof Error ? error.message : String(error),
    carrier_session_id: null,
    environment: {},
    fail_closed: true,
  };
}

function nativeShellExceptionStatus() {
  if (runtime !== 'codex') return null;
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
  if (runtime !== 'kimi' || dryRun) return null;

  const sessionDir = kimiSessionDir(identity);
  if (!existsSync(sessionDir)) {
    return { status: 'not_found', session_dir: sessionDir };
  }

  rmSync(sessionDir, { recursive: true, force: true });
  return { status: 'cleared', session_dir: sessionDir };
}

function setKimiSessionTitle(identity, role) {
  if (runtime !== 'kimi' || dryRun) return null;

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
    NARADA_SITE_ROOT: sessionSiteRoot,
    NARADA_WORKSPACE_ROOT: process.cwd(),
    NARADA_AGENT_CONTEXT_DB: dbPath,
  }).filter(([, value]) => value !== null && value !== undefined && value !== ''));
}

function codexMcpServerDefinitions() {
  return projectFabricForCodex(mcpFabric);
}

function codexMcpServerNames() {
  return mcpServerNames(mcpFabric);
}

function mcpToolApprovalPacket({ approved, note }) {
  return {
    status: 'approved_by_launcher_config',
    server_names: approved,
    note,
  };
}

function mcpToolApprovalStatus() {
  if (runtime !== 'codex') return null;
  return mcpToolApprovalPacket({
    approved: codexMcpServerNames(),
    note: 'Approves configured Narada MCP tool calls at the Codex carrier layer. Native Codex shell_tool remains disabled by default; shell execution still goes through the policy-aware Narada shell MCP.',
  });
}

function buildSpawnArgs(runtime, identity, carrierSessionRegistration = null) {
  return buildCarrierSpawnArgs(runtime, {
    agentTuiRuntime: AGENT_TUI_RUNTIME,
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
  });
}

function codexMcpRegistrationStatus(identity, eventId) {
  if (runtime !== 'codex') return null;
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

function startupCommandFromSequence(startupSequence = []) {
  const firstStep = startupSequence[0];
  if (!firstStep?.tool) return null;
  return {
    name: firstStep.tool,
    arguments: firstStep.arguments ?? {},
    display: `${firstStep.tool}(${JSON.stringify(firstStep.arguments ?? {})})`,
  };
}

function writeLaunchResult(result) {
  return writeLaunchResultFile(result, { siteRoot: rootDir });
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
  carrierSessionRegistration = materializeCarrierSessionRecord({ identity, runtime, startResult, dryRun: carrierSessionPlanOnly });
} catch (error) {
  carrierSessionRegistration = carrierSessionLegacyUnbound(error);
}

const carrierActions = {
  cleared_kimi_session: clearKimiSession(identity),
  set_kimi_title: setKimiSessionTitle(identity, startResult.role),
  carrier_session_registration: carrierSessionRegistration,
  codex_mcp_registration: codexMcpRegistrationStatus(identity, startResult.agent_start_event),
};

if (runtime !== 'kimi' && runtime !== 'opencode') {
  try {
    mcpFabric = loadSiteMcpFabric(sessionSiteRoot, { required: true, validateRegistry: true });
    assertTemporaryNaradaPrefixedMcpServerNameGate(mcpFabric);
  } catch (error) {
    await failToolFabricRefusal(error);
  }
}

const spawnArgs = buildSpawnArgs(runtime, identity, carrierSessionRegistration);
const toolFabricAdapter = resolveToolFabricAdapter(runtime);
const execCommand = [resolveRuntimeCommand(runtime), ...spawnArgs.map(shellQuote)].join(' ');
const carrierEnvironment = carrierSessionRegistration.environment ?? {};
const agentTuiEnvironment = agentTuiTerminalEnvironment();
const mcpProviderCredentialEnv = mcpProviderCredentialEnvironment();
const startingCarrierInput = resolveStartingCarrierInput();
const environmentSiteRoot = sessionSiteRoot;
const workspaceRoot = process.cwd();
const runtimeEnvironment = runtimeSpecificEnvironment(runtime, {
  processEnv: process.env,
  defaultPiProvider: DEFAULT_PI_PROVIDER,
  defaultPiModel: DEFAULT_PI_MODEL,
  defaultClaudeCodeCommand: DEFAULT_CLAUDE_CODE_COMMAND,
  defaultClaudeCodeModel: DEFAULT_CLAUDE_CODE_MODEL,
});
const { requiredEnvironment, wouldSetEnvironment } = buildCarrierEnvironmentProjection({
  runtimeName: runtime,
  startResult,
  carrierEnvironment,
  intelligenceProviderEnv,
  mcpProviderCredentialEnv,
  agentTuiEnvironment,
  runtimeEnvironment,
  identity,
  agentStartEventId: startResult.agent_start_event,
  environmentSiteRoot,
  workspaceRoot,
  dbPath,
});
const agentCliLaunch = buildAgentCliLaunchPacket(runtime, {
  processExecPath: process.execPath,
  carrierSessionRegistration,
  sessionSiteRoot,
  siteCarrierControlPath,
  siteCarrierSessionPath,
});

const output = {
  ...startResult,
  schema: 'narada.agent_start.result.v0',
  runtime_contract_schema: RUNTIME_CONTRACT_SCHEMA,
  runtime_substrate_kind: runtime,
  target_site_id: targetSiteId,
  target_site_root: targetSiteRoot,
  session_site_root: sessionSiteRoot,
  pc_site_root: pcSiteRoot,
  site_tools_root: candidateSiteToolsRoot,
  launch_source: launchSource,
  wait: waitFlag,
  yolo: yoloFlag,
  runtime_resolution: runtimeResolution,
  tool_fabric_adapter_contract_schema: TOOL_FABRIC_ADAPTER_CONTRACT_SCHEMA,
  admitted_tool_fabric_adapter_kinds: [...ADMITTED_TOOL_FABRIC_ADAPTER_KINDS],
  tool_fabric_adapter: toolFabricAdapter,
  tool_fabric_adapter_kind: toolFabricAdapter.tool_fabric_adapter_kind,
  agent_cli_launch: agentCliLaunch,
  mcp_fabric: mcpFabric ? {
    source: mcpFabric.source,
    site_root: mcpFabric.site_root,
    files: mcpFabric.files,
    server_names: mcpServerNames(mcpFabric),
    skipped: mcpFabric.skipped,
  } : null,
  intelligence_provider_contract_schema: INTELLIGENCE_PROVIDER_CONTRACT_SCHEMA,
  intelligence_provider: intelligenceProviderOutputResolution?.intelligence_provider ?? null,
  intelligence_provider_resolution: intelligenceProviderOutputResolution,
  required_environment: requiredEnvironment,
  would_set_environment: wouldSetEnvironment,
  carrier_session: carrierSessionRegistration,
  starting_carrier_input: startingCarrierInputOutput(startingCarrierInput),
  exec: execFlag,
  carrier_actions: carrierActions,
  native_shell_exception: nativeShellExceptionStatus(),
  mcp_tool_approval: mcpToolApprovalStatus(),
  runtime_args: spawnArgs,
  exec_command: execFlag ? execCommand : null,
  context_isolation: runtime === 'codex' ? codexContextIsolationStatus({ exec: execFlag, dryRun }) : { status: 'isolated', runtime },
  launch_result_path: null,
};

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
  await waitForEnterBeforeRuntime(identity, runtime);
}

if (carrierSessionRegistration.status !== 'registered') {
  console.error(`[FAIL] carrier_session_registration_required: ${carrierSessionRegistration.reason ?? carrierSessionRegistration.status}`);
  process.exit(1);
}

if (runtime === 'agent-cli' || runtime === AGENT_TUI_RUNTIME) {
  materializeCarrierLaunchFiles(carrierSessionRegistration.carrier_session_id, startingCarrierInput);
}

const isOpencodeWin32 = runtime === 'opencode' && process.platform === 'win32';
const spawnCommand = isOpencodeWin32 ? 'cmd.exe' : resolveRuntimeCommand(runtime);
const spawnCommandArgs = isOpencodeWin32 ? ['/c', resolveRuntimeCommand(runtime), ...spawnArgs] : spawnArgs;

const child = spawn(spawnCommand, spawnCommandArgs, {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: {
    ...process.env,
    ...intelligenceProviderEnv,
    ...mcpProviderCredentialEnv,
    ...(runtime === 'pi' ? {} : runtimeEnvironment),
    NARADA_AGENT_ID: identity,
    NARADA_AGENT_START_EVENT_ID: startResult.agent_start_event,
    NARADA_CARRIER_SESSION_ID: carrierSessionRegistration.carrier_session_id,
    NARADA_SITE_ROOT: environmentSiteRoot,
    NARADA_WORKSPACE_ROOT: workspaceRoot,
    NARADA_AGENT_CONTEXT_DB: dbPath,
    ...agentTuiEnvironment,
  },
  ...runtimeSpawnOptions(runtime),
});

child.on('error', (err) => {
  console.error(`[FAIL] Failed to spawn runtime: ${err.message}`);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

async function waitForEnterBeforeRuntime(agentId, runtimeName) {
  if (!process.stdin.isTTY) {
    await writeStdout(`agent_start_wait_skipped: stdin is not a terminal; starting ${runtimeName}\n`);
    return;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const { formatAgentStartWaitPrompt } = await loadAgentStartRenderer();
    await rl.question(formatAgentStartWaitPrompt(agentId, runtimeName));
  } finally {
    rl.close();
  }
}
