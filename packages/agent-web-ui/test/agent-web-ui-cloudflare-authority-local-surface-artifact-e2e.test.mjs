import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createCloudflareNarsAuthorityService } from '@narada2/cloudflare-nars-projection';
import { createCloudflareNarsProjectionWorker } from '@narada2/cloudflare-nars-projection/worker';
import { startAgentWebUiServer } from '../src/server.js';
import {
  findHeadlessBrowser,
  openCdpPage,
  waitForPageText,
  waitForPageTextWithAction,
} from '../../cloudflare-nars-projection/scripts/lib/browser-smoke.mjs';

const now = '2026-07-01T13:00:00.000Z';

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


function createWorkerHttpServer(worker, envRef = { current: {} }, servedResponses = []) {
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
        method: request.method,
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

async function jsonOf(responseOrPromise) {
  const response = await responseOrPromise;
  return response.json();
}
async function setProjectionView(page, value) {
  return page.selectOption('#projection-verbosity', value);
}

test('local agent-web-ui submits to Cloudflare-hosted NARS authority and renders authority HTML artifact', async () => {
  const browserPath = findHeadlessBrowser();
  assert.ok(browserPath, 'expected an installed Chromium-family browser for Cloudflare authority local-surface artifact E2E');

  const sessionId = 'cf_authority_local_surface_artifact_e2e';
  const authorityService = createCloudflareNarsAuthorityService();
  const worker = createCloudflareNarsProjectionWorker({ now: () => now, authority_service: authorityService });
  const servedResponses = [];
  const envRef = { current: {} };
  const workerServer = createWorkerHttpServer(worker, envRef, servedResponses);
  const workerBaseUrl = await listen(workerServer);

  const created = await jsonOf(worker.fetch(new Request(`${workerBaseUrl}/api/nars/authority/sessions`, {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      site_id: 'narada.cloudflare.e2e',
      agent_id: 'cloudflare.resident',
    }),
  })));
  assert.equal(created.status, 'created');
  assert.equal(created.session_id, sessionId);

  const localWeb = await startAgentWebUiServer({
    host: '127.0.0.1',
    port: 0,
    cloudflareAuthoritySessionId: sessionId,
    cloudflareApiBaseUrl: workerBaseUrl,
  });

  let page = null;
  try {
    page = await openCdpPage({ browserPath, url: localWeb.url, userDataPrefix: 'narada-cf-authority-local-surface-artifact-' });
    const initialReplay = await waitForPageText(page, 'cloudflare.resident', 15000);
    assert.equal(initialReplay.found, true, JSON.stringify(initialReplay));

    await page.fill('#operator-input', 'Create an HTML artifact in the Cloudflare authority runtime');
    await page.click('.composer-submit');

    assert.equal((await waitForPageText(page, 'Cloudflare Authority HTML Preview', 15000)).found, true);
    const iframe = await waitForPageTextWithAction(
      page,
      'Cloudflare Authority HTML Preview',
      15000,
      async () => page.evaluate('Boolean(document.querySelector("iframe.artifact-html-preview"))'),
    );
    assert.equal(iframe.found, true);

    const iframeSrc = await page.evaluate('document.querySelector("iframe.artifact-html-preview")?.src ?? ""');
    assert.match(iframeSrc, /\/api\/nars\/authority\/sessions\/cf_authority_local_surface_artifact_e2e\/artifacts\/art_cf_authority_html\/content/);

    const iframeNetwork = await page.waitForNetworkResponse(
      (entry) => String(entry.url ?? '').includes('/api/nars/authority/sessions/cf_authority_local_surface_artifact_e2e/artifacts/art_cf_authority_html/content'),
      5000,
    );
    assert.equal(iframeNetwork.found, true, JSON.stringify(iframeNetwork));
    assert.equal(iframeNetwork.status, 200, JSON.stringify(iframeNetwork));

    const servedIframe = servedResponses.find((entry) => entry.url.includes('/api/nars/authority/sessions/cf_authority_local_surface_artifact_e2e/artifacts/art_cf_authority_html/content'));
    assert.ok(servedIframe, JSON.stringify(servedResponses.map((entry) => ({ method: entry.method, url: entry.url, status: entry.status, content_type: entry.content_type }))));
    assert.equal(servedIframe.status, 200);
    assert.match(servedIframe.body, /HTML artifact created by Cloudflare-hosted NARS authority/);

    const switchedToConversation = await setProjectionView(page, 'conversation');
    assert.deepEqual(switchedToConversation, { ok: true, value: 'conversation' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const conversationText = await page.evaluate('document.body.innerText');
    assert.doesNotMatch(conversationText, /cf-authority\\.session_context_read/);
    assert.doesNotMatch(conversationText, /cloudflare_authority_diagnostic_probe_failed/);

    const switchedToDiagnostics = await setProjectionView(page, 'diagnostics');
    assert.deepEqual(switchedToDiagnostics, { ok: true, value: 'diagnostics' });
    assert.equal((await waitForPageText(page, 'MCP runtime fault cf-authority:diagnostic_probe cloudflare_authority_diagnostic_probe_failed', 15000)).found, true);
    const diagnosticsText = await page.evaluate('document.body.innerText');
    assert.doesNotMatch(diagnosticsText, /cf-authority\\.session_context_read ok/);

    const switchedToOperations = await setProjectionView(page, 'operations');
    assert.deepEqual(switchedToOperations, { ok: true, value: 'operations' });
    assert.equal((await waitForPageText(page, 'cf-authority.session_context_read', 15000)).found, true);
    assert.equal((await waitForPageText(page, 'cf-authority.session_context_read ok', 15000)).found, true);
    assert.equal((await waitForPageText(page, 'cf-authority.diagnostic_probe failed', 15000)).found, true);
    const operationsText = await page.evaluate('document.body.innerText');
    assert.doesNotMatch(operationsText, /MCP runtime fault cf-authority:diagnostic_probe cloudflare_authority_diagnostic_probe_failed/);

    const replay = await jsonOf(worker.fetch(new Request(`${workerBaseUrl}/api/nars/authority/sessions/${sessionId}/events?since_sequence=1`)));
    assert.equal(replay.status, 'ok');
    assert.ok(replay.events.some((entry) => entry.payload?.event === 'tool_call' && entry.payload?.tool_name === 'cf-authority.session_context_read'), JSON.stringify(replay));
    assert.ok(replay.events.some((entry) => entry.payload?.event === 'tool_result' && entry.payload?.tool_name === 'cf-authority.diagnostic_probe' && entry.payload?.status === 'failed'), JSON.stringify(replay));
    assert.ok(replay.events.some((entry) => entry.payload?.event === 'mcp_runtime_fault' && entry.payload?.error_code === 'cloudflare_authority_diagnostic_probe_failed'), JSON.stringify(replay));
    assert.ok(replay.events.some((entry) => entry.payload?.event === 'session_artifact_registered'), JSON.stringify(replay));
    assert.ok(replay.events.some((entry) => JSON.stringify(entry.payload).includes('art_cf_authority_html')), JSON.stringify(replay));

  } finally {
    if (page) await page.close();
    await closeServer(localWeb.server);
    await closeServer(workerServer);
  }
});

test('hosted Cloudflare web UI submits to Cloudflare-hosted NARS authority and renders authority HTML artifact', async () => {
  const browserPath = findHeadlessBrowser();
  assert.ok(browserPath, 'expected an installed Chromium-family browser for Cloudflare authority hosted-surface artifact E2E');

  const sessionId = 'cf_authority_hosted_surface_artifact_e2e';
  const worker = createCloudflareNarsProjectionWorker({ now: () => now });
  const envRef = { current: {} };
  const servedResponses = [];
  const workerServer = createWorkerHttpServer(worker, envRef, servedResponses);
  const workerBaseUrl = await listen(workerServer);

  const created = await jsonOf(worker.fetch(new Request(`${workerBaseUrl}/api/nars/authority/sessions`, {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      site_id: 'narada.cloudflare.e2e',
      agent_id: 'cloudflare.resident',
    }),
  })));
  assert.equal(created.status, 'created');
  assert.equal(created.session_id, sessionId);

  const assetServerResult = await startAgentWebUiServer({
    host: '127.0.0.1',
    port: 0,
    cloudflareAuthoritySessionId: sessionId,
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

  let page = null;
  try {
    page = await openCdpPage({ browserPath, url: `${workerBaseUrl}/`, userDataPrefix: 'narada-cf-authority-hosted-surface-artifact-' });
    const initialReplay = await waitForPageText(page, 'cloudflare.resident', 15000);
    assert.equal(initialReplay.found, true, JSON.stringify(initialReplay));

    await page.fill('#operator-input', 'Create an HTML artifact in the Cloudflare authority runtime from hosted UI');
    await page.click('.composer-submit');

    assert.equal((await waitForPageText(page, 'Cloudflare Authority HTML Preview', 15000)).found, true);
    const iframe = await waitForPageTextWithAction(
      page,
      'Cloudflare Authority HTML Preview',
      15000,
      async () => page.evaluate('Boolean(document.querySelector("iframe.artifact-html-preview"))'),
    );
    assert.equal(iframe.found, true, JSON.stringify(iframe));

    const iframeSrc = await page.evaluate('document.querySelector("iframe.artifact-html-preview")?.src ?? ""');
    assert.match(iframeSrc, /\/api\/nars\/authority\/sessions\/cf_authority_hosted_surface_artifact_e2e\/artifacts\/art_cf_authority_html\/content/);
    const iframeNetwork = await page.waitForNetworkResponse(
      (entry) => String(entry.url ?? '').includes('/api/nars/authority/sessions/cf_authority_hosted_surface_artifact_e2e/artifacts/art_cf_authority_html/content'),
      5000,
    );
    assert.equal(iframeNetwork.found, true, JSON.stringify(iframeNetwork));
    assert.equal(iframeNetwork.status, 200, JSON.stringify(iframeNetwork));
    const iframeResponse = await fetch(iframeSrc);
    assert.equal(iframeResponse.status, 200);
    assert.match(await iframeResponse.text(), /HTML artifact created by Cloudflare-hosted NARS authority/);

    const switchedToConversation = await setProjectionView(page, 'conversation');
    assert.deepEqual(switchedToConversation, { ok: true, value: 'conversation' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const conversationText = await page.evaluate('document.body.innerText');
    assert.doesNotMatch(conversationText, /cf-authority\\.session_context_read/);
    assert.doesNotMatch(conversationText, /cloudflare_authority_diagnostic_probe_failed/);

    const switchedToDiagnostics = await setProjectionView(page, 'diagnostics');
    assert.deepEqual(switchedToDiagnostics, { ok: true, value: 'diagnostics' });
    assert.equal((await waitForPageText(page, 'MCP runtime fault cf-authority:diagnostic_probe cloudflare_authority_diagnostic_probe_failed', 15000)).found, true);
    const diagnosticsText = await page.evaluate('document.body.innerText');
    assert.doesNotMatch(diagnosticsText, /cf-authority\\.session_context_read ok/);

    const switchedToOperations = await setProjectionView(page, 'operations');
    assert.deepEqual(switchedToOperations, { ok: true, value: 'operations' });
    assert.equal((await waitForPageText(page, 'cf-authority.session_context_read', 15000)).found, true);
    assert.equal((await waitForPageText(page, 'cf-authority.session_context_read ok', 15000)).found, true);
    assert.equal((await waitForPageText(page, 'cf-authority.diagnostic_probe failed', 15000)).found, true);
    const operationsText = await page.evaluate('document.body.innerText');
    assert.doesNotMatch(operationsText, /MCP runtime fault cf-authority:diagnostic_probe cloudflare_authority_diagnostic_probe_failed/);

    const replay = await jsonOf(worker.fetch(new Request(`${workerBaseUrl}/api/nars/authority/sessions/${sessionId}/events?since_sequence=1`)));
    assert.equal(replay.status, 'ok');
    assert.ok(replay.events.some((entry) => entry.payload?.event === 'tool_call' && entry.payload?.tool_name === 'cf-authority.session_context_read'), JSON.stringify(replay));
    assert.ok(replay.events.some((entry) => entry.payload?.event === 'tool_result' && entry.payload?.tool_name === 'cf-authority.diagnostic_probe' && entry.payload?.status === 'failed'), JSON.stringify(replay));
    assert.ok(replay.events.some((entry) => entry.payload?.event === 'mcp_runtime_fault' && entry.payload?.error_code === 'cloudflare_authority_diagnostic_probe_failed'), JSON.stringify(replay));
    assert.ok(replay.events.some((entry) => entry.payload?.event === 'session_artifact_registered'), JSON.stringify(replay));
    assert.ok(replay.events.some((entry) => JSON.stringify(entry.payload).includes('art_cf_authority_html')), JSON.stringify(replay));

  } finally {
    if (page) await page.close();
    await closeServer(assetServerResult.server);
    await closeServer(workerServer);
  }
});
