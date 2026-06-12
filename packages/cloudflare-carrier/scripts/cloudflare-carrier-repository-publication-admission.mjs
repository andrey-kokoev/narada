#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const REPOSITORY_PUBLICATION_ADMISSION_AUTHORITY = 'cloudflare_repository_publication_admission_controller';
const REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY = 'windows_repository_publication_executor';
const REPOSITORY_PUBLICATION_ADMISSION_POSTURE = 'cloudflare_admits_repository_publication_request_windows_executes_after_admission';

export function parseRepositoryPublicationAdmissionArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const repositoryPublicationAdmissionId = normalizeOptionalString(option(args, '--repository-publication-admission-id') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_ADMISSION_ID ?? null);
  const repositoryPublicationRequestId = normalizeOptionalString(option(args, '--repository-publication-request-id') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_ADMISSION_REQUEST_ID ?? null);
  const generatedAt = normalizeOptionalString(option(args, '--generated-at') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_ADMISSION_GENERATED_AT ?? null) ?? new Date(now()).toISOString();
  const admissionAction = normalizeOptionalString(option(args, '--admission-action') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_ADMISSION_ACTION ?? null) ?? 'admit';
  const admissionReason = normalizeOptionalString(option(args, '--admission-reason') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_ADMISSION_REASON ?? null);
  const requestId = option(args, '--request-id') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_ADMISSION_REQUEST_REQUEST_ID ?? `repository_publication_admission_${repositoryPublicationAdmissionId ?? repositoryPublicationRequestId ?? now()}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_ADMISSION_FORMAT ?? 'json';
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('repository_publication_admission_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('repository_publication_admission_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!repositoryPublicationRequestId) throw new Error('repository_publication_admission_requires_--repository-publication-request-id_or_CLOUDFLARE_REPOSITORY_PUBLICATION_ADMISSION_REQUEST_ID');
  if (!['admit', 'refuse'].includes(admissionAction)) throw new Error(`repository_publication_admission_action_unsupported:${admissionAction}`);
  if (!['json', 'text'].includes(format)) throw new Error(`repository_publication_admission_format_unsupported:${format}`);
  if (!auth) throw new Error('repository_publication_admission_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    requestId,
    format,
    auth,
    params: {
      site_id: siteId,
      ...(repositoryPublicationAdmissionId ? { repository_publication_admission_id: repositoryPublicationAdmissionId } : {}),
      source_payload: {
        generated_at: generatedAt,
        repository_publication_request_id: repositoryPublicationRequestId,
        admission_action: admissionAction,
        ...(admissionReason ? { admission_reason: admissionReason } : {}),
        repository_publication_admission:
          admissionAction === 'admit' ? 'admitted_by_cloudflare_repository_publication' : 'refused_by_cloudflare_repository_publication',
        cloudflare_git_push_admission: 'not_admitted',
        direct_cloudflare_repository_mutation_admission: 'not_admitted',
      },
    },
  };
}

export async function classifyCloudflareRepositoryPublicationAdmission(config, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/carrier', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
    },
    body: JSON.stringify({
      operation: 'repository_publication.admission.classify',
      request_id: config.requestId,
      params: config.params,
    }),
  });
  const text = await response.text();
  const body = parseJsonText(text);
  if (response.status < 200 || response.status >= 300) {
    const code = body?.code ?? body?.error ?? `http_${response.status}`;
    const error = new Error(`repository_publication_admission_failed:${code}`);
    error.code = code;
    error.http_status = response.status;
    error.response = body;
    error.summary = summarizeRepositoryPublicationAdmission(body, config.params);
    error.config = config;
    throw error;
  }
  return {
    schema: 'narada.cloudflare_carrier.repository_publication_admission.v1',
    status: 'ok',
    request_id: config.requestId,
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    params: redactRepositoryPublicationAdmissionParams(config.params),
    response: body,
    summary: summarizeRepositoryPublicationAdmission(body, config.params),
  };
}

export function summarizeRepositoryPublicationAdmission(body = {}, params = {}) {
  const admission = body?.admission ?? {};
  const record = body?.record ?? {};
  const sourcePayload = params?.source_payload ?? {};
  return {
    ok: body.ok ?? null,
    code: body.code ?? null,
    status: body.status ?? null,
    site_id: body.site_id ?? record.site_id ?? params.site_id ?? null,
    repository_publication_admission_id: record.repository_publication_admission_id ?? params.repository_publication_admission_id ?? null,
    repository_publication_request_id:
      admission.repository_publication_request_id ?? record.repository_publication_request_id ?? sourcePayload.repository_publication_request_id ?? null,
    generated_at: admission.generated_at ?? record.generated_at ?? sourcePayload.generated_at ?? null,
    admission_action: admission.admission_action ?? record.admission_action ?? sourcePayload.admission_action ?? null,
    admission_reason: admission.admission_reason ?? record.admission_reason ?? sourcePayload.admission_reason ?? null,
    repository_publication_admission_authority:
      body.repository_publication_admission_authority ?? record.authority_locus ?? admission.authority_locus ?? REPOSITORY_PUBLICATION_ADMISSION_AUTHORITY,
    repository_publication_executor_authority:
      body.repository_publication_executor_authority
      ?? record.repository_publication_executor_authority
      ?? admission.repository_publication_executor_authority
      ?? REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY,
    repository_publication_admission:
      body.repository_publication_admission ?? record.repository_publication_admission ?? admission.repository_publication_admission ?? sourcePayload.repository_publication_admission ?? null,
    cloudflare_git_push_admission:
      body.cloudflare_git_push_admission ?? record.cloudflare_git_push_admission ?? admission.cloudflare_git_push_admission ?? sourcePayload.cloudflare_git_push_admission ?? null,
    direct_cloudflare_repository_mutation_admission:
      body.direct_cloudflare_repository_mutation_admission
      ?? record.direct_cloudflare_repository_mutation_admission
      ?? admission.direct_cloudflare_repository_mutation_admission
      ?? sourcePayload.direct_cloudflare_repository_mutation_admission
      ?? null,
    admission_posture: record.admission_posture ?? admission.admission_posture ?? sourcePayload.admission_posture ?? REPOSITORY_PUBLICATION_ADMISSION_POSTURE,
    authority_partition: body.authority_partition ?? null,
    recorded_by_principal_id: record.recorded_by_principal_id ?? null,
    recorded_at: record.recorded_at ?? null,
  };
}

export function formatRepositoryPublicationAdmissionText(result) {
  const summary = result?.summary ?? summarizeRepositoryPublicationAdmission(result?.response ?? {}, result?.params ?? {});
  const ok = summary.ok === false || result?.status === 'refused' ? false : true;
  return [
    `Repository Publication Admission: ${ok === false ? 'refused' : 'ok'}`,
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? result?.params?.site_id ?? 'unknown'}`,
    ...(summary.code ? [`Code: ${summary.code}`] : []),
    ...(summary.status ? [`Status: ${summary.status}`] : []),
    ...(summary.repository_publication_admission_id ? [`Admission Id: ${summary.repository_publication_admission_id}`] : []),
    `Request: ${summary.repository_publication_request_id ?? 'unknown'}`,
    ...(summary.generated_at ? [`Generated At: ${summary.generated_at}`] : []),
    ...(summary.admission_action ? [`Decision: ${summary.admission_action}${summary.admission_reason ? ` reason=${summary.admission_reason}` : ''}`] : []),
    `Authority: admission=${summary.repository_publication_admission_authority ?? 'unknown'} executor=${summary.repository_publication_executor_authority ?? 'unknown'}`,
    ...(summary.repository_publication_admission ? [`Repository Publication Admission: ${summary.repository_publication_admission}`] : []),
    ...(summary.cloudflare_git_push_admission ? [`Cloudflare Git Push Admission: ${summary.cloudflare_git_push_admission}`] : []),
    ...(summary.direct_cloudflare_repository_mutation_admission ? [`Direct Cloudflare Repository Mutation: ${summary.direct_cloudflare_repository_mutation_admission}`] : []),
    ...(summary.admission_posture ? [`Posture: ${summary.admission_posture}`] : []),
    ...(summary.authority_partition ? [`Authority Partition: ${summary.authority_partition}`] : []),
    ...(summary.recorded_by_principal_id ? [`Recorded By: ${summary.recorded_by_principal_id}`] : []),
    ...(summary.recorded_at ? [`Recorded At: ${summary.recorded_at}`] : []),
  ].join('\n') + '\n';
}

function redactRepositoryPublicationAdmissionParams(params = {}) {
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
    const config = parseRepositoryPublicationAdmissionArgs(process.argv.slice(2));
    const result = await classifyCloudflareRepositoryPublicationAdmission(config);
    if (config.format === 'text') {
      process.stdout.write(formatRepositoryPublicationAdmissionText(result));
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  } catch (error) {
    if (error?.response && error?.summary && error?.config?.format === 'text') {
      process.stderr.write(
        formatRepositoryPublicationAdmissionText({
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
