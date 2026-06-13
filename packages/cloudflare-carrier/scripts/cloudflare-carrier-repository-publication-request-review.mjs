#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { parseProductReadArgs, readProductSurface } from './cloudflare-carrier-product-read.mjs';

export function parseRepositoryPublicationRequestReviewArgs(argv = [], env = process.env) {
  const args = [...argv];
  const parsed = parseProductReadArgs(['--operation', 'operation.read', ...argv], env);
  const requestLimit = parseOptionalInteger(
    option(args, '--request-limit') ?? env.CLOUDFLARE_CARRIER_REPOSITORY_PUBLICATION_REQUEST_LIMIT ?? null,
    'request-limit',
  ) ?? 20;
  const admissionLimit = parseOptionalInteger(
    option(args, '--admission-limit') ?? env.CLOUDFLARE_CARRIER_REPOSITORY_PUBLICATION_ADMISSION_LIMIT ?? null,
    'admission-limit',
  ) ?? 20;
  const evidenceLimit = parseOptionalInteger(
    option(args, '--evidence-limit') ?? env.CLOUDFLARE_CARRIER_REPOSITORY_PUBLICATION_EVIDENCE_LIMIT ?? null,
    'evidence-limit',
  ) ?? 20;
  const executionLimit = parseOptionalInteger(
    option(args, '--execution-limit') ?? env.CLOUDFLARE_CARRIER_REPOSITORY_PUBLICATION_EXECUTION_LIMIT ?? null,
    'execution-limit',
  ) ?? 20;
  const focusRef = normalizeOptionalString(
    option(args, '--focus-ref') ?? env.CLOUDFLARE_CARRIER_REPOSITORY_PUBLICATION_FOCUS_REF ?? null,
  );
  return {
    ...parsed,
    focusRef,
    params: {
      ...parsed.params,
      repository_publication_request_limit: requestLimit,
      repository_publication_admission_limit: admissionLimit,
      repository_publication_evidence_limit: evidenceLimit,
      repository_publication_execution_limit: executionLimit,
    },
  };
}

export async function readRepositoryPublicationRequestReview(config, fetchImpl = fetch) {
  const product = await readProductSurface(config, fetchImpl);
  return {
    schema: 'narada.cloudflare_carrier.repository_publication_request_review.v1',
    status: 'ok',
    worker_url: product.worker_url,
    auth_source: product.auth_source,
    operation: product.operation,
    params: product.params,
    summary: summarizeRepositoryPublicationRequestReview(product.response, {
      operationSummary: product.summary,
      focusRef: config.focusRef,
    }),
    response: product.response,
  };
}

