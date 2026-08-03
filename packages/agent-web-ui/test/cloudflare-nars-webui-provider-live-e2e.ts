#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildProjectionRegistrationPlan } from '@narada-core/cloudflare-operator-projection';
import { validateRemoteCloudflareApiBaseUrl } from '../../cloudflare-operator-projection/scripts/lib/live-boundary.js';
import {
  findHeadlessBrowser,
  openCdpPage,
  waitForPageText,
} from '../../cloudflare-operator-projection/scripts/lib/browser-smoke.js';

type AnyRecord = Record<string, any>;
type LiveSocket = {
  socket: { close: () => void };
  messages: AnyRecord[];
};
type LiveArgs = {
  live: boolean;
  help: boolean;
  quiet: boolean;
  projectionUrl: string | null;
  narsUrl: string | null;
  evidencePath: string | null;
  sessionId: string | null;
  projectionId: string | null;
  principalId: string | null;
  authorityCredential: string | null;
  siteId: string;
  userSiteId: string;
  hostSiteId: string;
  agentId: string;
  modelId: string | null;
  inferenceProviderId: string | null;
  timeoutMs: number;
};

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  process.stdout.write([
    'Cloudflare Web UI -> Cloudflare projection -> Cloudflare NARS -> provider live E2E',
    '',
    'Planning mode:',
    '  pnpm --filter @narada-core/agent-web-ui test:live:cloudflare-nars-webui-provider',
    '',
    'Live mode:',
    '  pnpm --filter @narada-core/agent-web-ui test:live:cloudflare-nars-webui-provider -- --live --cloudflare-projection-url <url> --cloudflare-nars-url <url> --principal-id principal:andrey',
    '',
    'The authority browser credential is generated unless --browser-token is supplied.',
  ].join('\n'));
  process.exit(0);
}

const result = await run();
if (args.quiet) {
  process.stdout.write(`${JSON.stringify({ status: result.status, code: result.code, evidence_path: result.evidence_path ?? null })}\n`);
} else {
  process.stdout.write(`[agent-web-ui:cloudflare-nars-webui-provider] ${result.status}: ${result.code ?? 'checks_complete'}\n`);
  if (result.evidence_path) process.stdout.write(`evidence: ${result.evidence_path}\n`);
}
process.exitCode = result.status === 'passed' || result.status === 'planned' ? 0 : 1;

