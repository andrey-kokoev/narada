#!/usr/bin/env node
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import {
  runResidentDispatchWindowsFallbackEvidence,
} from './cloudflare-carrier-resident-dispatch-windows-fallback-evidence.mjs';
import {
  runResidentDispatchWindowsFallbackRequest,
} from './cloudflare-carrier-resident-dispatch-windows-fallback-request.mjs';
import { resolveAuth } from './cloudflare-carrier-product-read.mjs';

const LIST_REQUEST_OPERATION = 'resident_dispatch.windows_fallback_request.list';
const PUT_EVIDENCE_OPERATION = 'resident_dispatch.windows_fallback_evidence.put';
const DEFAULT_EXECUTOR_AUTHORITY = 'windows_local_site_resident_loop';
const DEFAULT_WINDOWS_ADMISSION_REASON = 'windows_resident_loop_started_session_after_cloudflare_primary_dispatch_failure';

export function parseResidentDispatchWindowsFallbackExecuteArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const operationId = normalizeOptionalString(option(args, '--operation-id') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? null);
  const dispatchDecisionId = normalizeOptionalString(option(args, '--dispatch-decision-id') ?? env.CLOUDFLARE_CARRIER_DISPATCH_DECISION_ID ?? null);
  const fallbackRequestId = normalizeOptionalString(option(args, '--fallback-request-id') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_REQUEST_ID ?? null);
  const localExecutionId = normalizeOptionalString(option(args, '--local-execution-id') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_LOCAL_EXECUTION_ID ?? null);
  const localResidentSessionRef = normalizeOptionalString(option(args, '--local-resident-session-ref') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_LOCAL_SESSION_REF ?? null);
  const fallbackEvidenceId = normalizeOptionalString(option(args, '--fallback-evidence-id') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_EVIDENCE_ID ?? null);
  const generatedAt = normalizeOptionalString(option(args, '--generated-at') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_EVIDENCE_GENERATED_AT ?? null)
    ?? new Date(now()).toISOString();
  const localExecutorAuthority = normalizeOptionalString(option(args, '--local-executor-authority') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_EVIDENCE_EXECUTOR_AUTHORITY ?? null)
    ?? DEFAULT_EXECUTOR_AUTHORITY;
  const windowsAdmissionReason = normalizeOptionalString(option(args, '--windows-admission-reason') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_EVIDENCE_REASON ?? null)
    ?? DEFAULT_WINDOWS_ADMISSION_REASON;
  const rollbackEvidenceRef = normalizeOptionalString(option(args, '--rollback-evidence-ref') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_EVIDENCE_ROLLBACK_REF ?? null);
  const format = option(args, '--format') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_EXECUTE_FORMAT ?? 'json';
  const executeAcknowledged = flag(args, '--execute-windows-fallback')
    || env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_EXECUTE === '1';
  const auth = resolveAuth(args, env);

  if (!executeAcknowledged) {
    throw new Error('resident_dispatch_windows_fallback_execute_requires_--execute-windows-fallback_or_CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_EXECUTE=1');
  }
  if (!workerUrl) throw new Error('resident_dispatch_windows_fallback_execute_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('resident_dispatch_windows_fallback_execute_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!['json', 'text'].includes(format)) throw new Error(`resident_dispatch_windows_fallback_execute_format_unsupported:${format}`);
  if (!auth) throw new Error('resident_dispatch_windows_fallback_execute_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    siteId,
    operationId,
    dispatchDecisionId,
    fallbackRequestId,
    localExecutionId,
    localResidentSessionRef,
    fallbackEvidenceId,
    generatedAt,
    localExecutorAuthority,
    windowsAdmissionReason,
    rollbackEvidenceRef,
    format,
    executeAcknowledged,
    auth,
  };
}

