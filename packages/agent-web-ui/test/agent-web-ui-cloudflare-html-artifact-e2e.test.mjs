import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawnTestChild } from '@narada2/process-launch-posture';
import { createCloudflareNarsProjectionWorker } from '@narada2/cloudflare-nars-projection/worker';
import { resolveNaradaSitePaths } from '@narada2/site-paths';
import { createEventHub, startHealthProjection, startEventStreamProjection } from '@narada2/agent-runtime-server';
import { createCarrierRuntimeDependencies } from '../../carrier-runtime/src/runtime-dependencies.mjs';
import { runCarrierServerMode } from '../../carrier-runtime/src/server-mode.mjs';
import { removeTempDir, waitFor } from '../../carrier-runtime/src/server-mode-test-helpers.mjs';
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
const speechMcpMain = fileURLToPath(new URL('../../../../mcp-surfaces/packages/speech-mcp/dist/src/main.js', import.meta.url));

async function createRealNarsSiteWithHtmlArtifact() {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-web-ui-real-html-artifact-e2e-'));
  const sessionId = 'carrier_html_artifact_e2e';
  const sitePaths = resolveNaradaSitePaths({ siteRoot, sessionId });
  const sessionDir = sitePaths.narsSessionDir;
  mkdirSync(sessionDir, { recursive: true });
  const htmlPath = join(siteRoot, 'preview.html');
  writeFileSync(htmlPath, [
    '<!doctype html>',
    '<html lang="en">',
    '<body>',
    '<main id="local-html-artifact-e2e">Local NARS HTML artifact rendered through remote surface</main>',
    '</body>',
    '</html>',
  ].join(''), 'utf8');
  const audioPath = join(siteRoot, 'spoken.wav');
  assert.ok(existsSync(speechMcpMain), `expected built speech-mcp at ${speechMcpMain}; run pnpm --dir D:/code/mcp-surfaces --filter @narada2/speech-mcp build`);
  const speech = await callLiveSpeechMcp({
    siteRoot,
    outputPath: audioPath,
    text: 'Narada Cloudflare speech audio projection end to end test.',
  });
  assert.equal(speech.status, 'spoken');
  assert.equal(speech.provider, 'sapi');
  assert.equal(speech.retained_audio?.path, audioPath);
  assert.equal(speech.retained_audio?.content_type, 'audio/wav');
  assert.equal(existsSync(audioPath), true);
  assert.ok(statSync(audioPath).size > 44, 'expected speech MCP to retain a non-empty WAV file');

  const runtimeInput = new PassThrough();
  const runtimeOutput = new PassThrough();
  const eventHub = createEventHub();
  const events = [];
  let outputBuffer = '';
  let runtimePromise = null;
  let healthProjection = null;
  let eventProjection = null;
  const baseRuntimeContext = {
    identity: 'resident',
    session: sessionId,
    siteRoot,
    siteId: 'narada.e2e',
    operatorSurfaceKind: 'agent-web-ui',
    sessionPath: join(sessionDir, 'session.jsonl'),
    eventsPath: join(sessionDir, 'events.jsonl'),
    intelligenceProvider: 'codex-subscription',
    providerSettings: { provider: 'codex-subscription', model: 'gpt-5.5', thinking: 'medium', stream: false },
  };
  healthProjection = await startHealthProjection({ childStdin: () => runtimeInput, host: '127.0.0.1', port: 0, runtimeContext: { ...baseRuntimeContext, eventHub } });
  eventProjection = await startEventStreamProjection({ childStdin: () => runtimeInput, eventHub, host: '127.0.0.1', port: 0, eventsPath: baseRuntimeContext.eventsPath });
  const runtimeContext = { ...baseRuntimeContext, healthUrl: healthProjection.url, eventStreamUrl: eventProjection.url };
  const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
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
    callChatApiFn: async () => ({ choices: [{ message: { role: 'assistant', content: 'unused' } }] }),
    runtimeContext,
    dependencies: { ...dependencies, readMcpPreflightArtifact: () => null },
  });
  await waitFor(() => events.some((event) => event.event === 'session_started'), { timeoutMs: 2000 });
  runtimeInput.write(`${JSON.stringify({ id: 'artifact-register-1', method: 'session.artifacts.register', params: { source_path: htmlPath, kind: 'html', title: 'Remote HTML Preview', render_hint: 'inline', content_type: 'text/html; charset=utf-8' } })}\n`);
  await waitFor(() => events.some((event) => event.event === 'session_artifact_registered' && event.artifact?.title === 'Remote HTML Preview'), { timeoutMs: 2000 });
  const registeredArtifact = events.find((event) => event.event === 'session_artifact_registered' && event.artifact?.title === 'Remote HTML Preview')?.artifact;
  runtimeInput.write(`${JSON.stringify({ id: 'artifact-register-audio-1', method: 'session.artifacts.register', params: { source_path: audioPath, kind: 'audio', title: 'Remote Audio Briefing', render_hint: 'inline' } })}\n`);
  await waitFor(() => events.some((event) => event.event === 'session_artifact_registered' && event.artifact?.title === 'Remote Audio Briefing'), { timeoutMs: 2000 });
  const registeredAudioArtifact = events.find((event) => event.event === 'session_artifact_registered' && event.artifact?.title === 'Remote Audio Briefing')?.artifact;
  const presentedAudioResponse = await fetch(new URL(`/sessions/${sessionId}/artifacts/${registeredAudioArtifact?.artifact_id}/message`, healthProjection.url), {
    method: 'POST',
    body: JSON.stringify({ text: 'Spoken version is ready.' }),
  });
  assert.equal(presentedAudioResponse.status, 201);
  return {
    siteRoot,
    sessionId,
    artifactId: registeredArtifact?.artifact_id,
    audioArtifactId: registeredAudioArtifact?.artifact_id,
    audioPath,
    async close() {
      runtimeInput.end();
      if (runtimePromise) await Promise.race([runtimePromise, new Promise((resolve) => setTimeout(resolve, 1000))]);
      healthProjection?.server.close();
      eventProjection?.server.close();
      removeTempDir(siteRoot);
    },
  };
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

