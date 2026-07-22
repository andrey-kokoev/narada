#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cleanupSite,
  createLiveSite,
  REPO_ROOT,
  loadPty,
  readEvents,
  spawnPi,
  startRuntime,
  startFixtureProvider,
  stopRuntime,
  waitFor,
  waitForEvent,
  recordLiveEvidence,
} from './live-test-harness.mjs';

if (!process.argv.includes('--enable-live-e2e') && process.env.NARADA_AGENT_PI_TUI_LIVE_E2E !== '1') {
  console.log('agent-pi-tui compaction/reconstruction live e2e skipped (pass --enable-live-e2e)');
  process.exit(0);
}

const productionLaunch = process.argv.includes('--production-launch');
const fixturePath = join(REPO_ROOT, 'packages', 'agent-pi-tui', 'test', 'fixtures', 'pi-rpc-compaction-reconstruction.mjs');
const providerResponse = async ({ prompt }) => ({
  choices: [{ message: { role: 'assistant', content: `fixture:${prompt}` } }],
});

const provider = await startFixtureProvider({ responseFor: providerResponse });
let site = null;
let runtime = null;
let restartedRuntime = null;
let pi = null;
let restartedPi = null;
let originalSessionId = null;
let result = { status: 'failed' };

try {
  await loadPty();
  site = await createLiveSite({
    provider,
    kernelKind: 'pi-rpc',
    sessionId: `agent-pi-tui-compaction-${Date.now()}`,
    agentId: `agent-pi-tui-compaction-${Date.now()}.resident`,
  });
  const reportPath = join(site.siteRoot, '.ai', 'runtime', 'pi-rpc-compaction-report.jsonl');
  site.env.NARADA_PI_RPC_COMMAND = process.execPath;
  site.env.NARADA_PI_RPC_ARGS = JSON.stringify([fixturePath, reportPath]);
  site.env.NARADA_PI_VERSION = 'pi-compaction-reconstruction-1.0.0';

  runtime = await startRuntime(site, { direct: !productionLaunch });
  originalSessionId = site.sessionId;
  pi = spawnPi(site, runtime, { name: 'agent-pi-tui-compaction' });
  await pi.waitForText(['live', 'connected', 'replaying'], 'compaction_attach');
  await pi.submit('GAP_COMPACTION');
  await waitForEvent(site.eventsPath, (event) => event.event === 'assistant_message' && event.content === 'GAP_COMPACTION_ASSISTANT', 'compaction_assistant');
  const compactionEvent = await waitForEvent(
    site.eventsPath,
    (event) => event.event === 'pi_compaction_evidence' && event.canonical_history_deleted === false,
    'compaction_evidence',
  );
  assert.equal(compactionEvent.accepted_by_nars, false);
  const eventsBeforeRestart = readEvents(site.eventsPath);
  assert.ok(eventsBeforeRestart.some((event) => event.event === 'user_message' && event.content === 'GAP_COMPACTION'));

  await pi.kill();
  await stopRuntime(runtime, { hard: true });
  const initialRuntime = runtime;
  runtime = null;

  restartedRuntime = await startRuntime(site, {
    direct: !productionLaunch,
    resumeSessionId: originalSessionId,
  });
  assert.equal(site.sessionId, originalSessionId);
  restartedPi = spawnPi(site, restartedRuntime, { name: 'agent-pi-tui-compaction-restarted' });
  await restartedPi.waitForText(['live', 'connected', 'replaying'], 'compaction_restarted_attach');
  await restartedPi.submit('GAP_RECONSTRUCTION');
  await waitForEvent(site.eventsPath, (event) => event.event === 'assistant_message' && event.content === 'GAP_RECONSTRUCTION_ASSISTANT', 'reconstructed_assistant');

  const report = await waitFor(() => {
    if (!existsSync(reportPath)) return false;
    const records = readFileSync(reportPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    return records.find((entry) => entry.type === 'turn' && entry.prompt === 'GAP_RECONSTRUCTION') ?? false;
  }, 'reconstruction_report');
  assert.equal(report.reconstructed_context, true);
  const finalEvents = readEvents(site.eventsPath);
  assert.ok(finalEvents.some((event) => event.event === 'assistant_message' && event.content === 'GAP_COMPACTION_ASSISTANT'));
  assert.ok(finalEvents.some((event) => event.event === 'assistant_message' && event.content === 'GAP_RECONSTRUCTION_ASSISTANT'));
  assert.equal(finalEvents.filter((event) => event.event === 'session_started').map((event) => event.session_id ?? event.runtime_session_id).filter(Boolean).every((id) => id === originalSessionId), true);

  result = {
    schema: 'narada.agent_pi_tui.compaction_reconstruction_e2e.v1',
    status: 'passed',
    checks: [
      'pi-compaction-is-observed-as-evidence',
      'canonical-history-is-not-deleted-by-compaction',
      'same-session-production-restart-reconstructs-context',
      'reconstructed-context-drives-the-next-real-pi-turn',
      'compaction-and-restart-evidence-are-durable',
    ],
    evidence: await recordLiveEvidence({
      scenario: 'p1-compaction-reconstruction',
      site,
      runtimes: [initialRuntime, restartedRuntime],
      clients: [pi, restartedPi],
      durableOracle: site.eventsPath,
      externalOracles: ['pi-rpc-compaction-report', 'same-session-restart-boundary', 'reconstructed-context-observation'],
      negativeAssertions: [
        'compaction-does-not-delete-canonical-history',
        'restart-does-not-create-a-new-session',
        'reconstruction-does-not-invent-a-missing-assistant-message',
      ],
      sameSessionAfterFault: true,
      productionLaunchBinding: productionLaunch,
      posture: productionLaunch ? 'partial-production-launch' : 'fixture-boundary',
    }),
  };
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  console.error(JSON.stringify({
    site_root: site?.siteRoot,
    events: site ? readEvents(site.eventsPath).slice(-50) : [],
    report: site && existsSync(join(site.siteRoot, '.ai', 'runtime', 'pi-rpc-compaction-report.jsonl'))
      ? readFileSync(join(site.siteRoot, '.ai', 'runtime', 'pi-rpc-compaction-report.jsonl'), 'utf8')
      : null,
    runtime_output: runtime?.output?.(),
    restarted_runtime_output: restartedRuntime?.output?.(),
    pi_text: pi?.text?.(),
    restarted_pi_text: restartedPi?.text?.(),
  }, null, 2));
  process.exitCode = 1;
} finally {
  await restartedPi?.kill?.().catch(() => {});
  await pi?.kill?.().catch(() => {});
  await stopRuntime(restartedRuntime, { hard: false }).catch(() => {});
  await stopRuntime(runtime, { hard: false }).catch(() => {});
  await cleanupSite(site).catch(() => {});
  await provider.close().catch(() => {});
}

console.log(JSON.stringify(result, null, 2));
process.exit(result.status === 'passed' ? 0 : 1);
