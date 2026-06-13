#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { parseProductReadArgs, readProductSurface } from './cloudflare-carrier-product-read.mjs';

export function parseSiteFileChangeProposalReviewArgs(argv = [], env = process.env) {
  const args = [...argv];
  const parsed = parseProductReadArgs(['--operation', 'operation.read', ...argv], env);
  const proposalLimit = parseOptionalInteger(
    option(args, '--proposal-limit') ?? env.CLOUDFLARE_CARRIER_SITE_FILE_CHANGE_PROPOSAL_LIMIT ?? null,
    'proposal-limit',
  ) ?? 20;
  const materializationLimit = parseOptionalInteger(
    option(args, '--materialization-limit') ?? env.CLOUDFLARE_CARRIER_SITE_FILE_MATERIALIZATION_LIMIT ?? null,
    'materialization-limit',
  ) ?? 20;
  const focusRef = normalizeOptionalString(
    option(args, '--focus-ref') ?? env.CLOUDFLARE_CARRIER_SITE_FILE_CHANGE_PROPOSAL_FOCUS_REF ?? null,
  );
  return {
    ...parsed,
    focusRef,
    params: {
      ...parsed.params,
      site_file_change_proposal_limit: proposalLimit,
      site_file_materialization_limit: materializationLimit,
    },
  };
}

export async function readSiteFileChangeProposalReview(config, fetchImpl = fetch) {
  const product = await readProductSurface(config, fetchImpl);
  return {
    schema: 'narada.cloudflare_carrier.site_file_change_proposal_review.v1',
    status: 'ok',
    worker_url: product.worker_url,
    auth_source: product.auth_source,
    operation: product.operation,
    params: product.params,
    summary: summarizeSiteFileChangeProposalReview(product.response, {
      operationSummary: product.summary,
      focusRef: config.focusRef,
    }),
    response: product.response,
  };
}

