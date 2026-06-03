import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');
const naradaProperRoot = resolve(packageRoot, '..', '..');
const launcherPath = join(packageRoot, 'src', 'narada-agent-start.ts');
const tsxLoaderPath = pathToFileURL(require.resolve('tsx')).href;
const identity = 'narada.architect';
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

function run(extraArgs = [], extraEnv = {}) {
  return spawnSync(process.execPath, [...baseArgs, ...extraArgs], {
    cwd: naradaProperRoot,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
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
    NARADA_INTELLIGENCE_PROVIDER: 'codex-subscription',
    NARADA_AI_BASE_URL: 'codex://local-subscription',
    NARADA_AI_MODEL: 'gpt-5.5',
    NARADA_AI_API_KEY: 'test-key',
  };
}

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

test('agent-cli accepts explicit intelligence provider and materializes provider env', () => {
  const output = runOk(['--runtime', 'agent-cli', '--intelligence-provider', 'codex-subscription']);
  assert.equal(output.intelligence_provider_resolution.support_state, 'verified_supported');
  assert.equal(output.required_environment.NARADA_INTELLIGENCE_PROVIDER, 'codex-subscription');
  assert.equal(output.required_environment.NARADA_AI_BASE_URL, 'codex://local-subscription');
  assert.equal(output.required_environment.NARADA_AI_MODEL, 'gpt-5.5');
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
  assert.equal(output.tool_fabric_adapter.expected_tools.includes('startup_sequence'), true);
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

test('agent-tui materializes required env from explicit ambient provider env', () => {
  const output = runOk(['--runtime', 'agent-tui', '--agent-tui-max-steps', '42'], agentTuiEnv());
  const env = output.required_environment;
  assert.equal(env.NARADA_AGENT_TUI_ENABLE_MCP_FABRIC, 'yes');
  assert.equal(env.NARADA_AGENT_TUI_MCP_CONFIG, join(naradaProperRoot, '.ai', 'runtime', 'agent-tui', 'mcp-config.json'));
  assert.equal(output.runtime_args.includes('--max-steps'), true);
  assert.equal(output.runtime_args.includes('42'), true);
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
