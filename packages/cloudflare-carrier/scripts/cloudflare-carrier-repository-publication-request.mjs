#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const REPOSITORY_PUBLICATION_REQUEST_AUTHORITY = 'cloudflare_repository_publication_request_queue';
const REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY = 'windows_repository_publication_executor';
const REPOSITORY_PUBLICATION_REQUEST_POSTURE = 'cloudflare_queued_repository_publication_request_windows_must_admit_publish_and_return_evidence';

export function parseRepositoryPublicationRequestArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const repositoryPublicationRequestId = normalizeOptionalString(option(args, '--repository-publication-request-id') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_REQUEST_ID ?? null);
  const operationId = normalizeOptionalString(option(args, '--operation-id') ?? option(args, '--operation') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_OPERATION_ID ?? null);
  const taskId = normalizeOptionalString(option(args, '--task-id') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_TASK_ID ?? null);
  const generatedAt = normalizeOptionalString(option(args, '--generated-at') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_GENERATED_AT ?? null) ?? new Date(now()).toISOString();
  const publicationRef = normalizeOptionalString(option(args, '--publication-ref') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_REF ?? null);
  const requestedActionRef = normalizeOptionalString(option(args, '--action-ref') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_ACTION_REF ?? null);
  const requestedActionSummary = normalizeOptionalString(option(args, '--summary') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_SUMMARY ?? null);
  const repositoryRef = normalizeOptionalString(option(args, '--repository-ref') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_REPOSITORY_REF ?? null);
  const branchRef = normalizeOptionalString(option(args, '--branch-ref') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_BRANCH_REF ?? null);
  const sourceChangeRef = normalizeOptionalString(option(args, '--source-change-ref') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_SOURCE_CHANGE_REF ?? null);
  const governedRequestContractRef = normalizeOptionalString(option(args, '--contract-ref') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_CONTRACT_REF ?? null);
  const evidenceReturnContractRef = normalizeOptionalString(option(args, '--evidence-contract-ref') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_CONTRACT_REF ?? null);
  const rollbackPlanRef = normalizeOptionalString(option(args, '--rollback-ref') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_ROLLBACK_REF ?? null);
  const requestId = option(args, '--request-id') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_REQUEST_REQUEST_ID ?? `repository_publication_request_${repositoryPublicationRequestId ?? publicationRef ?? now()}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_FORMAT ?? 'json';
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('repository_publication_request_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('repository_publication_request_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!publicationRef) throw new Error('repository_publication_request_requires_--publication-ref_or_CLOUDFLARE_REPOSITORY_PUBLICATION_REF');
  if (!repositoryRef) throw new Error('repository_publication_request_requires_--repository-ref_or_CLOUDFLARE_REPOSITORY_PUBLICATION_REPOSITORY_REF');
  if (!branchRef) throw new Error('repository_publication_request_requires_--branch-ref_or_CLOUDFLARE_REPOSITORY_PUBLICATION_BRANCH_REF');
  if (!sourceChangeRef) throw new Error('repository_publication_request_requires_--source-change-ref_or_CLOUDFLARE_REPOSITORY_PUBLICATION_SOURCE_CHANGE_REF');
  if (!governedRequestContractRef) throw new Error('repository_publication_request_requires_--contract-ref_or_CLOUDFLARE_REPOSITORY_PUBLICATION_CONTRACT_REF');
  if (!evidenceReturnContractRef) throw new Error('repository_publication_request_requires_--evidence-contract-ref_or_CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_CONTRACT_REF');
  if (!rollbackPlanRef) throw new Error('repository_publication_request_requires_--rollback-ref_or_CLOUDFLARE_REPOSITORY_PUBLICATION_ROLLBACK_REF');
  if (!['json', 'text'].includes(format)) throw new Error(`repository_publication_request_format_unsupported:${format}`);
  if (!auth) throw new Error('repository_publication_request_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    requestId,
    format,
    auth,
    params: {
      site_id: siteId,
      ...(repositoryPublicationRequestId ? { repository_publication_request_id: repositoryPublicationRequestId } : {}),
      source_payload: {
        generated_at: generatedAt,
        ...(operationId ? { operation_id: operationId } : {}),
        ...(taskId ? { task_id: taskId } : {}),
        publication_ref: publicationRef,
        requested_action_ref: requestedActionRef ?? publicationRef,
        ...(requestedActionSummary ? { requested_action_summary: requestedActionSummary } : {}),
        repository_ref: repositoryRef,
        branch_ref: branchRef,
        source_change_ref: sourceChangeRef,
        governed_request_contract_ref: governedRequestContractRef,
        evidence_return_contract_ref: evidenceReturnContractRef,
        rollback_plan_ref: rollbackPlanRef,
        repository_publication_admission: 'pending_windows_publication_admission',
        cloudflare_git_push_admission: 'not_admitted',
        direct_cloudflare_repository_mutation_admission: 'not_admitted',
      },
    },
  };
}

export async function createCloudflareRepositoryPublicationRequest(config, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/carrier', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
    },
    body: JSON.stringify({
      operation: 'repository_publication.request.create',
      request_id: config.requestId,
      params: config.params,
    }),
  });
  const text = await response.text();
  const body = parseJsonText(text);
  if (response.status < 200 || response.status >= 300) {
    const code = body?.code ?? body?.error ?? `http_${response.status}`;
    const error = new Error(`repository_publication_request_failed:${code}`);
    error.code = code;
    error.http_status = response.status;
    error.response = body;
    error.summary = summarizeRepositoryPublicationRequest(body, config.params);
    error.config = config;
    throw error;
  }
  return {
    schema: 'narada.cloudflare_carrier.repository_publication_request.v1',
    status: 'ok',
    request_id: config.requestId,
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    params: redactRepositoryPublicationRequestParams(config.params),
    response: body,
    summary: summarizeRepositoryPublicationRequest(body, config.params),
  };
}

export function summarizeRepositoryPublicationRequest(body = {}, params = {}) {
  const request = body?.request ?? {};
  const record = body?.record ?? {};
  const sourcePayload = params?.source_payload ?? {};
  return {
    ok: body.ok ?? null,
    code: body.code ?? null,
    status: body.status ?? null,
    site_id: body.site_id ?? record.site_id ?? params.site_id ?? null,
    repository_publication_request_id: record.repository_publication_request_id ?? params.repository_publication_request_id ?? null,
    generated_at: request.generated_at ?? record.generated_at ?? sourcePayload.generated_at ?? null,
    operation_id: request.operation_id ?? record.operation_id ?? sourcePayload.operation_id ?? null,
    task_id: request.task_id ?? record.task_id ?? sourcePayload.task_id ?? null,
    publication_ref: request.publication_ref ?? record.publication_ref ?? sourcePayload.publication_ref ?? null,
    requested_action_ref: request.requested_action_ref ?? record.requested_action_ref ?? sourcePayload.requested_action_ref ?? null,
    requested_action_summary: request.requested_action_summary ?? record.requested_action_summary ?? sourcePayload.requested_action_summary ?? null,
    repository_ref: request.repository_ref ?? record.repository_ref ?? sourcePayload.repository_ref ?? null,
    branch_ref: request.branch_ref ?? record.branch_ref ?? sourcePayload.branch_ref ?? null,
    source_change_ref: request.source_change_ref ?? record.source_change_ref ?? sourcePayload.source_change_ref ?? null,
    repository_publication_request_authority:
      body.repository_publication_request_authority ?? record.authority_locus ?? request.authority_locus ?? REPOSITORY_PUBLICATION_REQUEST_AUTHORITY,
    repository_publication_executor_authority:
      body.repository_publication_executor_authority ?? record.repository_publication_executor_authority ?? request.repository_publication_executor_authority ?? REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY,
    repository_publication_admission:
      body.repository_publication_admission ?? record.repository_publication_admission ?? request.repository_publication_admission ?? sourcePayload.repository_publication_admission ?? null,
    cloudflare_git_push_admission:
      body.cloudflare_git_push_admission ?? record.cloudflare_git_push_admission ?? request.cloudflare_git_push_admission ?? sourcePayload.cloudflare_git_push_admission ?? null,
    direct_cloudflare_repository_mutation_admission:
      body.direct_cloudflare_repository_mutation_admission
      ?? record.direct_cloudflare_repository_mutation_admission
      ?? request.direct_cloudflare_repository_mutation_admission
      ?? sourcePayload.direct_cloudflare_repository_mutation_admission
      ?? null,
    request_posture: record.request_posture ?? request.request_posture ?? sourcePayload.request_posture ?? REPOSITORY_PUBLICATION_REQUEST_POSTURE,
    governed_request_contract_ref:
      request.governed_request_contract_ref ?? record.governed_request_contract_ref ?? sourcePayload.governed_request_contract_ref ?? null,
    evidence_return_contract_ref:
      request.evidence_return_contract_ref ?? record.evidence_return_contract_ref ?? sourcePayload.evidence_return_contract_ref ?? null,
    rollback_plan_ref: request.rollback_plan_ref ?? record.rollback_plan_ref ?? sourcePayload.rollback_plan_ref ?? null,
    authority_partition: body.authority_partition ?? null,
    recorded_by_principal_id: record.recorded_by_principal_id ?? null,
    recorded_at: record.recorded_at ?? null,
  };
}

export function formatRepositoryPublicationRequestText(result) {
  const summary = result?.summary ?? summarizeRepositoryPublicationRequest(result?.response ?? {}, result?.params ?? {});
  const ok = summary.ok === false || result?.status === 'refused' ? false : true;
  return [
    `Repository Publication Request: ${ok === false ? 'refused' : 'ok'}`,
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? result?.params?.site_id ?? 'unknown'}`,
    ...(summary.code ? [`Code: ${summary.code}`] : []),
    ...(summary.status ? [`Status: ${summary.status}`] : []),
    ...(summary.repository_publication_request_id ? [`Request Id: ${summary.repository_publication_request_id}`] : []),
    ...(summary.operation_id ? [`Operation: ${summary.operation_id}`] : []),
    ...(summary.task_id ? [`Task: ${summary.task_id}`] : []),
    ...(summary.publication_ref ? [`Publication: ${summary.publication_ref}`] : []),
    `Action: ${summary.requested_action_ref ?? 'unknown'}${summary.requested_action_summary ? ` summary=${summary.requested_action_summary}` : ''}`,
    ...(summary.repository_ref ? [`Repository: ${summary.repository_ref}`] : []),
    ...(summary.branch_ref ? [`Branch: ${summary.branch_ref}`] : []),
    ...(summary.source_change_ref ? [`Source Change: ${summary.source_change_ref}`] : []),
    `Authority: request=${summary.repository_publication_request_authority ?? 'unknown'} executor=${summary.repository_publication_executor_authority ?? 'unknown'}`,
    ...(summary.repository_publication_admission ? [`Repository Publication Admission: ${summary.repository_publication_admission}`] : []),
    ...(summary.cloudflare_git_push_admission ? [`Cloudflare Git Push Admission: ${summary.cloudflare_git_push_admission}`] : []),
    ...(summary.direct_cloudflare_repository_mutation_admission ? [`Direct Cloudflare Repository Mutation: ${summary.direct_cloudflare_repository_mutation_admission}`] : []),
    ...(summary.request_posture ? [`Posture: ${summary.request_posture}`] : []),
    ...(summary.governed_request_contract_ref ? [`Contract: ${summary.governed_request_contract_ref}`] : []),
    ...(summary.evidence_return_contract_ref ? [`Evidence Contract: ${summary.evidence_return_contract_ref}`] : []),
    ...(summary.rollback_plan_ref ? [`Rollback: ${summary.rollback_plan_ref}`] : []),
    ...(summary.authority_partition ? [`Authority Partition: ${summary.authority_partition}`] : []),
    ...(summary.recorded_by_principal_id ? [`Recorded By: ${summary.recorded_by_principal_id}`] : []),
    ...(summary.recorded_at ? [`Recorded At: ${summary.recorded_at}`] : []),
    ...(summary.site_id && summary.task_id
      ? [`Task Review: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:review:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id} --task-id ${summary.task_id} --operator-session-file <operator-session-file>`]
      : []),
  ].join('\n') + '\n';
}

function redactRepositoryPublicationRequestParams(params = {}) {
  return { ...params };
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

function withTrailingSlash(value) {
  return String(value).endsWith('/') ? value : `${value}/`;
}

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseRepositoryPublicationRequestArgs(process.argv.slice(2));
    const result = await createCloudflareRepositoryPublicationRequest(config);
    if (config.format === 'text') {
      process.stdout.write(formatRepositoryPublicationRequestText(result));
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  } catch (error) {
    if (error?.response && error?.summary && error?.config?.format === 'text') {
      process.stderr.write(
        formatRepositoryPublicationRequestText({
          status: 'refused',
          worker_url: error.config.workerUrl,
          auth_source: error.config.auth?.source,
          params: error.config.params,
          response: error.response,
          summary: error.summary,
        }),
      );
    } else {
      process.stderr.write(JSON.stringify({ ok: false, code: error?.message ?? String(error), response: error?.response, summary: error?.summary }, null, 2) + '\n');
    }
    process.exit(1);
  }
}
