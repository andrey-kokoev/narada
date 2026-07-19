import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { discoverNarsSessions, writeNarsSessionStartedIndex } from '@narada2/nars-session-core/session-index';

const __dirname = dirname(fileURLToPath(import.meta.url));
const naradaProperRoot = resolve(__dirname, '..', '..', '..', '..', '..');
const workspaceLauncher = resolve(__dirname, '..', '..', 'src', 'assets', 'windows', 'Start-NaradaWorkspace.Dev.ps1');

function parseJsonOutput(stdout) {
  const text = String(stdout);
  const start = text.search(/[\[{]/);
  assert.notEqual(start, -1, `no JSON payload found in stdout:\n${text}`);
  return JSON.parse(text.slice(start));
}

async function waitForLaunchedSession(siteRoot, launchSessionId, existingSessionIds, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let lastDiscovery = null;
  while (Date.now() < deadline) {
    lastDiscovery = discoverNarsSessions({ siteRoot });
    const session = lastDiscovery.sessions.find((candidate) => {
      const record = candidate.record ?? candidate;
      return record.launch_session_id === launchSessionId
        && typeof candidate.session_id === 'string'
        && !existingSessionIds.has(candidate.session_id);
    });
    if (session) return session;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`launcher_e2e_session_attachment_timeout:${launchSessionId}:${JSON.stringify(lastDiscovery)}`);
}

async function waitForSessionClosed(siteRoot, sessionId, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastSession = null;
  while (Date.now() < deadline) {
    lastSession = discoverNarsSessions({ siteRoot }).sessions.find((session) => session.session_id === sessionId) ?? null;
    if (!lastSession || lastSession.display_state === 'closed' || lastSession.terminal_state === 'closed') return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`launcher_e2e_session_close_timeout:${sessionId}:${JSON.stringify(lastSession)}`);
}

async function waitForProcessExit(pid, timeoutMs = 10_000) {
  if (!Number.isInteger(pid) || pid <= 0) return;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`launcher_e2e_process_exit_timeout:${pid}`);
}

function terminateProcessTree(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    // The process may already have exited during session cleanup.
  }
}

async function terminateProcessTreeAndWait(pid, timeoutMs = 10_000) {
  if (!Number.isInteger(pid) || pid <= 0) return;
  terminateProcessTree(pid);
  try {
    await waitForProcessExit(pid, timeoutMs);
  } catch {
    // Cleanup remains best-effort after the process-tree termination request.
  }
}

function discoverFixtureProcessIds(fixtureRoot) {
  if (process.platform !== 'win32') return [];
  const script = [
    '$needle = [Console]::In.ReadToEnd()',
    '$processes = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($needle) } | Select-Object -ExpandProperty ProcessId)',
    '$processes | ConvertTo-Json -Compress',
  ].join('; ');
  const result = spawnSync('pwsh', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    script,
  ], {
    input: fixtureRoot,
    encoding: 'utf8',
    timeout: 10_000,
  });
  if (result.status !== 0 || !String(result.stdout).trim()) return [];
  const parsed = JSON.parse(result.stdout);
  return (Array.isArray(parsed) ? parsed : [parsed])
    .map((pid) => Number(pid))
    .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
}

