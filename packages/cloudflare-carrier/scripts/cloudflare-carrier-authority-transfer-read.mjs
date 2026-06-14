#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { readRepositoryPublicationSurface } from './cloudflare-carrier-repository-publication-read.mjs';
import { readCloudflareRepositoryPublicationReadiness } from './cloudflare-carrier-repository-publication-readiness.mjs';
import { readProductSurface, resolveAuth } from './cloudflare-carrier-product-read.mjs';

export function parseAuthorityTransferReadArgs(argv = [], env = process.env) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const operationId = option(args, '--carrier-operation') ?? option(args, '--operation-id') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? null;
  const repositoryRef = normalizeOptionalString(option(args, '--repository-ref') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_REPOSITORY_REF ?? null);
  const branchRef = normalizeOptionalString(option(args, '--branch-ref') ?? option(args, '--branch') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_BRANCH_REF ?? null);
  const requestId = option(args, '--request-id') ?? env.CLOUDFLARE_AUTHORITY_TRANSFER_READ_REQUEST_ID ?? `authority_transfer_read_${Date.now()}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_AUTHORITY_TRANSFER_READ_FORMAT ?? 'json';
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('authority_transfer_read_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('authority_transfer_read_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!operationId) throw new Error('authority_transfer_read_requires_--operation-id_or_--carrier-operation_or_CLOUDFLARE_CARRIER_OPERATION_ID');
  if (!['json', 'text'].includes(format)) throw new Error(`authority_transfer_read_format_unsupported:${format}`);
  if (!auth) throw new Error('authority_transfer_read_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    requestId,
    format,
    auth,
    operationParams: {
      site_id: siteId,
      operation_id: operationId,
      mailbox_status_source_limit: 20,
      mailbox_draft_reply_proposal_limit: 20,
      mailbox_outlook_draft_create_limit: 20,
      mailbox_send_accepted_limit: 20,
      mailbox_send_confirmation_limit: 20,
      site_file_change_proposal_limit: 20,
      site_file_materialization_limit: 20,
      local_ingress_request_limit: 20,
      repository_publication_request_limit: 20,
      repository_publication_execution_limit: 20,
      repository_publication_evidence_limit: 20,
      task_lifecycle_limit: 20,
    },
    readinessParams: {
      site_id: siteId,
      repository_ref: repositoryRef,
      branch_ref: branchRef,
    },
  };
}

export async function readAuthorityTransfer(config, fetchImpl = fetch) {
  const product = await readProductSurface({
    workerUrl: config.workerUrl,
    operation: 'operation.read',
    requestId: `${config.requestId}_operation`,
    params: config.operationParams,
    auth: config.auth,
  }, fetchImpl);
  const inferredRepositoryTarget = (!config.readinessParams.repository_ref || !config.readinessParams.branch_ref)
    ? await inferRepositoryPublicationTarget(config, fetchImpl)
    : null;
  const resolvedReadinessParams = {
    ...config.readinessParams,
    repository_ref: config.readinessParams.repository_ref ?? inferredRepositoryTarget?.repository_ref ?? null,
    branch_ref: config.readinessParams.branch_ref ?? inferredRepositoryTarget?.branch_ref ?? null,
  };
  if (!resolvedReadinessParams.repository_ref) {
    throw new Error('authority_transfer_read_requires_--repository-ref_or_CLOUDFLARE_REPOSITORY_PUBLICATION_REPOSITORY_REF');
  }
  if (!resolvedReadinessParams.branch_ref) {
    throw new Error('authority_transfer_read_requires_--branch-ref_or_--branch_or_CLOUDFLARE_REPOSITORY_PUBLICATION_BRANCH_REF');
  }
  const readiness = await readCloudflareRepositoryPublicationReadiness({
    workerUrl: config.workerUrl,
    requestId: `${config.requestId}_repository_readiness`,
    params: resolvedReadinessParams,
    auth: config.auth,
  }, fetchImpl);
  return {
    schema: 'narada.cloudflare_carrier.authority_transfer_read.v1',
    status: 'ok',
    request_id: config.requestId,
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    params: redactAuthorityTransferParams(config, resolvedReadinessParams),
    summary: summarizeAuthorityTransfer(product.response, readiness.summary),
    response: {
      operation: product.response,
      repository_readiness: readiness.response,
    },
  };
}

export function summarizeAuthorityTransfer(operationBody = {}, readinessSummary = {}) {
  const posture = operationBody?.authority_transfer_posture ?? operationBody?.operation_product_surface?.authority_transfer_posture ?? {};
  const surface = operationBody?.operation_product_surface ?? {};
  const remainingWindowsDomains = Array.isArray(posture?.remaining_windows_domains) ? posture.remaining_windows_domains : [];
  const remainingWindowsAuthorities = Array.isArray(posture?.remaining_windows_authorities) ? posture.remaining_windows_authorities : [];
  const incompleteReasons = [];
  if (remainingWindowsDomains.length > 0) incompleteReasons.push('remaining_windows_domains_present');
  if (readinessSummary?.readiness_status !== 'ready') incompleteReasons.push('repository_publication_cloudflare_github_not_ready');
  if (readinessSummary?.requested_repository_allowed !== true) incompleteReasons.push('repository_ref_not_allowed');
  if (readinessSummary?.requested_branch_allowed !== true) incompleteReasons.push('branch_ref_not_allowed');

  return {
    site_id: operationBody?.operation?.site_id ?? operationBody?.site_id ?? readinessSummary?.site_id ?? null,
    operation_id: operationBody?.operation?.operation_id ?? operationBody?.operation_id ?? null,
    transfer_readiness: incompleteReasons.length === 0 ? 'ready_for_completion_audit' : 'incomplete',
    transfer_complete: posture?.transfer_complete === true,
    next_action: posture?.next_action ?? null,
    domain_count: posture?.domain_count ?? null,
    cloudflare_owned_count: posture?.cloudflare_owned_count ?? 0,
    cloudflare_governed_windows_executed_count: posture?.cloudflare_governed_windows_executed_count ?? 0,
    cloudflare_recorded_windows_owned_count: posture?.cloudflare_recorded_windows_owned_count ?? 0,
    windows_retained_count: posture?.windows_retained_count ?? 0,
    remaining_windows_domain_count: posture?.remaining_windows_domain_count ?? remainingWindowsDomains.length,
    remaining_windows_authority_count: posture?.remaining_windows_authority_count ?? remainingWindowsAuthorities.length,
    remaining_windows_domains: remainingWindowsDomains,
    remaining_windows_authorities: remainingWindowsAuthorities.slice(0, 20),
    slices: {
      mailbox: {
        status_source_read_count: surface?.mailbox_status_source_read_count ?? 0,
        draft_reply_proposal_count: surface?.mailbox_draft_reply_proposal_count ?? 0,
        outlook_draft_create_count: surface?.mailbox_outlook_draft_create_count ?? 0,
        send_accepted_count: surface?.mailbox_send_accepted_count ?? 0,
        send_confirmation_count: surface?.mailbox_send_confirmation_count ?? 0,
        send_admission: surface?.mailbox_send_admission ?? null,
        mutation_admission: surface?.mailbox_mutation_admission ?? null,
      },
      site_file: {
        change_proposal_count: surface?.site_file_change_proposal_count ?? 0,
        materialization_count: surface?.site_file_materialization_count ?? 0,
      },
      local_ingress: {
        request_count: surface?.local_ingress_request_count ?? 0,
        authority_partition: surface?.local_ingress_authority_partition ?? null,
      },
      task_lifecycle: {
        task_count: surface?.task_lifecycle_count ?? surface?.task_count ?? 0,
        authority_partition: surface?.task_lifecycle_authority_partition ?? null,
      },
      repository_publication: {
        readiness_status: readinessSummary?.readiness_status ?? null,
        github_token_configured: readinessSummary?.github_token_configured ?? null,
        requested_repository_ref: readinessSummary?.requested_repository_ref ?? null,
        requested_branch_ref: readinessSummary?.requested_branch_ref ?? null,
        requested_repository_allowed: readinessSummary?.requested_repository_allowed ?? null,
        requested_branch_allowed: readinessSummary?.requested_branch_allowed ?? null,
        request_count: surface?.repository_publication_request_count ?? 0,
        execution_count: surface?.repository_publication_execution_count ?? 0,
        evidence_count: surface?.repository_publication_evidence_count ?? 0,
        authority_partition: surface?.repository_publication_authority_partition ?? null,
        cloudflare_git_push_admission: readinessSummary?.cloudflare_git_push_admission ?? null,
      },
    },
    incomplete_reasons: incompleteReasons,
  };
}

export function formatAuthorityTransferText(result) {
  const workerUrl = result?.worker_url ?? null;
  const summary = result?.summary ?? {};
  const lines = [
    'Authority Transfer: ok',
    `Worker: ${workerUrl ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    `Operation: ${summary.operation_id ?? 'unknown'}`,
    `Readiness: ${summary.transfer_readiness ?? 'unknown'}`,
    `Transfer: complete=${summary.transfer_complete === true} next=${summary.next_action ?? 'none'}`,
    `Counts: domains=${summary.domain_count ?? 'unknown'} cloudflare_owned=${summary.cloudflare_owned_count ?? 0} windows_retained=${summary.windows_retained_count ?? 0}`,
    `Remaining Windows: domains=${summary.remaining_windows_domain_count ?? 0} authorities=${summary.remaining_windows_authority_count ?? 0}`,
    `Repository Publication: readiness=${summary.slices?.repository_publication?.readiness_status ?? 'unknown'} repository_allowed=${summary.slices?.repository_publication?.requested_repository_allowed ?? 'unknown'} branch_allowed=${summary.slices?.repository_publication?.requested_branch_allowed ?? 'unknown'}`,
    `Slices: mailbox=${summary.slices?.mailbox?.status_source_read_count ?? 0}/${summary.slices?.mailbox?.draft_reply_proposal_count ?? 0}/${summary.slices?.mailbox?.outlook_draft_create_count ?? 0}/${summary.slices?.mailbox?.send_accepted_count ?? 0}/${summary.slices?.mailbox?.send_confirmation_count ?? 0} site_file=${summary.slices?.site_file?.change_proposal_count ?? 0}/${summary.slices?.site_file?.materialization_count ?? 0} local_ingress=${summary.slices?.local_ingress?.request_count ?? 0} task_lifecycle=${summary.slices?.task_lifecycle?.task_count ?? 0} repository_publication=${summary.slices?.repository_publication?.request_count ?? 0}/${summary.slices?.repository_publication?.execution_count ?? 0}/${summary.slices?.repository_publication?.evidence_count ?? 0}`,
  ];
  if (workerUrl && summary.site_id && summary.operation_id) {
    lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file> --execute-site-next`);
    lines.push(`Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${workerUrl} --site ${summary.site_id} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file>`);
    lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`);
    lines.push(`Mailbox Readback Smoke: pnpm --filter @narada2/cloudflare-carrier mailbox:readback-smoke:live:text -- --url ${workerUrl} --site ${summary.site_id} --operation ${summary.operation_id} --operator-session-file <operator-session-file>`);
  }
  if (workerUrl && summary.site_id && isAuthorityTransferWorkflowAction(summary.next_action)) {
    lines.push(`Site Action Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:action:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id}${summary.operation_id ? ` --operation-id ${summary.operation_id}` : ''} --operator-session-file <operator-session-file> --execute-site-action`);
  }
  for (const reason of summary.incomplete_reasons ?? []) {
    lines.push(`Incomplete Reason: ${reason}`);
  }
  return `${lines.join('\n')}\n`;
}

