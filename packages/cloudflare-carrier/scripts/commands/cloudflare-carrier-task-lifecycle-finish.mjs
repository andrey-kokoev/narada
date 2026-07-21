#!/usr/bin/env node
import { resolveAuth } from '../shared/cloudflare-carrier-auth-http.mjs';
import { fileURLToPath } from 'node:url';
import { authHeaders } from '../shared/cloudflare-carrier-auth-http.mjs';

export function parseTaskLifecycleFinishArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const taskId = option(args, '--task-id') ?? env.CLOUDFLARE_TASK_LIFECYCLE_FINISH_TASK_ID ?? null;
  const finalizerAgentId = normalizeOptionalString(option(args, '--finalizer-agent') ?? option(args, '--agent') ?? env.CLOUDFLARE_TASK_LIFECYCLE_FINISH_AGENT_ID ?? null);
  const finalizerPrincipalId = normalizeOptionalString(option(args, '--finalizer-principal') ?? env.CLOUDFLARE_TASK_LIFECYCLE_FINISH_PRINCIPAL_ID ?? null);
  const finishVerdict = normalizeOptionalString(option(args, '--finish-verdict') ?? env.CLOUDFLARE_TASK_LIFECYCLE_FINISH_VERDICT ?? 'accepted');
  const admissionId = option(args, '--admission-id') ?? env.CLOUDFLARE_TASK_LIFECYCLE_FINISH_ADMISSION_ID ?? `task_lifecycle_finish_${now()}`;
  const admitCloudflareTaskFinish = booleanFlag(args, '--admit-cloudflare-task-finish') || env.CLOUDFLARE_TASK_LIFECYCLE_FINISH_CUTOVER === 'true';
  const finishAuthorityRef = normalizeOptionalString(option(args, '--finish-authority-ref') ?? env.CLOUDFLARE_TASK_LIFECYCLE_FINISH_AUTHORITY_REF ?? null);
  const finishSchemaRef = normalizeOptionalString(option(args, '--finish-schema-ref') ?? env.CLOUDFLARE_TASK_LIFECYCLE_FINISH_SCHEMA_REF ?? null);
  const cutoverPointRef = normalizeOptionalString(option(args, '--cutover-point-ref') ?? env.CLOUDFLARE_TASK_LIFECYCLE_FINISH_CUTOVER_POINT_REF ?? null);
  const governedWriteContractRef = normalizeOptionalString(option(args, '--governed-write-contract-ref') ?? env.CLOUDFLARE_TASK_LIFECYCLE_FINISH_CONTRACT_REF ?? null);
  const confirmationEvidenceRef = normalizeOptionalString(option(args, '--confirmation-evidence-ref') ?? env.CLOUDFLARE_TASK_LIFECYCLE_FINISH_CONFIRMATION_EVIDENCE_REF ?? null);
  const requestId = option(args, '--request-id') ?? `task_lifecycle_finish_${String(admissionId).replace(/[^a-z0-9]+/gi, '_')}_${now()}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_TASK_LIFECYCLE_FINISH_FORMAT ?? 'json';
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('task_lifecycle_finish_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('task_lifecycle_finish_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!taskId) throw new Error('task_lifecycle_finish_requires_--task-id_or_CLOUDFLARE_TASK_LIFECYCLE_FINISH_TASK_ID');
  if (!finalizerAgentId && !finalizerPrincipalId) throw new Error('task_lifecycle_finish_requires_--finalizer-agent_or_--finalizer-principal');
  if (finishVerdict !== 'accepted') throw new Error(`task_lifecycle_finish_verdict_unsupported:${finishVerdict ?? ''}`);
  if (!['json', 'text'].includes(format)) throw new Error(`task_lifecycle_finish_format_unsupported:${format}`);
  if (!auth) throw new Error('task_lifecycle_finish_requires_bearer_token_or_operator_session');
  if (admitCloudflareTaskFinish) {
    if (!finishAuthorityRef) throw new Error('task_lifecycle_finish_admission_requires_--finish-authority-ref');
    if (!finishSchemaRef) throw new Error('task_lifecycle_finish_admission_requires_--finish-schema-ref');
    if (!cutoverPointRef) throw new Error('task_lifecycle_finish_admission_requires_--cutover-point-ref');
    if (!governedWriteContractRef) throw new Error('task_lifecycle_finish_admission_requires_--governed-write-contract-ref');
    if (!confirmationEvidenceRef) throw new Error('task_lifecycle_finish_admission_requires_--confirmation-evidence-ref');
  }

  return {
    workerUrl,
    requestId,
    format,
    auth,
    params: {
      site_id: siteId,
      admission_id: admissionId,
      task_id: taskId,
      ...(finalizerAgentId ? { finalizer_agent_id: finalizerAgentId } : {}),
      ...(finalizerPrincipalId ? { finalizer_principal_id: finalizerPrincipalId } : {}),
      finish_verdict: finishVerdict,
      ...(admitCloudflareTaskFinish ? {
        cloudflare_task_finish_cutover: true,
        finish_authority_ref: finishAuthorityRef,
        finish_schema_ref: finishSchemaRef,
        cutover_point_ref: cutoverPointRef,
        governed_write_contract_ref: governedWriteContractRef,
        confirmation_evidence_ref: confirmationEvidenceRef,
      } : {}),
    },
  };
}

export async function finishCloudflareTaskLifecycleTask(config, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/carrier', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
    },
    body: JSON.stringify({
      operation: 'task_lifecycle.task_finish.admit',
      request_id: config.requestId,
      params: config.params,
    }),
  });
  const text = await response.text();
  const body = parseJsonText(text);
  if (response.status < 200 || response.status >= 300) {
    const code = body?.code ?? body?.error ?? `http_${response.status}`;
    const error = new Error(`task_lifecycle_finish_request_failed:${code}`);
    error.code = code;
    error.http_status = response.status;
    error.response = body;
    error.summary = summarizeTaskLifecycleFinish(body, config.params);
    error.config = config;
    throw error;
  }
  return {
    schema: 'narada.cloudflare_carrier.task_lifecycle_finish.v1',
    status: 'ok',
    request_id: config.requestId,
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    params: redactTaskLifecycleFinishParams(config.params),
    response: body,
    summary: summarizeTaskLifecycleFinish(body, config.params),
  };
}

export function summarizeTaskLifecycleFinish(body = {}, params = {}) {
  const task = body?.task ?? {};
  const finish = task?.finish ?? body?.finish ?? {};
  const decision = body?.decision ?? {};
  return {
    ok: body.ok ?? null,
    code: body.code ?? null,
    site_id: task.site_id ?? body.site_id ?? params.site_id ?? null,
    admission_id: body.admission_id ?? params.admission_id ?? null,
    task_id: task.task_id ?? body.task_id ?? params.task_id ?? null,
    task_number: task.task_number ?? body.task_number ?? null,
    previous_status: body.previous_status ?? null,
    new_status: body.new_status ?? task.status ?? body.status ?? null,
    status: task.status ?? body.status ?? null,
    finish_verdict: task.finish_verdict ?? finish.finish_verdict ?? body.finish_verdict ?? params.finish_verdict ?? null,
    finalizer_agent_id: task.finished_by_agent_id ?? body.finalizer_agent_id ?? params.finalizer_agent_id ?? null,
    finalizer_principal_id: task.finished_by_principal_id ?? body.finalizer_principal_id ?? params.finalizer_principal_id ?? null,
    operation_id: task.operation_id ?? finish.operation_id ?? body.operation_id ?? params.operation_id ?? null,
    carrier_session_id: task.carrier_session_id ?? finish.carrier_session_id ?? body.carrier_session_id ?? params.carrier_session_id ?? null,
    claimed_by_agent_id: task.claimed_by_agent_id ?? body.claimed_by_agent_id ?? null,
    changed_file_evidence_count: task.changed_file_evidence_count ?? body.changed_file_evidence_count ?? null,
    decision_action: decision.action ?? body.action ?? null,
    decision_reason: decision.reason ?? body.reason ?? null,
    conflict_policy: decision.conflict_policy ?? body.conflict_policy ?? null,
    mutation_authority: body.mutation_authority ?? task.mutation_authority ?? null,
    cloudflare_write_admission: body.cloudflare_write_admission ?? task.cloudflare_write_admission ?? null,
    write_effect: body.write_effect ?? null,
    finish_authority_ref: finish.finish_authority_ref ?? task.finish_authority_ref ?? params.finish_authority_ref ?? null,
    finish_schema_ref: finish.finish_schema_ref ?? task.finish_schema_ref ?? params.finish_schema_ref ?? null,
    cutover_point_ref: finish.cutover_point_ref ?? task.finish_cutover_point_ref ?? params.cutover_point_ref ?? null,
    governed_write_contract_ref: finish.governed_write_contract_ref ?? task.finish_governed_write_contract_ref ?? params.governed_write_contract_ref ?? null,
    confirmation_evidence_ref: finish.confirmation_evidence_ref ?? task.finish_confirmation_evidence_ref ?? params.confirmation_evidence_ref ?? null,
  };
}

export function formatTaskLifecycleFinishText(result) {
  const summary = result?.summary ?? summarizeTaskLifecycleFinish(result?.response ?? {}, result?.params ?? {});
  const workerUrl = result?.worker_url ?? null;
  const ok = summary.ok === false || result?.status === 'refused' ? false : true;
  const lines = [
    `Task Lifecycle Finish: ${ok === false ? 'refused' : 'ok'}`,
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? result?.params?.site_id ?? 'unknown'}`,
    `Admission: ${summary.admission_id ?? result?.params?.admission_id ?? 'unknown'}`,
    ...(summary.code ? [`Code: ${summary.code}`] : []),
    `Task: ${summary.task_id ?? result?.params?.task_id ?? 'unknown'}${summary.task_number ? ` #${summary.task_number}` : ''}`,
    `Finalizer: ${summary.finalizer_agent_id ?? summary.finalizer_principal_id ?? result?.params?.finalizer_agent_id ?? result?.params?.finalizer_principal_id ?? 'unknown'}`,
    `Status: ${summary.new_status ?? summary.status ?? 'unknown'}${summary.previous_status ? ` previous=${summary.previous_status}` : ''}${summary.finish_verdict ? ` verdict=${summary.finish_verdict}` : ''}`,
    `Decision: action=${summary.decision_action ?? 'unknown'} reason=${summary.decision_reason ?? 'unknown'}${summary.conflict_policy ? ` conflict_policy=${summary.conflict_policy}` : ''}`,
    `Authority: mutation=${summary.mutation_authority ?? 'unknown'} cloudflare_write=${summary.cloudflare_write_admission ?? 'unknown'} effect=${summary.write_effect ?? 'unknown'}`,
    ...(summary.changed_file_evidence_count !== null ? [`Changed File Evidence Count: ${summary.changed_file_evidence_count}`] : []),
    ...(summary.claimed_by_agent_id ? [`Claimed By: ${summary.claimed_by_agent_id}`] : []),
    ...(summary.finish_authority_ref ? [`Finish Authority: ${summary.finish_authority_ref}`] : []),
    ...(summary.finish_schema_ref ? [`Finish Schema: ${summary.finish_schema_ref}`] : []),
    ...(summary.cutover_point_ref ? [`Cutover: ${summary.cutover_point_ref}`] : []),
    ...(summary.governed_write_contract_ref ? [`Contract: ${summary.governed_write_contract_ref}`] : []),
    ...(summary.confirmation_evidence_ref ? [`Evidence: ${summary.confirmation_evidence_ref}`] : []),
  ];
  if (workerUrl && summary.site_id) {
    lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file> --execute-site-next`);
    lines.push(`Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`);
  }
  if (workerUrl && summary.site_id && summary.carrier_session_id) {
    lines.push(`Session Evidence: pnpm --filter @narada2/cloudflare-carrier product:session:evidence:text -- --url ${workerUrl} --site ${summary.site_id} --carrier-session-id ${summary.carrier_session_id} --operator-session-file <operator-session-file>`);
  }
  if (workerUrl && summary.site_id && summary.operation_id) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${workerUrl} --site ${summary.site_id} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file>`);
    lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`);
  }
  if (workerUrl && summary.site_id && summary.task_id) {
    lines.push(`Task Review: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:review:text -- --url ${workerUrl} --site ${summary.site_id} --task-id ${summary.task_id} --operator-session-file <operator-session-file>`);
    lines.push(`Task Workflow: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --task-id ${summary.task_id} --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next`);
  }
  return lines.join('\n') + '\n';
}

function redactTaskLifecycleFinishParams(params = {}) {
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
    const config = parseTaskLifecycleFinishArgs(process.argv.slice(2));
    const result = await finishCloudflareTaskLifecycleTask(config);
    if (config.format === 'text') {
      process.stdout.write(formatTaskLifecycleFinishText(result));
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  } catch (error) {
    if (error?.response && error?.summary && error?.config?.format === 'text') {
      process.stderr.write(formatTaskLifecycleFinishText({
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