async function run(): Promise<AnyRecord> {
  if (!args.live) {
    return {
      schema: 'narada.agent_web_ui.cloudflare_nars_webui_provider_live_e2e.v1',
      status: 'planned',
      code: 'live_flag_required',
      purpose: 'Prove a deployed Cloudflare-hosted Web UI submits through a deployed Cloudflare projection Worker to a deployed Cloudflare NARS authority, receives a provider-backed response, and renders that response in the browser.',
      required: ['--live', '--cloudflare-projection-url', '--cloudflare-nars-url', '--principal-id'],
      topology: 'cloudflare_surface -> cloudflare_projection -> cloudflare_authority -> provider -> cloudflare_projection -> browser',
    };
  }
  if (!args.projectionUrl) return persistedRefusal('cloudflare_projection_url_required');
  if (!args.narsUrl) return persistedRefusal('cloudflare_nars_url_required');
  if (!args.principalId) return persistedRefusal('principal_id_required');

  const projectionBoundary = validateRemoteCloudflareApiBaseUrl(args.projectionUrl);
  const narsBoundary = validateRemoteCloudflareApiBaseUrl(args.narsUrl);
  if (!projectionBoundary.ok) return persistedRefusal(projectionBoundary.code, projectionBoundary.message);
  if (!narsBoundary.ok) return persistedRefusal(narsBoundary.code, narsBoundary.message);

  const projectionBaseUrl = projectionBoundary.origin;
  const narsBaseUrl = narsBoundary.origin;
  const sessionId = args.sessionId ?? `cf_webui_provider_${Date.now()}`;
  const projectionId = args.projectionId ?? `proj_cf_webui_provider_${Date.now()}`;
  const authorityCredential = args.authorityCredential ?? `fingerprint:cloudflare-webui-provider:${Date.now()}`;
  const narsSessionBase = `${narsBaseUrl}/api/nars/authority/sessions/${encodeURIComponent(sessionId)}`;
  const projectionBase = `${projectionBaseUrl}/api/nars/projections/${encodeURIComponent(projectionId)}`;
  const browserPath = findHeadlessBrowser();
  if (!browserPath) return persistedRefusal('headless_browser_required');

  let page: AnyRecord | null = null;
  let authoritySocket: LiveSocket | null = null;
  let authoritySessionCreated = false;
  let projectionCreated = false;
  let outcome: AnyRecord;
  let closeResult: AnyRecord | null = null;
  let cleanup: AnyRecord = { projection: null, authority_session: null };

  try {
    const serviceHealth = await fetchJson(`${narsBaseUrl}/api/nars/authority/health`, { authorityCredential });
    requireResponse(serviceHealth, 'cloudflare_nars_authority_health');

    const created = await fetchJson(`${narsBaseUrl}/api/nars/authority/sessions`, {
      method: 'POST',
      authorityCredential,
      body: {
        session_id: sessionId,
        site_id: args.siteId,
        user_site_id: args.userSiteId,
        host_site_id: args.hostSiteId,
        agent_id: args.agentId,
        principal_id: args.principalId,
      },
    });
    requireResponse(created, 'cloudflare_nars_authority_session_create');
    assert.equal(created.body?.status, 'created', compactResponse(created));
    authoritySessionCreated = true;

    const projectionIntent = buildProjectionRegistrationPlan({
      site_id: args.siteId,
      site_root: null,
      nars_session_id: sessionId,
      projection_id: projectionId,
      projection_api_base_url: projectionBaseUrl,
      created_by: 'cloudflare-nars-webui-provider-live-e2e',
      event_stream_policy: 'diagnostic',
      authority_runtime_host: 'cloudflare-host',
      authority_epoch: 1,
      authority_runtime_id: `cloudflare-nars-authority:${sessionId}`,
      dry_run: false,
    });
    const registered = await fetchJson(`${projectionBaseUrl}/api/nars/projections/register`, {
      method: 'POST',
      body: { intent: projectionIntent.local_intent },
    });
    requireResponse(registered, 'cloudflare_projection_registration');
    assert.equal(registered.body?.status, 'registered', compactResponse(registered));
    projectionCreated = true;
    const remoteAccess = registered.body?.remote_access;
    const bridgeCredential = remoteAccess?.bridge_credential?.token_fingerprint;
    const browserCredential = remoteAccess?.browser_access_tokens?.[0]?.token_fingerprint;
    assert.equal(typeof bridgeCredential, 'string', compactResponse(registered));
    assert.equal(typeof browserCredential, 'string', compactResponse(registered));
    assert.equal(remoteAccess?.authority_runtime_host, 'cloudflare-host', compactResponse(registered));
    assert.equal(remoteAccess?.runtime_surface_contract?.quadrant, 'cloudflare/cloudflare', compactResponse(registered));

    authoritySocket = await openAuthorityWebSocket(narsBaseUrl, sessionId, authorityCredential);

    const hostedUrl = new URL(`${projectionBaseUrl}/sessions/`);
    hostedUrl.searchParams.set('cloudflare_projection_id', projectionId);
    hostedUrl.searchParams.set('cloudflare_api_base_url', projectionBaseUrl);
    hostedUrl.searchParams.set('cloudflare_browser_token', browserCredential);
    hostedUrl.searchParams.set('smoke_cache_bust', String(Date.now()));

    page = await openCdpPage({
      browserPath,
      url: hostedUrl.toString(),
      userDataPrefix: 'narada-cloudflare-nars-webui-provider-',
      instrumentWebSocketClose: true,
    });
    assert.equal((await waitForPageText(page, 'Browser projection attached', 15000)).found, true);
    assert.equal((await waitForPageText(page, 'stream connected', 15000)).found, true);

    const message = 'Return the single word pong.';
    const inputNetworkCount = page.networkResponseCount();
    const inputNetworkPromise = page.waitForNetworkResponse(
      (entry: AnyRecord) => entry.method === 'POST' && entry.url?.includes(`/api/nars/projections/${encodeURIComponent(projectionId)}/input`),
      args.timeoutMs,
      inputNetworkCount,
    );
    const relayPromise = relayProjectionToCloudflareNars({
      projectionBase,
      narsSessionBase,
      bridgeCredential,
      authorityCredential,
      authoritySocket,
      siteId: args.siteId,
      sessionId,
      timeoutMs: args.timeoutMs,
    });
    await page.fill('#operator-input', message);
    await page.click('.composer-submit');
    const inputNetwork = await inputNetworkPromise;
    const relay = await relayPromise;
    assert.equal(inputNetwork.found, true, JSON.stringify(inputNetwork));
    assert.equal(inputNetwork.status >= 200 && inputNetwork.status < 300, true, JSON.stringify(inputNetwork));
    assert.equal(relay.input_admission?.status, 'admitted', JSON.stringify(relay));
    assert.equal(relay.provider_response_text, 'pong', JSON.stringify(relay));
    assert.equal(relay.assistant_message_content, 'pong', JSON.stringify(relay));
    assert.ok(relay.published_event_kinds.includes('operator_input_admitted'), JSON.stringify(relay));
    assert.ok(relay.published_event_kinds.includes('provider_request'), JSON.stringify(relay));
    assert.ok(relay.published_event_kinds.includes('provider_response'), JSON.stringify(relay));
    assert.ok(relay.published_event_kinds.includes('assistant_message'), JSON.stringify(relay));
    assert.ok(relay.published_event_kinds.includes('turn_complete'), JSON.stringify(relay));

    const browserAssistant = await waitForPageText(page, 'pong', args.timeoutMs);
    assert.equal(browserAssistant.found, true, JSON.stringify(browserAssistant));
    const browserProjectionFrame = await page.waitForWebSocketFrame(
      (entry: AnyRecord) => entry.url?.includes(`/api/nars/projections/${encodeURIComponent(projectionId)}/events/websocket`)
        && entry.payload_data?.includes('"event":"assistant_message"')
        && entry.payload_data?.includes('pong'),
      args.timeoutMs,
    );
    assert.equal(browserProjectionFrame.found, true, JSON.stringify(browserProjectionFrame));

    const projectionEventSocketPath = `/api/nars/projections/${encodeURIComponent(projectionId)}/events/websocket`;
    closeResult = await page.closeWebSockets(projectionEventSocketPath);
    assert.equal(closeResult.closed > 0, true, JSON.stringify(closeResult));
    const reconnecting = await waitForPageText(page, 'attached, reconnecting', Math.min(args.timeoutMs, 10000));
    assert.equal(reconnecting.found, true, JSON.stringify(reconnecting));
    const recovered = await waitForPageText(page, 'stream connected', args.timeoutMs);
    assert.equal(recovered.found, true, JSON.stringify(recovered));

    const intelligenceState = await page.evaluate(`(() => {
      const box = document.querySelector('.intelligence-status-box');
      return {
        present: Boolean(box),
        rawInputs: box?.querySelectorAll('input')?.length ?? 0,
        requestChangeVisible: Boolean(box?.querySelector('.intelligence-change-actions')),
      };
    })()`);
    assert.equal(intelligenceState.present, true, JSON.stringify(intelligenceState));
    assert.equal(intelligenceState.rawInputs, 0, JSON.stringify(intelligenceState));
    assert.equal(intelligenceState.requestChangeVisible, false, JSON.stringify(intelligenceState));

    const fatalRuntimeDiagnostics = page.runtimeDiagnostics().filter((entry: AnyRecord) => JSON.stringify(entry).includes('fatal runtime topology transition'));
    assert.deepEqual(fatalRuntimeDiagnostics, [], JSON.stringify(fatalRuntimeDiagnostics));

    const narsReplay = await fetchJson(`${narsSessionBase}/events?since_sequence=0&max_events=200`, { authorityCredential });
    const projectionReplay = await fetchJson(`${projectionBase}/events?since_sequence=0&max_events=200&view=raw`, { browserCredential });
    requireResponse(narsReplay, 'cloudflare_nars_authority_replay');
    requireResponse(projectionReplay, 'cloudflare_projection_replay');
    const narsEventKinds = eventKinds(narsReplay.body?.events);
    const projectionEventKinds = eventKinds(projectionReplay.body?.events);
    assert.ok(narsEventKinds.includes('provider_response'), JSON.stringify(narsEventKinds));
    assert.ok(narsEventKinds.includes('assistant_message'), JSON.stringify(narsEventKinds));
    assert.ok(projectionEventKinds.includes('operator_input_admitted'), JSON.stringify(projectionEventKinds));
    assert.ok(projectionEventKinds.includes('assistant_message'), JSON.stringify(projectionEventKinds));

    outcome = {
      schema: 'narada.agent_web_ui.cloudflare_nars_webui_provider_live_e2e.v1',
      status: 'passed',
      code: 'cloudflare_webui_to_cloudflare_nars_provider_verified',
      deployment_boundary: {
        projection: projectionBoundary.deployment_boundary,
        nars: narsBoundary.deployment_boundary,
      },
      topology: 'cloudflare_surface -> cloudflare_projection -> cloudflare_authority -> provider -> cloudflare_projection -> browser',
      endpoints: {
        projection_worker: projectionBaseUrl,
        nars_worker: narsBaseUrl,
        hosted_web_ui: redactUrl(hostedUrl.toString()),
      },
      correlation: {
        session_id: sessionId,
        projection_id: projectionId,
        input_id: relay.input_admission.input_id,
        provider_response_text: relay.provider_response_text,
        assistant_message_content: relay.assistant_message_content,
      },
      checks: {
        authority_service_health: compactResponse(serviceHealth),
        authority_session: compactResponse(created),
        projection_registration: {
          status: registered.body?.status,
          authority_runtime_host: remoteAccess.authority_runtime_host,
          runtime_surface_quadrant: remoteAccess.runtime_surface_contract?.quadrant,
        },
        browser: {
          attached: true,
          stream_connected: true,
          projection_websocket_assistant_frame: true,
          visible_assistant_text: 'pong',
          input_network_status: inputNetwork.status,
          reconnecting: true,
          reconnect_recovered: true,
          intelligence_box: intelligenceState,
          fatal_runtime_diagnostics: 0,
        },
        relay: relaySummary(relay),
        nars_event_kinds: narsEventKinds,
        projection_event_kinds: projectionEventKinds,
      },
    };
  } catch (error) {
    outcome = {
      schema: 'narada.agent_web_ui.cloudflare_nars_webui_provider_live_e2e.v1',
      status: 'failed',
      code: 'cloudflare_webui_to_cloudflare_nars_provider_live_e2e_error',
      deployment_boundary: {
        projection: projectionBoundary.deployment_boundary,
        nars: narsBoundary.deployment_boundary,
      },
      endpoints: {
        projection_worker: projectionBaseUrl,
        nars_worker: narsBaseUrl,
      },
      session_id: sessionId,
      projection_id: projectionId,
      error: error instanceof Error ? error.message : String(error),
      browser_diagnostics: page ? {
        body_markers: await bodyMarkers(page),
        websocket_frames: page.webSocketFrames().slice(-6).map((frame: AnyRecord) => ({ url: frame.url, payload: String(frame.payload_data ?? '').slice(0, 300) })),
        close_result: closeResult,
        websocket_instrumentation: await page.webSocketInstrumentation().catch((diagnosticError: unknown) => ({ error: String(diagnosticError) })),
        runtime_diagnostics: page.runtimeDiagnostics().slice(-6),
      } : null,
    };
  } finally {
    if (projectionCreated) {
      cleanup.projection = await fetchJson(`${projectionBase}`, { method: 'DELETE' }).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
    }
    if (authoritySessionCreated) {
      cleanup.authority_session = await fetchJson(narsSessionBase, { method: 'DELETE', authorityCredential }).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
    }
    authoritySocket?.socket.close();
    if (page) await page.close();
  }

  return persist({ ...outcome, cleanup });
}

