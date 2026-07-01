import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  buildProjectionRegistrationPlan,
  createBridgeState,
  planBridgeBackfill,
  projectNarsArtifactContentForCloudflare,
  projectNarsArtifactMetadataForCloudflare,
  projectNarsEventForCloudflare,
  projectionDegradedLaunchResult,
  type BridgeState,
  type CloudflareNarsProjectionIntent,
  type CloudflareNarsRemoteAccessRecord,
  type ProjectedArtifactContent,
  type ProjectedArtifactMetadata,
  type ProjectedEvent,
} from './index.js';

export const CLOUDFLARE_NARS_PROJECTION_STORE_SCHEMA = 'narada.cloudflare_nars_projection.store.v1';
export const CLOUDFLARE_NARS_PROJECTION_PREFLIGHT_SCHEMA = 'narada.cloudflare_nars_projection.preflight.v1';

export interface ProjectionStorePaths {
  projections_root: string;
  projection_dir: string;
  intent_path: string;
  remote_access_path: string;
  bridge_state_path: string;
  projected_events_path: string;
  projected_artifact_metadata_path: string;
  projected_artifact_content_path: string;
  cache_path: string;
  artifact_cache_path: string;
}

function normalizeBaseUrl(value: unknown): string | null {
  const raw = String(value ?? '').trim().replace(/\/+$/, '');
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function projectionPreflightRefusal(code: string, operatorAction: string, probe: unknown = null) {
  return {
    schema: CLOUDFLARE_NARS_PROJECTION_PREFLIGHT_SCHEMA,
    status: 'refused' as const,
    code,
    operator_action: operatorAction,
    probe,
  };
}

async function probeJsonEndpoint(fetchImpl: typeof fetch, url: string) {
  try {
    const response = await fetchImpl(url, { method: 'GET' });
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, url, body };
  } catch (error) {
    return { ok: false, status: 0, url, error: error instanceof Error ? error.message : String(error) };
  }
}

async function probeCarrierSiteRead(fetchImpl: typeof fetch, carrierBase: string, cookieHeader: string, siteId: string) {
  try {
    const response = await fetchImpl(`${carrierBase.replace(/\/+$/, '')}/api/carrier`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify({ operation: 'site.read', request_id: `projection_preflight_site_read_${Date.now()}`, params: { site_id: siteId, limit: 1 } }),
    });
    const body = await response.json().catch(() => null);
    return { ok: response.ok && Boolean((body as { ok?: unknown } | null)?.ok), status: response.status, site_id: siteId, body };
  } catch (error) {
    return { ok: false, status: 0, site_id: siteId, error: error instanceof Error ? error.message : String(error) };
  }
}

function readCookieHeader(path: string): string | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8').trim();
  if (!raw) return null;
  if (/^cookie:/i.test(raw)) return raw.replace(/^cookie:\s*/i, '').trim();
  if (/narada_operator_session=/.test(raw)) return raw;
  return `narada_operator_session=${raw}`;
}

export function projectionStorePaths(siteRoot: string, projectionId: string): ProjectionStorePaths {
  const root = join(requireNonEmpty(siteRoot, 'site_root'), '.narada', 'crew', 'nars-projections');
  const projectionDir = join(root, safePathSegment(requireNonEmpty(projectionId, 'projection_id')));
  return {
    projections_root: root,
    projection_dir: projectionDir,
    intent_path: join(projectionDir, 'intent.json'),
    remote_access_path: join(projectionDir, 'remote-access.json'),
    bridge_state_path: join(projectionDir, 'bridge-state.json'),
    projected_events_path: join(projectionDir, 'projected-events.jsonl'),
    projected_artifact_metadata_path: join(projectionDir, 'projected-artifact-metadata.jsonl'),
    projected_artifact_content_path: join(projectionDir, 'projected-artifact-content.jsonl'),
    cache_path: join(projectionDir, 'projection-cache.json'),
    artifact_cache_path: join(projectionDir, 'artifact-cache.json'),
  };
}

