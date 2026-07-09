#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAgentIdentityRefV2, resolveAgentIdentityRef } from '@narada2/agent-identity';
import { runGovernedCommand } from '@narada2/process-launch-posture';

const __dirname = dirname(fileURLToPath(import.meta.url));
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`Usage: narada-agent-start-verify-launchers --registry <agents.psd1> --start-agent <Start-NaradaAgent.ps1> --runtime-policy <policy> [--agent <agent>] [--site <site>] [--record-offset <n>] [--record-limit <n>] [--launch-timeout-ms <n>] [--jobs <n>] [--retries <n>] [--progress]

Policies:
  default-only           Verify each selected record's registered Carrier/Runtime.
  agent-tui-only         Verify selected records through Carrier=agent-tui, Runtime=agent-tui.
  default-and-agent-tui  Verify both paths in one run; use split policies for large registries.

Filters:
  --agent <agent>        Select one agent. Repeatable.
  --site <site>          Select one Site id. Repeatable.

Sharding:
  --record-offset <n>    Skip n selected records after filters. Default: 0.
  --record-limit <n>     Verify at most n selected records after offset.
  --launch-timeout-ms <n> Per-launch dry-run timeout. Default: 30000.
  --jobs <n>             Concurrent dry-run launch checks. Default: 1.
  --retries <n>          Retry transient dry-run process/JSON handoff failures. Default: 1.

Diagnostics:
  --progress             Emit bounded human progress lines to stderr; final stdout remains JSON.
`);
  process.exit(0);
}
const registryPath = requiredArg('--registry');
const naradaProperRoot = resolve(__dirname, '..', '..', '..');
const packagedLauncher = join(naradaProperRoot, 'packages', 'agent-start', 'src', 'narada-agent-start.ts');
const startNaradaAgent = requiredArg('--start-agent');
const runtimePolicy = requiredArg('--runtime-policy');
const admittedRuntimePolicies = new Set(['default-only', 'default-and-agent-tui', 'agent-tui-only']);
const agentFilters = argValues('--agent');
const siteFilters = argValues('--site');
const recordOffset = optionalNonnegativeIntegerArg('--record-offset', 0);
const recordLimit = optionalPositiveIntegerArg('--record-limit');
const launchTimeoutMs = optionalPositiveIntegerArg('--launch-timeout-ms') ?? 30000;
const jobs = optionalPositiveIntegerArg('--jobs') ?? 1;
const retries = optionalNonnegativeIntegerArg('--retries', 1);
const progressEnabled = process.argv.includes('--progress');

function progress(message) {
  if (progressEnabled) process.stderr.write(`${message}\n`);
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1] ?? null;
  if (!value || value.startsWith('--')) fail('arg_value_missing', { argument: name });
  return value;
}

function argValues(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) values.push(process.argv[index + 1]);
  }
  return values;
}

function requiredArg(name) {
  const value = argValue(name);
  if (!value) throw new Error(`required_arg_missing: ${name}`);
  return value;
}

function parseIntegerArg(name) {
  const raw = argValue(name);
  if (raw === null) return null;
  if (!/^\d+$/u.test(raw)) fail('numeric_arg_invalid', { argument: name, value: raw });
  return Number(raw);
}

function optionalNonnegativeIntegerArg(name, defaultValue) {
  const value = parseIntegerArg(name);
  return value ?? defaultValue;
}

