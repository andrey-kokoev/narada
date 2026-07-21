#!/usr/bin/env node
import { resolveAuth } from '../shared/cloudflare-carrier-auth-http.mjs';
import { fileURLToPath } from 'node:url';

import { authHeaders } from '../shared/cloudflare-carrier-auth-http.mjs';

const CREATE_OPERATION = 'resident_dispatch.windows_fallback_request.create';
const LIST_OPERATION = 'resident_dispatch.windows_fallback_request.list';
const DEFAULT_ACTION_REF = 'local-windows-action:resident-session-start:v1';
const DEFAULT_ACTION_SUMMARY = 'request governed Windows resident session start after Cloudflare primary dispatch fallback';
const DEFAULT_CONTRACT_REF = 'contract:cloudflare-to-windows-resident-fallback-request:v1';
const DEFAULT_EVIDENCE_CONTRACT_REF = 'contract:windows-resident-fallback-evidence-return:v1';
const DEFAULT_ROLLBACK_REF = 'rollback:windows-resident-fallback-request:v1';

export function parseResidentDispatchWindowsFallbackRequestArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const operation = normalizeOperation(option(args, '--operation') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_OPERATION ?? null);
  const operationId = normalizeOptionalString(option(args, '--operation-id') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? null);
  const dispatchDecisionId = normalizeOptionalString(option(args, '--dispatch-decision-id') ?? env.CLOUDFLARE_CARRIER_DISPATCH_DECISION_ID ?? null);
  const carrierSessionId = normalizeOptionalString(option(args, '--session') ?? env.CLOUDFLARE_CARRIER_SESSION_ID ?? null);
  const fallbackRequestId = normalizeOptionalString(option(args, '--fallback-request-id') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_REQUEST_ID ?? null);
  const generatedAt = normalizeOptionalString(option(args, '--generated-at') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_GENERATED_AT ?? null) ?? new Date(now()).toISOString();
  const actionRef = normalizeOptionalString(option(args, '--action-ref') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_ACTION_REF ?? null) ?? DEFAULT_ACTION_REF;
  const summary = normalizeOptionalString(option(args, '--summary') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_SUMMARY ?? null) ?? DEFAULT_ACTION_SUMMARY;
  const contractRef = normalizeOptionalString(option(args, '--contract-ref') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_CONTRACT_REF ?? null) ?? DEFAULT_CONTRACT_REF;
  const evidenceContractRef = normalizeOptionalString(option(args, '--evidence-contract-ref') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_EVIDENCE_CONTRACT_REF ?? null) ?? DEFAULT_EVIDENCE_CONTRACT_REF;
  const rollbackRef = normalizeOptionalString(option(args, '--rollback-ref') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_ROLLBACK_REF ?? null) ?? DEFAULT_ROLLBACK_REF;
  const limit = option(args, '--limit') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_LIMIT ?? null;
  const requestId = option(args, '--request-id') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_REQUEST_REQUEST_ID ?? `resident_dispatch_windows_fallback_request_${fallbackRequestId ?? now()}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_FORMAT ?? 'json';
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('resident_dispatch_windows_fallback_request_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('resident_dispatch_windows_fallback_request_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!['json', 'text'].includes(format)) throw new Error(`resident_dispatch_windows_fallback_request_format_unsupported:${format}`);
  if (!auth) throw new Error('resident_dispatch_windows_fallback_request_requires_bearer_token_or_operator_session');
  if (operation === CREATE_OPERATION) {
    if (!operationId) throw new Error('resident_dispatch_windows_fallback_request_requires_--operation-id_or_CLOUDFLARE_CARRIER_OPERATION_ID');
    if (!dispatchDecisionId) throw new Error('resident_dispatch_windows_fallback_request_requires_--dispatch-decision-id_or_CLOUDFLARE_CARRIER_DISPATCH_DECISION_ID');
  }

  return {
    operation,
    workerUrl,
    requestId,
    format,
    auth,
    params: operation === CREATE_OPERATION
      ? {
          site_id: siteId,
          ...(fallbackRequestId ? { fallback_request_id: fallbackRequestId } : {}),
          source_payload: {
            generated_at: generatedAt,
            operation_id: operationId,
            dispatch_decision_id: dispatchDecisionId,
            ...(carrierSessionId ? { carrier_session_id: carrierSessionId } : {}),
            requested_action_ref: actionRef,
            requested_action_summary: summary,
            governed_request_contract_ref: contractRef,
            evidence_return_contract_ref: evidenceContractRef,
            rollback_plan_ref: rollbackRef,
          },
        }
      : {
          site_id: siteId,
          ...(operationId ? { operation_id: operationId } : {}),
          ...(dispatchDecisionId ? { dispatch_decision_id: dispatchDecisionId } : {}),
          ...(limit ? { limit: Number(limit) } : {}),
        },
  };
}

export async function runResidentDispatchWindowsFallbackRequest(config, fetchImpl = fetch) {
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
    schema: 'narada.cloudflare_carrier.resident_dispatch_windows_fallback_request.v1',
    operation: config.operation,
    status: response.ok && body?.ok ? 'ok' : 'failed',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.params.site_id,
    operation_id: config.params.operation_id ?? config.params.source_payload?.operation_id ?? null,
    dispatch_decision_id: config.params.dispatch_decision_id ?? config.params.source_payload?.dispatch_decision_id ?? null,
    http_status: response.status,
    response: body,
    summary: summarizeResidentDispatchWindowsFallbackRequest(config.operation, body),
  };
}

export function createResidentDispatchWindowsFallbackRequest(config, fetchImpl = fetch) {
  return runResidentDispatchWindowsFallbackRequest({ ...config, operation: CREATE_OPERATION }, fetchImpl);
}

export function summarizeResidentDispatchWindowsFallbackRequest(operation, body = {}) {
  if (operation === LIST_OPERATION) {
    const requests = Array.isArray(body?.requests) ? body.requests : [];
    const request = requests[0] ?? null;
    return {
      request_count: requests.length,
      fallback_request_id: request?.fallback_request_id ?? null,
      request_status: body?.status ?? null,
      dispatch_decision_id: request?.dispatch_decision_id ?? null,
      carrier_session_id: request?.carrier_session_id ?? null,
      requested_action_ref: request?.requested_action_ref ?? null,
      requested_action_summary: request?.requested_action_summary ?? null,
      local_execution_admission: request?.local_execution_admission ?? null,
      windows_fallback_ref: request?.windows_fallback_ref ?? null,
      local_executor_authority: request?.local_executor_authority ?? null,
    };
  }
  const request = body?.fallback_request ?? body?.request ?? null;
  return {
    request_count: request ? 1 : 0,
    fallback_request_id: request?.fallback_request_id ?? request?.request_id ?? null,
    request_status: body?.status ?? null,
    dispatch_decision_id: request?.dispatch_decision_id ?? null,
    carrier_session_id: request?.carrier_session_id ?? body?.carrier_session_id ?? body?.request?.carrier_session_id ?? null,
    requested_action_ref: request?.requested_action_ref ?? null,
    requested_action_summary: request?.requested_action_summary ?? null,
    local_execution_admission: request?.local_execution_admission ?? null,
    windows_fallback_ref: request?.windows_fallback_ref ?? null,
    local_executor_authority: request?.local_executor_authority ?? null,
  };
}

export function formatResidentDispatchWindowsFallbackRequestText(result = {}) {
  const summary = result.summary ?? {};
  const response = result.response ?? {};
  const workerUrl = result.worker_url ?? null;
  const lines = [
    'Resident Dispatch Windows Fallback Request',
    `Worker: ${result.worker_url ?? 'unknown'}`,
    `Auth: ${result.auth_source ?? 'unknown'}`,
    `Operation: ${result.operation ?? 'unknown'}`,
    `Site: ${result.site_id ?? 'unknown'}`,
    `Operation Id: ${result.operation_id ?? 'unknown'}`,
    `Dispatch Decision: ${result.dispatch_decision_id ?? summary.dispatch_decision_id ?? 'unknown'}`,
    `HTTP: ${result.http_status ?? 'unknown'}`,
    `Status: ${result.status ?? 'unknown'}`,
    `Request Status: ${summary.request_status ?? 'unknown'}`,
    `Request Count: ${summary.request_count ?? 0}`,
    `Fallback Request: ${summary.fallback_request_id ?? 'none'}`,
    `Action Ref: ${summary.requested_action_ref ?? 'none'}`,
    `Summary: ${summary.requested_action_summary ?? 'none'}`,
    `Execution Admission: ${summary.local_execution_admission ?? 'unknown'}`,
    `Windows Fallback Ref: ${summary.windows_fallback_ref ?? 'unknown'}`,
    `Executor Authority: ${summary.local_executor_authority ?? 'unknown'}`,
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
  return lines.join('\n');
}

async function main() {
  const config = parseResidentDispatchWindowsFallbackRequestArgs(process.argv.slice(2), process.env);
  const result = await runResidentDispatchWindowsFallbackRequest(config);
  if (config.format === 'text') {
    console.log(formatResidentDispatchWindowsFallbackRequestText(result));
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
  if (!normalized || normalized === 'create') return CREATE_OPERATION;
  if (normalized === 'list') return LIST_OPERATION;
  if (normalized === CREATE_OPERATION || normalized === LIST_OPERATION) return normalized;
  throw new Error(`resident_dispatch_windows_fallback_request_operation_unsupported:${normalized}`);
}

function normalizeWorkerUrl(value) {
  return String(value ?? '').trim().replace(/\/+$/, '');
}

function normalizeOptionalString(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}