export function summarizeRepositoryPublicationRequestReview(body = {}, options = {}) {
  const operationSummary = options.operationSummary ?? {};
  const requests = Array.isArray(body?.repository_publication_requests) ? body.repository_publication_requests : [];
  const admissions = Array.isArray(body?.repository_publication_admissions) ? body.repository_publication_admissions : [];
  const evidence = Array.isArray(body?.repository_publication_evidence) ? body.repository_publication_evidence : [];
  const executions = Array.isArray(body?.repository_publication_cloudflare_executions)
    ? body.repository_publication_cloudflare_executions
    : Array.isArray(body?.repository_publication_executions)
      ? body.repository_publication_executions
      : [];
  const focusReviews = Array.isArray(body?.operation_focus_reviews) ? body.operation_focus_reviews : [];
  const focusRef = options.focusRef ?? operationSummary.workflow_focus_ref ?? null;
  const focusedRequest = selectFocusedRequest(requests, focusRef);
  const focusedRequestId = focusedRequest?.repository_publication_request_id ?? focusRef ?? null;
  const latestAdmission = focusedRequestId
    ? admissions.find((entry) => entry?.repository_publication_request_id === focusedRequestId) ?? null
    : null;
  const latestEvidence = focusedRequestId
    ? evidence.find((entry) => entry?.repository_publication_request_id === focusedRequestId) ?? null
    : null;
  const latestExecution = focusedRequestId
    ? executions.find((entry) => entry?.repository_publication_request_id === focusedRequestId) ?? null
    : null;
  const latestFocusReview = focusedRequestId
    ? focusReviews.find((entry) => entry?.focus_kind === 'repository_publication_request'
      && entry?.focus_ref === focusedRequestId) ?? null
    : null;
  const currentState = deriveCurrentRepositoryPublicationRequestState({
    focusedRequest,
    latestAdmission,
    latestExecution,
    latestEvidence,
  });
  return {
    site_id: body?.operation?.site_id ?? body?.site_id ?? operationSummary.site_id ?? null,
    operation_id: body?.operation?.operation_id ?? body?.operation_id ?? operationSummary.operation_id ?? null,
    workflow_next_action: operationSummary.workflow_next_action ?? null,
    workflow_reason: operationSummary.workflow_reason ?? null,
    workflow_focus_ref: operationSummary.workflow_focus_ref ?? focusRef ?? null,
    request_count: requests.length,
    focused_repository_publication_request_id: focusedRequestId,
    focused_publication_ref: focusedRequest?.publication_ref ?? null,
    focused_repository_ref: focusedRequest?.repository_ref ?? null,
    focused_branch_ref: focusedRequest?.branch_ref ?? null,
    focused_source_change_ref: focusedRequest?.source_change_ref ?? null,
    focused_requested_action_summary: focusedRequest?.requested_action_summary ?? null,
    focused_request_posture: focusedRequest?.request_posture ?? null,
    current_request_posture: currentState.request_posture,
    repository_publication_request_authority: focusedRequest?.authority_locus ?? null,
    repository_publication_executor_authority: focusedRequest?.repository_publication_executor_authority ?? null,
    repository_publication_admission: focusedRequest?.repository_publication_admission ?? null,
    current_repository_publication_admission: currentState.repository_publication_admission,
    cloudflare_git_push_admission: focusedRequest?.cloudflare_git_push_admission ?? null,
    current_cloudflare_git_push_admission: currentState.cloudflare_git_push_admission,
    direct_cloudflare_repository_mutation_admission: focusedRequest?.direct_cloudflare_repository_mutation_admission ?? null,
    current_direct_cloudflare_repository_mutation_admission: currentState.direct_cloudflare_repository_mutation_admission,
    focused_recorded_at: focusedRequest?.recorded_at ?? focusedRequest?.record?.recorded_at ?? null,
    focused_recorded_by_principal_id: focusedRequest?.recorded_by_principal_id ?? focusedRequest?.record?.recorded_by_principal_id ?? null,
    linked_admission_id: latestAdmission?.repository_publication_admission_id ?? null,
    linked_admission_action: latestAdmission?.admission_action ?? null,
    linked_admission_reason: latestAdmission?.admission_reason ?? null,
    linked_execution_id: latestExecution?.repository_publication_execution_id ?? latestExecution?.publication_execution_id ?? null,
    linked_execution_status: latestExecution?.publication_status ?? null,
    linked_published_commit_ref: latestExecution?.published_commit_ref ?? null,
    linked_evidence_id: latestEvidence?.repository_publication_evidence_id ?? null,
    linked_evidence_status: latestEvidence?.publication_status ?? null,
    latest_focus_review: latestFocusReview ? {
      review_id: latestFocusReview.review_id ?? null,
      focus_kind: latestFocusReview.focus_kind ?? null,
      focus_ref: latestFocusReview.focus_ref ?? null,
      review_status: latestFocusReview.review_status ?? null,
      recorded_at: latestFocusReview.recorded_at ?? null,
    } : null,
  };
}