async function relayProjectionToCloudflareNars(input: {
  projectionBase: string;
  narsSessionBase: string;
  bridgeCredential: string;
  authorityCredential: string;
  authoritySocket: LiveSocket;
  siteId: string;
  sessionId: string;
  timeoutMs: number;
}): Promise<AnyRecord> {
  const deadline = Date.now() + input.timeoutMs;
  const published: AnyRecord[] = [];
  let messageIndex = 0;
  let inputAdmission: AnyRecord | null = null;
  let providerResponseText: string | null = null;
  let assistantMessageContent: string | null = null;
  let terminalState: string | null = null;

  while (Date.now() < deadline) {
    const authorityMessages = input.authoritySocket.messages.slice();
    while (messageIndex < authorityMessages.length) {
      const event = authorityMessages[messageIndex++];
      if (!event?.event || event.event === 'websocket_connected') continue;
      const projected = await fetchJson(`${input.projectionBase}/events`, {
        method: 'POST',
        bridgeCredential: input.bridgeCredential,
        body: { site_id: input.siteId, nars_session_id: input.sessionId, event },
      });
      published.push({ event: event.event, status: projected.body?.status ?? null, code: projected.body?.code ?? null });
      if (event.event === 'provider_response') providerResponseText = String(event.response?.text ?? '');
      if (event.event === 'assistant_message') assistantMessageContent = String(event.content ?? '');
      if (event.event === 'turn_complete') terminalState = String(event.terminal_state ?? '');
    }

    if (terminalState === 'failed') {
      throw new Error(`cloudflare_projection_nars_relay_failed:${JSON.stringify({
        input_admission: inputAdmission,
        published: published.slice(-12),
        authority_events: input.authoritySocket.messages.slice(-12).map(summarizeAuthorityEvent),
      })}`);
    }

    const pending = await fetchJson(`${input.projectionBase}/input/pending?max_inputs=4`, { bridgeCredential: input.bridgeCredential });
    if (pending.ok && Array.isArray(pending.body?.inputs)) {
      for (const remoteInput of pending.body.inputs) {
        const admitted = await fetchJson(`${input.narsSessionBase}/input`, {
          method: 'POST',
          authorityCredential: input.authorityCredential,
          body: { method: remoteInput.method, payload: remoteInput.payload },
        });
        const ack = await fetchJson(`${input.projectionBase}/input/${encodeURIComponent(remoteInput.input_id)}/ack`, {
          method: 'POST',
          bridgeCredential: input.bridgeCredential,
          body: {
            ok: admitted.body?.status === 'admitted',
            nars_admission: admitted.body,
          },
        });
        inputAdmission = {
          input_id: remoteInput.input_id,
          method: remoteInput.method,
          status: admitted.body?.status ?? null,
          projection_ack_status: ack.body?.status ?? null,
          payload: {
            message: remoteInput.payload?.message ?? null,
            source: remoteInput.payload?.source ?? null,
          },
        };
      }
    }

    if (inputAdmission?.status === 'admitted' && providerResponseText && assistantMessageContent && terminalState === 'completed') {
      return {
        input_admission: inputAdmission,
        provider_response_text: providerResponseText,
        assistant_message_content: assistantMessageContent,
        terminal_state: terminalState,
        published_event_kinds: published.filter((entry) => entry.status === 'published').map((entry) => entry.event),
        published: published.slice(-20),
      };
    }
    await delay(100);
  }
  throw new Error(`cloudflare_projection_nars_relay_timeout:${JSON.stringify({
    input_admission: inputAdmission,
    provider_response_text: providerResponseText,
    assistant_message_content: assistantMessageContent,
    terminal_state: terminalState,
    published: published.slice(-8),
    authority_events: input.authoritySocket.messages.slice(-12).map(summarizeAuthorityEvent),
  })}`);
}

