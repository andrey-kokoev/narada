import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
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
import { createEventHub, startHealthProjection, startEventStreamProjection } from '@narada2/agent-runtime-server';
import { createCarrierRuntimeDependencies } from '../../carrier-runtime/src/runtime-dependencies.mjs';
import { runCarrierServerMode } from '../../carrier-runtime/src/server-mode.mjs';
import { removeTempDir, waitFor, writeFixtureMcpSurface } from '../../carrier-runtime/src/server-mode-test-helpers.mjs';
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

async function waitForOrFail(predicate, label, evidence, options = {}) {
  try {
    await waitFor(predicate, options);
  } catch (error) {
    throw new Error(`${label}: ${JSON.stringify(evidence())}`, { cause: error });
  }
}

async function renderedEventRows(page, kind = null) {
  return page.evaluate(String.raw`((eventKind) => {
    const rows = Array.from(document.querySelectorAll('[data-event-kind]'));
    const filtered = eventKind ? rows.filter((row) => row.dataset.eventKind === eventKind) : rows;
    return filtered.map((row) => ({
      kind: row.dataset.eventKind ?? null,
      text: row.textContent ?? '',
      summary: row.querySelector('.event-summary')?.textContent ?? '',
    }));
  })(${JSON.stringify(kind)})`);
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

function createEmptyLocalNarsSite() {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-web-ui-local-submit-artifact-e2e-'));
  const sessionId = 'nars_local_submit_html_artifact_e2e';
  const sitePaths = resolveNaradaSitePaths({ siteRoot, sessionId });
  const sessionDir = sitePaths.narsSessionDir;
  const artifactsDir = join(sessionDir, 'artifacts');
  mkdirSync(sessionDir, { recursive: true });

  return { siteRoot, sessionId, sessionDir, artifactsDir, eventsPath: join(sessionDir, 'events.jsonl') };
}

async function startRealLocalNarsRuntime() {
  const site = createEmptyLocalNarsSite();
  writeFixtureMcpSurface(site.siteRoot);
  const runtimeInput = new PassThrough();
  const runtimeOutput = new PassThrough();
  const eventHub = createEventHub();
  const events = [];
  const providerCalls = [];
  let outputBuffer = '';
  let runtimePromise = null;
  let healthProjection = null;
  let eventProjection = null;
  const runtimeContext = {
    identity: 'resident',
    session: site.sessionId,
    siteRoot: site.siteRoot,
    siteId: 'narada.e2e',
    operatorSurfaceKind: 'agent-web-ui',
    sessionPath: join(site.sessionDir, 'session.jsonl'),
    eventsPath: site.eventsPath,
    intelligenceProvider: 'codex-subscription',
    providerSettings: { provider: 'codex-subscription', model: 'gpt-5.5', thinking: 'medium', stream: false },
  };
  healthProjection = await startHealthProjection({ childStdin: () => runtimeInput, host: '127.0.0.1', port: 0, runtimeContext: { ...runtimeContext, eventHub } });
  eventProjection = await startEventStreamProjection({ childStdin: () => runtimeInput, eventHub, host: '127.0.0.1', port: 0, eventsPath: runtimeContext.eventsPath });
  const fullRuntimeContext = { ...runtimeContext, healthUrl: healthProjection.url, eventStreamUrl: eventProjection.url };
  const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext: fullRuntimeContext });
  runtimeOutput.setEncoding('utf8');
  runtimeOutput.on('data', (chunk) => {
    outputBuffer += chunk;
    const lines = outputBuffer.split(/\r?\n/);
    outputBuffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      events.push(event);
      healthProjection?.observe(event);
      eventHub.publish(event);
    }
  });
  runtimePromise = runCarrierServerMode({
    input: runtimeInput,
    output: runtimeOutput,
    callChatApiFn: async (messages, tools) => {
      providerCalls.push({ messages, tools });
      if (providerCalls.length === 1) {
        assert.equal(tools.some((tool) => tool.function?.name === 'fixture_read'), true);
        return { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_fixture_read', type: 'function', function: { name: 'fixture_read', arguments: JSON.stringify({ topic: 'local-submit-html-artifact' }) } }] } }] };
      }
      return { choices: [{ message: { role: 'assistant', content: 'Artifact request accepted by real NARS runtime.' } }] };
    },
    runtimeContext: fullRuntimeContext,
    dependencies: { ...dependencies, readMcpPreflightArtifact: () => null },
  });
  await Promise.race([
    waitForOrFail(
      () => events.some((event) => event.event === 'session_started'),
      'real_nars_session_started_timeout',
      () => ({ events: events.map((event) => event.event), output_buffer: outputBuffer }),
      { timeoutMs: 2000 },
    ),
    runtimePromise.then(() => {
      throw new Error('runtime_exited_before_session_started');
    }),
  ]);
  const localWeb = await startAgentWebUiServer({
    host: '127.0.0.1',
    port: 0,
    eventEndpoint: eventProjection.url,
    healthEndpoint: healthProjection.url,
  });
  return {
    ...site,
    localWeb,
    eventProjection,
    healthProjection,
    events,
    providerCalls,
    async registerHtmlArtifact() {
      const artifactIdBefore = events.filter((event) => event.event === 'session_artifact_registered').length;
      const htmlPath = join(site.artifactsDir, 'local-submit-preview.html');
      mkdirSync(site.artifactsDir, { recursive: true });
      writeFileSync(htmlPath, [
        '<!doctype html>',
        '<html lang="en">',
        '<body>',
        '<main id="local-submit-html-artifact-e2e">HTML artifact created after local web UI submit</main>',
        '</body>',
        '</html>',
      ].join(''), 'utf8');
      runtimeInput.write(`${JSON.stringify({ id: 'artifact-register-local-submit', method: 'session.artifacts.register', params: { source_path: htmlPath, kind: 'html', title: 'Local Submit HTML Preview', render_hint: 'inline', content_type: 'text/html; charset=utf-8' } })}\n`);
      await waitForOrFail(
        () => events.filter((event) => event.event === 'session_artifact_registered').length > artifactIdBefore || events.some((event) => event.event === 'error' && event.request_id === 'artifact-register-local-submit'),
        'real_nars_artifact_register_timeout',
        () => ({ events: events.map((event) => ({ event: event.event, request_id: event.request_id, code: event.code, message: event.message })) }),
        { timeoutMs: 2000 },
      );
      const registerError = events.find((event) => event.event === 'error' && event.request_id === 'artifact-register-local-submit');
      assert.equal(registerError, undefined, JSON.stringify(registerError));
      return events.findLast((event) => event.event === 'session_artifact_registered')?.artifact;
    },
    async close() {
      localWeb.server.close();
      runtimeInput.end();
      if (runtimePromise) await Promise.race([runtimePromise, new Promise((resolve) => setTimeout(resolve, 1000))]);
      healthProjection?.server.close();
      eventProjection?.server.close();
      removeTempDir(site.siteRoot);
    },
  };
}

