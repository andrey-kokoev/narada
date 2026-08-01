import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { chromium } from '@playwright/test';
import { SiteRegistry, openRegistryDb, resolveRegistryDbPathByLocus } from '@narada-core/windows-site';
import { resolveNaradaSitePaths } from '@narada-core/site-paths';
import { createConsoleServer } from '../../dist/commands/console-server.js';
import { createSiteAgentAdmissionGateway } from '../../dist/commands/site-agent-admission-gateway.js';
import { createSiteAgentLaunchGateway } from '../../dist/commands/site-agent-launch-gateway.js';
import { createSiteAgentLifecycleGateway } from '../../dist/commands/site-agent-lifecycle-gateway.js';
import { readWorkspaceLaunchRecords } from '../../dist/commands/workspace-launch-registry.js';

/**
 * Evidence posture: partial-production-launch. The Console, browser, gates,
 * registries, and child-process boundary are real; the launcher command is a
 * deterministic injected fixture. The real workspace-launch path is covered
 * by operator-console-real-launch-e2e.test.ts.
 */
const SITE_ID = 'narada';
const SITE_DISPLAY_NAME = 'Operator Console Agent Lifecycle E2E';
const RESIDENT_AGENT_ID = SITE_ID + '.resident';
const ADMITTED_AGENT_ID = SITE_ID + '.builder';

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForChildExit(child, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await delay(50);
  }
  throw new Error('lifecycle_e2e_child_exit_timeout:' + String(child.pid));
}

async function terminateChild(child) {
  if (!child || (child.exitCode !== null && child.signalCode !== null)) return;
  if (child.exitCode === null && child.signalCode === null) {
    try {
      child.kill();
    } catch {
      // Cleanup is best effort if the child has already exited.
    }
  }
  try {
    await waitForChildExit(child);
  } catch {
    // The test assertion owns the lifecycle result; cleanup must not mask it.
  }
}

async function seedSiteRegistry(siteRoot) {
  const database = await openRegistryDb(resolveRegistryDbPathByLocus({
    authorityLocus: 'user',
    variant: 'native',
  }));
  const registry = new SiteRegistry(database);
  const timestamp = new Date().toISOString();
  registry.registerSite({
    siteId: SITE_ID,
    variant: 'native',
    siteRoot,
    substrate: 'windows',
    aimJson: JSON.stringify({ purpose: 'operator console agent lifecycle e2e' }),
    controlEndpoint: null,
    lastSeenAt: timestamp,
    createdAt: timestamp,
  });
  database.close();
}

async function writeFixture(userSiteRoot, siteRoot) {
  await mkdir(join(userSiteRoot, 'config', 'launch'), { recursive: true });
  await mkdir(join(siteRoot, '.narada'), { recursive: true });
  await writeFile(
    join(siteRoot, '.narada', 'site.json'),
    JSON.stringify({
      site_id: SITE_ID,
      display_name: SITE_DISPLAY_NAME,
      site_kind: 'site',
    }),
    'utf8',
  );
  await writeFile(
    join(siteRoot, 'config.json'),
    JSON.stringify({
      static_config: {
        site_id: SITE_ID,
        display_name: SITE_DISPLAY_NAME,
        site_kind: 'site',
      },
    }),
    'utf8',
  );
  const escapedSiteRoot = siteRoot.replace(/\\/g, '\\\\');
  const launchRegistry = [
    '@{',
    '  Agents = @(',
    '    @{',
    '      Agent = "' + RESIDENT_AGENT_ID + '"',
    '      Title = "Lifecycle E2E Resident"',
    '      Role = "resident"',
    '      Site = "' + SITE_ID + '"',
    '      NaradaRoot = "' + escapedSiteRoot + '"',
    '      SiteRoot = "' + escapedSiteRoot + '"',
    '      WorkspaceRoot = "' + escapedSiteRoot + '"',
    '      Launcher = "launcher.ps1"',
    '      LauncherPath = "' + escapedSiteRoot + '\\\\launcher.ps1"',
    '      OperatorSurface = "agent-cli"',
    '      Runtime = "narada-agent-runtime-server"',
    '      McpScope = "none"',
    '      EnableNativeShell = $false',
    '    }',
    '  )',
    '}',
    '',
  ].join('\n');
  await writeFile(
    join(userSiteRoot, 'config', 'launch', 'agents.psd1'),
    launchRegistry,
    'utf8',
  );
  await writeFile(
    join(siteRoot, 'launcher.ps1'),
    '# Deterministic launcher fixture; the test injects the launch boundary.\n',
    'utf8',
  );
}

