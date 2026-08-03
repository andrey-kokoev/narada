#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { validateRemoteCloudflareApiBaseUrl } from './lib/live-boundary.js';

type AnyRecord = Record<string, any>;
type SmokeArgs = {
  live: boolean;
  quiet: boolean;
  help: boolean;
  format: string;
  cloudflareApiBaseUrl: string | null;
  evidencePath: string | null;
  sessionId: string | null;
  siteId: string;
  userSiteId: string;
  hostSiteId: string;
  agentId: string;
  principalId: string | null;
  modelId: string | null;
  inferenceProviderId: string | null;
  authorityCredential: string | null;
};
type LiveWebSocketHandle = {
  socket: { close: () => void };
  messages: AnyRecord[];
};

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write([
    'Cloudflare NARS provider-capable live smoke',
    '',
    'Planning mode:',
    '  pnpm --filter @narada-core/cloudflare-operator-projection smoke:provider-capable-live',
    '',
    'Live mode:',
    '  pnpm --filter @narada-core/cloudflare-operator-projection smoke:provider-capable-live -- --live --cloudflare-api-base-url <url> --principal-id <principal> --browser-token <fingerprint>',
    '',
    'Optional identity/model selectors:',
    '  --site-id site:narada-cloudflare --user-site-id site:andrey-user --host-site-id site:narada-cloudflare',
    '  --model-id model:<id> --inference-provider-id inference-provider:<id>',
  ].join('\n'));
  process.exit(0);
}

async function openAuthorityWebSocket(baseUrl: string, sessionId: string, credential: string | null): Promise<LiveWebSocketHandle> {
  const WebSocketConstructor = (globalThis as typeof globalThis & {
    WebSocket?: new (url: string) => {
      addEventListener: (type: string, listener: (event: AnyRecord) => void) => void;
      close: () => void;
    };
  }).WebSocket;
  if (!WebSocketConstructor) throw new Error('websocket_runtime_unavailable');
  if (!credential) throw new Error('browser_token_required');
  const url = new URL(`${baseUrl}/api/nars/authority/sessions/${encodeURIComponent(sessionId)}/events/websocket`);
  url.searchParams.set('since_sequence', '0');
  url.searchParams.set('browser-token', credential);
  const messages: AnyRecord[] = [];
  const socket = new WebSocketConstructor(url.toString());
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('authority_websocket_connect_timeout')), 10000);
    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      try {
        const parsed = JSON.parse(event.data);
        if (!parsed || typeof parsed !== 'object') return;
        messages.push(parsed);
        if (parsed.event === 'websocket_connected') {
          clearTimeout(timeout);
          resolve();
        }
      } catch {
        // The smoke only consumes JSON authority frames.
      }
    });
    socket.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error('authority_websocket_connect_failed'));
    });
  });
  return { socket, messages };
}

async function waitForLiveEvent(
  handle: LiveWebSocketHandle,
  predicate: (event: AnyRecord) => boolean,
  label: string,
  timeoutMs = 10000,
): Promise<AnyRecord> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const event = handle.messages.find(predicate);
    if (event) return event;
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`authority_websocket_event_timeout:${label}`);
}

async function waitForLiveEventKinds(
  handle: LiveWebSocketHandle,
  eventKinds: string[],
  label: string,
  timeoutMs = 10000,
): Promise<void> {
  await Promise.all(eventKinds.map((eventKind) => waitForLiveEvent(handle, (event) => event?.event === eventKind, `${label}:${eventKind}`, timeoutMs)));
}

const result = await run();
if (args.format === 'json') {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`[cloudflare-operator-projection:provider] ${result.status}: ${result.code ?? 'checks_complete'}\n`);
  if (result.evidence_path) process.stdout.write(`evidence: ${result.evidence_path}\n`);
}
process.exitCode = result.status === 'passed' || result.status === 'planned' ? 0 : 1;

