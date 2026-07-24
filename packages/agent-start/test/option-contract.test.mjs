import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { resolveNaradaSitePaths } from '@narada2/site-paths';
import { runHiddenPostureCommandSync } from '@narada2/process-launch-posture';
import {
  buildCarrierProcessEnvironment,
  carrierSpawnOptions,
  resolveCarrierCommand,
  resolveToolFabricAdapter,
  stripLegacyIntelligenceSelectionEnvironment,
  stripInheritedIntelligenceLaunchContextEnvironment,
} from '../src/carrier-launch-adapter.ts';
import { loadIntelligenceLaunchContext } from '../src/intelligence-launch-context.ts';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');
const naradaProperRoot = resolve(packageRoot, '..', '..');
const launcherPath = join(packageRoot, 'src', 'narada-agent-start.ts');
const tsxLoaderPath = pathToFileURL(require.resolve('tsx')).href;
const identity = 'narada.architect';
const sharedRuntimeContract = JSON.parse(readFileSync(resolve(naradaProperRoot, 'packages', 'operator-surface-runtime-contract', 'contracts', 'runtime-substrate-kinds.json'), 'utf8'));
const sharedCarrierLaunchMatrix = JSON.parse(readFileSync(resolve(naradaProperRoot, 'packages', 'operator-surface-runtime-contract', 'contracts', 'operator-surface-launch-matrix.json'), 'utf8'));
const baseArgs = [
  '--import',
  tsxLoaderPath,
  launcherPath,
  identity,
  '--site-root',
  naradaProperRoot,
  '--target-site-root',
  naradaProperRoot,
  '--dry-run',
  '--json',
];
const baseTestEnv = {
  KIMI_CODE_API_KEY: 'test-key',
};

function run(extraArgs = [], extraEnv = {}) {
  return runHiddenPostureCommandSync(process.execPath, [...baseArgs, ...withDefaultMcpScopeNone(extraArgs)], {
    cwd: naradaProperRoot,
    encoding: 'utf8',
    env: { ...process.env, ...baseTestEnv, ...extraEnv },
    posture: 'test_child',
  });
}

function writeAllowedRootMcpServerFile(siteRoot, fileName, serverName, allowedRoots, injectionScope = 'local_site') {
  mkdirSync(join(siteRoot, '.ai'), { recursive: true });
  mkdirSync(join(siteRoot, '.ai', 'mcp'), { recursive: true });
  copyFileSync(join(naradaProperRoot, '.ai', 'task-lifecycle.db'), join(siteRoot, '.ai', 'task-lifecycle.db'));
  writeFileSync(join(siteRoot, '.ai', 'mcp', fileName), JSON.stringify({
    mcpServers: {
      [serverName]: {
        transport: 'stdio',
        command: 'node',
        args: allowedRoots.flatMap((root) => ['--allowed-root', root]),
        tools: ['agent_context_startup_sequence'],
        target_site_root: '{site_root}',
        injection_scope: injectionScope,
        narada_scope: { injection_scope: injectionScope },
      },
    },
  }, null, 2), 'utf8');
}

function writeCanonicalMcpServerFile(siteRoot, fileName, serverName, surfaceId, injectionScope) {
  mkdirSync(join(siteRoot, '.ai'), { recursive: true });
  mkdirSync(join(siteRoot, '.ai', 'mcp'), { recursive: true });
  copyFileSync(join(naradaProperRoot, '.ai', 'task-lifecycle.db'), join(siteRoot, '.ai', 'task-lifecycle.db'));
  writeFileSync(join(siteRoot, '.ai', 'mcp', fileName), JSON.stringify({
    mcpServers: {
      [serverName]: {
        transport: 'stdio',
        command: 'node',
        args: ['--version'],
        surface_id: surfaceId,
        surface_projection: {
          surface_id: surfaceId,
          projection_id: 'default',
          injection_scope: injectionScope,
        },
        tools: ['agent_context_startup_sequence'],
        target_site_root: '{site_root}',
        injection_scope: injectionScope,
        narada_scope: { injection_scope: injectionScope },
      },
    },
  }, null, 2), 'utf8');
}

function writeMinimalMcpFabric(siteRoot, serverName, injectionScope = 'local_site') {
  mkdirSync(join(siteRoot, '.ai'), { recursive: true });
  mkdirSync(join(siteRoot, '.ai', 'mcp'), { recursive: true });
  copyFileSync(join(naradaProperRoot, '.ai', 'task-lifecycle.db'), join(siteRoot, '.ai', 'task-lifecycle.db'));
  writeFileSync(join(siteRoot, '.ai', 'mcp', `${serverName}.json`), JSON.stringify({
    mcpServers: {
      [serverName]: {
        transport: 'stdio',
        command: 'node',
        args: ['--version'],
        tools: ['agent_context_startup_sequence'],
        target_site_root: '{site_root}',
        injection_scope: injectionScope,
        narada_scope: { injection_scope: injectionScope },
      },
    },
  }, null, 2), 'utf8');
}

function writeMinimalMcpServerFile(siteRoot, fileName, serverName, commandArg, injectionScope = 'local_site') {
  mkdirSync(join(siteRoot, '.ai'), { recursive: true });
  mkdirSync(join(siteRoot, '.ai', 'mcp'), { recursive: true });
  copyFileSync(join(naradaProperRoot, '.ai', 'task-lifecycle.db'), join(siteRoot, '.ai', 'task-lifecycle.db'));
  writeFileSync(join(siteRoot, '.ai', 'mcp', fileName), JSON.stringify({
    mcpServers: {
      [serverName]: {
        transport: 'stdio',
        command: 'node',
        args: [commandArg],
        tools: ['agent_context_startup_sequence'],
        target_site_root: '{site_root}',
        injection_scope: injectionScope,
        narada_scope: { injection_scope: injectionScope },
      },
    },
  }, null, 2), 'utf8');
}

function runRealLaunch(extraArgs = [], extraEnv = {}) {
  const argsWithoutDryRun = baseArgs.filter((arg) => arg !== '--dry-run');
  return runHiddenPostureCommandSync(process.execPath, [...argsWithoutDryRun, ...withDefaultMcpScopeNone(extraArgs)], {
    cwd: naradaProperRoot,
    encoding: 'utf8',
    env: { ...process.env, ...baseTestEnv, ...extraEnv },
    posture: 'test_child',
  });
}

function withDefaultMcpScopeNone(extraArgs) {
  return extraArgs.includes('--mcp-scope') ? extraArgs : ['--mcp-scope', 'none', ...extraArgs];
}

