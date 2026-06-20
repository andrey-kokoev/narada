import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');
const naradaProperRoot = resolve(packageRoot, '..', '..');
const launcherPath = join(packageRoot, 'src', 'narada-agent-start.ts');
const tsxLoaderPath = pathToFileURL(require.resolve('tsx')).href;
const identity = 'narada.architect';
const sharedRuntimeContract = JSON.parse(readFileSync(resolve(naradaProperRoot, 'packages', 'carrier-runtime-contract', 'contracts', 'runtime-substrate-kinds.json'), 'utf8'));
const sharedProviderContract = JSON.parse(readFileSync(resolve(naradaProperRoot, 'packages', 'carrier-provider-contract', 'contracts', 'provider-registry.json'), 'utf8'));
const sharedProviderAdapterContract = JSON.parse(readFileSync(resolve(naradaProperRoot, 'packages', 'carrier-provider-contract', 'contracts', 'provider-adapters.json'), 'utf8'));
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
  NARADA_PROVIDER_SECRET_STORE: 'disabled',
  NARADA_CODEX_SUBSCRIPTION_PREFLIGHT: 'disabled',
  KIMI_CODE_API_KEY: 'test-key',
};

function run(extraArgs = [], extraEnv = {}) {
  return spawnSync(process.execPath, [...baseArgs, ...extraArgs], {
    cwd: naradaProperRoot,
    encoding: 'utf8',
    env: { ...process.env, ...baseTestEnv, ...extraEnv },
  });
}

function runOk(extraArgs = [], extraEnv = {}) {
  const result = run(extraArgs, extraEnv);
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
    KIMI_CODE_MODEL: 'kimi-k2.6',
    KIMI_CODE_API_KEY: 'test-key',
  };
}

test('launcher option contract consumes shared carrier runtime and provider contracts', () => {
  assert.equal(sharedRuntimeContract.schema, 'narada.runtime_substrate_kind.v1');
  assert.equal(sharedRuntimeContract.admitted_runtime_substrate_kinds.includes('codex'), true);
  assert.equal(sharedRuntimeContract.admitted_runtime_substrate_kinds.includes('agent-cli'), true);
  assert.equal(sharedRuntimeContract.admitted_runtime_substrate_kinds.includes('agent-tui'), true);
  assert.equal(sharedRuntimeContract.codex_context_isolation.forbidden_resume_modes.includes('codex resume --last'), true);
  assert.equal(sharedProviderContract.providers['codex-subscription'].adapter_kind, 'codex-mcp-server');
  assert.equal(sharedProviderContract.providers['codex-subscription'].support_state, 'verified_supported');
  assert.deepEqual(sharedProviderContract.credential_requirement_kinds, ['none', 'api_key_secret', 'local_codex_subscription']);
  assert.equal(sharedProviderContract.default_provider, 'kimi-code-api');
  assert.equal(sharedProviderContract.providers['kimi-api'].credential_requirement.kind, 'api_key_secret');
  assert.equal(sharedProviderContract.providers['codex-subscription'].credential_requirement.kind, 'local_codex_subscription');
  assert.equal(sharedProviderAdapterContract.production_provider_adapter_kind, 'codex_subscription_adapter');
});

test('db option materializes the requested agent-context db path', () => {
  const dbPath = join(naradaProperRoot, '.ai', 'state', 'option-contract-agent-context.sqlite');
  const output = runOk(['--runtime', 'agent-cli', '--db', dbPath]);
  assert.equal(output.required_environment.NARADA_AGENT_CONTEXT_DB, dbPath);
});

test('target site id is carried through dry-run output', () => {
  const output = runOk(['--runtime', 'agent-cli', '--target-site-id', 'narada-proper-contract']);
  assert.equal(output.target_site_id, 'narada-proper-contract');
});

test('pc site root option is exposed in dry-run output when supplied', () => {
  const pcRoot = 'C:/ProgramData/Narada/sites/pc/option-contract';
  const output = runOk(['--runtime', 'agent-cli', '--pc-site-root', pcRoot]);
  assert.equal(output.pc_site_root, pcRoot);
});