export function summarizeSiteFileChangeProposalReview(body = {}, options = {}) {
  const operationSummary = options.operationSummary ?? {};
  const proposals = Array.isArray(body?.site_file_change_proposals) ? body.site_file_change_proposals : [];
  const materializations = Array.isArray(body?.site_file_materializations) ? body.site_file_materializations : [];
  const focusReviews = Array.isArray(body?.operation_focus_reviews) ? body.operation_focus_reviews : [];
  const focusRef = options.focusRef ?? operationSummary.workflow_focus_ref ?? null;
  const exactFocusedProposals = focusRef
    ? proposals.filter((entry) => entry?.proposal_id === focusRef)
    : [];
  const focusedProposals = exactFocusedProposals.length > 0 ? exactFocusedProposals : proposals;
  const focusedProposal = selectFocusedProposal(proposals, focusRef);
  const focusedProposalId = focusedProposal?.proposal_id ?? focusRef ?? null;
  const proposalRecord = focusedProposal?.record?.proposal ?? focusedProposal?.proposal ?? null;
  const proposalFiles = Array.isArray(proposalRecord?.files) ? proposalRecord.files : [];
  const linkedMaterializations = focusedProposalId
    ? materializations.filter((entry) => entry?.proposal_id === focusedProposalId)
    : [];
  const latestFocusReview = focusedProposalId
    ? focusReviews.find((entry) => entry?.focus_kind === 'site_file_change_proposal'
      && entry?.focus_ref === focusedProposalId) ?? null
    : null;
  const firstFile = proposalFiles[0] ?? null;
  const latestMaterialization = linkedMaterializations[0] ?? null;
  const requestedProposalPosture = focusedProposal?.proposal_posture ?? proposalRecord?.proposal_posture ?? null;
  const currentProposalPosture = latestMaterialization?.materialization_posture ?? requestedProposalPosture;
  const requestedFilesystemMutationAdmission =
    focusedProposal?.filesystem_mutation_admission ?? proposalRecord?.filesystem_mutation_admission ?? null;
  const currentFilesystemMutationAdmission =
    latestMaterialization?.windows_filesystem_mutation_admission
    ?? latestMaterialization?.filesystem_mutation_admission
    ?? requestedFilesystemMutationAdmission;
  const requestedRepositoryPublicationAdmission =
    focusedProposal?.repository_publication_admission ?? proposalRecord?.repository_publication_admission ?? null;
  const currentRepositoryPublicationAdmission =
    latestMaterialization?.repository_publication_admission ?? requestedRepositoryPublicationAdmission;
  return {
    site_id: body?.operation?.site_id ?? body?.site_id ?? operationSummary.site_id ?? null,
    operation_id: body?.operation?.operation_id ?? body?.operation_id ?? operationSummary.operation_id ?? null,
    workflow_next_action: operationSummary.workflow_next_action ?? null,
    workflow_reason: operationSummary.workflow_reason ?? null,
    workflow_focus_ref: operationSummary.workflow_focus_ref ?? focusRef ?? null,
    proposal_count: focusedProposals.length,
    focused_proposal_id: focusedProposalId,
    focused_proposal_ref: focusedProposal?.proposal_ref ?? proposalRecord?.proposal_ref ?? null,
    focused_proposal_summary: focusedProposal?.proposal_summary ?? proposalRecord?.proposal_summary ?? null,
    current_proposal_posture: currentProposalPosture,
    requested_proposal_posture: requestedProposalPosture,
    focused_file_count: focusedProposal?.file_count ?? proposalFiles.length,
    focused_first_file_path: firstFile?.file_path ?? null,
    focused_first_file_change_kind: firstFile?.change_kind ?? null,
    focused_first_file_material_source_ref: firstFile?.material_source_ref ?? null,
    proposal_authority: focusedProposal?.authority_locus ?? proposalRecord?.authority_locus ?? null,
    filesystem_executor_authority: focusedProposal?.filesystem_executor_authority ?? proposalRecord?.filesystem_executor_authority ?? null,
    current_filesystem_mutation_admission: currentFilesystemMutationAdmission,
    requested_filesystem_mutation_admission: requestedFilesystemMutationAdmission,
    current_repository_publication_admission: currentRepositoryPublicationAdmission,
    requested_repository_publication_admission: requestedRepositoryPublicationAdmission,
    focused_recorded_at: focusedProposal?.recorded_at ?? focusedProposal?.record?.recorded_at ?? null,
    focused_recorded_by_principal_id: focusedProposal?.recorded_by_principal_id ?? focusedProposal?.record?.recorded_by_principal_id ?? null,
    linked_materialization_count: linkedMaterializations.length,
    linked_materialization_id: latestMaterialization?.materialization_id ?? null,
    linked_materialization_posture: latestMaterialization?.materialization_posture ?? null,
    linked_materialization_effect: latestMaterialization?.write_effect ?? null,
    linked_materialization_file_path: latestMaterialization?.file_path ?? null,
    latest_focus_review: latestFocusReview ? {
      review_id: latestFocusReview.review_id ?? null,
      focus_kind: latestFocusReview.focus_kind ?? null,
      focus_ref: latestFocusReview.focus_ref ?? null,
      review_status: latestFocusReview.review_status ?? null,
      recorded_at: latestFocusReview.recorded_at ?? null,
    } : null,
  };
}

