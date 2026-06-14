#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY = 'cloudflare_github_repository_publication_executor';
const REPOSITORY_PUBLICATION_ADMISSION_AUTHORITY = 'cloudflare_repository_publication_admission_controller';

export function parseRepositoryPublicationReadinessArgs(argv = [], env = process.env) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const repositoryRef = normalizeOptionalString(option(args, '--repository-ref') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_REPOSITORY_REF ?? null);
  const branchRef = normalizeOptionalString(option(args, '--branch-ref') ?? option(args, '--branch') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_BRANCH_REF ?? null);
  const requestId = option(args, '--request-id') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_READINESS_REQUEST_ID ?? `repository_publication_readiness_${Date.now()}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_READINESS_FORMAT ?? 'json';
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('repository_publication_readiness_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('repository_publication_readiness_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!['json', 'text'].includes(format)) throw new Error(`repository_publication_readiness_format_unsupported:${format}`);
  if (!auth) throw new Error('repository_publication_readiness_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    requestId,
    format,
    auth,
    params: {
      site_id: siteId,
      ...(repositoryRef ? { repository_ref: repositoryRef } : {}),
      ...(branchRef ? { branch_ref: branchRef } : {}),
    },
  };
}

export async function readCloudflareRepositoryPublicationReadiness(config, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/carrier', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
    },
    body: JSON.stringify({
      operation: 'repository_publication.cloudflare_execution.readiness',
      request_id: config.requestId,
      params: config.params,
    }),
  });
  const text = await response.text();
  const body = parseJsonText(text);
  if (response.status < 200 || response.status >= 300) {
    const code = body?.code ?? body?.error ?? `http_${response.status}`;
    const error = new Error(`repository_publication_readiness_failed:${code}`);
    error.code = code;
    error.http_status = response.status;
    error.response = body;
    error.summary = summarizeRepositoryPublicationReadiness(body, config.params);
    error.config = config;
    throw error;
  }
  return {
    schema: 'narada.cloudflare_carrier.repository_publication_readiness.v1',
    status: 'ok',
    request_id: config.requestId,
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    params: redactRepositoryPublicationReadinessParams(config.params),
    response: body,
    summary: summarizeRepositoryPublicationReadiness(body, config.params),
  };
}

export function summarizeRepositoryPublicationReadiness(body = {}, params = {}) {
  return {
    ok: body.ok ?? null,
    code: body.code ?? null,
    status: body.status ?? null,
    site_id: body.site_id ?? params.site_id ?? null,
    readiness_status: body.readiness_status ?? null,
    repository_publication_executor_authority: body.repository_publication_executor_authority ?? REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY,
    repository_publication_admission_authority: body.repository_publication_admission_authority ?? REPOSITORY_PUBLICATION_ADMISSION_AUTHORITY,
    github_credential_mode: body.github_credential_mode ?? null,
    github_token_configured: body.github_token_configured ?? null,
    github_token_secret_ref: body.github_token_secret_ref ?? null,
    github_app_configured: body.github_app_configured ?? null,
    github_app_id_configured: body.github_app_id_configured ?? null,
    github_app_installation_id_configured: body.github_app_installation_id_configured ?? null,
    github_app_private_key_configured: body.github_app_private_key_configured ?? null,
    github_app_secret_refs: Array.isArray(body.github_app_secret_refs) ? body.github_app_secret_refs : [],
    allowed_repository_count: body.allowed_repository_count ?? null,
    allowed_branch_count: body.allowed_branch_count ?? null,
    allowed_repositories: Array.isArray(body.allowed_repositories) ? body.allowed_repositories : [],
    allowed_branches: Array.isArray(body.allowed_branches) ? body.allowed_branches : [],
    requested_repository_ref: body.requested_repository_ref ?? params.repository_ref ?? null,
    requested_branch_ref: body.requested_branch_ref ?? params.branch_ref ?? null,
    requested_repository_allowed: body.requested_repository_allowed ?? null,
    requested_branch_allowed: body.requested_branch_allowed ?? null,
    missing_configuration: Array.isArray(body.missing_configuration) ? body.missing_configuration : [],
    cloudflare_git_push_admission: body.cloudflare_git_push_admission ?? null,
    direct_cloudflare_repository_mutation_admission: body.direct_cloudflare_repository_mutation_admission ?? null,
    authority_partition: body.authority_partition ?? null,
  };
}

export function formatRepositoryPublicationReadinessText(result) {
  const summary = result?.summary ?? summarizeRepositoryPublicationReadiness(result?.response ?? {}, result?.params ?? {});
  const siteId = summary.site_id ?? result?.params?.site_id ?? null;
  const ok = summary.ok === false || result?.status === 'refused' ? false : true;
  return [
    `Repository Publication Readiness: ${ok === false ? 'refused' : 'ok'}`,
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${siteId ?? 'unknown'}`,
    ...(summary.code ? [`Code: ${summary.code}`] : []),
    ...(summary.status ? [`Status: ${summary.status}`] : []),
    ...(summary.readiness_status ? [`Readiness: ${summary.readiness_status}`] : []),
    `Authority: executor=${summary.repository_publication_executor_authority ?? 'unknown'} admission=${summary.repository_publication_admission_authority ?? 'unknown'}`,
    ...(summary.github_credential_mode ? [`Credential Mode: ${summary.github_credential_mode}`] : []),
    ...(summary.github_token_configured !== null ? [`GitHub Token Configured: ${summary.github_token_configured}`] : []),
    ...(summary.github_token_secret_ref ? [`GitHub Token Secret Ref: ${summary.github_token_secret_ref}`] : []),
    ...(summary.github_app_configured !== null ? [`GitHub App Configured: ${summary.github_app_configured}`] : []),
    ...(summary.requested_repository_ref ? [`Requested Repository: ${summary.requested_repository_ref}`] : []),
    ...(summary.requested_branch_ref ? [`Requested Branch: ${summary.requested_branch_ref}`] : []),
    ...(summary.requested_repository_allowed !== null ? [`Requested Repository Allowed: ${summary.requested_repository_allowed}`] : []),
    ...(summary.requested_branch_allowed !== null ? [`Requested Branch Allowed: ${summary.requested_branch_allowed}`] : []),
    ...(summary.allowed_repository_count !== null ? [`Allowed Repository Count: ${summary.allowed_repository_count}`] : []),
    ...(summary.allowed_branch_count !== null ? [`Allowed Branch Count: ${summary.allowed_branch_count}`] : []),
    ...summary.missing_configuration.map((entry) => `Missing Configuration: ${entry}`),
    ...(summary.cloudflare_git_push_admission ? [`Cloudflare Git Push Admission: ${summary.cloudflare_git_push_admission}`] : []),
    ...(summary.direct_cloudflare_repository_mutation_admission ? [`Direct Cloudflare Repository Mutation: ${summary.direct_cloudflare_repository_mutation_admission}`] : []),
    ...(summary.authority_partition ? [`Authority Partition: ${summary.authority_partition}`] : []),
    ...(siteId ? [`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${siteId} --operator-session-file <operator-session-file>`] : []),
    ...(siteId ? [`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${siteId} --operator-session-file <operator-session-file> --execute-site-next`] : []),
    ...(siteId ? [`Repository Publication Provider Liveness: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:provider-liveness:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${siteId} --operator-session-file <operator-session-file>`] : []),
  ].join('\n') + '\n';
}

function redactRepositoryPublicationReadinessParams(params = {}) {
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
    const config = parseRepositoryPublicationReadinessArgs(process.argv.slice(2));
    const result = await readCloudflareRepositoryPublicationReadiness(config);
    if (config.format === 'text') {
      process.stdout.write(formatRepositoryPublicationReadinessText(result));
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  } catch (error) {
    if (error?.response && error?.summary && error?.config?.format === 'text') {
      process.stderr.write(
        formatRepositoryPublicationReadinessText({
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