function summarizeAuthorityEvent(event: AnyRecord): AnyRecord {
  return {
    event: event?.event ?? null,
    input_id: event?.input_id ?? null,
    reason_code: event?.reason_code ?? null,
    error_code: event?.error_code ?? null,
    code: event?.code ?? null,
    explanation: event?.explanation ?? null,
    message: event?.message ?? null,
    terminal_state: event?.terminal_state ?? null,
  };
}

async function openAuthorityWebSocket(baseUrl: string, sessionId: string, credential: string): Promise<LiveSocket> {
  const WebSocketConstructor = (globalThis as typeof globalThis & { WebSocket?: any }).WebSocket;
  if (!WebSocketConstructor) throw new Error('websocket_runtime_unavailable');
  const url = new URL(`${baseUrl}/api/nars/authority/sessions/${encodeURIComponent(sessionId)}/events/websocket`);
  url.searchParams.set('since_sequence', '0');
  url.searchParams.set('browser-token', credential);
  const messages: AnyRecord[] = [];
  const socket = new WebSocketConstructor(url.toString());
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('authority_websocket_connect_timeout')), 10000);
    socket.addEventListener('message', (event: AnyRecord) => {
      try {
        const parsed = JSON.parse(String(event.data));
        if (!parsed || typeof parsed !== 'object') return;
        messages.push(parsed);
        if (parsed.event === 'websocket_connected') {
          clearTimeout(timer);
          resolve();
        }
      } catch {
        // Ignore non-JSON frames; the authority protocol is JSON-only.
      }
    });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('authority_websocket_connect_failed'));
    });
  });
  return { socket, messages };
}

