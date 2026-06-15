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
import { delimiter, join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';

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

function loadSiteEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;
    const name = trimmed.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    if (process.env[name]) continue;
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[name] = value;
  }
}

function siteNaradaRoot(siteRoot) {
  const normalized = resolve(String(siteRoot ?? ''));
  return normalized.toLowerCase().endsWith('\\.narada') || normalized.toLowerCase().endsWith('/.narada')
    ? normalized
    : join(normalized, '.narada');
}

function loadSiteEnvFiles(siteRoot) {
  loadSiteEnvFile(join(siteRoot, '.env'));
  loadSiteEnvFile(join(siteNaradaRoot(siteRoot), '.env'));
}

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
loadSiteEnvFiles(sessionSiteRoot);
const intelligenceProviderInput = args.intelligence_provider ?? (runtimeInput === 'agent-cli' ? process.env.NARADA_INTELLIGENCE_PROVIDER : null) ?? null;
const dbPath = args.db ?? join(sessionSiteRoot, '.ai', 'state', 'agent-context.sqlite');
const require = createRequire(import.meta.url);
const RUNTIME_SUBSTRATE_KINDS_PACKET = Object.freeze(JSON.parse(readFileSync(resolveNaradaPackageExport('@narada2/carrier-runtime-contract', './runtime-substrate-kinds'), 'utf8')));
const RUNTIME_CONTRACT_SCHEMA = RUNTIME_SUBSTRATE_KINDS_PACKET.schema;
const AGENT_TUI_RUNTIME = 'agent-tui';
const AGENT_TUI_TERMINAL_RENDERING_ENV = 'NARADA_AGENT_TUI_ENABLE_TERMINAL_RENDERING';
const AGENT_TUI_TERMINAL_MODE_ENV = 'NARADA_AGENT_TUI_TERMINAL_MODE';
const AGENT_TUI_TERMINAL_MODE = 'interactive_loop';
const AGENT_TUI_INTERACTIVE_LOOP_MAX_STEPS = '100000';
const ADMITTED_RUNTIME_SUBSTRATE_KINDS = Object.freeze(RUNTIME_SUBSTRATE_KINDS_PACKET.admitted_runtime_substrate_kinds);
const TOOL_FABRIC_ADAPTER_CONTRACT_SCHEMA = 'narada.tool_fabric_adapter_kind.v1';
const INTELLIGENCE_PROVIDER_CONTRACT_SCHEMA = 'narada.intelligence_provider.v1';
const ADMITTED_TOOL_FABRIC_ADAPTER_KINDS = Object.freeze([
  'codex-native-mcp',
  'narada-agent-cli-mcp-client',
  'narada-agent-tui-terminal-interactive-loop',
  'pi-extension-mcp-bridge',
  'claude-code-native-mcp',
  'opencode-native-mcp',
  'ambient-carrier-tools',
]);
function naradaPackageDirectoryName(packageName) {
  const parts = String(packageName).split('/');
  return parts[parts.length - 1];
}

function naradaPackageRoot(packageName) {
  try {
    return dirname(require.resolve(`${packageName}/package.json`));
  } catch {
    const siblingRoot = join(dirname(NARADA_PROPER_ROOT), naradaPackageDirectoryName(packageName));
    if (existsSync(join(siblingRoot, 'package.json'))) return siblingRoot;
    return join(NARADA_PROPER_ROOT, 'packages', naradaPackageDirectoryName(packageName));
  }
}

function readNaradaPackageJson(packageName) {
  return JSON.parse(readFileSync(join(naradaPackageRoot(packageName), 'package.json'), 'utf8'));
}

function resolveNaradaPackageExport(packageName, exportName = '.') {
  const packageJson = readNaradaPackageJson(packageName);
  const exportsMap = packageJson.exports ?? {};
  const target = typeof exportsMap === 'string' && exportName === '.'
    ? exportsMap
    : exportsMap[exportName];
  if (!target) {
    throw new Error(`narada_package_export_missing: ${packageName} ${exportName}`);
  }
  return join(naradaPackageRoot(packageName), target);
}