function optionalPositiveIntegerArg(name) {
  const value = parseIntegerArg(name);
  if (value === null) return null;
  if (value < 1) fail('numeric_arg_invalid', { argument: name, value: String(value), constraint: 'positive_integer' });
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

function siteId(record) {
  return record.Site ?? record.Agent?.replace(/\.(architect|builder2?|resident|Kevin|Bob|Robin)$/u, '');
}

function roleId(record) {
  return record.Role ?? record.Agent?.split('.').at(-1)?.replace(/\d+$/u, '') ?? null;
}

function expectedAgentIdentityRef(record) {
  return resolveAgentIdentityRef(record.Agent, { site_id: record.Site ?? null, role: roleId(record) }).value ?? buildAgentIdentityRefV2({
    identity_scope: record.Site ? { kind: 'narada_site', site_id: record.Site } : { kind: 'unscoped' },
    local_agent_id: record.Agent.split('.').at(-1) ?? record.Agent,
    role: roleId(record),
    legacy_agent_id: record.Agent,
  });
}

function scanRegistryIdentityShape(record) {
  const failures = [];
  if (!record.Agent) return [{ reason: 'registry_required_field_missing', field: 'Agent' }];
  if (!record.Agent.includes('.') && !record.Site) failures.push({ reason: 'site_local_agent_missing_site' });
  let identityRef = null;
  try {
    identityRef = expectedAgentIdentityRef(record);
  } catch (error) {
    failures.push({ reason: 'agent_identity_ref_derivation_failed', error: String(error?.message ?? error) });
    return failures;
  }
  if (!identityRefSiteId(identityRef)) failures.push({ reason: 'agent_identity_ref_unscoped', expected_site: record.Site ?? null });
  if (identityRef.display !== identityRef.canonical_agent_id) failures.push({ reason: 'agent_identity_display_not_canonical', display: identityRef.display, canonical_agent_id: identityRef.canonical_agent_id });
  if (record.Role && identityRef.role !== record.Role) failures.push({ reason: 'agent_identity_role_mismatch', expected: record.Role, actual: identityRef.role });
  return failures;
}

function recordCarrier(record) {
  return record.OperatorSurface ?? record.Carrier ?? null;
}

function stableJson(value) {
  return JSON.stringify(value, Object.keys(value ?? {}).sort());
}

function identityRefForComparison(value, { includeRole = true } = {}) {
  if (!value || typeof value !== 'object') return value ?? null;
  const comparable = {
    schema: value.schema,
    site_id: identityRefSiteId(value),
    local_agent_id: value.local_agent_id ?? null,
    canonical_agent_id: value.canonical_agent_id ?? null,
    display: value.display ?? null,
    source_agent_id: value.source_agent_id ?? null,
    scope: identityRefScope(value),
  };
  if (includeRole) comparable.role = value.role ?? null;
  return comparable;
}

function identityRefSiteId(value) {
  if (!value || typeof value !== 'object') return null;
  return value.site_id ?? value.identity_scope?.site_id ?? null;
}

function identityRefScope(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.scope) return value.scope;
  if (value.identity_scope?.kind === 'narada_site') return 'site_scoped';
  if (value.identity_scope?.kind === 'unscoped') return 'unscoped';
  return null;
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
    const value = line.match(/^(Agent|Role|Title|Site|NaradaRoot|WorkspaceRoot|SiteRoot|Launcher|LauncherPath|Carrier|OperatorSurface|Runtime)\s*=\s*['"]([^'"]+)['"]/);
    if (value) current[value[1]] = value[2];
  }
  return records.filter((record) => record.Agent && record.NaradaRoot);
}

function launcherPathFor(record) {
  return record.LauncherPath ?? (record.Launcher ? join(record.NaradaRoot, record.Launcher) : null);
}

function dryRunLaunch(record, carrier, runtime) {
  const args = [
    '-NoProfile',
    '-File', startNaradaAgent,
    '-NaradaRoot', record.NaradaRoot,
    '-SiteRoot', record.SiteRoot,
    '-Agent', record.Agent,
    '-Carrier', carrier,
    '-Runtime', runtime,
    '-DryRun',
  ];
  if (record.Site) args.push('-TargetSiteId', record.Site);
  if (record.WorkspaceRoot) args.push('-WorkspaceRoot', record.WorkspaceRoot);
  return spawnDryRunProcess({ record, carrier, runtime, args });
}

function spawnDryRunProcess({ record, carrier, runtime, args }) {
  return new Promise((resolveLaunch) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = runGovernedCommand('pwsh', args, {
      cwd: record.WorkspaceRoot,
      env: {
        ...process.env,
        NARADA_PROPER_ROOT: naradaProperRoot,
      },
    });
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolveLaunch({ carrier, runtime, args, status: null, stdout, stderr, error: `timed_out_after_${launchTimeoutMs}ms` });
    }, launchTimeoutMs);
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => { stdout += chunk; });
    child.stderr?.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveLaunch({ carrier, runtime, args, status: null, stdout, stderr, error: String(error.message ?? error) });
    });
    child.on('close', (status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveLaunch({ carrier, runtime, args, status, stdout, stderr, error: null });
    });
  });
}