async function terminateFixtureProcesses(fixtureRoot, timeoutMs = 15_000) {
  if (process.platform !== 'win32') return;
  const deadline = Date.now() + timeoutMs;
  let remaining = [];
  do {
    remaining = discoverFixtureProcessIds(fixtureRoot);
    for (const pid of remaining) terminateProcessTree(pid);
    if (remaining.length === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  throw new Error(`launcher_e2e_fixture_process_cleanup_timeout:${fixtureRoot}:${remaining.join(',')}`);
}

async function removeFixtureRoot(fixtureRoot, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  do {
    try {
      rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
      return;
    } catch (error) {
      lastError = error;
      if (!['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(error?.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } while (Date.now() < deadline);
  throw new Error(`launcher_e2e_fixture_cleanup_timeout:${fixtureRoot}:${lastError?.code ?? 'unknown'}`);
}

test('operator launch journey dry-run maps one agent to agent-cli and agent-web-ui sibling projections', { skip: process.platform !== 'win32' }, () => {
  assert.equal(existsSync(workspaceLauncher), true, `User Site launcher not found: ${workspaceLauncher}`);
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), 'narada-launcher-plan-'));
  try {
    const registryPath = resolve(fixtureRoot, 'agents.json');
    writeFileSync(registryPath, JSON.stringify({
      Agents: [{
        Agent: 'resident',
        Role: 'resident',
        Site: 'sonar',
        NaradaRoot: fixtureRoot,
        SiteRoot: fixtureRoot,
        WorkspaceRoot: fixtureRoot,
        LauncherPath: resolve(fixtureRoot, 'sonar.ps1'),
        OperatorSurface: 'agent-cli',
        Runtime: 'narada-agent-runtime-server',
      }],
    }), 'utf8');
    const result = spawnSync('pwsh', [
      '-File', workspaceLauncher,
      '-All',
      '-Runtime', 'nars',
      '-Carrier', 'agent-cli,agent-web-ui',
      '-Site', 'sonar',
      '-Role', 'resident',
      '-ConfigPath', registryPath,
      '-DryRun',
    ], {
      cwd: naradaProperRoot,
      encoding: 'utf8',
      timeout: 30_000,
      env: {
        ...process.env,
        NARADA_PROPER_ROOT: naradaProperRoot,
        NARADA_USER_SITE_ROOT: fixtureRoot,
      },
    });

    assert.equal(result.status, 0, `stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
    assert.doesNotMatch(result.stderr, /narada_cli_dist_stale|source_hash_mismatch/i);
    const plan = parseJsonOutput(result.stdout);

    assert.equal(plan.schema, 'narada.workspace_launch.plan.v1');
    assert.equal(plan.mode, 'dry_run');
    assert.equal(plan.mutation_performed, false);
    assert.equal(plan.windows_terminal_invoked, false);
    assert.equal(plan.launcher_execution_owner, 'narada-cli');
    assert.equal(plan.selected_agents.length, 1);

    const agent = plan.selected_agents[0];
    assert.deepEqual(agent.launch_operator_surfaces, ['agent-cli', 'agent-web-ui']);
    assert.equal(agent.launch_operator_surface, 'agent-cli');
    assert.equal(agent.launch_runtime, 'narada-agent-runtime-server');

    const separatorCount = agent.wt_args.filter((arg) => arg === ';').length;
    assert.equal(separatorCount, 1, JSON.stringify(agent.wt_args, null, 2));
    const commandText = agent.wt_args.join(' ');
    assert.match(commandText, /'operator-surface' 'runtime' 'start' 'agent-cli'/);
    assert.match(commandText, /'--runtime' 'narada-agent-runtime-server'/);
    assert.match(commandText, /'agent-web-ui' 'attach'/);
    assert.match(commandText, /'--agent' 'resident'/);
    assert.match(commandText, /'--wait-for-session-ms' '60000'/);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('operator launch journey dry-run admits agent-web-ui as the primary NARS launch carrier', { skip: process.platform !== 'win32' }, () => {
  assert.equal(existsSync(workspaceLauncher), true, `User Site launcher not found: ${workspaceLauncher}`);
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), 'narada-launcher-plan-'));
  try {
    const registryPath = resolve(fixtureRoot, 'agents.json');
    writeFileSync(registryPath, JSON.stringify({
      Agents: [{
        Agent: 'sonar.resident',
        Role: 'resident',
        Site: 'sonar',
        NaradaRoot: fixtureRoot,
        SiteRoot: fixtureRoot,
        WorkspaceRoot: fixtureRoot,
        LauncherPath: resolve(fixtureRoot, 'sonar.ps1'),
        OperatorSurface: 'agent-web-ui',
        Runtime: 'narada-agent-runtime-server',
      }],
    }), 'utf8');
    const result = spawnSync('pwsh', [
      '-File', workspaceLauncher,
      '-All',
      '-Runtime', 'nars',
      '-Carrier', 'agent-web-ui',
      '-Site', 'sonar',
      '-Role', 'resident',
      '-ConfigPath', registryPath,
      '-DryRun',
    ], {
      cwd: naradaProperRoot,
      encoding: 'utf8',
      timeout: 30_000,
      env: {
        ...process.env,
        NARADA_PROPER_ROOT: naradaProperRoot,
        NARADA_USER_SITE_ROOT: fixtureRoot,
      },
    });

    assert.equal(result.status, 0, `stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
    const plan = parseJsonOutput(result.stdout);
    const agent = plan.selected_agents[0];
    assert.deepEqual(agent.launch_operator_surfaces, ['agent-web-ui']);
    assert.equal(agent.launch_operator_surface, 'agent-web-ui');
    assert.equal(agent.launch_runtime, 'narada-agent-runtime-server');
    assert.deepEqual(agent.wt_args, []);
    assert.equal(agent.runtime_start_execution_mode, 'hidden_detached');
    assert.deepEqual(agent.terminal_tabs, []);
    const hiddenRuntimeCommandText = agent.hidden_runtime_start_command.join(' ');
    assert.match(hiddenRuntimeCommandText, /operator-surface.*runtime.*start/);
    assert.match(hiddenRuntimeCommandText, /agent-web-ui/);
    assert.match(hiddenRuntimeCommandText, /narada-agent-runtime-server/);
    const projectionCommandText = agent.operator_projection_start_command.join(' ');
    assert.match(projectionCommandText, /agent-web-ui.*attach/);
    assert.match(projectionCommandText, /--launch-binding/);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('PowerShell launcher executes a fresh NARS session and attaches the Web UI projection', { skip: process.platform !== 'win32' }, async () => {
  assert.equal(existsSync(workspaceLauncher), true, `User Site launcher not found: ${workspaceLauncher}`);
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), 'narada-launcher-composition-'));
  const siteRoot = resolve(fixtureRoot, 'site');
  const userSiteRoot = resolve(fixtureRoot, 'user-site');
  const routerStateRoot = resolve(fixtureRoot, 'operator-router-state');
  const registryPath = resolve(fixtureRoot, 'agents.json');
  const oldSessionId = 'launcher-e2e-old-session';
  const oldSessionPath = resolve(siteRoot, '.narada', 'crew', 'nars-sessions', oldSessionId, 'session.jsonl');
  let savedResult = null;
  let launchedSession = null;
  let runtimePid = null;
  let projectionPid = null;
  let controlPath = null;
  mkdirSync(siteRoot, { recursive: true });
  mkdirSync(userSiteRoot, { recursive: true });
  mkdirSync(routerStateRoot, { recursive: true });
  mkdirSync(dirname(oldSessionPath), { recursive: true });
  writeFileSync(oldSessionPath, '', 'utf8');
  writeNarsSessionStartedIndex({
    sessionStartedEvent: {
      event: 'session_started',
      session_id: oldSessionId,
      agent_id: 'launcher-e2e.resident',
      site_id: 'launcher-e2e',
      started_at: '2020-01-01T00:00:00.000Z',
      site_root: siteRoot,
      runtime: 'narada-agent-runtime-server',
      session_path: oldSessionPath,
    },
    sessionPath: oldSessionPath,
    siteRoot,
  });
  writeFileSync(registryPath, JSON.stringify({
    Agents: [{
      Agent: 'launcher-e2e.resident',
      Role: 'resident',
      Site: 'launcher-e2e',
      NaradaRoot: siteRoot,
      SiteRoot: siteRoot,
      WorkspaceRoot: siteRoot,
      LauncherPath: resolve(siteRoot, 'narada-launcher-e2e.ps1'),
      OperatorSurface: 'agent-web-ui',
      Runtime: 'narada-agent-runtime-server',
    }],
  }), 'utf8');

  try {
    const result = spawnSync('pwsh', [
      '-NoProfile',
      '-File', workspaceLauncher,
      '-All',
      '-Runtime', 'nars',
      '-OperatorSurface', 'agent-web-ui',
      '-IntelligenceProvider', 'kimi-code-api',
      '-Site', 'launcher-e2e',
      '-Role', 'resident',
      '-ConfigPath', registryPath,
      '-McpScope', 'none',
      '-NoWaitForEnterBeforeExec',
    ], {
      cwd: naradaProperRoot,
      encoding: 'utf8',
      timeout: 60_000,
      env: {
        ...process.env,
        NARADA_PROPER_ROOT: naradaProperRoot,
        NARADA_USER_SITE_ROOT: userSiteRoot,
        NARADA_OPERATOR_ROUTER_STATE_ROOT: routerStateRoot,
        NARADA_OPERATOR_ROUTER_PORT: '0',
        NARADA_NODE_EXECUTABLE: process.execPath,
        NARADA_NO_BROWSER: '1',
        KIMI_CODE_API_KEY: 'launcher-e2e-fixture-key',
        KIMI_CODE_API_BASE_URL: 'http://127.0.0.1:1',
        NARADA_WORKSPACE_LAUNCH_OBSERVATION_POLL_MS: '15000',
        NARADA_WORKSPACE_LAUNCH_OBSERVATION_POLL_INTERVAL_MS: '100',
        NARADA_WORKSPACE_LAUNCH_PROJECTION_READINESS_TIMEOUT_MS: '30000',
        NARADA_WORKSPACE_LAUNCH_HIDDEN_PROJECTION_LOG: resolve(fixtureRoot, 'projection.log'),
      },
    });

    assert.equal(result.status, 0, `stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
    const resultPathMatch = String(result.stdout).match(/Narada workspace launch started\. Result: ([^\r\n]+)/);
    assert.ok(resultPathMatch, `saved launch result path missing:\n${result.stdout}`);
    assert.equal(existsSync(resultPathMatch[1].trim()), true);
    savedResult = JSON.parse(readFileSync(resultPathMatch[1].trim(), 'utf8'));
    assert.equal(savedResult.status, 'launched');
    assert.equal(savedResult.mutation_performed, true);
    assert.equal(savedResult.selected_agents?.[0]?.agent, 'launcher-e2e.resident');
    assert.equal(savedResult.selected_agents?.[0]?.launch_operator_surface, 'agent-web-ui');
    assert.equal(savedResult.selected_agents?.[0]?.intelligence_provider, 'kimi-code-api');
    assert.equal(savedResult.attachment?.status, 'attached');
    assert.equal(savedResult.attachment?.exact_session, true);
    assert.equal(savedResult.hidden_runtime_launches?.length, 1);
    assert.equal(savedResult.hidden_projection_launches?.length, 1);
    assert.equal(savedResult.hidden_projection_launches?.[0]?.readiness, 'spawned_and_alive');
    assert.doesNotMatch(result.stderr, /narada_cli_dist_stale|source_hash_mismatch/i);

    const expectedLaunchSessionId = savedResult.selected_agents[0].launch_session_id;
    const existingSessionIds = new Set([oldSessionId]);
    launchedSession = await waitForLaunchedSession(siteRoot, expectedLaunchSessionId, existingSessionIds);
    assert.notEqual(launchedSession.session_id, oldSessionId);
    assert.equal(launchedSession.record?.agent_id, 'launcher-e2e.resident');
    assert.equal(launchedSession.record?.site_id, 'launcher-e2e');
    assert.equal(launchedSession.record?.runtime_kind, 'narada-agent-runtime-server');
    assert.equal(launchedSession.record?.launch_session_id, expectedLaunchSessionId);
    assert.notEqual(launchedSession.session_id, expectedLaunchSessionId);
    assert.equal(savedResult.hidden_projection_launches[0]?.nars_session_id, launchedSession.session_id);

    runtimePid = Number(launchedSession.pid ?? launchedSession.record?.process_ownership?.pid ?? savedResult.hidden_runtime_launches[0].pid);
    projectionPid = Number(savedResult.hidden_projection_launches[0].pid);
    controlPath = launchedSession.control_path
      ?? launchedSession.record?.control_path
      ?? resolve(siteRoot, '.narada', 'crew', 'nars-sessions', launchedSession.session_id, 'control.jsonl');
    assert.equal(existsSync(controlPath), true, `NARS control path was not materialized: ${controlPath}`);

    const readinessPath = savedResult.hidden_projection_launches[0].readiness_path;
    assert.equal(typeof readinessPath, 'string');
    const readiness = JSON.parse(readFileSync(readinessPath, 'utf8'));
    assert.equal(readiness.schema, 'narada.agent_web_ui.readiness.v1');
    assert.equal(readiness.status, 'ready');
    assert.equal(readiness.session_id, launchedSession.session_id);
    assert.equal(readiness.session_id, savedResult.hidden_projection_launches[0].nars_session_id);
    assert.notEqual(readiness.session_id, expectedLaunchSessionId);
    assert.equal(typeof readiness.health_endpoint, 'string');
    const projectionHealth = await fetch(readiness.health_endpoint);
    assert.equal(projectionHealth.status, 200);

    appendFileSync(controlPath, `${JSON.stringify({
      request_id: 'launcher-e2e-close',
      method: 'session.close',
      params: {},
    })}\n`, 'utf8');
    assert.match(readFileSync(controlPath, 'utf8'), /"method":"session\.close"/);
    await waitForSessionClosed(siteRoot, launchedSession.session_id);
    await waitForProcessExit(runtimePid);
  } finally {
    if (controlPath && existsSync(controlPath)) {
      appendFileSync(controlPath, `${JSON.stringify({
        request_id: 'launcher-e2e-finally-close',
        method: 'session.close',
        params: {},
      })}\n`, 'utf8');
    }
    await Promise.all([
      terminateProcessTreeAndWait(runtimePid),
      terminateProcessTreeAndWait(projectionPid),
    ]);
    await terminateFixtureProcesses(fixtureRoot);
    await removeFixtureRoot(fixtureRoot);
  }
});
