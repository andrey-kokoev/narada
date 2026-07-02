#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  findHeadlessBrowser,
  openCdpPage,
  sleep,
  waitForPageText,
  waitForPageTextOccurrence,
} from './lib/browser-smoke.mjs';

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

function printHelp() {
  process.stdout.write(`Cloudflare authority live smoke\n\n`);
  process.stdout.write(`Safe planning mode:\n  pnpm --filter @narada2/cloudflare-nars-projection smoke:cloudflare-origin-live\n\n`);
  process.stdout.write(`Live deployed smoke:\n  ${liveCommand('https://narada-nars-projection.andrei-kokoev.workers.dev')}\n\n`);
  process.stdout.write(`Options:\n`);
  process.stdout.write(`  --live                         Mutate deployed Cloudflare authority state.\n`);
  process.stdout.write(`  --cloudflare-api-base-url URL  Deployed Worker base URL. Required with --live.\n`);
  process.stdout.write(`  --format json                  Emit JSON on stdout instead of human output.\n`);
  process.stdout.write(`  --evidence-path PATH           Override evidence output path.\n`);
  process.stdout.write(`  --session-id ID                Override synthetic session id.\n`);
  process.stdout.write(`  --site-id ID                   Override synthetic site id.\n`);
  process.stdout.write(`  --agent-id ID                  Override synthetic agent id.\n`);
  process.stdout.write(`  --quiet                        Suppress phase output in human mode.\n`);
}
const result = await run();
printResult(result);
process.exitCode = result.status === 'passed' || result.status === 'planned' ? 0 : 1;