export function formatSiteFileChangeProposalReviewText(result) {
  const summary = result?.summary ?? {};
  const lines = [
    'Site File Change Proposal Review: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    `Operation: ${summary.operation_id ?? 'unknown'}`,
    `Workflow Route: action=${summary.workflow_next_action ?? 'none'} reason=${summary.workflow_reason ?? 'none'}`,
    `Proposals: count=${summary.proposal_count ?? 0} focused=${summary.focused_proposal_id ?? 'none'}`,
  ];
  if (summary.focused_proposal_ref) lines.push(`Proposal Ref: ${summary.focused_proposal_ref}`);
  if (summary.focused_proposal_summary) lines.push(`Summary: ${summary.focused_proposal_summary}`);
  if (summary.current_proposal_posture) lines.push(`Current Posture: ${summary.current_proposal_posture}`);
  if (summary.requested_proposal_posture && summary.requested_proposal_posture !== summary.current_proposal_posture) {
    lines.push(`Requested Posture: ${summary.requested_proposal_posture}`);
  }
  if (summary.proposal_authority || summary.filesystem_executor_authority) {
    lines.push(`Authority: proposal=${summary.proposal_authority ?? 'unknown'} executor=${summary.filesystem_executor_authority ?? 'unknown'}`);
  }
  if (summary.current_filesystem_mutation_admission || summary.current_repository_publication_admission) {
    lines.push(`Current Admissions: filesystem=${summary.current_filesystem_mutation_admission ?? 'unknown'} repository_publication=${summary.current_repository_publication_admission ?? 'unknown'}`);
  }
  if (
    (summary.requested_filesystem_mutation_admission || summary.requested_repository_publication_admission)
    && (summary.requested_filesystem_mutation_admission !== summary.current_filesystem_mutation_admission
      || summary.requested_repository_publication_admission !== summary.current_repository_publication_admission)
  ) {
    lines.push(`Requested Admissions: filesystem=${summary.requested_filesystem_mutation_admission ?? 'unknown'} repository_publication=${summary.requested_repository_publication_admission ?? 'unknown'}`);
  }
  lines.push(`Files: count=${summary.focused_file_count ?? 0}`);
  if (summary.focused_first_file_path) {
    lines.push(
      `First File: ${summary.focused_first_file_path}`
      + `${summary.focused_first_file_change_kind ? ` change=${summary.focused_first_file_change_kind}` : ''}`
      + `${summary.focused_first_file_material_source_ref ? ` material=${summary.focused_first_file_material_source_ref}` : ''}`,
    );
  }
  lines.push(`Linked Materializations: ${summary.linked_materialization_count ?? 0}`);
  if (summary.linked_materialization_id || summary.linked_materialization_posture) {
    lines.push(
      `Latest Materialization: ${summary.linked_materialization_id ?? 'none'}`
      + `${summary.linked_materialization_posture ? ` posture=${summary.linked_materialization_posture}` : ''}`
      + `${summary.linked_materialization_effect ? ` effect=${summary.linked_materialization_effect}` : ''}`,
    );
  }
  if (summary.linked_materialization_file_path) lines.push(`Materialized File: ${summary.linked_materialization_file_path}`);
  if (summary.focused_recorded_at || summary.focused_recorded_by_principal_id) {
    lines.push(`Recorded: ${summary.focused_recorded_at ?? 'unknown'} by ${summary.focused_recorded_by_principal_id ?? 'unknown'}`);
  }
  if (summary.latest_focus_review) {
    lines.push(`Latest Focus Review: ${summary.latest_focus_review.focus_kind ?? 'unknown'}:${summary.latest_focus_review.focus_ref ?? 'unknown'} status=${summary.latest_focus_review.review_status ?? 'unknown'}`);
  }
  if (summary.focused_proposal_id) {
    lines.push(`Review Ack: pnpm --filter @narada2/cloudflare-carrier product:operation:focus-review:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --focus-kind site_file_change_proposal --focus-ref ${summary.focused_proposal_id} --operator-session-file <operator-session-file>`);
  }
  return `${lines.join('\n')}\n`;
}

function selectFocusedProposal(proposals, focusRef) {
  if (!Array.isArray(proposals) || proposals.length === 0) return null;
  if (focusRef) {
    const exact = proposals.find((entry) => entry?.proposal_id === focusRef);
    if (exact) return exact;
  }
  return proposals[0] ?? null;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function parseOptionalInteger(value, label) {
  if (value == null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) throw new Error(`site_file_change_proposal_review_invalid_${label}:${value}`);
  return parsed;
}

function normalizeOptionalString(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseSiteFileChangeProposalReviewArgs(process.argv.slice(2));
    const result = await readSiteFileChangeProposalReview(config);
    if (config.format === 'text') {
      process.stdout.write(formatSiteFileChangeProposalReviewText(result));
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
