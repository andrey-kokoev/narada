import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createCloudflareNarsProjectionWorker } from '@narada2/cloudflare-nars-projection/worker';
import { resolveNaradaSitePaths } from '@narada2/site-paths';
import {
  deliverRemoteProjectionInputsOnce,
  registerProjectionRemotely,
  startLocalProjectionBridgeOnce,
} from '@narada2/cloudflare-nars-projection/node';
import { createEventHub, startEventStreamProjection } from '@narada2/agent-runtime-server/test-fixtures';
import { startAgentWebUiServer } from '../src/server.js';
import {
  findHeadlessBrowser,
  openCdpPage,
  waitForPageText,
  waitForPageTextWithAction,
} from '../../cloudflare-nars-projection/scripts/lib/browser-smoke.mjs';

const now = '2026-07-01T12:30:00.000Z';

function listen(server, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      server.off('error', reject);
      const address = server.address();
      resolve(`http://${host}:${address.port}`);
    });
  });
}

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve) => server.close(resolve));
}

function createWorkerHttpServer(worker, envRef, servedResponses = []) {
  return createServer(async (request, response) => {
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const requestUrl = `http://${request.headers.host}${request.url}`;
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (Array.isArray(value)) headers.set(key, value.join(', '));
        else if (value !== undefined) headers.set(key, value);
      }
      const upstream = await worker.fetch(new Request(requestUrl, {
        method: request.method,
        headers,
        ...(body && request.method !== 'GET' && request.method !== 'HEAD' ? { body } : {}),
      }), envRef.current);
      const responseBody = Buffer.from(await upstream.arrayBuffer());
      servedResponses.push({
        url: requestUrl,
        status: upstream.status,
        content_type: upstream.headers.get('content-type'),
        body: responseBody.toString('utf8'),
      });
      response.writeHead(upstream.status, Object.fromEntries(upstream.headers.entries()));
      response.end(responseBody);
    } catch (error) {
      response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      response.end(`${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`);
    }
  });
}

async function workerFetch(worker, url, init = {}) {
  return worker.fetch(new Request(url, init));
}

async function jsonOf(responsePromise) {
  return (await responsePromise).json();
}

async function setProjectionView(page, value) {
  return page.evaluate(String.raw`((nextValue) => {
    const select = document.querySelector('#projection-verbosity');
    if (!select) return { ok: false, reason: 'missing_projection_verbosity_select' };
    select.value = nextValue;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: select.value };
  })(${JSON.stringify(value)})`);
}