async function run() {
  const evidencePaths = resolveEvidencePaths('authority-live-smoke', args);
  const evidencePath = evidencePaths.evidencePath;
  const suggestedCommand = liveCommand(args.cloudflareApiBaseUrl ?? '<cloudflare-worker-url>');
  if (!args.live) {
    return evidence({
      schema: 'narada.cloudflare_nars_authority.live_smoke.v1',
      status: 'planned',
      code: 'live_flag_required',
      operator_action: 'Re-run with --live after confirming deployed Cloudflare authority-runtime mutation intent.',
      required: requiredArgs(),
      suggested_command: suggestedCommand,
      evidence_path: null,
    }, evidencePaths, false);
  }
  const missing = requiredArgs().filter((name) => !args[optionKey(name)]);
  if (missing.length) {
    return evidence({
      schema: 'narada.cloudflare_nars_authority.live_smoke.v1',
      status: 'refused',
      code: 'missing_required_live_smoke_options',
      missing,
      suggested_command: suggestedCommand,
      evidence_path: evidencePath,
    }, evidencePaths, true);
  }

  const baseUrl = args.cloudflareApiBaseUrl.replace(/\/+$/, '');
  const sessionId = args.sessionId ?? `cf_authority_live_${Date.now()}`;
  const siteId = args.siteId ?? 'narada.cloudflare.live';
  const agentId = args.agentId ?? 'cloudflare.resident';
  const sessionBase = `${baseUrl}/api/nars/authority/sessions/${encodeURIComponent(sessionId)}`;
  const message = args.message ?? `Cloudflare authority live smoke ${Date.now()}`;
  const hostedWebUrl = `${baseUrl}/?cloudflare_authority_session_id=${encodeURIComponent(sessionId)}&cloudflare_api_base_url=${encodeURIComponent(baseUrl)}`;
  let created = null;
  let revoke = null;
  let cleanup = { status: 'not_needed' };

  try {
    phase(`checking service health at ${baseUrl}`);
    const serviceHealth = await getJson(`${baseUrl}/api/nars/authority/health`);
    phase(`creating synthetic authority session ${sessionId}`);
    created = await postJson(`${baseUrl}/api/nars/authority/sessions`, { session_id: sessionId, site_id: siteId, agent_id: agentId });
    phase('checking session health');
    const health = await getJson(`${sessionBase}/health`);
    phase('checking bounded event replay');
    const initialReplay = await getJson(`${sessionBase}/events?since_sequence=0&max_events=20`);

    const webSocketEndpoint = `${baseUrl.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:')}/api/nars/authority/sessions/${encodeURIComponent(sessionId)}/events/websocket?since_sequence=0&max_events=20`;
    phase('opening authority WebSocket and admitting operator input');
    const live = await observeAuthorityWebSocket({ endpoint: webSocketEndpoint, inputUrl: `${sessionBase}/input`, message });
    phase('checking replay after admitted input');
    const replayAfterInput = await getJson(`${sessionBase}/events?since_sequence=1&max_events=20`);
    phase('checking hosted web UI shell');
    const hostedShell = await getText(hostedWebUrl);
    phase('checking hosted web UI in a real browser');
    const hostedBrowser = await verifyHostedAuthorityBrowser({ hostedWebUrl, sessionBase, sessionId });
    revoke = hostedBrowser.revoke ?? null;
    cleanup = { status: revoke?.status === 'revoked' ? 'revoked_by_hosted_browser_flow' : 'browser_revoke_failed', revoke };
    phase('checking post-revoke refusal behavior');
    const refusedHealth = await getJson(`${sessionBase}/health`);
    const refusedReplay = await getJson(`${sessionBase}/events?since_sequence=0&max_events=20`);
    const refusedInput = await postJson(`${sessionBase}/input`, { method: 'conversation.send', payload: { message: 'after revoke', source: 'authority-live-smoke' } });

    const passed = serviceHealth.status === 'healthy'
      && created.status === 'created'
      && created.session?.execution_mode === 'cloudflare_runtime_tool_adapter'
      && health.status === 'healthy'
      && initialReplay.status === 'ok'
      && initialReplay.events?.some((event) => event.payload?.event === 'session_started')
      && live.status === 'passed'
      && replayAfterInput.status === 'ok'
      && replayAfterInput.events?.some((event) => event.payload?.event === 'assistant_message' && event.payload?.execution_kind === 'cloudflare_runtime_tool_adapter')
      && replayAfterInput.events?.some((event) => event.payload?.event === 'mcp_runtime_fault' && event.payload?.error_code === 'cloudflare_authority_diagnostic_probe_failed')
      && hostedShell.ok === true
      && hostedBrowser.status === 'passed'
      && revoke?.status === 'revoked'
      && refusedHealth.status === 'refused'
      && refusedHealth.code === 'session_revoked'
      && refusedReplay.status === 'refused'
      && refusedReplay.code === 'session_revoked'
      && refusedInput.status === 'refused'
      && refusedInput.code === 'session_revoked';

    return evidence({
      schema: 'narada.cloudflare_nars_authority.live_smoke.v1',
      status: passed ? 'passed' : 'failed',
      cloudflare_api_base_url: baseUrl,
      session_id: sessionId,
      site_id: siteId,
      agent_id: agentId,
      hosted_web_url: hostedWebUrl,
      web_socket_endpoint: webSocketEndpoint,
      authority_origin: 'cloudflare',
      authority_runtime_kind: 'cloudflare_authority_tool_adapter_runtime',
      smoke_lineage: 'cloudflare-origin-live',
      hosted_shell_check_kind: 'http_html_shell_only',
      hosted_browser_check_kind: 'browser_level_authority_e2e',
      strongest_hosted_web_ui_evidence: strongestHostedWebUiEvidence({ hostedShell, hostedBrowser }),
      hosted_web_ui_evidence: hostedWebUiEvidence({ hostedShell, hostedBrowser }),
      checks: { service_health: serviceHealth, created, health, initial_replay: initialReplay, live_websocket: live, replay_after_input: replayAfterInput, hosted_shell: hostedShell, hosted_browser: hostedBrowser, revoke, refused_health: refusedHealth, refused_replay: refusedReplay, refused_input: refusedInput, cleanup },
      evidence_path: evidencePath,
      evidence_latest_path: evidencePaths.latestPath,
      evidence_index_path: evidencePaths.indexPath,
    }, evidencePaths, true);
  } catch (error) {
    if (created?.status === 'created' && !revoke) {
      phase('attempting cleanup revoke after failure');
      cleanup = await safeCleanupRevoke(sessionBase);
    }
    return evidence({
      schema: 'narada.cloudflare_nars_authority.live_smoke.v1',
      status: 'failed',
      code: 'cloudflare_authority_live_smoke_error',
      error: error instanceof Error ? error.message : String(error),
      cloudflare_api_base_url: baseUrl,
      session_id: sessionId,
      site_id: siteId,
      agent_id: agentId,
      hosted_web_url: hostedWebUrl,
      cleanup,
      evidence_path: evidencePath,
    }, evidencePaths, true);
  }
}