export function writeProjectionRegistrationPlan(input: Parameters<typeof buildProjectionRegistrationPlan>[0] & { site_root: string }) {
  const plan = buildProjectionRegistrationPlan(input);
  const paths = projectionStorePaths(input.site_root, plan.projection_id);
  mkdirSync(paths.projection_dir, { recursive: true });
  writeJson(paths.intent_path, plan.local_intent);
  writeJson(paths.remote_access_path, plan.remote_access);
  writeJson(paths.bridge_state_path, createBridgeState({
    projection_id: plan.projection_id,
    site_id: plan.local_intent.site_id,
    nars_session_id: plan.local_intent.nars_session_id,
    status: 'created',
  }, plan.local_intent.created_at));
  return { ...plan, local_intent_path: paths.intent_path, remote_access_path: paths.remote_access_path, bridge_state_path: paths.bridge_state_path };
}

export interface CloudflareProjectionRegistrationPreflightInput {
  cloudflare_api_base_url?: string | null;
  cloudflare_carrier_api_base_url?: string | null;
  operator_cookie_file?: string | null;
  site_coherence_site_id?: string | null;
  require_operator_session?: boolean;
  fetch_impl?: typeof fetch;
}

export async function preflightCloudflareProjectionRegistration(input: CloudflareProjectionRegistrationPreflightInput) {
  const fetchImpl = input.fetch_impl ?? fetch;
  const projectionBase = normalizeBaseUrl(input.cloudflare_api_base_url);
  if (!projectionBase) return projectionPreflightRefusal('cloudflare_api_base_url_required', 'Pass --cloudflare-api-base-url <url> for live Cloudflare registration.');

  const projectionHealth = await probeJsonEndpoint(fetchImpl, `${projectionBase}/api/nars/projections/health`);
  if (projectionHealth.status === 401 || projectionHealth.status === 403) {
    return projectionPreflightRefusal('cloudflare_projection_auth_refused', 'Refresh projection Worker credentials before registration.', projectionHealth);
  }
  if (!projectionHealth.ok) {
    return projectionPreflightRefusal('cloudflare_projection_health_unavailable', 'Deploy or repair the Cloudflare projection Worker before registration.', projectionHealth);
  }

  const carrierBase = normalizeBaseUrl(input.cloudflare_carrier_api_base_url);
  const cookieFile = String(input.operator_cookie_file ?? '').trim();
  if (input.require_operator_session && (!carrierBase || !cookieFile)) {
    return projectionPreflightRefusal('cloudflare_operator_session_required', 'Run pnpm cloudflare:operator:login, then pass --cloudflare-carrier-url and --operator-cookie-file.');
  }
  if (carrierBase || cookieFile) {
    if (!carrierBase) return projectionPreflightRefusal('cloudflare_carrier_api_base_url_required', 'Pass --cloudflare-carrier-url with --operator-cookie-file.');
    if (!cookieFile) return projectionPreflightRefusal('cloudflare_operator_cookie_file_required', 'Run pnpm cloudflare:operator:login or pass --operator-cookie-file.');
    const cookieHeader = readCookieHeader(cookieFile);
    if (!cookieHeader) return projectionPreflightRefusal('cloudflare_operator_cookie_file_unreadable', 'Run pnpm cloudflare:operator:login to refresh the operator session capture.');
    const siteRead = await probeCarrierSiteRead(fetchImpl, carrierBase, cookieHeader, input.site_coherence_site_id ?? 'site_narada_cloudflare');
    if (siteRead.status === 401) return projectionPreflightRefusal('cloudflare_operator_session_stale', 'Run pnpm cloudflare:operator:login, then retry projection registration.', siteRead);
    if (siteRead.status === 403) return projectionPreflightRefusal('cloudflare_operator_site_read_forbidden', 'Grant the captured operator principal active membership for the Cloudflare Site, then retry.', siteRead);
    if (!siteRead.ok) return projectionPreflightRefusal('cloudflare_site_read_unavailable', 'Run pnpm cloudflare:operator:check:human and repair Cloudflare site.read before projection registration.', siteRead);
  }

  return {
    schema: CLOUDFLARE_NARS_PROJECTION_PREFLIGHT_SCHEMA,
    status: 'ok' as const,
    projection_health: projectionHealth,
    operator_session_check: carrierBase || cookieFile ? 'verified' : 'not_checked',
    site_coherence_site_id: input.site_coherence_site_id ?? null,
  };
}