async function fetchJson(url: string, options: AnyRecord = {}): Promise<AnyRecord> {
  const headers = new Headers(options.headers ?? {});
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  if (options.authorityCredential) headers.set('x-narada-browser-token-fingerprint', options.authorityCredential);
  if (options.browserCredential) headers.set('x-narada-browser-token-fingerprint', options.browserCredential);
  if (options.bridgeCredential) headers.set('x-narada-bridge-token-fingerprint', options.bridgeCredential);
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { parse_error: 'invalid_json', text_sample: text.slice(0, 500) };
  }
  return { http_status: response.status, ok: response.ok, body };
}

function requireResponse(response: AnyRecord, label: string): void {
  if (!response.ok) throw new Error(`${label}:${JSON.stringify(compactResponse(response))}`);
}

function compactResponse(response: AnyRecord): AnyRecord {
  const body = response?.body;
  return {
    http_status: response?.http_status ?? null,
    ok: response?.ok ?? null,
    status: body?.status ?? null,
    code: body?.code ?? null,
    message: body?.message ?? null,
    session_id: body?.session_id ?? body?.session?.session_id ?? null,
    projection_id: body?.projection_id ?? null,
  };
}

function eventKinds(events: unknown): string[] {
  if (!Array.isArray(events)) return [];
  return events.map((entry: AnyRecord) => entry?.payload?.event ?? entry?.event).filter((value): value is string => typeof value === 'string');
}

