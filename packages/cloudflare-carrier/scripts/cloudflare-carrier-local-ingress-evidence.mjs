#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const LOCAL_INGRESS_EXECUTOR_AUTHORITY = 'windows_local_ingress_executor';
const LOCAL_INGRESS_EVIDENCE_POSTURE = 'windows_local_ingress_executed_cloudflare_recorded_evidence';
const LOCAL_INGRESS_EVIDENCE_STORE_AUTHORITY = 'cloudflare_local_ingress_evidence_store';

export function parseLocalIngressEvidenceArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const localIngressEvidenceId = normalizeOptionalString(option(args, '--local-ingress-evidence-id') ?? env.CLOUDFLARE_LOCAL_INGRESS_EVIDENCE_ID ?? null);
  const localIngressRequestId = normalizeOptionalString(option(args, '--local-ingress-request-id') ?? env.CLOUDFLARE_LOCAL_INGRESS_EVIDENCE_REQUEST_ID ?? null);
  const localExecutionId = normalizeOptionalString(option(args, '--local-execution-id') ?? env.CLOUDFLARE_LOCAL_INGRESS_EVIDENCE_EXECUTION_ID ?? null);
  const generatedAt = normalizeOptionalString(option(args, '--generated-at') ?? env.CLOUDFLARE_LOCAL_INGRESS_EVIDENCE_GENERATED_AT ?? null) ?? new Date(now()).toISOString();
  const changedFiles = collectChangedFiles(args, env);
  const windowsAdmissionReason = normalizeOptionalString(option(args, '--windows-admission-reason') ?? env.CLOUDFLARE_LOCAL_INGRESS_EVIDENCE_WINDOWS_ADMISSION_REASON ?? null);
  const localExecutorAuthority = normalizeOptionalString(option(args, '--local-executor-authority') ?? env.CLOUDFLARE_LOCAL_INGRESS_EVIDENCE_EXECUTOR_AUTHORITY ?? null);
  const rollbackEvidenceRef = normalizeOptionalString(option(args, '--rollback-evidence-ref') ?? env.CLOUDFLARE_LOCAL_INGRESS_EVIDENCE_ROLLBACK_REF ?? null);
  const requestId = option(args, '--request-id') ?? env.CLOUDFLARE_LOCAL_INGRESS_EVIDENCE_REQUEST_REQUEST_ID ?? `local_ingress_evidence_${localIngressEvidenceId ?? localExecutionId ?? now()}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_LOCAL_INGRESS_EVIDENCE_FORMAT ?? 'json';
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('local_ingress_evidence_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('local_ingress_evidence_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!localIngressRequestId) throw new Error('local_ingress_evidence_requires_--local-ingress-request-id_or_CLOUDFLARE_LOCAL_INGRESS_EVIDENCE_REQUEST_ID');
  if (!localExecutionId) throw new Error('local_ingress_evidence_requires_--local-execution-id_or_CLOUDFLARE_LOCAL_INGRESS_EVIDENCE_EXECUTION_ID');
  if (!changedFiles.length) throw new Error('local_ingress_evidence_requires_--changed-file_or_CLOUDFLARE_LOCAL_INGRESS_EVIDENCE_CHANGED_FILES');
  if (!['json', 'text'].includes(format)) throw new Error(`local_ingress_evidence_format_unsupported:${format}`);
  if (!auth) throw new Error('local_ingress_evidence_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    requestId,
    format,
    auth,
    params: {
      site_id: siteId,
      ...(localIngressEvidenceId ? { local_ingress_evidence_id: localIngressEvidenceId } : {}),
      source_payload: {
        generated_at: generatedAt,
        local_ingress_request_id: localIngressRequestId,
        local_execution_id: localExecutionId,
        requested_mutation_class: 'local_repository_filesystem_mutation',
        windows_admission_action: 'admit',
        ...(windowsAdmissionReason ? { windows_admission_reason: windowsAdmissionReason } : {}),
        local_execution_status: 'completed',
        local_executor_authority: localExecutorAuthority ?? LOCAL_INGRESS_EXECUTOR_AUTHORITY,
        local_filesystem_mutation_admission: 'admitted_by_windows_local_ingress',
        changed_files: changedFiles,
        ...(rollbackEvidenceRef ? { rollback_evidence_ref: rollbackEvidenceRef } : {}),
        direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
        repository_publication_admission: 'not_admitted',
      },
    },
  };
}

export async function putCloudflareLocalIngressEvidence(config, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/carrier', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
    },
    body: JSON.stringify({
      operation: 'local_ingress.evidence.put',
      request_id: config.requestId,
      params: config.params,
    }),
  });
  const text = await response.text();
  const body = parseJsonText(text);
  if (response.status < 200 || response.status >= 300) {
    const code = body?.code ?? body?.error ?? `http_${response.status}`;
    const error = new Error(`local_ingress_evidence_failed:${code}`);
    error.code = code;
    error.http_status = response.status;
    error.response = body;
    error.summary = summarizeLocalIngressEvidence(body, config.params);
    error.config = config;
    throw error;
  }
  return {
    schema: 'narada.cloudflare_carrier.local_ingress_evidence.v1',
    status: 'ok',
    request_id: config.requestId,
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    params: redactLocalIngressEvidenceParams(config.params),
    response: body,
    summary: summarizeLocalIngressEvidence(body, config.params),
  };
}

export function summarizeLocalIngressEvidence(body = {}, params = {}) {
  const evidence = body?.evidence ?? {};
  const record = body?.record ?? {};
  const sourcePayload = params?.source_payload ?? {};
  return {
    ok: body.ok ?? null,
    code: body.code ?? null,
    status: body.status ?? null,
    site_id: body.site_id ?? record.site_id ?? params.site_id ?? null,
    local_ingress_evidence_id: record.local_ingress_evidence_id ?? params.local_ingress_evidence_id ?? null,
    generated_at: evidence.generated_at ?? record.generated_at ?? sourcePayload.generated_at ?? null,
    local_ingress_request_id: evidence.local_ingress_request_id ?? record.local_ingress_request_id ?? sourcePayload.local_ingress_request_id ?? null,
    local_execution_id: evidence.local_execution_id ?? record.local_execution_id ?? sourcePayload.local_execution_id ?? null,
    requested_mutation_class: evidence.requested_mutation_class ?? record.requested_mutation_class ?? sourcePayload.requested_mutation_class ?? null,
    windows_admission_action: evidence.windows_admission_action ?? record.windows_admission_action ?? sourcePayload.windows_admission_action ?? null,
    windows_admission_reason: evidence.windows_admission_reason ?? record.windows_admission_reason ?? sourcePayload.windows_admission_reason ?? null,
    local_execution_status: evidence.local_execution_status ?? record.local_execution_status ?? sourcePayload.local_execution_status ?? null,
    local_executor_authority:
      body.local_ingress_evidence_authority ?? record.local_executor_authority ?? evidence.local_executor_authority ?? sourcePayload.local_executor_authority ?? null,
    cloudflare_evidence_store_authority: body.cloudflare_evidence_store_authority ?? LOCAL_INGRESS_EVIDENCE_STORE_AUTHORITY,
    local_filesystem_mutation_admission:
      body.local_filesystem_mutation_admission ?? record.local_filesystem_mutation_admission ?? evidence.local_filesystem_mutation_admission ?? sourcePayload.local_filesystem_mutation_admission ?? null,
    direct_cloudflare_filesystem_mutation_admission:
      body.direct_cloudflare_filesystem_mutation_admission ?? record.direct_cloudflare_filesystem_mutation_admission ?? evidence.direct_cloudflare_filesystem_mutation_admission ?? sourcePayload.direct_cloudflare_filesystem_mutation_admission ?? null,
    repository_publication_admission:
      body.repository_publication_admission ?? record.repository_publication_admission ?? evidence.repository_publication_admission ?? sourcePayload.repository_publication_admission ?? null,
    changed_file_count:
      record.changed_file_count
      ?? (Array.isArray(evidence.changed_files) ? evidence.changed_files.length : null)
      ?? (Array.isArray(sourcePayload.changed_files) ? sourcePayload.changed_files.length : null),
    changed_files: Array.isArray(evidence.changed_files) ? evidence.changed_files : Array.isArray(sourcePayload.changed_files) ? sourcePayload.changed_files : [],
    rollback_evidence_ref: evidence.rollback_evidence_ref ?? record.rollback_evidence_ref ?? sourcePayload.rollback_evidence_ref ?? null,
    evidence_posture: record.evidence_posture ?? evidence.evidence_posture ?? sourcePayload.evidence_posture ?? LOCAL_INGRESS_EVIDENCE_POSTURE,
    authority_partition: body.authority_partition ?? null,
    recorded_by_principal_id: record.recorded_by_principal_id ?? null,
    recorded_at: record.recorded_at ?? null,
  };
}

export function formatLocalIngressEvidenceText(result) {
  const summary = result?.summary ?? summarizeLocalIngressEvidence(result?.response ?? {}, result?.params ?? {});
  const ok = summary.ok === false || result?.status === 'refused' ? false : true;
  const lines = [
    `Local Ingress Evidence: ${ok === false ? 'refused' : 'ok'}`,
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? result?.params?.site_id ?? 'unknown'}`,
    ...(summary.code ? [`Code: ${summary.code}`] : []),
    ...(summary.status ? [`Status: ${summary.status}`] : []),
    ...(summary.local_ingress_evidence_id ? [`Evidence Id: ${summary.local_ingress_evidence_id}`] : []),
    `Request: ${summary.local_ingress_request_id ?? 'unknown'}`,
    `Execution: ${summary.local_execution_id ?? 'unknown'}`,
    `Authority: executor=${summary.local_executor_authority ?? 'unknown'} store=${summary.cloudflare_evidence_store_authority ?? 'unknown'}`,
    ...(summary.requested_mutation_class ? [`Mutation Class: ${summary.requested_mutation_class}`] : []),
    ...(summary.windows_admission_action ? [`Windows Admission: ${summary.windows_admission_action}${summary.windows_admission_reason ? ` reason=${summary.windows_admission_reason}` : ''}`] : []),
    ...(summary.local_execution_status ? [`Execution Status: ${summary.local_execution_status}`] : []),
    ...(summary.local_filesystem_mutation_admission ? [`Local Filesystem Mutation: ${summary.local_filesystem_mutation_admission}`] : []),
    ...(summary.direct_cloudflare_filesystem_mutation_admission ? [`Direct Cloudflare Filesystem Mutation: ${summary.direct_cloudflare_filesystem_mutation_admission}`] : []),
    ...(summary.repository_publication_admission ? [`Repository Publication: ${summary.repository_publication_admission}`] : []),
    ...(summary.changed_file_count !== null ? [`Changed File Count: ${summary.changed_file_count}`] : []),
    ...summary.changed_files.map((filePath) => `Changed File: ${filePath}`),
    ...(summary.rollback_evidence_ref ? [`Rollback Evidence: ${summary.rollback_evidence_ref}`] : []),
    ...(summary.evidence_posture ? [`Posture: ${summary.evidence_posture}`] : []),
    ...(summary.authority_partition ? [`Authority Partition: ${summary.authority_partition}`] : []),
    ...(summary.recorded_by_principal_id ? [`Recorded By: ${summary.recorded_by_principal_id}`] : []),
    ...(summary.recorded_at ? [`Recorded At: ${summary.recorded_at}`] : []),
  ];
  if (summary.site_id && summary.local_ingress_request_id) {
    lines.push(`Request Review: pnpm --filter @narada2/cloudflare-carrier product:local-ingress:request:review:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id} --local-ingress-request-id ${summary.local_ingress_request_id} --operator-session-file <operator-session-file>`);
  }
  return `${lines.join('\n')}\n`;
}

