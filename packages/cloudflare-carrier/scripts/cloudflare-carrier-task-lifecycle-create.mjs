#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

export function parseTaskLifecycleCreateArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const carrierSessionId = normalizeOptionalString(option(args, '--carrier-session-id') ?? option(args, '--session-id') ?? env.CLOUDFLARE_CARRIER_SESSION_ID ?? null);
  const title = option(args, '--title') ?? env.CLOUDFLARE_TASK_LIFECYCLE_CREATE_TITLE ?? null;
  const description = normalizeOptionalString(option(args, '--description') ?? env.CLOUDFLARE_TASK_LIFECYCLE_CREATE_DESCRIPTION ?? null);
  const admissionId = option(args, '--admission-id') ?? env.CLOUDFLARE_TASK_LIFECYCLE_CREATE_ADMISSION_ID ?? `task_lifecycle_create_${now()}`;
  const admitCloudflareTaskCreate = booleanFlag(args, '--admit-cloudflare-task-create') || env.CLOUDFLARE_TASK_LIFECYCLE_CREATE_CUTOVER === 'true';
  const cutoverPointRef = normalizeOptionalString(option(args, '--cutover-point-ref') ?? env.CLOUDFLARE_TASK_LIFECYCLE_CREATE_CUTOVER_POINT_REF ?? null);
  const governedWriteContractRef = normalizeOptionalString(option(args, '--governed-write-contract-ref') ?? env.CLOUDFLARE_TASK_LIFECYCLE_CREATE_CONTRACT_REF ?? null);
  const confirmationEvidenceRef = normalizeOptionalString(option(args, '--confirmation-evidence-ref') ?? env.CLOUDFLARE_TASK_LIFECYCLE_CREATE_CONFIRMATION_EVIDENCE_REF ?? null);
  const requestId = option(args, '--request-id') ?? `task_lifecycle_create_${String(admissionId).replace(/[^a-z0-9]+/gi, '_')}_${now()}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_TASK_LIFECYCLE_CREATE_FORMAT ?? 'json';
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('task_lifecycle_create_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('task_lifecycle_create_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!title) throw new Error('task_lifecycle_create_requires_--title_or_CLOUDFLARE_TASK_LIFECYCLE_CREATE_TITLE');
  if (!['json', 'text'].includes(format)) throw new Error(`task_lifecycle_create_format_unsupported:${format}`);
  if (!auth) throw new Error('task_lifecycle_create_requires_bearer_token_or_operator_session');
  if (admitCloudflareTaskCreate) {
    if (!cutoverPointRef) throw new Error('task_lifecycle_create_admission_requires_--cutover-point-ref');
    if (!governedWriteContractRef) throw new Error('task_lifecycle_create_admission_requires_--governed-write-contract-ref');
    if (!confirmationEvidenceRef) throw new Error('task_lifecycle_create_admission_requires_--confirmation-evidence-ref');
  }

  return {
    workerUrl,
    requestId,
    format,
    auth,
    params: {
      site_id: siteId,
      admission_id: admissionId,
      ...(carrierSessionId ? { carrier_session_id: carrierSessionId } : {}),
      title,
      ...(description ? { description } : {}),
      ...(admitCloudflareTaskCreate ? {
        cloudflare_task_create_cutover: true,
        cutover_point_ref: cutoverPointRef,
        governed_write_contract_ref: governedWriteContractRef,
        confirmation_evidence_ref: confirmationEvidenceRef,
      } : {}),
    },
  };
}

export async function createCloudflareTaskLifecycleTask(config, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/carrier', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
    },
    body: JSON.stringify({
      operation: 'task_lifecycle.task_create.admit',
      request_id: config.requestId,
      params: config.params,
    }),
  });
  const text = await response.text();
  const body = parseJsonText(text);
  if (response.status < 200 || response.status >= 300) {
    const code = body?.code ?? body?.error ?? `http_${response.status}`;
    const error = new Error(`task_lifecycle_create_request_failed:${code}`);
    error.code = code;
    error.http_status = response.status;
    error.response = body;
    error.summary = summarizeTaskLifecycleCreate(body, config.params);
    error.config = config;
    throw error;
  }
  return {
    schema: 'narada.cloudflare_carrier.task_lifecycle_create.v1',
    status: 'ok',
    request_id: config.requestId,
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    params: redactTaskLifecycleCreateParams(config.params),
    response: body,
    summary: summarizeTaskLifecycleCreate(body, config.params),
  };
}

export function summarizeTaskLifecycleCreate(body = {}, params = {}) {
  const task = body?.task ?? {};
  const decision = body?.decision ?? {};
  return {
    ok: body.ok ?? null,
    code: body.code ?? null,
    site_id: task.site_id ?? body.site_id ?? params.site_id ?? null,
    admission_id: body.admission_id ?? params.admission_id ?? null,
    task_id: task.task_id ?? body.task_id ?? null,
    task_number: task.task_number ?? body.task_number ?? null,
    carrier_session_id: task.carrier_session_id ?? params.carrier_session_id ?? null,
    title: task.title ?? params.title ?? null,
    status: task.status ?? body.status ?? null,
    decision_action: decision.action ?? body.action ?? null,
    decision_reason: decision.reason ?? body.reason ?? null,
    mutation_authority: body.mutation_authority ?? task.mutation_authority ?? null,
    cloudflare_write_admission: body.cloudflare_write_admission ?? task.cloudflare_write_admission ?? null,
    write_effect: body.write_effect ?? null,
    cutover_point_ref: task.cutover_point_ref ?? params.cutover_point_ref ?? null,
    governed_write_contract_ref: task.governed_write_contract_ref ?? params.governed_write_contract_ref ?? null,
    confirmation_evidence_ref: task.confirmation_evidence_ref ?? params.confirmation_evidence_ref ?? null,
  };
}

export function formatTaskLifecycleCreateText(result) {
  const summary = result?.summary ?? summarizeTaskLifecycleCreate(result?.response ?? {}, result?.params ?? {});
  const ok = summary.ok === false || result?.status === 'refused' ? false : true;
  return [
    `Task Lifecycle Create: ${ok === false ? 'refused' : 'ok'}`,
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? result?.params?.site_id ?? 'unknown'}`,
    `Admission: ${summary.admission_id ?? result?.params?.admission_id ?? 'unknown'}`,
    ...(summary.code ? [`Code: ${summary.code}`] : []),
    ...(summary.task_id ? [`Task: ${summary.task_id}${summary.task_number ? ` #${summary.task_number}` : ''}`] : []),
    `Title: ${summary.title ?? result?.params?.title ?? 'unknown'}`,
    ...(summary.carrier_session_id ? [`Session: ${summary.carrier_session_id}`] : []),
    `Status: ${summary.status ?? 'unknown'}`,
    `Decision: action=${summary.decision_action ?? 'unknown'} reason=${summary.decision_reason ?? 'unknown'}`,
    `Authority: mutation=${summary.mutation_authority ?? 'unknown'} cloudflare_write=${summary.cloudflare_write_admission ?? 'unknown'} effect=${summary.write_effect ?? 'unknown'}`,
    ...(summary.cutover_point_ref ? [`Cutover: ${summary.cutover_point_ref}`] : []),
    ...(summary.governed_write_contract_ref ? [`Contract: ${summary.governed_write_contract_ref}`] : []),
    ...(summary.confirmation_evidence_ref ? [`Evidence: ${summary.confirmation_evidence_ref}`] : []),
  ].join('\n') + '\n';
}

function redactTaskLifecycleCreateParams(params = {}) {
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
    const config = parseTaskLifecycleCreateArgs(process.argv.slice(2));
    const result = await createCloudflareTaskLifecycleTask(config);
    if (config.format === 'text') {
      process.stdout.write(formatTaskLifecycleCreateText(result));
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  } catch (error) {
    if (error?.response && error?.summary && error?.config?.format === 'text') {
      process.stderr.write(formatTaskLifecycleCreateText({
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
