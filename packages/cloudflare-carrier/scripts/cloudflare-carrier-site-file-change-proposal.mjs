#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const SITE_FILE_CHANGE_PROPOSAL_SOURCE_SCHEMA = 'narada.sonar.site_file_change_proposal.v1';
const SITE_FILE_CHANGE_PROPOSAL_POSTURE = 'proposal_only_no_filesystem_write';
const SITE_FILE_CHANGE_PROPOSAL_AUTHORITY = 'cloudflare_carrier_site';
const SITE_FILE_CHANGE_PROPOSAL_EXECUTOR = 'windows_filesystem_executor';

export function parseSiteFileChangeProposalArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const proposalId = normalizeOptionalString(option(args, '--proposal-id') ?? env.CLOUDFLARE_SITE_FILE_CHANGE_PROPOSAL_ID ?? null);
  const proposalRef = normalizeOptionalString(option(args, '--proposal-ref') ?? env.CLOUDFLARE_SITE_FILE_CHANGE_PROPOSAL_REF ?? null);
  const proposalSummary = normalizeOptionalString(option(args, '--summary') ?? env.CLOUDFLARE_SITE_FILE_CHANGE_PROPOSAL_SUMMARY ?? null);
  const operationId = normalizeOptionalString(option(args, '--operation-id') ?? option(args, '--operation') ?? env.CLOUDFLARE_SITE_FILE_CHANGE_PROPOSAL_OPERATION_ID ?? null);
  const taskId = normalizeOptionalString(option(args, '--task-id') ?? env.CLOUDFLARE_SITE_FILE_CHANGE_PROPOSAL_TASK_ID ?? null);
  const generatedAt = normalizeOptionalString(option(args, '--generated-at') ?? env.CLOUDFLARE_SITE_FILE_CHANGE_PROPOSAL_GENERATED_AT ?? null) ?? new Date(now()).toISOString();
  const requestId = option(args, '--request-id') ?? env.CLOUDFLARE_SITE_FILE_CHANGE_PROPOSAL_REQUEST_ID ?? `site_file_change_proposal_${proposalId ?? now()}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_SITE_FILE_CHANGE_PROPOSAL_FORMAT ?? 'json';
  const auth = resolveAuth(args, env);
  const files = parseProposalFiles(args, env);

  if (!workerUrl) throw new Error('site_file_change_proposal_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('site_file_change_proposal_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!proposalRef) throw new Error('site_file_change_proposal_requires_--proposal-ref_or_CLOUDFLARE_SITE_FILE_CHANGE_PROPOSAL_REF');
  if (!proposalSummary) throw new Error('site_file_change_proposal_requires_--summary_or_CLOUDFLARE_SITE_FILE_CHANGE_PROPOSAL_SUMMARY');
  if (!['json', 'text'].includes(format)) throw new Error(`site_file_change_proposal_format_unsupported:${format}`);
  if (!auth) throw new Error('site_file_change_proposal_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    requestId,
    format,
    auth,
    params: {
      site_id: siteId,
      ...(proposalId ? { proposal_id: proposalId } : {}),
      source_payload: {
        schema: SITE_FILE_CHANGE_PROPOSAL_SOURCE_SCHEMA,
        generated_at: generatedAt,
        ...(operationId ? { operation_id: operationId } : {}),
        ...(taskId ? { task_id: taskId } : {}),
        proposal_ref: proposalRef,
        proposal_summary: proposalSummary,
        authority_locus: SITE_FILE_CHANGE_PROPOSAL_AUTHORITY,
        filesystem_executor_authority: SITE_FILE_CHANGE_PROPOSAL_EXECUTOR,
        filesystem_mutation_admission: 'not_admitted',
        repository_publication_admission: 'not_admitted',
        proposal_posture: SITE_FILE_CHANGE_PROPOSAL_POSTURE,
        files,
      },
    },
  };
}

export async function recordCloudflareSiteFileChangeProposal(config, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/carrier', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
    },
    body: JSON.stringify({
      operation: 'site_file_change_proposal.record',
      request_id: config.requestId,
      params: config.params,
    }),
  });
  const text = await response.text();
  const body = parseJsonText(text);
  if (response.status < 200 || response.status >= 300) {
    const code = body?.code ?? body?.error ?? `http_${response.status}`;
    const error = new Error(`site_file_change_proposal_request_failed:${code}`);
    error.code = code;
    error.http_status = response.status;
    error.response = body;
    error.summary = summarizeSiteFileChangeProposal(body, config.params);
    error.config = config;
    throw error;
  }
  return {
    schema: 'narada.cloudflare_carrier.site_file_change_proposal.v1',
    status: 'ok',
    request_id: config.requestId,
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    params: redactSiteFileChangeProposalParams(config.params),
    response: body,
    summary: summarizeSiteFileChangeProposal(body, config.params),
  };
}

export function summarizeSiteFileChangeProposal(body = {}, params = {}) {
  const proposal = body?.proposal ?? {};
  const record = body?.record ?? {};
  const sourcePayload = params?.source_payload ?? {};
  const files = Array.isArray(proposal.files) ? proposal.files : Array.isArray(sourcePayload.files) ? sourcePayload.files : [];
  return {
    ok: body.ok ?? null,
    code: body.code ?? null,
    site_id: body.site_id ?? record.site_id ?? params.site_id ?? null,
    proposal_id: record.proposal_id ?? params.proposal_id ?? null,
    generated_at: proposal.generated_at ?? record.generated_at ?? sourcePayload.generated_at ?? null,
    operation_id: proposal.operation_id ?? record.operation_id ?? sourcePayload.operation_id ?? null,
    task_id: proposal.task_id ?? record.task_id ?? sourcePayload.task_id ?? null,
    proposal_ref: proposal.proposal_ref ?? record.proposal_ref ?? sourcePayload.proposal_ref ?? null,
    proposal_summary: proposal.proposal_summary ?? record.proposal_summary ?? sourcePayload.proposal_summary ?? null,
    proposal_authority: body.proposal_authority ?? record.authority_locus ?? proposal.authority_locus ?? sourcePayload.authority_locus ?? null,
    filesystem_executor_authority: body.filesystem_executor_authority ?? record.filesystem_executor_authority ?? proposal.filesystem_executor_authority ?? sourcePayload.filesystem_executor_authority ?? null,
    filesystem_mutation_admission: body.filesystem_mutation_admission ?? record.filesystem_mutation_admission ?? proposal.filesystem_mutation_admission ?? sourcePayload.filesystem_mutation_admission ?? null,
    repository_publication_admission: body.repository_publication_admission ?? record.repository_publication_admission ?? proposal.repository_publication_admission ?? sourcePayload.repository_publication_admission ?? null,
    proposal_posture: record.proposal_posture ?? proposal.proposal_posture ?? sourcePayload.proposal_posture ?? null,
    file_count: record.file_count ?? files.length ?? null,
    files,
    recorded_by_principal_id: record.recorded_by_principal_id ?? null,
    recorded_at: record.recorded_at ?? null,
  };
}

export function formatSiteFileChangeProposalText(result) {
  const summary = result?.summary ?? summarizeSiteFileChangeProposal(result?.response ?? {}, result?.params ?? {});
  const ok = summary.ok === false || result?.status === 'refused' ? false : true;
  const lines = [
    `Site File Change Proposal: ${ok === false ? 'refused' : 'ok'}`,
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? result?.params?.site_id ?? 'unknown'}`,
    ...(summary.code ? [`Code: ${summary.code}`] : []),
    ...(summary.proposal_id ? [`Proposal Id: ${summary.proposal_id}`] : []),
    `Proposal Ref: ${summary.proposal_ref ?? 'unknown'}`,
    `Summary: ${summary.proposal_summary ?? 'unknown'}`,
    ...(summary.operation_id ? [`Operation: ${summary.operation_id}`] : []),
    ...(summary.task_id ? [`Task: ${summary.task_id}`] : []),
    `Authority: proposal=${summary.proposal_authority ?? 'unknown'} executor=${summary.filesystem_executor_authority ?? 'unknown'}`,
    ...(summary.proposal_posture ? [`Posture: ${summary.proposal_posture}`] : []),
    ...(summary.file_count !== null ? [`Files: ${summary.file_count}`] : []),
    ...(summary.filesystem_mutation_admission ? [`Filesystem Mutation: ${summary.filesystem_mutation_admission}`] : []),
    ...(summary.repository_publication_admission ? [`Repository Publication: ${summary.repository_publication_admission}`] : []),
    ...summary.files.slice(0, 5).map((file) => `File: ${file.file_path} kind=${file.change_kind}${file.material_source_ref ? ` material=${file.material_source_ref}` : ''}`),
    ...(summary.recorded_by_principal_id ? [`Recorded By: ${summary.recorded_by_principal_id}`] : []),
    ...(summary.recorded_at ? [`Recorded At: ${summary.recorded_at}`] : []),
  ];
  if (summary.proposal_id) {
    lines.push(`Proposal Review: pnpm --filter @narada2/cloudflare-carrier product:site-file-change:proposal:review:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --focus-ref ${summary.proposal_id} --operator-session-file <operator-session-file>`);
  }
  if (summary.site_id && summary.task_id) {
    lines.push(`Task Review: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:review:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id} --task-id ${summary.task_id} --operator-session-file <operator-session-file>`);
  }
  if (summary.operation_id) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file>`);
    lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`);
  }
  return `${lines.join('\n')}\n`;
}