function resolveNaradaPackageBin(packageName, binName) {
  const packageJson = readNaradaPackageJson(packageName);
  const target = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.[binName];
  if (!target) {
    throw new Error(`narada_package_bin_missing: ${packageName} ${binName}`);
  }
  return join(naradaPackageRoot(packageName), target);
}
const INTELLIGENCE_PROVIDER_METADATA_PATH = process.env.NARADA_INTELLIGENCE_PROVIDER_METADATA_PATH ?? resolveNaradaPackageExport('@narada2/carrier-provider-contract', './provider-registry');
const INTELLIGENCE_PROVIDER_METADATA_PACKET = Object.freeze(JSON.parse(readFileSync(INTELLIGENCE_PROVIDER_METADATA_PATH, 'utf8')));
const INTELLIGENCE_PROVIDER_METADATA = Object.freeze(INTELLIGENCE_PROVIDER_METADATA_PACKET.providers);
const ADMITTED_INTELLIGENCE_PROVIDERS = Object.freeze(Object.keys(INTELLIGENCE_PROVIDER_METADATA));
const DEFAULT_AGENT_CLI_INTELLIGENCE_PROVIDER = 'kimi-api';
const DEFAULT_PI_PROVIDER = 'openai-codex';
const DEFAULT_PI_MODEL = 'gpt-5.5';
const DEFAULT_CLAUDE_CODE_COMMAND = 'claude';
const DEFAULT_CLAUDE_CODE_MODEL = 'sonnet';
let mcpFabric = null;
let agentStartRenderer = null;
const PROVIDER_SUPPORT_STATES = Object.freeze({
  DECLARED: 'declared',
  ADMITTED_UNSUPPORTED: 'admitted_unsupported',
  ADAPTER_IMPLEMENTED: 'adapter_implemented',
  VERIFIED_SUPPORTED: 'verified_supported',
  DEPRECATED: 'deprecated',
  REMOVED: 'removed',
});

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
  const source = '.ai/mcp';
  if (runtimeName === 'codex') {
    return {
      schema: TOOL_FABRIC_ADAPTER_CONTRACT_SCHEMA,
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
      schema: TOOL_FABRIC_ADAPTER_CONTRACT_SCHEMA,
      tool_fabric_adapter_kind: 'narada-agent-cli-mcp-client',
      tool_fabric_source: source,
      runtime_substrate_kind: runtimeName,
      adapter_entrypoint: 'package:@narada2/agent-cli#narada-agent-cli',
      expected_tools: ['agent_context_startup_sequence', 'mcp_output_show', 'task_lifecycle_next'],
      states: ['runtime_known', 'adapter_selected', 'source_declared', 'launch_ready'],
    };

  }
  if (runtimeName === AGENT_TUI_RUNTIME) {
    return {
      schema: TOOL_FABRIC_ADAPTER_CONTRACT_SCHEMA,
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
      schema: TOOL_FABRIC_ADAPTER_CONTRACT_SCHEMA,
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
      schema: TOOL_FABRIC_ADAPTER_CONTRACT_SCHEMA,
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
      schema: TOOL_FABRIC_ADAPTER_CONTRACT_SCHEMA,
      tool_fabric_adapter_kind: 'opencode-native-mcp',
      tool_fabric_source: 'substrate-native',
      runtime_substrate_kind: runtimeName,
      adapter_entrypoint: 'opencode --prompt',
      expected_tools: ['agent_context_startup_sequence', 'mcp_output_show', 'task_lifecycle_next'],
      states: ['runtime_known', 'adapter_selected', 'source_declared', 'native_prompt_injection_required', 'launch_ready'],
    };
  }
  return {

    schema: TOOL_FABRIC_ADAPTER_CONTRACT_SCHEMA,
    tool_fabric_adapter_kind: 'ambient-carrier-tools',
    tool_fabric_source: 'substrate-native',
    runtime_substrate_kind: runtimeName,
    adapter_entrypoint: null,
    expected_tools: [],
    states: ['runtime_known', 'adapter_selected', 'no_narada_mcp_claim'],
  };
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
    required_next_step: 'Materialize a valid Site-local .ai/mcp fabric before launching this runtime.',
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