async function run(): Promise<AnyRecord> {
  if (!args.live) {
    return {
      schema: 'narada.cloudflare_nars_projection.provider_capable_live_smoke.v1',
      status: 'planned',
      code: 'live_flag_required',
      purpose: 'Prove a Cloudflare-origin NARS Durable Object can resolve a catalog-admitted plan, execute a Cloudflare-reachable provider, persist canonical turn evidence, and revoke the session.',
      required: ['--live', '--cloudflare-api-base-url', '--principal-id', '--browser-token'],
    };
  }
  if (!args.cloudflareApiBaseUrl) return persist({
    schema: 'narada.cloudflare_nars_projection.provider_capable_live_smoke.v1',
    status: 'refused',
    code: 'cloudflare_api_base_url_required',
  });
  if (!args.principalId) return persist({
    schema: 'narada.cloudflare_nars_projection.provider_capable_live_smoke.v1',
    status: 'refused',
    code: 'principal_id_required',
  });
  if (!args.authorityCredential) return persist({
    schema: 'narada.cloudflare_nars_projection.provider_capable_live_smoke.v1',
    status: 'refused',
    code: 'browser_token_required',
  });

  const remoteBoundary = validateRemoteCloudflareApiBaseUrl(args.cloudflareApiBaseUrl);
  if (!remoteBoundary.ok) return persist({
    schema: 'narada.cloudflare_nars_projection.provider_capable_live_smoke.v1',
    status: 'refused',
    code: remoteBoundary.code,
    message: remoteBoundary.message,
    deployment_boundary: 'remote_https_worker',
  });

  const baseUrl = remoteBoundary.origin;
  const sessionId = args.sessionId ?? `cf_nars_provider_${Date.now()}`;
  const sessionBase = `${baseUrl}/api/nars/authority/sessions/${encodeURIComponent(sessionId)}`;
  let cleanup: AnyRecord = { status: 'not_attempted' };
  let liveSocket: LiveWebSocketHandle | null = null;

  try {
    phase('reading provider-capable service health');
    const serviceHealth = await fetchJson(`${baseUrl}/api/nars/authority/health`);

    phase('creating an explicitly bound Cloudflare NARS session');
    const created = await fetchJson(`${baseUrl}/api/nars/authority/sessions`, {
      method: 'POST',
      body: {
        session_id: sessionId,
        site_id: args.siteId,
        user_site_id: args.userSiteId,
        host_site_id: args.hostSiteId,
        agent_id: args.agentId,
        principal_id: args.principalId,
      },
    });

    phase('checking available provider execution and runtime capability evidence');
    const sessionHealth = await fetchJson(`${sessionBase}/health`);
    const credentialMismatch = await fetchJson(`${sessionBase}/health`, {
      authorityCredential: 'fingerprint:cloudflare-provider-live-smoke-mismatch',
    });

    phase('opening the authority WebSocket before provider execution');
    liveSocket = await openAuthorityWebSocket(baseUrl, sessionId, args.authorityCredential);

    phase('admitting one provider-backed turn');
    const payload: AnyRecord = {
      message: 'Return the single word pong.',
      source: 'cloudflare-provider-capable-live-smoke',
      max_tool_rounds: 8,
    };
    if (args.modelId) payload.requested_model = args.modelId;
    if (args.inferenceProviderId) payload.requested_inference_provider = args.inferenceProviderId;
    const submitted = await fetchJson(`${sessionBase}/input`, {
      method: 'POST',
      body: { method: 'conversation.send', payload },
    });
    await waitForLiveEventKinds(liveSocket, ['provider_request', 'provider_response', 'assistant_message', 'turn_complete'], 'provider_turn');

    phase('reading canonical provider and turn events');
    const replay = await fetchJson(`${sessionBase}/events?since_sequence=0&max_events=200`);
    const events = Array.isArray(replay.body?.events) ? replay.body.events : [];
    const eventKinds = events.map((event: AnyRecord) => event?.payload?.event).filter(Boolean);
    const completedTurn = events.find((event: AnyRecord) =>
      event?.payload?.event === 'turn_complete' && event?.payload?.terminal_state === 'completed');
    const providerRequest = events.find((event: AnyRecord) => event?.payload?.event === 'provider_request');
    const providerResponse = events.find((event: AnyRecord) => event?.payload?.event === 'provider_response');
    const assistantMessage = events.find((event: AnyRecord) => event?.payload?.event === 'assistant_message');
    const postTurnHealth = await fetchJson(`${sessionBase}/health`);
    const providerResponseText = providerResponse?.payload?.response?.text;

    phase('admitting and verifying the cancellation control path');
    const cancellation = await fetchJson(`${sessionBase}/input`, {
      method: 'POST',
      body: {
        method: 'conversation.interrupt',
        payload: { message: 'provider-capable live smoke cancellation' },
      },
    });
    const cancellationInputId = cancellation.body?.input_id;
    await waitForLiveEvent(
      liveSocket,
      (event) => event?.event === 'turn_interrupted'
        && (typeof cancellationInputId !== 'string' || event?.input_id === cancellationInputId),
      'cancellation',
    );
    const cancellationReplay = await fetchJson(`${sessionBase}/events?since_sequence=0&max_events=300`);
    const cancellationEvents = Array.isArray(cancellationReplay.body?.events) ? cancellationReplay.body.events : [];
    const cancellationEvent = cancellationEvents.find((event: AnyRecord) => event?.payload?.event === 'turn_interrupted');
    const cancellationComplete = cancellationEvents.find((event: AnyRecord) =>
      event?.payload?.event === 'turn_complete' && event?.payload?.terminal_state === 'interrupted');
    const liveEventKinds = liveSocket.messages.map((event) => event?.event).filter(Boolean);

    phase('revoking the provider-capable session');
    cleanup = await fetchJson(sessionBase, { method: 'DELETE' });
    await waitForLiveEvent(
      liveSocket,
      (event) => event?.event === 'authority_session_revoked' && event?.session_id === sessionId,
      'session_revocation',
    );
    const postRevokeHealth = await fetchJson(`${sessionBase}/health`);
    const postRevokeReplay = await fetchJson(`${sessionBase}/events?since_sequence=0&max_events=300`);
    const postRevokeEvents = Array.isArray(postRevokeReplay.body?.events) ? postRevokeReplay.body.events : [];
    const liveRevocation = liveSocket.messages.find((event) => event?.event === 'authority_session_revoked');
    const passed =
      serviceHealth.body?.status === 'healthy'
      && serviceHealth.body?.execution === 'canonical_invokable_intelligence_gateway'
      && serviceHealth.body?.execution_availability === 'available'
      && created.body?.status === 'created'
      && created.body?.session?.execution_mode === 'canonical_invokable_intelligence_gateway'
      && created.body?.session?.principal_id === args.principalId
      && created.body?.session?.provider_execution_state === 'declared'
      && sessionHealth.body?.status === 'healthy'
      && sessionHealth.body?.execution_availability === 'available'
      && sessionHealth.body?.runtime_surface_contract?.capability_profile?.provider_execution === 'declared'
      && credentialMismatch.http_status === 403
      && credentialMismatch.body?.code === 'authority_credential_mismatch'
      && liveEventKinds.includes('provider_request')
      && liveEventKinds.includes('provider_response')
      && liveEventKinds.includes('assistant_message')
      && liveEventKinds.includes('turn_complete')
      && submitted.body?.status === 'admitted'
      && replay.body?.status === 'ok'
      && Boolean(providerRequest)
      && Boolean(providerResponse)
      && typeof providerResponseText === 'string'
      && providerResponseText.trim().length > 0
      && Boolean(assistantMessage)
      && Boolean(completedTurn)
      && postTurnHealth.body?.status === 'healthy'
      && postTurnHealth.body?.runtime_surface_contract?.capability_profile?.provider_execution === 'present'
      && cancellation.body?.status === 'admitted'
      && Boolean(cancellationEvent)
      && Boolean(cancellationComplete)
      && cancellationReplay.body?.status === 'ok'
      && cleanup.body?.status === 'revoked'
      && postRevokeHealth.http_status === 403
      && postRevokeHealth.body?.ok === false
      && postRevokeHealth.body?.code === 'session_revoked'
      && postRevokeHealth.body?.session_id === sessionId
      && postRevokeReplay.body?.status === 'ok'
      && postRevokeReplay.body?.terminal === true
      && postRevokeEvents.some((event: AnyRecord) => event?.payload?.event === 'authority_session_revoked')
      && Boolean(liveRevocation);

    liveSocket.socket.close();

    return persist({
      schema: 'narada.cloudflare_nars_projection.provider_capable_live_smoke.v1',
      status: passed ? 'passed' : 'failed',
      code: passed ? 'cloudflare_provider_capable_runtime_verified' : 'cloudflare_provider_capable_runtime_check_failed',
      deployment_boundary: remoteBoundary.deployment_boundary,
      cloudflare_api_base_url: baseUrl,
      session_id: sessionId,
      identity: {
        site_id: args.siteId,
        user_site_id: args.userSiteId,
        host_site_id: args.hostSiteId,
        principal_id: args.principalId,
      },
      requested_selection: {
        model_id: args.modelId,
        inference_provider_id: args.inferenceProviderId,
      },
      checks: {
        service_health: serviceHealth,
        created,
        session_health: sessionHealth,
        credential_mismatch: credentialMismatch,
        websocket_live_event_kinds: liveEventKinds,
        submitted,
        replay: { ...replay, event_kinds: eventKinds },
        provider_request: providerRequest ?? null,
        provider_response: providerResponse ?? null,
        assistant_message: assistantMessage ?? null,
        completed_turn: completedTurn ?? null,
        post_turn_health: postTurnHealth,
        cancellation,
        cancellation_replay: { ...cancellationReplay, event: cancellationEvent ?? null, completion: cancellationComplete ?? null },
        cleanup,
        post_revoke_health: postRevokeHealth,
        post_revoke_replay: postRevokeReplay,
        websocket_revocation: liveRevocation,
      },
    });
  } catch (error) {
    try {
      cleanup = await fetchJson(sessionBase, { method: 'DELETE' });
    } catch {
      cleanup = { status: 'cleanup_failed' };
    }
    liveSocket?.socket.close();
    return persist({
      schema: 'narada.cloudflare_nars_projection.provider_capable_live_smoke.v1',
      status: 'failed',
      code: 'cloudflare_provider_capable_live_smoke_error',
      error: error instanceof Error ? error.message : String(error),
      cloudflare_api_base_url: baseUrl,
      session_id: sessionId,
      cleanup,
    });
  }
}