test('local runtime input renders artifact and MCP lanes on local and Cloudflare-hosted web surfaces', { concurrency: false }, async () => {
  const browserPath = findHeadlessBrowser();
  assert.ok(browserPath, 'expected an installed Chromium-family browser for local-submit artifact E2E');

  const localRuntime = await startRealLocalNarsRuntime();
  const { siteRoot, sessionId, localWeb } = localRuntime;

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

    await waitForOrFail(
      () => localRuntime.providerCalls.length === 2,
      'real_nars_provider_turn_timeout',
      () => ({ provider_call_count: localRuntime.providerCalls.length, events: localRuntime.events.map((event) => ({ event: event.event, request_id: event.request_id, tool_name: event.tool_name, status: event.status, code: event.code })) }),
      { timeoutMs: 10000 },
    );
    assert.equal(localRuntime.providerCalls[0].messages.some((message) => message.role === 'user' && /Create an HTML artifact/.test(message.content)), true);
    assert.equal(localRuntime.providerCalls[0].tools.some((tool) => tool.function?.name === 'fixture_read'), true);
    await waitForOrFail(
      () => localRuntime.events.some((event) => event.event === 'tool_result' && (event.tool_name === 'fixture_read' || event.tool === 'fixture_read') && event.status === 'ok'),
      'real_nars_fixture_read_result_timeout',
      () => ({ events: localRuntime.events.map((event) => ({ event: event.event, tool: event.tool, tool_name: event.tool_name, status: event.status, code: event.code })) }),
      { timeoutMs: 2000 },
    );
    const artifact = await localRuntime.registerHtmlArtifact();
    const artifactId = artifact.artifact_id;
    assert.ok(artifactId, JSON.stringify(artifact));
    assert.equal((await waitForPageText(localPage, 'Artifact request accepted by real NARS runtime.', 15000)).found, true);
    assert.equal((await waitForPageText(localPage, 'Local Submit HTML Preview', 15000)).found, true);
    const localIframe = await waitForPageTextWithAction(
      localPage,
      'Local Submit HTML Preview',
      15000,
      async () => localPage.evaluate('Boolean(document.querySelector("iframe.artifact-html-preview"))'),
    );
    assert.equal(localIframe.found, true, JSON.stringify(localIframe));
    const localIframeSrc = await localPage.evaluate('document.querySelector("iframe.artifact-html-preview")?.src ?? ""');
    assert.equal(Boolean(localIframeSrc), true);
    assert.match(localIframeSrc, /\/content(?:\?|$)/);
    const localIframeNetwork = await localPage.waitForNetworkResponse(
      (entry) => String(entry.url ?? '').endsWith('/content') && String(entry.url ?? '').includes('/api/nars/'),
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

    const localOperations = await setProjectionView(localPage, 'operations');
    assert.deepEqual(localOperations, { ok: true, value: 'operations' });
    await waitForOrFail(
      async () => (await renderedEventRows(localPage, 'tool_call')).some((row) => /fixture_read/.test(row.text)),
      'local_operations_tool_call_render_timeout',
      async () => ({ rows: await renderedEventRows(localPage) }),
      { timeoutMs: 5000 },
    );
    await waitForOrFail(
      async () => (await renderedEventRows(localPage, 'tool_result')).some((row) => /fixture_read/.test(row.text) && /ok|complete/i.test(row.text)),
      'local_operations_tool_result_render_timeout',
      async () => ({ rows: await renderedEventRows(localPage) }),
      { timeoutMs: 5000 },
    );

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
        explicit_artifact_ids: [artifactId],
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
      (entry) => String(entry.url ?? '').includes(`/api/nars/projections/proj_local_submit_html_artifact_e2e/artifacts/${encodeURIComponent(artifactId)}/content`),
      5000,
    );
    assert.equal(iframeNetwork.found, true, JSON.stringify(iframeNetwork));
    assert.equal(iframeNetwork.status, 200, JSON.stringify(iframeNetwork));
    const servedIframe = servedResponses.find((entry) => entry.url.includes(`/api/nars/projections/proj_local_submit_html_artifact_e2e/artifacts/${encodeURIComponent(artifactId)}/content`));
    assert.ok(servedIframe, JSON.stringify(servedResponses.map((entry) => ({ url: entry.url, status: entry.status, content_type: entry.content_type }))));
    assert.equal(servedIframe.status, 200);
    assert.match(servedIframe.body, /HTML artifact created after local web UI submit/);

    const switchedToChat = await setProjectionView(remotePage, 'conversation');
    assert.deepEqual(switchedToChat, { ok: true, value: 'conversation' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const remoteChatText = await remotePage.evaluate('document.body.innerText');
    assert.doesNotMatch(remoteChatText, /fixture_read ok/);

    const switchedToOperations = await setProjectionView(remotePage, 'operations');
    assert.deepEqual(switchedToOperations, { ok: true, value: 'operations' });
    assert.equal((await waitForPageText(remotePage, 'Tool result', 15000)).found, true);

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
    await localRuntime.close();
  }
});
