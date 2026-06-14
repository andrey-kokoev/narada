#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authHeaders, readProductSurface, resolveAuth } from './cloudflare-carrier-product-read.mjs';
import { readRepositoryPublicationSurface } from './cloudflare-carrier-repository-publication-read.mjs';

const VALID_LANES = new Set(['cloudflare', 'windows']);

export function parseRepositoryPublicationReadbackLiveSmokeArgs(argv = [], env = process.env, options = {}) {
  const args = [...argv];
  const scriptPath = fileURLToPath(import.meta.url);
  const repoRoot = resolve(dirname(scriptPath), '../../..');
  if (options.loadLocalEnv !== false) {
    loadLocalEnv(join(repoRoot, '.env'), env);
  }

  const workerUrl = trimTrailingSlash(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const format = option(args, '--format') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_READBACK_LIVE_FORMAT ?? 'json';
  const siteId = normalizeOptionalString(option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null);
  const repositoryPublicationRequestId = normalizeOptionalString(
    option(args, '--repository-publication-request-id')
    ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_READBACK_REQUEST_ID
    ?? null,
  );
  const repositoryPublicationAdmissionId = normalizeOptionalString(
    option(args, '--repository-publication-admission-id')
    ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_READBACK_ADMISSION_ID
    ?? null,
  );
  const repositoryPublicationExecutionId = normalizeOptionalString(
    option(args, '--repository-publication-execution-id')
    ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_READBACK_EXECUTION_ID
    ?? null,
  );
  const repositoryPublicationEvidenceId = normalizeOptionalString(
    option(args, '--repository-publication-evidence-id')
    ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_READBACK_EVIDENCE_ID
    ?? null,
  );
  const operationId = normalizeOptionalString(option(args, '--operation-id') ?? option(args, '--operation') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_READBACK_OPERATION_ID ?? null);
  const lane = normalizeOptionalString(option(args, '--lane') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_READBACK_LANE ?? 'cloudflare');
  const limit = parsePositiveInteger(option(args, '--limit') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_READBACK_LIMIT ?? '50', 'limit');
  const auth = resolveAuth(args, env) ?? resolveBearerFromEnv(env, repoRoot);

  if (!workerUrl) throw new Error('repository_publication_readback_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`repository_publication_readback_live_smoke_unknown_format:${format}`);
  if (!siteId) throw new Error('repository_publication_readback_live_smoke_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!repositoryPublicationRequestId) throw new Error('repository_publication_readback_live_smoke_requires_--repository-publication-request-id_or_CLOUDFLARE_REPOSITORY_PUBLICATION_READBACK_REQUEST_ID');
  if (!VALID_LANES.has(lane)) throw new Error(`repository_publication_readback_live_smoke_lane_unsupported:${lane}`);
  if (!auth) throw new Error('repository_publication_readback_live_smoke_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    format,
    siteId,
    repositoryPublicationRequestId,
    repositoryPublicationAdmissionId,
    repositoryPublicationExecutionId,
    repositoryPublicationEvidenceId,
    operationId,
    lane,
    limit,
    auth,
  };
}

export function formatRepositoryPublicationReadbackLiveSmokeText(result) {
  const lines = [
    `Repository Publication Readback Smoke: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Lane: ${result.lane}`,
    `Request: ${result.repository_publication_request_id}`,
    `Admission: ${result.repository_publication_admission_id ?? 'none'}`,
    `Execution: ${result.repository_publication_execution_id ?? 'none'}`,
    `Evidence: ${result.repository_publication_evidence_id ?? 'none'}`,
    `Counts: requests=${result.request_list_count ?? 0} admissions=${result.admission_count ?? 0} executions=${result.execution_count ?? 0} evidence=${result.evidence_count ?? 0}`,
    `Request Review: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:request:review:text -- --url ${result.worker_url} --site ${result.site_id} --repository-publication-request-id ${result.repository_publication_request_id} --operator-session-file <operator-session-file>`,
    `Admission Read: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:admission:list:text -- --url ${result.worker_url} --site ${result.site_id} --repository-publication-admission-id ${result.repository_publication_admission_id ?? '<repository-publication-admission-id>'} --operator-session-file <operator-session-file>`,
  ];
  if (result.repository_publication_execution_id) {
    lines.push(`Execution Read: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:cloudflare-execution:list:text -- --url ${result.worker_url} --site ${result.site_id} --repository-publication-execution-id ${result.repository_publication_execution_id} --operator-session-file <operator-session-file>`);
  }
  if (result.repository_publication_evidence_id) {
    lines.push(`Evidence Read: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:evidence:list:text -- --url ${result.worker_url} --site ${result.site_id} --repository-publication-evidence-id ${result.repository_publication_evidence_id} --operator-session-file <operator-session-file>`);
  }
  if (result.operation_read_summary?.operation_id) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_read_summary.operation_id} --operator-session-file <operator-session-file>`);
  }
  return `${lines.join('\n')}\n`;
}

export async function runRepositoryPublicationReadbackLiveSmoke(config, fetchImpl = fetch) {
  const readPublication = (operation, extraParams = {}) => readRepositoryPublicationSurface({
    workerUrl: config.workerUrl,
    operation,
    requestId: `repository_publication_readback_${safeToken(operation)}_${config.repositoryPublicationRequestId}`,
    auth: config.auth,
    params: {
      site_id: config.siteId,
      repository_publication_request_id: config.repositoryPublicationRequestId,
      limit: config.limit,
      repository_publication_request_limit: config.limit,
      repository_publication_admission_limit: config.limit,
      repository_publication_evidence_limit: config.limit,
      repository_publication_execution_limit: config.limit,
      ...extraParams,
    },
  }, fetchImpl);

  const requestList = await readPublication('repository_publication.request.list', {
    site_id: config.siteId,
    limit: config.limit,
    repository_publication_request_limit: config.limit,
  });
  const admissionList = await readPublication('repository_publication.admission.list');
  const evidenceList = await readPublication('repository_publication.evidence.list');
  const executionList = await readPublication('repository_publication.cloudflare_execution.list');
  const requestNext = await readRepositoryPublicationSurface({
    workerUrl: config.workerUrl,
    operation: 'repository_publication.request.next',
    requestId: `repository_publication_readback_request_next_${config.repositoryPublicationRequestId}`,
    auth: config.auth,
    params: {
      site_id: config.siteId,
      limit: config.limit,
      repository_publication_request_limit: config.limit,
    },
  }, fetchImpl);

  const requestRecord = (Array.isArray(requestList.response?.requests) ? requestList.response.requests : [])
    .find((entry) => entry?.repository_publication_request_id === config.repositoryPublicationRequestId);
  assert.ok(requestRecord, JSON.stringify(requestList.response));

  const admissions = Array.isArray(admissionList.response?.admissions) ? admissionList.response.admissions : [];
  const admissionRecord = admissions.find((entry) => entry?.repository_publication_request_id === config.repositoryPublicationRequestId);
  assert.ok(admissionRecord, JSON.stringify(admissionList.response));
  if (config.repositoryPublicationAdmissionId) {
    assert.equal(admissionRecord.repository_publication_admission_id, config.repositoryPublicationAdmissionId);
  }

  const evidenceRecords = Array.isArray(evidenceList.response?.evidence) ? evidenceList.response.evidence : [];
  const executionRecords = Array.isArray(executionList.response?.executions) ? executionList.response.executions : [];
  const evidenceRecord = config.repositoryPublicationEvidenceId
    ? evidenceRecords.find((entry) => entry?.repository_publication_evidence_id === config.repositoryPublicationEvidenceId)
    : evidenceRecords[0] ?? null;
  const executionRecord = config.repositoryPublicationExecutionId
    ? executionRecords.find((entry) => entry?.repository_publication_execution_id === config.repositoryPublicationExecutionId)
    : executionRecords[0] ?? null;

  let operationRead = null;
  if (config.operationId) {
    operationRead = await readProductSurface({
      workerUrl: config.workerUrl,
      operation: 'operation.read',
      requestId: `repository_publication_readback_operation_${config.operationId}`,
      params: { site_id: config.siteId, operation_id: config.operationId, limit: config.limit },
      format: 'json',
      continuation: false,
      auth: config.auth,
    }, fetchImpl);
  }

  assert.notEqual(requestNext.summary?.repository_publication_request_id, config.repositoryPublicationRequestId, JSON.stringify(requestNext.response));

  if (config.lane === 'cloudflare') {
    assert.ok(executionRecord, JSON.stringify(executionList.response));
    if (config.repositoryPublicationExecutionId) {
      assert.equal(executionRecord.repository_publication_execution_id, config.repositoryPublicationExecutionId);
    }
    assert.equal(executionList.summary.repository_publication_executor_authority, 'cloudflare_github_repository_publication_executor');
    assert.equal(executionList.summary.repository_publication_admission_authority, 'cloudflare_repository_publication_admission_controller');
    assert.equal(executionList.summary.direct_cloudflare_repository_mutation_admission, 'admitted_by_cloudflare_github_repository_publication');
    assert.equal(executionRecord.repository_publication_request_id, config.repositoryPublicationRequestId);
  }

  if (config.lane === 'windows') {
    assert.ok(evidenceRecord, JSON.stringify(evidenceList.response));
    if (config.repositoryPublicationEvidenceId) {
      assert.equal(evidenceRecord.repository_publication_evidence_id, config.repositoryPublicationEvidenceId);
    }
    assert.equal(evidenceList.summary.repository_publication_evidence_authority, 'windows_repository_publication_executor');
    assert.equal(evidenceList.summary.repository_publication_admission_authority, 'cloudflare_repository_publication_admission_controller');
    assert.equal(evidenceList.summary.direct_cloudflare_repository_mutation_admission, 'not_admitted');
    assert.equal(evidenceRecord.repository_publication_request_id, config.repositoryPublicationRequestId);
  }

  if (operationRead) {
    const executions = Array.isArray(operationRead.response?.repository_publication_executions) ? operationRead.response.repository_publication_executions : [];
    const evidence = Array.isArray(operationRead.response?.repository_publication_evidence) ? operationRead.response.repository_publication_evidence : [];
    if (config.lane === 'cloudflare') {
      const opExecution = config.repositoryPublicationExecutionId
        ? executions.find((entry) => entry?.repository_publication_execution_id === config.repositoryPublicationExecutionId)
        : executions.find((entry) => entry?.repository_publication_request_id === config.repositoryPublicationRequestId);
      assert.ok(opExecution, JSON.stringify(operationRead.response));
    }
    if (config.lane === 'windows') {
      const opEvidence = config.repositoryPublicationEvidenceId
        ? evidence.find((entry) => entry?.repository_publication_evidence_id === config.repositoryPublicationEvidenceId)
        : evidence.find((entry) => entry?.repository_publication_request_id === config.repositoryPublicationRequestId);
      assert.ok(opEvidence, JSON.stringify(operationRead.response));
    }
  }

  return {
    schema: 'narada.cloudflare_carrier.repository_publication_readback_live_smoke.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    lane: config.lane,
    repository_publication_request_id: config.repositoryPublicationRequestId,
    repository_publication_admission_id: admissionRecord?.repository_publication_admission_id ?? null,
    repository_publication_execution_id: executionRecord?.repository_publication_execution_id ?? null,
    repository_publication_evidence_id: evidenceRecord?.repository_publication_evidence_id ?? null,
    request_list_count: requestList.summary?.request_count ?? 0,
    admission_count: admissionList.summary?.admission_count ?? 0,
    evidence_count: evidenceList.summary?.evidence_count ?? 0,
    execution_count: executionList.summary?.execution_count ?? 0,
    request_list_summary: requestList.summary,
    admission_list_summary: admissionList.summary,
    evidence_list_summary: evidenceList.summary,
    execution_list_summary: executionList.summary,
    request_next_summary: requestNext.summary,
    operation_read_summary: operationRead?.summary ?? null,
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

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/, '');
}

function parsePositiveInteger(value, fieldName) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`repository_publication_readback_live_smoke_${fieldName}_invalid:${value}`);
  return parsed;
}

function safeToken(value) {
  return String(value).replace(/[^a-z0-9]+/gi, '_');
}

function resolveBearerFromEnv(env, repoRoot) {
  const tokenFile = normalizeOptionalString(env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? null);
  const bearerToken = normalizeOptionalString(env.CLOUDFLARE_CARRIER_TOKEN ?? null);
  if (bearerToken) return { kind: 'bearer', value: bearerToken, source: 'env:CLOUDFLARE_CARRIER_TOKEN' };
  if (!tokenFile) return null;
  const resolved = isAbsolute(tokenFile) ? tokenFile : join(repoRoot, tokenFile);
  if (!existsSync(resolved)) throw new Error(`repository_publication_readback_live_smoke_token_file_missing:${resolved}`);
  return { kind: 'bearer', value: readFileSync(resolved, 'utf8').trim(), source: 'env:CLOUDFLARE_CARRIER_TOKEN_FILE' };
}

function loadLocalEnv(envPath, targetEnv = process.env) {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^[\"']|[\"']$/g, '');
    if (!targetEnv[key]) targetEnv[key] = value;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseRepositoryPublicationReadbackLiveSmokeArgs(process.argv.slice(2));
    const result = await runRepositoryPublicationReadbackLiveSmoke(config);
    if (config.format === 'text') {
      process.stdout.write(formatRepositoryPublicationReadbackLiveSmokeText(result));
    } else {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
  } catch (error) {
    process.stderr.write(JSON.stringify({ ok: false, code: error?.message ?? String(error), response: error?.response, summary: error?.summary }, null, 2) + '\n');
    process.exit(1);
  }
}
