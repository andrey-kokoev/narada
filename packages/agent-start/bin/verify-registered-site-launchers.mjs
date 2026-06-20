#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const registryPath = requiredArg('--registry');
const naradaProperRoot = resolve(__dirname, '..', '..', '..');
const packagedLauncher = join(naradaProperRoot, 'packages', 'agent-start', 'src', 'narada-agent-start.ts');
const startNaradaAgent = requiredArg('--start-agent');
const runtimePolicy = requiredArg('--runtime-policy');

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  return process.argv[index + 1] ?? null;
}

function requiredArg(name) {
  const value = argValue(name);
  if (!value) throw new Error(`required_arg_missing: ${name}`);
  return value;
}

function fail(reason, details = {}) {
  console.error(JSON.stringify({ schema: 'narada.agent_start.launcher_verification.v1', status: 'failed', reason, ...details }, null, 2));
  process.exit(1);
}

function normalizePath(value) {
  return resolve(String(value ?? '')).replace(/[\\/]+$/, '').toLowerCase();
}

function pathsEqual(a, b) {
  return normalizePath(a) === normalizePath(b);
}

function parseRegistry(text) {
  const records = [];
  let current = null;
  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '@{') {
      current = {};
      records.push(current);
      continue;
    }
    if (!current) continue;
    if (line === '}') {
      current = null;
      continue;
    }
    const value = line.match(/^(Agent|Title|Site|NaradaRoot|WorkspaceRoot|SiteRoot|Launcher|LauncherPath|Runtime)\s*=\s*['"]([^'"]+)['"]/);
    if (value) current[value[1]] = value[2];
  }
  return records.filter((record) => record.Agent && record.NaradaRoot);
}

function launcherPathFor(record) {
  return record.LauncherPath ?? (record.Launcher ? join(record.NaradaRoot, record.Launcher) : null);
}

function dryRunLaunch(record, runtime) {
  const launcherPath = launcherPathFor(record);
  const args = [
    '-NoProfile',
    '-File', startNaradaAgent,
    '-NaradaRoot', record.NaradaRoot,
    '-SiteRoot', record.SiteRoot,
    '-Agent', record.Agent,
    '-Runtime', runtime,
    '-LauncherPath', launcherPath,
    '-DryRun',
  ];
  if (record.WorkspaceRoot) args.push('-WorkspaceRoot', record.WorkspaceRoot);
  const result = spawnSync('pwsh', args, {
    cwd: record.WorkspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NARADA_PROPER_ROOT: naradaProperRoot,
    },
    timeout: 45000,
    windowsHide: true,
  });
  return { runtime, args, status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error ? String(result.error.message ?? result.error) : null };
}