function relaySummary(relay: AnyRecord): AnyRecord {
  return {
    input_admission: relay.input_admission,
    provider_response_text: relay.provider_response_text,
    assistant_message_content: relay.assistant_message_content,
    terminal_state: relay.terminal_state,
    published_event_kinds: relay.published_event_kinds,
    published: relay.published,
  };
}

async function bodyMarkers(page: AnyRecord): Promise<AnyRecord> {
  const text = String(await page.evaluate('document.body?.innerText ?? ""'));
  return {
    has_projection_attached: text.includes('Browser projection attached'),
    has_stream_connected: text.includes('stream connected'),
    has_pong: text.includes('pong'),
    length: text.length,
  };
}

function redactUrl(value: string): string {
  const url = new URL(value);
  if (url.searchParams.has('cloudflare_browser_token')) url.searchParams.set('cloudflare_browser_token', '[redacted]');
  return url.toString();
}

function persistedRefusal(code: string, message?: string): AnyRecord {
  return persist({
    schema: 'narada.agent_web_ui.cloudflare_nars_webui_provider_live_e2e.v1',
    status: 'refused',
    code,
    ...(message ? { message } : {}),
  });
}

function persist(result: AnyRecord): AnyRecord {
  const evidencePath = resolve(args.evidencePath ?? '../../.narada/evidence/cloudflare-nars-webui-provider-live.json');
  const evidence = { ...result, observed_at: new Date().toISOString(), evidence_path: evidencePath };
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return evidence;
}