async function revokeSession(sessionBase) {
  return await fetch(sessionBase, { method: 'DELETE' }).then((response) => response.json().catch(() => ({ status: response.ok ? 'revoked' : 'unknown', http_status: response.status })));
}

async function verifyHostedAuthorityBrowser(args) {
  const browserPath = findHeadlessBrowser();
  if (!browserPath) return { status: 'failed', code: 'headless_browser_not_found' };
  const message = `Cloudflare authority browser E2E ${Date.now()}`;
  const submittedInput = message;
  const assistantText = 'Cloudflare runtime tool adapter executed conversation.send.';
  const page = await openCdpPage({ browserPath, url: args.hostedWebUrl, userDataPrefix: 'narada-cloudflare-authority-browser-' });
  try {
    const stream = await waitForPageText(page, 'stream connected', 20000);
    await selectHostedBrowserView(page, 'Raw');
    const replayRendered = await waitForPageText(page, 'session_started', 15000);
    await selectHostedBrowserView(page, 'Chat');
    const beforeMessageCount = await page.textOccurrenceCount(message);
    const beforeAssistantCount = await page.textOccurrenceCount(assistantText);
    const input = await submitHostedAuthorityOperatorMessage(page, submittedInput, message);
    const userRendered = await waitForPageTextOccurrence(page, message, beforeMessageCount + 1, 15000);
    const assistantRendered = await waitForPageTextOccurrence(page, assistantText, beforeAssistantCount + 1, 15000);
    const liveAssistantFrame = await page.waitForWebSocketFrame((entry) => {
      const url = String(entry.url ?? '');
      const payload = String(entry.payload_data ?? '');
      return url.includes(`/api/nars/authority/sessions/${args.sessionId}/events/websocket`)
        && payload.includes('assistant_message')
        && payload.includes(assistantText);
    }, 15000);
    await sleep(500);
    const userMessageCount = await page.textOccurrenceCount(message);
    const assistantMessageCount = await page.textOccurrenceCount(assistantText);
    await selectHostedBrowserView(page, 'Diagnostics');
    const turnCompleteRendered = await waitForPageText(page, 'completed', 15000);
    const revoke = await revokeSession(args.sessionBase);
    const revocationFrame = await page.waitForWebSocketFrame((entry) => {
      const url = String(entry.url ?? '');
      const payload = String(entry.payload_data ?? '');
      return url.includes(`/api/nars/authority/sessions/${args.sessionId}/events/websocket`)
        && payload.includes('authority_session_revoked')
        && payload.includes('session_revoked');
    }, 15000);
    await selectHostedBrowserView(page, 'Diagnostics');
    const revokedRendered = await waitForPageText(page, 'session_revoked', 15000);
    const disconnectedRendered = await waitForPageText(page, 'stream reconnecting', 15000);
    const passed = stream.found
      && replayRendered.found
      && input.status === 'submitted_from_hosted_browser_ui'
      && (input.input_response?.body?.status === 'admitted' || input.input_response?.status === 200)
      && userRendered.found
      && assistantRendered.found
      && liveAssistantFrame.found
      && userMessageCount === beforeMessageCount + 1
      && assistantMessageCount === beforeAssistantCount + 1
      && turnCompleteRendered.found
      && revoke.status === 'revoked'
      && revocationFrame.found
      && revokedRendered.found
      && disconnectedRendered.found;
    return {
      status: passed ? 'passed' : 'failed',
      message,
      submitted_input: submittedInput,
      stream,
      replay_rendered: replayRendered,
      input,
      user_rendered: userRendered,
      assistant_rendered: assistantRendered,
      live_assistant_websocket_frame: liveAssistantFrame,
      message_cardinality: {
        user_message_count: userMessageCount,
        expected_user_message_count: beforeMessageCount + 1,
        assistant_message_count: assistantMessageCount,
        expected_assistant_message_count: beforeAssistantCount + 1,
      },
      turn_complete_rendered: turnCompleteRendered,
      revoke,
      revocation_websocket_frame: revocationFrame,
      revoked_state_rendered: revokedRendered,
      disconnected_state_rendered: disconnectedRendered,
    };
  } catch (error) {
    return { status: 'failed', code: 'hosted_authority_browser_failed', error: error instanceof Error ? error.message : String(error), message };
  } finally {
    await page.close();
  }
}

