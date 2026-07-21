#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { parseProductReadArgs, readProductSurface } from './cloudflare-carrier-product-read.mjs';

const FOCUS_KIND = 'resident_dispatch_windows_fallback_evidence';

export function parseResidentDispatchWindowsFallbackEvidenceReviewArgs(argv = [], env = process.env) {
  const args = [...argv];
  const explicitOperationId =
    normalizeOptionalString(option(args, '--operation-id'))
    ?? normalizeOptionalString(option(args, '--carrier-operation'))
    ?? normalizeOptionalString(env.CLOUDFLARE_CARRIER_OPERATION_ID)
    ?? normalizeOptionalString(env.CLOUDFLARE_CARRIER_CARRIER_OPERATION)
    ?? null;
  const defaultOperation = explicitOperationId ? 'operation.read' : 'resident_dispatch.windows_fallback_evidence.list';
  const defaultEvidenceLimit = explicitOperationId ? 20 : 200;
  const parsed = parseProductReadArgs(['--operation', defaultOperation, ...argv], env);
  const evidenceLimit = parseOptionalInteger(
    option(args, '--evidence-limit') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_EVIDENCE_LIMIT ?? null,
    'evidence-limit',
  ) ?? defaultEvidenceLimit;
  const focusRef = normalizeOptionalString(
    option(args, '--focus-ref') ?? env.CLOUDFLARE_CARRIER_RESIDENT_DISPATCH_FALLBACK_EVIDENCE_FOCUS_REF ?? null,
  );
  return {
    ...parsed,
    focusRef,
    params: {
      ...parsed.params,
      resident_dispatch_windows_fallback_evidence_limit: evidenceLimit,
    },
  };
}

export async function readResidentDispatchWindowsFallbackEvidenceReview(config, fetchImpl = fetch) {
  const baseProduct = await readProductSurface(config, fetchImpl);
  const operationProduct = config.operation === 'operation.read' ? baseProduct : null;
  const evidenceProduct = config.operation === 'resident_dispatch.windows_fallback_evidence.list'
    ? baseProduct
    : await readProductSurface({
      ...config,
      operation: 'resident_dispatch.windows_fallback_evidence.list',
      params: {
        site_id: config.params.site_id ?? null,
        resident_dispatch_windows_fallback_evidence_limit: config.params.resident_dispatch_windows_fallback_evidence_limit,
      },
    }, fetchImpl);
  return {
    schema: 'narada.cloudflare_carrier.resident_dispatch_windows_fallback_evidence_review.v1',
    status: 'ok',
    worker_url: baseProduct.worker_url,
    auth_source: baseProduct.auth_source,
    operation: baseProduct.operation,
    params: baseProduct.params,
    summary: summarizeResidentDispatchWindowsFallbackEvidenceReview(
      operationProduct?.response,
      evidenceProduct.response,
      {
      operationSummary: operationProduct?.summary,
      focusRef: config.focusRef,
      },
    ),
    response: {
      operation: operationProduct?.response ?? null,
      resident_dispatch_windows_fallback_evidence: evidenceProduct.response,
    },
  };
}