function isAuthorityTransferWorkflowAction(action) {
  return typeof action === 'string'
    && (action.startsWith('transfer_') || action === 'continue_authority_transfer' || action === 'verify_full_cloudflare_authority');
}

async function inferRepositoryPublicationTarget(config, fetchImpl) {
  const repositoryPublication = await readRepositoryPublicationSurface({
    workerUrl: config.workerUrl,
    requestId: `${config.requestId}_repository_publication_request`,
    operation: 'repository_publication.request.list',
    params: {
      site_id: config.operationParams.site_id,
      repository_publication_request_limit: 200,
    },
    auth: config.auth,
  }, fetchImpl);
  const requests = Array.isArray(repositoryPublication.response?.requests) ? repositoryPublication.response.requests : [];
  const focusedRequest = requests.find((entry) => entry?.operation_id === config.operationParams.operation_id) ?? null;
  return {
    repository_ref: focusedRequest?.repository_ref ?? null,
    branch_ref: focusedRequest?.branch_ref ?? null,
  };
}

function redactAuthorityTransferParams(config, resolvedReadinessParams = config.readinessParams) {
  return {
    site_id: config.operationParams?.site_id ?? null,
    operation_id: config.operationParams?.operation_id ?? null,
    repository_ref: resolvedReadinessParams?.repository_ref ?? null,
    branch_ref: resolvedReadinessParams?.branch_ref ?? null,
  };
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function normalizeOptionalString(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeWorkerUrl(value) {
  return String(value ?? '').replace(/\/+$/, '');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseAuthorityTransferReadArgs(process.argv.slice(2));
    const result = await readAuthorityTransfer(config);
    if (config.format === 'text') {
      process.stdout.write(formatAuthorityTransferText(result));
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  } catch (error) {
    process.stderr.write(JSON.stringify({ ok: false, code: error?.message ?? String(error), response: error?.response, summary: error?.summary }, null, 2) + '\n');
    process.exit(1);
  }
}