function intelligenceProviderRefusal(candidate) {
  return {
    schema: INTELLIGENCE_PROVIDER_CONTRACT_SCHEMA,
    status: 'refused',
    reason_code: 'intelligence_provider_unsupported',
    candidate_intelligence_provider: String(candidate ?? ''),
    admitted_intelligence_providers: [...ADMITTED_INTELLIGENCE_PROVIDERS],
    reason: 'intelligence_provider is not admitted by narada.intelligence_provider.v1',
    required_next_step: 'Use one of the admitted intelligence provider values or update the versioned intelligence provider contract first.',
  };
}

function intelligenceProviderStateRefusal(provider, providerContract) {
  const support = resolveProviderSupportState(providerContract);
  return {
    schema: INTELLIGENCE_PROVIDER_CONTRACT_SCHEMA,
    status: 'refused',
    reason_code: 'intelligence_provider_support_state_not_ready',
    intelligence_provider: provider,
    support_state: support.state,
    request_adapter: providerContract.adapter_kind,
    reason: `intelligence_provider ${provider} is admitted but not launch-ready: ${support.state}`,
    required_next_step: support.required_next_step,
  };
}

function resolveProviderSupportState(providerContract) {
  const state = normalizeProviderSupportState(providerContract.support_state ?? providerContract.support_status);
  return {
    state,
    ready: state === PROVIDER_SUPPORT_STATES.VERIFIED_SUPPORTED || state === PROVIDER_SUPPORT_STATES.DEPRECATED,
    required_next_step: requiredNextProviderSupportStep(state, providerContract.adapter_kind),
  };
}

function normalizeProviderSupportState(value) {
  if (value === 'supported') return PROVIDER_SUPPORT_STATES.VERIFIED_SUPPORTED;
  if (value === 'unsupported_until_adapter_exists') return PROVIDER_SUPPORT_STATES.ADMITTED_UNSUPPORTED;
  if (value === 'unsupported_until_reviewed') return PROVIDER_SUPPORT_STATES.ADAPTER_IMPLEMENTED;
  return value ?? PROVIDER_SUPPORT_STATES.DECLARED;
}

function requiredNextProviderSupportStep(state, adapterKind) {
  if (state === PROVIDER_SUPPORT_STATES.DECLARED) return 'Admit provider policy and choose a request adapter before launch.';
  if (state === PROVIDER_SUPPORT_STATES.ADMITTED_UNSUPPORTED) return `Implement request adapter ${adapterKind} and move the provider to adapter_implemented.`;
  if (state === PROVIDER_SUPPORT_STATES.ADAPTER_IMPLEMENTED) return 'Verify launcher, docs, credential mapping, and runtime tests before marking verified_supported.';
  if (state === PROVIDER_SUPPORT_STATES.REMOVED) return 'Use an admitted replacement provider or restore the provider through a new contract revision.';
  if (state === PROVIDER_SUPPORT_STATES.DEPRECATED) return 'Provider remains launchable for compatibility; migrate to a non-deprecated provider.';
  return 'Provider is verified for launch.';
}

function normalizeIntelligenceProvider(value, runtimeName) {
  return resolveIntelligenceProviderLaunch(value, runtimeName);
}

