#!/usr/bin/env node
import { resolveAuth } from '../shared/cloudflare-carrier-auth-http.mjs';
import { fileURLToPath } from 'node:url';
import { authHeaders } from '../shared/cloudflare-carrier-auth-http.mjs';

const REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY = 'windows_repository_publication_executor';
const REPOSITORY_PUBLICATION_EVIDENCE_STORE_AUTHORITY = 'cloudflare_repository_publication_evidence_store';
const REPOSITORY_PUBLICATION_EVIDENCE_POSTURE = 'windows_repository_publication_resolved_cloudflare_recorded_evidence';

export function parseRepositoryPublicationEvidenceArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const repositoryPublicationEvidenceId = normalizeOptionalString(option(args, '--repository-publication-evidence-id') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_ID ?? null);
  const repositoryPublicationRequestId = normalizeOptionalString(option(args, '--repository-publication-request-id') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_REQUEST_ID ?? null);
  const publicationExecutionId = normalizeOptionalString(option(args, '--publication-execution-id') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_EXECUTION_ID ?? null);
  const generatedAt = normalizeOptionalString(option(args, '--generated-at') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_GENERATED_AT ?? null) ?? new Date(now()).toISOString();
  const publicationRef = normalizeOptionalString(option(args, '--publication-ref') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_PUBLICATION_REF ?? null);
  const requestedActionRef = normalizeOptionalString(option(args, '--action-ref') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_ACTION_REF ?? null);
  const repositoryRef = normalizeOptionalString(option(args, '--repository-ref') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_REPOSITORY_REF ?? null);
  const branchRef = normalizeOptionalString(option(args, '--branch-ref') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_BRANCH_REF ?? null);
  const sourceChangeRef = normalizeOptionalString(option(args, '--source-change-ref') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_SOURCE_CHANGE_REF ?? null);
  const windowsAdmissionAction = normalizeOptionalString(option(args, '--windows-admission-action') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_WINDOWS_ADMISSION_ACTION ?? null) ?? 'admit';
  const windowsAdmissionReason = normalizeOptionalString(option(args, '--windows-admission-reason') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_WINDOWS_ADMISSION_REASON ?? null);
  const publicationStatus = normalizeOptionalString(option(args, '--publication-status') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_STATUS ?? null) ?? (windowsAdmissionAction === 'admit' ? 'completed' : 'refused');
  const repositoryPublicationExecutorAuthority = normalizeOptionalString(option(args, '--repository-publication-executor-authority') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_EXECUTOR_AUTHORITY ?? null);
  const publishedCommitRef = normalizeOptionalString(option(args, '--published-commit-ref') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_PUBLISHED_COMMIT_REF ?? null);
  const rollbackEvidenceRef = normalizeOptionalString(option(args, '--rollback-evidence-ref') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_ROLLBACK_REF ?? null);
  const requestId = option(args, '--request-id') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_REQUEST_REQUEST_ID ?? `repository_publication_evidence_${repositoryPublicationEvidenceId ?? publicationExecutionId ?? now()}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_FORMAT ?? 'json';
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('repository_publication_evidence_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('repository_publication_evidence_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!repositoryPublicationRequestId) throw new Error('repository_publication_evidence_requires_--repository-publication-request-id_or_CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_REQUEST_ID');
  if (!publicationExecutionId) throw new Error('repository_publication_evidence_requires_--publication-execution-id_or_CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_EXECUTION_ID');
  if (!repositoryRef) throw new Error('repository_publication_evidence_requires_--repository-ref_or_CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_REPOSITORY_REF');
  if (!branchRef) throw new Error('repository_publication_evidence_requires_--branch-ref_or_CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_BRANCH_REF');
  if (!sourceChangeRef) throw new Error('repository_publication_evidence_requires_--source-change-ref_or_CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_SOURCE_CHANGE_REF');
  if (!['admit', 'refuse'].includes(windowsAdmissionAction)) throw new Error(`repository_publication_evidence_windows_admission_action_unsupported:${windowsAdmissionAction}`);
  if (!['completed', 'refused', 'failed'].includes(publicationStatus)) throw new Error(`repository_publication_evidence_status_unsupported:${publicationStatus}`);
  if (windowsAdmissionAction === 'admit' && publicationStatus !== 'completed') throw new Error(`repository_publication_evidence_admitted_status_invalid:${publicationStatus}`);
  if (windowsAdmissionAction === 'refuse' && publicationStatus === 'completed') throw new Error(`repository_publication_evidence_refused_status_invalid:${publicationStatus}`);
  if (windowsAdmissionAction === 'admit' && !publishedCommitRef) throw new Error('repository_publication_evidence_requires_--published-commit-ref_for_admit');
  if (!['json', 'text'].includes(format)) throw new Error(`repository_publication_evidence_format_unsupported:${format}`);
  if (!auth) throw new Error('repository_publication_evidence_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    requestId,
    format,
    auth,
    params: {
      site_id: siteId,
      ...(repositoryPublicationEvidenceId ? { repository_publication_evidence_id: repositoryPublicationEvidenceId } : {}),
      source_payload: {
        generated_at: generatedAt,
        repository_publication_request_id: repositoryPublicationRequestId,
        publication_execution_id: publicationExecutionId,
        ...(publicationRef ? { publication_ref: publicationRef } : {}),
        ...(requestedActionRef ? { requested_action_ref: requestedActionRef } : {}),
        repository_ref: repositoryRef,
        branch_ref: branchRef,
        source_change_ref: sourceChangeRef,
        windows_admission_action: windowsAdmissionAction,
        ...(windowsAdmissionReason ? { windows_admission_reason: windowsAdmissionReason } : {}),
        publication_status: publicationStatus,
        repository_publication_executor_authority: repositoryPublicationExecutorAuthority ?? REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY,
        ...(publishedCommitRef ? { published_commit_ref: publishedCommitRef } : {}),
        ...(rollbackEvidenceRef ? { rollback_evidence_ref: rollbackEvidenceRef } : {}),
        cloudflare_git_push_admission: 'not_admitted',
        direct_cloudflare_repository_mutation_admission: 'not_admitted',
      },
    },
  };
}

export async function putCloudflareRepositoryPublicationEvidence(config, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/carrier', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
    },
    body: JSON.stringify({
      operation: 'repository_publication.evidence.put',
      request_id: config.requestId,
      params: config.params,
    }),
  });
  const text = await response.text();
  const body = parseJsonText(text);
  if (response.status < 200 || response.status >= 300) {
    const code = body?.code ?? body?.error ?? `http_${response.status}`;
    const error = new Error(`repository_publication_evidence_failed:${code}`);
    error.code = code;
    error.http_status = response.status;
    error.response = body;
    error.summary = summarizeRepositoryPublicationEvidence(body, config.params);
    error.config = config;
    throw error;
  }
  return {
    schema: 'narada.cloudflare_carrier.repository_publication_evidence.v1',
    status: 'ok',
    request_id: config.requestId,
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    params: redactRepositoryPublicationEvidenceParams(config.params),
    response: body,
    summary: summarizeRepositoryPublicationEvidence(body, config.params),
  };
}

export function summarizeRepositoryPublicationEvidence(body = {}, params = {}) {
  const evidence = body?.evidence ?? {};
  const record = body?.record ?? {};
  const sourcePayload = params?.source_payload ?? {};
  return {
    ok: body.ok ?? null,
    code: body.code ?? null,
    status: body.status ?? null,
    site_id: body.site_id ?? record.site_id ?? params.site_id ?? null,
    repository_publication_evidence_id: record.repository_publication_evidence_id ?? params.repository_publication_evidence_id ?? null,
    repository_publication_request_id:
      evidence.repository_publication_request_id ?? record.repository_publication_request_id ?? sourcePayload.repository_publication_request_id ?? null,
    publication_execution_id:
      evidence.publication_execution_id ?? record.publication_execution_id ?? sourcePayload.publication_execution_id ?? null,
    generated_at: evidence.generated_at ?? record.generated_at ?? sourcePayload.generated_at ?? null,
    publication_ref: evidence.publication_ref ?? record.publication_ref ?? sourcePayload.publication_ref ?? null,
    requested_action_ref: evidence.requested_action_ref ?? record.requested_action_ref ?? sourcePayload.requested_action_ref ?? null,
    repository_ref: evidence.repository_ref ?? record.repository_ref ?? sourcePayload.repository_ref ?? null,
    branch_ref: evidence.branch_ref ?? record.branch_ref ?? sourcePayload.branch_ref ?? null,
    source_change_ref: evidence.source_change_ref ?? record.source_change_ref ?? sourcePayload.source_change_ref ?? null,
    windows_admission_action: evidence.windows_admission_action ?? record.windows_admission_action ?? sourcePayload.windows_admission_action ?? null,
    windows_admission_reason: evidence.windows_admission_reason ?? record.windows_admission_reason ?? sourcePayload.windows_admission_reason ?? null,
    publication_status: evidence.publication_status ?? record.publication_status ?? sourcePayload.publication_status ?? null,
    repository_publication_evidence_authority:
      body.repository_publication_evidence_authority
      ?? record.repository_publication_executor_authority
      ?? evidence.repository_publication_executor_authority
      ?? sourcePayload.repository_publication_executor_authority
      ?? REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY,
    repository_publication_admission_authority:
      body.repository_publication_admission_authority ?? record.cloudflare_repository_publication_admission_authority ?? null,
    cloudflare_evidence_store_authority: body.cloudflare_evidence_store_authority ?? REPOSITORY_PUBLICATION_EVIDENCE_STORE_AUTHORITY,
    repository_publication_admission:
      body.repository_publication_admission ?? record.repository_publication_admission ?? null,
    cloudflare_repository_publication_admission_id:
      body.cloudflare_repository_publication_admission_id ?? record.cloudflare_repository_publication_admission_id ?? null,
    cloudflare_repository_publication_admission_action:
      body.cloudflare_repository_publication_admission_action ?? record.cloudflare_repository_publication_admission_action ?? null,
    published_commit_ref: evidence.published_commit_ref ?? record.published_commit_ref ?? sourcePayload.published_commit_ref ?? null,
    rollback_evidence_ref: evidence.rollback_evidence_ref ?? record.rollback_evidence_ref ?? sourcePayload.rollback_evidence_ref ?? null,
    cloudflare_git_push_admission:
      body.cloudflare_git_push_admission ?? record.cloudflare_git_push_admission ?? evidence.cloudflare_git_push_admission ?? sourcePayload.cloudflare_git_push_admission ?? null,
    direct_cloudflare_repository_mutation_admission:
      body.direct_cloudflare_repository_mutation_admission
      ?? record.direct_cloudflare_repository_mutation_admission
      ?? evidence.direct_cloudflare_repository_mutation_admission
      ?? sourcePayload.direct_cloudflare_repository_mutation_admission
      ?? null,
    evidence_posture: record.evidence_posture ?? evidence.evidence_posture ?? sourcePayload.evidence_posture ?? REPOSITORY_PUBLICATION_EVIDENCE_POSTURE,
    authority_partition: body.authority_partition ?? null,
    recorded_by_principal_id: record.recorded_by_principal_id ?? null,
    recorded_at: record.recorded_at ?? null,
  };
}

export function formatRepositoryPublicationEvidenceText(result) {
  const summary = result?.summary ?? summarizeRepositoryPublicationEvidence(result?.response ?? {}, result?.params ?? {});
  const ok = summary.ok === false || result?.status === 'refused' ? false : true;
  const workerUrl = result?.worker_url ?? null;
  const siteId = summary.site_id ?? result?.params?.site_id ?? null;
  return [
    `Repository Publication Evidence: ${ok === false ? 'refused' : 'ok'}`,
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? result?.params?.site_id ?? 'unknown'}`,
    ...(summary.code ? [`Code: ${summary.code}`] : []),
    ...(summary.status ? [`Status: ${summary.status}`] : []),
    ...(summary.repository_publication_evidence_id ? [`Evidence Id: ${summary.repository_publication_evidence_id}`] : []),
    `Request: ${summary.repository_publication_request_id ?? 'unknown'}`,
    `Execution: ${summary.publication_execution_id ?? 'unknown'}`,
    ...(summary.publication_ref ? [`Publication: ${summary.publication_ref}`] : []),
    ...(summary.requested_action_ref ? [`Action: ${summary.requested_action_ref}`] : []),
    ...(summary.repository_ref ? [`Repository: ${summary.repository_ref}`] : []),
    ...(summary.branch_ref ? [`Branch: ${summary.branch_ref}`] : []),
    ...(summary.source_change_ref ? [`Source Change: ${summary.source_change_ref}`] : []),
    `Authority: executor=${summary.repository_publication_evidence_authority ?? 'unknown'} admission=${summary.repository_publication_admission_authority ?? 'unknown'} store=${summary.cloudflare_evidence_store_authority ?? 'unknown'}`,
    ...(summary.windows_admission_action ? [`Windows Admission: ${summary.windows_admission_action}${summary.windows_admission_reason ? ` reason=${summary.windows_admission_reason}` : ''}`] : []),
    ...(summary.publication_status ? [`Publication Status: ${summary.publication_status}`] : []),
    ...(summary.repository_publication_admission ? [`Repository Publication Admission: ${summary.repository_publication_admission}`] : []),
    ...(summary.cloudflare_repository_publication_admission_id ? [`Cloudflare Admission Id: ${summary.cloudflare_repository_publication_admission_id}`] : []),
    ...(summary.cloudflare_repository_publication_admission_action ? [`Cloudflare Admission Action: ${summary.cloudflare_repository_publication_admission_action}`] : []),
    ...(summary.published_commit_ref ? [`Published Commit: ${summary.published_commit_ref}`] : []),
    ...(summary.rollback_evidence_ref ? [`Rollback Evidence: ${summary.rollback_evidence_ref}`] : []),
    ...(summary.cloudflare_git_push_admission ? [`Cloudflare Git Push Admission: ${summary.cloudflare_git_push_admission}`] : []),
    ...(summary.direct_cloudflare_repository_mutation_admission ? [`Direct Cloudflare Repository Mutation: ${summary.direct_cloudflare_repository_mutation_admission}`] : []),
    ...(summary.evidence_posture ? [`Posture: ${summary.evidence_posture}`] : []),
    ...(summary.authority_partition ? [`Authority Partition: ${summary.authority_partition}`] : []),
    ...(summary.recorded_by_principal_id ? [`Recorded By: ${summary.recorded_by_principal_id}`] : []),
    ...(summary.recorded_at ? [`Recorded At: ${summary.recorded_at}`] : []),
    ...(workerUrl && siteId ? [`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${workerUrl} --site ${siteId} --operator-session-file <operator-session-file>`] : []),
    ...(workerUrl && siteId ? [`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${workerUrl} --site ${siteId} --operator-session-file <operator-session-file> --execute-site-next`] : []),
    ...(workerUrl && siteId ? [`Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text -- --url ${workerUrl} --site ${siteId} --operator-session-file <operator-session-file>`] : []),
    ...(workerUrl && siteId ? [`Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text -- --url ${workerUrl} --site ${siteId} --operator-session-file <operator-session-file>`] : []),
    ...(workerUrl && siteId && summary.repository_publication_request_id ? [`Request Review: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:request:review:text -- --url ${workerUrl} --site ${siteId} --repository-publication-request-id ${summary.repository_publication_request_id} --operator-session-file <operator-session-file>`] : []),
  ].join('\n') + '\n';
}

function redactRepositoryPublicationEvidenceParams(params = {}) {
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
    const config = parseRepositoryPublicationEvidenceArgs(process.argv.slice(2));
    const result = await putCloudflareRepositoryPublicationEvidence(config);
    if (config.format === 'text') {
      process.stdout.write(formatRepositoryPublicationEvidenceText(result));
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  } catch (error) {
    if (error?.response && error?.summary && error?.config?.format === 'text') {
      process.stderr.write(
        formatRepositoryPublicationEvidenceText({
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
