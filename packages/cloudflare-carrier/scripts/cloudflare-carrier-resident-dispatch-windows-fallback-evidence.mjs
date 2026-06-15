#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const PUT_OPERATION = 'resident_dispatch.windows_fallback_evidence.put';
const LIST_OPERATION = 'resident_dispatch.windows_fallback_evidence.list';
const DEFAULT_WINDOWS_ADMISSION_REASON = 'windows_resident_loop_started_session_after_cloudflare_primary_dispatch_failure';
const DEFAULT_EXECUTOR_AUTHORITY = 'windows_local_site_resident_loop';
const DEFAULT_EVIDENCE_POSTURE = 'windows_resident_loop_executed_fallback_cloudflare_recorded_session_start_evidence';

export function parseResidentDispatchWindowsFallbackEvidenceArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const operation = normalizeOperation(option(args, '--operation') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_EVIDENCE_OPERATION ?? null);
  const operationId = normalizeOptionalString(option(args, '--operation-id') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? null);
  const dispatchDecisionId = normalizeOptionalString(option(args, '--dispatch-decision-id') ?? env.CLOUDFLARE_CARRIER_DISPATCH_DECISION_ID ?? null);
  const fallbackRequestId = normalizeOptionalString(option(args, '--fallback-request-id') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_REQUEST_ID ?? null);
  const localExecutionId = normalizeOptionalString(option(args, '--local-execution-id') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_LOCAL_EXECUTION_ID ?? null);
  const localResidentSessionRef = normalizeOptionalString(option(args, '--local-resident-session-ref') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_LOCAL_SESSION_REF ?? null);
  const fallbackEvidenceId = normalizeOptionalString(option(args, '--fallback-evidence-id') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_EVIDENCE_ID ?? null);
  const generatedAt = normalizeOptionalString(option(args, '--generated-at') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_EVIDENCE_GENERATED_AT ?? null) ?? new Date(now()).toISOString();
  const windowsAdmissionReason = normalizeOptionalString(option(args, '--windows-admission-reason') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_EVIDENCE_REASON ?? null) ?? DEFAULT_WINDOWS_ADMISSION_REASON;
  const localExecutorAuthority = normalizeOptionalString(option(args, '--local-executor-authority') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_EVIDENCE_EXECUTOR_AUTHORITY ?? null) ?? DEFAULT_EXECUTOR_AUTHORITY;
  const rollbackEvidenceRef = normalizeOptionalString(option(args, '--rollback-evidence-ref') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_EVIDENCE_ROLLBACK_REF ?? null);
  const limit = option(args, '--limit') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_EVIDENCE_LIMIT ?? null;
  const requestId = option(args, '--request-id') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_EVIDENCE_REQUEST_ID ?? `resident_dispatch_windows_fallback_evidence_${fallbackEvidenceId ?? localExecutionId ?? now()}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_EVIDENCE_FORMAT ?? 'json';
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('resident_dispatch_windows_fallback_evidence_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('resident_dispatch_windows_fallback_evidence_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!['json', 'text'].includes(format)) throw new Error(`resident_dispatch_windows_fallback_evidence_format_unsupported:${format}`);
  if (!auth) throw new Error('resident_dispatch_windows_fallback_evidence_requires_bearer_token_or_operator_session');
  if (operation === PUT_OPERATION) {
    if (!operationId) throw new Error('resident_dispatch_windows_fallback_evidence_requires_--operation-id_or_CLOUDFLARE_CARRIER_OPERATION_ID');
    if (!dispatchDecisionId) throw new Error('resident_dispatch_windows_fallback_evidence_requires_--dispatch-decision-id_or_CLOUDFLARE_CARRIER_DISPATCH_DECISION_ID');
    if (!fallbackRequestId) throw new Error('resident_dispatch_windows_fallback_evidence_requires_--fallback-request-id_or_CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_REQUEST_ID');
    if (!localExecutionId) throw new Error('resident_dispatch_windows_fallback_evidence_requires_--local-execution-id_or_CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_LOCAL_EXECUTION_ID');
    if (!localResidentSessionRef) throw new Error('resident_dispatch_windows_fallback_evidence_requires_--local-resident-session-ref_or_CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_LOCAL_SESSION_REF');
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
          ...(fallbackEvidenceId ? { fallback_evidence_id: fallbackEvidenceId } : {}),
          source_payload: {
            generated_at: generatedAt,
            fallback_request_id: fallbackRequestId,
            operation_id: operationId,
            dispatch_decision_id: dispatchDecisionId,
            local_execution_id: localExecutionId,
            windows_admission_action: 'admit',
            windows_admission_reason: windowsAdmissionReason,
            local_execution_status: 'completed',
            local_executor_authority: localExecutorAuthority,
            local_session_start_admission: 'admitted_by_windows_resident_loop',
            local_resident_session_ref: localResidentSessionRef,
            ...(rollbackEvidenceRef ? { rollback_evidence_ref: rollbackEvidenceRef } : {}),
            direct_cloudflare_session_start_admission: 'not_admitted',
            evidence_posture: DEFAULT_EVIDENCE_POSTURE,
          },
        }
      : {
          site_id: siteId,
          ...(operationId ? { operation_id: operationId } : {}),
          ...(dispatchDecisionId ? { dispatch_decision_id: dispatchDecisionId } : {}),
          ...(fallbackRequestId ? { fallback_request_id: fallbackRequestId } : {}),
          ...(limit ? { limit: Number(limit) } : {}),
        },
  };
}

export async function runResidentDispatchWindowsFallbackEvidence(config, fetchImpl = fetch) {
  const response = await fetchImpl(`${config.workerUrl}/api/carrier`, {
    method: 'POST',
    headers: {
      ...authHeaders(config.auth),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      operation: config.operation,
      request_id: config.requestId,
      params: config.params,
    }),
  });
  const body = await response.json().catch(() => ({}));
  return {
    schema: 'narada.cloudflare_carrier.resident_dispatch_windows_fallback_evidence.v1',
    operation: config.operation,
    status: response.ok && body?.ok ? 'ok' : 'failed',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.params.site_id,
    operation_id: config.params.operation_id ?? config.params.source_payload?.operation_id ?? null,
    dispatch_decision_id: config.params.dispatch_decision_id ?? config.params.source_payload?.dispatch_decision_id ?? null,
    fallback_request_id: config.params.fallback_request_id ?? config.params.source_payload?.fallback_request_id ?? null,
    http_status: response.status,
    response: body,
    summary: summarizeResidentDispatchWindowsFallbackEvidence(config.operation, body, config.params),
  };
}

export function summarizeResidentDispatchWindowsFallbackEvidence(operation, body = {}, params = {}) {
  if (operation === LIST_OPERATION) {
    const evidence = Array.isArray(body?.evidence) ? body.evidence : [];
    const entry = evidence[0] ?? null;
    return {
      evidence_count: evidence.length,
      fallback_evidence_id: entry?.fallback_evidence_id ?? null,
      evidence_status: body?.status ?? null,
      fallback_request_id: entry?.fallback_request_id ?? null,
      dispatch_decision_id: entry?.dispatch_decision_id ?? null,
      local_execution_id: entry?.local_execution_id ?? null,
      local_session_start_admission: entry?.local_session_start_admission ?? null,
      direct_cloudflare_session_start_admission: entry?.direct_cloudflare_session_start_admission ?? null,
      local_resident_session_ref: entry?.local_resident_session_ref ?? null,
      local_executor_authority: entry?.local_executor_authority ?? null,
      carrier_session_id: entry?.carrier_session_id ?? body?.carrier_session_id ?? null,
    };
  }
  const evidence = body?.evidence ?? null;
  const record = body?.record ?? null;
  return {
    evidence_count: record ? 1 : 0,
    fallback_evidence_id: record?.fallback_evidence_id ?? params.fallback_evidence_id ?? null,
    evidence_status: body?.status ?? null,
    fallback_request_id: evidence?.fallback_request_id ?? record?.fallback_request_id ?? params.source_payload?.fallback_request_id ?? null,
    dispatch_decision_id: evidence?.dispatch_decision_id ?? record?.dispatch_decision_id ?? params.source_payload?.dispatch_decision_id ?? null,
    local_execution_id: evidence?.local_execution_id ?? record?.local_execution_id ?? params.source_payload?.local_execution_id ?? null,
    local_session_start_admission: body?.local_session_start_admission ?? record?.local_session_start_admission ?? evidence?.local_session_start_admission ?? params.source_payload?.local_session_start_admission ?? null,
    direct_cloudflare_session_start_admission: body?.direct_cloudflare_session_start_admission ?? record?.direct_cloudflare_session_start_admission ?? evidence?.direct_cloudflare_session_start_admission ?? params.source_payload?.direct_cloudflare_session_start_admission ?? null,
    local_resident_session_ref: evidence?.local_resident_session_ref ?? record?.local_resident_session_ref ?? params.source_payload?.local_resident_session_ref ?? null,
    local_executor_authority: body?.resident_dispatch_windows_fallback_evidence_authority ?? record?.local_executor_authority ?? evidence?.local_executor_authority ?? params.source_payload?.local_executor_authority ?? null,
    carrier_session_id: evidence?.carrier_session_id ?? record?.carrier_session_id ?? body?.carrier_session_id ?? null,
  };
}

export function formatResidentDispatchWindowsFallbackEvidenceText(result = {}) {
  const summary = result.summary ?? {};
  const response = result.response ?? {};
  const workerUrl = result.worker_url ?? null;
  const lines = [
    'Resident Dispatch Windows Fallback Evidence',
    `Worker: ${result.worker_url ?? 'unknown'}`,
    `Auth: ${result.auth_source ?? 'unknown'}`,
    `Operation: ${result.operation ?? 'unknown'}`,
    `Site: ${result.site_id ?? 'unknown'}`,
    `Operation Id: ${result.operation_id ?? 'unknown'}`,
    `Dispatch Decision: ${result.dispatch_decision_id ?? summary.dispatch_decision_id ?? 'unknown'}`,
    `HTTP: ${result.http_status ?? 'unknown'}`,
    `Status: ${result.status ?? 'unknown'}`,
    `Evidence Status: ${summary.evidence_status ?? 'unknown'}`,
    `Evidence Count: ${summary.evidence_count ?? 0}`,
    `Fallback Evidence: ${summary.fallback_evidence_id ?? 'none'}`,
    `Fallback Request: ${summary.fallback_request_id ?? 'none'}`,
    `Local Execution: ${summary.local_execution_id ?? 'unknown'}`,
    `Session Start Admission: ${summary.local_session_start_admission ?? 'unknown'}`,
    `Direct Cloudflare Session Start: ${summary.direct_cloudflare_session_start_admission ?? 'unknown'}`,
    `Resident Session Ref: ${summary.local_resident_session_ref ?? 'unknown'}`,
    `Executor Authority: ${summary.local_executor_authority ?? 'unknown'}`,
    ...(summary.carrier_session_id ? [`Cloudflare Carrier Session: ${summary.carrier_session_id}`] : []),
    ...(response?.code ? [`Code: ${response.code}`] : []),
  ];
  if (workerUrl && result.site_id) {
    lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${workerUrl} --site ${result.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${workerUrl} --site ${result.site_id} --operator-session-file <operator-session-file> --execute-site-next`);
    lines.push(`Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text -- --url ${workerUrl} --site ${result.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text -- --url ${workerUrl} --site ${result.site_id} --operator-session-file <operator-session-file>`);
  }
  if (workerUrl && result.site_id && summary.carrier_session_id) {
    lines.push(`Session Evidence: pnpm --filter @narada2/cloudflare-carrier product:session:evidence:text -- --url ${workerUrl} --site ${result.site_id} --carrier-session-id ${summary.carrier_session_id} --operator-session-file <operator-session-file>`);
    lines.push(`Task Review: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:review:text -- --url ${workerUrl} --site ${result.site_id} --carrier-session-id ${summary.carrier_session_id} --operator-session-file <operator-session-file>`);
    lines.push(`Task Workflow: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url ${workerUrl} --site ${result.site_id} --carrier-session-id ${summary.carrier_session_id} --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next`);
  }
  if (workerUrl && result.site_id && result.operation_id) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${workerUrl} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file>`);
    lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${workerUrl} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`);
  }
  if (workerUrl && result.site_id && result.operation_id && summary.fallback_evidence_id) {
    lines.push(`Resident Dispatch Windows Fallback Evidence Review: pnpm --filter @narada2/cloudflare-carrier product:resident-dispatch:windows-fallback-evidence:review:text -- --url ${workerUrl} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file>`);
  }
  return lines.join('\n');
}

async function main() {
  const config = parseResidentDispatchWindowsFallbackEvidenceArgs(process.argv.slice(2), process.env);
  const result = await runResidentDispatchWindowsFallbackEvidence(config);
  if (config.format === 'text') {
    console.log(formatResidentDispatchWindowsFallbackEvidenceText(result));
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && scriptPath === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

function option(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = args[index + 1];
  if (value == null || value.startsWith('--')) throw new Error(`missing_value_for_${flag}`);
  return value;
}

function normalizeOperation(value) {
  const normalized = normalizeOptionalString(value);
  if (!normalized || normalized === 'put') return PUT_OPERATION;
  if (normalized === 'list') return LIST_OPERATION;
  if (normalized === PUT_OPERATION || normalized === LIST_OPERATION) return normalized;
  throw new Error(`resident_dispatch_windows_fallback_evidence_operation_unsupported:${normalized}`);
}

function normalizeWorkerUrl(value) {
  return String(value ?? '').trim().replace(/\/+$/, '');
}

function normalizeOptionalString(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}