async function selectHostedBrowserView(page, label) {
  return await page.evaluate(`(() => {
    const label = ${JSON.stringify(label)};
    const select = document.querySelector('#projection-verbosity, select[aria-label="View"]');
    if (select) {
      const option = [...select.options].find((candidate) => candidate.textContent?.trim().toLowerCase() === label.toLowerCase() || candidate.value?.trim().toLowerCase() === label.toLowerCase());
      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    const button = [...document.querySelectorAll('button,[role="button"],[role="tab"],label,a,*')].find((candidate) => candidate.textContent?.trim().toLowerCase() === label.toLowerCase());
    if (!button) throw new Error('projection_view_control_not_found:' + label);
    button.click();
    return true;
  })()`);
}

async function submitHostedAuthorityOperatorMessage(page, submittedInput, message) {
  const inputResponsePromise = page.waitForNetworkResponse((entry) => entry.method === 'POST' && /\/api\/nars\/authority\/sessions\/[^/]+\/input$/.test(new URL(entry.url).pathname), 10000);
  await page.evaluate(`(() => {
    const input = document.querySelector('#operator-input');
    if (!input) throw new Error('operator_input_not_found');
    input.focus();
    input.value = ${JSON.stringify(submittedInput)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const form = document.querySelector('#operator-form');
    if (!form) throw new Error('operator_form_not_found');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    return true;
  })()`);
  const inputResponse = await inputResponsePromise;
  const inputResponseBody = inputResponse.request_id ? await page.getNetworkResponseBody(inputResponse.request_id) : null;
  inputResponse.body = inputResponseBody;
  return { status: 'submitted_from_hosted_browser_ui', message, submitted_input: submittedInput, input_response: inputResponse };
}

async function safeCleanupRevoke(sessionBase) {
  try {
    const revoke = await revokeSession(sessionBase);
    return { status: revoke.status === 'revoked' ? 'revoked_after_failure' : 'cleanup_revoke_failed', revoke };
  } catch (error) {
    return { status: 'cleanup_revoke_failed', error: error instanceof Error ? error.message : String(error) };
  }
}

async function observeAuthorityWebSocket(args) {
  if (typeof WebSocket !== 'function') return { status: 'failed', code: 'websocket_global_unavailable' };
  const ws = new WebSocket(args.endpoint);
  const observed = [];
  let inputResponse = null;
  let inputResponsePromise = null;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('cloudflare_authority_websocket_timeout')), 20000);
      ws.addEventListener('open', async () => {
        inputResponsePromise = postJson(args.inputUrl, { method: 'conversation.send', payload: { message: args.message, source: 'authority-live-smoke' } });
        inputResponsePromise.then((response) => {
          inputResponse = response;
        }).catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
      });
      ws.addEventListener('message', (event) => {
        const parsed = parseJson(String(event.data));
        observed.push(parsed);
        const hasUser = observed.some((entry) => entry?.event === 'user_message' && String(entry?.content ?? '').includes(args.message));
        const hasAssistant = observed.some((entry) => entry?.event === 'assistant_message' && entry?.execution_kind === 'cloudflare_runtime_tool_adapter');
        const hasMcpFault = observed.some((entry) => entry?.event === 'mcp_runtime_fault' && entry?.error_code === 'cloudflare_authority_diagnostic_probe_failed');
        const hasComplete = observed.some((entry) => entry?.event === 'turn_complete' && entry?.terminal_state === 'completed');
        if (hasUser && hasAssistant && hasMcpFault && hasComplete) {
          clearTimeout(timer);
          resolve();
        }
      });
      ws.addEventListener('error', (error) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('cloudflare_authority_websocket_error'));
      });
      ws.addEventListener('close', () => {
        if (!observed.some((entry) => entry?.event === 'turn_complete')) {
          clearTimeout(timer);
          reject(new Error('cloudflare_authority_websocket_closed_before_completion'));
        }
      });
    });
    if (inputResponsePromise) inputResponse = await inputResponsePromise;
    return { status: 'passed', input_response: inputResponse, observed_events: observed.map((entry) => entry?.event ?? entry?.type ?? 'unknown') };
  } catch (error) {
    return { status: 'failed', code: 'cloudflare_authority_websocket_observation_failed', error: error instanceof Error ? error.message : String(error), input_response: inputResponse, observed_events: observed.map((entry) => entry?.event ?? entry?.type ?? 'unknown') };
  } finally {
    try { ws.close(); } catch {}
  }
}