function parseJsonOutput(output) {
  const text = String(output ?? '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('json_object_not_found');
  return JSON.parse(text.slice(start, end + 1));
}

function expectedAdapter(runtime) {
  if (runtime === 'codex') return 'codex-native-mcp';
  if (runtime === 'agent-cli' || runtime === 'agent-runtime-server') return 'narada-agent-cli-mcp-client';
  if (runtime === 'agent-tui') return 'narada-agent-tui-terminal-interactive-loop';
  if (runtime === 'pi') return 'pi-extension-mcp-bridge';
  if (runtime === 'claude-code') return 'claude-code-native-mcp';
  return null;
}

function validateLaunch(record, runtime, launch) {
  const expectedSiteRoot = record.SiteRoot;
  const expectedWorkspaceRoot = record.WorkspaceRoot;
  const env = launch.required_environment ?? {};
  const adapter = expectedAdapter(runtime);

  if (launch.status === 'refused') failures.push({ reason: 'launch_refused', refusals: launch.refusals ?? launch.reason ?? null });
  if (launch.identity !== record.Agent) failures.push({ reason: 'identity_mismatch', expected: record.Agent, actual: launch.identity });
  if (launch.runtime !== runtime) failures.push({ reason: 'runtime_mismatch', expected: runtime, actual: launch.runtime });
  if (!pathsEqual(env.NARADA_SITE_ROOT, expectedSiteRoot)) failures.push({ reason: 'site_root_mismatch', expected: expectedSiteRoot, actual: env.NARADA_SITE_ROOT });
  if (!pathsEqual(env.NARADA_WORKSPACE_ROOT, expectedWorkspaceRoot)) failures.push({ reason: 'workspace_root_mismatch', expected: expectedWorkspaceRoot, actual: env.NARADA_WORKSPACE_ROOT });
  if (adapter && launch.tool_fabric_adapter_kind !== adapter) failures.push({ reason: 'adapter_mismatch', expected: adapter, actual: launch.tool_fabric_adapter_kind });

  const runtimeArgs = Array.isArray(launch.runtime_args) ? launch.runtime_args : [];
  if (runtime === 'agent-tui') {
    if (!runtimeArgs.includes('--interactive-loop')) failures.push({ reason: 'agent_tui_missing_interactive_loop_flag' });
    if (!runtimeArgs.includes('--max-steps')) failures.push({ reason: 'agent_tui_missing_max_steps_flag' });
    if (runtimeArgs.includes('--interactive-step-once')) failures.push({ reason: 'agent_tui_uses_interactive_step_once' });
    if (env.NARADA_AGENT_TUI_ENABLE_TERMINAL_RENDERING !== 'yes') failures.push({ reason: 'agent_tui_terminal_rendering_env_missing', actual: env.NARADA_AGENT_TUI_ENABLE_TERMINAL_RENDERING });
    if (env.NARADA_AGENT_TUI_TERMINAL_MODE !== 'interactive_loop') failures.push({ reason: 'agent_tui_terminal_mode_env_mismatch', actual: env.NARADA_AGENT_TUI_TERMINAL_MODE });
    if (env.NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION !== 'true') failures.push({ reason: 'agent_tui_provider_execution_env_missing', actual: env.NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION });
    if (env.NARADA_AGENT_TUI_PROVIDER_ADAPTER_KIND !== 'codex_subscription_adapter') failures.push({ reason: 'agent_tui_provider_adapter_env_mismatch', actual: env.NARADA_AGENT_TUI_PROVIDER_ADAPTER_KIND });
    if (!env.NARADA_INTELLIGENCE_PROVIDER) failures.push({ reason: 'agent_tui_intelligence_provider_env_missing' });
    if (!env.KIMI_CODE_MODEL && !env.CODEX_MODEL) failures.push({ reason: 'agent_tui_model_env_missing' });
  }

  return failures;
}

function scanLauncherShape(record) {
  const failures = [];
  const launcherPath = launcherPathFor(record);
  if (!launcherPath) return [{ reason: 'launcher_missing_from_registry' }];
  if (!existsSync(launcherPath)) return [{ reason: 'launcher_file_missing', launcher_path: launcherPath }];
  const launcherText = readFileSync(launcherPath, 'utf8').replace(/^\uFEFF/, '');
  const delegates = launcherText.includes('packages\\agent-start\\src\\narada-agent-start.ts')
    || launcherText.includes('packages/agent-start/src/narada-agent-start.ts');
  if (!delegates) failures.push({ reason: 'launcher_does_not_delegate_to_packaged_agent_start', launcher_path: launcherPath });
  const stalePattern = /tools[\\/]agent-start[\\/]start-agent\.mjs|interactive-step-once|narada-agent-tui-interactive-step|bounded_smoke_step_only/;
  if (stalePattern.test(launcherText)) failures.push({ reason: 'launcher_contains_stale_agent_start_logic_or_step_mode', launcher_path: launcherPath });
  const rootIsNaradaProper = pathsEqual(record.NaradaRoot, naradaProperRoot);
  const localStartAgent = join(record.NaradaRoot, 'tools', 'agent-start', 'start-agent.mjs');
  if (!rootIsNaradaProper && existsSync(localStartAgent)) failures.push({ reason: 'site_owns_forked_start_agent_implementation', local_start_agent: localStartAgent });
  return failures;
}

if (!existsSync(registryPath)) fail('registry_missing', { registry_path: registryPath });
if (!existsSync(packagedLauncher)) fail('packaged_launcher_missing', { packaged_launcher: packagedLauncher });
if (!existsSync(startNaradaAgent)) fail('start_narada_agent_missing', { start_agent_path: startNaradaAgent });

const records = parseRegistry(readFileSync(registryPath, 'utf8'));
const checked = [];
const failures = [];

for (const record of records) {
  for (const shapeFailure of scanLauncherShape(record)) failures.push({ agent: record.Agent, ...shapeFailure });
  for (const field of ['Runtime', 'SiteRoot', 'WorkspaceRoot']) {
    if (!record[field]) failures.push({ agent: record.Agent, reason: 'registry_required_field_missing', field });
  }
  if (!record.Runtime || !record.SiteRoot || !record.WorkspaceRoot) continue;

  const defaultRuntime = record.Runtime;
  const defaultDryRun = dryRunLaunch(record, defaultRuntime);
  if (defaultDryRun.status !== 0) {
    failures.push({ agent: record.Agent, runtime: defaultRuntime, reason: 'dry_run_process_failed', status: defaultDryRun.status, error: defaultDryRun.error, stderr: defaultDryRun.stderr.trim(), stdout: defaultDryRun.stdout.trim() });
    continue;
  }

  let defaultLaunch;
  try {
    defaultLaunch = parseJsonOutput(defaultDryRun.stdout);
  } catch (error) {
    failures.push({ agent: record.Agent, runtime: defaultRuntime, reason: 'dry_run_json_parse_failed', error: String(error.message ?? error), stdout: defaultDryRun.stdout.trim(), stderr: defaultDryRun.stderr.trim() });
    continue;
  }
  const defaultFailures = validateLaunch(record, defaultRuntime, defaultLaunch);
  for (const launchFailure of defaultFailures) failures.push({ agent: record.Agent, runtime: defaultRuntime, ...launchFailure });
  checked.push({ agent: record.Agent, runtime: defaultRuntime });

  if (runtimePolicy === 'default-and-agent-tui' && defaultRuntime !== 'agent-tui') {
    const tuiDryRun = dryRunLaunch(record, 'agent-tui');
    if (tuiDryRun.status !== 0) {
      failures.push({ agent: record.Agent, runtime: 'agent-tui', reason: 'dry_run_process_failed', status: tuiDryRun.status, error: tuiDryRun.error, stderr: tuiDryRun.stderr.trim(), stdout: tuiDryRun.stdout.trim() });
      continue;
    }
    let tuiLaunch;
    try {
      tuiLaunch = parseJsonOutput(tuiDryRun.stdout);
    } catch (error) {
      failures.push({ agent: record.Agent, runtime: 'agent-tui', reason: 'dry_run_json_parse_failed', error: String(error.message ?? error), stdout: tuiDryRun.stdout.trim(), stderr: tuiDryRun.stderr.trim() });
      continue;
    }
    const tuiFailures = validateLaunch(record, 'agent-tui', tuiLaunch);
    for (const launchFailure of tuiFailures) failures.push({ agent: record.Agent, runtime: 'agent-tui', ...launchFailure });
    checked.push({ agent: record.Agent, runtime: 'agent-tui' });
  }
}

if (failures.length > 0) fail('launcher_verification_failed', {
  registry_path: registryPath,
  checked_launches: checked.length,
  registered_records: records.length,
  failures,
});

console.log(JSON.stringify({
  schema: 'narada.agent_start.launcher_verification.v1',
  status: 'ok',
  registry_path: registryPath,
  packaged_launcher: packagedLauncher,
  registered_records: records.length,
  checked_launches: checked.length,
  runtime_policy: runtimePolicy,
}, null, 2));