function parseArgs(values: string[]): LiveArgs {
  const parsed: LiveArgs = {
    live: false,
    help: false,
    quiet: false,
    projectionUrl: null,
    narsUrl: null,
    evidencePath: null,
    sessionId: null,
    projectionId: null,
    principalId: null,
    authorityCredential: null,
    siteId: 'site:narada-cloudflare',
    userSiteId: 'site:andrey-user',
    hostSiteId: 'site:narada-cloudflare',
    agentId: 'cloudflare.nars.webui-provider-live',
    modelId: null,
    inferenceProviderId: null,
    timeoutMs: 30000,
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--') continue;
    if (value === '--live') parsed.live = true;
    else if (value === '--help' || value === '-h') parsed.help = true;
    else if (value === '--quiet') parsed.quiet = true;
    else if (value === '--cloudflare-projection-url') parsed.projectionUrl = values[++index] ?? null;
    else if (value === '--cloudflare-nars-url') parsed.narsUrl = values[++index] ?? null;
    else if (value === '--evidence-path') parsed.evidencePath = values[++index] ?? null;
    else if (value === '--session-id') parsed.sessionId = values[++index] ?? null;
    else if (value === '--projection-id') parsed.projectionId = values[++index] ?? null;
    else if (value === '--principal-id') parsed.principalId = values[++index] ?? null;
    else if (value === '--browser-token' || value === '--authority-credential') parsed.authorityCredential = values[++index] ?? null;
    else if (value === '--site-id') parsed.siteId = values[++index] ?? parsed.siteId;
    else if (value === '--user-site-id') parsed.userSiteId = values[++index] ?? parsed.userSiteId;
    else if (value === '--host-site-id') parsed.hostSiteId = values[++index] ?? parsed.hostSiteId;
    else if (value === '--agent-id') parsed.agentId = values[++index] ?? parsed.agentId;
    else if (value === '--model-id') parsed.modelId = values[++index] ?? null;
    else if (value === '--inference-provider-id') parsed.inferenceProviderId = values[++index] ?? null;
    else if (value === '--timeout-ms') parsed.timeoutMs = Number(values[++index] ?? parsed.timeoutMs);
    else throw new Error(`unknown_option:${value}`);
  }
  if (!Number.isFinite(parsed.timeoutMs) || parsed.timeoutMs < 5000) parsed.timeoutMs = 30000;
  return parsed;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