function makeOverview(readRecords, runtimeByAgent) {
  return {
    async read() {
      const loaded = await readRecords({ all: true });
      const agents = loaded.records
        .filter((record) => record.site.toLowerCase() === SITE_ID)
        .map((record) => {
          const runtimeRecord = runtimeByAgent.get(record.agent);
          const running = runtimeRecord?.state === 'running';
          const localAgentId = record.agent_identity_ref?.local_agent_id
            ?? record.agent.slice(record.agent.indexOf('.') + 1);
          const surfaceChoices = [
            { kind: 'agent-web-ui', label: 'Web UI', status: 'available', reason: null },
            { kind: 'agent-cli', label: 'CLI', status: 'available', reason: null },
            { kind: 'agent-tui', label: 'TUI', status: 'available', reason: null },
          ];
          return {
            agent_id: record.agent,
            local_agent_id: localAgentId,
            title: record.title,
            role: record.role,
            admission_status: 'admitted',
            runtime: {
              state: running ? 'running' : 'stopped',
              session_count: running ? 1 : 0,
              healthy_session_ids: running ? [runtimeRecord.sessionId] : [],
              selected_session_id: running ? runtimeRecord.sessionId : null,
            },
            work: {
              state: 'available',
              detail: null,
              source: 'principal-runtime',
            },
            operator_surfaces: {
              default_kind: record.operator_surface,
              choices: surfaceChoices,
            },
            actions: {
              start: !running,
              inspect: running,
              inspect_reason: running ? null : 'agent_stopped',
            },
          };
        });
      return {
        schema: 'narada.operator_console.site_agent_overview.v1',
        status: 'success',
        generated_at: new Date().toISOString(),
        groups: [{
          id: 'sites',
          label: 'Sites',
          sites: [{
            site_id: SITE_ID,
            display_name: SITE_DISPLAY_NAME,
            site_kind: 'site',
            classification_source: 'declared',
            group_id: 'sites',
            observation_status: 'available',
            agents,
          }],
        }],
        refusals: [],
      };
    },
  };
}