async function postJson(url, body) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({ status: response.ok ? 'ok' : 'failed', http_status: response.status }));
  return { http_status: response.status, ...payload };
}

async function getJson(url) {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({ status: response.ok ? 'ok' : 'failed', http_status: response.status }));
  return { http_status: response.status, ...payload };
}

async function getText(url) {
  const response = await fetch(url);
  const text = await response.text().catch(() => '');
  return { ok: response.ok, status: response.status, content_type: response.headers.get('content-type'), contains_app_root: text.includes('id="app"') || text.includes("id='app'"), contains_config: text.includes('cloudflare_authority_session_id') || text.includes('cloudflareAuthoritySessionId') };
}

function resolveEvidencePaths(lineage, options) {
  const root = resolve(process.cwd(), '.narada/crew/nars-projections');
  return {
    evidencePath: options.evidencePath ?? resolve(root, `${lineage}-${Date.now()}.json`),
    latestPath: options.evidenceLatestPath ?? resolve(root, `${lineage}-latest.json`),
    indexPath: options.evidenceIndexPath ?? resolve(root, `${lineage}-index.json`),
  };
}

function hostedWebUiEvidence({ hostedShell, hostedBrowser }) {
  return {
    schema: 'narada.hosted_web_ui_evidence.v1',
    levels: [
      { level: 'html_shell_available', status: hostedShell?.ok === true ? 'passed' : 'failed' },
      { level: 'browser_booted', status: hostedBrowser?.stream?.found === true ? 'passed' : 'failed' },
      { level: 'replay_rendered', status: hostedBrowser?.replay_rendered?.found === true ? 'passed' : 'failed' },
      { level: 'live_stream_rendered', status: hostedBrowser?.stream?.found === true ? 'passed' : 'failed' },
      { level: 'operator_input_submitted', status: hostedBrowser?.input?.status === 'submitted_from_hosted_browser_ui' ? 'passed' : 'failed' },
      { level: 'assistant_rendered', status: hostedBrowser?.assistant_rendered?.found === true ? 'passed' : 'failed' },
      { level: 'live_websocket_assistant_frame_verified', status: hostedBrowser?.live_assistant_websocket_frame?.found === true ? 'passed' : 'failed' },
      { level: 'turn_completion_rendered', status: hostedBrowser?.turn_complete_rendered?.found === true ? 'passed' : 'failed' },
      { level: 'message_cardinality_verified', status: hostedBrowser?.message_cardinality?.user_message_count === hostedBrowser?.message_cardinality?.expected_user_message_count && hostedBrowser?.message_cardinality?.assistant_message_count === hostedBrowser?.message_cardinality?.expected_assistant_message_count ? 'passed' : 'failed' },
      { level: 'revocation_rendered', status: hostedBrowser?.revoked_state_rendered?.found === true ? 'passed' : 'failed' },
      { level: 'live_websocket_revocation_frame_verified', status: hostedBrowser?.revocation_websocket_frame?.found === true ? 'passed' : 'failed' },
      { level: 'disconnection_rendered', status: hostedBrowser?.disconnected_state_rendered?.found === true ? 'passed' : 'failed' },
    ],
  };
}

function strongestHostedWebUiEvidence({ hostedShell, hostedBrowser }) {
  if (hostedBrowser?.status === 'passed') return 'browser_level_authority_e2e';
  if (hostedShell?.ok === true) return 'http_html_shell_only';
  return 'none';
}

function evidence(payload, paths, write) {
  const enriched = write
    ? { ...payload, evidence_latest_path: payload.evidence_latest_path ?? paths.latestPath, evidence_index_path: payload.evidence_index_path ?? paths.indexPath }
    : payload;
  if (write) {
    phase(`writing evidence to ${paths.evidencePath}`);
    mkdirSync(dirname(paths.evidencePath), { recursive: true });
    const body = `${JSON.stringify(enriched, null, 2)}\n`;
    writeFileSync(paths.evidencePath, body);
    writeFileSync(paths.latestPath, body);
    writeFileSync(paths.indexPath, `${JSON.stringify({
      schema: 'narada.smoke_evidence_index.v1',
      lineage: enriched.smoke_lineage ?? 'cloudflare-origin-live',
      latest_status: enriched.status,
      latest_evidence_path: paths.evidencePath,
      latest_copy_path: paths.latestPath,
      latest_run_at: new Date().toISOString(),
      strongest_hosted_web_ui_evidence: enriched.strongest_hosted_web_ui_evidence ?? null,
    }, null, 2)}\n`);
  }
  return enriched;
}