export function formatRepositoryPublicationRequestReviewText(result) {
  const summary = result?.summary ?? {};
  const lines = [
    'Repository Publication Request Review: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    `Operation: ${summary.operation_id ?? 'unknown'}`,
    `Workflow Route: action=${summary.workflow_next_action ?? 'none'} reason=${summary.workflow_reason ?? 'none'}`,
    `Requests: count=${summary.request_count ?? 0} focused=${summary.focused_repository_publication_request_id ?? 'none'}`,
  ];
  if (summary.focused_publication_ref) lines.push(`Publication: ${summary.focused_publication_ref}`);
  if (summary.focused_repository_ref) lines.push(`Repository: ${summary.focused_repository_ref}`);
  if (summary.focused_branch_ref) lines.push(`Branch: ${summary.focused_branch_ref}`);
  if (summary.focused_source_change_ref) lines.push(`Source Change: ${summary.focused_source_change_ref}`);
  if (summary.focused_requested_action_summary) lines.push(`Requested Action: ${summary.focused_requested_action_summary}`);
  if (summary.current_request_posture) lines.push(`Current Posture: ${summary.current_request_posture}`);
  if (summary.focused_request_posture && summary.focused_request_posture !== summary.current_request_posture) {
    lines.push(`Requested Posture: ${summary.focused_request_posture}`);
  }
  if (summary.repository_publication_request_authority || summary.repository_publication_executor_authority) {
    lines.push(`Authority: request=${summary.repository_publication_request_authority ?? 'unknown'} executor=${summary.repository_publication_executor_authority ?? 'unknown'}`);
  }
  if (
    summary.current_repository_publication_admission
    || summary.current_cloudflare_git_push_admission
    || summary.current_direct_cloudflare_repository_mutation_admission
  ) {
    lines.push(`Current Admissions: request=${summary.current_repository_publication_admission ?? 'unknown'} cloudflare_git_push=${summary.current_cloudflare_git_push_admission ?? 'unknown'} direct_cloudflare_repo_mutation=${summary.current_direct_cloudflare_repository_mutation_admission ?? 'unknown'}`);
  }
  if (
    summary.repository_publication_admission
    || summary.cloudflare_git_push_admission
    || summary.direct_cloudflare_repository_mutation_admission
  ) {
    const requestedAdmissions = `request=${summary.repository_publication_admission ?? 'unknown'} cloudflare_git_push=${summary.cloudflare_git_push_admission ?? 'unknown'} direct_cloudflare_repo_mutation=${summary.direct_cloudflare_repository_mutation_admission ?? 'unknown'}`;
    const currentAdmissions = `request=${summary.current_repository_publication_admission ?? 'unknown'} cloudflare_git_push=${summary.current_cloudflare_git_push_admission ?? 'unknown'} direct_cloudflare_repo_mutation=${summary.current_direct_cloudflare_repository_mutation_admission ?? 'unknown'}`;
    if (requestedAdmissions !== currentAdmissions) {
      lines.push(`Requested Admissions: ${requestedAdmissions}`);
    }
  }
  if (summary.linked_admission_id || summary.linked_admission_action) {
    lines.push(`Linked Admission: ${summary.linked_admission_id ?? 'none'}${summary.linked_admission_action ? ` action=${summary.linked_admission_action}` : ''}${summary.linked_admission_reason ? ` reason=${summary.linked_admission_reason}` : ''}`);
  }
  if (summary.linked_execution_id || summary.linked_execution_status) {
    lines.push(`Linked Execution: ${summary.linked_execution_id ?? 'none'} status=${summary.linked_execution_status ?? 'unknown'}`);
  }
  if (summary.linked_published_commit_ref) lines.push(`Published Commit: ${summary.linked_published_commit_ref}`);
  if (
    summary.linked_evidence_id
    || summary.linked_evidence_status
    || ((summary.linked_admission_id || summary.linked_execution_id) && summary.focused_repository_publication_request_id)
  ) {
    lines.push(`Linked Evidence: ${summary.linked_evidence_id ?? 'none'} status=${summary.linked_evidence_status ?? 'unknown'}`);
  }
  if (summary.focused_recorded_at || summary.focused_recorded_by_principal_id) {
    lines.push(`Recorded: ${summary.focused_recorded_at ?? 'unknown'} by ${summary.focused_recorded_by_principal_id ?? 'unknown'}`);
  }
  if (summary.latest_focus_review) {
    lines.push(`Latest Focus Review: ${summary.latest_focus_review.focus_kind ?? 'unknown'}:${summary.latest_focus_review.focus_ref ?? 'unknown'} status=${summary.latest_focus_review.review_status ?? 'unknown'}`);
  }
  if (summary.focused_repository_publication_request_id) {
    lines.push(`Review Ack: pnpm --filter @narada2/cloudflare-carrier product:operation:focus-review:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --focus-kind repository_publication_request --focus-ref ${summary.focused_repository_publication_request_id} --operator-session-file <operator-session-file>`);
  }
  return `${lines.join('\n')}\n`;
}