export async function registerProjectionRemotely(input: Parameters<typeof buildProjectionRegistrationPlan>[0] & {
  site_root: string;
  cloudflare_api_base_url: string;
  cloudflare_carrier_api_base_url?: string | null;
  operator_cookie_file?: string | null;
  site_coherence_site_id?: string | null;
  require_operator_session?: boolean;
  skip_preflight?: boolean;
  fetch_impl?: typeof fetch;
}) {
  const fetchImpl = input.fetch_impl ?? fetch;
  if (!input.skip_preflight) {
    const preflight = await preflightCloudflareProjectionRegistration({
      cloudflare_api_base_url: input.cloudflare_api_base_url,
      cloudflare_carrier_api_base_url: input.cloudflare_carrier_api_base_url,
      operator_cookie_file: input.operator_cookie_file,
      site_coherence_site_id: input.site_coherence_site_id,
      require_operator_session: input.require_operator_session,
      fetch_impl: fetchImpl,
    });
    if (preflight.status !== 'ok') return { status: 'remote_registration_preflight_refused' as const, preflight };
  }
  const local = writeProjectionRegistrationPlan(input);
  const endpoint = `${input.cloudflare_api_base_url.replace(/\/+$/, '')}/api/nars/projections/register`;
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ intent: local.local_intent }),
  });
  const body = await response.json().catch(() => null) as { remote_access?: CloudflareNarsRemoteAccessRecord; [key: string]: unknown } | null;
  if (!response.ok || !body?.remote_access) {
    return { ...local, status: 'remote_registration_failed' as const, remote_registration_endpoint: endpoint, remote_registration_status: response.status, remote_registration_response: body };
  }
  const paths = projectionStorePaths(input.site_root, local.projection_id);
  writeJson(paths.remote_access_path, body.remote_access);
  writeJson(paths.intent_path, { ...local.local_intent, remote_registration: { endpoint, registered_at: new Date().toISOString(), status: 'registered' } });
  return { ...local, status: 'registered_remotely' as const, remote_access: body.remote_access, remote_registration_endpoint: endpoint, remote_registration_status: response.status, remote_registration_response: body };
}