function resolveIntelligenceProviderLaunch(value, runtimeName) {
  const states = [];
  const pushState = (state, detail = {}) => states.push({ state, ...detail });
  const inputAbsent = value === null || value === undefined || String(value).trim() === '';
  if (inputAbsent) {
    pushState('input_absent');
    if (runtimeName !== 'agent-cli') return null;
    value = DEFAULT_AGENT_CLI_INTELLIGENCE_PROVIDER;
    pushState('default_provider_selected', { intelligence_provider: value });
  }

  const provider = String(value).trim();
  if (!ADMITTED_INTELLIGENCE_PROVIDERS.includes(provider)) {
    pushState('launch_refused', { reason_code: 'intelligence_provider_unsupported' });
    return withResolutionStates(intelligenceProviderRefusal(provider), states);
  }
  pushState('provider_known', { intelligence_provider: provider });

  if (runtimeName !== 'agent-cli') {
    pushState('launch_refused', { reason_code: 'intelligence_provider_runtime_unsupported' });
    return withResolutionStates({
      schema: INTELLIGENCE_PROVIDER_CONTRACT_SCHEMA,
      status: 'refused',
      reason_code: 'intelligence_provider_runtime_unsupported',
      intelligence_provider: provider,
      runtime_substrate_kind: runtimeName,
      reason: '-IntelligenceProvider currently applies only to -Runtime agent-cli. Kimi and Codex CLI provider selection remains owned by those carriers.',
    }, states);
  }
  pushState('runtime_supports_provider_selection', { runtime_substrate_kind: runtimeName });

  const providerContract = INTELLIGENCE_PROVIDER_METADATA[provider];
  const support = resolveProviderSupportState(providerContract);
  if (!support.ready) {
    pushState('launch_refused', { reason_code: 'intelligence_provider_support_state_not_ready', support_state: support.state });
    return withResolutionStates(intelligenceProviderStateRefusal(provider, providerContract), states);
  }
  pushState('adapter_supported', { request_adapter: providerContract.adapter_kind, support_state: support.state });

  const resolution = withResolutionStates({
    schema: INTELLIGENCE_PROVIDER_CONTRACT_SCHEMA,
    intelligence_provider: provider,
    source_field: inputAbsent ? 'default_for_agent_cli' : 'intelligence_provider',
    request_adapter: providerContract.adapter_kind,
    support_state: support.state,
    default_model: providerContract.default_model,
    model_env: providerContract.model_env_names[0],
    api_base_url_env: providerContract.base_url_env_names[0],
    api_key_env: providerContract.credential_env_names[0],
  }, states);
  pushState('environment_resolved', {
    model_env: resolution.model_env,
    api_base_url_env: resolution.api_base_url_env,
    api_key_env: resolution.api_key_env,
  });
  pushState('launch_ready');
  return resolution;
}

function withResolutionStates(outcome, states) {
  return {
    ...outcome,
    resolution_states: states,
  };
}