export async function runResidentDispatchWindowsFallbackExecute(config, fetchImpl = fetch) {
  const requestLookup = await runResidentDispatchWindowsFallbackRequest({
    operation: LIST_REQUEST_OPERATION,
    workerUrl: config.workerUrl,
    requestId: `resident_dispatch_windows_fallback_request_lookup_${config.fallbackRequestId ?? config.operationId ?? config.siteId}`,
    format: 'json',
    auth: config.auth,
    params: {
      site_id: config.siteId,
      ...(config.operationId ? { operation_id: config.operationId } : {}),
      ...(config.dispatchDecisionId ? { dispatch_decision_id: config.dispatchDecisionId } : {}),
      ...(config.fallbackRequestId ? { fallback_request_id: config.fallbackRequestId } : {}),
      limit: 1,
    },
  }, fetchImpl);
  assert.equal(requestLookup.status, 'ok', 'resident_dispatch_windows_fallback_execute_request_lookup_failed');
  const selectedRequest = Array.isArray(requestLookup.response?.requests) ? requestLookup.response.requests[0] ?? null : null;
  assert.ok(selectedRequest, 'resident_dispatch_windows_fallback_execute_requires_pending_request');

  const selectedFallbackRequestId = selectedRequest.fallback_request_id ?? null;
  const selectedOperationId = selectedRequest.operation_id ?? config.operationId ?? null;
  const selectedDispatchDecisionId = selectedRequest.dispatch_decision_id ?? config.dispatchDecisionId ?? null;
  assert.ok(selectedFallbackRequestId, 'resident_dispatch_windows_fallback_execute_request_missing_fallback_request_id');
  assert.ok(selectedOperationId, 'resident_dispatch_windows_fallback_execute_request_missing_operation_id');
  assert.ok(selectedDispatchDecisionId, 'resident_dispatch_windows_fallback_execute_request_missing_dispatch_decision_id');
  if (selectedRequest.local_execution_admission && selectedRequest.local_execution_admission !== 'pending_windows_admission') {
    throw new Error(`resident_dispatch_windows_fallback_execute_request_not_pending:${selectedRequest.local_execution_admission}`);
  }

  const localExecutionId = config.localExecutionId ?? `${selectedFallbackRequestId}:execution`;
  const localResidentSessionRef = config.localResidentSessionRef ?? `windows-resident-session:${config.siteId}:${selectedOperationId}:${localExecutionId}`;
  const fallbackEvidenceId = config.fallbackEvidenceId ?? `${selectedFallbackRequestId}:evidence`;

  const evidenceResult = await runResidentDispatchWindowsFallbackEvidence({
    operation: PUT_EVIDENCE_OPERATION,
    workerUrl: config.workerUrl,
    requestId: `resident_dispatch_windows_fallback_execute_${fallbackEvidenceId}`,
    format: 'json',
    auth: config.auth,
    params: {
      site_id: config.siteId,
      fallback_evidence_id: fallbackEvidenceId,
      source_payload: {
        generated_at: config.generatedAt,
        fallback_request_id: selectedFallbackRequestId,
        operation_id: selectedOperationId,
        dispatch_decision_id: selectedDispatchDecisionId,
        local_execution_id: localExecutionId,
        windows_admission_action: 'admit',
        windows_admission_reason: config.windowsAdmissionReason,
        local_execution_status: 'completed',
        local_executor_authority: config.localExecutorAuthority,
        local_session_start_admission: 'admitted_by_windows_resident_loop',
        local_resident_session_ref: localResidentSessionRef,
        ...(config.rollbackEvidenceRef ? { rollback_evidence_ref: config.rollbackEvidenceRef } : {}),
        direct_cloudflare_session_start_admission: 'not_admitted',
        evidence_posture: 'windows_resident_loop_executed_fallback_cloudflare_recorded_session_start_evidence',
      },
    },
  }, fetchImpl);
  assert.equal(evidenceResult.status, 'ok', 'resident_dispatch_windows_fallback_execute_evidence_put_failed');

  return {
    schema: 'narada.cloudflare_carrier.resident_dispatch_windows_fallback_execute.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    operation_id: selectedOperationId,
    dispatch_decision_id: selectedDispatchDecisionId,
    fallback_request_id: selectedFallbackRequestId,
    local_execution_id: localExecutionId,
    local_resident_session_ref: localResidentSessionRef,
    fallback_evidence_id: fallbackEvidenceId,
    request_lookup: requestLookup,
    evidence_result: evidenceResult,
    summary: {
      request_status: requestLookup.summary?.request_status ?? null,
      local_execution_admission: requestLookup.summary?.local_execution_admission ?? selectedRequest.local_execution_admission ?? null,
      local_executor_authority: evidenceResult.summary?.local_executor_authority ?? config.localExecutorAuthority,
      local_session_start_admission: evidenceResult.summary?.local_session_start_admission ?? null,
      direct_cloudflare_session_start_admission: evidenceResult.summary?.direct_cloudflare_session_start_admission ?? null,
    },
  };
}

export function formatResidentDispatchWindowsFallbackExecuteText(result = {}) {
  return [
    'Resident Dispatch Windows Fallback Execute',
    `Worker: ${result.worker_url ?? 'unknown'}`,
    `Auth: ${result.auth_source ?? 'unknown'}`,
    `Site: ${result.site_id ?? 'unknown'}`,
    `Operation Id: ${result.operation_id ?? 'unknown'}`,
    `Dispatch Decision: ${result.dispatch_decision_id ?? 'unknown'}`,
    `Fallback Request: ${result.fallback_request_id ?? 'unknown'}`,
    `Local Execution: ${result.local_execution_id ?? 'unknown'}`,
    `Resident Session Ref: ${result.local_resident_session_ref ?? 'unknown'}`,
    `Fallback Evidence: ${result.fallback_evidence_id ?? 'unknown'}`,
    `Status: ${result.status ?? 'unknown'}`,
    `Request Status: ${result.summary?.request_status ?? 'unknown'}`,
    `Execution Admission: ${result.summary?.local_execution_admission ?? 'unknown'}`,
    `Session Start Admission: ${result.summary?.local_session_start_admission ?? 'unknown'}`,
    `Direct Cloudflare Session Start: ${result.summary?.direct_cloudflare_session_start_admission ?? 'unknown'}`,
    `Executor Authority: ${result.summary?.local_executor_authority ?? 'unknown'}`,
  ].join('\n');
}

async function main() {
  const config = parseResidentDispatchWindowsFallbackExecuteArgs(process.argv.slice(2), process.env);
  const result = await runResidentDispatchWindowsFallbackExecute(config);
  if (config.format === 'text') {
    console.log(formatResidentDispatchWindowsFallbackExecuteText(result));
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

function flag(args, name) {
  return args.includes(name);
}

function normalizeWorkerUrl(value) {
  return String(value ?? '').trim().replace(/\/+$/, '');
}

function normalizeOptionalString(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}