function parseProposalFiles(args, env) {
  const filesJson = normalizeOptionalString(option(args, '--files-json') ?? env.CLOUDFLARE_SITE_FILE_CHANGE_PROPOSAL_FILES_JSON ?? null);
  if (filesJson) {
    let parsed;
    try {
      parsed = JSON.parse(filesJson);
    } catch {
      throw new Error('site_file_change_proposal_files_json_invalid');
    }
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('site_file_change_proposal_requires_files');
    return parsed.map((entry, index) => normalizeProposalFileEntry(entry, index));
  }

  const filePath = normalizeOptionalString(option(args, '--file-path') ?? option(args, '--file') ?? env.CLOUDFLARE_SITE_FILE_CHANGE_PROPOSAL_FILE_PATH ?? null);
  const changeKind = normalizeOptionalString(option(args, '--change-kind') ?? env.CLOUDFLARE_SITE_FILE_CHANGE_PROPOSAL_CHANGE_KIND ?? null);
  const materialSourceRef = normalizeOptionalString(option(args, '--material-source-ref') ?? env.CLOUDFLARE_SITE_FILE_CHANGE_PROPOSAL_MATERIAL_SOURCE_REF ?? null);

  if (!filePath) throw new Error('site_file_change_proposal_requires_--file-path_or_--files-json');
  if (!changeKind) throw new Error('site_file_change_proposal_requires_--change-kind_or_CLOUDFLARE_SITE_FILE_CHANGE_PROPOSAL_CHANGE_KIND');
  if (!materialSourceRef) throw new Error('site_file_change_proposal_requires_--material-source-ref_or_CLOUDFLARE_SITE_FILE_CHANGE_PROPOSAL_MATERIAL_SOURCE_REF');
  return [{ file_path: filePath, change_kind: changeKind, material_source_ref: materialSourceRef }];
}