function parseJsonOutput(output) {
  const text = String(output ?? '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('json_object_not_found');
  return JSON.parse(text.slice(start, end + 1));
}

function expectedAdapter(carrier, runtime) {
  if (carrier === 'codex') return 'codex-native-mcp';
  if (carrier === 'agent-cli' || carrier === 'agent-web-ui') return 'narada-agent-runtime-server-mcp-client';
  if (carrier === 'agent-tui') return 'narada-agent-tui-terminal-interactive-loop';
  if (carrier === 'pi') return 'pi-extension-mcp-bridge';
  if (carrier === 'claude-code') return 'claude-code-native-mcp';
  return null;
}

function validateLaunch(record, carrier, runtime, launch) {
  const failures = [];
  const expectedSiteRoot = record.SiteRoot;
  const expectedWorkspaceRoot = record.WorkspaceRoot;
  const env = launch.required_environment ?? {};
  const adapter = expectedAdapter(carrier, runtime);

  if (launch.status === 'refused') failures.push({ reason: 'launch_refused', refusals: launch.refusals ?? launch.reason ?? null });
  if (launch.identity !== record.Agent) failures.push({ reason: 'identity_mismatch', expected: record.Agent, actual: launch.identity });
  const expectedIdentityRef = expectedAgentIdentityRef(record);
  const compareRole = Boolean(record.Role);
  if (stableJson(identityRefForComparison(launch.agent_identity_ref, { includeRole: compareRole })) !== stableJson(identityRefForComparison(expectedIdentityRef, { includeRole: compareRole }))) failures.push({ reason: 'agent_identity_ref_mismatch', expected: expectedIdentityRef, actual: launch.agent_identity_ref ?? null, compared_role: compareRole });
  if (launch.carrier_kind !== carrier) failures.push({ reason: 'carrier_mismatch', expected: carrier, actual: launch.carrier_kind });
  if (launch.runtime !== runtime) failures.push({ reason: 'runtime_mismatch', expected: runtime, actual: launch.runtime });
  if (!pathsEqual(env.NARADA_SITE_ROOT, expectedSiteRoot)) failures.push({ reason: 'site_root_mismatch', expected: expectedSiteRoot, actual: env.NARADA_SITE_ROOT });
  if (!pathsEqual(env.NARADA_WORKSPACE_ROOT, expectedWorkspaceRoot)) failures.push({ reason: 'workspace_root_mismatch', expected: expectedWorkspaceRoot, actual: env.NARADA_WORKSPACE_ROOT });
  if (adapter && launch.tool_fabric_adapter_kind !== adapter) failures.push({ reason: 'adapter_mismatch', expected: adapter, actual: launch.tool_fabric_adapter_kind });

  const runtimeArgs = Array.isArray(launch.runtime_args) ? launch.runtime_args : [];
  if (carrier === 'agent-tui') {
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
  const localStartAgents = [
    join(record.NaradaRoot, 'tools', 'agent-start', 'start-agent.mjs'),
    join(record.SiteRoot, 'tools', 'agent-start', 'start-agent.mjs'),
  ];
  const seenLocalStartAgents = new Set();
  for (const localStartAgent of localStartAgents) {
    const normalizedLocalStartAgent = normalizePath(localStartAgent);
    if (seenLocalStartAgents.has(normalizedLocalStartAgent)) continue;
    seenLocalStartAgents.add(normalizedLocalStartAgent);
    if (!rootIsNaradaProper && existsSync(localStartAgent)) failures.push({ reason: 'site_owns_forked_start_agent_implementation', local_start_agent: localStartAgent });
  }
  return failures;
}

if (!existsSync(registryPath)) fail('registry_missing', { registry_path: registryPath });
if (!existsSync(packagedLauncher)) fail('packaged_launcher_missing', { packaged_launcher: packagedLauncher });
if (!existsSync(startNaradaAgent)) fail('start_narada_agent_missing', { start_agent_path: startNaradaAgent });
if (!admittedRuntimePolicies.has(runtimePolicy)) fail('runtime_policy_unknown', { runtime_policy: runtimePolicy, admitted_runtime_policies: [...admittedRuntimePolicies] });

const allRecords = parseRegistry(readFileSync(registryPath, 'utf8'));
const filteredRecords = allRecords.filter((record) => {
  if (agentFilters.length > 0 && !agentFilters.includes(record.Agent)) return false;
  if (siteFilters.length > 0 && !siteFilters.includes(siteId(record))) return false;
  return true;
});
const records = filteredRecords.slice(recordOffset, recordLimit === null ? undefined : recordOffset + recordLimit);
const filters = {
  agents: agentFilters,
  sites: siteFilters,
};
const shard = {
  record_offset: recordOffset,
  record_limit: recordLimit,
  launch_timeout_ms: launchTimeoutMs,
  jobs,
  retries,
};
if (filteredRecords.length === 0) fail('launcher_verification_filter_matched_no_records', {
  registry_path: registryPath,
  registered_records: allRecords.length,
  filters,
  shard,
});
if (records.length === 0) fail('launcher_verification_shard_matched_no_records', {
  registry_path: registryPath,
  registered_records: allRecords.length,
  filtered_records: filteredRecords.length,
  selected_records: 0,
  filters,
  shard,
});
const checked = [];
const failures = [];
const launchTasks = [];
let plannedLaunches = 0;
let launchedCount = 0;

function plannedLaunchCountForRecord(record) {
  const carrier = recordCarrier(record);
  if (!carrier || !record.Runtime || !record.SiteRoot || !record.WorkspaceRoot) return 0;
  let count = 0;
  if (runtimePolicy !== 'agent-tui-only') count += 1;
  if ((runtimePolicy === 'default-and-agent-tui' || runtimePolicy === 'agent-tui-only') && carrier !== 'agent-tui') count += 1;
  return count;
}

function enqueueDryRun(record, carrier, runtime) {
  launchTasks.push({ index: launchTasks.length, record, carrier, runtime });
}

function dryRunAttemptFailure(task, dryRun) {
  if (dryRun.status !== 0) {
    return { agent: task.record.Agent, carrier: task.carrier, runtime: task.runtime, reason: 'dry_run_process_failed', status: dryRun.status, error: dryRun.error, stderr: dryRun.stderr.trim(), stdout: dryRun.stdout.trim() };
  }
  try {
    return { launch: parseJsonOutput(dryRun.stdout) };
  } catch (error) {
    return { agent: task.record.Agent, carrier: task.carrier, runtime: task.runtime, reason: 'dry_run_json_parse_failed', error: String(error.message ?? error), stdout: dryRun.stdout.trim(), stderr: dryRun.stderr.trim() };
  }
}

async function runDryRunTask(task) {
  launchedCount += 1;
  progress(`launcher-verifier: [${launchedCount}/${plannedLaunches}] ${task.record.Agent} carrier=${task.carrier} runtime=${task.runtime}`);
  let attemptResult = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const dryRun = await dryRunLaunch(task.record, task.carrier, task.runtime);
    attemptResult = dryRunAttemptFailure(task, dryRun);
    if (attemptResult.launch) break;
    if (attempt < retries) progress(`launcher-verifier: retry ${attempt + 1}/${retries} ${task.record.Agent} reason=${attemptResult.reason}`);
  }
  const taskFailures = [];
  if (!attemptResult?.launch) {
    taskFailures.push(attemptResult);
    return { index: task.index, checked: null, failures: taskFailures };
  }
  const launchFailures = validateLaunch(task.record, task.carrier, task.runtime, attemptResult.launch);
  for (const launchFailure of launchFailures) taskFailures.push({ agent: task.record.Agent, carrier: task.carrier, runtime: task.runtime, ...launchFailure });
  return { index: task.index, checked: { agent: task.record.Agent, carrier: task.carrier, runtime: task.runtime }, failures: taskFailures };
}

async function runLaunchTasksWithJobs(tasks, jobCount) {
  const results = [];
  let nextIndex = 0;
  const workerCount = Math.min(jobCount, Math.max(tasks.length, 1));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < tasks.length) {
      const task = tasks[nextIndex];
      nextIndex += 1;
      results.push(await runDryRunTask(task));
    }
  }));
  return results.sort((left, right) => left.index - right.index);
}

