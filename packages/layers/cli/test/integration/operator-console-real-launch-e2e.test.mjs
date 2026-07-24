import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { buildCanonicalLocalTestSeed, canonicalSha256, CANONICAL_LOCAL_TEST_IDS } from '@narada2/invokable-intelligence-contract';
import { SqliteRegistryStore } from '@narada2/invokable-intelligence-registry';
import { discoverNarsSessions } from '@narada2/nars-session-core/session-index';
import { SiteRegistry, openRegistryDb, resolveRegistryDbPathByLocus } from '@narada2/windows-site';
import { ensureOperatorRouter, registerOperatorRouteSet } from '@narada2/operator-router';
import { createConsoleServer } from '../../dist/commands/console-server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const naradaProperRoot = resolve(__dirname, '..', '..', '..', '..', '..');
const workspaceLauncher = resolve(__dirname, '..', '..', 'src', 'assets', 'windows', 'Start-NaradaWorkspace.Dev.ps1');
// The canonical intelligence fixture is rooted at site:narada. Keep the
// temporary registry/site root isolated while using that canonical site id so
// the real runtime can resolve the seeded route without a test-only topology.
const SITE_ID = 'narada';
const AGENT_ID = `${SITE_ID}.resident`;
const FAILURE_SITE_ID = 'narada-missing-catalog';
const FAILURE_AGENT_ID = `${FAILURE_SITE_ID}.resident`;
const RUNTIME_FAILURE_SITE_ID = 'narada-runtime-failure';
const RUNTIME_FAILURE_AGENT_ID = `${RUNTIME_FAILURE_SITE_ID}.resident`;
const PROJECTION_FAILURE_SITE_ID = 'narada-projection-failure';
const PROJECTION_FAILURE_AGENT_ID = `${PROJECTION_FAILURE_SITE_ID}.resident`;

