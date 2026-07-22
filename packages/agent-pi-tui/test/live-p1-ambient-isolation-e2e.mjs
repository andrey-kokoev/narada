#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  cleanupSite,
  createLiveSite,
  REPO_ROOT,
  loadPty,
  readEvents,
  spawnPi,
  startFixtureProvider,
  startRuntime,
  stopRuntime,
  waitFor,
  waitForEvent,
  recordLiveEvidence,
} from './live-test-harness.mjs';

if (!process.argv.includes('--enable-live-e2e') && process.env.NARADA_AGENT_PI_TUI_LIVE_E2E !== '1') {
  console.log('agent-pi-tui ambient isolation live e2e skipped (pass --enable-live-e2e)');
  process.exit(0);
}

const productionLaunch = process.argv.includes('--production-launch');
const fixturePath = join(REPO_ROOT, 'packages', 'agent-pi-tui', 'test', 'fixtures', 'pi-rpc-ambient-isolation.mjs');

await loadPty();
const provider = await startFixtureProvider({
  responseFor: ({ prompt }) => ({
    choices: [{ message: { role: 'assistant', content: `fixture:${prompt}` } }],
  }),
});

let site = null;
let runtime = null;
let pi = null;
let result = { status: 'failed' };

try {
  site = await createLiveSite({
    provider,
    kernelKind: 'pi-rpc',
    sessionId: `agent-pi-tui-ambient-${Date.now()}`,
    agentId: `agent-pi-tui-ambient-${Date.now()}.resident`,
    kernelEnv: {
      NARADA_AI_API_KEY: 'ambient-narada-secret',
      OPENAI_API_KEY: 'ambient-openai-secret',
      KIMI_CODE_API_KEY: 'ambient-kimi-secret',
      PI_HOME: 'ambient-pi-home',
      PI_CONFIG: 'ambient-pi-config',
      PI_PROFILE: 'ambient-pi-profile',
    },
  });
  const decoyPath = join(site.siteRoot, '.pi', 'skills', 'ambient-decoy.mjs');
  await mkdir(join(site.siteRoot, '.pi', 'skills'), { recursive: true });
  await writeFile(decoyPath, 'export default { ambient: true };', 'utf8');
  const reportPath = join(site.siteRoot, '.ai', 'runtime', 'pi-rpc-ambient-report.jsonl');
  site.env.NARADA_PI_RPC_COMMAND = process.execPath;
  site.env.NARADA_PI_RPC_ARGS = JSON.stringify([fixturePath, reportPath]);
  site.env.NARADA_PI_VERSION = 'pi-ambient-isolation-1.0.0';

  runtime = await startRuntime(site, { direct: !productionLaunch });
  pi = spawnPi(site, runtime, { name: 'agent-pi-tui-ambient' });
  await pi.waitForText(['live', 'connected', 'replaying'], 'ambient_attach');
  await pi.submit('GAP_AMBIENT');
  await waitForEvent(
    site.eventsPath,
    (event) => event.event === 'assistant_message' && event.content === 'PI_AMBIENT_ISOLATION_GAP_AMBIENT',
    'ambient_assistant',
  );
  const report = await waitFor(() => {
    if (!existsSync(reportPath)) return false;
    const records = readFileSync(reportPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    return records.find((entry) => entry.type === 'startup') ?? false;
  }, 'ambient_child_report');
  assert.notEqual(report.cwd, site.siteRoot);
  assert.match(report.cwd, /narada-pi-rpc/i);
  assert.equal(report.ambient_extensions, '0');
  assert.equal(report.native_tools, '0');
  assert.equal(report.session_storage, 'memory');
  for (const key of [
    'site_root',
    'workspace_root',
    'intelligence_context_path',
    'intelligence_registry_db',
    'narada_api_key',
    'kimi_api_key',
    'openai_api_key',
    'pi_home',
    'pi_config',
    'pi_profile',
  ]) assert.equal(report[key], null, `ambient child received ${key}`);
  assert.equal(report.relative_decoy_exists, false);
  const eventLog = readEvents(site.eventsPath);
  assert.ok(eventLog.some((event) => event.event === 'assistant_message' && event.content === 'PI_AMBIENT_ISOLATION_GAP_AMBIENT'));

  result = {
    schema: 'narada.agent_pi_tui.ambient_isolation_e2e.v1',
    status: 'passed',
    checks: [
      'rpc-child-uses-disposable-cwd',
      'rpc-child-does-not-inherit-site-or-provider-configuration',
      'rpc-child-does-not-inherit-provider-credentials',
      'rpc-child-disables-ambient-extensions-and-native-tools',
      'rpc-child-uses-in-memory-session-storage',
      'ambient-relative-decoy-is-not-discovered',
    ],
    evidence: await recordLiveEvidence({
      scenario: 'p1-ambient-resource-isolation',
      site,
      runtime,
      clients: [pi],
      durableOracle: site.eventsPath,
      externalOracles: ['rpc-child-startup-report', 'disposable-child-cwd', 'ambient-decoy-negative'],
      negativeAssertions: [
        'site-root-not-visible-to-rpc-child',
        'provider-credentials-not-visible-to-rpc-child',
        'relative-ambient-decoy-not-discovered',
        'native-tools-not-enabled',
      ],
      productionLaunchBinding: productionLaunch,
      posture: productionLaunch ? 'partial-production-launch' : 'fixture-boundary',
    }),
  };
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  console.error(JSON.stringify({
    site_root: site?.siteRoot,
    events: site ? readEvents(site.eventsPath).slice(-30) : [],
    report: site && existsSync(join(site.siteRoot, '.ai', 'runtime', 'pi-rpc-ambient-report.jsonl'))
      ? readFileSync(join(site.siteRoot, '.ai', 'runtime', 'pi-rpc-ambient-report.jsonl'), 'utf8')
      : null,
    runtime_output: runtime?.output?.(),
    pi_text: pi?.text?.(),
  }, null, 2));
  process.exitCode = 1;
} finally {
  await pi?.kill?.().catch(() => {});
  await stopRuntime(runtime, { hard: false }).catch(() => {});
  await cleanupSite(site).catch(() => {});
  await provider.close().catch(() => {});
}

console.log(JSON.stringify(result, null, 2));
process.exit(result.status === 'passed' ? 0 : 1);
