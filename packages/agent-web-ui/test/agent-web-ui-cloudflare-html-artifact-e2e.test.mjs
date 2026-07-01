import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createCloudflareNarsProjectionWorker } from '@narada2/cloudflare-nars-projection/worker';
import {
  registerProjectionRemotely,
  startLocalProjectionBridgeOnce,
} from '@narada2/cloudflare-nars-projection/node';
import { startAgentWebUiServer } from '../src/server.js';
import {
  findHeadlessBrowser,
  openCdpPage,
  waitForPageText,
  waitForPageTextWithAction,
} from '../../cloudflare-nars-projection/scripts/lib/browser-smoke.mjs';

const now = '2026-07-01T12:00:00.000Z';

function createLocalNarsSiteWithHtmlArtifact() {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-web-ui-html-artifact-e2e-'));
  const sessionId = 'carrier_html_artifact_e2e';
  const sessionDir = join(siteRoot, '.narada', 'crew', 'nars-sessions', sessionId);
  const artifactsDir = join(sessionDir, 'artifacts');
  mkdirSync(artifactsDir, { recursive: true });

  const htmlPath = join(artifactsDir, 'preview.html');
  writeFileSync(htmlPath, [
    '<!doctype html>',
    '<html lang="en">',
    '<body>',
    '<main id="local-html-artifact-e2e">Local NARS HTML artifact rendered through remote surface</main>',
    '</body>',
    '</html>',
  ].join(''), 'utf8');

  const eventsPath = join(sessionDir, 'events.jsonl');
  const sessionPath = join(sessionDir, 'session.jsonl');
  writeFileSync(sessionPath, '');
  writeFileSync(eventsPath, [
    JSON.stringify({
      event: 'session_started',
      event_sequence: 1,
      agent_id: 'resident',
      session_id: sessionId,
      site_id: 'narada.e2e',
      timestamp: now,
    }),
    JSON.stringify({
      event: 'assistant_message',
      event_sequence: 2,
      agent_id: 'resident',
      session_id: sessionId,
      timestamp: now,
      request_id: 'artifact_present_art_html',
      source: 'nars_artifact_presentation',
      content: [
        { type: 'text', text: 'Here is the HTML artifact from local NARS.' },
        {
          type: 'artifact_ref',
          artifact_id: 'art_html',
          kind: 'html',
          title: 'Remote HTML Preview',
          render_hint: 'inline',
        },
      ],
    }),
  ].join('\n'));

  writeFileSync(join(artifactsDir, 'index.json'), `${JSON.stringify({
    schema: 'narada.nars.artifact_index.v1',
    session_id: sessionId,
    artifacts: [{
      schema: 'narada.nars.artifact_record.v1',
      artifact_id: 'art_html',
      session_id: sessionId,
      agent_id: 'resident',
      kind: 'html',
      title: 'Remote HTML Preview',
      source_path: htmlPath,
      content_type: 'text/html; charset=utf-8',
      created_at: now,
      access: { scope: 'session', token_required: false },
      render: {
        preferred: 'inline',
        sandbox: { allow_scripts: true, allow_top_navigation: false },
      },
      lifecycle: { state: 'active', owner: 'nars-session' },
    }],
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

  const indexDir = join(siteRoot, '.narada', 'crew', 'nars-sessions');
  writeFileSync(join(indexDir, 'index.json'), `${JSON.stringify({
    schema: 'narada.nars.session_index.v1',
    site_root: siteRoot,
    sessions: [{ session_id: sessionId, carrier_session_id: sessionId, record_path: recordPath }],
  }, null, 2)}\n`, 'utf8');

  return { siteRoot, sessionId };
}

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
  if (!server.listening) return;
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

test('hosted Cloudflare projection web UI renders explicitly admitted local NARS HTML artifact', async () => {
  const browserPath = findHeadlessBrowser();
  assert.ok(browserPath, 'expected an installed Chromium-family browser for hosted artifact E2E');

  const { siteRoot, sessionId } = createLocalNarsSiteWithHtmlArtifact();
  const projectionId = 'proj_html_artifact_e2e';
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

  let page = null;
  try {
    const registration = await registerProjectionRemotely({
      site_id: 'narada.e2e',
      site_root: siteRoot,
      nars_session_id: sessionId,
      projection_id: projectionId,
      created_at: now,
      dry_run: false,
      cloudflare_api_base_url: workerBaseUrl,
      artifact_projection_policy: {
        content: 'explicit_artifacts',
        explicit_artifact_ids: ['art_html'],
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

    const artifactResponse = await workerFetch(worker, `${workerBaseUrl}/api/nars/projections/${projectionId}/artifacts/art_html/content`, {
      headers: { 'x-narada-browser-token-fingerprint': browserToken },
    });
    assert.equal(artifactResponse.status, 200);
    assert.match(await artifactResponse.text(), /Local NARS HTML artifact rendered through remote surface/);

    const hostedUrl = `${workerBaseUrl}/?cloudflare_projection_id=${encodeURIComponent(projectionId)}&cloudflare_api_base_url=${encodeURIComponent(workerBaseUrl)}&cloudflare_browser_token=${encodeURIComponent(browserToken)}`;
    page = await openCdpPage({ browserPath, url: hostedUrl, userDataPrefix: 'narada-agent-web-ui-html-artifact-e2e-' });
    assert.equal((await waitForPageText(page, 'Browser projection attached', 15000)).found, true);
    assert.equal((await waitForPageText(page, 'Remote HTML Preview', 15000)).found, true);
    const iframe = await waitForPageTextWithAction(
      page,
      'Remote HTML Preview',
      15000,
      async () => page.evaluate('Boolean(document.querySelector("iframe.artifact-html-preview"))'),
    );
    assert.equal(iframe.found, true);
    const iframeSrc = await page.evaluate('document.querySelector("iframe.artifact-html-preview")?.src ?? ""');
    assert.match(iframeSrc, /\/api\/nars\/projections\/proj_html_artifact_e2e\/artifacts\/art_html\/content/);
    const iframeMarkup = await page.evaluate('document.querySelector("iframe.artifact-html-preview")?.outerHTML ?? ""');
    assert.match(iframeMarkup, /artifact-html-preview/);
    const iframeBox = await page.evaluate(`(() => {
      const frame = document.querySelector("iframe.artifact-html-preview");
      if (!frame) return null;
      const rect = frame.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    })()`);
    assert.ok(iframeBox?.width > 100 && iframeBox?.height > 80, JSON.stringify({ iframeMarkup, iframeBox }));
    const iframeNetwork = await page.waitForNetworkResponse(
      (entry) => String(entry.url ?? '').includes('/api/nars/projections/proj_html_artifact_e2e/artifacts/art_html/content'),
      5000,
    );
    assert.equal(iframeNetwork.found, true, JSON.stringify({ iframeMarkup, iframeNetwork }));
    assert.equal(iframeNetwork.status, 200, JSON.stringify(iframeNetwork));
    const servedIframe = servedResponses.find((entry) => entry.url.includes('/api/nars/projections/proj_html_artifact_e2e/artifacts/art_html/content'));
    assert.ok(servedIframe, JSON.stringify(servedResponses.map((entry) => ({ url: entry.url, status: entry.status, content_type: entry.content_type }))));
    assert.equal(servedIframe.status, 200);
    assert.match(servedIframe.body, /Local NARS HTML artifact rendered through remote surface/);
  } finally {
    if (page) await page.close();
    await closeServer(assetServerResult.server);
    await closeServer(workerServer);
    await rm(siteRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});
