import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawnTestChild } from '@narada2/process-launch-posture';
import { startAgentWebUiServer } from '../src/server.js';
import { startSessionCoreRuntime } from './e2e/nars-runtime-fixture.mjs';
import {
  findHeadlessBrowser,
  openCdpPage,
  waitForPageText,
  waitForPageTextWithAction,
} from '../../cloudflare-nars-projection/scripts/lib/browser-smoke.mjs';

const now = '2026-07-05T12:00:00.000Z';
const speechMcpMain = fileURLToPath(new URL('../../../../mcp-surfaces/packages/speech-mcp/dist/src/main.js', import.meta.url));
const speechProviderRegistryPath = fileURLToPath(new URL('../../../../mcp-surfaces/packages/speech-mcp/config/provider-registry.v2.json', import.meta.url));

test('live speech MCP retained audio projects as a NARS audio artifact in agent-web-ui', async () => {
  const browserPath = findHeadlessBrowser();
  assert.ok(browserPath, 'expected an installed Chromium-family browser for live speech audio projection E2E');
  assert.ok(existsSync(speechMcpMain), `expected built speech-mcp at ${speechMcpMain}; run pnpm --dir D:/code/mcp-surfaces --filter @narada2/speech-mcp build`);
  assert.ok(existsSync(speechProviderRegistryPath), `expected speech provider registry at ${speechProviderRegistryPath}`);

  const runtime = await startLiveNarsRuntime();
  const audioPath = join(runtime.siteRoot, 'speech-output', 'live-speech-audio-projection.wav');
  mkdirSync(dirname(audioPath), { recursive: true });

  let page = null;
  try {
    const speech = await callLiveSpeechMcp({
      siteRoot: runtime.siteRoot,
      outputPath: audioPath,
      text: 'Narada live speech audio projection end to end test.',
    });
    assert.equal(speech.status, 'spoken');
    assert.equal(speech.provider, 'sapi');
    assert.equal(speech.retained_audio?.path, audioPath);
    assert.equal(speech.retained_audio?.content_type, 'audio/wav');
    assert.equal(existsSync(audioPath), true);
    assert.ok(statSync(audioPath).size > 44, 'expected speech MCP to retain a non-empty WAV file');

    const registeredResponse = await fetch(new URL(`/sessions/${runtime.sessionId}/artifacts`, runtime.healthProjection.url), {
      method: 'POST',
      body: JSON.stringify({
        source_path: audioPath,
        kind: 'audio',
        title: 'Live Speech Audio Briefing',
        render_hint: 'inline',
      }),
    });
    assert.equal(registeredResponse.status, 201);
    const registered = await registeredResponse.json();
    const artifactId = registered.artifact?.artifact_id;
    assert.ok(artifactId);
    assert.equal(registered.artifact.kind, 'audio');
    assert.equal(registered.artifact.content_type, 'audio/wav');
    assert.equal(registered.artifact.source_path, undefined);

    const presentedResponse = await fetch(new URL(`/sessions/${runtime.sessionId}/artifacts/${encodeURIComponent(artifactId)}/message`, runtime.healthProjection.url), {
      method: 'POST',
      body: JSON.stringify({ text: 'Live speech audio is ready.' }),
    });
    assert.equal(presentedResponse.status, 201);
    assert.match(readFileSync(runtime.eventsPath, 'utf8'), /Live Speech Audio Briefing/);

    const localWeb = await startAgentWebUiServer({
      host: '127.0.0.1',
      port: 0,
      eventEndpoint: runtime.eventProjection.url,
      healthEndpoint: runtime.healthProjection.url,
    });
    runtime.localWeb = localWeb;

    page = await openCdpPage({ browserPath, url: localWeb.url, userDataPrefix: 'narada-agent-web-ui-live-speech-audio-e2e-' });
    const artifactFrame = await page.waitForWebSocketFrame((frame) => String(frame.payload_data ?? '').includes('Live Speech Audio Briefing'), 5000);
    assert.equal(artifactFrame.found, true, JSON.stringify(artifactFrame));
    const titleWait = await waitForPageText(page, 'Live Speech Audio Briefing', 15000);
    assert.equal(titleWait.found, true, JSON.stringify(titleWait));
    const audio = await waitForPageTextWithAction(
      page,
      'Live Speech Audio Briefing',
      15000,
      async () => page.evaluate('Boolean(document.querySelector("audio.artifact-audio-preview[controls]"))'),
    );
    assert.equal(audio.found, true);
    const audioSrc = await page.evaluate('document.querySelector("audio.artifact-audio-preview")?.src ?? ""');
    assert.match(audioSrc, new RegExp(`/sessions/${runtime.sessionId}/artifacts/${artifactId}/content`));
    const browserAudioResponse = await page.evaluate(`(async () => {
      const response = await fetch(${JSON.stringify(audioSrc)});
      return { status: response.status, contentType: response.headers.get('content-type'), byteLength: (await response.arrayBuffer()).byteLength };
    })()`);
    assert.equal(browserAudioResponse.status, 200, JSON.stringify(browserAudioResponse));
    assert.equal(browserAudioResponse.contentType, 'audio/wav');
    assert.equal(browserAudioResponse.byteLength, statSync(audioPath).size);
  } finally {
    if (page) await page.close();
    await runtime.close();
  }
});

async function startLiveNarsRuntime() {
  return startSessionCoreRuntime({
    identity: 'resident',
    sessionId: 'nars_live_speech_audio_e2e',
    siteId: 'narada.live-speech-audio-e2e',
    responseContent: 'unused',
    startWeb: false,
  });
}

async function callLiveSpeechMcp({ siteRoot, outputPath, text }) {
  const child = spawnTestChild(process.execPath, [speechMcpMain], {
    cwd: dirname(speechMcpMain),
    env: {
      ...process.env,
      NARADA_SITE_ROOT: siteRoot,
      NARADA_WORKSPACE_ROOT: siteRoot,
      NARADA_PROVIDER_REGISTRY_PATH: speechProviderRegistryPath,
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
        selection: { provider: 'sapi', model: 'default' },
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