function runOk(extraArgs = [], extraEnv = {}) {
  const result = run(extraArgs, extraEnv);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function runWithIdentityOk(identityValue, extraArgs = [], extraEnv = {}) {
  const result = runHiddenPostureCommandSync(process.execPath, [
    '--import',
    tsxLoaderPath,
    launcherPath,
    identityValue,
    '--site-root',
    naradaProperRoot,
    '--target-site-root',
    naradaProperRoot,
    '--dry-run',
    '--json',
    ...withDefaultMcpScopeNone(extraArgs),
  ], {
    cwd: naradaProperRoot,
    encoding: 'utf8',
    env: { ...process.env, ...baseTestEnv, ...extraEnv },
    posture: 'test_child',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function runFailed(extraArgs = [], extraEnv = {}) {
  const result = run(extraArgs, extraEnv);
  assert.notEqual(result.status, 0, 'launcher should fail');
  return result;
}

function agentTuiEnv() {
  return {
    NARADA_INTELLIGENCE_PROVIDER: 'kimi-code-api',
    KIMI_CODE_API_BASE_URL: 'https://api.kimi.com/coding/',
    KIMI_CODE_MODEL: 'kimi-k2.7',
    KIMI_CODE_API_KEY: 'test-key',
  };
}

test('launcher option contract consumes the shared runtime contract without intelligence selection', () => {
  assert.equal(sharedRuntimeContract.schema, 'narada.runtime_substrate_kind.v1');
  assert.equal(sharedRuntimeContract.admitted_runtime_substrate_kinds.includes('codex'), true);
  assert.equal(sharedRuntimeContract.admitted_runtime_substrate_kinds.includes('agent-cli'), false);
  assert.equal(sharedRuntimeContract.admitted_runtime_substrate_kinds.includes('narada-agent-runtime-server'), true);
  assert.equal(sharedRuntimeContract.admitted_runtime_substrate_kinds.includes('agent-tui'), false);
  assert.equal(sharedRuntimeContract.codex_context_isolation.forbidden_resume_modes.includes('codex resume --last'), true);
});

test('agent-start restamps launch ownership for the runtime child process', () => {
  const env = buildCarrierProcessEnvironment({
    processEnvironment: {
      NARADA_LAUNCH_SESSION_ID: 'launch_test_session',
      NARADA_PROCESS_OWNERSHIP: 'session_owned',
      NARADA_PROCESS_ROLE: 'runtime_start',
      NARADA_CREATED_BY_PID: '111',
    },
    carrierName: 'agent-cli',
    identity: 'sonar.resident',
    role: 'resident',
    agentStartEventId: 'evt-test',
    carrierSessionId: 'carrier-test',
    targetSiteId: 'sonar',
    operatorSurfaceKind: 'agent-cli',
    environmentSiteRoot: 'D:/code/narada.sonar',
    workspaceRoot: 'D:/code/narada.sonar',
    dbPath: 'D:/code/narada.sonar/.ai/state/agent-context.sqlite',
    siteConfig: { mcp_scope: 'none' },
    runtimeProcessCreatorPid: 222,
    runtimeProcessRole: 'runtime_server',
  });

  assert.equal(env.NARADA_LAUNCH_SESSION_ID, 'launch_test_session');
  assert.equal(env.NARADA_PROCESS_OWNERSHIP, 'session_owned');
  assert.equal(env.NARADA_PROCESS_ROLE, 'runtime_server');
  assert.equal(env.NARADA_CREATED_BY_PID, '222');
  assert.equal(env.NARADA_MCP_SCOPE, 'none');
});

test('McpScope none projects an explicit empty fabric and no effective loci', () => {
  const output = runOk(['--carrier', 'codex', '--runtime', 'codex', '--mcp-scope', 'none']);
  assert.equal(output.mcp_scope.requested, 'none');
  assert.deepEqual(output.mcp_scope.requested_loci, []);
  assert.deepEqual(output.mcp_scope.effective_loci, []);
  assert.deepEqual(output.mcp_fabric.server_names, []);
  assert.deepEqual(output.site_config.allowed_roots, []);
  assert.equal(output.required_environment.NARADA_SITE_CONFIG.includes('narada.nars.site_config.v1'), true);
  assert.equal(output.mcp_scope.enforcement.inherited_codex_home_allowed, false);
  assert.deepEqual(output.mcp_scope.enforcement.projected_server_names, []);
});

test('McpScope user-site loads only explicit User Site MCP fabric', () => {
  const targetRoot = mkdtempSync(join(tmpdir(), 'narada-agent-start-target-scope-'));
  const userRoot = mkdtempSync(join(tmpdir(), 'narada-agent-start-user-scope-'));
  writeMinimalMcpFabric(targetRoot, 'narada-target-only');
  writeMinimalMcpFabric(userRoot, 'narada-user-only', 'user_site');

  const output = runOk([
    '--carrier', 'codex',
    '--runtime', 'codex',
    '--target-site-root', targetRoot,
    '--mcp-scope', 'user-site',
    '--user-site-root', userRoot,
  ]);
  assert.equal(output.mcp_scope.requested, 'user-site');
  assert.deepEqual(output.mcp_scope.requested_loci, ['user-site']);
  assert.deepEqual(output.mcp_scope.effective_loci, ['user-site']);
  assert.deepEqual(output.mcp_fabric.server_names, ['narada-user-only']);
  assert.equal(output.mcp_fabric.server_names.includes('narada-target-only'), false);
});

test('site config projection advertises allowed roots from admitted MCP fabric', () => {
  const targetRoot = mkdtempSync(join(tmpdir(), 'narada-agent-start-site-config-'));
  const allowedA = join(targetRoot, 'workspace');
  const allowedB = join(targetRoot, 'shared');
  const normalizedAllowedA = allowedA.replaceAll('\\', '/');
  const normalizedAllowedB = allowedB.replaceAll('\\', '/');
  writeAllowedRootMcpServerFile(targetRoot, 'narada-allowed-roots.json', 'narada-allowed-roots', [allowedA, allowedB, allowedA]);

  const output = runOk([
    '--carrier', 'agent-web-ui',
    '--runtime', 'narada-agent-runtime-server',
    '--target-site-root', targetRoot,
    '--mcp-scope', 'local-site',
  ]);
  assert.equal(output.site_config.schema, 'narada.nars.site_config.v1');
  assert.deepEqual(output.site_config.allowed_roots, [normalizedAllowedA, normalizedAllowedB]);
  assert.equal(output.required_environment.NARADA_SITE_CONFIG.includes(normalizedAllowedA), true);
});

test('McpScope host loads only explicit Host MCP fabric', () => {
  const targetRoot = mkdtempSync(join(tmpdir(), 'narada-agent-start-target-scope-'));
  const hostRoot = mkdtempSync(join(tmpdir(), 'narada-agent-start-host-scope-'));
  writeMinimalMcpFabric(targetRoot, 'narada-target-only');
  writeMinimalMcpFabric(hostRoot, 'narada-host-only', 'host');

  const output = runOk([
    '--carrier', 'codex',
    '--runtime', 'codex',
    '--target-site-root', targetRoot,
    '--mcp-scope', 'host',
    '--host-site-root', hostRoot,
  ]);
  assert.equal(output.mcp_scope.requested, 'host');
  assert.deepEqual(output.mcp_scope.requested_loci, ['host']);
  assert.deepEqual(output.mcp_scope.effective_loci, ['host']);
  assert.deepEqual(output.mcp_fabric.server_names, ['narada-host-only']);
  assert.equal(output.mcp_fabric.server_names.includes('narada-target-only'), false);
});

test('McpScope all explicitly composes available Host, User Site, and local Site MCP fabrics', () => {
  const targetRoot = mkdtempSync(join(tmpdir(), 'narada-agent-start-target-scope-'));
  const userRoot = mkdtempSync(join(tmpdir(), 'narada-agent-start-user-scope-'));
  const hostRoot = mkdtempSync(join(tmpdir(), 'narada-agent-start-host-scope-'));
  writeMinimalMcpFabric(targetRoot, 'narada-target-only');
  writeMinimalMcpFabric(userRoot, 'narada-user-only', 'user_site');
  writeMinimalMcpServerFile(userRoot, 'narada-user-local-a.json', 'narada-user-local-duplicate', '--version', 'local_site');
  writeMinimalMcpServerFile(userRoot, 'narada-user-local-b.json', 'narada-user-local-duplicate', '--help', 'local_site');
  writeMinimalMcpFabric(hostRoot, 'narada-host-only', 'host');

  const output = runOk([
    '--carrier', 'codex',
    '--runtime', 'codex',
    '--target-site-root', targetRoot,
    '--mcp-scope', 'all',
    '--user-site-root', userRoot,
    '--host-site-root', hostRoot,
  ]);
  assert.equal(output.mcp_scope.requested, 'all');
  assert.deepEqual(output.mcp_scope.requested_loci, ['host', 'user-site', 'local-site']);
  assert.deepEqual(output.mcp_scope.effective_loci, ['host', 'user-site', 'local-site']);
  assert.deepEqual(output.mcp_fabric.server_names, ['narada-host-only', 'narada-target-only', 'narada-user-only']);
  assert.equal(output.mcp_fabric.server_names.includes('narada-user-local-duplicate'), false);
  assert.equal(output.mcp_fabric.files.includes('user-site:narada-user-local-a.json'), false);
  assert.equal(output.mcp_fabric.files.includes('user-site:narada-user-local-b.json'), false);
  assert.ok(output.mcp_fabric.candidate_files.includes('user-site:narada-user-local-a.json'));
  assert.ok(output.mcp_fabric.candidate_files.includes('user-site:narada-user-local-b.json'));
  assert.ok(output.mcp_fabric.skipped.some((entry) => entry.locus === 'user-site' && entry.server_name === 'narada-user-local-duplicate' && entry.reason === 'injection_scope_not_requested'));
  assert.equal(output.mcp_scope.resolution.enforcement, 'explicit_locus_composition');
  assert.equal(output.mcp_registry_validation, 'diagnostic');
});

test('McpScope all rejects duplicate canonical surface projections across loci', () => {
  const targetRoot = mkdtempSync(join(tmpdir(), 'narada-agent-start-target-canonical-'));
  const userRoot = mkdtempSync(join(tmpdir(), 'narada-agent-start-user-canonical-'));
  const hostRoot = mkdtempSync(join(tmpdir(), 'narada-agent-start-host-canonical-'));
  writeCanonicalMcpServerFile(targetRoot, 'target-canonical.json', 'narada-target-canonical', 'shared.surface', 'local_site');
  writeCanonicalMcpServerFile(userRoot, 'user-canonical.json', 'narada-user-canonical', 'shared.surface', 'user_site');
  writeMinimalMcpFabric(hostRoot, 'narada-host-only', 'host');

  const result = run([
    '--carrier', 'codex',
    '--runtime', 'codex',
    '--target-site-root', targetRoot,
    '--mcp-scope', 'all',
    '--user-site-root', userRoot,
    '--host-site-root', hostRoot,
  ]);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /mcp_scope_duplicate_canonical_surface_projection/);
});

test('Codex McpScope none materializes isolated config with no MCP servers', () => {
  const targetRoot = mkdtempSync(join(tmpdir(), 'narada-agent-start-codex-none-'));
  writeMinimalMcpFabric(targetRoot, 'narada-target-only');

  const result = runRealLaunch([
    '--carrier', 'codex',
    '--runtime', 'codex',
    '--target-site-root', targetRoot,
    '--mcp-scope', 'none',
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout);
  const configText = readFileSync(output.mcp_scope.enforcement.config_path, 'utf8');
  assert.equal(output.mcp_scope.enforcement.status, 'materialized');
  assert.equal(output.mcp_scope.enforcement.inherited_codex_home_allowed, false);
  assert.equal(configText.includes('[mcp_servers.'), false);
  assert.equal(configText.includes('McpScope=none'), true);
});

test('agent-start output bundles first-class launcher contracts without launch-time intelligence selection', () => {
  const output = runOk(['--carrier', 'agent-cli', '--runtime', 'narada-agent-runtime-server', '--mcp-scope', 'none']);
  expectLauncherContracts(output);
});

test('db option materializes the requested agent-context db path', () => {
  const dbPath = join(naradaProperRoot, '.ai', 'state', 'option-contract-agent-context.sqlite');
  const output = runOk(['--carrier', 'agent-cli', '--runtime', 'narada-agent-runtime-server', '--db', dbPath]);
  assert.equal(output.required_environment.NARADA_AGENT_CONTEXT_DB, dbPath);
});

test('nars runtime alias materializes the canonical runtime server kind', () => {
  const output = runOk(['--carrier', 'agent-cli', '--runtime', 'nars', '--mcp-scope', 'none']);
  assert.equal(output.operator_surface_kind, 'agent-cli');
  assert.equal(output.runtime_host_kind, 'narada-agent-runtime-server');
  assert.equal(output.runtime_substrate_kind, 'narada-agent-runtime-server');
  assert.equal(output.runtime_resolution.schema, 'narada.operator_surface_runtime_selection.v1');
  assert.equal(output.runtime_resolution.legacy_schema, 'narada.carrier_runtime_selection.v1');
  assert.equal(output.runtime_resolution.launch_operator_surface_kind, 'agent-cli');
  assert.equal(output.nars_launch.carrier_runtime_kind, 'narada-agent-runtime-server');
  assert.equal(output.carrier_session.record.carrier_runtime_kind, 'narada-agent-runtime-server');
});

test('operator-surface option is the canonical surface selector', () => {
  const output = runOk(['--operator-surface', 'agent-cli', '--runtime', 'nars', '--mcp-scope', 'none']);
  assert.equal(output.operator_surface_kind, 'agent-cli');
  assert.equal(output.runtime_host_kind, 'narada-agent-runtime-server');
  assert.equal(output.runtime_resolution.operator_surface_kind, 'agent-cli');
  assert.equal(output.runtime_resolution.carrier_kind, 'agent-cli');
  assert.equal(output.runtime_resolution.operator_surface_source_field, 'operator_surface');
  assert.equal(output.runtime_resolution.carrier_source_field, 'operator_surface');
});

test('operator-surface and legacy carrier options must agree when both are supplied', () => {
  const result = runFailed(['--operator-surface', 'agent-cli', '--carrier', 'codex', '--runtime', 'narada-agent-runtime-server']);
  const refusal = JSON.parse(result.stdout);
  assert.equal(refusal.reason_code, 'operator_surface_carrier_conflict');
  assert.equal(refusal.candidate_operator_surface_kind, 'agent-cli');
  assert.equal(refusal.candidate_carrier_kind, 'codex');
});

test('target site id is carried through dry-run output', () => {
  const output = runOk(['--carrier', 'agent-cli', '--runtime', 'narada-agent-runtime-server', '--target-site-id', 'narada-proper-contract']);
  assert.equal(output.target_site_id, 'narada-proper-contract');
  assert.equal(output.required_environment.NARADA_SITE_ID, 'narada-proper-contract');
  assert.equal(output.nars_launch.site_id, 'narada-proper-contract');
});

test('pc site root option is exposed in dry-run output when supplied', () => {
  const pcRoot = 'C:/ProgramData/Narada/sites/pc/option-contract';
  const output = runOk(['--carrier', 'agent-cli', '--runtime', 'narada-agent-runtime-server', '--pc-site-root', pcRoot]);
  assert.equal(output.pc_site_root, pcRoot);
});

function expectLauncherContracts(output) {
  assert.equal(output.launcher_contracts.schema, 'narada.launcher_contract_bundle.v0');
  assert.equal(output.launcher_contracts.launch_result_artifact.schema, 'narada.launch_result_artifact.v0');
  assert.equal(output.launcher_contracts.operator_surface_attachment.schema, 'narada.operator_surface_attachment.v0');
  assert.equal(output.launcher_contracts.authority_runtime_host_selection.schema, 'narada.authority_runtime_host_selection.v0');
  assert.equal(output.launcher_contracts.runtime_health_posture.schema, 'narada.runtime_health_posture.v0');
  assert.equal(output.launcher_contracts.mcp_fabric_injection_plan.schema, 'narada.mcp_fabric_injection_plan.v0');
  assert.equal(output.launcher_contracts.launch_selection_session.schema, 'narada.launch_selection_session.v0');
  assert.equal(output.launcher_contracts.launch_selection_session.intelligence_selection_authority.launcher_selection, false);
  assert.equal(output.launcher_contracts.operator_terminal_projection_plan.schema, 'narada.operator_terminal_projection_plan.v0');
}

test('agent launcher refuses explicit provider selection', () => {
  const result = runFailed(['--carrier', 'agent-cli', '--runtime', 'narada-agent-runtime-server', '--intelligence-provider', 'codex-subscription']);
  const refusal = JSON.parse(result.stdout);
  assert.equal(refusal.reason_code, 'launcher_intelligence_selection_removed');
  assert.match(refusal.required_next_step, /catalog/);
});

test('NARS launch declares runtime catalog authority and scrubs ambient selection variables', () => {
  const output = runOk(['--carrier', 'agent-cli', '--runtime', 'narada-agent-runtime-server'], {
    NARADA_INTELLIGENCE_PROVIDER: 'codex-subscription',
    NARADA_AI_MODEL: 'decoy-narada-model',
    NARADA_AI_THINKING: 'decoy-thinking',
    CODEX_MODEL: 'decoy-codex-model',
    OPENAI_MODEL: 'decoy-openai-model',
    KIMI_CODE_MODEL: 'decoy-kimi-model',
  });
  assert.equal(output.intelligence_selection_authority.owner, '@narada2/invokable-intelligence-runtime');
  assert.equal(output.intelligence_selection_authority.launcher_selection, false);
  for (const name of ['NARADA_INTELLIGENCE_PROVIDER', 'NARADA_AI_MODEL', 'NARADA_AI_THINKING', 'CODEX_MODEL', 'OPENAI_MODEL', 'KIMI_CODE_MODEL']) {
    assert.equal(output.required_environment[name], undefined);
    assert.equal(output.would_set_environment[name], undefined);
  }
  assert.equal(output.required_environment.KIMI_CODE_API_KEY, undefined);
});

test('NARS launch scrubs provider selection loaded from a target Site env file', () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-agent-start-site-env-'));
  writeMinimalMcpFabric(siteRoot, 'narada-site-env-fixture');
  writeFileSync(join(siteRoot, '.env'), 'NARADA_INTELLIGENCE_PROVIDER=codex-subscription\nCODEX_MODEL=decoy-model\n', 'utf8');
  const output = runOk(['--carrier', 'agent-cli', '--runtime', 'narada-agent-runtime-server', '--target-site-root', siteRoot], { NARADA_INTELLIGENCE_PROVIDER: '' });
  assert.equal(output.target_site_root, siteRoot);
  assert.equal(output.required_environment.NARADA_INTELLIGENCE_PROVIDER, undefined);
  assert.equal(output.required_environment.CODEX_MODEL, undefined);
});

test('launcher does not preselect or preflight a credential', () => {
  const output = runOk(['--carrier', 'agent-cli', '--runtime', 'narada-agent-runtime-server'], {
    KIMI_CODE_API_KEY: '',
  });
  assert.equal(output.intelligence_selection_authority.launcher_selection, false);
  assert.equal(Object.hasOwn(output, 'intelligence_provider_resolution'), false);
});

test('selection scrub preserves credentials as transport only', () => {
  const env = stripLegacyIntelligenceSelectionEnvironment({
    NARADA_INTELLIGENCE_PROVIDER: 'decoy',
    NARADA_AI_MODEL: 'decoy-model',
    OPENAI_API_KEY: 'credential',
  });
  assert.equal(env.NARADA_INTELLIGENCE_PROVIDER, undefined);
  assert.equal(env.NARADA_AI_MODEL, undefined);
  assert.equal(env.OPENAI_API_KEY, 'credential');
});

test('agent-cli exec launches package bin through node, not PowerShell', () => {
  const output = runOk(['--carrier', 'agent-cli', '--runtime', 'narada-agent-runtime-server', '--exec']);
  const sessionId = output.carrier_session.carrier_session_id;
  assert.equal(output.exec_command.startsWith(process.execPath), true);
  assert.equal(output.exec_command.includes('pwsh'), false);
  assert.equal(output.agent_start_execution_mode, 'hidden_detached');
  assert.deepEqual(output.detach_refusal_reasons, []);
  assert.equal(output.detach_decision.selected, true);
  assert.equal(output.detach_decision.hidden_posture, 'agent_runtime_server');
  assert.match(output.hidden_runtime_output_files.stdout_path, /agent-start-processes/);
  assert.match(output.hidden_runtime_output_files.stderr_path, /agent-start-processes/);
  assert.equal(output.launcher_contracts.launch_selection_session.agent_start_execution_mode, 'hidden_detached');
  assert.deepEqual(output.launcher_contracts.launch_selection_session.hidden_runtime_output_files, output.hidden_runtime_output_files);
  assert.equal(output.launcher_contracts.operator_terminal_projection_plan.hide_shell, true);
  assert.deepEqual(output.launcher_contracts.operator_terminal_projection_plan.hidden_runtime_output_files, output.hidden_runtime_output_files);
  assert.equal(output.nars_launch.command, process.execPath);
  assert.equal(output.nars_launch.session_id, sessionId);
  assert.equal(output.nars_launch.runtime_session_id, sessionId);
  assert.equal(output.nars_launch.nars_session_id, sessionId);
  assert.equal(output.nars_launch.runtime_host_kind, 'narada-agent-runtime-server');
  assert.equal(output.nars_launch.carrier_runtime_kind, 'narada-agent-runtime-server');
  assert.equal(output.nars_launch.launch_operator_surface_kind, 'agent-cli');
  assert.equal(output.nars_launch.operator_surface_kind, 'agent-cli');
  assert.equal(output.nars_launch.carrier_relation, 'narada_agent_runtime_server');
  assert.deepEqual(output.nars_launch.runtime_server, {
    package: '@narada2/agent-runtime-server',
    entrypoint: 'narada-agent-runtime-server',
    runtime_kind: 'narada-agent-runtime-server',
  });
  assert.equal(Object.hasOwn(output.nars_launch, 'private_carrier_substrate'), false);
  assert.equal(output.nars_launch.control_transport, 'jsonl_sideband_file');
  assert.equal(output.nars_launch.reads_only_target_site_mcp_fabric, true);
  assert.equal(output.nars_launch.user_site_mcp_injected, false);
  assert.equal(output.operator_surface_kind, 'agent-cli');
  assert.equal(output.runtime_host_kind, 'narada-agent-runtime-server');
  assert.equal(output.carrier_kind, 'agent-cli');
  assert.equal(output.runtime_substrate_kind, 'narada-agent-runtime-server');
  assert.equal(output.runtime_resolution.schema, 'narada.operator_surface_runtime_selection.v1');
  assert.equal(output.runtime_resolution.legacy_schema, 'narada.carrier_runtime_selection.v1');
  assert.equal(output.runtime_resolution.operator_surface_kind, 'agent-cli');
  assert.equal(output.runtime_resolution.launch_operator_surface_kind, 'agent-cli');
  assert.equal(output.runtime_resolution.runtime_host_kind, 'narada-agent-runtime-server');
  assert.equal(output.nars_events.attach_commands.registry_schema, 'narada.nars.client_projection_registry.v1');
  assert.equal(output.nars_events.attach_commands.agent_cli, 'narada-agent-cli --attach <session_started.event_endpoint>');
  assert.equal(output.nars_events.attach_commands.agent_tui, 'agent-tui --attach <session_started.event_endpoint>');
  assert.equal(output.nars_events.attach_commands.agent_web_ui, 'narada-agent-web-ui --event-endpoint <session_started.event_endpoint> --health-endpoint <session_started.health_endpoint>');
  assert.match(output.nars_events.attach_commands.operator_input_protocol, /session\.submit/);
  assert.match(output.nars_events.attach_commands.slash_command_protocol, /session\.command\.execute/);
  assert.equal(output.carrier_session.record.carrier_runtime_kind, 'narada-agent-runtime-server');
  assert.equal(output.carrier_session.session_id, sessionId);
  assert.equal(output.carrier_session.runtime_session_id, sessionId);
  assert.equal(output.carrier_session.nars_session_id, sessionId);
  assert.equal(output.carrier_session.record.runtime_session_id, sessionId);
  assert.equal(output.carrier_session.record.nars_session_id, sessionId);
  assert.equal(output.carrier_session.record.session_id, sessionId);
  assert.equal(output.carrier_session.record.launch_operator_surface_kind, 'agent-cli');
  assert.equal(output.carrier_session.record.operator_surface_kind, 'agent-cli');
  assert.deepEqual(output.runtime_authority_selection, {
    schema: 'narada.runtime_authority_selection.v1',
    requested: 'auto',
    effective: 'write',
    source: 'default',
  });
  assert.equal(output.runtime_args[0].endsWith('agent-runtime-server.mjs'), true);
  assert.deepEqual(output.runtime_args.slice(1), [
    '--identity',
    identity,
    '--session',
    sessionId,
    '--site-root',
    naradaProperRoot,
    '--operator-surface',
    'agent-cli',
    '--authority',
    'write',
  ]);
  assert.equal(output.runtime_args.includes('--control-jsonl'), false);
  assert.equal(output.runtime_args.includes('--session-jsonl'), false);
});

test('agent-web-ui exec launches NARS runtime server as first-class operator surface', () => {
  const output = runOk(['--carrier', 'agent-web-ui', '--runtime', 'nars', '--exec']);
  const sessionId = output.carrier_session.carrier_session_id;
  assert.equal(output.exec_command.startsWith(process.execPath), true);
  assert.equal(output.agent_start_execution_mode, 'hidden_detached');
  assert.deepEqual(output.detach_refusal_reasons, []);
  assert.equal(output.detach_decision.selected, true);
  assert.match(output.hidden_runtime_output_files.stdout_path, /agent-start-processes/);
  assert.equal(output.nars_launch.command, process.execPath);
  assert.equal(output.nars_launch.session_id, sessionId);
  assert.equal(output.nars_launch.runtime_session_id, sessionId);
  assert.equal(output.nars_launch.nars_session_id, sessionId);
  assert.equal(output.nars_launch.runtime_host_kind, 'narada-agent-runtime-server');
  assert.equal(output.nars_launch.carrier_runtime_kind, 'narada-agent-runtime-server');
  assert.equal(output.nars_launch.launch_operator_surface_kind, 'agent-web-ui');
  assert.equal(output.nars_launch.operator_surface_kind, 'agent-web-ui');
  assert.equal(output.operator_surface_kind, 'agent-web-ui');
  assert.equal(output.runtime_host_kind, 'narada-agent-runtime-server');
  assert.equal(output.carrier_kind, 'agent-web-ui');
  assert.equal(output.runtime_substrate_kind, 'narada-agent-runtime-server');
  assert.equal(output.runtime_resolution.schema, 'narada.operator_surface_runtime_selection.v1');
  assert.equal(output.runtime_resolution.legacy_schema, 'narada.carrier_runtime_selection.v1');
  assert.equal(output.runtime_resolution.operator_surface_kind, 'agent-web-ui');
  assert.equal(output.runtime_resolution.launch_operator_surface_kind, 'agent-web-ui');
  assert.equal(output.runtime_resolution.runtime_host_kind, 'narada-agent-runtime-server');
  assert.equal(output.nars_events.attach_commands.agent_web_ui, 'narada-agent-web-ui --event-endpoint <session_started.event_endpoint> --health-endpoint <session_started.health_endpoint>');
  assert.equal(output.carrier_session.record.carrier_runtime_kind, 'narada-agent-runtime-server');
  assert.equal(output.carrier_session.record.launch_operator_surface_kind, 'agent-web-ui');
  assert.equal(output.carrier_session.record.operator_surface_kind, 'agent-web-ui');
  assert.deepEqual(output.runtime_authority_selection, {
    schema: 'narada.runtime_authority_selection.v1',
    requested: 'auto',
    effective: 'write',
    source: 'default',
  });
  assert.equal(output.runtime_args[0].endsWith('agent-runtime-server.mjs'), true);
  assert.deepEqual(output.runtime_args.slice(1), [
    '--identity',
    identity,
    '--session',
    sessionId,
    '--site-root',
    naradaProperRoot,
    '--operator-surface',
    'agent-web-ui',
    '--authority',
    'write',
  ]);
});

test('carrier process spawn defaults suppress accidental Windows console windows', () => {
  assert.deepEqual(carrierSpawnOptions('agent-cli'), { windowsHide: true });
  assert.deepEqual(carrierSpawnOptions('agent-web-ui'), { windowsHide: true });
  assert.deepEqual(carrierSpawnOptions('opencode'), { shell: false, windowsHide: true });
});

test('carrier adapter refuses launch selectors absent from the canonical matrix', () => {
  assert.throws(() => resolveToolFabricAdapter('future-carrier', {
    schema: 'narada.tool_fabric_adapter_kind.v1',
    agentTuiCarrier: 'agent-tui',
  }), /carrier_launch_matrix_row_missing:future-carrier/);
  assert.throws(() => resolveCarrierCommand('future-carrier', {
    agentTuiCarrier: 'agent-tui',
    processPlatform: 'win32',
    processExecPath: process.execPath,
    stableNodeCommand: () => 'node',
    defaultClaudeCodeCommand: 'claude',
  }), /carrier_launch_matrix_row_missing:future-carrier/);
  assert.throws(() => carrierSpawnOptions('future-carrier'), /carrier_launch_matrix_row_missing:future-carrier/);
});

test('carrier adapter projection is defined for every canonical matrix row', () => {
  for (const row of sharedCarrierLaunchMatrix.rows) {
    const projected = resolveToolFabricAdapter(row.launch_selection_kind, {
      schema: 'narada.tool_fabric_adapter_kind.v1',
      agentTuiCarrier: 'agent-tui',
    });
    assert.equal(projected.launch_selection_kind, row.launch_selection_kind);
    assert.equal(projected.operator_surface_kind, row.operator_surface_kind);
    assert.equal(projected.runtime_host_kind, row.runtime_host_kind);
    assert.equal(projected.runtime_substrate_kind, row.runtime_substrate_kind);
    assert.equal(projected.tool_fabric_adapter_kind, row.tool_fabric_adapter_kind);
    assert.equal(projected.tool_fabric_source, row.tool_fabric_source);
    assert.equal(projected.adapter_entrypoint, row.adapter_entrypoint);
    assert.deepEqual(projected.projection_capabilities, row.projection_capabilities);
    assert.equal(projected.expected_tools_scope, row.expected_tools_scope);
    assert.deepEqual(projected.expected_tools, row.expected_tools);
    assert.deepEqual(projected.states, row.states);
    assert.equal(projected.admission_basis, row.admission_basis);
  }
});

test('agent-cli dry-run records event-id propagation residual at runtime-server boundary', () => {
  const output = runOk(['--carrier', 'agent-cli', '--runtime', 'narada-agent-runtime-server', '--exec']);
  const sessionId = output.carrier_session.carrier_session_id;
  assert.equal(output.required_environment.NARADA_AGENT_ID, identity);
  assert.equal(output.required_environment.NARADA_RUNTIME_SESSION_ID, sessionId);
  assert.equal(output.required_environment.NARADA_NARS_SESSION_ID, sessionId);
  assert.equal(output.required_environment.NARADA_CARRIER_SESSION_ID, sessionId);
  assert.equal(output.agent_start_event, undefined);
  assert.equal(output.required_environment.NARADA_AGENT_START_EVENT_ID, undefined);
  assert.equal(output.would_set_environment.NARADA_AGENT_START_EVENT_ID, undefined);
  assert.equal(output.carrier_session.record.agent_start_event_id, null);
  assert.equal(output.nars_launch.control_path.includes(sessionId), true);
  assert.equal(output.nars_launch.session_path.includes(sessionId), true);
});

test('agent-start derives AgentIdentityRef for prefixed registry-style identities', () => {
  const output = runWithIdentityOk('smart-scheduling.resident', ['--carrier', 'agent-cli', '--runtime', 'narada-agent-runtime-server']);
  assert.deepEqual(output.agent_identity_ref, {
    schema: 'narada.agent_identity_ref.v2',
    identity_scope: { kind: 'narada_site', site_id: 'smart-scheduling' },
    local_agent_id: 'resident',
    role: 'resident',
    canonical_agent_id: 'smart-scheduling.resident',
    display: 'smart-scheduling.resident',
    legacy_agent_id: 'smart-scheduling.resident',
  });
  assert.equal(output.required_environment.NARADA_AGENT_ID, 'smart-scheduling.resident');
});

test('agent-start derives AgentIdentityRef for site-local registry identities', () => {
  const output = runWithIdentityOk('resident', ['--carrier', 'agent-cli', '--runtime', 'narada-agent-runtime-server', '--target-site-id', 'sonar']);
  assert.deepEqual(output.agent_identity_ref, {
    schema: 'narada.agent_identity_ref.v2',
    identity_scope: { kind: 'narada_site', site_id: 'sonar' },
    local_agent_id: 'resident',
    role: 'resident',
    canonical_agent_id: 'sonar.resident',
    display: 'sonar.resident',
    legacy_agent_id: 'resident',
  });
  assert.equal(output.required_environment.NARADA_AGENT_ID, 'resident');
  assert.equal(output.required_environment.NARADA_SITE_ID, 'sonar');
});

test('runtime spawn environment carries site-qualified identity binding losslessly', () => {
  const agentIdentityRef = {
    schema: 'narada.agent_identity_ref.v2',
    identity_scope: { kind: 'narada_site', site_id: 'sonar' },
    local_agent_id: 'resident',
    role: 'resident',
    canonical_agent_id: 'sonar.resident',
    display: 'sonar.resident',
    legacy_agent_id: 'resident',
  };
  const env = buildCarrierProcessEnvironment({
    processEnvironment: {
      PATH: 'test-path',
      NARADA_INTELLIGENCE_PROVIDER: 'kimi-code-api',
      NARADA_AI_MODEL: 'kimi-k2.7',
      KIMI_CODE_MODEL: 'kimi-k2.7',
      KIMI_CODE_API_KEY: 'test-key',
    },
    carrierName: 'agent-web-ui',
    identity: 'resident',
    role: 'resident',
    agentStartEventId: 'evt_test',
    carrierSessionId: 'carrier_test',
    targetSiteId: 'sonar',
    agentIdentityRef,
    operatorSurfaceKind: 'agent-web-ui',
    environmentSiteRoot: 'D:/code/narada.sonar',
    workspaceRoot: 'D:/code/narada.sonar',
    dbPath: 'D:/code/narada.sonar/.ai/state/agent-context.sqlite',
    siteConfig: { schema: 'narada.nars.site_config.v1', site_id: 'sonar' },
  });

  assert.equal(env.NARADA_AGENT_ID, 'resident');
  assert.equal(env.NARADA_AGENT_ROLE, 'resident');
  assert.equal(env.NARADA_SITE_ID, 'sonar');
  assert.equal(env.NARADA_OPERATOR_SURFACE_KIND, 'agent-web-ui');
  assert.equal(env.NARADA_SITE_ROOT, 'D:/code/narada.sonar');
  assert.equal(env.NARADA_INTELLIGENCE_PROVIDER, undefined);
  assert.equal(env.NARADA_AI_MODEL, undefined);
  assert.equal(env.KIMI_CODE_MODEL, undefined);
  assert.equal(env.KIMI_CODE_API_KEY, 'test-key');
  assert.deepEqual(JSON.parse(env.NARADA_AGENT_IDENTITY_REF), agentIdentityRef);
});

test('target site MCP fabric remains isolated from user site fabric', () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-agent-start-mcp-isolation-'));
  const userSiteRoot = mkdtempSync(join(tmpdir(), 'narada-agent-start-user-site-'));
  mkdirSync(join(userSiteRoot, '.narada'), { recursive: true });
  writeFileSync(join(userSiteRoot, '.narada', 'intelligence-launch-context.json'), JSON.stringify({
    schema: 'narada.intelligence.launch_context.v1',
    user_site_id: 'site:user',
    host_site_id: 'site:pc',
    principal_id: 'principal:andrey',
  }), 'utf8');
  mkdirSync(join(siteRoot, '.ai'), { recursive: true });
  mkdirSync(join(siteRoot, '.ai', 'mcp'), { recursive: true });
  copyFileSync(join(naradaProperRoot, '.ai', 'task-lifecycle.db'), join(siteRoot, '.ai', 'task-lifecycle.db'));
  writeFileSync(join(siteRoot, '.ai', 'mcp', 'target-only.json'), JSON.stringify({
    mcpServers: {
      'narada-target-only': {
        transport: 'stdio',
        command: 'node',
        args: ['--version'],
        tools: ['agent_context_startup_sequence'],
        target_site_root: '{site_root}',
      },
    },
  }, null, 2), 'utf8');

  const output = runOk([
    '--carrier',
    'agent-cli',
    '--runtime',
    'narada-agent-runtime-server',
    '--target-site-root',
    siteRoot,
    '--target-site-id',
    'target',
    '--mcp-scope',
    'local-site',
    '--exec',
  ], { NARADA_USER_SITE_ROOT: userSiteRoot });
  assert.equal(output.session_site_root, siteRoot);
  assert.equal(output.mcp_fabric.site_root, siteRoot);
  assert.deepEqual(output.mcp_fabric.server_names, ['narada-target-only']);
  assert.equal(output.mcp_fabric.server_names.every((name) => name.startsWith('narada-')), true);
  assert.equal(output.mcp_fabric.server_names.some((name) => name.includes('user')), false);
  assert.equal(output.mcp_fabric.server_names.some((name) => name.startsWith('narada-andrey-')), false);
  assert.equal(output.nars_launch.site_mcp_fabric, join(siteRoot, '.ai', 'mcp'));
  assert.equal(output.nars_launch.reads_only_target_site_mcp_fabric, true);
  assert.equal(output.nars_launch.user_site_mcp_injected, false);
  assert.equal(output.required_environment.NARADA_SITE_ROOT, siteRoot);
  assert.equal(output.runtime_args[output.runtime_args.indexOf('--site-root') + 1], siteRoot);
});

test('NARS runtime selects explicit runtime-affined Site MCP projection', () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-agent-start-nars-projection-'));
  mkdirSync(join(siteRoot, '.ai'), { recursive: true });
  mkdirSync(join(siteRoot, '.ai', 'mcp'), { recursive: true });
  copyFileSync(join(naradaProperRoot, '.ai', 'task-lifecycle.db'), join(siteRoot, '.ai', 'task-lifecycle.db'));
  writeFileSync(join(siteRoot, '.ai', 'mcp', 'runtime-projections.json'), JSON.stringify({
    mcpServers: {
      'narada-neutral': {
        transport: 'stdio',
        command: 'node',
        args: ['--version'],
        target_site_root: '{site_root}',
        injection_scope: 'local_site',
        narada_scope: { injection_scope: 'local_site' },
      },
      'narada-nars-session': {
        transport: 'stdio',
        command: 'node',
        args: ['--version'],
        tools: ['nars_session_guidance'],
        target_site_root: '{site_root}',
        surface_id: 'nars-session',
        injection_scope: 'local_site',
        narada_scope: { injection_scope: 'local_site' },
        surface_projection: {
          surface_id: 'nars-session',
          projection_id: 'local-site-nars-runtime',
          injection_scope: 'local_site',
          runtime_requirements: ['nars'],
          runtime_kind: 'nars',
        },
      },
    },
  }, null, 2), 'utf8');

  const narsOutput = runOk([
    '--operator-surface', 'agent-cli',
    '--runtime', 'nars',
    '--target-site-root', siteRoot,
    '--mcp-scope', 'local-site',
  ]);
  assert.equal(narsOutput.runtime_substrate_kind, 'narada-agent-runtime-server');
  assert.equal(narsOutput.mcp_fabric.runtime_kind, 'nars');
  assert.deepEqual(narsOutput.mcp_fabric.server_names, ['narada-nars-session', 'narada-neutral']);
  assert.equal(narsOutput.mcp_fabric.skipped.some((entry) => entry.reason === 'runtime_kind_not_requested'), false);

  const nonNarsOutput = runOk([
    '--operator-surface', 'codex',
    '--runtime', 'codex',
    '--target-site-root', siteRoot,
    '--mcp-scope', 'local-site',
  ]);
  assert.deepEqual(nonNarsOutput.mcp_fabric.server_names, ['narada-neutral']);
  assert.ok(nonNarsOutput.mcp_fabric.skipped.some((entry) => entry.server_name === 'narada-nars-session' && entry.reason === 'runtime_kind_not_requested'));
});

test('non-canonical target MCP server names are refused before carrier handoff', () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-agent-start-mcp-prefix-gate-'));
  mkdirSync(join(siteRoot, '.ai'), { recursive: true });
  mkdirSync(join(siteRoot, '.ai', 'mcp'), { recursive: true });
  copyFileSync(join(naradaProperRoot, '.ai', 'task-lifecycle.db'), join(siteRoot, '.ai', 'task-lifecycle.db'));
  writeFileSync(join(siteRoot, '.ai', 'mcp', 'target-noncanonical.json'), JSON.stringify({
    mcpServers: {
      'sonar-sop': {
        transport: 'stdio',
        command: 'node',
        args: ['--version'],
      },
    },
  }, null, 2), 'utf8');

  const result = runFailed(['--carrier', 'agent-cli', '--runtime', 'narada-agent-runtime-server', '--target-site-root', siteRoot, '--mcp-scope', 'local-site']);
  const refusal = JSON.parse(result.stdout);
  assert.equal(refusal.reason_code, 'temporary_mcp_server_name_missing_narada_prefix');
  assert.deepEqual(refusal.details.non_canonical_server_names, ['sonar-sop']);
  assert.match(refusal.details.remediation, /Temporary MCP leak identification gate/);
});