export async function deliverRemoteProjectionInputsOnce(args: {
  site_root: string;
  projection_id: string;
  cloudflare_api_base_url: string;
  max_inputs?: number;
  fetch_impl?: typeof fetch;
  submit_nars_input: (input: { input_id: string; method: string; payload: Record<string, unknown> }) => Promise<unknown> | unknown;
}) {
  const registration = readProjectionRegistration(args.site_root, args.projection_id);
  const bridgeToken = registration.remote_access?.bridge_credential.token_fingerprint;
  if (!bridgeToken) return { status: 'refused' as const, reason: 'bridge_credential_not_found', projection_id: args.projection_id, delivered_count: 0 };
  const base = `${args.cloudflare_api_base_url.replace(/\/+$/, '')}/api/nars/projections/${encodeURIComponent(args.projection_id)}`;
  const fetchImpl = args.fetch_impl ?? fetch;
  const pendingUrl = new URL(`${base}/input/pending`);
  if (args.max_inputs != null) pendingUrl.searchParams.set('max_inputs', String(args.max_inputs));
  const pendingResponse = await fetchImpl(pendingUrl, { headers: { 'x-narada-bridge-token-fingerprint': bridgeToken } });
  const pending = await pendingResponse.json().catch(() => null) as { status?: string; inputs?: Array<{ input_id: string; method: string; payload?: Record<string, unknown> }> } | null;
  if (!pendingResponse.ok || pending?.status !== 'ok') return { status: 'refused' as const, reason: 'pending_input_pull_failed', projection_id: args.projection_id, delivered_count: 0, pending_response: pending };
  const acknowledgements = [];
  for (const input of pending.inputs ?? []) {
    try {
      const narsAdmission = await args.submit_nars_input({ input_id: input.input_id, method: input.method, payload: input.payload ?? {} });
      const ack = await fetchImpl(`${base}/input/${encodeURIComponent(input.input_id)}/ack`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-narada-bridge-token-fingerprint': bridgeToken },
        body: JSON.stringify({ ok: true, nars_admission: narsAdmission }),
      });
      acknowledgements.push(await ack.json().catch(() => ({ status: ack.ok ? 'acknowledged' : 'unknown' })));
    } catch (error) {
      const ack = await fetchImpl(`${base}/input/${encodeURIComponent(input.input_id)}/ack`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-narada-bridge-token-fingerprint': bridgeToken },
        body: JSON.stringify({ ok: false, nars_admission: { status: 'refused_by_bridge', error: error instanceof Error ? error.message : String(error) } }),
      });
      acknowledgements.push(await ack.json().catch(() => ({ status: ack.ok ? 'acknowledged' : 'unknown' })));
    }
  }
  return { status: 'delivered' as const, projection_id: args.projection_id, delivered_count: acknowledgements.length, acknowledgements };
}

export function readProjectionRegistration(siteRoot: string, projectionId: string) {
  const paths = projectionStorePaths(siteRoot, projectionId);
  return {
    schema: CLOUDFLARE_NARS_PROJECTION_STORE_SCHEMA,
    projection_id: projectionId,
    paths,
    intent: readJson(paths.intent_path) as CloudflareNarsProjectionIntent | null,
    remote_access: readJson(paths.remote_access_path) as CloudflareNarsRemoteAccessRecord | null,
    bridge_state: readJson(paths.bridge_state_path) as BridgeState | null,
  };
}