function selectFocusedRequest(requests, focusRef) {
  if (!Array.isArray(requests) || requests.length === 0) return null;
  if (focusRef) {
    const exact = requests.find((entry) => entry?.repository_publication_request_id === focusRef);
    if (exact) return exact;
  }
  return requests[0] ?? null;
}

function deriveCurrentRepositoryPublicationRequestState({ focusedRequest, latestAdmission, latestExecution, latestEvidence }) {
  const requestedPosture = focusedRequest?.request_posture ?? null;
  const requestedAdmission = focusedRequest?.repository_publication_admission ?? null;
  const requestedGitPushAdmission = focusedRequest?.cloudflare_git_push_admission ?? null;
  const requestedDirectMutationAdmission = focusedRequest?.direct_cloudflare_repository_mutation_admission ?? null;
  const executionStatus = String(latestExecution?.publication_status ?? '').trim().toLowerCase();
  const evidenceStatus = String(latestEvidence?.publication_status ?? '').trim().toLowerCase();
  const admissionAction = String(latestAdmission?.admission_action ?? '').trim().toLowerCase();

  if (executionStatus === 'completed') {
    return {
      request_posture: 'cloudflare_repository_publication_execution_completed',
      repository_publication_admission: admissionAction === 'admit'
        ? 'admitted_by_cloudflare_repository_publication'
        : requestedAdmission,
      cloudflare_git_push_admission: requestedGitPushAdmission,
      direct_cloudflare_repository_mutation_admission: 'admitted_by_cloudflare_github_repository_publication',
    };
  }
  if (latestExecution) {
    return {
      request_posture: 'cloudflare_repository_publication_execution_recorded',
      repository_publication_admission: admissionAction === 'admit'
        ? 'admitted_by_cloudflare_repository_publication'
        : requestedAdmission,
      cloudflare_git_push_admission: requestedGitPushAdmission,
      direct_cloudflare_repository_mutation_admission: requestedDirectMutationAdmission,
    };
  }
  if (evidenceStatus === 'completed') {
    return {
      request_posture: 'repository_publication_evidence_completed',
      repository_publication_admission: requestedAdmission,
      cloudflare_git_push_admission: requestedGitPushAdmission,
      direct_cloudflare_repository_mutation_admission: requestedDirectMutationAdmission,
    };
  }
  if (admissionAction === 'admit') {
    return {
      request_posture: 'repository_publication_request_admitted_pending_execution',
      repository_publication_admission: 'admitted_by_cloudflare_repository_publication',
      cloudflare_git_push_admission: requestedGitPushAdmission,
      direct_cloudflare_repository_mutation_admission: requestedDirectMutationAdmission,
    };
  }
  return {
    request_posture: requestedPosture,
    repository_publication_admission: requestedAdmission,
    cloudflare_git_push_admission: requestedGitPushAdmission,
    direct_cloudflare_repository_mutation_admission: requestedDirectMutationAdmission,
  };
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function parseOptionalInteger(value, label) {
  if (value == null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) throw new Error(`repository_publication_request_review_invalid_${label}:${value}`);
  return parsed;
}

function normalizeOptionalString(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseRepositoryPublicationRequestReviewArgs(process.argv.slice(2));
    const result = await readRepositoryPublicationRequestReview(config);
    if (config.format === 'text') {
      process.stdout.write(formatRepositoryPublicationRequestReviewText(result));
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
