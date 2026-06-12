#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const PUT_OPERATION = 'resident_dispatch.local_resident_carrier_bridge.put';
const LIST_OPERATION = 'resident_dispatch.local_resident_carrier_bridge.list';
const DEFAULT_BRIDGE_REASON = 'governed_local_resident_carrier_evidence_admitted_into_cloudflare_replay_surface';
const DEFAULT_BRIDGE_AUTHORITY = 'cloudflare_operator_local_resident_carrier_bridge';
const DEFAULT_BRIDGE_POSTURE = 'local_resident_inhabitance_bridged_to_cloudflare_replay';

export function parseResidentDispatchLocalResidentCarrierBridgeArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const operation = normalizeOperation(option(args, '--operation') ?? env.CLOUDFLARE_CARRIER_LOCAL_RESIDENT_CARRIER_BRIDGE_OPERATION ?? null);
  const operationId = normalizeOptionalString(option(args, '--operation-id') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? null);
  const dispatchDecisionId = normalizeOptionalString(option(args, '--dispatch-decision-id') ?? env.CLOUDFLARE_CARRIER_DISPATCH_DECISION_ID ?? null);
  const fallbackEvidenceId = normalizeOptionalString(option(args, '--fallback-evidence-id') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_EVIDENCE_ID ?? null);
  const localResidentSessionRef = normalizeOptionalString(option(args, '--local-resident-session-ref') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_LOCAL_SESSION_REF ?? null);
  const cloudflareCarrierSessionId = normalizeOptionalString(option(args, '--cloudflare-carrier-session-id') ?? env.CLOUDFLARE_CARRIER_SESSION_ID ?? null);
  const bridgeId = normalizeOptionalString(option(args, '--bridge-id') ?? env.CLOUDFLARE_CARRIER_LOCAL_RESIDENT_CARRIER_BRIDGE_ID ?? null);
  const generatedAt = normalizeOptionalString(option(args, '--generated-at') ?? env.CLOUDFLARE_CARRIER_LOCAL_RESIDENT_CARRIER_BRIDGE_GENERATED_AT ?? null) ?? new Date(now()).toISOString();
  const bridgeAdmissionReason = normalizeOptionalString(option(args, '--bridge-admission-reason') ?? env.CLOUDFLARE_CARRIER_LOCAL_RESIDENT_CARRIER_BRIDGE_REASON ?? null) ?? DEFAULT_BRIDGE_REASON;
  const bridgeAuthority = normalizeOptionalString(option(args, '--bridge-authority') ?? env.CLOUDFLARE_CARRIER_LOCAL_RESIDENT_CARRIER_BRIDGE_AUTHORITY ?? null) ?? DEFAULT_BRIDGE_AUTHORITY;
  const limit = option(args, '--limit') ?? env.CLOUDFLARE_CARRIER_LOCAL_RESIDENT_CARRIER_BRIDGE_LIMIT ?? null;
  const requestId = option(args, '--request-id') ?? env.CLOUDFLARE_CARRIER_LOCAL_RESIDENT_CARRIER_BRIDGE_REQUEST_ID ?? `local_resident_carrier_bridge_${bridgeId ?? operationId ?? now()}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_CARRIER_LOCAL_RESIDENT_CARRIER_BRIDGE_FORMAT ?? 'json';
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('local_resident_carrier_bridge_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('local_resident_carrier_bridge_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!['json', 'text'].includes(format)) throw new Error(`local_resident_carrier_bridge_format_unsupported:${format}`);
  if (!auth) throw new Error('local_resident_carrier_bridge_requires_bearer_token_or_operator_session');
  if (operation === PUT_OPERATION && !operationId) {
    throw new Error('local_resident_carrier_bridge_requires_--operation-id_or_CLOUDFLARE_CARRIER_OPERATION_ID');
  }

  return {
    operation,
    workerUrl,
    requestId,
    format,
    auth,
    params: operation === PUT_OPERATION
      ? {
          site_id: siteId,
          ...(bridgeId ? { bridge_id: bridgeId } : {}),
          source_payload: {
            generated_at: generatedAt,
            operation_id: operationId,
            ...(dispatchDecisionId ? { dispatch_decision_id: dispatchDecisionId } : {}),
            ...(fallbackEvidenceId ? { fallback_evidence_id: fallbackEvidenceId } : {}),
            local_resident_session_ref: localResidentSessionRef,
            ...(cloudflareCarrierSessionId ? { cloudflare_carrier_session_id: cloudflareCarrierSessionId } : {}),
            bridge_admission_action: 'admit',
            bridge_admission_reason: bridgeAdmissionReason,
            bridge_authority: bridgeAuthority,
            cloudflare_session_replay_binding_admission: 'admitted_by_cloudflare_operator',
            cloudflare_evidence_replay_binding_admission: 'admitted_by_cloudflare_operator',
            cloudflare_runtime_session_start_admission: 'not_admitted',
            bridge_posture: DEFAULT_BRIDGE_POSTURE,
          },
        }
      : {
          site_id: siteId,
          ...(operationId ? { operation_id: operationId } : {}),
          ...(dispatchDecisionId ? { dispatch_decision_id: dispatchDecisionId } : {}),
          ...(fallbackEvidenceId ? { fallback_evidence_id: fallbackEvidenceId } : {}),
          ...(limit ? { limit: Number(limit) } : {}),
        },
  };
}

export async function runResidentDispatchLocalResidentCarrierBridge(config, fetchImpl = fetch) {
  const resolvedConfig = config.operation === PUT_OPERATION
    ? await resolveBridgePutConfig(config, fetchImpl)
    : config;
  const response = await fetchImpl(`${resolvedConfig.workerUrl}/api/carrier`, {
    method: 'POST',
    headers: {
      ...authHeaders(resolvedConfig.auth),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      operation: resolvedConfig.operation,
      request_id: resolvedConfig.requestId,
      params: resolvedConfig.params,
    }),
  });
  const body = await response.json().catch(() => ({}));
  return {
    schema: 'narada.cloudflare_carrier.local_resident_carrier_bridge.v1',
    operation: resolvedConfig.operation,
    status: response.ok && body?.ok ? 'ok' : 'failed',
    worker_url: resolvedConfig.workerUrl,
    auth_source: resolvedConfig.auth.source,
    site_id: resolvedConfig.params.site_id,
    operation_id: resolvedConfig.params.operation_id ?? resolvedConfig.params.source_payload?.operation_id ?? null,
    http_status: response.status,
    response: body,
    summary: summarizeResidentDispatchLocalResidentCarrierBridge(resolvedConfig.operation, body, resolvedConfig.params),
  };
}

async function resolveBridgePutConfig(config, fetchImpl) {
  const sourcePayload = config.params.source_payload ?? {};
  if (sourcePayload.local_resident_session_ref) return config;
  const response = await fetchImpl(`${config.workerUrl}/api/carrier`, {
    method: 'POST',
    headers: {
      ...authHeaders(config.auth),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      operation: 'resident_dispatch.windows_fallback_evidence.list',
      request_id: `${config.requestId}_fallback_lookup`,
      params: {
        site_id: config.params.site_id,
        operation_id: config.params.source_payload?.operation_id ?? config.params.operation_id ?? null,
        limit: 1,
      },
    }),
  });
  const body = await response.json().catch(() => ({}));
  const evidence = Array.isArray(body?.evidence) ? body.evidence[0] ?? null : null;
  if (!evidence) throw new Error('local_resident_carrier_bridge_requires_existing_windows_fallback_evidence');
  return {
    ...config,
    params: {
      ...config.params,
      source_payload: {
        ...sourcePayload,
        dispatch_decision_id: sourcePayload.dispatch_decision_id ?? evidence.dispatch_decision_id ?? null,
        fallback_evidence_id: sourcePayload.fallback_evidence_id ?? evidence.fallback_evidence_id ?? null,
        local_resident_session_ref: sourcePayload.local_resident_session_ref ?? evidence.local_resident_session_ref ?? null,
      },
    },
  };
}

export function summarizeResidentDispatchLocalResidentCarrierBridge(operation, body = {}, params = {}) {
  if (operation === LIST_OPERATION) {
    const bridgeRecords = Array.isArray(body?.bridge_records) ? body.bridge_records : [];
    const entry = bridgeRecords[0] ?? null;
    return {
      bridge_count: bridgeRecords.length,
      bridge_id: entry?.bridge_id ?? null,
      bridge_status: body?.status ?? null,
      operation_id: entry?.operation_id ?? params.operation_id ?? null,
      dispatch_decision_id: entry?.dispatch_decision_id ?? null,
      fallback_evidence_id: entry?.fallback_evidence_id ?? null,
      local_resident_session_ref: entry?.local_resident_session_ref ?? null,
      cloudflare_carrier_session_id: entry?.cloudflare_carrier_session_id ?? null,
      cloudflare_session_replay_binding_admission: entry?.cloudflare_session_replay_binding_admission ?? null,
      cloudflare_evidence_replay_binding_admission: entry?.cloudflare_evidence_replay_binding_admission ?? null,
      cloudflare_runtime_session_start_admission: entry?.cloudflare_runtime_session_start_admission ?? null,
      bridge_authority: entry?.bridge_authority ?? null,
    };
  }
  const bridge = body?.bridge ?? null;
  const record = body?.record ?? null;
  return {
    bridge_count: record ? 1 : 0,
    bridge_id: record?.bridge_id ?? params.bridge_id ?? null,
    bridge_status: body?.status ?? null,
    operation_id: bridge?.operation_id ?? record?.operation_id ?? params.source_payload?.operation_id ?? null,
    dispatch_decision_id: bridge?.dispatch_decision_id ?? record?.dispatch_decision_id ?? params.source_payload?.dispatch_decision_id ?? null,
    fallback_evidence_id: bridge?.fallback_evidence_id ?? record?.fallback_evidence_id ?? params.source_payload?.fallback_evidence_id ?? null,
    local_resident_session_ref: bridge?.local_resident_session_ref ?? record?.local_resident_session_ref ?? params.source_payload?.local_resident_session_ref ?? null,
    cloudflare_carrier_session_id: bridge?.cloudflare_carrier_session_id ?? record?.cloudflare_carrier_session_id ?? params.source_payload?.cloudflare_carrier_session_id ?? null,
    cloudflare_session_replay_binding_admission: body?.cloudflare_session_replay_binding_admission ?? record?.cloudflare_session_replay_binding_admission ?? bridge?.cloudflare_session_replay_binding_admission ?? params.source_payload?.cloudflare_session_replay_binding_admission ?? null,
    cloudflare_evidence_replay_binding_admission: body?.cloudflare_evidence_replay_binding_admission ?? record?.cloudflare_evidence_replay_binding_admission ?? bridge?.cloudflare_evidence_replay_binding_admission ?? params.source_payload?.cloudflare_evidence_replay_binding_admission ?? null,
    cloudflare_runtime_session_start_admission: body?.cloudflare_runtime_session_start_admission ?? record?.cloudflare_runtime_session_start_admission ?? bridge?.cloudflare_runtime_session_start_admission ?? params.source_payload?.cloudflare_runtime_session_start_admission ?? null,
    bridge_authority: body?.local_resident_carrier_bridge_authority ?? record?.bridge_authority ?? bridge?.bridge_authority ?? params.source_payload?.bridge_authority ?? null,
  };
}

export function formatResidentDispatchLocalResidentCarrierBridgeText(result = {}) {
  const summary = result.summary ?? {};
  const response = result.response ?? {};
  return [
    'Local Resident Carrier Bridge',
    `Worker: ${result.worker_url ?? 'unknown'}`,
    `Auth: ${result.auth_source ?? 'unknown'}`,
    `Operation: ${result.operation ?? 'unknown'}`,
    `Site: ${result.site_id ?? 'unknown'}`,
    `Operation Id: ${summary.operation_id ?? result.operation_id ?? 'unknown'}`,
    `HTTP: ${result.http_status ?? 'unknown'}`,
    `Status: ${result.status ?? 'unknown'}`,
    `Bridge Status: ${summary.bridge_status ?? 'unknown'}`,
    `Bridge Count: ${summary.bridge_count ?? 0}`,
    `Bridge: ${summary.bridge_id ?? 'none'}`,
    `Fallback Evidence: ${summary.fallback_evidence_id ?? 'none'}`,
    `Local Resident Session: ${summary.local_resident_session_ref ?? 'unknown'}`,
    `Cloudflare Carrier Session: ${summary.cloudflare_carrier_session_id ?? 'unknown'}`,
    `Session Replay Admission: ${summary.cloudflare_session_replay_binding_admission ?? 'unknown'}`,
    `Evidence Replay Admission: ${summary.cloudflare_evidence_replay_binding_admission ?? 'unknown'}`,
    `Runtime Session Start: ${summary.cloudflare_runtime_session_start_admission ?? 'unknown'}`,
    `Bridge Authority: ${summary.bridge_authority ?? 'unknown'}`,
    ...(response?.code ? [`Code: ${response.code}`] : []),
  ].join('\n');
}

async function main() {
  const config = parseResidentDispatchLocalResidentCarrierBridgeArgs(process.argv.slice(2), process.env);
  const result = await runResidentDispatchLocalResidentCarrierBridge(config);
  if (config.format === 'text') {
    console.log(formatResidentDispatchLocalResidentCarrierBridgeText(result));
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function normalizeOperation(operation) {
  if (!operation || operation === PUT_OPERATION || operation === 'put') return PUT_OPERATION;
  if (operation === LIST_OPERATION || operation === 'list') return LIST_OPERATION;
  throw new Error(`local_resident_carrier_bridge_operation_unsupported:${operation}`);
}

function normalizeOptionalString(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeWorkerUrl(value) {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized.replace(/\/+$/, '') : null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    await main();
  } catch (error) {
    console.error(JSON.stringify({ ok: false, code: error?.message ?? String(error) }, null, 2));
    process.exit(1);
  }
}