export async function startLocalProjectionBridgeOnce(args: {
  site_root: string;
  projection_id: string;
  cloudflare_api_base_url?: string | null;
  fetch_impl?: typeof fetch;
  health_probe?: (endpoint: string) => Promise<'healthy' | 'unhealthy' | 'unavailable'> | 'healthy' | 'unhealthy' | 'unavailable';
  publish_event?: (event: ProjectedEvent) => Promise<unknown> | unknown;
  publish_artifact_metadata?: (metadata: ProjectedArtifactMetadata) => Promise<unknown> | unknown;
  publish_artifact_content?: (content: ProjectedArtifactContent) => Promise<unknown> | unknown;
  max_events?: number;
  max_artifacts?: number;
  now?: string;
}) {
  const now = args.now ?? new Date().toISOString();
  const registration = readProjectionRegistration(args.site_root, args.projection_id);
  if (!registration.intent || !registration.remote_access) {
    return bridgeRefusal(args, 'projection_registration_not_found', now);
  }
  const session = findSessionRecord(args.site_root, registration.intent.nars_session_id);
  if (!session) return bridgeRefusal(args, 'nars_session_not_found', now, registration.intent);
  const health = await probeSessionHealth(session.health_endpoint, args.health_probe);
  if (health !== 'healthy') {
    const state = createBridgeState({
      projection_id: registration.intent.projection_id,
      site_id: registration.intent.site_id,
      nars_session_id: registration.intent.nars_session_id,
      status: 'degraded',
      last_replicated_sequence: registration.bridge_state?.last_replicated_sequence ?? null,
      artifact_metadata_status: registration.bridge_state?.artifact_metadata_status ?? null,
      artifact_content_status: registration.bridge_state?.artifact_content_status ?? null,
      degraded_reason: `health_${health}`,
      retry_after_ms: 10000,
    }, now);
    writeJson(registration.paths.bridge_state_path, state);
    return { status: 'degraded', reason: `health_${health}`, projection_id: args.projection_id, bridge_state: state, degraded_launch: projectionDegradedLaunchResult({ projection_id: args.projection_id, reason: `health_${health}`, local_nars_healthy: false, retry_after_ms: 10000 }) };
  }
  const previous = registration.bridge_state ?? createBridgeState({
    projection_id: registration.intent.projection_id,
    site_id: registration.intent.site_id,
    nars_session_id: registration.intent.nars_session_id,
  }, now);
  const backfill = planBridgeBackfill(previous);
  const rawEvents = readEventsAfter(session.events_path, backfill.from_sequence, args.max_events ?? 200);
  const projected = rawEvents.flatMap((event) => {
    const next = projectNarsEventForCloudflare({
      projection_id: registration.intent!.projection_id,
      site_id: registration.intent!.site_id,
      nars_session_id: registration.intent!.nars_session_id,
      policy: registration.intent!.event_stream_policy,
      event,
      projected_at: now,
    });
    return next ? [next] : [];
  });
  const remotePublishers = createCloudflareRemoteProjectionPublishers({
    cloudflare_api_base_url: args.cloudflare_api_base_url,
    projection_id: args.projection_id,
    remote_access: registration.remote_access,
    fetch_impl: args.fetch_impl,
  });
  let artifactProjection: Awaited<ReturnType<typeof projectLocalArtifacts>>;
  try {
    for (const event of projected) await publishAll(event, args.publish_event, remotePublishers?.publish_event);
    artifactProjection = await projectLocalArtifacts({
      session,
      intent: registration.intent,
      paths: registration.paths,
      max_artifacts: args.max_artifacts ?? 200,
      now,
      publish_artifact_metadata: composePublisher(args.publish_artifact_metadata, remotePublishers?.publish_artifact_metadata),
      publish_artifact_content: composePublisher(args.publish_artifact_content, remotePublishers?.publish_artifact_content),
    });
  } catch (error) {
    const state = createBridgeState({
      projection_id: registration.intent.projection_id,
      site_id: registration.intent.site_id,
      nars_session_id: registration.intent.nars_session_id,
      status: 'degraded',
      last_replicated_sequence: previous.last_replicated_sequence,
      artifact_metadata_status: previous.artifact_metadata_status,
      artifact_content_status: previous.artifact_content_status,
      degraded_reason: 'remote_publish_failed',
      retry_after_ms: 10000,
    }, now);
    writeJson(registration.paths.bridge_state_path, state);
    return { status: 'degraded', reason: 'remote_publish_failed', projection_id: args.projection_id, bridge_state: state, error: error instanceof Error ? error.message : String(error), degraded_launch: projectionDegradedLaunchResult({ projection_id: args.projection_id, reason: 'remote_publish_failed', local_nars_healthy: true, retry_after_ms: 10000 }) };
  }
  appendJsonLines(registration.paths.projected_events_path, projected);
  writeJson(registration.paths.cache_path, { schema: 'narada.cloudflare_nars_projection.local_cache.v1', projection_id: args.projection_id, events: projected });
  writeJson(registration.paths.artifact_cache_path, { schema: 'narada.cloudflare_nars_projection.local_artifact_cache.v1', projection_id: args.projection_id, metadata: artifactProjection.metadata, content: artifactProjection.content });
  const lastSequence = projected.reduce<number | null>((max, event) => event.event_sequence == null ? max : Math.max(max ?? 0, event.event_sequence), previous.last_replicated_sequence);
  const state = createBridgeState({
    projection_id: registration.intent.projection_id,
    site_id: registration.intent.site_id,
    nars_session_id: registration.intent.nars_session_id,
    status: 'connected',
    last_replicated_sequence: lastSequence,
    artifact_metadata_status: artifactProjection.metadata_status,
    artifact_content_status: artifactProjection.content_status,
  }, now);
  writeJson(registration.paths.bridge_state_path, state);
  return { status: 'connected', projection_id: args.projection_id, bridge_state: state, backfill, projected_event_count: projected.length, projected_artifact_metadata_count: artifactProjection.metadata.length, projected_artifact_content_count: artifactProjection.content.length, projected_events_path: registration.paths.projected_events_path, projected_artifact_metadata_path: registration.paths.projected_artifact_metadata_path, projected_artifact_content_path: registration.paths.projected_artifact_content_path };
}