function createLocalNarsHttpServer({ siteRoot, sessionId, artifactsDir }) {
  return createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/health') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(`${JSON.stringify({
        schema: 'narada.nars.health.v1',
        status: 'healthy',
        site_id: 'narada.e2e',
        site_root: siteRoot,
        agent_id: 'resident',
        role: 'resident',
        session_id: sessionId,
        mcp_operational_state: 'healthy',
      })}\n`);
      return;
    }

    const artifactMatch = url.pathname.match(/^\/sessions\/([^/]+)\/artifacts\/([^/]+)(?:\/(content))?$/);
    if (!artifactMatch || decodeURIComponent(artifactMatch[1]) !== sessionId) {
      response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      response.end(`${JSON.stringify({ error: 'not_found' })}\n`);
      return;
    }
    const artifactId = decodeURIComponent(artifactMatch[2]);
    const index = JSON.parse(readFileSync(join(artifactsDir, 'index.json'), 'utf8'));
    const artifact = index.artifacts?.find((entry) => entry.artifact_id === artifactId) ?? null;
    if (!artifact) {
      response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      response.end(`${JSON.stringify({ error: 'artifact_not_found', artifact_id: artifactId })}\n`);
      return;
    }
    if (artifactMatch[3] === 'content') {
      response.writeHead(200, {
        'content-type': artifact.content_type ?? 'application/octet-stream',
        'x-narada-artifact-id': artifact.artifact_id,
        'x-narada-artifact-kind': artifact.kind ?? 'unknown',
        'content-security-policy': "sandbox allow-scripts allow-forms; default-src 'self' data: blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'",
      });
      response.end(readFileSync(artifact.source_path));
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(`${JSON.stringify({ schema: 'narada.nars.artifact_read.v1', status: 'ok', artifact })}\n`);
  });
}

function createEmptyLocalNarsSite() {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-web-ui-local-submit-artifact-e2e-'));
  const sessionId = 'nars_local_submit_html_artifact_e2e';
  const sitePaths = resolveNaradaSitePaths({ siteRoot, sessionId });
  const sessionDir = sitePaths.narsSessionDir;
  const artifactsDir = join(sessionDir, 'artifacts');
  mkdirSync(artifactsDir, { recursive: true });

  const eventsPath = join(sessionDir, 'events.jsonl');
  const sessionPath = join(sessionDir, 'session.jsonl');
  const started = {
    event: 'session_started',
    event_sequence: 1,
    agent_id: 'resident',
    role: 'resident',
    session_id: sessionId,
    site_id: 'narada.e2e',
    timestamp: now,
  };
  writeFileSync(sessionPath, '');
  writeFileSync(eventsPath, `${JSON.stringify(started)}\n`);
  writeFileSync(join(artifactsDir, 'index.json'), `${JSON.stringify({
    schema: 'narada.nars.artifact_index.v1',
    session_id: sessionId,
    artifacts: [],
  }, null, 2)}\n`, 'utf8');

  const recordPath = join(sessionDir, 'session-index-record.json');
  writeFileSync(recordPath, `${JSON.stringify({
    schema: 'narada.nars.session_index_record.v1',
    session_id: sessionId,
    carrier_session_id: sessionId,
    agent_id: 'resident',
    site_id: 'narada.e2e',
    site_root: siteRoot,
    events_path: eventsPath,
    session_path: sessionPath,
    health_endpoint: 'http://127.0.0.1:9/health',
  }, null, 2)}\n`, 'utf8');

  writeFileSync(join(sitePaths.narsSessionsRoot, 'index.json'), `${JSON.stringify({
    schema: 'narada.nars.session_index.v1',
    site_root: siteRoot,
    sessions: [{ session_id: sessionId, carrier_session_id: sessionId, record_path: recordPath }],
  }, null, 2)}\n`, 'utf8');

  return { siteRoot, sessionId, sessionDir, artifactsDir, eventsPath };
}

function wireLocalFixtureArtifactRuntime({ runtimeInput, eventHub, siteRoot, sessionId, artifactsDir, eventsPath }) {
  let buffer = '';
  let nextSequence = 2;
  let artifactCreatedResolve;
  let artifactCreatedReject;
  const artifactCreated = new Promise((resolve, reject) => {
    artifactCreatedResolve = resolve;
    artifactCreatedReject = reject;
  });

  const publish = (event) => {
    const completeEvent = {
      agent_id: 'resident',
      session_id: sessionId,
      timestamp: now,
      ...event,
      event_sequence: nextSequence,
    };
    nextSequence += 1;
    appendFileSync(eventsPath, `${JSON.stringify(completeEvent)}\n`, 'utf8');
    eventHub.publish(completeEvent);
    return completeEvent;
  };

  const createArtifact = (requestId, message) => {
    const artifactId = 'art_local_submit_html';
    const htmlPath = join(artifactsDir, 'local-submit-preview.html');
    writeFileSync(htmlPath, [
      '<!doctype html>',
      '<html lang="en">',
      '<body>',
      '<main id="local-submit-html-artifact-e2e">HTML artifact created after local web UI submit</main>',
      '</body>',
      '</html>',
    ].join(''), 'utf8');

    const artifact = {
      schema: 'narada.nars.artifact_record.v1',
      artifact_id: artifactId,
      session_id: sessionId,
      agent_id: 'resident',
      kind: 'html',
      title: 'Local Submit HTML Preview',
      source_path: htmlPath,
      content_type: 'text/html; charset=utf-8',
      created_at: now,
      created_by: 'local-fixture-runtime',
      creation_input: { request_id: requestId, message },
      access: { scope: 'session', token_required: false },
      render: {
        preferred: 'inline',
        sandbox: { allow_scripts: true, allow_top_navigation: false },
      },
      lifecycle: { state: 'active', owner: 'nars-session' },
    };
    writeFileSync(join(artifactsDir, 'index.json'), `${JSON.stringify({
      schema: 'narada.nars.artifact_index.v1',
      session_id: sessionId,
      artifacts: [artifact],
    }, null, 2)}\n`, 'utf8');

    publish({ event: 'operator_input_submitted', request_id: requestId, content: message, source: 'agent-web-ui' });
    publish({ event: 'user_message', request_id: requestId, content: message, source: 'agent-web-ui' });
    publish({ event: 'turn_started', request_id: requestId, turn_id: 'turn_local_submit_mcp', provider: 'fixture-provider' });
    publish({
      event: 'tool_call',
      request_id: requestId,
      turn_id: 'turn_local_submit_mcp',
      tool: 'fixture_read',
      tool_name: 'fixture_read',
      decision: 'read_only_admitted',
      argument_summary: { topic: 'local-submit-html-artifact' },
      carrier_mutation_admitted: false,
    });
    publish({
      event: 'tool_result',
      request_id: requestId,
      turn_id: 'turn_local_submit_mcp',
      tool: 'fixture_read',
      tool_name: 'fixture_read',
      status: 'ok',
      duration_ms: 7,
      decision: 'read_only_admitted',
      output_ref: null,
      carrier_mutation_admitted: false,
    });
    publish({
      event: 'tool_call',
      request_id: requestId,
      turn_id: 'turn_local_submit_mcp',
      tool: 'fixture_fail',
      tool_name: 'fixture_fail',
      decision: 'read_only_admitted',
      argument_summary: { topic: 'local-submit-html-artifact-failure-diagnostic' },
      carrier_mutation_admitted: false,
    });
    publish({
      event: 'tool_result',
      request_id: requestId,
      turn_id: 'turn_local_submit_mcp',
      tool: 'fixture_fail',
      tool_name: 'fixture_fail',
      status: 'failed',
      error: 'fixture_mcp_forced_failure',
      error_code: 'fixture_mcp_forced_failure',
      duration_ms: 3,
      decision: 'read_only_admitted',
      carrier_mutation_admitted: false,
    });
    publish({
      event: 'mcp_runtime_fault',
      request_id: requestId,
      turn_id: 'turn_local_submit_mcp',
      diagnostic_code: 'mcp_runtime_fault',
      server_name: 'local-fixture',
      tool_name: 'fixture_fail',
      error_code: 'fixture_mcp_forced_failure',
      message: 'Local runtime fixture MCP failure',
    });
    publish({ event: 'session_artifact_registered', request_id: requestId, artifact });
    publish({
      event: 'assistant_message',
      request_id: requestId,
      turn_id: 'turn_local_submit_mcp',
      source: 'local_fixture_artifact_creation',
      content: [
        { type: 'text', text: 'Artifact submitted to NARS from local web UI.' },
        {
          type: 'artifact_ref',
          artifact_id: artifactId,
          kind: 'html',
          title: 'Local Submit HTML Preview',
          render_hint: 'inline',
        },
      ],
    });
    publish({ event: 'turn_complete', request_id: requestId, turn_id: 'turn_local_submit_mcp', terminal_state: 'completed' });
    artifactCreatedResolve({ artifact, htmlPath });
  };

  runtimeInput.on('data', (chunk) => {
    buffer += String(chunk);
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;
      try {
        const frame = JSON.parse(line);
        if (frame.method === 'conversation.send') {
          createArtifact(frame.id ?? 'local-submit-input', frame.params?.message ?? '');
        }
      } catch (error) {
        artifactCreatedReject(error);
      }
    }
  });

  return { artifactCreated };
}

test('local runtime input renders artifact and MCP lanes on local and Cloudflare-hosted web surfaces', async () => {
  const browserPath = findHeadlessBrowser();
  assert.ok(browserPath, 'expected an installed Chromium-family browser for local-submit artifact E2E');

  const { siteRoot, sessionId, artifactsDir, eventsPath } = createEmptyLocalNarsSite();
  const runtimeInput = new PassThrough();
  const eventHub = createEventHub();
  const startedEvent = JSON.parse(readFileSync(eventsPath, 'utf8').trim());
  eventHub.publish(startedEvent);
  const eventProjection = await startEventStreamProjection({ childStdin: runtimeInput, eventHub, host: '127.0.0.1', port: 0, eventsPath });
  const fixtureRuntime = wireLocalFixtureArtifactRuntime({ runtimeInput, eventHub, siteRoot, sessionId, artifactsDir, eventsPath });
  const healthServer = createLocalNarsHttpServer({ siteRoot, sessionId, artifactsDir });
  const healthBaseUrl = await listen(healthServer);
  const localWeb = await startAgentWebUiServer({
    host: '127.0.0.1',
    port: 0,
    eventEndpoint: eventProjection.url,
    healthEndpoint: `${healthBaseUrl}/health`,
  });

  const projectionId = 'proj_local_submit_html_artifact_e2e';
  const worker = createCloudflareNarsProjectionWorker({ now: () => now });
  const envRef = { current: {} };
  const servedResponses = [];
  const workerServer = createWorkerHttpServer(worker, envRef, servedResponses);
  const workerBaseUrl = await listen(workerServer);
  const assetServerResult = await startAgentWebUiServer({
    host: '127.0.0.1',
    port: 0,
    cloudflareProjectionId: projectionId,
    cloudflareApiBaseUrl: workerBaseUrl,
  });
  const assetBaseUrl = assetServerResult.url.replace(/\/+$/, '');
  envRef.current = {
    ASSETS: {
      fetch(request) {
        const url = new URL(request.url);
        return fetch(`${assetBaseUrl}${url.pathname}${url.search}`);
      },
    },
  };

  let localPage = null;
  let remotePage = null;
  try {
    localPage = await openCdpPage({ browserPath, url: localWeb.url, userDataPrefix: 'narada-local-submit-artifact-local-' });
    assert.equal((await waitForPageText(localPage, 'resident', 15000)).found, true);
    const submitted = await localPage.evaluate(String.raw`(async () => {
      const input = document.querySelector('#operator-input');
      const form = document.querySelector('#operator-form');
      if (!input || !form) return { ok: false, reason: 'missing_composer' };
      input.value = 'Create an HTML artifact from the local surface';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      return { ok: true };
    })()`);
    assert.equal(submitted.ok, true, JSON.stringify(submitted));

    const created = await Promise.race([
      fixtureRuntime.artifactCreated,
      new Promise((_, reject) => setTimeout(() => reject(new Error('artifact_creation_timeout')), 10000)),
    ]);
    assert.equal(created.artifact.artifact_id, 'art_local_submit_html');
    assert.equal((await waitForPageText(localPage, 'Artifact submitted to NARS from local web UI.', 15000)).found, true);
    assert.equal((await waitForPageText(localPage, 'Local Submit HTML Preview', 15000)).found, true);
    const localIframe = await waitForPageTextWithAction(
      localPage,
      'Local Submit HTML Preview',
      15000,
      async () => localPage.evaluate('Boolean(document.querySelector("iframe.artifact-html-preview"))'),
    );
    assert.equal(localIframe.found, true, JSON.stringify(localIframe));
    const localIframeSrc = await localPage.evaluate('document.querySelector("iframe.artifact-html-preview")?.src ?? ""');
    assert.match(localIframeSrc, /\/api\/nars\/sessions\/nars_local_submit_html_artifact_e2e\/artifacts\/art_local_submit_html\/content/);
    const localIframeNetwork = await localPage.waitForNetworkResponse(
      (entry) => String(entry.url ?? '').includes('/api/nars/sessions/nars_local_submit_html_artifact_e2e/artifacts/art_local_submit_html/content'),
      5000,
    );
    assert.equal(localIframeNetwork.found, true, JSON.stringify(localIframeNetwork));
    assert.equal(localIframeNetwork.status, 200, JSON.stringify(localIframeNetwork));
    const localIframeResponse = await fetch(localIframeSrc);
    assert.equal(localIframeResponse.status, 200);
    assert.match(await localIframeResponse.text(), /HTML artifact created after local web UI submit/);

    const localConversation = await setProjectionView(localPage, 'conversation');
    assert.deepEqual(localConversation, { ok: true, value: 'conversation' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const localConversationText = await localPage.evaluate('document.body.innerText');
    assert.doesNotMatch(localConversationText, /fixture_read ok/);
    assert.doesNotMatch(localConversationText, /fixture_mcp_forced_failure/);

    const localDiagnostics = await setProjectionView(localPage, 'diagnostics');
    assert.deepEqual(localDiagnostics, { ok: true, value: 'diagnostics' });
    assert.equal((await waitForPageText(localPage, 'MCP runtime fault local-fixture:fixture_fail fixture_mcp_forced_failure', 15000)).found, true);

    const localOperations = await setProjectionView(localPage, 'operations');
    assert.deepEqual(localOperations, { ok: true, value: 'operations' });
    assert.equal((await waitForPageText(localPage, 'fixture_read', 15000)).found, true);
    assert.equal((await waitForPageText(localPage, 'fixture_read ok', 15000)).found, true);
    assert.equal((await waitForPageText(localPage, 'fixture_fail failed', 15000)).found, true);

    const registration = await registerProjectionRemotely({
      site_id: 'narada.e2e',
      site_root: siteRoot,
      nars_session_id: sessionId,
      projection_id: projectionId,
      created_at: now,
      dry_run: false,
      cloudflare_api_base_url: workerBaseUrl,
      event_stream_policy: 'diagnostic',
      artifact_projection_policy: {
        content: 'explicit_artifacts',
        explicit_artifact_ids: ['art_local_submit_html'],
        html: { mode: 'explicit_artifacts', sandbox: 'nars_default_strict' },
        redact_local_paths: true,
      },
      fetch_impl: (input, init) => workerFetch(worker, input, init),
    });
    assert.equal(registration.status, 'registered_remotely');
    const browserToken = registration.remote_access.browser_access_tokens[0].token_fingerprint;

    const bridge = await startLocalProjectionBridgeOnce({
      site_root: siteRoot,
      projection_id: projectionId,
      cloudflare_api_base_url: workerBaseUrl,
      fetch_impl: (input, init) => workerFetch(worker, input, init),
      health_probe: () => 'healthy',
      now,
    });
    assert.equal(bridge.status, 'connected');
    assert.equal(bridge.projected_artifact_metadata_count, 1);
    assert.equal(bridge.projected_artifact_content_count, 1);

    const hostedUrl = `${workerBaseUrl}/?cloudflare_projection_id=${encodeURIComponent(projectionId)}&cloudflare_api_base_url=${encodeURIComponent(workerBaseUrl)}&cloudflare_browser_token=${encodeURIComponent(browserToken)}`;
    remotePage = await openCdpPage({ browserPath, url: hostedUrl, userDataPrefix: 'narada-local-submit-artifact-remote-' });
    assert.equal((await waitForPageText(remotePage, 'Browser projection attached', 15000)).found, true);
    assert.equal((await waitForPageText(remotePage, 'Local Submit HTML Preview', 15000)).found, true);
    const iframe = await waitForPageTextWithAction(
      remotePage,
      'Local Submit HTML Preview',
      15000,
      async () => remotePage.evaluate('Boolean(document.querySelector("iframe.artifact-html-preview"))'),
    );
    assert.equal(iframe.found, true);
    const iframeNetwork = await remotePage.waitForNetworkResponse(
      (entry) => String(entry.url ?? '').includes('/api/nars/projections/proj_local_submit_html_artifact_e2e/artifacts/art_local_submit_html/content'),
      5000,
    );
    assert.equal(iframeNetwork.found, true, JSON.stringify(iframeNetwork));
    assert.equal(iframeNetwork.status, 200, JSON.stringify(iframeNetwork));
    const servedIframe = servedResponses.find((entry) => entry.url.includes('/api/nars/projections/proj_local_submit_html_artifact_e2e/artifacts/art_local_submit_html/content'));
    assert.ok(servedIframe, JSON.stringify(servedResponses.map((entry) => ({ url: entry.url, status: entry.status, content_type: entry.content_type }))));
    assert.equal(servedIframe.status, 200);
    assert.match(servedIframe.body, /HTML artifact created after local web UI submit/);

    const switchedToChat = await setProjectionView(remotePage, 'conversation');
    assert.deepEqual(switchedToChat, { ok: true, value: 'conversation' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const remoteChatText = await remotePage.evaluate('document.body.innerText');
    assert.doesNotMatch(remoteChatText, /fixture_read ok/);
    assert.doesNotMatch(remoteChatText, /fixture_mcp_forced_failure/);

    const switchedToDiagnostics = await setProjectionView(remotePage, 'diagnostics');
    assert.deepEqual(switchedToDiagnostics, { ok: true, value: 'diagnostics' });
    assert.equal((await waitForPageText(remotePage, 'MCP runtime fault local-fixture:fixture_fail fixture_mcp_forced_failure', 15000)).found, true);
    const remoteDiagnosticsText = await remotePage.evaluate('document.body.innerText');
    assert.doesNotMatch(remoteDiagnosticsText, /fixture_read ok/);

    const switchedToOperations = await setProjectionView(remotePage, 'operations');
    assert.deepEqual(switchedToOperations, { ok: true, value: 'operations' });
    assert.equal((await waitForPageText(remotePage, 'fixture_read', 15000)).found, true);
    assert.equal((await waitForPageText(remotePage, 'fixture_read ok', 15000)).found, true);
    assert.equal((await waitForPageText(remotePage, 'fixture_fail failed', 15000)).found, true);
    assert.equal((await waitForPageText(remotePage, 'tool_result', 15000)).found, true);

    const remoteSubmitted = await remotePage.evaluate(String.raw`(async () => {
      const input = document.querySelector('#operator-input');
      const form = document.querySelector('#operator-form');
      if (!input || !form) return { ok: false, reason: 'missing_composer' };
      input.value = 'Remote Cloudflare surface message for local NARS admission';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      return { ok: true };
    })()`);
    assert.equal(remoteSubmitted.ok, true, JSON.stringify(remoteSubmitted));

    const admittedInputs = [];
    let delivery = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      delivery = await deliverRemoteProjectionInputsOnce({
        site_root: siteRoot,
        projection_id: projectionId,
        cloudflare_api_base_url: workerBaseUrl,
        fetch_impl: (input, init) => workerFetch(worker, input, init),
        submit_nars_input(input) {
          admittedInputs.push(input);
          return { status: 'accepted_by_local_nars', input_id: input.input_id, method: input.method };
        },
      });
      if (delivery.delivered_count === 1) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.equal(delivery?.status, 'delivered', JSON.stringify(delivery));
    assert.equal(delivery?.delivered_count, 1, JSON.stringify(delivery));
    assert.equal(admittedInputs.length, 1, JSON.stringify(admittedInputs));
    assert.equal(admittedInputs[0].method, 'conversation.send');
    assert.deepEqual(admittedInputs[0].payload, { message: 'Remote Cloudflare surface message for local NARS admission', source: 'agent-web-ui' });

    const revoked = await jsonOf(worker.fetch(new Request(`${workerBaseUrl}/api/nars/projections/${projectionId}`, { method: 'DELETE' })));
    assert.equal(revoked.status, 'revoked');
    assert.equal(revoked.projection_id, projectionId);
    const revokedView = await setProjectionView(remotePage, 'diagnostics');
    assert.deepEqual(revokedView, { ok: true, value: 'diagnostics' });
    const refusedAfterRevoke = await jsonOf(worker.fetch(new Request(`${workerBaseUrl}/api/nars/projections/${projectionId}/events?since_sequence=0`, {
      headers: { 'x-narada-browser-token-fingerprint': browserToken },
    })));
    assert.equal(refusedAfterRevoke.status, 'refused');
    assert.equal(refusedAfterRevoke.code, 'projection_revoked');
  } finally {
    if (remotePage) await remotePage.close();
    if (localPage) await localPage.close();
    await closeServer(assetServerResult.server);
    await closeServer(workerServer);
    await closeServer(localWeb.server);
    await closeServer(healthServer);
    await closeServer(eventProjection.server);
    runtimeInput.destroy();
    await rm(siteRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});