function intelligenceProviderEnvironment(providerResolution) {
  if (!providerResolution) return {};
  const provider = providerResolution.intelligence_provider;
  const metadata = INTELLIGENCE_PROVIDER_METADATA[provider];
  const env = {
    NARADA_INTELLIGENCE_PROVIDER: provider,
    NARADA_AI_BASE_URL: firstEnvironmentValue(metadata.base_url_env_names) ?? metadata.base_url,
    NARADA_AI_MODEL: firstEnvironmentValue(metadata.model_env_names) ?? metadata.default_model,
    NARADA_AI_API_KEY: firstEnvironmentValue(metadata.credential_env_names) ?? '',
  };
  if (provider === 'anthropic-api') {
    env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
  }
  return env;
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
const intelligenceProviderResolution = normalizeIntelligenceProvider(intelligenceProviderInput, runtime);
if (intelligenceProviderResolution?.status === 'refused') {
  await failIntelligenceProviderRefusal(intelligenceProviderResolution);
}
const intelligenceProviderEnv = intelligenceProviderEnvironment(intelligenceProviderResolution);

if (!identity) {
  console.error('Usage: node start-agent.mjs <identity> [--runtime <runtime>] [--db <path>] [--json] [--dry-run] [--exec] [--wait] [--yolo] [--enable-native-shell] [--target-site-id <site-id>] [--target-site-root <path>]');
  process.exit(1);
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

function agentCliSessionName(identityName) {
  return identityName.replace(/\./g, '-');
}

function siteCarrierControlPath(sessionId) {
  return join(siteNaradaRoot(sessionSiteRoot), 'crew', 'nars-sessions', sessionId, 'control.jsonl');
}

function siteCarrierSessionPath(sessionId) {
  return join(siteNaradaRoot(sessionSiteRoot), 'crew', 'nars-sessions', sessionId, 'session.jsonl');
}

function materializeCarrierLaunchFiles(sessionId, startingCarrierInput) {
  const controlPath = siteCarrierControlPath(sessionId);
  const sessionPath = siteCarrierSessionPath(sessionId);
  mkdirSync(dirname(controlPath), { recursive: true });
  if (!existsSync(controlPath)) writeFileSync(controlPath, '', 'utf8');
  if (!existsSync(sessionPath)) writeFileSync(sessionPath, '', 'utf8');
  if (startingCarrierInput?.content) {
    const existingControl = readFileSync(controlPath, 'utf8');
    if (existingControl.trim().length === 0) {
      const now = new Date().toISOString();
      const token = identityToken(`${sessionId}_starting_carrier_input`);
      const controlRecord = {
        schema: 'narada.carrier.control.input_event.v1',
        control_event_id: `control_${token}`,
        input_event_id: `input_${token}`,
        written_at: now,
        input: {
          schema: 'narada.carrier.input_event.v1',
          event_id: `input_${token}`,
          source_kind: 'system',
          source_id: 'agent-start.starting_carrier_input',
          transport: 'startup_injection',
          delivery_mode: 'admit_for_current_turn',
          hold_condition: null,
          content: startingCarrierInput.content,
          created_at: now,
          authority_ref: `agent_start_event:${startResult.agent_start_event}`,
          directive_id: `dir_${token}`,
          metadata: {
            agent_start_event_id: startResult.agent_start_event,
            carrier_session_id: sessionId,
            startup_injection: true,
            directive_provenance: {
              kind: 'operator_authorized_system_starting_carrier_input',
              authorized_by: startingCarrierInput.source,
              emitted_by: 'agent-start',
            },
          },
        },
      };
      writeFileSync(controlPath, `${JSON.stringify(controlRecord)}\n`, 'utf8');
    }
  }
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
  if (runtimeName === AGENT_TUI_RUNTIME) {
    return 'cargo';
  }
  if (process.platform === 'win32' && runtimeName === 'codex') {
    return process.execPath;
  }
  if (runtimeName === 'agent-cli') {
    return process.execPath;
  }
  if (runtimeName === 'pi') {
    return stableNodeCommand();
  }
  if (runtimeName === 'claude-code') {
    return process.env.NARADA_CLAUDE_CODE_COMMAND ?? DEFAULT_CLAUDE_CODE_COMMAND;
  }
  if (runtimeName === 'opencode') {
    return process.env.NARADA_OPENCODE_COMMAND ?? 'opencode';
  }
  return runtimeName;
}

function runtimeSpawnOptions(runtimeName) {
  if (runtimeName === 'opencode') return { shell: true };
  return {};
}

function newCarrierSessionId() {
  return `carrier_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function materializeCarrierSessionRecord({ identity, runtime, startResult, dryRun = false } = {}) {
  const carrierSessionId = newCarrierSessionId();
  const recordPath = join(pcSiteRoot, 'runtime', 'carrier-sessions', `${carrierSessionId}.json`);
  const startedAt = new Date().toISOString();
  const record = {
    schema: 'narada.pc_runtime.carrier_session.v0',
    carrier_session_id: carrierSessionId,
    status: dryRun ? 'planned' : 'registered',
    declared_agent_identity: identity,
    verified_agent_identity: startResult.identity,
    verification_source: 'agent_context_session_start',
    verification_state: startResult.identity === identity ? 'verified' : 'mismatch',
    agent_start_event_id: startResult.agent_start_event ?? null,
    runtime_contract_schema: RUNTIME_CONTRACT_SCHEMA,
    runtime_substrate_kind: runtime,
    substrate: runtime,
    window_carrier_kind: 'launcher_process',
    carrier_kind: 'launcher_process',
    workspace: process.cwd(),
    launch_source: launchSource,
    user_site_root: rootDir,
    pc_site_root: pcSiteRoot,
    started_at: startedAt,
    parent_process: {
      pid: process.pid,
      evidence_kind: 'launcher_process',
    },
    operator_surface_window_evidence: null,
    restart_handle: {
      class: 'operator_manual_only_with_handle',
      handle: carrierSessionId,
      authority_owner: 'pc_site_runtime',
      semantics: 'Restart this launcher-bound carrier session through the operator-visible launch surface or explicit operator action.',
    },
    authority_basis: {
      kind: 'agent_launch_path',
      summary: 'Carrier session registration materialized by start-agent before spawning the substrate child.',
    },
  };

  if (!dryRun) {
    writeJsonFile(recordPath, record);
  }

  return {
    schema: 'narada.pc_runtime.carrier_session.registration.v0',
    status: dryRun ? 'planned' : 'registered',
    carrier_session_id: carrierSessionId,
    record_path: recordPath,
    environment: {
      NARADA_CARRIER_SESSION_ID: carrierSessionId,
    },
    record,
  };
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

function codexContextIsolationStatus({ exec = false, dryRun = false } = {}) {
  return {
    status: exec && !dryRun ? 'fresh_launcher_bound' : 'fresh_launch_planned',
    code: exec && !dryRun ? 'codex_fresh_launcher_bound' : 'codex_fresh_launch_planned',
    runtime: 'codex',
    runtime_substrate_kind: 'codex',
    reason: 'Narada can start a fresh Codex carrier with a bound agent identity and MCP-only posture. Exact resume proof remains a separate unadmitted boundary.',
    operator_message: 'Use launcher-started fresh Codex sessions for bound identity. Do not use codex resume --last, ambient picker selection, or manual session selection as authority.',
    safe_action: 'For continuation, resume only by an exact Codex session id after Narada has admitted and verified that session evidence.',
    forbidden_resume_modes: ['codex resume --last', 'ambient picker selection', 'manual session selection as authority'],
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

function optionalEnvironmentValue(name) {
  const value = process.env[name];
  return value === undefined || value === '' ? null : value;
}

function resolveCodexCliScriptFromPackage() {
  const candidates = [
    '@openai/codex/bin/codex.js',
    '@openai/codex/bin/codex',
  ];
  for (const candidate of candidates) {
    try {
      const resolved = require.resolve(candidate);
      if (existsSync(resolved)) return resolved;
    } catch {
      // Try the next known package entrypoint shape.
    }
  }
  return null;
}

function pathDirectories() {
  const pathValue = process.env.PATH ?? process.env.Path ?? '';
  return pathValue.split(delimiter).filter((entry) => entry.length > 0);
}

function resolveCodexCliScriptFromPath() {
  for (const directory of pathDirectories()) {
    const adjacentPackageScript = join(directory, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (existsSync(adjacentPackageScript)) return adjacentPackageScript;
  }
  return null;
}

function codexCliScriptPath() {
  const explicitScriptPath = optionalEnvironmentValue('NARADA_CODEX_CLI_SCRIPT');
  if (explicitScriptPath !== null) {
    if (!existsSync(explicitScriptPath)) {
      throw new Error(`codex_cli_script_missing: ${explicitScriptPath}`);
    }
    return explicitScriptPath;
  }

  const resolvedScriptPath = resolveCodexCliScriptFromPackage() ?? resolveCodexCliScriptFromPath();
  if (resolvedScriptPath !== null) return resolvedScriptPath;

  throw new Error('codex_cli_script_unresolved: set NARADA_CODEX_CLI_SCRIPT or install @openai/codex on PATH');
}
function codexTomlString(value) {
  return JSON.stringify(String(value));
}

function codexTomlArray(values) {
  return `[${values.map(codexTomlString).join(', ')}]`;
}

function codexMcpDefinitionArgs(servers) {
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

function buildSpawnArgs(runtime, identity, capabilityPolicy = {}, providerResolution = null, carrierSessionRegistration = null) {
  if (runtime === 'codex') {
    const servers = codexMcpServerDefinitions();
    const args = [
      '--ask-for-approval',
      'never',
      ...codexMcpDefinitionArgs(servers),
    ];
    args.push('--disable', 'apps');
    if (!enableNativeShellFlag) {
      args.push('--disable', 'shell_tool');
    }
    if (process.platform === 'win32') {
      return [codexCliScriptPath(), ...args];
    }
    return args;
  }

  if (runtime === 'agent-cli') {
    const sessionId = carrierSessionRegistration?.carrier_session_id ?? agentCliSessionName(identity);
    return [
      agentCliScriptPath(),
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
    ];
  }

  if (runtime === AGENT_TUI_RUNTIME) {
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
      args.agent_tui_runtime_loop === true ? '--runtime-loop' : '--interactive-loop',
      '--max-steps',
      String(args.agent_tui_max_steps ?? AGENT_TUI_INTERACTIVE_LOOP_MAX_STEPS),
    ];
  }

  if (runtime === 'pi') {
    return [
      piCliScriptPath(),
      '--provider',
      process.env.NARADA_PI_PROVIDER ?? DEFAULT_PI_PROVIDER,
      '--model',
      process.env.NARADA_PI_MODEL ?? DEFAULT_PI_MODEL,
      '--session-dir',
      join(rootDir, '.ai', 'runtime', 'pi-sessions', identity),
      '--extension',
      join(rootDir, '.pi', 'extensions', 'narada-mcp-bridge.ts'),
      '--append-system-prompt',
      `You are ${identity}. The human is Operator. This session was launched by Narada agent-start. Narada tools are attached through the Narada-owned Pi MCP bridge generated from the Site-local .ai/mcp fabric. Use agent_context_startup_sequence first. Treat operator startup nudges as this MCP startup affordance, not shell or file discovery. If the startup MCP tool is unavailable, report the missing MCP capability. When a Narada tool returns reader_tool=mcp_output_show, call mcp_output_show with the returned output_ref before deciding next work.`,
    ];
  }

  if (runtime === 'claude-code') {
    return [
      '--model',
      process.env.NARADA_CLAUDE_CODE_MODEL ?? DEFAULT_CLAUDE_CODE_MODEL,
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
      `You are ${identity}. The human is Operator. This session was launched by Narada agent-start. Narada tools are attached through Claude Code native MCP config generated from the Site MCP fabric. Use agent_context_startup_sequence first. Treat operator startup nudges as this MCP startup affordance, not shell or file discovery. If the startup MCP tool is unavailable, report the missing MCP capability. When a Narada tool returns reader_tool=mcp_output_show, call mcp_output_show with the returned output_ref before deciding next work.`,
    ];
  }

  if (runtime === 'opencode') {
    return [
      '--prompt',
      `You are ${identity}. The human is Operator. This session was launched by Narada agent-start. Narada tools are attached through the Site MCP fabric declared in .ai/mcp. Use agent_context_startup_sequence first. Treat operator startup nudges as this MCP startup affordance, not shell or file discovery. If the startup MCP tool is unavailable, report the missing MCP capability. When a Narada tool returns reader_tool=mcp_output_show, call mcp_output_show with the returned output_ref before deciding next work.`,
    ];
  }

  const spawnArgs = ['-S', identity];
  if (yoloFlag) {
    spawnArgs.push('-y');
  }
  return spawnArgs;
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
  const eventId = result.agent_start_event;
  if (!eventId) return null;
  const outDir = join(rootDir, '.ai', 'runtime', 'agent-start-results');
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `${eventId}.result.json`);
  result.launch_result_path = path;
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
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
  } catch (error) {
    await failToolFabricRefusal(error);
  }
}

const spawnArgs = buildSpawnArgs(runtime, identity, startResult.capability_policy, intelligenceProviderResolution, carrierSessionRegistration);
const toolFabricAdapter = resolveToolFabricAdapter(runtime);
const execCommand = [resolveRuntimeCommand(runtime), ...spawnArgs].join(' ');
const carrierEnvironment = carrierSessionRegistration.environment ?? {};
const agentTuiEnvironment = agentTuiTerminalEnvironment();
const startingCarrierInput = resolveStartingCarrierInput();
const environmentSiteRoot = sessionSiteRoot;
const workspaceRoot = process.cwd();
const requiredEnvironment = {
  ...(startResult.required_environment ?? {}),
  ...carrierEnvironment,
  ...intelligenceProviderEnv,
  ...agentTuiEnvironment,
  ...(runtime === 'pi' ? {
    NARADA_PI_COMMAND: process.env.NARADA_PI_COMMAND ?? 'pi',
    NARADA_PI_PROVIDER: process.env.NARADA_PI_PROVIDER ?? DEFAULT_PI_PROVIDER,
    NARADA_PI_MODEL: process.env.NARADA_PI_MODEL ?? DEFAULT_PI_MODEL,
  } : {}),
  ...(runtime === 'claude-code' ? {
    NARADA_CLAUDE_CODE_COMMAND: process.env.NARADA_CLAUDE_CODE_COMMAND ?? DEFAULT_CLAUDE_CODE_COMMAND,
    NARADA_CLAUDE_CODE_MODEL: process.env.NARADA_CLAUDE_CODE_MODEL ?? DEFAULT_CLAUDE_CODE_MODEL,
  } : {}),
  ...(runtime === 'opencode' ? {
    NARADA_OPENCODE_COMMAND: process.env.NARADA_OPENCODE_COMMAND ?? 'opencode',
  } : {}),
  NARADA_AGENT_ID: identity,
  NARADA_AGENT_START_EVENT_ID: startResult.agent_start_event,
  NARADA_SITE_ROOT: environmentSiteRoot,
  NARADA_WORKSPACE_ROOT: workspaceRoot,
  NARADA_AGENT_CONTEXT_DB: dbPath,
};
const agentCliLaunch = runtime === 'agent-cli'
  ? {
schema: 'narada.agent_start.agent_cli.v0',
control_transport: 'jsonl_sideband_file',
carrier_relation: 'interactive_agent_cli',
command: process.execPath,
session_dir: dirname(siteCarrierControlPath(carrierSessionRegistration.carrier_session_id)),
control_path: siteCarrierControlPath(carrierSessionRegistration.carrier_session_id),
session_path: siteCarrierSessionPath(carrierSessionRegistration.carrier_session_id),
site_mcp_fabric: join(sessionSiteRoot, '.ai', 'mcp'),
reads_only_target_site_mcp_fabric: true,
user_site_mcp_injected: false,
native_shell_authority_admitted: false,
  }
  : null;

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
  intelligence_provider: intelligenceProviderResolution?.intelligence_provider ?? null,
  intelligence_provider_resolution: intelligenceProviderResolution,
  required_environment: requiredEnvironment,
  would_set_environment: startResult.would_set_environment
    ? { ...startResult.would_set_environment, ...carrierEnvironment, ...intelligenceProviderEnv, ...agentTuiEnvironment, ...(runtime === 'pi' ? { NARADA_PI_COMMAND: process.env.NARADA_PI_COMMAND ?? 'pi', NARADA_PI_PROVIDER: process.env.NARADA_PI_PROVIDER ?? DEFAULT_PI_PROVIDER, NARADA_PI_MODEL: process.env.NARADA_PI_MODEL ?? DEFAULT_PI_MODEL } : {}), ...(runtime === 'claude-code' ? { NARADA_CLAUDE_CODE_COMMAND: process.env.NARADA_CLAUDE_CODE_COMMAND ?? DEFAULT_CLAUDE_CODE_COMMAND, NARADA_CLAUDE_CODE_MODEL: process.env.NARADA_CLAUDE_CODE_MODEL ?? DEFAULT_CLAUDE_CODE_MODEL } : {}), ...(runtime === 'opencode' ? { NARADA_OPENCODE_COMMAND: process.env.NARADA_OPENCODE_COMMAND ?? 'opencode' } : {}), NARADA_AGENT_ID: identity, NARADA_AGENT_START_EVENT_ID: startResult.agent_start_event, NARADA_SITE_ROOT: environmentSiteRoot,
  NARADA_WORKSPACE_ROOT: workspaceRoot, NARADA_AGENT_CONTEXT_DB: dbPath }
    : startResult.would_set_environment,
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

const child = spawn(resolveRuntimeCommand(runtime), spawnArgs, {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: {
    ...process.env,
    ...intelligenceProviderEnv,
    ...(runtime === 'claude-code' ? {
      NARADA_CLAUDE_CODE_COMMAND: process.env.NARADA_CLAUDE_CODE_COMMAND ?? DEFAULT_CLAUDE_CODE_COMMAND,
      NARADA_CLAUDE_CODE_MODEL: process.env.NARADA_CLAUDE_CODE_MODEL ?? DEFAULT_CLAUDE_CODE_MODEL,
    } : {}),
    ...(runtime === 'opencode' ? {
      NARADA_OPENCODE_COMMAND: process.env.NARADA_OPENCODE_COMMAND ?? 'opencode',
    } : {}),
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