function createCloudflareRemoteProjectionPublishers(args: {
  cloudflare_api_base_url?: string | null;
  projection_id: string;
  remote_access: CloudflareNarsRemoteAccessRecord;
  fetch_impl?: typeof fetch;
}) {
  const baseUrl = normalizeBaseUrl(args.cloudflare_api_base_url);
  if (!baseUrl) return null;
  const bridgeToken = args.remote_access.bridge_credential?.token_fingerprint;
  if (!bridgeToken) throw new Error('bridge_credential_not_found_for_remote_publish');
  const fetchImpl = args.fetch_impl ?? fetch;
  const base = `${baseUrl}/api/nars/projections/${encodeURIComponent(args.projection_id)}`;
  const headers = { 'content-type': 'application/json', 'x-narada-bridge-token-fingerprint': bridgeToken };
  return {
    publish_event: (event: ProjectedEvent) => postProjectionJson(fetchImpl, `${base}/events`, { site_id: event.site_id, nars_session_id: event.nars_session_id, event: event.payload }, headers),
    publish_artifact_metadata: (artifact: ProjectedArtifactMetadata) => postProjectionJson(fetchImpl, `${base}/artifacts`, { artifact }, headers),
    publish_artifact_content: (artifact: ProjectedArtifactContent) => postProjectionJson(fetchImpl, `${base}/artifacts/${encodeURIComponent(artifact.artifact_id)}/content`, { artifact, content_base64: artifact.content_base64, headers: artifact.headers }, headers),
  };
}

function composePublisher<T>(first?: (value: T) => Promise<unknown> | unknown, second?: (value: T) => Promise<unknown> | unknown) {
  if (!first) return second;
  if (!second) return first;
  return (value: T) => publishAll(value, first, second);
}

async function publishAll<T>(value: T, ...publishers: Array<((value: T) => Promise<unknown> | unknown) | undefined>) {
  for (const publisher of publishers) await publisher?.(value);
}

async function postProjectionJson(fetchImpl: typeof fetch, url: string, body: Record<string, unknown>, headers: Record<string, string>) {
  const response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => null) as { status?: string; code?: string; [key: string]: unknown } | null;
  if (!response.ok || payload?.status === 'refused') {
    throw new Error(`cloudflare_projection_publish_failed:${response.status}:${payload?.code ?? payload?.status ?? 'unknown'}`);
  }
  return payload;
}

export async function startLocalProjectionBridgeLoop(args: Parameters<typeof startLocalProjectionBridgeOnce>[0] & {
  poll_interval_ms?: number;
  stop_after_iterations?: number;
  abort_signal?: AbortSignal;
  sleep_impl?: (ms: number) => Promise<unknown> | unknown;
}) {
  const pollIntervalMs = Math.max(0, Math.floor(args.poll_interval_ms ?? 5000));
  const stopAfterIterations = args.stop_after_iterations == null ? null : Math.max(1, Math.floor(args.stop_after_iterations));
  const sleepImpl = args.sleep_impl ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const results: unknown[] = [];
  let iteration = 0;
  while (!args.abort_signal?.aborted) {
    iteration += 1;
    const result = await startLocalProjectionBridgeOnce(args);
    results.push(result);
    if (stopAfterIterations && iteration >= stopAfterIterations) break;
    await sleepImpl(pollIntervalMs);
  }
  return {
    status: args.abort_signal?.aborted ? 'stopped' as const : 'completed' as const,
    projection_id: args.projection_id,
    iteration_count: results.length,
    last_result: results.at(-1) ?? null,
    results,
  };
}

