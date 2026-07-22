#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  cleanupSite,
  createLiveSite,
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
  console.log('agent-pi-tui PTY-boundary live e2e skipped (pass --enable-live-e2e)');
  process.exit(0);
}

const productionLaunch = process.argv.includes('--production-launch');

await loadPty();
const provider = await startFixtureProvider({
  responseFor: ({ prompt }) => ({
    choices: [{ message: { role: 'assistant', content: prompt.includes('GAP_UNICODE')
      ? 'GAP_UNICODE_ASSISTANT'
      : prompt.includes('GAP_PASTE')
        ? 'GAP_PASTE_ASSISTANT'
        : `fixture:${prompt}` } }],
  }),
});

let site = null;
let runtime = null;
let pi = null;
let result = { status: 'failed' };

try {
  site = await createLiveSite({
    provider,
    sessionId: `agent-pi-tui-pty-${Date.now()}`,
    agentId: `agent-pi-tui-pty-${Date.now()}.resident`,
  });
  runtime = await startRuntime(site, { direct: !productionLaunch });
  pi = spawnPi(site, runtime, { name: 'agent-pi-tui-pty-boundary' });
  await pi.waitForText(['live', 'connected', 'replaying'], 'pty_boundary_attach');
  pi.resize(96, 24);

  const beforeLocal = readEvents(site.eventsPath).length;
  await pi.submit('/view raw');
  pi.write('\u000f');
  pi.write('\u0004');
  pi.write('\u000c');
  pi.write('\u001b[5~');
  pi.write('\u001b[6~');
  await pi.submit('/help');
  await pi.waitForText(['Commands', '/status'], 'pty_help_overlay');
  pi.write('\u001b');
  // The PTY output is an append-only capture, so overlay disappearance cannot
  // be inferred from text absence. Give the real app one render cycle before
  // continuing with the conversation boundary.
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 300));
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  const afterLocal = readEvents(site.eventsPath).slice(beforeLocal);
  assert.equal(afterLocal.some((event) => event.event === 'user_message'), false, 'PTY-local controls must not create durable conversation input');

  await pi.submit('GAP_UNICODE_こんにちは_🙂');
  await waitForEvent(site.eventsPath, (event) => event.event === 'user_message' && event.content === 'GAP_UNICODE_こんにちは_🙂', 'pty_unicode_user');
  await waitForEvent(site.eventsPath, (event) => event.event === 'assistant_message' && event.content === 'GAP_UNICODE_ASSISTANT', 'pty_unicode_assistant');

  // Exercise bracketed paste through the actual node-pty input stream. The
  // Pi app strips only the bracket markers; the pasted text still crosses the
  // normal composer/submit boundary.
  pi.write('\u001b[200~GAP_PASTE\u001b[201~');
  pi.write('\r');
  await waitForEvent(site.eventsPath, (event) => event.event === 'user_message' && event.content === 'GAP_PASTE', 'pty_bracketed_paste_user');
  await waitForEvent(site.eventsPath, (event) => event.event === 'assistant_message' && event.content === 'GAP_PASTE_ASSISTANT', 'pty_bracketed_paste_assistant');

  const beforeDetach = readEvents(site.eventsPath).length;
  pi.write('\u0003');
  await waitFor(() => pi.exited(), 'pty_ctrl_c_exit');
  const afterDetach = readEvents(site.eventsPath).slice(beforeDetach);
  assert.equal(afterDetach.some((event) => event.event === 'session_closed'), false, 'Ctrl+C detach must not close the NARS session');
  assert.equal(readEvents(site.eventsPath).some((event) => event.event === 'session_closed'), false, 'terminal exit must not mint session_closed');
  assert.match(pi.text(), /connected|live|replaying/i);

  result = {
    schema: 'narada.agent_pi_tui.pty_boundary_e2e.v1',
    status: 'passed',
    checks: [
      'real_node_pty_input_boundary',
      'resize',
      'help_and_escape',
      'view_and_scroll_controls',
      'unicode_round_trip',
      'bracketed_paste_round_trip',
      'ctrl_c_detaches_without_session_close',
    ],
    evidence: await recordLiveEvidence({
      scenario: 'p1-pty-boundary',
      site,
      runtime,
      client: pi,
      durableOracle: site.eventsPath,
      externalOracles: ['fixture-provider-request-log', 'node-pty-process'],
      negativeAssertions: [
        'ctrl-c-detach-does-not-close-session',
        'terminal-exit-does-not-mint-session-closed',
      ],
      productionLaunchBinding: productionLaunch,
      posture: productionLaunch ? 'partial-production-launch' : 'fixture-boundary',
    }),
  };
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  console.error(JSON.stringify({
    site_root: site?.siteRoot,
    events: site ? readEvents(site.eventsPath).slice(-80) : [],
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
