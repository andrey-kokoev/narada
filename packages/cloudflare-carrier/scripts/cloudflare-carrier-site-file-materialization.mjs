#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const SITE_FILE_MATERIALIZATION_POSTURE = 'cloudflare_site_file_store_only_no_windows_filesystem_write_no_repository_publication';
const SITE_FILE_MATERIALIZATION_AUTHORITY = 'cloudflare_carrier_site';
const SITE_FILE_MATERIALIZATION_EXECUTOR = 'cloudflare_site_file_store';

export function parseSiteFileMaterializationArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const materializationId = normalizeOptionalString(option(args, '--materialization-id') ?? env.CLOUDFLARE_SITE_FILE_MATERIALIZATION_ID ?? null);
  const proposalId = normalizeOptionalString(option(args, '--proposal-id') ?? env.CLOUDFLARE_SITE_FILE_MATERIALIZATION_PROPOSAL_ID ?? null);
  const proposalRef = normalizeOptionalString(option(args, '--proposal-ref') ?? env.CLOUDFLARE_SITE_FILE_MATERIALIZATION_PROPOSAL_REF ?? null);
  const filePath = normalizeOptionalString(option(args, '--file-path') ?? option(args, '--file') ?? env.CLOUDFLARE_SITE_FILE_MATERIALIZATION_FILE_PATH ?? null);
  const contentSha256 = normalizeOptionalString(option(args, '--content-sha256') ?? env.CLOUDFLARE_SITE_FILE_MATERIALIZATION_CONTENT_SHA256 ?? null)?.toLowerCase() ?? null;
  const contentRef = normalizeOptionalString(option(args, '--content-ref') ?? env.CLOUDFLARE_SITE_FILE_MATERIALIZATION_CONTENT_REF ?? null);
  const operationId = normalizeOptionalString(option(args, '--operation-id') ?? option(args, '--operation') ?? env.CLOUDFLARE_SITE_FILE_MATERIALIZATION_OPERATION_ID ?? null);
  const taskId = normalizeOptionalString(option(args, '--task-id') ?? env.CLOUDFLARE_SITE_FILE_MATERIALIZATION_TASK_ID ?? null);
  const generatedAt = normalizeOptionalString(option(args, '--generated-at') ?? env.CLOUDFLARE_SITE_FILE_MATERIALIZATION_GENERATED_AT ?? null) ?? new Date(now()).toISOString();
  const requestId = option(args, '--request-id') ?? env.CLOUDFLARE_SITE_FILE_MATERIALIZATION_REQUEST_ID ?? `site_file_materialization_${materializationId ?? now()}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_SITE_FILE_MATERIALIZATION_FORMAT ?? 'json';
  const admitCloudflareSiteFileMaterialization = booleanFlag(args, '--admit-cloudflare-site-file-materialization') || env.CLOUDFLARE_SITE_FILE_MATERIALIZATION_CUTOVER === 'true';
  const materializationAuthorityRef = normalizeOptionalString(option(args, '--materialization-authority-ref') ?? env.CLOUDFLARE_SITE_FILE_MATERIALIZATION_AUTHORITY_REF ?? null);
  const cutoverPointRef = normalizeOptionalString(option(args, '--cutover-point-ref') ?? env.CLOUDFLARE_SITE_FILE_MATERIALIZATION_CUTOVER_POINT_REF ?? null);
  const governedWriteContractRef = normalizeOptionalString(option(args, '--governed-write-contract-ref') ?? env.CLOUDFLARE_SITE_FILE_MATERIALIZATION_CONTRACT_REF ?? null);
  const confirmationEvidenceRef = normalizeOptionalString(option(args, '--confirmation-evidence-ref') ?? env.CLOUDFLARE_SITE_FILE_MATERIALIZATION_CONFIRMATION_EVIDENCE_REF ?? null);
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('site_file_materialization_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('site_file_materialization_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!proposalId && !proposalRef) throw new Error('site_file_materialization_requires_--proposal-id_or_--proposal-ref');
  if (!filePath) throw new Error('site_file_materialization_requires_--file-path_or_CLOUDFLARE_SITE_FILE_MATERIALIZATION_FILE_PATH');
  if (!contentSha256 || !/^[a-f0-9]{64}$/.test(contentSha256)) throw new Error('site_file_materialization_requires_valid_--content-sha256');
  if (!['json', 'text'].includes(format)) throw new Error(`site_file_materialization_format_unsupported:${format}`);
  if (!auth) throw new Error('site_file_materialization_requires_bearer_token_or_operator_session');
  if (admitCloudflareSiteFileMaterialization) {
    if (!materializationAuthorityRef) throw new Error('site_file_materialization_admission_requires_--materialization-authority-ref');
    if (!cutoverPointRef) throw new Error('site_file_materialization_admission_requires_--cutover-point-ref');
    if (!governedWriteContractRef) throw new Error('site_file_materialization_admission_requires_--governed-write-contract-ref');
    if (!confirmationEvidenceRef) throw new Error('site_file_materialization_admission_requires_--confirmation-evidence-ref');
  }

  return {
    workerUrl,
    requestId,
    format,
    auth,
    params: {
      site_id: siteId,
      ...(materializationId ? { materialization_id: materializationId } : {}),
      source_payload: {
        cloudflare_site_file_materialization_cutover: admitCloudflareSiteFileMaterialization,
        generated_at: generatedAt,
        ...(operationId ? { operation_id: operationId } : {}),
        ...(taskId ? { task_id: taskId } : {}),
        ...(proposalId ? { proposal_id: proposalId } : {}),
        ...(proposalRef ? { proposal_ref: proposalRef } : {}),
        file_path: filePath,
        content_sha256: contentSha256,
        ...(contentRef ? { content_ref: contentRef } : {}),
        ...(admitCloudflareSiteFileMaterialization
          ? {
              materialization_authority_ref: materializationAuthorityRef,
              cutover_point_ref: cutoverPointRef,
              governed_write_contract_ref: governedWriteContractRef,
              confirmation_evidence_ref: confirmationEvidenceRef,
            }
          : {}),
        authority_locus: SITE_FILE_MATERIALIZATION_AUTHORITY,
        filesystem_executor_authority: SITE_FILE_MATERIALIZATION_EXECUTOR,
        windows_filesystem_mutation_admission: 'not_admitted',
        repository_publication_admission: 'not_admitted',
        materialization_posture: SITE_FILE_MATERIALIZATION_POSTURE,
      },
    },
  };
}

export async function admitCloudflareSiteFileMaterialization(config, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/carrier', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
    },
    body: JSON.stringify({
      operation: 'site_file_materialization.admit',
      request_id: config.requestId,
      params: config.params,
    }),
  });
  const text = await response.text();
  const body = parseJsonText(text);
  if (response.status < 200 || response.status >= 300) {
    const code = body?.code ?? body?.error ?? `http_${response.status}`;
    const error = new Error(`site_file_materialization_request_failed:${code}`);
    error.code = code;
    error.http_status = response.status;
    error.response = body;
    error.summary = summarizeSiteFileMaterialization(body, config.params);
    error.config = config;
    throw error;
  }
  return {
    schema: 'narada.cloudflare_carrier.site_file_materialization.v1',
    status: 'ok',
    request_id: config.requestId,
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    params: redactSiteFileMaterializationParams(config.params),
    response: body,
    summary: summarizeSiteFileMaterialization(body, config.params),
  };
}

export function summarizeSiteFileMaterialization(body = {}, params = {}) {
  const materialization = body?.materialization ?? {};
  const record = body?.record ?? {};
  const sourcePayload = params?.source_payload ?? {};
  return {
    ok: body.ok ?? null,
    code: body.code ?? null,
    site_id: body.site_id ?? record.site_id ?? params.site_id ?? null,
    materialization_id: record.materialization_id ?? params.materialization_id ?? null,
    generated_at: materialization.generated_at ?? record.generated_at ?? sourcePayload.generated_at ?? null,
    operation_id: materialization.operation_id ?? record.operation_id ?? sourcePayload.operation_id ?? null,
    task_id: materialization.task_id ?? record.task_id ?? sourcePayload.task_id ?? null,
    proposal_id: materialization.proposal_id ?? record.proposal_id ?? sourcePayload.proposal_id ?? null,
    proposal_ref: materialization.proposal_ref ?? record.proposal_ref ?? sourcePayload.proposal_ref ?? null,
    file_path: materialization.file_path ?? record.file_path ?? sourcePayload.file_path ?? null,
    content_sha256: materialization.content_sha256 ?? record.content_sha256 ?? sourcePayload.content_sha256 ?? null,
    content_ref: materialization.content_ref ?? record.content_ref ?? sourcePayload.content_ref ?? null,
    site_file_materialization_authority:
      body.site_file_materialization_authority ?? record.authority_locus ?? materialization.authority_locus ?? sourcePayload.authority_locus ?? null,
    cloudflare_site_file_materialization_admission: body.cloudflare_site_file_materialization_admission ?? (body.ok === true ? 'admitted' : null),
    filesystem_executor_authority:
      body.filesystem_executor_authority ?? record.filesystem_executor_authority ?? materialization.filesystem_executor_authority ?? sourcePayload.filesystem_executor_authority ?? null,
    windows_filesystem_mutation_admission:
      body.windows_filesystem_mutation_admission ?? record.windows_filesystem_mutation_admission ?? materialization.windows_filesystem_mutation_admission ?? sourcePayload.windows_filesystem_mutation_admission ?? null,
    repository_publication_admission:
      body.repository_publication_admission ?? record.repository_publication_admission ?? materialization.repository_publication_admission ?? sourcePayload.repository_publication_admission ?? null,
    write_effect: body.write_effect ?? record.write_effect ?? materialization.write_effect ?? sourcePayload.write_effect ?? null,
    materialization_posture: record.materialization_posture ?? materialization.materialization_posture ?? sourcePayload.materialization_posture ?? null,
    materialization_authority_ref:
      materialization.materialization_authority_ref ?? record.materialization_authority_ref ?? sourcePayload.materialization_authority_ref ?? null,
    cutover_point_ref: materialization.cutover_point_ref ?? record.cutover_point_ref ?? sourcePayload.cutover_point_ref ?? null,
    governed_write_contract_ref:
      materialization.governed_write_contract_ref ?? record.governed_write_contract_ref ?? sourcePayload.governed_write_contract_ref ?? null,
    confirmation_evidence_ref:
      materialization.confirmation_evidence_ref ?? record.confirmation_evidence_ref ?? sourcePayload.confirmation_evidence_ref ?? null,
    recorded_by_principal_id: record.recorded_by_principal_id ?? null,
    recorded_at: record.recorded_at ?? null,
  };
}

export function formatSiteFileMaterializationText(result) {
  const summary = result?.summary ?? summarizeSiteFileMaterialization(result?.response ?? {}, result?.params ?? {});
  const workerUrl = result?.worker_url ?? null;
  const ok = summary.ok === false || result?.status === 'refused' ? false : true;
  const lines = [
    `Site File Materialization: ${ok === false ? 'refused' : 'ok'}`,
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? result?.params?.site_id ?? 'unknown'}`,
    ...(summary.code ? [`Code: ${summary.code}`] : []),
    ...(summary.materialization_id ? [`Materialization Id: ${summary.materialization_id}`] : []),
    `Proposal: ${summary.proposal_id ?? 'unknown'}${summary.proposal_ref ? ` ref=${summary.proposal_ref}` : ''}`,
    `File: ${summary.file_path ?? 'unknown'}`,
    `Content: sha256=${summary.content_sha256 ?? 'unknown'}${summary.content_ref ? ` ref=${summary.content_ref}` : ''}`,
    ...(summary.operation_id ? [`Operation: ${summary.operation_id}`] : []),
    ...(summary.task_id ? [`Task: ${summary.task_id}`] : []),
    `Authority: materialization=${summary.site_file_materialization_authority ?? 'unknown'} executor=${summary.filesystem_executor_authority ?? 'unknown'}`,
    ...(summary.cloudflare_site_file_materialization_admission ? [`Cloudflare Admission: ${summary.cloudflare_site_file_materialization_admission}`] : []),
    ...(summary.materialization_posture ? [`Posture: ${summary.materialization_posture}`] : []),
    ...(summary.windows_filesystem_mutation_admission ? [`Windows Filesystem Mutation: ${summary.windows_filesystem_mutation_admission}`] : []),
    ...(summary.repository_publication_admission ? [`Repository Publication: ${summary.repository_publication_admission}`] : []),
    ...(summary.write_effect ? [`Write Effect: ${summary.write_effect}`] : []),
    ...(summary.materialization_authority_ref ? [`Materialization Authority: ${summary.materialization_authority_ref}`] : []),
    ...(summary.cutover_point_ref ? [`Cutover: ${summary.cutover_point_ref}`] : []),
    ...(summary.governed_write_contract_ref ? [`Contract: ${summary.governed_write_contract_ref}`] : []),
    ...(summary.confirmation_evidence_ref ? [`Evidence: ${summary.confirmation_evidence_ref}`] : []),
    ...(summary.recorded_by_principal_id ? [`Recorded By: ${summary.recorded_by_principal_id}`] : []),
    ...(summary.recorded_at ? [`Recorded At: ${summary.recorded_at}`] : []),
  ];
  if (workerUrl && summary.site_id) {
    lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file> --execute-site-next`);
  }
  if (workerUrl && summary.site_id && summary.materialization_id) {
    lines.push(`Materialization Review: pnpm --filter @narada2/cloudflare-carrier product:site-file:materialization:review:text -- --url ${workerUrl} --site ${summary.site_id} --site-file-materialization-id ${summary.materialization_id} --operator-session-file <operator-session-file>`);
  }
  if (workerUrl && summary.site_id && summary.proposal_id) {
    lines.push(`Proposal Review: pnpm --filter @narada2/cloudflare-carrier product:site-file-change:proposal:review:text -- --url ${workerUrl} --site ${summary.site_id} --focus-ref ${summary.proposal_id} --operator-session-file <operator-session-file>`);
  }
  if (workerUrl && summary.site_id && summary.task_id) {
    lines.push(`Task Review: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:review:text -- --url ${workerUrl} --site ${summary.site_id} --task-id ${summary.task_id} --operator-session-file <operator-session-file>`);
    lines.push(`Task Workflow: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --task-id ${summary.task_id} --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next`);
  }
  if (workerUrl && summary.site_id && summary.operation_id) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${workerUrl} --site ${summary.site_id} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file>`);
    lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`);
  }
  return `${lines.join('\n')}\n`;
}

function redactSiteFileMaterializationParams(params = {}) {
  return { ...params };
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function booleanFlag(args, name) {
  return args.includes(name);
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
    const config = parseSiteFileMaterializationArgs(process.argv.slice(2));
    const result = await admitCloudflareSiteFileMaterialization(config);
    if (config.format === 'text') {
      process.stdout.write(formatSiteFileMaterializationText(result));
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  } catch (error) {
    if (error?.response && error?.summary && error?.config?.format === 'text') {
      process.stderr.write(
        formatSiteFileMaterializationText({
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