function normalizeProposalFileEntry(entry, index) {
  const filePath = normalizeOptionalString(entry?.file_path ?? entry?.path ?? null);
  const changeKind = normalizeOptionalString(entry?.change_kind ?? entry?.kind ?? null);
  const materialSourceRef = normalizeOptionalString(entry?.material_source_ref ?? null);
  if (!filePath) throw new Error(`site_file_change_proposal_file_path_required:${index}`);
  if (!changeKind) throw new Error(`site_file_change_proposal_change_kind_required:${index}`);
  if (!materialSourceRef) throw new Error(`site_file_change_proposal_material_source_ref_required:${index}`);
  return { file_path: filePath, change_kind: changeKind, material_source_ref: materialSourceRef };
}

function redactSiteFileChangeProposalParams(params = {}) {
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
    const config = parseSiteFileChangeProposalArgs(process.argv.slice(2));
    const result = await recordCloudflareSiteFileChangeProposal(config);
    if (config.format === 'text') {
      process.stdout.write(formatSiteFileChangeProposalText(result));
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  } catch (error) {
    if (error?.response && error?.summary && error?.config?.format === 'text') {
      process.stderr.write(formatSiteFileChangeProposalText({
        status: 'refused',
        worker_url: error.config.workerUrl,
        auth_source: error.config.auth?.source,
        params: error.config.params,
        response: error.response,
        summary: error.summary,
      }));
    } else {
      process.stderr.write(JSON.stringify({ ok: false, code: error?.message ?? String(error), response: error?.response, summary: error?.summary }, null, 2) + '\n');
    }
    process.exit(1);
  }
}