async function getFreePort(host = '127.0.0.1') {
  const server = createServer();
  try {
    await new Promise((resolve, reject) => {
      server.listen(0, host, () => resolve());
      server.once('error', reject);
    });
    const address = server.address();
    return address.port;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function waitForRouterUnavailable(url) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      await fetch(url + '/health', { signal: AbortSignal.timeout(250) });
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('operator_router_stop_timeout');
}

async function stopEnsuredRouter(owner) {
  if (!owner || owner.ownership !== 'started') return;
  if (owner.child && !owner.child.killed && owner.child.exitCode === null) owner.child.kill();
  await waitForRouterUnavailable(owner.url);
}

async function waitForOverviewAgent(url, predicate, timeoutMs = 45_000, siteId = SITE_ID, agentId = AGENT_ID) {
  const deadline = Date.now() + timeoutMs;
  let lastBody = null;
  while (Date.now() < deadline) {
    let body = null;
    try {
      const response = await fetch(`${url}/console/agents/api/overview`, {
        signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) throw new Error(`overview_http_${response.status}`);
      body = await response.json();
      lastBody = body;
    } catch {
      // Keep polling; the console server or overview read model may still be starting.
    }
    if (body?.status === 'refused') {
      throw new Error(`overview_refused:${JSON.stringify(body)}`);
    }
    if (body) {
      const agent = body.groups
        ?.flatMap((group) => group.sites)
        ?.find((site) => site.site_id === siteId)
        ?.agents.find((candidate) => candidate.agent_id === agentId);
      if (agent && predicate(agent)) return { body, agent };
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`overview_agent_timeout:${JSON.stringify(lastBody)}`);
}

function discoverAgentSessions(siteRoot) {
  return discoverNarsSessions({ siteRoot }).sessions
    .filter((session) => session.site_id === SITE_ID && session.agent_id === AGENT_ID);
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
      await rm(fixtureRoot, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
      return;
    } catch (error) {
      lastError = error;
      if (!['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(error?.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } while (Date.now() < deadline);
  throw new Error(`launcher_e2e_fixture_cleanup_timeout:${fixtureRoot}:${lastError?.code ?? 'unknown'}`);
}

async function seedRegistry(root, siteRoot, failureSiteRoot) {
  const runtimeFailureSiteRoot = join(root, 'runtime-failure-site-root');
  const projectionFailureSiteRoot = join(root, 'projection-failure-site-root');
  const userSiteRoot = join(root, 'Narada', '.registry');
  await mkdir(userSiteRoot, { recursive: true });
  process.env.NARADA_USER_SITE_ROOT = userSiteRoot;
  process.env.LOCALAPPDATA = root;
  const database = await openRegistryDb(resolveRegistryDbPathByLocus({ authorityLocus: 'user', variant: 'native' }));
  const registry = new SiteRegistry(database);
  const timestamp = new Date().toISOString();
  for (const site of [
    {
      siteId: SITE_ID,
      siteRoot,
      purpose: 'operator console real launch e2e',
    },
    {
      siteId: FAILURE_SITE_ID,
      siteRoot: failureSiteRoot,
      purpose: 'operator console real launch failure e2e',
    },
    {
      siteId: RUNTIME_FAILURE_SITE_ID,
      siteRoot: runtimeFailureSiteRoot,
      purpose: 'operator console runtime failure e2e',
    },
    {
      siteId: PROJECTION_FAILURE_SITE_ID,
      siteRoot: projectionFailureSiteRoot,
      purpose: 'operator console projection failure e2e',
    },
  ]) {
    registry.registerSite({
      siteId: site.siteId,
      variant: 'native',
      siteRoot: site.siteRoot,
      substrate: 'windows',
      aimJson: JSON.stringify({ purpose: site.purpose }),
      controlEndpoint: null,
      lastSeenAt: timestamp,
      createdAt: timestamp,
    });
  }
  database.close();
}

async function writeLaunchRegistry(root) {
  const userSiteRoot = process.env.NARADA_USER_SITE_ROOT ?? join(root, 'Narada', '.registry');
  const launchDir = join(userSiteRoot, 'config', 'launch');
  await mkdir(launchDir, { recursive: true });
  const siteRoot = join(root, 'site-root');
  const failureSiteRoot = join(root, 'missing-catalog-site-root');
  const runtimeFailureSiteRoot = join(root, 'runtime-failure-site-root');
  const projectionFailureSiteRoot = join(root, 'projection-failure-site-root');
  const escapedSiteRoot = siteRoot.replace(/\\/g, '\\\\');
  const escapedFailureSiteRoot = failureSiteRoot.replace(/\\/g, '\\\\');
  const escapedRuntimeFailureSiteRoot = runtimeFailureSiteRoot.replace(/\\/g, '\\\\');
  const escapedProjectionFailureSiteRoot = projectionFailureSiteRoot.replace(/\\/g, '\\\\');
  const psd1 = [
    '@{',
    '  Agents = @(',
    '    @{',
    `      Agent = "${AGENT_ID}"`,
    '      Title = "Operator Console Launch E2E Resident"',
    `      Site = "${SITE_ID}"`,
    `      NaradaRoot = "${escapedSiteRoot}"`,
    `      SiteRoot = "${escapedSiteRoot}"`,
    `      WorkspaceRoot = "${escapedSiteRoot}"`,
    '      Launcher = "launcher.ps1"',
    '      Runtime = "narada-agent-runtime-server"',
    '      McpScope = "none"',
    '      EnableNativeShell = $false',
    '    }',
    '    @{',
    `      Agent = "${RUNTIME_FAILURE_AGENT_ID}"`,
    '      Title = "Operator Console Runtime Failure E2E Resident"',
    `      Site = "${RUNTIME_FAILURE_SITE_ID}"`,
    `      NaradaRoot = "${escapedRuntimeFailureSiteRoot}"`,
    `      SiteRoot = "${escapedRuntimeFailureSiteRoot}"`,
    `      WorkspaceRoot = "${escapedRuntimeFailureSiteRoot}"`,
    '      Launcher = "launcher.ps1"',
    '      Runtime = "narada-agent-runtime-server"',
    '      McpScope = "none"',
    '      EnableNativeShell = $false',
    '    }',
    '    @{',
    `      Agent = "${PROJECTION_FAILURE_AGENT_ID}"`,
    '      Title = "Operator Console Projection Failure E2E Resident"',
    `      Site = "${PROJECTION_FAILURE_SITE_ID}"`,
    `      NaradaRoot = "${escapedProjectionFailureSiteRoot}"`,
    `      SiteRoot = "${escapedProjectionFailureSiteRoot}"`,
    `      WorkspaceRoot = "${escapedProjectionFailureSiteRoot}"`,
    '      Launcher = "launcher.ps1"',
    '      Runtime = "narada-agent-runtime-server"',
    '      McpScope = "none"',
    '      EnableNativeShell = $false',
    '    }',
    '    @{',
    `      Agent = "${FAILURE_AGENT_ID}"`,
    '      Title = "Operator Console Missing Catalog E2E Resident"',
    `      Site = "${FAILURE_SITE_ID}"`,
    `      NaradaRoot = "${escapedFailureSiteRoot}"`,
    `      SiteRoot = "${escapedFailureSiteRoot}"`,
    `      WorkspaceRoot = "${escapedFailureSiteRoot}"`,
    '      Launcher = "launcher.ps1"',
    '      Runtime = "narada-agent-runtime-server"',
    '      McpScope = "none"',
    '      EnableNativeShell = $false',
    '    }',
    '  )',
    '}',
    '',
  ].join('\n');
  await writeFile(join(launchDir, 'agents.psd1'), psd1, 'utf8');
  await writeFile(join(siteRoot, 'launcher.ps1'), '# Operator Console real launch E2E placeholder launcher\n', 'utf8');
  await writeFile(join(failureSiteRoot, 'launcher.ps1'), '# Operator Console real launch failure E2E placeholder launcher\n', 'utf8');
  await writeFile(join(runtimeFailureSiteRoot, 'launcher.ps1'), '# Operator Console runtime failure E2E placeholder launcher\n', 'utf8');
  await writeFile(join(projectionFailureSiteRoot, 'launcher.ps1'), '# Operator Console projection failure E2E placeholder launcher\n', 'utf8');
}

async function writeSiteMetadata(root) {
  const userSiteRoot = join(root, 'user-site-root');
  const siteRoot = join(root, 'site-root');
  const failureSiteRoot = join(root, 'missing-catalog-site-root');
  const runtimeFailureSiteRoot = join(root, 'runtime-failure-site-root');
  const projectionFailureSiteRoot = join(root, 'projection-failure-site-root');
  for (const site of [
    { siteRoot, siteId: SITE_ID, displayName: 'Operator Console Launch E2E' },
    { siteRoot: failureSiteRoot, siteId: FAILURE_SITE_ID, displayName: 'Operator Console Missing Catalog E2E' },
    { siteRoot: runtimeFailureSiteRoot, siteId: RUNTIME_FAILURE_SITE_ID, displayName: 'Operator Console Runtime Failure E2E' },
    { siteRoot: projectionFailureSiteRoot, siteId: PROJECTION_FAILURE_SITE_ID, displayName: 'Operator Console Projection Failure E2E' },
  ]) {
    const naradaDir = join(site.siteRoot, '.narada');
    await mkdir(naradaDir, { recursive: true });
    const metadata = {
      site_id: site.siteId,
      display_name: site.displayName,
      site_kind: 'site',
    };
    await writeFile(join(site.siteRoot, '.narada', 'site.json'), JSON.stringify(metadata), 'utf8');
    await writeFile(join(site.siteRoot, 'config.json'), JSON.stringify({ static_config: metadata }), 'utf8');
  }
  await mkdir(join(userSiteRoot, '.narada'), { recursive: true });
  await writeFile(join(userSiteRoot, '.narada', 'site.identity.json'), JSON.stringify({
    schema: 'narada.site.identity.v0',
    site_id: 'user',
  }), 'utf8');
  await writeFile(join(userSiteRoot, '.narada', 'intelligence-launch-context.json'), JSON.stringify({
    schema: 'narada.intelligence.launch_context.v1',
    user_site_id: CANONICAL_LOCAL_TEST_IDS.userSite,
    host_site_id: CANONICAL_LOCAL_TEST_IDS.hostSite,
    principal_id: CANONICAL_LOCAL_TEST_IDS.principal,
    principal_binding: {
      schema: 'narada.intelligence.principal_binding.v1',
      actor: {
        principal_id: CANONICAL_LOCAL_TEST_IDS.principal,
        auth_type: 'user-site-session',
      },
      memberships: [
        {
          registry: 'site-roster',
          site_id: CANONICAL_LOCAL_TEST_IDS.targetSite,
          role: 'resident',
          evidence_ref: 'evidence:operator-console-real-launch-e2e:principal-membership:narada',
        },
        {
          registry: 'site-roster',
          site_id: `site:${RUNTIME_FAILURE_SITE_ID}`,
          role: 'resident',
          evidence_ref: 'evidence:operator-console-real-launch-e2e:principal-membership:runtime-failure',
        },
        {
          registry: 'site-roster',
          site_id: `site:${PROJECTION_FAILURE_SITE_ID}`,
          role: 'resident',
          evidence_ref: 'evidence:operator-console-real-launch-e2e:principal-membership:projection-failure',
        },
        {
          registry: 'site-roster',
          site_id: `site:${FAILURE_SITE_ID}`,
          role: 'resident',
          evidence_ref: 'evidence:operator-console-real-launch-e2e:principal-membership:missing-catalog',
        },
      ],
      evidence_refs: [
        'evidence:operator-console-real-launch-e2e:principal-membership:narada',
        'evidence:operator-console-real-launch-e2e:principal-membership:runtime-failure',
        'evidence:operator-console-real-launch-e2e:principal-membership:projection-failure',
        'evidence:operator-console-real-launch-e2e:principal-membership:missing-catalog',
      ],
    },
  }), 'utf8');
}

async function writePrincipalRuntime(root) {
  const siteRoot = join(root, 'site-root');
  const failureSiteRoot = join(root, 'missing-catalog-site-root');
  const runtimeFailureSiteRoot = join(root, 'runtime-failure-site-root');
  const projectionFailureSiteRoot = join(root, 'projection-failure-site-root');
  const now = new Date().toISOString();
  for (const site of [
    { siteRoot, siteId: SITE_ID, agentId: AGENT_ID },
    { siteRoot: failureSiteRoot, siteId: FAILURE_SITE_ID, agentId: FAILURE_AGENT_ID },
    { siteRoot: runtimeFailureSiteRoot, siteId: RUNTIME_FAILURE_SITE_ID, agentId: RUNTIME_FAILURE_AGENT_ID },
    { siteRoot: projectionFailureSiteRoot, siteId: PROJECTION_FAILURE_SITE_ID, agentId: PROJECTION_FAILURE_AGENT_ID },
  ]) {
    const authorityRoot = join(site.siteRoot, '.narada');
    await writeFile(join(authorityRoot, '.principal-runtimes.json'), JSON.stringify([{
      runtime_id: `${site.siteId}-resident-runtime`,
      principal_id: site.agentId,
      principal_type: 'worker',
      state: 'available',
      scope_id: site.siteId,
      attachment_mode: null,
      state_changed_at: now,
      last_heartbeat_at: now,
      active_work_item_id: null,
      budget_remaining: null,
      budget_unit: null,
      detail: null,
    }]), 'utf8');
  }
}

async function seedIntelligenceCatalog(siteRoot, targetSiteId) {
  const aiRoot = join(siteRoot, '.ai');
  await mkdir(aiRoot, { recursive: true });
  const store = await SqliteRegistryStore.open(join(aiRoot, 'intelligence-registry.db'));
  try {
    const now = new Date();
    const seed = structuredClone(buildCanonicalLocalTestSeed({
      endpointBaseUrl: 'http://127.0.0.1:1',
      adapterProtocol: { family: 'openai', operation: 'chat-completions', version: '1' },
      credentialStore: 'env',
      credentialReference: 'KIMI_CODE_API_KEY',
      now: now.toISOString(),
      validUntil: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    }));
    for (const record of seed.records) {
      record.document = rewriteCanonicalProvider(record.document, 'kimi-code-api', targetSiteId);
      record.authority = rewriteCanonicalProvider(record.authority, 'kimi-code-api', targetSiteId);
      record.record_id = record.document.id;
      record.source.digest = canonicalSha256(record.document);
    }
    await store.loadCatalogSeed(seed);
  } finally {
    await store.close();
  }
}

function rewriteCanonicalProvider(value, providerId, targetSiteId) {
  if (typeof value === 'string') {
    if (value === 'inference-provider:remote-api') return `inference-provider:${providerId}`;
    if (!targetSiteId) return value;
    const targetResourceId = `site:${targetSiteId}`;
    if (value === CANONICAL_LOCAL_TEST_IDS.targetSite) return targetResourceId;
    if (value === 'authority:site:narada') return `authority:${targetResourceId}`;
    if (value === 'authority:site:narada:canonical-fixture') return `authority:${targetResourceId}:canonical-fixture`;
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => rewriteCanonicalProvider(entry, providerId, targetSiteId));
  if (!value || typeof value !== 'object') return value;
  const rewritten = Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, rewriteCanonicalProvider(entry, providerId, targetSiteId)]),
  );
  if (rewritten.schema === 'narada.invokable-intelligence.adapter.v1') {
    rewritten.protocol = { family: 'openai', operation: 'chat-completions', version: '1' };
  }
  if (rewritten.schema === 'narada.invokable-intelligence.invocation-route-candidate.v1') {
    rewritten.topology.nodes = rewritten.topology.nodes.map((node) => ({ ...node, required_feasibility: [] }));
    rewritten.topology.edges = rewritten.topology.edges.map((edge) => ({ ...edge, required_feasibility: [] }));
  }
  if (rewritten.schema === 'narada.invokable-intelligence.access-grant.v1') {
    rewritten.scope = {
      ...rewritten.scope,
      purposes: [...new Set([...rewritten.scope.purposes, 'agent-session'])],
    };
  }
  if (rewritten.schema === 'narada.invokable-intelligence.data-governance-requirement.v1') {
    rewritten.purposes = [...new Set([...rewritten.purposes, 'agent-session'])];
  }
  return rewritten;
}

async function statPath(path) {
  try {
    const { stat } = await import('node:fs/promises');
    const info = await stat(path);
    return info.isFile();
  } catch {
    return false;
  }
}

test('Operator Console launches a stopped agent into a real NARS session and routed Web UI', { skip: process.platform !== 'win32' }, async () => {
  assert.equal(process.platform, 'win32');
  assert.equal(await statPath(workspaceLauncher), true, `User Site launcher not found: ${workspaceLauncher}`);

  const previousLocalAppData = process.env.LOCALAPPDATA;
  const previousUserSiteRoot = process.env.NARADA_USER_SITE_ROOT;
  const previousRouterStateRoot = process.env.NARADA_OPERATOR_ROUTER_STATE_ROOT;
  const previousRouterPort = process.env.NARADA_OPERATOR_ROUTER_PORT;
  const previousProperRoot = process.env.NARADA_PROPER_ROOT;
  const previousNodeExecutable = process.env.NARADA_NODE_EXECUTABLE;
  const previousNoBrowser = process.env.NARADA_NO_BROWSER;
  const previousApiKey = process.env.KIMI_CODE_API_KEY;
  const previousApiBaseUrl = process.env.KIMI_CODE_API_BASE_URL;
  const previousIntelligenceRegistryDb = process.env.NARADA_INTELLIGENCE_REGISTRY_DB;
  const previousIntelligenceTargetSite = process.env.NARADA_INTELLIGENCE_TARGET_SITE;
  const previousIntelligenceUserSite = process.env.NARADA_INTELLIGENCE_USER_SITE;
  const previousIntelligenceHostSite = process.env.NARADA_INTELLIGENCE_HOST_SITE;
  const previousIntelligencePrincipalId = process.env.NARADA_INTELLIGENCE_PRINCIPAL_ID;
  const previousIntelligenceContextPath = process.env.NARADA_INTELLIGENCE_CONTEXT_PATH;

  const fixtureRoot = await mkdtemp(join(tmpdir(), 'operator-console-real-launch-'));
  const siteRoot = join(fixtureRoot, 'site-root');
  const failureSiteRoot = join(fixtureRoot, 'missing-catalog-site-root');
  const runtimeFailureSiteRoot = join(fixtureRoot, 'runtime-failure-site-root');
  const projectionFailureSiteRoot = join(fixtureRoot, 'projection-failure-site-root');
  const routerStateRoot = join(fixtureRoot, 'operator-router-state');
  let routerOwner = null;
  let consoleServer = null;
  let consoleRouteSet = null;
  let browser = null;
  let sessionId = null;
  let controlPath = null;

  try {
    await mkdir(siteRoot, { recursive: true });
    await mkdir(routerStateRoot, { recursive: true });
    await writeSiteMetadata(fixtureRoot);
    await writePrincipalRuntime(fixtureRoot);
    await seedIntelligenceCatalog(siteRoot, SITE_ID);
    await seedIntelligenceCatalog(runtimeFailureSiteRoot, RUNTIME_FAILURE_SITE_ID);
    await seedIntelligenceCatalog(projectionFailureSiteRoot, PROJECTION_FAILURE_SITE_ID);
    await seedRegistry(fixtureRoot, siteRoot, failureSiteRoot);
    await writeLaunchRegistry(fixtureRoot);

    process.env.NARADA_PROPER_ROOT = naradaProperRoot;
    process.env.NARADA_NODE_EXECUTABLE = process.execPath;
    process.env.NARADA_NO_BROWSER = '1';
    process.env.NARADA_INTELLIGENCE_CONTEXT_PATH = join(
      fixtureRoot,
      'user-site-root',
      '.narada',
      'intelligence-launch-context.json',
    );
    process.env.KIMI_CODE_API_KEY = 'launcher-e2e-fixture-key';
    process.env.KIMI_CODE_API_BASE_URL = 'http://127.0.0.1:1';
    for (const name of [
      'NARADA_INTELLIGENCE_REGISTRY_DB',
      'NARADA_INTELLIGENCE_TARGET_SITE',
      'NARADA_INTELLIGENCE_USER_SITE',
      'NARADA_INTELLIGENCE_HOST_SITE',
      'NARADA_INTELLIGENCE_PRINCIPAL_ID',
    ]) delete process.env[name];
    process.env.NARADA_OPERATOR_ROUTER_STATE_ROOT = routerStateRoot;
    process.env.NARADA_WORKSPACE_LAUNCH_OBSERVATION_POLL_MS = '15000';
    process.env.NARADA_WORKSPACE_LAUNCH_OBSERVATION_POLL_INTERVAL_MS = '100';
    process.env.NARADA_WORKSPACE_LAUNCH_PROJECTION_READINESS_TIMEOUT_MS = '30000';

    const routerPort = await getFreePort('127.0.0.1');
    routerOwner = await ensureOperatorRouter({
      host: '127.0.0.1',
      port: routerPort,
      state_root: routerStateRoot,
      timeout_ms: 10_000,
    });
    assert.equal(routerOwner.ownership, 'started');
    assert.ok(routerOwner.child);
    const routerUrl = routerOwner.url;
    process.env.NARADA_OPERATOR_ROUTER_PORT = String(routerPort);

    consoleServer = await createConsoleServer({
      host: '127.0.0.1',
      port: 0,
      ingressMode: 'router',
      operatorRouterUrl: routerUrl,
    });
    const consoleUrl = await consoleServer.start();

    const consoleOwnerId = `operator-console:operator-console-real-launch-e2e:${process.pid}`;
    const consoleInstanceNonce = randomUUID().replace(/-/g, '');
    consoleRouteSet = await registerOperatorRouteSet({
      admin: { url: routerUrl, registration_token: routerOwner.registration_token },
      renew_interval_ms: 10_000,
      routes: [{
        route_id: 'operator-console',
        route_class: 'operator-console',
        public_path: '/',
        route_mode: 'prefix',
        target_url: consoleUrl,
        health_url: `${consoleUrl}/health`,
        owner_id: consoleOwnerId,
        process_evidence: { instance_nonce: consoleInstanceNonce, pid: process.pid, started_at: new Date().toISOString() },
        protocols: ['http'],
        methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
        timeout_ms: 120_000,
        lease_ms: 60_000,
        reconstruction: { kind: 'explicit', site_root: null, site_id: null, session_id: null },
      }],
    });

    const initialOverview = await waitForOverviewAgent(routerUrl, (agent) => agent.runtime.state === 'stopped');
    assert.equal(initialOverview.agent.agent_id, AGENT_ID);
    assert.equal(initialOverview.agent.actions.start, true);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(routerUrl + '/console/agents', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { level: 2, name: 'Sites and Agents' }).waitFor();
    const siteBox = page.locator(`.site-box[data-site-id="${SITE_ID}"]`);
    const siteBoxDetails = await page.locator('.site-box').evaluateAll((elements) => elements.map((element) => ({
      site_id: element.getAttribute('data-site-id'),
      text: element.textContent?.replace(/\s+/g, ' ').trim(),
    })));
    assert.equal(await siteBox.count(), 1, JSON.stringify(siteBoxDetails));
    const agentButton = siteBox.getByRole('button', { name: `${AGENT_ID}: stopped, work available` });
    await agentButton.waitFor();

    const preClickOverview = await waitForOverviewAgent(routerUrl, (agent) =>
      agent.runtime.state === 'stopped'
      && agent.runtime.session_count === 0
      && (agent.runtime.healthy_session_ids ?? []).length === 0,
    );
    assert.equal(preClickOverview.agent.actions.start, true);
    assert.deepEqual(
      discoverAgentSessions(siteRoot),
      [],
      'the agent must have no NARS session before the browser click',
    );

    const launchRequestPromise = page.waitForRequest((request) =>
      request.url() === `${routerUrl}/console/agents/api/launch` && request.method() === 'POST');
    const launchResponsePromise = page.waitForResponse((response) =>
      response.url() === `${routerUrl}/console/agents/api/launch` && response.request().method() === 'POST',
      { timeout: 120_000 });
    const popupPromise = page.waitForEvent('popup');
    const concurrentLaunchResponsePromise = page.evaluate(async ({ baseUrl, siteId, agentId }) => {
      const response = await fetch(`${baseUrl}/console/agents/api/launch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ site_id: siteId, agent_id: agentId }),
      });
      return { status: response.status, body: await response.json() };
    }, { baseUrl: routerUrl, siteId: SITE_ID, agentId: AGENT_ID });

    await agentButton.click();
    const launchRequest = await launchRequestPromise;
    assert.deepEqual(launchRequest.postDataJSON(), {
      site_id: SITE_ID,
      agent_id: AGENT_ID,
    });
    const launchResponse = await launchResponsePromise;
    assert.equal(launchResponse.status(), 200);
    const launchBody = await launchResponse.json();
    assert.ok(['launched', 'reused'].includes(launchBody.status));
    assert.ok(typeof launchBody.session_id === 'string' && launchBody.session_id.length > 0);
    const concurrentLaunch = await concurrentLaunchResponsePromise;
    assert.equal(concurrentLaunch.status, 200, JSON.stringify(concurrentLaunch.body));
    assert.ok(['launched', 'reused'].includes(concurrentLaunch.body.status));
    assert.equal(concurrentLaunch.body.session_id, launchBody.session_id);
    assert.ok(
      launchBody.status === 'launched' || concurrentLaunch.body.status === 'launched',
      'at least one concurrent browser request must perform the launch',
    );

    const popup = await popupPromise;
    await popup.waitForFunction(() => !window.location.href.startsWith('about:blank'), { timeout: 60_000 });
    const popupUrlPattern = new RegExp(`^${routerUrl.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}/sessions/`);
    await popup.waitForURL(popupUrlPattern, { timeout: 60_000 });
    await popup.waitForLoadState('domcontentloaded');
    const popupTitle = await popup.title();
    assert.match(popupTitle, /Narada Agent Web UI|Starting/);

    const runningOverview = await waitForOverviewAgent(routerUrl, (agent) => agent.runtime.state === 'running' && Boolean(agent.runtime.selected_session_id));
    assert.equal(runningOverview.agent.agent_id, AGENT_ID);
    assert.equal(runningOverview.agent.actions.inspect, true);
    sessionId = runningOverview.agent.runtime.selected_session_id;
    assert.ok(sessionId);
    assert.equal(launchBody.session_id, sessionId);
    const launchedSessions = discoverAgentSessions(siteRoot);
    const launchedSession = launchedSessions.find((session) => session.session_id === sessionId);
    assert.ok(launchedSession, `no NARS session observed for ${AGENT_ID}: ${JSON.stringify(launchedSessions)}`);
    assert.equal(launchedSession.site_id, SITE_ID);
    assert.equal(launchedSession.agent_id, AGENT_ID);
    assert.match(popup.url(), new RegExp(`/sessions/${sessionId}$`));

    const routeDirectoryResponse = await fetch(`${routerUrl}/routes`);
    assert.equal(routeDirectoryResponse.status, 200);
    const routeDirectory = await routeDirectoryResponse.json();
    const sessionRoute = routeDirectory.routes.find((route) =>
      route.route_class === 'agent-web-ui'
      && route.session_id === sessionId
      && route.state === 'healthy');
    assert.ok(sessionRoute, `no healthy route for session ${sessionId}`);

    controlPath = join(siteRoot, '.narada', 'crew', 'nars-sessions', sessionId, 'control.jsonl');

    const failureOverview = await waitForOverviewAgent(
      routerUrl,
      (agent) => agent.runtime.state === 'stopped' && agent.runtime.session_count === 0,
      45_000,
      FAILURE_SITE_ID,
      FAILURE_AGENT_ID,
    );
    assert.equal(failureOverview.agent.agent_id, FAILURE_AGENT_ID);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const failedLaunchButton = page.locator('.site-box')
      .filter({ hasText: 'Operator Console Missing Catalog E2E' })
      .getByRole('button', { name: `${FAILURE_AGENT_ID}: stopped, work available` });
    await failedLaunchButton.waitFor();

    const failedLaunchResponse = page.waitForResponse((response) =>
      response.url() === `${routerUrl}/console/agents/api/launch` && response.request().method() === 'POST',
      { timeout: 20_000 });
    await failedLaunchButton.click();
    const failureResponse = await failedLaunchResponse;
    const failureBody = await failureResponse.json();
    assert.equal(failureResponse.status(), 500, JSON.stringify(failureBody));
    assert.equal(failureBody.status, 'failed');
    assert.equal(failureBody.reason, 'workspace_launch_exception');
    assert.match(failureBody.failure?.message, /intelligence_catalog_missing/);
    assert.match(failureBody.failure?.message, /intelligence_registry_not_initialized/);
    assert.equal(failureBody.session_id, null);
    assert.ok(typeof failureBody.failure?.diagnostic_ref === 'string');
    const failureArtifact = JSON.parse(await readFile(failureBody.failure.diagnostic_ref, 'utf8'));
    assert.equal(failureArtifact.schema, 'narada.operator_console.agent_launch_failure.v1');
    assert.equal(failureArtifact.failure.code, failureBody.reason);
    assert.equal(failureArtifact.failure.phase, 'workspace_launch');
    assert.equal(failureArtifact.request_id, failureBody.request_id);
    assert.equal(
      discoverNarsSessions({ siteRoot: failureSiteRoot }).sessions.length,
      0,
      'a catalog-preflight failure must not create a session or attach an old one',
    );
    assert.equal(
      discoverAgentSessions(siteRoot).some((session) => session.display_state === 'running'),
      false,
      'a failed launch for another Site must not affect the healthy session',
    );

    const runtimeFailureOverview = await waitForOverviewAgent(
      routerUrl,
      (agent) => agent.runtime.state === 'stopped' && agent.runtime.session_count === 0,
      45_000,
      RUNTIME_FAILURE_SITE_ID,
      RUNTIME_FAILURE_AGENT_ID,
    );
    assert.equal(runtimeFailureOverview.agent.agent_id, RUNTIME_FAILURE_AGENT_ID);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const runtimeFailureButton = page.locator(`.site-box[data-site-id="${RUNTIME_FAILURE_SITE_ID}"]`)
      .getByRole('button', { name: `${RUNTIME_FAILURE_AGENT_ID}: stopped, work available` });
    await runtimeFailureButton.waitFor();

    const validNaradaProperRoot = process.env.NARADA_PROPER_ROOT;
    try {
      process.env.NARADA_PROPER_ROOT = join(fixtureRoot, 'missing-narada-proper-root');
      const runtimeFailureResponsePromise = page.waitForResponse((response) =>
        response.url() === `${routerUrl}/console/agents/api/launch` && response.request().method() === 'POST',
        { timeout: 60_000 });
      await runtimeFailureButton.click();
      const runtimeFailureResponse = await runtimeFailureResponsePromise;
      const runtimeFailureBody = await runtimeFailureResponse.json();
      assert.equal(runtimeFailureResponse.status(), 500, JSON.stringify(runtimeFailureBody));
      assert.equal(runtimeFailureBody.status, 'failed');
      assert.equal(runtimeFailureBody.reason, 'workspace_launch_exception');
      assert.match(runtimeFailureBody.failure?.message, /session_not_indexed|workspace_launch_attachment_not_ready|workspace_launch_runtime_entrypoint_missing/);
      assert.equal(runtimeFailureBody.session_id, null);
      assert.ok(typeof runtimeFailureBody.failure?.diagnostic_ref === 'string');
      const runtimeFailureArtifact = JSON.parse(await readFile(runtimeFailureBody.failure.diagnostic_ref, 'utf8'));
      assert.equal(runtimeFailureArtifact.failure.phase, 'workspace_launch');
      assert.equal(runtimeFailureArtifact.request_id, runtimeFailureBody.request_id);
      assert.equal(
        discoverNarsSessions({ siteRoot: runtimeFailureSiteRoot }).sessions.length,
        0,
        'a runtime child that never indexes a session must not be attachable',
      );
    } finally {
      if (validNaradaProperRoot === undefined) delete process.env.NARADA_PROPER_ROOT;
      else process.env.NARADA_PROPER_ROOT = validNaradaProperRoot;
    }

    const projectionFailureOverview = await waitForOverviewAgent(
      routerUrl,
      (agent) => agent.runtime.state === 'stopped' && agent.runtime.session_count === 0,
      45_000,
      PROJECTION_FAILURE_SITE_ID,
      PROJECTION_FAILURE_AGENT_ID,
    );
    assert.equal(projectionFailureOverview.agent.agent_id, PROJECTION_FAILURE_AGENT_ID);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const projectionFailureButton = page.locator(`.site-box[data-site-id="${PROJECTION_FAILURE_SITE_ID}"]`)
      .getByRole('button', { name: `${PROJECTION_FAILURE_AGENT_ID}: stopped, work available` });
    await projectionFailureButton.waitFor();
    const projectionBindingDirectory = join(projectionFailureSiteRoot, '.ai', 'runtime', 'operator-projection-launch-bindings');
    const readinessFailureInjection = (async () => {
      const deadline = Date.now() + 60_000;
      while (Date.now() <= deadline) {
        const entries = await readdir(projectionBindingDirectory).catch(() => []);
        const bindingName = entries.find((entry) => entry.endsWith('.json') && !entry.endsWith('.ready.json'));
        if (bindingName) {
          const bindingPath = join(projectionBindingDirectory, bindingName);
          const binding = JSON.parse(await readFile(bindingPath, 'utf8').catch(() => '{}'));
          if (binding.status === 'ready' || binding.status === 'waiting_for_agent_start') {
            const launchSessionId = typeof binding.launch_session_id === 'string' ? binding.launch_session_id : null;
            const candidate = launchSessionId
              ? discoverNarsSessions({ siteRoot: projectionFailureSiteRoot }).sessions.find((session) =>
                session.launch_session_id === launchSessionId
                && session.display_state !== 'closed'
                && session.terminal_state !== 'closed',
              )
              : null;
            if (candidate?.health_endpoint) {
              const healthResponse = await fetch(candidate.health_endpoint).catch(() => null);
              const health = healthResponse?.ok ? await healthResponse.json().catch(() => null) : null;
              if (health?.status === 'healthy' && health.session_id === candidate.session_id) {
                await mkdir(join(projectionBindingDirectory, `${bindingName}.ready.json`), { recursive: true });
                return bindingName;
              }
            }
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error('projection_failure_fixture_binding_not_materialized');
    })();
    try {
      const projectionFailureResponsePromise = page.waitForResponse((response) =>
        response.url() === `${routerUrl}/console/agents/api/launch` && response.request().method() === 'POST',
        { timeout: 60_000 });
      await projectionFailureButton.click();
      await readinessFailureInjection;
      const projectionFailureResponse = await projectionFailureResponsePromise;
      const projectionFailureBody = await projectionFailureResponse.json();
      assert.equal(projectionFailureResponse.status(), 500, JSON.stringify(projectionFailureBody));
      assert.equal(projectionFailureBody.status, 'failed');
      assert.equal(projectionFailureBody.reason, 'workspace_launch_exception');
      assert.match(projectionFailureBody.failure?.message, /ENOENT|not found|workspace_launch_projection/);
      assert.equal(projectionFailureBody.session_id, null);
      assert.ok(typeof projectionFailureBody.failure?.diagnostic_ref === 'string');
      const projectionFailureArtifact = JSON.parse(await readFile(projectionFailureBody.failure.diagnostic_ref, 'utf8'));
      assert.equal(projectionFailureArtifact.failure.phase, 'workspace_launch');
      assert.equal(projectionFailureArtifact.request_id, projectionFailureBody.request_id);
      const workspaceResultPath = projectionFailureArtifact.context?.workspace_result_path;
      assert.ok(typeof workspaceResultPath === 'string' && workspaceResultPath.length > 0);
      const workspaceFailure = JSON.parse(await readFile(workspaceResultPath, 'utf8'));
      assert.equal(workspaceFailure.failure.stage, 'projection_start');
      assert.equal(workspaceFailure.failure.attachment.status, 'attached');
      assert.equal(workspaceFailure.failure.attachment.exact_session, true);
      const attachedProjectionSession = workspaceFailure.failure.attachment.sessions.find(
        (session) => session.site_root === projectionFailureSiteRoot,
      );
      assert.ok(attachedProjectionSession);
      assert.ok(typeof attachedProjectionSession.session_id === 'string' && attachedProjectionSession.session_id.length > 0);
      assert.equal(attachedProjectionSession.health_session_id, attachedProjectionSession.session_id);
      assert.equal(attachedProjectionSession.health_identity_match, true);
      assert.equal(
        discoverNarsSessions({ siteRoot: projectionFailureSiteRoot }).sessions
          .some((session) => session.display_state === 'running'),
        false,
        'projection readiness failure must roll back its runtime child',
      );
    } finally {
      await readinessFailureInjection.catch(() => undefined);
    }
  } finally {
    await browser?.close();
    if (sessionId) {
      try {
        await writeFile(controlPath, `${JSON.stringify({
          request_id: 'operator-console-real-launch-e2e-close',
          method: 'session.close',
          params: {},
        })}
`, { flag: 'a' });
      } catch {
        // Best-effort graceful close.
      }
      try {
        await waitForSessionClosed(siteRoot, sessionId);
      } catch {
        // Cleanup continues with hard termination below.
      }
    }
    await terminateFixtureProcesses(fixtureRoot);
    if (consoleRouteSet) {
      try {
        await consoleRouteSet.stop();
      } catch {
        // Cleanup continues even if route unregistration races with router shutdown.
      }
    }
    await consoleServer?.stop();
    await stopEnsuredRouter(routerOwner);
    await removeFixtureRoot(fixtureRoot);

    if (previousLocalAppData === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = previousLocalAppData;
    if (previousUserSiteRoot === undefined) delete process.env.NARADA_USER_SITE_ROOT;
    else process.env.NARADA_USER_SITE_ROOT = previousUserSiteRoot;
    if (previousRouterStateRoot === undefined) delete process.env.NARADA_OPERATOR_ROUTER_STATE_ROOT;
    else process.env.NARADA_OPERATOR_ROUTER_STATE_ROOT = previousRouterStateRoot;
    if (previousRouterPort === undefined) delete process.env.NARADA_OPERATOR_ROUTER_PORT;
    else process.env.NARADA_OPERATOR_ROUTER_PORT = previousRouterPort;
    if (previousProperRoot === undefined) delete process.env.NARADA_PROPER_ROOT;
    else process.env.NARADA_PROPER_ROOT = previousProperRoot;
    if (previousNodeExecutable === undefined) delete process.env.NARADA_NODE_EXECUTABLE;
    else process.env.NARADA_NODE_EXECUTABLE = previousNodeExecutable;
    if (previousNoBrowser === undefined) delete process.env.NARADA_NO_BROWSER;
    else process.env.NARADA_NO_BROWSER = previousNoBrowser;
    if (previousApiKey === undefined) delete process.env.KIMI_CODE_API_KEY;
    else process.env.KIMI_CODE_API_KEY = previousApiKey;
    if (previousApiBaseUrl === undefined) delete process.env.KIMI_CODE_API_BASE_URL;
    else process.env.KIMI_CODE_API_BASE_URL = previousApiBaseUrl;
    if (previousIntelligenceRegistryDb === undefined) delete process.env.NARADA_INTELLIGENCE_REGISTRY_DB;
    else process.env.NARADA_INTELLIGENCE_REGISTRY_DB = previousIntelligenceRegistryDb;
    if (previousIntelligenceTargetSite === undefined) delete process.env.NARADA_INTELLIGENCE_TARGET_SITE;
    else process.env.NARADA_INTELLIGENCE_TARGET_SITE = previousIntelligenceTargetSite;
    if (previousIntelligenceUserSite === undefined) delete process.env.NARADA_INTELLIGENCE_USER_SITE;
    else process.env.NARADA_INTELLIGENCE_USER_SITE = previousIntelligenceUserSite;
    if (previousIntelligenceHostSite === undefined) delete process.env.NARADA_INTELLIGENCE_HOST_SITE;
    else process.env.NARADA_INTELLIGENCE_HOST_SITE = previousIntelligenceHostSite;
    if (previousIntelligencePrincipalId === undefined) delete process.env.NARADA_INTELLIGENCE_PRINCIPAL_ID;
    else process.env.NARADA_INTELLIGENCE_PRINCIPAL_ID = previousIntelligencePrincipalId;
    if (previousIntelligenceContextPath === undefined) delete process.env.NARADA_INTELLIGENCE_CONTEXT_PATH;
    else process.env.NARADA_INTELLIGENCE_CONTEXT_PATH = previousIntelligenceContextPath;
  }
});
