#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const VALID_OPERATIONS = new Set([
  'repository_publication.request.list',
  'repository_publication.request.next',
  'repository_publication.admission.list',
  'repository_publication.evidence.list',
  'repository_publication.cloudflare_execution.list',
]);

const FILTERABLE_OPERATIONS = new Set([
  'repository_publication.admission.list',
  'repository_publication.evidence.list',
  'repository_publication.cloudflare_execution.list',
]);

const LIMIT_PARAM_BY_OPERATION = {
  'repository_publication.request.list': 'repository_publication_request_limit',
  'repository_publication.request.next': 'repository_publication_request_limit',
  'repository_publication.admission.list': 'repository_publication_admission_limit',
  'repository_publication.evidence.list': 'repository_publication_evidence_limit',
  'repository_publication.cloudflare_execution.list': 'repository_publication_execution_limit',
};

export function parseRepositoryPublicationReadArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const operation = option(args, '--operation') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_READ_OPERATION ?? 'repository_publication.request.list';
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const repositoryPublicationRequestId = normalizeOptionalString(
    option(args, '--repository-publication-request-id')
    ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_READ_REQUEST_ID
    ?? null,
  );
  const limit = parseOptionalInteger(
    option(args, '--limit') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_READ_LIMIT ?? null,
    'limit',
  );
  const requestId = option(args, '--request-id')
    ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_READ_ENVELOPE_REQUEST_ID
    ?? `repository_publication_read_${safeToken(operation)}_${repositoryPublicationRequestId ?? siteId ?? now()}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_READ_FORMAT ?? 'json';
  const auth = resolveAuth(args, env);

  if (!VALID_OPERATIONS.has(operation)) throw new Error(`repository_publication_read_operation_unsupported:${operation}`);
  if (!workerUrl) throw new Error('repository_publication_read_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('repository_publication_read_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!['json', 'text'].includes(format)) throw new Error(`repository_publication_read_format_unsupported:${format}`);
  if (!auth) throw new Error('repository_publication_read_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    operation,
    requestId,
    format,
    auth,
    params: buildRepositoryPublicationReadParams({ operation, siteId, repositoryPublicationRequestId, limit }),
  };
}

export function buildRepositoryPublicationReadParams({ operation, siteId, repositoryPublicationRequestId, limit }) {
  const params = { site_id: siteId };
  const limitKey = LIMIT_PARAM_BY_OPERATION[operation];
  if (Number.isInteger(limit)) {
    params.limit = limit;
    if (limitKey) params[limitKey] = limit;
  }
  if (repositoryPublicationRequestId && FILTERABLE_OPERATIONS.has(operation)) {
    params.repository_publication_request_id = repositoryPublicationRequestId;
  }
  return params;
}

export async function readRepositoryPublicationSurface(config, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/carrier', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
    },
    body: JSON.stringify({
      operation: config.operation,
      request_id: config.requestId,
      params: config.params,
    }),
  });
  const text = await response.text();
  const body = parseJsonText(text);
  if (response.status < 200 || response.status >= 300) {
    const code = body?.code ?? body?.error ?? `http_${response.status}`;
    const error = new Error(`repository_publication_read_failed:${code}`);
    error.code = code;
    error.http_status = response.status;
    error.response = body;
    error.summary = summarizeRepositoryPublicationSurface(config.operation, body, config.params);
    error.config = config;
    throw error;
  }
  return {
    schema: 'narada.cloudflare_carrier.repository_publication_read.v1',
    status: 'ok',
    operation: config.operation,
    request_id: config.requestId,
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    params: { ...config.params },
    response: body,
    summary: summarizeRepositoryPublicationSurface(config.operation, body, config.params),
  };
}

export function summarizeRepositoryPublicationSurface(operation, body = {}, params = {}) {
  if (operation === 'repository_publication.request.list') {
    const requests = Array.isArray(body?.requests) ? body.requests : [];
    const latest = requests[0] ?? null;
    return {
      operation,
      ok: body.ok ?? null,
      code: body.code ?? null,
      status: body.status ?? null,
      site_id: body.site_id ?? params.site_id ?? null,
      request_count: requests.length,
      latest_repository_publication_request_id: latest?.repository_publication_request_id ?? null,
      latest_operation_id: latest?.operation_id ?? null,
      latest_task_id: latest?.task_id ?? null,
      latest_publication_ref: latest?.publication_ref ?? null,
      latest_repository_ref: latest?.repository_ref ?? null,
      latest_branch_ref: latest?.branch_ref ?? null,
      latest_source_change_ref: latest?.source_change_ref ?? null,
      repository_publication_request_authority: body.repository_publication_request_authority ?? null,
      repository_publication_executor_authority: body.repository_publication_executor_authority ?? null,
      repository_publication_admission: body.repository_publication_admission ?? null,
      cloudflare_git_push_admission: body.cloudflare_git_push_admission ?? null,
      direct_cloudflare_repository_mutation_admission: body.direct_cloudflare_repository_mutation_admission ?? null,
      authority_partition: body.authority_partition ?? null,
    };
  }
  if (operation === 'repository_publication.request.next') {
    const request = body?.request ?? null;
    const admission = body?.admission ?? null;
    return {
      operation,
      ok: body.ok ?? null,
      code: body.code ?? null,
      status: body.status ?? null,
      site_id: body.site_id ?? params.site_id ?? null,
      repository_publication_request_id: request?.repository_publication_request_id ?? null,
      repository_publication_admission_id: admission?.repository_publication_admission_id ?? null,
      admission_action: admission?.admission_action ?? null,
      pending_unadmitted_count: body.pending_unadmitted_count ?? 0,
      publication_ref: request?.publication_ref ?? null,
      repository_ref: request?.repository_ref ?? null,
      branch_ref: request?.branch_ref ?? null,
      source_change_ref: request?.source_change_ref ?? null,
      repository_publication_request_authority: body.repository_publication_request_authority ?? null,
      repository_publication_dispatch_authority: body.repository_publication_dispatch_authority ?? null,
      repository_publication_executor_authority: body.repository_publication_executor_authority ?? null,
      repository_publication_admission_authority: body.repository_publication_admission_authority ?? null,
      repository_publication_admission: body.repository_publication_admission ?? null,
      cloudflare_git_push_admission: body.cloudflare_git_push_admission ?? null,
      direct_cloudflare_repository_mutation_admission: body.direct_cloudflare_repository_mutation_admission ?? null,
      authority_partition: body.authority_partition ?? null,
    };
  }
  if (operation === 'repository_publication.admission.list') {
    const admissions = Array.isArray(body?.admissions) ? body.admissions : [];
    const latest = admissions[0] ?? null;
    return {
      operation,
      ok: body.ok ?? null,
      code: body.code ?? null,
      status: body.status ?? null,
      site_id: body.site_id ?? params.site_id ?? null,
      repository_publication_request_id: params.repository_publication_request_id ?? latest?.repository_publication_request_id ?? null,
      admission_count: admissions.length,
      latest_repository_publication_admission_id: latest?.repository_publication_admission_id ?? null,
      latest_repository_publication_request_id: latest?.repository_publication_request_id ?? null,
      latest_admission_action: latest?.admission_action ?? null,
      latest_admission_reason: latest?.admission_reason ?? null,
      repository_publication_admission_authority: body.repository_publication_admission_authority ?? null,
      repository_publication_executor_authority: body.repository_publication_executor_authority ?? null,
      repository_publication_admission: body.repository_publication_admission ?? latest?.repository_publication_admission ?? null,
      cloudflare_git_push_admission: body.cloudflare_git_push_admission ?? null,
      direct_cloudflare_repository_mutation_admission: body.direct_cloudflare_repository_mutation_admission ?? null,
      authority_partition: body.authority_partition ?? null,
    };
  }
  if (operation === 'repository_publication.evidence.list') {
    const evidence = Array.isArray(body?.evidence) ? body.evidence : [];
    const latest = evidence[0] ?? null;
    return {
      operation,
      ok: body.ok ?? null,
      code: body.code ?? null,
      status: body.status ?? null,
      site_id: body.site_id ?? params.site_id ?? null,
      repository_publication_request_id: params.repository_publication_request_id ?? latest?.repository_publication_request_id ?? null,
      evidence_count: evidence.length,
      latest_repository_publication_evidence_id: latest?.repository_publication_evidence_id ?? null,
      latest_repository_publication_request_id: latest?.repository_publication_request_id ?? null,
      latest_publication_execution_id: latest?.publication_execution_id ?? null,
      latest_publication_status: latest?.publication_status ?? null,
      latest_published_commit_ref: latest?.published_commit_ref ?? null,
      repository_publication_evidence_authority: body.repository_publication_evidence_authority ?? null,
      repository_publication_admission_authority: body.repository_publication_admission_authority ?? null,
      cloudflare_evidence_store_authority: body.cloudflare_evidence_store_authority ?? null,
      repository_publication_admission: body.repository_publication_admission ?? null,
      cloudflare_git_push_admission: body.cloudflare_git_push_admission ?? null,
      direct_cloudflare_repository_mutation_admission: body.direct_cloudflare_repository_mutation_admission ?? null,
      authority_partition: body.authority_partition ?? null,
    };
  }
  if (operation === 'repository_publication.cloudflare_execution.list') {
    const executions = Array.isArray(body?.executions) ? body.executions : [];
    const latest = executions[0] ?? null;
    return {
      operation,
      ok: body.ok ?? null,
      code: body.code ?? null,
      status: body.status ?? null,
      site_id: body.site_id ?? params.site_id ?? null,
      repository_publication_request_id: params.repository_publication_request_id ?? latest?.repository_publication_request_id ?? null,
      execution_count: executions.length,
      latest_repository_publication_execution_id: latest?.repository_publication_execution_id ?? null,
      latest_repository_publication_request_id: latest?.repository_publication_request_id ?? null,
      latest_publication_status: latest?.publication_status ?? null,
      latest_repository_ref: latest?.repository_ref ?? null,
      latest_branch_ref: latest?.branch_ref ?? null,
      latest_published_commit_ref: latest?.published_commit_ref ?? null,
      latest_github_http_status: latest?.github_http_status ?? null,
      repository_publication_executor_authority: body.repository_publication_executor_authority ?? null,
      repository_publication_admission_authority: body.repository_publication_admission_authority ?? null,
      repository_publication_admission: body.repository_publication_admission ?? latest?.repository_publication_admission ?? null,
      cloudflare_git_push_admission: body.cloudflare_git_push_admission ?? null,
      direct_cloudflare_repository_mutation_admission: body.direct_cloudflare_repository_mutation_admission ?? null,
      authority_partition: body.authority_partition ?? null,
    };
  }
  return { operation, ok: body.ok ?? null, code: body.code ?? null, status: body.status ?? null, site_id: body.site_id ?? params.site_id ?? null };
}

export function formatRepositoryPublicationReadText(result) {
  const summary = result?.summary ?? summarizeRepositoryPublicationSurface(result?.operation, result?.response ?? {}, result?.params ?? {});
  const refused = result?.status === 'refused' || summary?.ok === false;
  const lines = [
    `Repository Publication Read: ${labelForOperation(summary.operation ?? result?.operation ?? 'unknown')}${refused ? ' refused' : ''}`,
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? result?.params?.site_id ?? 'unknown'}`,
  ];
  if (summary.code) lines.push(`Code: ${summary.code}`);
  if (summary.status) lines.push(`Status: ${summary.status}`);

  if (refused) {
    if (summary.repository_publication_request_id) lines.push(`Request: ${summary.repository_publication_request_id}`);
    if (summary.latest_repository_publication_request_id) lines.push(`Latest Request: ${summary.latest_repository_publication_request_id}`);
    return `${lines.join('\n')}\n`;
  }

  if (summary.operation === 'repository_publication.request.list') {
    lines.push(`Requests: count=${summary.request_count ?? 0}`);
    if (summary.latest_repository_publication_request_id) lines.push(`Latest Request: ${summary.latest_repository_publication_request_id}`);
    if (summary.latest_publication_ref) lines.push(`Publication: ${summary.latest_publication_ref}`);
    if (summary.latest_repository_ref) lines.push(`Repository: ${summary.latest_repository_ref}`);
    if (summary.latest_branch_ref) lines.push(`Branch: ${summary.latest_branch_ref}`);
    if (summary.latest_source_change_ref) lines.push(`Source Change: ${summary.latest_source_change_ref}`);
    lines.push(`Authority: request=${summary.repository_publication_request_authority ?? 'unknown'} executor=${summary.repository_publication_executor_authority ?? 'unknown'}`);
  } else if (summary.operation === 'repository_publication.request.next') {
    if (summary.repository_publication_request_id) lines.push(`Request: ${summary.repository_publication_request_id}`);
    if (summary.repository_publication_admission_id || summary.admission_action) {
      lines.push(`Admission: ${summary.repository_publication_admission_id ?? 'none'}${summary.admission_action ? ` action=${summary.admission_action}` : ''}`);
    }
    lines.push(`Pending Unadmitted: ${summary.pending_unadmitted_count ?? 0}`);
    if (summary.publication_ref) lines.push(`Publication: ${summary.publication_ref}`);
    if (summary.repository_ref) lines.push(`Repository: ${summary.repository_ref}`);
    if (summary.branch_ref) lines.push(`Branch: ${summary.branch_ref}`);
    if (summary.source_change_ref) lines.push(`Source Change: ${summary.source_change_ref}`);
    lines.push(`Authority: request=${summary.repository_publication_request_authority ?? 'unknown'} dispatch=${summary.repository_publication_dispatch_authority ?? 'unknown'} executor=${summary.repository_publication_executor_authority ?? 'unknown'} admission=${summary.repository_publication_admission_authority ?? 'unknown'}`);
  } else if (summary.operation === 'repository_publication.admission.list') {
    lines.push(`Admissions: count=${summary.admission_count ?? 0}`);
    if (summary.repository_publication_request_id) lines.push(`Filter Request: ${summary.repository_publication_request_id}`);
    if (summary.latest_repository_publication_admission_id) lines.push(`Latest Admission: ${summary.latest_repository_publication_admission_id}`);
    if (summary.latest_repository_publication_request_id) lines.push(`Latest Request: ${summary.latest_repository_publication_request_id}`);
    if (summary.latest_admission_action) {
      lines.push(`Latest Decision: ${summary.latest_admission_action}${summary.latest_admission_reason ? ` reason=${summary.latest_admission_reason}` : ''}`);
    }
    lines.push(`Authority: admission=${summary.repository_publication_admission_authority ?? 'unknown'} executor=${summary.repository_publication_executor_authority ?? 'unknown'}`);
  } else if (summary.operation === 'repository_publication.evidence.list') {
    lines.push(`Evidence: count=${summary.evidence_count ?? 0}`);
    if (summary.repository_publication_request_id) lines.push(`Filter Request: ${summary.repository_publication_request_id}`);
    if (summary.latest_repository_publication_evidence_id) lines.push(`Latest Evidence: ${summary.latest_repository_publication_evidence_id}`);
    if (summary.latest_publication_execution_id) lines.push(`Latest Execution: ${summary.latest_publication_execution_id}`);
    if (summary.latest_publication_status) lines.push(`Latest Publication Status: ${summary.latest_publication_status}`);
    if (summary.latest_published_commit_ref) lines.push(`Latest Published Commit: ${summary.latest_published_commit_ref}`);
    lines.push(`Authority: evidence=${summary.repository_publication_evidence_authority ?? 'unknown'} admission=${summary.repository_publication_admission_authority ?? 'unknown'} store=${summary.cloudflare_evidence_store_authority ?? 'unknown'}`);
  } else if (summary.operation === 'repository_publication.cloudflare_execution.list') {
    lines.push(`Cloudflare Executions: count=${summary.execution_count ?? 0}`);
    if (summary.repository_publication_request_id) lines.push(`Filter Request: ${summary.repository_publication_request_id}`);
    if (summary.latest_repository_publication_execution_id) lines.push(`Latest Execution: ${summary.latest_repository_publication_execution_id}`);
    if (summary.latest_publication_status) lines.push(`Latest Publication Status: ${summary.latest_publication_status}`);
    if (summary.latest_repository_ref) lines.push(`Latest Repository: ${summary.latest_repository_ref}`);
    if (summary.latest_branch_ref) lines.push(`Latest Branch: ${summary.latest_branch_ref}`);
    if (summary.latest_published_commit_ref) lines.push(`Latest Published Commit: ${summary.latest_published_commit_ref}`);
    if (summary.latest_github_http_status != null) lines.push(`Latest GitHub HTTP Status: ${summary.latest_github_http_status}`);
    lines.push(`Authority: executor=${summary.repository_publication_executor_authority ?? 'unknown'} admission=${summary.repository_publication_admission_authority ?? 'unknown'}`);
  }

  if (summary.repository_publication_admission) lines.push(`Repository Publication Admission: ${summary.repository_publication_admission}`);
  if (summary.cloudflare_git_push_admission) lines.push(`Cloudflare Git Push Admission: ${summary.cloudflare_git_push_admission}`);
  if (summary.direct_cloudflare_repository_mutation_admission) {
    lines.push(`Direct Cloudflare Repository Mutation: ${summary.direct_cloudflare_repository_mutation_admission}`);
  }
  if (summary.authority_partition) lines.push(`Authority Partition: ${summary.authority_partition}`);
  return `${lines.join('\n')}\n`;
}

function labelForOperation(operation) {
  switch (operation) {
    case 'repository_publication.request.list':
      return 'Request List';
    case 'repository_publication.request.next':
      return 'Request Next';
    case 'repository_publication.admission.list':
      return 'Admission List';
    case 'repository_publication.evidence.list':
      return 'Evidence List';
    case 'repository_publication.cloudflare_execution.list':
      return 'Cloudflare Execution List';
    default:
      return operation;
  }
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

function parseOptionalInteger(value, fieldName) {
  if (value == null || String(value).trim() === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`repository_publication_read_${fieldName}_invalid:${value}`);
  return parsed;
}

function safeToken(value) {
  return String(value).replace(/[^a-z0-9]+/gi, '_');
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
    const config = parseRepositoryPublicationReadArgs(process.argv.slice(2));
    const result = await readRepositoryPublicationSurface(config);
    if (config.format === 'text') {
      process.stdout.write(formatRepositoryPublicationReadText(result));
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  } catch (error) {
    if (error?.response && error?.summary && error?.config?.format === 'text') {
      process.stderr.write(
        formatRepositoryPublicationReadText({
          status: 'refused',
          operation: error.config.operation,
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