test('MCP registry mismatch fails closed before launch', () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-agent-start-registry-gate-'));
  mkdirSync(join(siteRoot, '.ai'), { recursive: true });
  mkdirSync(join(siteRoot, '.ai', 'mcp'), { recursive: true });
  mkdirSync(join(siteRoot, '.narada', 'capabilities'), { recursive: true });
  copyFileSync(join(naradaProperRoot, '.ai', 'task-lifecycle.db'), join(siteRoot, '.ai', 'task-lifecycle.db'));
  writeFileSync(join(siteRoot, '.ai', 'mcp', 'actual-mcp.json'), JSON.stringify({
    mcpServers: {
      'narada-actual': {
        transport: 'stdio',
        command: 'node',
        args: ['--version'],
      },
    },
  }, null, 2), 'utf8');
  writeFileSync(join(siteRoot, '.narada', 'capabilities', 'mcp-surfaces.json'), JSON.stringify({
    schema: 'narada.site.capabilities.mcp_surfaces.v1',
    surfaces: [{
      surface_id: 'expected.surface',
      client_config: { generated_path: '.ai/mcp/expected-mcp.json' },
      tool_contract: {
        read_only_tools: ['agent_context_startup_sequence'],
        mutating_tools: [],
        refused_tools: [],
      },
    }],
  }, null, 2), 'utf8');

  const result = runFailed(['--carrier', 'agent-cli', '--runtime', 'narada-agent-runtime-server', '--target-site-root', siteRoot, '--mcp-scope', 'local-site', '--strict-mcp-registry']);
  const refusal = JSON.parse(result.stdout);
  assert.equal(refusal.reason_code, 'mcp_fabric_registry_mismatch');
  assert.equal(refusal.details.repair_plan.kind, 'registry_generated_file_mismatch');
  assert.equal(refusal.details.missing[0].surface_id, 'expected.surface');
  assert.equal(refusal.details.missing[0].generated_file, 'expected-mcp.json');
  assert.match(refusal.required_next_step, /matches the Site surface registry/);
});