test('agent-cli resolves provider credential from environment fallback and redacts output', () => {
  const output = runOk(['--runtime', 'agent-cli', '--intelligence-provider', 'kimi-api'], { KIMI_API_KEY: 'super-secret-test-key' });
  const env = output.required_environment;
  assert.equal(output.intelligence_provider_resolution.source_field, 'cli_argument');
  assert.equal(output.intelligence_provider_resolution.credential_present, true);
  assert.equal(output.intelligence_provider_resolution.credential_source, 'environment');
  assert.equal(output.intelligence_provider_resolution.credential_requirement_kind, 'api_key_secret');
  assert.equal(output.intelligence_provider_resolution.credential_requirement.kind, 'api_key_secret');
  assert.equal(output.intelligence_provider_resolution.credential_secret_ref, 'narada/provider/kimi-api/api-key');
  assert.equal(output.intelligence_provider_resolution.credential.source_env, 'KIMI_API_KEY');
  assert.equal(env.KIMI_API_KEY, '<set>');
  assert.doesNotMatch(JSON.stringify(output), /super-secret-test-key/);
});

test('agent-cli fails launcher preflight when API provider credential is missing', () => {
  const result = runFailed(['--runtime', 'agent-cli'], {
    NARADA_PROVIDER_SECRET_STORE: 'disabled',
    KIMI_CODE_API_KEY: '',
  });
  const refusal = JSON.parse(result.stdout);
  assert.equal(refusal.reason_code, 'intelligence_provider_credential_missing');
  assert.equal(refusal.intelligence_provider, 'kimi-code-api');
  assert.equal(refusal.credential_requirement_kind, 'api_key_secret');
  assert.equal(refusal.credential_requirement.kind, 'api_key_secret');
  assert.equal(refusal.credential_secret_ref, 'narada/provider/kimi-code-api/api-key');
  assert.deepEqual(refusal.credential_env_names, ['KIMI_CODE_API_KEY']);
});

test('agent-cli accepts explicit intelligence provider and materializes provider env', () => {
  const output = runOk(['--runtime', 'agent-cli', '--intelligence-provider', 'codex-subscription']);
  assert.equal(output.intelligence_provider_resolution.support_state, 'verified_supported');
  assert.equal(output.intelligence_provider_resolution.credential_source, 'skipped_dry_run');
  assert.equal(output.intelligence_provider_resolution.credential_present, true);
  assert.equal(output.intelligence_provider_resolution.credential.preflight.status, 'skipped_dry_run');
  assert.equal(output.intelligence_provider_resolution.credential_requirement_kind, 'local_codex_subscription');
  assert.equal(output.intelligence_provider_resolution.credential_requirement.kind, 'local_codex_subscription');
  assert.equal(output.intelligence_provider_resolution.credential_secret_ref, null);
  assert.deepEqual(output.intelligence_provider_resolution.credential_env_names, []);
  assert.equal(output.required_environment.NARADA_INTELLIGENCE_PROVIDER, 'codex-subscription');
  assert.equal(output.required_environment.CODEX_MODEL, 'gpt-5.5');
});

test('agent-cli can resolve intelligence provider from target site env file', () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-agent-start-site-env-'));
  mkdirSync(join(siteRoot, '.ai'), { recursive: true });
  mkdirSync(join(siteRoot, '.ai', 'mcp'), { recursive: true });
  copyFileSync(join(naradaProperRoot, '.ai', 'task-lifecycle.db'), join(siteRoot, '.ai', 'task-lifecycle.db'));
  writeFileSync(join(siteRoot, '.ai', 'mcp', 'config.json'), JSON.stringify({
    mcpServers: {
      'narada-site-env-fixture': {
        transport: 'stdio',
        command: 'node',
        args: ['--version'],
        tools: ['agent_context_startup_sequence'],
      },
    },
  }, null, 2), 'utf8');
  writeFileSync(join(siteRoot, '.env'), 'NARADA_INTELLIGENCE_PROVIDER=codex-subscription\n', 'utf8');
  const output = runOk(['--runtime', 'agent-cli', '--target-site-root', siteRoot], { NARADA_INTELLIGENCE_PROVIDER: '' });
  assert.equal(output.target_site_root, siteRoot);
  assert.equal(output.intelligence_provider_resolution.source_field, 'site_env');
  assert.equal(output.intelligence_provider_resolution.source_path, join(siteRoot, '.env'));
  assert.equal(output.intelligence_provider_resolution.support_state, 'verified_supported');
  assert.equal(output.required_environment.NARADA_INTELLIGENCE_PROVIDER, 'codex-subscription');
});