test(
  '[partial-production-launch] Operator Console admits, launches, stops, and deletes a Site agent through the live UI',
  { skip: process.platform !== 'win32' },
  async () => {
    const previousEnvironment = {
      LOCALAPPDATA: process.env.LOCALAPPDATA,
      NARADA_USER_SITE_ROOT: process.env.NARADA_USER_SITE_ROOT,
    };
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'operator-console-agent-lifecycle-'));
    const userSiteRoot = join(fixtureRoot, 'user-site-root');
    const siteRoot = join(fixtureRoot, 'site-root');
    let consoleServer = null;
    let browser = null;
    const children = new Set();
    const runtimeByAgent = new Map();
    const readRecords = (options) => readWorkspaceLaunchRecords(options);
    const controlPaths = new Map();

    try {
      process.env.LOCALAPPDATA = fixtureRoot;
      process.env.NARADA_USER_SITE_ROOT = userSiteRoot;
      await writeFixture(userSiteRoot, siteRoot);
      await seedSiteRegistry(siteRoot);

      const overview = makeOverview(readRecords, runtimeByAgent);
      const admission = createSiteAgentAdmissionGateway({
        readLaunchRecords: readRecords,
        readSelectionChoices: async () => ({
          provider_choices: ['e2e-provider'],
          model_choices: ['e2e-model'],
        }),
      });
      // Keep the browser journey deterministic while still exercising the live
      // HTTP server, UI bundle, admission gate, launch gate, lifecycle gate,
      // launch registry, operator identity registry, and NARS control sideband.
      // The separate real-launch journey remains the authority for the User
      // Site PowerShell/runtime attachment boundary.
      const launchCommand = async (options) => {
        const agentId = Array.isArray(options.agent) ? options.agent[0] : null;
        assert.equal(agentId, ADMITTED_AGENT_ID);
        const sessionId = 'lifecycle-e2e-' + randomUUID();
        const controlPath = resolveNaradaSitePaths({ siteRoot, sessionId }).narsControlPath;
        await mkdir(dirname(controlPath), { recursive: true });
        await writeFile(controlPath, '', 'utf8');
        controlPaths.set(agentId, controlPath);
        const child = spawn(
          process.execPath,
          ['-e', 'setInterval(function () {}, 1000);'],
          { stdio: 'ignore', windowsHide: true },
        );
        await new Promise((resolve, reject) => {
          if (child.pid) {
            resolve();
            return;
          }
          child.once('spawn', resolve);
          child.once('error', reject);
        });
        children.add(child);
        runtimeByAgent.set(agentId, { state: 'running', sessionId, child });
        return {
          exitCode: 0,
          result: {
            status: 'success',
            attachment: {
              sessions: [{ session_id: sessionId }],
            },
          },
        };
      };
      const siteAgentLaunch = createSiteAgentLaunchGateway({
        overview,
        readLaunchRecords: readRecords,
        launchCommand,
      });
      const appendControlRequest = async (controlPath, request) => {
        assert.equal(request.method, 'session.close');
        await appendFile(controlPath, JSON.stringify(request) + '\n', 'utf8');
        const params = request.params;
        const agentId = params && typeof params === 'object' ? params.agent_id : null;
        assert.equal(agentId, ADMITTED_AGENT_ID);
        const runtimeRecord = runtimeByAgent.get(agentId);
        assert.ok(runtimeRecord);
        runtimeByAgent.set(agentId, { state: 'stopped', sessionId: null, child: null });
        await terminateChild(runtimeRecord.child);
      };
      const siteAgentLifecycle = createSiteAgentLifecycleGateway({
        overview,
        readLaunchRecords: readRecords,
        appendControlRequest,
      });

      consoleServer = await createConsoleServer({
        host: '127.0.0.1',
        port: 0,
        ingressMode: 'diagnostic',
        siteAgentOverview: overview,
        siteAgentAdmission: admission,
        siteAgentLaunch,
        siteAgentLifecycle,
      });
      const consoleUrl = await consoleServer.start();
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(consoleUrl + '/console/agents', { waitUntil: 'domcontentloaded' });

      const siteBox = page.locator('.site-box[data-site-id="' + SITE_ID + '"]');
      await siteBox.waitFor({ state: 'visible' });
      const addButton = page.getByRole('button', {
        name: 'Add an agent to ' + SITE_DISPLAY_NAME,
      });
      await addButton.click();
      const admissionDialog = page.getByRole('dialog');
      await admissionDialog.waitFor({ state: 'visible' });
      await admissionDialog.getByLabel('Role').waitFor({ state: 'visible' });
      await admissionDialog.getByLabel('Role').selectOption('builder');
      await admissionDialog.getByLabel('Agent kind').selectOption('cli-coding-agent');
      await admissionDialog.getByLabel('Operator surface').selectOption('agent-cli');
      const admissionResponsePromise = page.waitForResponse((response) =>
        response.url() === consoleUrl + '/console/agents/api/admission'
          && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Admit agent' }).click();
      const admissionResponse = await admissionResponsePromise;
      assert.equal(admissionResponse.status(), 201);
      const admissionBody = await admissionResponse.json();
      assert.equal(admissionBody.status, 'admitted');
      assert.equal(admissionBody.agent_id, ADMITTED_AGENT_ID);

      const launchRegistryPath = join(userSiteRoot, 'config', 'launch', 'agents.psd1');
      const identityRegistryPath = join(siteRoot, 'operator-surfaces', 'identities.json');
      await page.getByRole('button', {
        name: ADMITTED_AGENT_ID + ': stopped, work available',
      }).waitFor({ state: 'visible' });
      let launchRegistry = await readFile(launchRegistryPath, 'utf8');
      assert.equal(launchRegistry.includes('Agent = "' + ADMITTED_AGENT_ID + '"'), true);
      let identities = JSON.parse(await readFile(identityRegistryPath, 'utf8'));
      assert.ok(identities.identities.some((identity) => identity.identity_id === ADMITTED_AGENT_ID));

      const launchResponsePromise = page.waitForResponse((response) =>
        response.url() === consoleUrl + '/console/agents/api/launch'
          && response.request().method() === 'POST');
      await page.getByRole('button', {
        name: ADMITTED_AGENT_ID + ': stopped, work available',
      }).click();
      const launchResponse = await launchResponsePromise;
      assert.equal(launchResponse.status(), 200);
      const launchBody = await launchResponse.json();
      assert.equal(launchBody.status, 'launched');
      assert.equal(typeof launchBody.session_id, 'string');
      await page.getByRole('button', {
        name: ADMITTED_AGENT_ID + ': running, work available',
      }).waitFor({ state: 'visible' });
      const runningRecord = runtimeByAgent.get(ADMITTED_AGENT_ID);
      assert.ok(runningRecord?.child?.pid);

      const stopResponsePromise = page.waitForResponse((response) =>
        response.url() === consoleUrl + '/console/agents/api/stop'
          && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Stop ' + ADMITTED_AGENT_ID }).click();
      const stopResponse = await stopResponsePromise;
      assert.equal(stopResponse.status(), 200);
      const stopBody = await stopResponse.json();
      assert.equal(stopBody.status, 'requested');
      await page.getByRole('button', {
        name: ADMITTED_AGENT_ID + ': stopped, work available',
      }).waitFor({ state: 'visible' });
      const controlText = await readFile(controlPaths.get(ADMITTED_AGENT_ID), 'utf8');
      const controlRequest = JSON.parse(controlText.trim().split(/\r?\n/).at(-1));
      assert.equal(controlRequest.method, 'session.close');
      assert.equal(controlRequest.params.source, 'operator-console');
      assert.equal(controlRequest.params.reason, 'operator_requested');
      await waitForChildExit(runningRecord.child);

      await page.getByRole('button', { name: 'Delete ' + ADMITTED_AGENT_ID }).click();
      await page.getByRole('heading', { name: 'Delete ' + ADMITTED_AGENT_ID + '?' }).waitFor({ state: 'visible' });
      const deleteResponsePromise = page.waitForResponse((response) =>
        response.url() === consoleUrl + '/console/agents/api/delete'
          && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Delete admission' }).click();
      const deleteResponse = await deleteResponsePromise;
      const deleteBody = await deleteResponse.json();
      assert.equal(deleteResponse.status(), 200, JSON.stringify(deleteBody));
      assert.equal(deleteBody.status, 'deleted');
      await page.waitForFunction((agentId) =>
        !Array.from(document.querySelectorAll('.agent-button'))
          .some((button) => button.getAttribute('aria-label')?.startsWith(agentId + ':')),
      ADMITTED_AGENT_ID);

      launchRegistry = await readFile(launchRegistryPath, 'utf8');
      assert.equal(launchRegistry.includes('Agent = "' + ADMITTED_AGENT_ID + '"'), false);
      identities = JSON.parse(await readFile(identityRegistryPath, 'utf8'));
      assert.equal(identities.identities.some((identity) => identity.identity_id === ADMITTED_AGENT_ID), false);
      assert.match(controlText, /session\.close/);
    } finally {
      for (const child of children) await terminateChild(child);
      if (browser) await browser.close().catch(() => undefined);
      if (consoleServer) await consoleServer.stop().catch(() => undefined);
      await rm(fixtureRoot, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 }).catch(() => undefined);
      if (previousEnvironment.LOCALAPPDATA === undefined) delete process.env.LOCALAPPDATA;
      else process.env.LOCALAPPDATA = previousEnvironment.LOCALAPPDATA;
      if (previousEnvironment.NARADA_USER_SITE_ROOT === undefined) delete process.env.NARADA_USER_SITE_ROOT;
      else process.env.NARADA_USER_SITE_ROOT = previousEnvironment.NARADA_USER_SITE_ROOT;
    }
  },
);