function bridgeRefusal(args: { site_root: string; projection_id: string }, reason: string, now: string, intent: CloudflareNarsProjectionIntent | null = null) {
  const state = createBridgeState({
    projection_id: args.projection_id,
    site_id: intent?.site_id ?? 'unknown',
    nars_session_id: intent?.nars_session_id ?? 'unknown',
    status: 'stopped',
    degraded_reason: reason,
  }, now);
  const paths = projectionStorePaths(args.site_root, args.projection_id);
  mkdirSync(paths.projection_dir, { recursive: true });
  writeJson(paths.bridge_state_path, state);
  return { status: 'refused', reason, projection_id: args.projection_id, bridge_state: state };
}

function findSessionRecord(siteRoot: string, sessionId: string) {
  const indexPath = join(siteRoot, '.narada', 'crew', 'nars-sessions', 'index.json');
  const index = readJson(indexPath) as { sessions?: Array<Record<string, unknown>> } | null;
  const entry = index?.sessions?.find((candidate) => candidate.session_id === sessionId || candidate.carrier_session_id === sessionId);
  const recordPath = typeof entry?.record_path === 'string' ? entry.record_path : null;
  return recordPath ? readJson(recordPath) as Record<string, unknown> | null : null;
}

async function projectLocalArtifacts(args: {
  session: Record<string, unknown>;
  intent: CloudflareNarsProjectionIntent;
  paths: ProjectionStorePaths;
  max_artifacts: number;
  now: string;
  publish_artifact_metadata?: (metadata: ProjectedArtifactMetadata) => Promise<unknown> | unknown;
  publish_artifact_content?: (content: ProjectedArtifactContent) => Promise<unknown> | unknown;
}) {
  const artifacts = readLocalArtifactRecords(args.session).slice(0, Math.max(0, args.max_artifacts));
  const metadata: ProjectedArtifactMetadata[] = [];
  const content: ProjectedArtifactContent[] = [];
  let metadataRefused = 0;
  let contentRefused = 0;
  let lastMetadataError: string | null = null;
  let lastContentError: string | null = null;
  for (const artifact of artifacts) {
    const projectedMetadata = projectNarsArtifactMetadataForCloudflare({
      projection_id: args.intent.projection_id,
      site_id: args.intent.site_id,
      nars_session_id: args.intent.nars_session_id,
      policy: args.intent.artifact_projection_policy,
      artifact,
      projected_at: args.now,
    });
    if (!projectedMetadata.ok) {
      metadataRefused += 1;
      lastMetadataError = projectedMetadata.code;
      continue;
    }
    metadata.push(projectedMetadata.metadata);
    await args.publish_artifact_metadata?.(projectedMetadata.metadata);
    const sourcePath = typeof artifact.source_path === 'string' ? artifact.source_path : null;
    if (!sourcePath || !existsSync(sourcePath)) continue;
    const projectedContent = projectNarsArtifactContentForCloudflare({
      projection_id: args.intent.projection_id,
      site_id: args.intent.site_id,
      nars_session_id: args.intent.nars_session_id,
      policy: args.intent.artifact_projection_policy,
      artifact,
      content: readFileSync(sourcePath),
      headers: artifactContentHeadersForRecord(artifact),
      projected_at: args.now,
    });
    if (!projectedContent.ok) {
      contentRefused += 1;
      lastContentError = projectedContent.code;
      continue;
    }
    content.push(projectedContent.content);
    await args.publish_artifact_content?.(projectedContent.content);
  }
  appendJsonLines(args.paths.projected_artifact_metadata_path, metadata);
  appendJsonLines(args.paths.projected_artifact_content_path, content);
  return {
    metadata,
    content,
    metadata_status: laneStatus({ projected_count: metadata.length, refused_count: metadataRefused, last_error_code: lastMetadataError, now: args.now }),
    content_status: laneStatus({ projected_count: content.length, refused_count: contentRefused, last_error_code: lastContentError, now: args.now, disabled: args.intent.artifact_projection_policy.content === 'none' || args.intent.artifact_projection_policy.content === 'metadata_only' }),
  };
}