test('agent-cli can resolve intelligence provider from ambient environment', () => {
  const output = runOk(['--runtime', 'agent-cli'], {
    NARADA_INTELLIGENCE_PROVIDER: 'codex-subscription',
    KIMI_CODE_API_KEY: '',
  });
  assert.equal(output.intelligence_provider_resolution.source_field, 'environment');
  assert.equal(output.required_environment.NARADA_INTELLIGENCE_PROVIDER, 'codex-subscription');
});

test('agent-cli reports launcher env provider source when supplied by workspace launcher', () => {
  const output = runOk(['--runtime', 'agent-cli'], {
    NARADA_INTELLIGENCE_PROVIDER: 'codex-subscription',
    NARADA_INTELLIGENCE_PROVIDER_SOURCE_FIELD: 'launcher_env',
    NARADA_INTELLIGENCE_PROVIDER_SOURCE_PATH: 'C:/Users/Andrey/Narada/.env',
    KIMI_CODE_API_KEY: '',
  });
  assert.equal(output.intelligence_provider_resolution.source_field, 'launcher_env');
  assert.equal(output.intelligence_provider_resolution.source_path, 'C:/Users/Andrey/Narada/.env');
  assert.equal(output.required_environment.NARADA_INTELLIGENCE_PROVIDER, 'codex-subscription');
});

test('agent-cli refuses codex-subscription when Codex local auth preflight fails', () => {
  const fakeBin = mkdtempSync(join(tmpdir(), 'narada-codex-preflight-'));
  const fakeCodex = join(fakeBin, process.platform === 'win32' ? 'codex.cmd' : 'codex');
  const script = process.platform === 'win32'
    ? '@echo off\r\necho HTTP error: 401 Unauthorized 1>&2\r\nexit /b 1\r\n'
    : '#!/bin/sh\necho "HTTP error: 401 Unauthorized" >&2\nexit 1\n';
  writeFileSync(fakeCodex, script, 'utf8');

  const result = run(['--runtime', 'agent-cli', '--intelligence-provider', 'codex-subscription'], {
    NARADA_CODEX_SUBSCRIPTION_PREFLIGHT: 'force',
    NARADA_CODEX_COMMAND: fakeCodex,
  });
  assert.notEqual(result.status, 0, 'launcher should fail');
  const refusal = JSON.parse(result.stdout);
  assert.equal(refusal.reason_code, 'local_codex_subscription_auth_unavailable');
  assert.equal(refusal.intelligence_provider, 'codex-subscription');
  assert.equal(refusal.preflight.ok, false);
  assert.match(refusal.preflight.status, /^failed/);
});

test('agent-cli default provider falls back to registry default', () => {
  const output = runOk(['--runtime', 'agent-cli'], {
    NARADA_INTELLIGENCE_PROVIDER: '',
    KIMI_CODE_API_KEY: 'kimi-code-test-key',
  });
  assert.equal(output.intelligence_provider_resolution.source_field, 'default_for_agent_cli');
  assert.equal(output.required_environment.NARADA_INTELLIGENCE_PROVIDER, 'kimi-code-api');
  assert.equal(output.required_environment.KIMI_CODE_API_KEY, '<set>');
});

test('agent-cli exec launches package bin through node, not PowerShell', () => {
  const output = runOk(['--runtime', 'agent-cli', '--exec']);
  assert.equal(output.exec_command.startsWith(process.execPath), true);
  assert.equal(output.exec_command.includes('pwsh'), false);
  assert.equal(output.runtime_args[0].endsWith('narada-agent-cli.mjs'), true);
});

test('non-agent-cli runtime refuses explicit intelligence provider selection', () => {
  const result = runFailed(['--runtime', 'codex', '--intelligence-provider', 'codex-subscription'], {
    NARADA_CODEX_CLI_SCRIPT: launcherPath,
  });
  const refusal = JSON.parse(result.stdout);
  assert.equal(refusal.reason_code, 'intelligence_provider_runtime_unsupported');
  assert.equal(refusal.runtime_substrate_kind, 'codex');
});