async function fetchJson(url: string, { method = 'GET', body, authorityCredential }: AnyRecord = {}): Promise<AnyRecord> {
  const credential = authorityCredential === undefined ? args.authorityCredential : authorityCredential;
  const response = await fetch(url, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(credential ? { 'x-narada-browser-token-fingerprint': credential } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { parse_error: 'invalid_json', text_sample: text.slice(0, 500) };
  }
  return { http_status: response.status, ok: response.ok, body: parsed };
}

function persist(result: AnyRecord): AnyRecord {
  const evidencePath = resolve(args.evidencePath ?? '../../.narada/evidence/cloudflare-nars-provider-capable-live.json');
  const evidence = { ...result, observed_at: new Date().toISOString(), evidence_path: evidencePath };
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

function phase(message: string): void {
  if (!args.quiet && args.format !== 'json') process.stderr.write(`[cloudflare-operator-projection:provider] ${message}\n`);
}

function parseArgs(values: string[]): SmokeArgs {
  const parsed: SmokeArgs = {
    live: false,
    quiet: false,
    help: false,
    format: 'human',
    cloudflareApiBaseUrl: null,
    evidencePath: null,
    sessionId: null,
    siteId: 'site:narada-cloudflare',
    userSiteId: 'site:andrey-user',
    hostSiteId: 'site:narada-cloudflare',
    agentId: 'cloudflare.nars.provider-capable',
    principalId: null,
    modelId: null,
    inferenceProviderId: null,
    authorityCredential: null,
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--') continue;
    if (value === '--live') parsed.live = true;
    else if (value === '--quiet') parsed.quiet = true;
    else if (value === '--help' || value === '-h') parsed.help = true;
    else if (value === '--format') parsed.format = values[++index] ?? 'human';
    else if (value === '--cloudflare-api-base-url') parsed.cloudflareApiBaseUrl = values[++index] ?? null;
    else if (value === '--evidence-path') parsed.evidencePath = values[++index] ?? null;
    else if (value === '--session-id') parsed.sessionId = values[++index] ?? null;
    else if (value === '--site-id') parsed.siteId = values[++index] ?? parsed.siteId;
    else if (value === '--user-site-id') parsed.userSiteId = values[++index] ?? parsed.userSiteId;
    else if (value === '--host-site-id') parsed.hostSiteId = values[++index] ?? parsed.hostSiteId;
    else if (value === '--agent-id') parsed.agentId = values[++index] ?? parsed.agentId;
    else if (value === '--principal-id') parsed.principalId = values[++index] ?? null;
    else if (value === '--model-id') parsed.modelId = values[++index] ?? null;
    else if (value === '--inference-provider-id') parsed.inferenceProviderId = values[++index] ?? null;
    else if (value === '--browser-token' || value === '--authority-credential') parsed.authorityCredential = values[++index] ?? null;
    else throw new Error(`unknown_option:${value}`);
  }
  return parsed;
}