function printResult(result) {
  if (args.format === 'json') {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`\nCloudflare authority live smoke: ${result.status}\n`);
  if (result.smoke_lineage) process.stdout.write(`Smoke lineage: ${result.smoke_lineage}\n`);
  if (result.authority_origin) process.stdout.write(`Authority origin: ${result.authority_origin}\n`);
  if (result.authority_runtime_kind) process.stdout.write(`Authority runtime: ${result.authority_runtime_kind}\n`);
  if (result.code) process.stdout.write(`Reason: ${result.code}\n`);
  if (result.operator_action) process.stdout.write(`Action: ${result.operator_action}\n`);
  if (result.suggested_command) process.stdout.write(`Command: ${result.suggested_command}\n`);
  if (result.cloudflare_api_base_url) process.stdout.write(`Worker: ${result.cloudflare_api_base_url}\n`);
  if (result.session_id) process.stdout.write(`Session: ${result.session_id}\n`);
  if (result.hosted_web_url) process.stdout.write(`Hosted web UI: ${result.hosted_web_url}\n`);
  if (result.web_socket_endpoint) process.stdout.write(`WebSocket: ${result.web_socket_endpoint}\n`);
  if (result.hosted_shell_check_kind) process.stdout.write(`Hosted shell check: ${result.hosted_shell_check_kind}\n`);
  if (result.hosted_browser_check_kind) process.stdout.write(`Hosted browser check: ${result.hosted_browser_check_kind}\n`);
  if (result.strongest_hosted_web_ui_evidence) process.stdout.write(`Strongest hosted web UI evidence: ${result.strongest_hosted_web_ui_evidence}\n`);
  if (result.checks) {
    const checks = summarizeChecks(result.checks);
    if (checks.length) process.stdout.write(`Checks: ${checks.join(', ')}\n`);
  }
  if (result.cleanup) process.stdout.write(`Cleanup: ${result.cleanup.status}\n`);
  if (result.evidence_path) process.stdout.write(`Evidence: ${result.evidence_path}\n`);
  if (result.evidence_latest_path) process.stdout.write(`Latest evidence: ${result.evidence_latest_path}\n`);
  if (result.evidence_index_path) process.stdout.write(`Evidence index: ${result.evidence_index_path}\n`);
  if (result.status !== 'passed') {
    const detailHint = result.evidence_path ? 're-run with --format json or inspect the evidence file' : 're-run with --format json';
    process.stdout.write(`For full details, ${detailHint}.\n`);
  }
}

function summarizeChecks(checks) {
  return Object.entries(checks).map(([name, value]) => `${name}=${summarizeCheckStatus(value)}`);
}

function summarizeCheckStatus(value) {
  if (value?.ok === true) return 'ok';
  return value?.status ?? 'unknown';
}

function phase(message) {
  if (args.format === 'json' || args.quiet) return;
  process.stdout.write(`cloudflare authority smoke: ${message}\n`);
}

function parseJson(value) {
  try { return JSON.parse(value); } catch { return { event: 'decode_failed', raw: value }; }
}

function requiredArgs() {
  return ['--cloudflare-api-base-url'];
}

function liveCommand(baseUrl) {
  return `pnpm --filter @narada2/cloudflare-nars-projection smoke:cloudflare-origin-live -- --live --cloudflare-api-base-url ${baseUrl}`;
}

function optionKey(option) {
  return option.replace(/^--/, '').replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function parseArgs(argv) {
  const options = { live: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--live') options.live = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--quiet') options.quiet = true;
    else if (arg.startsWith('--')) {
      const equalsIndex = arg.indexOf('=');
      if (equalsIndex > 0) options[optionKey(arg.slice(0, equalsIndex))] = arg.slice(equalsIndex + 1);
      else options[optionKey(arg)] = argv[index + 1], index += 1;
    }
  }
  return options;
}
