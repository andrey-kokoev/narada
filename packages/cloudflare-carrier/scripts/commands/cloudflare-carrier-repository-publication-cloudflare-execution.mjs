#!/usr/bin/env node
import { resolveAuth } from '../shared/cloudflare-carrier-auth-http.mjs';
import { fileURLToPath } from 'node:url';
import { authHeaders } from '../shared/cloudflare-carrier-auth-http.mjs';

const REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY = 'cloudflare_github_repository_publication_executor';
const REPOSITORY_PUBLICATION_ADMISSION_AUTHORITY = 'cloudflare_repository_publication_admission_controller';
const REPOSITORY_PUBLICATION_AUTHORITY_PARTITION = 'cloudflare_admits_and_executes_github_repository_publication';

export function parseRepositoryPublicationCloudflareExecutionArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const repositoryPublicationRequestId = normalizeOptionalString(option(args, '--repository-publication-request-id') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_EXECUTION_REQUEST_ID ?? null);
  const repositoryPublicationExecutionId = normalizeOptionalString(option(args, '--repository-publication-execution-id') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_EXECUTION_ID ?? null);
  const generatedAt = normalizeOptionalString(option(args, '--generated-at') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_EXECUTION_GENERATED_AT ?? null);
  const executeCloudflareGithub = args.includes('--execute-cloudflare-github') || env.CLOUDFLARE_REPOSITORY_PUBLICATION_EXECUTE_CLOUDFLARE_GITHUB === '1';
  const requestId = option(args, '--request-id') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_EXECUTION_REQUEST_REQUEST_ID ?? `repository_publication_cloudflare_execution_${repositoryPublicationExecutionId ?? repositoryPublicationRequestId ?? now()}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_EXECUTION_FORMAT ?? 'json';
  const auth = resolveAuth(args, env);

  if (!executeCloudflareGithub) throw new Error('repository_publication_cloudflare_execution_requires_--execute-cloudflare-github_or_CLOUDFLARE_REPOSITORY_PUBLICATION_EXECUTE_CLOUDFLARE_GITHUB=1');
  if (!workerUrl) throw new Error('repository_publication_cloudflare_execution_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('repository_publication_cloudflare_execution_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!repositoryPublicationRequestId) throw new Error('repository_publication_cloudflare_execution_requires_--repository-publication-request-id_or_CLOUDFLARE_REPOSITORY_PUBLICATION_EXECUTION_REQUEST_ID');
  if (!['json', 'text'].includes(format)) throw new Error(`repository_publication_cloudflare_execution_format_unsupported:${format}`);
  if (!auth) throw new Error('repository_publication_cloudflare_execution_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    requestId,
    format,
    auth,
    params: {
      site_id: siteId,
      repository_publication_request_id: repositoryPublicationRequestId,
      ...(repositoryPublicationExecutionId ? { repository_publication_execution_id: repositoryPublicationExecutionId } : {}),
      ...(generatedAt ? { generated_at: generatedAt } : {}),
    },
  };
}

export async function executeCloudflareRepositoryPublication(config, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/carrier', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
    },
    body: JSON.stringify({
      operation: 'repository_publication.cloudflare_execution.execute',
      request_id: config.requestId,
      params: config.params,
    }),
  });
  const text = await response.text();
  const body = parseJsonText(text);
  if (response.status < 200 || response.status >= 300) {
    const code = body?.code ?? body?.error ?? `http_${response.status}`;
    const error = new Error(`repository_publication_cloudflare_execution_failed:${code}`);
    error.code = code;
    error.http_status = response.status;
    error.response = body;
    error.summary = summarizeRepositoryPublicationCloudflareExecution(body, config.params);
    error.config = config;
    throw error;
  }
  return {
    schema: 'narada.cloudflare_carrier.repository_publication_cloudflare_execution.v1',
    status: 'ok',
    request_id: config.requestId,
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    params: redactRepositoryPublicationCloudflareExecutionParams(config.params),
    response: body,
    summary: summarizeRepositoryPublicationCloudflareExecution(body, config.params),
  };
}

export function summarizeRepositoryPublicationCloudflareExecution(body = {}, params = {}) {
  const execution = body?.execution ?? {};
  const request = body?.request ?? {};
  const admission = body?.admission ?? {};
  return {
    ok: body.ok ?? null,
    code: body.code ?? null,
    status: body.status ?? null,
    site_id: body.site_id ?? params.site_id ?? null,
    repository_publication_request_id:
      execution.repository_publication_request_id ?? request.repository_publication_request_id ?? params.repository_publication_request_id ?? null,
    repository_publication_execution_id:
      execution.repository_publication_execution_id ?? params.repository_publication_execution_id ?? null,
    publication_ref: execution.publication_ref ?? request.publication_ref ?? null,
    requested_action_ref: execution.requested_action_ref ?? request.requested_action_ref ?? null,
    repository_ref: execution.repository_ref ?? request.repository_ref ?? null,
    branch_ref: execution.branch_ref ?? request.branch_ref ?? null,
    source_change_ref: execution.source_change_ref ?? request.source_change_ref ?? null,
    publication_status: body.publication_status ?? execution.publication_status ?? null,
    repository_publication_executor_authority:
      body.repository_publication_executor_authority ?? execution.repository_publication_executor_authority ?? REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY,
    repository_publication_admission_authority:
      body.repository_publication_admission_authority ?? execution.repository_publication_admission_authority ?? admission.authority_locus ?? REPOSITORY_PUBLICATION_ADMISSION_AUTHORITY,
    repository_publication_admission:
      body.repository_publication_admission ?? execution.repository_publication_admission ?? admission.repository_publication_admission ?? null,
    cloudflare_repository_publication_admission_id:
      execution.cloudflare_repository_publication_admission_id ?? admission.repository_publication_admission_id ?? null,
    cloudflare_repository_publication_admission_action:
      execution.cloudflare_repository_publication_admission_action ?? admission.admission_action ?? null,
    cloudflare_git_push_admission: body.cloudflare_git_push_admission ?? execution.cloudflare_git_push_admission ?? null,
    direct_cloudflare_repository_mutation_admission:
      body.direct_cloudflare_repository_mutation_admission ?? execution.direct_cloudflare_repository_mutation_admission ?? null,
    github_credential_mode: execution.github_credential_mode ?? null,
    github_http_status: execution.github_http_status ?? null,
    github_response_summary: execution.github_response_summary ?? {},
    published_commit_ref: execution.published_commit_ref ?? null,
    rollback_evidence_ref: execution.rollback_evidence_ref ?? null,
    execution_posture: execution.execution_posture ?? null,
    authority_partition: body.authority_partition ?? REPOSITORY_PUBLICATION_AUTHORITY_PARTITION,
  };
}

export function formatRepositoryPublicationCloudflareExecutionText(result) {
  const summary = result?.summary ?? summarizeRepositoryPublicationCloudflareExecution(result?.response ?? {}, result?.params ?? {});
  const ok = summary.ok === false || result?.status === 'refused' ? false : true;
  const workerUrl = result?.worker_url ?? null;
  const siteId = summary.site_id ?? result?.params?.site_id ?? null;
  return [
    `Repository Publication Cloudflare Execution: ${ok === false ? 'refused' : 'ok'}`,
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? result?.params?.site_id ?? 'unknown'}`,
    ...(summary.code ? [`Code: ${summary.code}`] : []),
    ...(summary.status ? [`Status: ${summary.status}`] : []),
    `Request: ${summary.repository_publication_request_id ?? 'unknown'}`,
    ...(summary.repository_publication_execution_id ? [`Execution Id: ${summary.repository_publication_execution_id}`] : []),
    ...(summary.publication_ref ? [`Publication: ${summary.publication_ref}`] : []),
    ...(summary.requested_action_ref ? [`Action: ${summary.requested_action_ref}`] : []),
    ...(summary.repository_ref ? [`Repository: ${summary.repository_ref}`] : []),
    ...(summary.branch_ref ? [`Branch: ${summary.branch_ref}`] : []),
    ...(summary.source_change_ref ? [`Source Change: ${summary.source_change_ref}`] : []),
    ...(summary.publication_status ? [`Publication Status: ${summary.publication_status}`] : []),
    `Authority: executor=${summary.repository_publication_executor_authority ?? 'unknown'} admission=${summary.repository_publication_admission_authority ?? 'unknown'}`,
    ...(summary.repository_publication_admission ? [`Repository Publication Admission: ${summary.repository_publication_admission}`] : []),
    ...(summary.cloudflare_repository_publication_admission_id ? [`Cloudflare Admission Id: ${summary.cloudflare_repository_publication_admission_id}`] : []),
    ...(summary.cloudflare_repository_publication_admission_action ? [`Cloudflare Admission Action: ${summary.cloudflare_repository_publication_admission_action}`] : []),
    ...(summary.github_credential_mode ? [`GitHub Credential Mode: ${summary.github_credential_mode}`] : []),
    ...(summary.github_http_status !== null ? [`GitHub HTTP Status: ${summary.github_http_status}`] : []),
    ...(summary.published_commit_ref ? [`Published Commit: ${summary.published_commit_ref}`] : []),
    ...(summary.rollback_evidence_ref ? [`Rollback Evidence: ${summary.rollback_evidence_ref}`] : []),
    ...(summary.cloudflare_git_push_admission ? [`Cloudflare Git Push Admission: ${summary.cloudflare_git_push_admission}`] : []),
    ...(summary.direct_cloudflare_repository_mutation_admission ? [`Direct Cloudflare Repository Mutation: ${summary.direct_cloudflare_repository_mutation_admission}`] : []),
    ...(summary.execution_posture ? [`Execution Posture: ${summary.execution_posture}`] : []),
    ...(summary.authority_partition ? [`Authority Partition: ${summary.authority_partition}`] : []),
    ...(summary.github_response_summary?.message ? [`GitHub Message: ${summary.github_response_summary.message}`] : []),
    ...(summary.github_response_summary?.ref ? [`GitHub Ref: ${summary.github_response_summary.ref}`] : []),
    ...(summary.github_response_summary?.object_sha ? [`GitHub Object SHA: ${summary.github_response_summary.object_sha}`] : []),
    ...(workerUrl && siteId ? [`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${workerUrl} --site ${siteId} --operator-session-file <operator-session-file>`] : []),
    ...(workerUrl && siteId ? [`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${workerUrl} --site ${siteId} --operator-session-file <operator-session-file> --execute-site-next`] : []),
    ...(workerUrl && siteId ? [`Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text -- --url ${workerUrl} --site ${siteId} --operator-session-file <operator-session-file>`] : []),
    ...(workerUrl && siteId ? [`Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text -- --url ${workerUrl} --site ${siteId} --operator-session-file <operator-session-file>`] : []),
    ...(workerUrl && siteId && summary.repository_publication_request_id ? [`Request Review: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:request:review:text -- --url ${workerUrl} --site ${siteId} --repository-publication-request-id ${summary.repository_publication_request_id} --operator-session-file <operator-session-file>`] : []),
  ].join('\n') + '\n';
}

function redactRepositoryPublicationCloudflareExecutionParams(params = {}) {
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
    const config = parseRepositoryPublicationCloudflareExecutionArgs(process.argv.slice(2));
    const result = await executeCloudflareRepositoryPublication(config);
    if (config.format === 'text') {
      process.stdout.write(formatRepositoryPublicationCloudflareExecutionText(result));
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  } catch (error) {
    if (error?.response && error?.summary && error?.config?.format === 'text') {
      process.stderr.write(
        formatRepositoryPublicationCloudflareExecutionText({
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