async function callLiveSpeechMcp({ siteRoot, outputPath, text }) {
  const child = spawnTestChild(process.execPath, [speechMcpMain], {
    cwd: dirname(speechMcpMain),
    env: {
      ...process.env,
      NARADA_SITE_ROOT: siteRoot,
      NARADA_WORKSPACE_ROOT: siteRoot,
      NARADA_SPEECH_ANNOUNCE_SPEAKER: 'false',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stdout = '';
  let stderr = '';
  let settled = false;
  const responsePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`speech_mcp_timeout: stdout=${stdout.slice(-1000)} stderr=${stderr.slice(-1000)}`));
      try { child.kill(); } catch { /* already exited */ }
    }, 45000);
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        settled = true;
        clearTimeout(timeout);
        resolve(JSON.parse(line));
      }
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code) => {
      if (settled) return;
      clearTimeout(timeout);
      reject(new Error(`speech_mcp_exited_before_response:${code}: stdout=${stdout.slice(-1000)} stderr=${stderr.slice(-1000)}`));
    });
  });
  child.stdin.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'speech_speak',
      arguments: {
        text,
        provider: 'sapi',
        announce_speaker: false,
        output_path: outputPath,
      },
    },
  })}\n`);
  const response = await responsePromise;
  child.stdin.end();
  try { child.kill(); } catch { /* already closed */ }
  if (response.error) throw new Error(`speech_mcp_error: ${JSON.stringify(response.error)}`);
  return response.result.structuredContent;
}

test('hosted Cloudflare projection web UI renders explicitly admitted local NARS HTML artifact', async () => {
  const browserPath = findHeadlessBrowser();
  assert.ok(browserPath, 'expected an installed Chromium-family browser for hosted artifact E2E');

  const localNars = await createRealNarsSiteWithHtmlArtifact();
  const { siteRoot, sessionId, artifactId, audioArtifactId, audioPath } = localNars;
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
        explicit_artifact_ids: [artifactId, audioArtifactId],
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
    assert.equal(bridge.projected_artifact_metadata_count, 2);
    assert.equal(bridge.projected_artifact_content_count, 2);

    const artifactResponse = await workerFetch(worker, `${workerBaseUrl}/api/nars/projections/${projectionId}/artifacts/${encodeURIComponent(artifactId)}/content`, {
      headers: { 'x-narada-browser-token-fingerprint': browserToken },
    });
    assert.equal(artifactResponse.status, 200);
    assert.match(await artifactResponse.text(), /Local NARS HTML artifact rendered through remote surface/);
    const audioArtifactResponse = await workerFetch(worker, `${workerBaseUrl}/api/nars/projections/${projectionId}/artifacts/${encodeURIComponent(audioArtifactId)}/content`, {
      headers: { 'x-narada-browser-token-fingerprint': browserToken },
    });
    assert.equal(audioArtifactResponse.status, 200);
    assert.equal(audioArtifactResponse.headers.get('content-type'), 'audio/wav');
    assert.equal(Buffer.from(await audioArtifactResponse.arrayBuffer()).byteLength, statSync(audioPath).size);

    const hostedUrl = `${workerBaseUrl}/?cloudflare_projection_id=${encodeURIComponent(projectionId)}&cloudflare_api_base_url=${encodeURIComponent(workerBaseUrl)}&cloudflare_browser_token=${encodeURIComponent(browserToken)}`;
    page = await openCdpPage({ browserPath, url: hostedUrl, userDataPrefix: 'narada-agent-web-ui-html-artifact-e2e-' });
    assert.equal((await waitForPageText(page, 'Browser projection attached', 15000)).found, true);
    assert.equal((await waitForPageText(page, 'Remote HTML Preview', 15000)).found, true);
    assert.equal((await waitForPageText(page, 'Remote Audio Briefing', 15000)).found, true);
    const iframe = await waitForPageTextWithAction(
      page,
      'Remote HTML Preview',
      15000,
      async () => page.evaluate('Boolean(document.querySelector("iframe.artifact-html-preview"))'),
    );
    assert.equal(iframe.found, true);
    const iframeSrc = await page.evaluate('document.querySelector("iframe.artifact-html-preview")?.src ?? ""');
    assert.equal(iframeSrc.includes(`/api/nars/projections/proj_html_artifact_e2e/artifacts/${encodeURIComponent(artifactId)}/content`), true);
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
      (entry) => String(entry.url ?? '').includes(`/api/nars/projections/proj_html_artifact_e2e/artifacts/${encodeURIComponent(artifactId)}/content`),
      5000,
    );
    assert.equal(iframeNetwork.found, true, JSON.stringify({ iframeMarkup, iframeNetwork }));
    assert.equal(iframeNetwork.status, 200, JSON.stringify(iframeNetwork));
    const servedIframe = servedResponses.find((entry) => entry.url.includes(`/api/nars/projections/proj_html_artifact_e2e/artifacts/${encodeURIComponent(artifactId)}/content`));
    assert.ok(servedIframe, JSON.stringify(servedResponses.map((entry) => ({ url: entry.url, status: entry.status, content_type: entry.content_type }))));
    assert.equal(servedIframe.status, 200);
    assert.match(servedIframe.body, /Local NARS HTML artifact rendered through remote surface/);
    const audio = await waitForPageTextWithAction(
      page,
      'Remote Audio Briefing',
      15000,
      async () => page.evaluate('Boolean(document.querySelector("audio.artifact-audio-preview[controls]"))'),
    );
    assert.equal(audio.found, true);
    const audioSrc = await page.evaluate('document.querySelector("audio.artifact-audio-preview")?.src ?? ""');
    assert.equal(audioSrc.includes(`/api/nars/projections/proj_html_artifact_e2e/artifacts/${encodeURIComponent(audioArtifactId)}/content`), true);
    const browserAudioResponse = await page.evaluate(`(async () => {
      const src = ${JSON.stringify(audioSrc)};
      const response = await fetch(src);
      return { status: response.status, contentType: response.headers.get('content-type'), byteLength: (await response.arrayBuffer()).byteLength };
    })()`);
    assert.equal(browserAudioResponse.status, 200, JSON.stringify(browserAudioResponse));
    assert.equal(browserAudioResponse.contentType, 'audio/wav');
    assert.equal(browserAudioResponse.byteLength, statSync(audioPath).size);
  } finally {
    if (page) await page.close();
    await closeServer(assetServerResult.server);
    await closeServer(workerServer);
    await localNars.close();
  }
});