function readLocalArtifactRecords(session: Record<string, unknown>): Record<string, unknown>[] {
  const sessionPath = resolveSessionPath(session);
  if (!sessionPath) return [];
  const indexPath = join(dirname(sessionPath), 'artifacts', 'index.json');
  const index = readJson(indexPath) as { artifacts?: unknown[] } | null;
  return Array.isArray(index?.artifacts) ? index.artifacts.flatMap((entry) => entry && typeof entry === 'object' && !Array.isArray(entry) ? [entry as Record<string, unknown>] : []) : [];
}

function resolveSessionPath(session: Record<string, unknown>): string | null {
  if (typeof session.session_path === 'string') return session.session_path;
  if (typeof session.sessionPath === 'string') return session.sessionPath;
  if (typeof session.events_path === 'string') return join(dirname(session.events_path), 'session.jsonl');
  return null;
}

function artifactContentHeadersForRecord(record: Record<string, unknown>): Record<string, string> {
  if (record.kind !== 'html') return {};
  return {
    'content-security-policy': "sandbox allow-scripts allow-forms; default-src 'self' data: blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'",
    'x-narada-artifact-id': String(record.artifact_id ?? ''),
    'x-narada-artifact-kind': String(record.kind ?? ''),
  };
}

function laneStatus(args: { projected_count: number; refused_count: number; last_error_code: string | null; now: string; disabled?: boolean }) {
  return {
    status: args.disabled ? 'disabled' as const : args.last_error_code ? 'degraded' as const : 'connected' as const,
    last_projected_at: args.projected_count > 0 ? args.now : null,
    projected_count: args.projected_count,
    refused_count: args.refused_count,
    last_error_code: args.last_error_code,
  };
}

async function probeSessionHealth(endpoint: unknown, probe?: (endpoint: string) => Promise<'healthy' | 'unhealthy' | 'unavailable'> | 'healthy' | 'unhealthy' | 'unavailable') {
  if (typeof endpoint !== 'string' || !endpoint) return 'unavailable';
  if (probe) return await probe(endpoint);
  try {
    const response = await fetch(endpoint);
    return response.ok ? 'healthy' : 'unhealthy';
  } catch {
    return 'unavailable';
  }
}

function readEventsAfter(eventsPath: unknown, fromSequence: number, limit: number) {
  if (typeof eventsPath !== 'string' || !existsSync(eventsPath)) return [];
  return readFileSync(eventsPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try { return [JSON.parse(line) as Record<string, unknown>]; } catch { return []; }
    })
    .filter((event) => Number(event.event_sequence ?? event.sequence ?? 0) >= fromSequence)
    .slice(0, Math.max(0, limit));
}

function appendJsonLines(path: string, values: unknown[]) {
  if (!values.length) return;
  mkdirSync(dirname(path), { recursive: true });
  const prefix = existsSync(path) ? '\n' : '';
  writeFileSync(path, `${prefix}${values.map((value) => JSON.stringify(value)).join('\n')}`, { flag: 'a' });
}

function readJson(path: string) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function requireNonEmpty(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${name}_required`);
  return normalized;
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, '_').slice(0, 120) || 'projection';
}