test('unsupported runtime fails with runtime contract refusal', () => {
  const result = runFailed(['--runtime', 'not-a-runtime']);
  const refusal = JSON.parse(result.stdout);
  assert.equal(refusal.reason_code, 'runtime_substrate_kind_unsupported');
  assert.equal(refusal.candidate_runtime_substrate_kind, 'not-a-runtime');
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
  if (process.platform === 'win32') assert.equal(output.runtime_args[0], fakeCodexScript);

  const explicitOutput = runOk(['--runtime', 'codex'], { NARADA_CODEX_CLI_SCRIPT: launcherPath });
  if (process.platform === 'win32') assert.equal(explicitOutput.runtime_args[0], launcherPath);
});
test('enable native shell removes codex shell disable argument', () => {
  const output = runOk(['--runtime', 'codex', '--enable-native-shell'], { NARADA_CODEX_CLI_SCRIPT: launcherPath });
  assert.equal(output.native_shell_exception.status, 'enabled_by_break_glass_flag');
  assert.equal(output.runtime_args.includes('shell_tool'), false);
  assert.equal(output.runtime_args.includes('apps'), true);
});

test('agent-tui materializes provider env without requiring ambient provider env', () => {
  const output = runOk(['--runtime', 'agent-tui', '--agent-tui-max-steps', '42']);
  const env = output.required_environment;
  assert.equal(env.NARADA_AGENT_TUI_ENABLE_MCP_FABRIC, 'yes');
  assert.equal(env.NARADA_SITE_MCP_FABRIC, join(naradaProperRoot, '.ai', 'mcp'));
  assert.equal(env.NARADA_AGENT_TUI_MCP_CONFIG, join(env.NARADA_SITE_MCP_FABRIC, 'agent-tui', env.NARADA_CARRIER_SESSION_ID, 'mcp-config.json'));
  assert.equal(env.NARADA_AGENT_TUI_MCP_CONFIG.startsWith(`${env.NARADA_SITE_MCP_FABRIC}${sep}`), true);
  assert.equal(env.NARADA_AGENT_TUI_MCP_CONFIG.includes(`${sep}agent-tui${sep}carrier_`), true);
  assert.equal(env.NARADA_INTELLIGENCE_PROVIDER, 'kimi-code-api');
  assert.equal(env.KIMI_CODE_API_BASE_URL, 'https://api.kimi.com/coding/');
  assert.equal(env.KIMI_CODE_MODEL, 'kimi-k2.6');
  assert.equal(Object.hasOwn(env, 'KIMI_CODE_API_KEY'), true);
  assert.equal(output.tool_fabric_adapter.expected_tools.includes('agent_context_startup_sequence'), true);
  assert.equal(output.tool_fabric_adapter.expected_tools.includes('mcp_output_show'), true);
  assert.equal(output.tool_fabric_adapter.expected_tools.includes('task_lifecycle_next'), true);
  assert.equal(output.runtime_args.includes('--max-steps'), true);
  assert.equal(output.runtime_args.includes('42'), true);
  const manifestPath = output.runtime_args[output.runtime_args.indexOf('--manifest-path') + 1];
  assert.equal(manifestPath.endsWith(join('agent-tui', 'Cargo.toml')), true);
  assert.notEqual(manifestPath, join(naradaProperRoot, 'packages', 'agent-tui', 'Cargo.toml'));
  assert.equal(existsSync(env.NARADA_AGENT_TUI_MCP_CONFIG), false, 'dry-run must not write generated agent-tui config');
});

test('agent-tui starting directive sources are mutually exclusive', () => {
  const result = runFailed([
    '--runtime',
    'agent-tui',
    '--agent-tui-starting-directive',
    'inline directive',
    '--agent-tui-starting-directive-file',
    join(naradaProperRoot, 'README.md'),
  ], agentTuiEnv());
  assert.match(result.stderr, /agent_tui_starting_directive_source_ambiguous/);
});

test('agent-tui starting directive file must exist', () => {
  const result = runFailed([
    '--runtime',
    'agent-tui',
    '--agent-tui-starting-directive-file',
    join(naradaProperRoot, 'missing-agent-tui-directive.txt'),
  ], agentTuiEnv());
  assert.match(result.stderr, /agent_tui_starting_directive_file_missing/);
});

test('starting carrier input is runtime-neutral for agent-cli', () => {
  const output = runOk(['--runtime', 'agent-cli', '--starting-carrier-input', 'Operation: test startup input']);
  assert.equal(output.starting_carrier_input.status, 'configured');
  assert.equal(output.starting_carrier_input.source, 'starting_carrier_input');
  assert.match(output.starting_carrier_input.content_preview, /Operation: test startup input/);
});