export function summarizeResidentDispatchWindowsFallbackEvidenceReview(operationBody = {}, evidenceBody = {}, options = {}) {
  const operationSummary = options.operationSummary ?? {};
  const evidence = Array.isArray(evidenceBody?.resident_dispatch_windows_fallback_evidence)
    ? evidenceBody.resident_dispatch_windows_fallback_evidence
    : (Array.isArray(evidenceBody?.evidence) ? evidenceBody.evidence : []);
  const focusReviews = Array.isArray(operationBody?.operation_focus_reviews) ? operationBody.operation_focus_reviews : [];
  const explicitFocusRef = options.focusRef ?? null;
  const workflowFocusRef = operationSummary.workflow_focus_ref ?? null;
  const focusRef = explicitFocusRef ?? workflowFocusRef;
  const exactFocusedEvidence = focusRef
    ? evidence.find((entry) => entry?.fallback_evidence_id === focusRef) ?? null
    : null;
  const focusedEvidence = exactFocusedEvidence ?? (explicitFocusRef ? null : (evidence[0] ?? null));
  if (explicitFocusRef && !focusedEvidence) {
    throw new Error(`resident_dispatch_windows_fallback_evidence_review_focus_not_found:${explicitFocusRef}`);
  }
  const focusedEvidenceId = focusedEvidence?.fallback_evidence_id ?? null;
  const focusedEvidenceRecords = focusedEvidence ? [focusedEvidence] : evidence;
  const latestFocusReview = focusedEvidenceId
    ? focusReviews.find((entry) => entry?.focus_kind === FOCUS_KIND && entry?.focus_ref === focusedEvidenceId) ?? null
    : null;
  return {
    site_id: operationBody?.operation?.site_id ?? operationBody?.site_id ?? evidenceBody?.site_id ?? operationSummary.site_id ?? null,
    operation_id:
      operationBody?.operation?.operation_id
      ?? operationBody?.operation_id
      ?? operationSummary.operation_id
      ?? focusedEvidence?.operation_id
      ?? focusedEvidence?.carrier_operation_id
      ?? null,
    workflow_next_action: operationSummary.workflow_next_action ?? null,
    workflow_reason: operationSummary.workflow_reason ?? null,
    workflow_focus_ref: operationSummary.workflow_focus_ref ?? focusRef ?? null,
    evidence_count: focusedEvidenceRecords.length,
    focused_fallback_evidence_id: focusedEvidenceId,
    focused_fallback_request_id: focusedEvidence?.fallback_request_id ?? null,
    focused_dispatch_decision_id: focusedEvidence?.dispatch_decision_id ?? null,
    focused_local_execution_id: focusedEvidence?.local_execution_id ?? null,
    focused_local_execution_status: focusedEvidence?.local_execution_status ?? null,
    focused_local_session_start_admission: focusedEvidence?.local_session_start_admission ?? null,
    focused_direct_cloudflare_session_start_admission: focusedEvidence?.direct_cloudflare_session_start_admission ?? null,
    focused_local_resident_session_ref: focusedEvidence?.local_resident_session_ref ?? null,
    carrier_session_id: focusedEvidence?.carrier_session_id ?? focusedEvidence?.cloudflare_carrier_session_id ?? null,
    resident_dispatch_windows_fallback_evidence_authority:
      focusedEvidence?.local_executor_authority
      ?? evidenceBody?.resident_dispatch_windows_fallback_evidence_authority
      ?? evidenceBody?.cloudflare_evidence_store_authority
      ?? null,
    focused_recorded_at: focusedEvidence?.recorded_at ?? null,
    focused_recorded_by_principal_id: focusedEvidence?.recorded_by_principal_id ?? null,
    latest_focus_review: latestFocusReview ? {
      review_id: latestFocusReview.review_id ?? null,
      focus_kind: latestFocusReview.focus_kind ?? null,
      focus_ref: latestFocusReview.focus_ref ?? null,
      review_status: latestFocusReview.review_status ?? null,
      recorded_at: latestFocusReview.recorded_at ?? null,
    } : null,
  };
}