plannedLaunches = records.reduce((total, record) => total + plannedLaunchCountForRecord(record), 0);
progress(`launcher-verifier: selected ${records.length}/${filteredRecords.length} records; planned launches=${plannedLaunches}; policy=${runtimePolicy}; jobs=${jobs}; retries=${retries}`);

for (const record of records) {
  const carrier = recordCarrier(record);
  for (const identityFailure of scanRegistryIdentityShape(record)) failures.push({ agent: record.Agent, ...identityFailure });
  for (const shapeFailure of scanLauncherShape(record)) failures.push({ agent: record.Agent, ...shapeFailure });
  for (const field of ['Runtime', 'SiteRoot', 'WorkspaceRoot']) {
    if (!record[field]) failures.push({ agent: record.Agent, reason: 'registry_required_field_missing', field });
  }
  if (!carrier) failures.push({ agent: record.Agent, reason: 'registry_required_field_missing', field: 'OperatorSurface' });
  if (!carrier || !record.Runtime || !record.SiteRoot || !record.WorkspaceRoot) continue;

  if (runtimePolicy !== 'agent-tui-only') {
    enqueueDryRun(record, carrier, record.Runtime);
  }

  if ((runtimePolicy === 'default-and-agent-tui' || runtimePolicy === 'agent-tui-only') && carrier !== 'agent-tui') {
    enqueueDryRun(record, 'agent-tui', 'agent-tui');
  }
}

const taskResults = await runLaunchTasksWithJobs(launchTasks, jobs);
for (const taskResult of taskResults) {
  if (taskResult.checked) checked.push(taskResult.checked);
  for (const failure of taskResult.failures) failures.push(failure);
}

progress(`launcher-verifier: checked launches=${checked.length}; failures=${failures.length}`);

if (failures.length > 0) fail('launcher_verification_failed', {
  registry_path: registryPath,
  checked_launches: checked.length,
  registered_records: allRecords.length,
  filtered_records: filteredRecords.length,
  selected_records: records.length,
  filters,
  shard,
  failures,
});

console.log(JSON.stringify({
  schema: 'narada.agent_start.launcher_verification.v1',
  status: 'ok',
  registry_path: registryPath,
  packaged_launcher: packagedLauncher,
  registered_records: allRecords.length,
  filtered_records: filteredRecords.length,
  selected_records: records.length,
  checked_launches: checked.length,
  runtime_policy: runtimePolicy,
  filters,
  shard,
}, null, 2));