test('starting carrier input file is runtime-neutral for agent-tui', () => {
  const directivePath = join(mkdtempSync(join(tmpdir(), 'narada-agent-start-input-')), 'directive.md');
  writeFileSync(directivePath, 'Operation: file startup input', 'utf8');
  const output = runOk(['--runtime', 'agent-tui', '--starting-carrier-input-file', directivePath], agentTuiEnv());
  assert.equal(output.starting_carrier_input.status, 'configured');
  assert.equal(output.starting_carrier_input.source, 'starting_carrier_input_file');
  assert.equal(output.starting_carrier_input.file, directivePath);
  assert.match(output.starting_carrier_input.content_preview, /Operation: file startup input/);
});

test('starting carrier input sources are mutually exclusive', () => {
  const result = runFailed([
    '--runtime',
    'agent-cli',
    '--starting-carrier-input',
    'inline directive',
    '--starting-carrier-input-file',
    join(naradaProperRoot, 'README.md'),
  ]);
  assert.match(result.stderr, /starting_carrier_input_source_ambiguous/);
});

test('starting carrier input file must exist', () => {
  const result = runFailed([
    '--runtime',
    'agent-cli',
    '--starting-carrier-input-file',
    join(naradaProperRoot, 'missing-starting-carrier-input.txt'),
  ]);
  assert.match(result.stderr, /starting_carrier_input_file_missing/);
});





test('site-tools-root option is visible in dry-run output', () => {
  const siteToolsRoot = join(naradaProperRoot, 'tools');
  const output = runOk(['--runtime', 'agent-cli', '--site-tools-root', siteToolsRoot]);
  assert.equal(output.site_tools_root, siteToolsRoot);
});

test('agent-tui runtime loop option selects runtime-loop args', () => {
  const output = runOk(['--runtime', 'agent-tui', '--agent-tui-runtime-loop'], agentTuiEnv());
  assert.equal(output.runtime_args.includes('--runtime-loop'), true);
  assert.equal(output.runtime_args.includes('--interactive-loop'), false);
});


test('wait yolo and launch-source options are visible in dry-run output', () => {
  const output = runOk(['--runtime', 'agent-cli', '--wait', '--yolo', '--launch-source', 'option-contract']);
  assert.equal(output.wait, true);
  assert.equal(output.yolo, true);
  assert.equal(output.launch_source, 'option-contract');
});

test('show-admission returns an existing codex admission record', () => {
  const admitted = runOk(['--runtime', 'codex', '--admit-session'], { NARADA_CODEX_CLI_SCRIPT: launcherPath });
  const result = run(['--runtime', 'codex', '--show-admission', admitted.admission_id], { NARADA_CODEX_CLI_SCRIPT: launcherPath });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const shown = JSON.parse(result.stdout);
  assert.equal(shown.admission_id, admitted.admission_id);
});

test('agent-tui inline starting directive must be non-empty', () => {
  const result = runFailed(['--runtime', 'agent-tui', '--agent-tui-starting-directive', '   '], agentTuiEnv());
  assert.match(result.stderr, /agent_tui_starting_directive_empty/);
});


test('admission options expose admission result without launching', () => {
  const output = runOk(['--runtime', 'codex', '--admit-session'], { NARADA_CODEX_CLI_SCRIPT: launcherPath });
  assert.equal(typeof output.admission_id, 'string');
  assert.match(output.admission_id, /^codexadm_/);
});

test('opencode runtime is admitted by the contract', () => {
  assert.equal(sharedRuntimeContract.admitted_runtime_substrate_kinds.includes('opencode'), true);
});

test('opencode dry-run resolves as opencode-native-mcp', () => {
  const output = runOk(['--runtime', 'opencode']);
  assert.equal(output.runtime_substrate_kind, 'opencode');
  assert.equal(output.tool_fabric_adapter_kind, 'opencode-native-mcp');
  assert.equal(output.tool_fabric_adapter.tool_fabric_adapter_kind, 'opencode-native-mcp');
  assert.equal(output.tool_fabric_adapter.runtime_substrate_kind, 'opencode');
  assert.equal(output.tool_fabric_adapter.expected_tools.includes('agent_context_startup_sequence'), true);
  assert.equal(output.tool_fabric_adapter.expected_tools.includes('mcp_output_show'), true);
  assert.equal(output.context_isolation.status, 'isolated');
  assert.equal(output.context_isolation.runtime, 'opencode');
  assert.equal(output.runtime_args.length, 2);
  assert.equal(output.runtime_args[0], '--prompt');
  assert.ok(output.runtime_args[1].includes('Use agent_context_startup_sequence first'));
  assert.equal(output.mcp_fabric, null);
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