test('all carriers refuse explicit launcher intelligence provider selection', () => {
  const result = runFailed(['--runtime', 'codex', '--intelligence-provider', 'codex-subscription'], {
    NARADA_CODEX_CLI_SCRIPT: launcherPath,
  });
  const refusal = JSON.parse(result.stdout);
  assert.equal(refusal.reason_code, 'launcher_intelligence_selection_removed');
  assert.equal(Object.hasOwn(refusal, 'carrier_kind'), false);
});

test('unsupported runtime fails with runtime contract refusal', () => {
  const result = runFailed(['--runtime', 'not-a-runtime']);
  const refusal = JSON.parse(result.stdout);
  assert.equal(refusal.reason_code, 'runtime_substrate_kind_unsupported');
  assert.equal(refusal.candidate_runtime_substrate_kind, 'not-a-runtime');
});

test('agent-cli is refused as a runtime and must be selected as an operator surface', () => {
  const result = runFailed(['--runtime', 'agent-cli']);
  const refusal = JSON.parse(result.stdout);
  assert.equal(refusal.reason_code, 'runtime_carrier_conflation_refused');
  assert.equal(refusal.candidate_runtime_substrate_kind, 'agent-cli');
  assert.match(refusal.required_next_step, /--operator-surface agent-cli --runtime narada-agent-runtime-server/);
});
test('codex resolves CLI script from PATH and disables native shell by default', () => {
  const fakeBin = mkdtempSync(join(tmpdir(), 'narada-codex-path-'));
  const fakeCodexScript = join(fakeBin, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  mkdirSync(dirname(fakeCodexScript), { recursive: true });
  writeFileSync(fakeCodexScript, '#!/usr/bin/env node\n', 'utf8');

  const output = runOk(['--runtime', 'codex'], { NARADA_CODEX_CLI_SCRIPT: '', PATH: fakeBin });
  assert.deepEqual(output.native_shell_exception.status, 'disabled');
  assert.equal(output.startup_command_name, 'agent_context_startup_sequence');
  assert.deepEqual(output.startup_command, {
    name: 'agent_context_startup_sequence',
    arguments: {},
    display: 'agent_context_startup_sequence({})',
  });
  assert.equal(output.tool_fabric_adapter.expected_tools.includes('agent_context_startup_sequence'), true);
  assert.equal(output.tool_fabric_adapter.expected_tools.includes('startup_sequence'), false);
  assert.equal(output.required_environment.NARADA_AGENT_ID, identity);
  assert.equal(output.required_environment.NARADA_AGENT_START_EVENT_ID, output.agent_start_event);
  assert.equal(output.would_set_environment.NARADA_AGENT_ID, identity);
  assert.equal(output.would_set_environment.NARADA_AGENT_START_EVENT_ID, output.agent_start_event);
  assert.equal(output.runtime_args.includes('shell_tool'), true);
  const codexArgOffset = process.platform === 'win32' ? 1 : 0;
  if (process.platform === 'win32') assert.equal(output.runtime_args[0], fakeCodexScript);
  assert.deepEqual(output.runtime_args.slice(codexArgOffset, codexArgOffset + 2), ['--ask-for-approval', 'never']);
  assert.equal(output.runtime_args.includes('--disable'), true);
  assert.deepEqual(output.runtime_args.slice(-4), ['--disable', 'apps', '--disable', 'shell_tool']);

  const explicitOutput = runOk(['--runtime', 'codex'], { NARADA_CODEX_CLI_SCRIPT: launcherPath });
  if (process.platform === 'win32') assert.equal(explicitOutput.runtime_args[0], launcherPath);
});
test('enable native shell removes codex shell disable argument', () => {
  const output = runOk(['--runtime', 'codex', '--enable-native-shell'], { NARADA_CODEX_CLI_SCRIPT: launcherPath });
  assert.equal(output.native_shell_exception.status, 'enabled_by_break_glass_flag');
  assert.equal(output.runtime_args.includes('shell_tool'), false);
  assert.equal(output.runtime_args.includes('apps'), true);
});

test('agent-tui delegates intelligence selection and MCP ownership to the NARS runtime server', () => {
  const output = runOk(['--carrier', 'agent-tui', '--runtime', 'narada-agent-runtime-server'], agentTuiEnv());
  const env = output.required_environment;
  assert.equal(Object.hasOwn(env, 'NARADA_AGENT_TUI_ENABLE_MCP_FABRIC'), false);
  assert.equal(Object.hasOwn(env, 'NARADA_AGENT_TUI_MCP_CONFIG'), false);
  assert.equal(env.NARADA_INTELLIGENCE_PROVIDER, undefined);
  assert.equal(env.KIMI_CODE_API_BASE_URL, undefined);
  assert.equal(env.KIMI_CODE_MODEL, undefined);
  assert.equal(Object.hasOwn(env, 'KIMI_CODE_API_KEY'), false);
  assert.equal(output.intelligence_selection_authority.launcher_selection, false);
  assert.equal(output.tool_fabric_adapter.expected_tools.includes('agent_context_startup_sequence'), true);
  assert.equal(output.tool_fabric_adapter.expected_tools.includes('mcp_output_show'), true);
  assert.equal(output.tool_fabric_adapter.expected_tools.includes('task_lifecycle_next'), true);
  assert.equal(output.runtime_args.includes('--operator-surface'), true);
  assert.equal(output.runtime_args.includes('agent-tui'), true);
  assert.equal(output.runtime_args.includes('--interactive-loop'), false);
  assert.equal(output.runtime_args.includes('--control-jsonl'), false);
  assert.equal(output.runtime_args.includes('--session-jsonl'), false);
});

test('starting carrier input is runtime-neutral for agent-cli', () => {
  const output = runOk(['--carrier', 'agent-cli', '--runtime', 'narada-agent-runtime-server', '--starting-carrier-input', 'Operation: test startup input']);
  assert.equal(output.starting_carrier_input.status, 'configured');
  assert.equal(output.starting_carrier_input.source, 'starting_carrier_input');
  assert.match(output.starting_carrier_input.content_preview, /Operation: test startup input/);
});

test('starting carrier input file is runtime-neutral for agent-tui', () => {
  const directivePath = join(mkdtempSync(join(tmpdir(), 'narada-agent-start-input-')), 'directive.md');
  writeFileSync(directivePath, 'Operation: file startup input', 'utf8');
  const output = runOk(['--carrier', 'agent-tui', '--runtime', 'narada-agent-runtime-server', '--starting-carrier-input-file', directivePath], agentTuiEnv());
  assert.equal(output.starting_carrier_input.status, 'configured');
  assert.equal(output.starting_carrier_input.source, 'starting_carrier_input_file');
  assert.equal(output.starting_carrier_input.file, directivePath);
  assert.match(output.starting_carrier_input.content_preview, /Operation: file startup input/);
});

test('starting carrier input sources are mutually exclusive', () => {
  const result = runFailed([
    '--carrier',
    'agent-cli',
    '--runtime',
    'narada-agent-runtime-server',
    '--starting-carrier-input',
    'inline directive',
    '--starting-carrier-input-file',
    join(naradaProperRoot, 'README.md'),
  ]);
  assert.match(result.stderr, /starting_carrier_input_source_ambiguous/);
});

test('starting carrier input file must exist', () => {
  const result = runFailed([
    '--carrier',
    'agent-cli',
    '--runtime',
    'narada-agent-runtime-server',
    '--starting-carrier-input-file',
    join(naradaProperRoot, 'missing-starting-carrier-input.txt'),
  ]);
  assert.match(result.stderr, /starting_carrier_input_file_missing/);
});





test('site-tools-root option is visible in dry-run output', () => {
  const siteToolsRoot = join(naradaProperRoot, 'tools');
  const output = runOk(['--carrier', 'agent-cli', '--runtime', 'narada-agent-runtime-server', '--site-tools-root', siteToolsRoot]);
  assert.equal(output.site_tools_root, siteToolsRoot);
});

test('agent-tui selects the NARS runtime server and exposes attach discovery', () => {
  const output = runOk(['--carrier', 'agent-tui', '--runtime', 'narada-agent-runtime-server'], agentTuiEnv());
  assert.equal(output.runtime_args.includes('--interactive-loop'), false);
  assert.equal(output.runtime_args.includes('--control-jsonl'), false);
  assert.equal(output.tool_fabric_adapter_kind, 'narada-agent-runtime-server-mcp-client');
  assert.equal(output.nars_events.attach_commands.agent_tui, 'agent-tui --attach <session_started.event_endpoint>');
});

test('NARS process projection carries launch context and rejects inherited context', () => {
  const intelligenceEnvironment = {
    NARADA_INTELLIGENCE_REGISTRY_DB: 'C:/Users/Andrey/Narada/.ai/intelligence-registry.db',
    NARADA_INTELLIGENCE_TARGET_SITE: 'site:sonar',
    NARADA_INTELLIGENCE_USER_SITE: 'site:andrey-user',
    NARADA_INTELLIGENCE_HOST_SITE: 'site:andrey-pc',
    NARADA_INTELLIGENCE_PRINCIPAL_ID: 'principal:andrey',
  };
  const env = buildCarrierProcessEnvironment({
    processEnvironment: {
      NARADA_INTELLIGENCE_TARGET_SITE: 'site:wrong',
      NARADA_INTELLIGENCE_PRINCIPAL_ID: 'principal:wrong',
      NARADA_INTELLIGENCE_PROVIDER: 'kimi-code-api',
    },
    carrierName: 'agent-cli',
    identity: 'resident',
    role: 'resident',
    agentStartEventId: 'evt_context',
    carrierSessionId: 'carrier_context',
    targetSiteId: 'sonar',
    operatorSurfaceKind: 'agent-cli',
    environmentSiteRoot: 'D:/code/narada.sonar',
    workspaceRoot: 'D:/code/narada.sonar',
    dbPath: 'D:/code/narada.sonar/.ai/state/agent-context.sqlite',
    siteConfig: { schema: 'narada.nars.site_config.v1', site_id: 'sonar' },
    intelligenceEnvironment,
  });

  const scrubbed = stripInheritedIntelligenceLaunchContextEnvironment({
    ...env,
    NARADA_INTELLIGENCE_TARGET_SITE: 'site:wrong',
  });
  assert.equal(scrubbed.NARADA_INTELLIGENCE_TARGET_SITE, undefined);
  assert.deepEqual(
    Object.fromEntries(Object.entries(env).filter(([key]) => key.startsWith('NARADA_INTELLIGENCE_'))),
    intelligenceEnvironment,
  );
  assert.equal(env.NARADA_INTELLIGENCE_PROVIDER, undefined);
});

test('User Site launch context resolves canonical loci from its non-secret document', () => {
  const userSiteRoot = mkdtempSync(join(tmpdir(), 'narada-intelligence-launch-context-'));
  mkdirSync(join(userSiteRoot, '.narada'), { recursive: true });
  writeFileSync(join(userSiteRoot, '.narada', 'intelligence-launch-context.json'), JSON.stringify({
    schema: 'narada.intelligence.launch_context.v1',
    user_site_id: 'site:user',
    host_site_id: 'site:pc',
    principal_id: 'principal:andrey',
    principal_binding: {
      schema: 'narada.intelligence.principal_binding.v1',
      actor: { principal_id: 'principal:andrey', auth_type: 'user-site-session' },
      memberships: [{
        registry: 'site-roster',
        site_id: 'site:narada',
        role: 'resident',
        evidence_ref: 'evidence:option-contract-membership',
      }],
      evidence_refs: ['evidence:option-contract-membership'],
    },
  }), 'utf8');
  const context = loadIntelligenceLaunchContext({
    targetSiteId: 'narada',
    sessionSiteRoot: userSiteRoot,
    userSiteRoot,
    registryDbPath: join(userSiteRoot, '.ai', 'intelligence-registry.db'),
    processEnv: {},
  });

  assert.equal(context.status, 'ready');
  assert.equal(context.target_site, 'site:narada');
  assert.equal(context.user_site, 'site:user');
  assert.equal(context.host_site, 'site:pc');
  assert.equal(context.principal_id, 'principal:andrey');
  assert.equal(context.principal_binding.actor.principal_id, 'principal:andrey');
  assert.equal(context.principal_binding.memberships[0].role, 'resident');
  assert.equal(JSON.parse(context.environment.NARADA_INTELLIGENCE_PRINCIPAL_BINDING).schema, 'narada.intelligence.principal_binding.v1');
  assert.equal(context.environment.NARADA_INTELLIGENCE_TARGET_SITE, 'site:narada');
});


test('wait yolo and launch-source options are visible in dry-run output', () => {
  const output = runOk(['--carrier', 'agent-cli', '--runtime', 'narada-agent-runtime-server', '--wait', '--yolo', '--launch-source', 'option-contract']);
  assert.equal(output.wait, true);
  assert.equal(output.yolo, true);
  assert.equal(output.launch_source, 'option-contract');
});

test('wait and explicit visible runtime terminal refuse hidden-detached posture', () => {
  const output = runOk(['--carrier', 'agent-cli', '--runtime', 'narada-agent-runtime-server', '--exec', '--wait', '--visible-runtime-terminal']);
  assert.equal(output.visible_runtime_terminal, true);
  assert.equal(output.agent_start_execution_mode, 'visible_inherited');
  assert.deepEqual(output.detach_refusal_reasons, [
    'wait_requested',
    'visible_runtime_terminal_requested',
  ]);
  assert.equal(output.hidden_runtime_output_files, null);
  assert.equal(output.detach_decision.selected, false);
  assert.equal(output.launcher_contracts.launch_selection_session.agent_start_execution_mode, 'visible_inherited');
  assert.equal(output.launcher_contracts.operator_terminal_projection_plan.hide_shell, false);
});

test('show-admission returns an existing codex admission record', () => {
  const admitted = runOk(['--runtime', 'codex', '--admit-session'], { NARADA_CODEX_CLI_SCRIPT: launcherPath });
  const result = run(['--runtime', 'codex', '--show-admission', admitted.admission_id], { NARADA_CODEX_CLI_SCRIPT: launcherPath });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const shown = JSON.parse(result.stdout);
  assert.equal(shown.admission_id, admitted.admission_id);
});

test('admission options expose admission result without launching', () => {
  const output = runOk(['--runtime', 'codex', '--admit-session'], { NARADA_CODEX_CLI_SCRIPT: launcherPath });
  assert.equal(typeof output.admission_id, 'string');
  assert.match(output.admission_id, /^codexadm_/);
});

test('direct codex carrier exec records AiProcessInvocation launch and exit evidence', () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-direct-codex-ai-invocation-'));
  writeMinimalMcpFabric(siteRoot, 'narada-test-agent-context');
  const fakeCodexScript = join(siteRoot, 'fake-codex.js');
  writeFileSync(fakeCodexScript, 'process.exit(0);\n', 'utf8');

  const result = runHiddenPostureCommandSync(process.execPath, [
    '--import',
    tsxLoaderPath,
    launcherPath,
    identity,
    '--site-root',
    siteRoot,
    '--target-site-root',
    siteRoot,
    '--runtime',
    'codex',
    '--mcp-scope',
    'local-site',
    '--exec',
    '--json',
  ], {
    cwd: siteRoot,
    encoding: 'utf8',
    env: { ...process.env, ...baseTestEnv, NARADA_CODEX_CLI_SCRIPT: fakeCodexScript },
    posture: 'test_child',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const root = join(siteRoot, '.ai', 'runtime', 'ai-process-invocation');
  const entries = readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'));
  const artifacts = entries.map((entry) => JSON.parse(readFileSync(join(entry.parentPath, entry.name), 'utf8')));
  assert.equal(artifacts.some((artifact) => artifact.event === 'launch' && artifact.projection === 'direct-carrier'), true);
  assert.equal(artifacts.some((artifact) => artifact.event === 'exit' && artifact.projection === 'direct-carrier'), true);
});

test('opencode runtime is admitted by the contract', () => {
  assert.equal(sharedRuntimeContract.admitted_runtime_substrate_kinds.includes('opencode'), true);
});

test('opencode dry-run records prompt-only carrier posture', () => {
  const output = runOk(['--runtime', 'opencode']);
  assert.equal(output.runtime_substrate_kind, 'opencode');
  assert.equal(output.tool_fabric_adapter_kind, 'ambient-carrier-tools');
  assert.equal(output.tool_fabric_adapter.tool_fabric_adapter_kind, 'ambient-carrier-tools');
  assert.equal(output.tool_fabric_adapter.runtime_substrate_kind, 'opencode');
  assert.equal(output.carrier_implementation_kind, 'opencode');
  assert.deepEqual(output.tool_fabric_adapter.expected_tools, []);
  assert.equal(output.tool_fabric_adapter.expected_tools_scope, 'none');
  assert.equal(output.tool_fabric_adapter.adapter_entrypoint, null);
  assert.equal(output.context_isolation.status, 'isolated');
  assert.equal(output.context_isolation.runtime, 'opencode');
  assert.equal(output.runtime_args.length, 2);
  assert.equal(output.runtime_args[0], '--prompt');
  assert.ok(output.runtime_args[1].includes('Use agent_context_startup_sequence first'));
  assert.ok(output.runtime_args[1].includes('does not attach or verify Narada MCP servers'));
  assert.deepEqual(output.mcp_fabric.server_names, []);
  assert.equal(output.mcp_scope.resolution.enforcement, 'carrier_without_narada_mcp_adapter');
  assert.equal(output.mcp_scope.enforcement.status, 'enforced_by_carrier_adapter');
  assert.equal(output.mcp_tool_approval, null);
});

test('opencode sets NARADA_OPENCODE_COMMAND in required environment', () => {
  const output = runOk(['--runtime', 'opencode']);
  assert.equal(output.required_environment.NARADA_OPENCODE_COMMAND, process.env.NARADA_OPENCODE_COMMAND ?? 'opencode');
});

test('opencode sets NARADA_OPENCODE_COMMAND in would_set_environment', () => {
  const output = runOk(['--runtime', 'opencode']);
  assert.equal(output.would_set_environment.NARADA_OPENCODE_COMMAND, process.env.NARADA_OPENCODE_COMMAND ?? 'opencode');
});
