#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const LOCAL_INGRESS_REQUEST_AUTHORITY = 'cloudflare_local_ingress_request_queue';
const LOCAL_INGRESS_TARGET_AUTHORITY = 'local-windows-site-authority';
const LOCAL_INGRESS_EXECUTOR_AUTHORITY = 'windows_local_ingress_executor';
const LOCAL_INGRESS_REQUEST_POSTURE = 'cloudflare_queued_request_windows_must_admit_execute_and_return_evidence';

export function parseLocalIngressRequestArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const localIngressRequestId = normalizeOptionalString(option(args, '--local-ingress-request-id') ?? env.CLOUDFLARE_LOCAL_INGRESS_REQUEST_ID ?? null);
  const operationId = normalizeOptionalString(option(args, '--operation-id') ?? option(args, '--operation') ?? env.CLOUDFLARE_LOCAL_INGRESS_REQUEST_OPERATION_ID ?? null);
  const taskId = normalizeOptionalString(option(args, '--task-id') ?? env.CLOUDFLARE_LOCAL_INGRESS_REQUEST_TASK_ID ?? null);
  const generatedAt = normalizeOptionalString(option(args, '--generated-at') ?? env.CLOUDFLARE_LOCAL_INGRESS_REQUEST_GENERATED_AT ?? null) ?? new Date(now()).toISOString();
  const requestedActionRef = normalizeOptionalString(option(args, '--action-ref') ?? env.CLOUDFLARE_LOCAL_INGRESS_REQUEST_ACTION_REF ?? null);
  const requestedActionSummary = normalizeOptionalString(option(args, '--summary') ?? env.CLOUDFLARE_LOCAL_INGRESS_REQUEST_SUMMARY ?? null);
  const governedRequestContractRef = normalizeOptionalString(option(args, '--contract-ref') ?? env.CLOUDFLARE_LOCAL_INGRESS_REQUEST_CONTRACT_REF ?? null);
  const evidenceReturnContractRef = normalizeOptionalString(option(args, '--evidence-contract-ref') ?? env.CLOUDFLARE_LOCAL_INGRESS_REQUEST_EVIDENCE_CONTRACT_REF ?? null);
  const rollbackPlanRef = normalizeOptionalString(option(args, '--rollback-ref') ?? env.CLOUDFLARE_LOCAL_INGRESS_REQUEST_ROLLBACK_REF ?? null);
  const requestId = option(args, '--request-id') ?? env.CLOUDFLARE_LOCAL_INGRESS_REQUEST_REQUEST_ID ?? `local_ingress_request_${localIngressRequestId ?? now()}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_LOCAL_INGRESS_REQUEST_FORMAT ?? 'json';
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('local_ingress_request_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('local_ingress_request_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!requestedActionRef) throw new Error('local_ingress_request_requires_--action-ref_or_CLOUDFLARE_LOCAL_INGRESS_REQUEST_ACTION_REF');
  if (!governedRequestContractRef) throw new Error('local_ingress_request_requires_--contract-ref_or_CLOUDFLARE_LOCAL_INGRESS_REQUEST_CONTRACT_REF');
  if (!evidenceReturnContractRef) throw new Error('local_ingress_request_requires_--evidence-contract-ref_or_CLOUDFLARE_LOCAL_INGRESS_REQUEST_EVIDENCE_CONTRACT_REF');
  if (!rollbackPlanRef) throw new Error('local_ingress_request_requires_--rollback-ref_or_CLOUDFLARE_LOCAL_INGRESS_REQUEST_ROLLBACK_REF');
  if (!['json', 'text'].includes(format)) throw new Error(`local_ingress_request_format_unsupported:${format}`);
  if (!auth) throw new Error('local_ingress_request_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    requestId,
    format,
    auth,
    params: {
      site_id: siteId,
      ...(localIngressRequestId ? { local_ingress_request_id: localIngressRequestId } : {}),
      source_payload: {
        generated_at: generatedAt,
        ...(operationId ? { operation_id: operationId } : {}),
        ...(taskId ? { task_id: taskId } : {}),
        requested_mutation_class: 'local_repository_filesystem_mutation',
        requested_action_ref: requestedActionRef,
        ...(requestedActionSummary ? { requested_action_summary: requestedActionSummary } : {}),
        governed_request_contract_ref: governedRequestContractRef,
        evidence_return_contract_ref: evidenceReturnContractRef,
        rollback_plan_ref: rollbackPlanRef,
        target_authority_locus: LOCAL_INGRESS_TARGET_AUTHORITY,
        local_executor_authority: LOCAL_INGRESS_EXECUTOR_AUTHORITY,
        local_execution_admission: 'pending_windows_admission',
        direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
        repository_publication_admission: 'not_admitted',
      },
    },
  };
}

export async function createCloudflareLocalIngressRequest(config, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/carrier', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
    },
    body: JSON.stringify({
      operation: 'local_ingress.request.create',
      request_id: config.requestId,
      params: config.params,
    }),
  });
  const text = await response.text();
  const body = parseJsonText(text);
  if (response.status < 200 || response.status >= 300) {
    const code = body?.code ?? body?.error ?? `http_${response.status}`;
    const error = new Error(`local_ingress_request_failed:${code}`);
    error.code = code;
    error.http_status = response.status;
    error.response = body;
    error.summary = summarizeLocalIngressRequest(body, config.params);
    error.config = config;
    throw error;
  }
  return {
    schema: 'narada.cloudflare_carrier.local_ingress_request.v1',
    status: 'ok',
    request_id: config.requestId,
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    params: redactLocalIngressRequestParams(config.params),
    response: body,
    summary: summarizeLocalIngressRequest(body, config.params),
  };
}

export function summarizeLocalIngressRequest(body = {}, params = {}) {
  const request = body?.request ?? {};
  const record = body?.record ?? {};
  const sourcePayload = params?.source_payload ?? {};
  return {
    ok: body.ok ?? null,
    code: body.code ?? null,
    status: body.status ?? null,
    site_id: body.site_id ?? record.site_id ?? params.site_id ?? null,
    local_ingress_request_id: record.local_ingress_request_id ?? params.local_ingress_request_id ?? null,
    generated_at: request.generated_at ?? record.generated_at ?? sourcePayload.generated_at ?? null,
    operation_id: request.operation_id ?? record.operation_id ?? sourcePayload.operation_id ?? null,
    task_id: request.task_id ?? record.task_id ?? sourcePayload.task_id ?? null,
    requested_mutation_class: request.requested_mutation_class ?? record.requested_mutation_class ?? sourcePayload.requested_mutation_class ?? null,
    requested_action_ref: request.requested_action_ref ?? record.requested_action_ref ?? sourcePayload.requested_action_ref ?? null,
    requested_action_summary: request.requested_action_summary ?? record.requested_action_summary ?? sourcePayload.requested_action_summary ?? null,
    local_ingress_request_authority: body.local_ingress_request_authority ?? record.authority_locus ?? request.authority_locus ?? LOCAL_INGRESS_REQUEST_AUTHORITY,
    target_authority_locus: body.target_authority_locus ?? record.target_authority_locus ?? request.target_authority_locus ?? sourcePayload.target_authority_locus ?? null,
    local_executor_authority: body.local_executor_authority ?? record.local_executor_authority ?? request.local_executor_authority ?? sourcePayload.local_executor_authority ?? null,
    local_execution_admission: body.local_execution_admission ?? record.local_execution_admission ?? request.local_execution_admission ?? sourcePayload.local_execution_admission ?? null,
    direct_cloudflare_filesystem_mutation_admission:
      body.direct_cloudflare_filesystem_mutation_admission ?? record.direct_cloudflare_filesystem_mutation_admission ?? request.direct_cloudflare_filesystem_mutation_admission ?? sourcePayload.direct_cloudflare_filesystem_mutation_admission ?? null,
    repository_publication_admission:
      body.repository_publication_admission ?? record.repository_publication_admission ?? request.repository_publication_admission ?? sourcePayload.repository_publication_admission ?? null,
    request_posture: record.request_posture ?? request.request_posture ?? sourcePayload.request_posture ?? LOCAL_INGRESS_REQUEST_POSTURE,
    governed_request_contract_ref:
      request.governed_request_contract_ref ?? record.governed_request_contract_ref ?? sourcePayload.governed_request_contract_ref ?? null,
    evidence_return_contract_ref:
      request.evidence_return_contract_ref ?? record.evidence_return_contract_ref ?? sourcePayload.evidence_return_contract_ref ?? null,
    rollback_plan_ref: request.rollback_plan_ref ?? record.rollback_plan_ref ?? sourcePayload.rollback_plan_ref ?? null,
    recorded_by_principal_id: record.recorded_by_principal_id ?? null,
    recorded_at: record.recorded_at ?? null,
  };
}

export function formatLocalIngressRequestText(result) {
  const summary = result?.summary ?? summarizeLocalIngressRequest(result?.response ?? {}, result?.params ?? {});
  const ok = summary.ok === false || result?.status === 'refused' ? false : true;
  const lines = [
    `Local Ingress Request: ${ok === false ? 'refused' : 'ok'}`,
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? result?.params?.site_id ?? 'unknown'}`,
    ...(summary.code ? [`Code: ${summary.code}`] : []),
    ...(summary.status ? [`Status: ${summary.status}`] : []),
    ...(summary.local_ingress_request_id ? [`Request Id: ${summary.local_ingress_request_id}`] : []),
    ...(summary.operation_id ? [`Operation: ${summary.operation_id}`] : []),
    ...(summary.task_id ? [`Task: ${summary.task_id}`] : []),
    `Action: ${summary.requested_action_ref ?? 'unknown'}${summary.requested_action_summary ? ` summary=${summary.requested_action_summary}` : ''}`,
    `Authority: request=${summary.local_ingress_request_authority ?? 'unknown'} target=${summary.target_authority_locus ?? 'unknown'} executor=${summary.local_executor_authority ?? 'unknown'}`,
    ...(summary.requested_mutation_class ? [`Mutation Class: ${summary.requested_mutation_class}`] : []),
    ...(summary.local_execution_admission ? [`Local Execution Admission: ${summary.local_execution_admission}`] : []),
    ...(summary.direct_cloudflare_filesystem_mutation_admission ? [`Direct Cloudflare Filesystem Mutation: ${summary.direct_cloudflare_filesystem_mutation_admission}`] : []),
    ...(summary.repository_publication_admission ? [`Repository Publication: ${summary.repository_publication_admission}`] : []),
    ...(summary.request_posture ? [`Posture: ${summary.request_posture}`] : []),
    ...(summary.governed_request_contract_ref ? [`Contract: ${summary.governed_request_contract_ref}`] : []),
    ...(summary.evidence_return_contract_ref ? [`Evidence Contract: ${summary.evidence_return_contract_ref}`] : []),
    ...(summary.rollback_plan_ref ? [`Rollback: ${summary.rollback_plan_ref}`] : []),
    ...(summary.recorded_by_principal_id ? [`Recorded By: ${summary.recorded_by_principal_id}`] : []),
    ...(summary.recorded_at ? [`Recorded At: ${summary.recorded_at}`] : []),
  ];
  if (summary.site_id && summary.operation_id) {
    lines.push(
      `Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file>`,
    );
    lines.push(
      `Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`,
    );
  }
  if (summary.site_id && summary.task_id) {
    lines.push(
      `Task Review: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:review:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id} --task-id ${summary.task_id} --operator-session-file <operator-session-file>`,
    );
  }
  return lines.join('\n') + '\n';
}

function redactLocalIngressRequestParams(params = {}) {
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
    const config = parseLocalIngressRequestArgs(process.argv.slice(2));
    const result = await createCloudflareLocalIngressRequest(config);
    if (config.format === 'text') {
      process.stdout.write(formatLocalIngressRequestText(result));
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  } catch (error) {
    if (error?.response && error?.summary && error?.config?.format === 'text') {
      process.stderr.write(
        formatLocalIngressRequestText({
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