export function formatResidentDispatchWindowsFallbackEvidenceReviewText(result) {
  const summary = result?.summary ?? {};
  const workerUrl = result?.worker_url ?? null;
  const actionableWorkflow = summary.workflow_next_action && summary.workflow_next_action !== 'none' && summary.workflow_next_action !== 'monitor_operation';
  const lines = [
    'Resident Dispatch Windows Fallback Evidence Review: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    `Operation: ${summary.operation_id ?? 'unknown'}`,
    `Workflow Route: action=${summary.workflow_next_action ?? 'none'} reason=${summary.workflow_reason ?? 'none'}`,
    `Evidence: count=${summary.evidence_count ?? 0} focused=${summary.focused_fallback_evidence_id ?? 'none'}`,
  ];
  if (summary.focused_fallback_request_id) lines.push(`Fallback Request: ${summary.focused_fallback_request_id}`);
  if (summary.focused_dispatch_decision_id) lines.push(`Dispatch Decision: ${summary.focused_dispatch_decision_id}`);
  if (summary.focused_local_execution_id || summary.focused_local_execution_status) {
    lines.push(`Local Execution: ${summary.focused_local_execution_id ?? 'unknown'} status=${summary.focused_local_execution_status ?? 'unknown'}`);
  }
  if (summary.focused_local_resident_session_ref) lines.push(`Resident Session Ref: ${summary.focused_local_resident_session_ref}`);
  if (summary.carrier_session_id) lines.push(`Cloudflare Carrier Session: ${summary.carrier_session_id}`);
  if (summary.focused_local_session_start_admission || summary.focused_direct_cloudflare_session_start_admission) {
    lines.push(`Admissions: session_start=${summary.focused_local_session_start_admission ?? 'unknown'} direct_cloudflare=${summary.focused_direct_cloudflare_session_start_admission ?? 'unknown'}`);
  }
  if (summary.resident_dispatch_windows_fallback_evidence_authority) {
    lines.push(`Authority: ${summary.resident_dispatch_windows_fallback_evidence_authority}`);
  }
  if (summary.focused_recorded_at || summary.focused_recorded_by_principal_id) {
    lines.push(`Recorded: ${summary.focused_recorded_at ?? 'unknown'} by ${summary.focused_recorded_by_principal_id ?? 'unknown'}`);
  }
  if (summary.latest_focus_review) {
    const focusReviewLabel = summary.focused_fallback_evidence_id
      && summary.latest_focus_review.focus_ref === summary.focused_fallback_evidence_id
      ? 'Focused Review'
      : 'Latest Focus Review';
    lines.push(`${focusReviewLabel}: ${summary.latest_focus_review.focus_kind ?? 'unknown'}:${summary.latest_focus_review.focus_ref ?? 'unknown'} status=${summary.latest_focus_review.review_status ?? 'unknown'}`);
  }
  if (workerUrl && summary.site_id) {
    lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file> --execute-site-next`);
    lines.push(`Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`);
  }
  if (workerUrl && summary.site_id && summary.carrier_session_id) {
    lines.push(`Session Evidence: pnpm --filter @narada2/cloudflare-carrier product:session:evidence:text -- --url ${workerUrl} --site ${summary.site_id} --carrier-session-id ${summary.carrier_session_id} --operator-session-file <operator-session-file>`);
    lines.push(`Task Review: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:review:text -- --url ${workerUrl} --site ${summary.site_id} --carrier-session-id ${summary.carrier_session_id} --operator-session-file <operator-session-file>`);
    lines.push(`Task Workflow: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --carrier-session-id ${summary.carrier_session_id} --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next`);
  }
  if (workerUrl && summary.operation_id && summary.site_id) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${workerUrl} --site ${summary.site_id} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file>`);
  }
  if (workerUrl && actionableWorkflow && summary.operation_id && summary.site_id) {
    lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`);
  }
  if (workerUrl && summary.site_id && summary.focused_fallback_evidence_id) {
    lines.push(`Review Ack: pnpm --filter @narada2/cloudflare-carrier product:operation:focus-review:text -- --url ${workerUrl} --site ${summary.site_id}${summary.operation_id ? ` --operation-id ${summary.operation_id}` : ''} --focus-kind ${FOCUS_KIND} --focus-ref ${summary.focused_fallback_evidence_id} --operator-session-file <operator-session-file>`);
  }
  return `${lines.join('\n')}\n`;
}

function selectFocusedEvidence(evidence, focusRef) {
  if (!Array.isArray(evidence) || evidence.length === 0) return null;
  if (focusRef) {
    const exact = evidence.find((entry) => entry?.fallback_evidence_id === focusRef);
    if (exact) return exact;
  }
  return evidence[0] ?? null;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function parseOptionalInteger(value, label) {
  if (value == null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) throw new Error(`resident_dispatch_windows_fallback_evidence_review_invalid_${label}:${value}`);
  return parsed;
}

function normalizeOptionalString(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseResidentDispatchWindowsFallbackEvidenceReviewArgs(process.argv.slice(2));
    const result = await readResidentDispatchWindowsFallbackEvidenceReview(config);
    if (config.format === 'text') {
      process.stdout.write(formatResidentDispatchWindowsFallbackEvidenceReviewText(result));
    } else if (config.format === 'summary') {
      process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
  } catch (error) {
    process.stderr.write(JSON.stringify({ ok: false, code: error?.message ?? String(error), response: error?.response }, null, 2) + '\n');
    process.exit(1);
  }
}