function collectChangedFiles(args, env) {
  const inline = collectRepeatedOption(args, '--changed-file')
    .concat(collectRepeatedOption(args, '--file-path'))
    .map((value) => normalizeOptionalString(value))
    .filter(Boolean);
  if (inline.length) return inline;
  const envValue = normalizeOptionalString(env.CLOUDFLARE_LOCAL_INGRESS_EVIDENCE_CHANGED_FILES ?? null);
  if (!envValue) return [];
  return envValue.split(',').map((value) => normalizeOptionalString(value)).filter(Boolean);
}

function collectRepeatedOption(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && typeof args[index + 1] === 'string') {
      values.push(args[index + 1]);
      index += 1;
    }
  }
  return values;
}

function redactLocalIngressEvidenceParams(params = {}) {
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
  return value.endsWith('/') ? value : `${value}/`;
}

function parseJsonText(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw_text: text };
  }
}

async function main() {
  const config = parseLocalIngressEvidenceArgs(process.argv.slice(2));
  const result = await putCloudflareLocalIngressEvidence(config);
  if (config.format === 'text') {
    process.stdout.write(formatLocalIngressEvidenceText(result));
    return;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isEntrypoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isEntrypoint) {
  main().catch((error) => {
    const result = error?.summary
      ? {
          schema: 'narada.cloudflare_carrier.local_ingress_evidence.v1',
          status: 'refused',
          request_id: error?.config?.requestId ?? null,
          worker_url: error?.config?.workerUrl ?? null,
          auth_source: error?.config?.auth?.source ?? null,
          params: redactLocalIngressEvidenceParams(error?.config?.params ?? {}),
          response: error?.response ?? { ok: false, code: error?.code ?? 'unknown_error' },
          summary: error.summary,
        }
      : null;
    if (result?.summary && (error?.config?.format ?? 'json') === 'text') {
      process.stdout.write(formatLocalIngressEvidenceText(result));
    } else if (result) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stderr.write(`${error?.stack ?? String(error)}\n`);
    }
    process.exitCode = 1;
  });
}
