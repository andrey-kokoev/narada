import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import test from 'node:test';
import { createCloudflareNarsProjectionWorker } from '@narada2/cloudflare-nars-projection/worker';
import {
  deliverRemoteProjectionInputsOnce,
  registerProjectionRemotely,
  startLocalProjectionBridgeOnce,
} from '@narada2/cloudflare-nars-projection/node';
import { startAgentWebUiServer } from '../src/server.js';
import { startSessionCoreRuntime, waitFor } from './e2e/nars-runtime-fixture.mjs';
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
  return page.selectOption('#projection-verbosity', value);
}

async function startRealLocalNarsRuntime() {
  const runtime = await startSessionCoreRuntime({
    identity: 'resident',
    sessionId: 'nars_local_submit_html_artifact_e2e',
    siteId: 'narada.e2e',
    responseContent: 'Artifact request accepted by real NARS runtime.',
    toolGateway: {
      toolCatalog: async () => [],
      invoke: async ({ toolName }) => ({ tool_name: toolName, content: 'fixture' }),
      operationalState: () => 'healthy',
      close() {},
    },
  });
  return {
    ...runtime,
    async registerHtmlArtifact() {
      const htmlPath = join(runtime.siteRoot, 'local-submit-preview.html');
      writeFileSync(htmlPath, [
        '<!doctype html>',
        '<html lang="en">',
        '<body>',
        '<main id="local-submit-html-artifact-e2e">HTML artifact created after local web UI submit</main>',
        '</body>',
        '</html>',
      ].join(''), 'utf8');
      const response = await fetch(new URL(`/sessions/${runtime.sessionId}/artifacts`, runtime.healthProjection.url), {
        method: 'POST',
        body: JSON.stringify({
          source_path: htmlPath,
          kind: 'html',
          title: 'Local Submit HTML Preview',
          render_hint: 'inline',
          content_type: 'text/html; charset=utf-8',
        }),
      });
      assert.equal(response.status, 201);
      return (await response.json()).artifact;
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
        const assetPath = url.pathname === '/sessions/index.html' ? '/' : url.pathname;
        return fetch(`${assetBaseUrl}${assetPath}${url.search}`);
      },
    },
  };

  let localPage = null;
  let remotePage = null;
  try {
    localPage = await openCdpPage({ browserPath, url: localWeb.url, userDataPrefix: 'narada-local-submit-artifact-local-' });
    assert.equal((await waitForPageText(localPage, 'resident', 15000)).found, true);
    await localPage.fill('#operator-input', 'Create an HTML artifact from the local surface');
    await localPage.click('.composer-submit');

    await waitFor(
      () => localRuntime.providerCalls.length === 1,
      10000,
      () => ({ provider_call_count: localRuntime.providerCalls.length, events: localRuntime.events.map((event) => ({ event: event.event, request_id: event.request_id, status: event.status, code: event.code })) }),
    );
    assert.equal(localRuntime.providerCalls[0].messages.some((message) => message.role === 'user' && /Create an HTML artifact/.test(message.content)), true);
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

    await remotePage.fill('#operator-input', 'Remote Cloudflare surface message for local NARS admission');
    await remotePage.click('.composer-submit');

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
    assert.deepEqual(admittedInputs[0].payload, { message: 'Remote Cloudflare surface message for local NARS admission', source: 'manual_operator' });

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
