#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

export function parseTaskLifecycleReportArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const taskId = option(args, '--task-id') ?? env.CLOUDFLARE_TASK_LIFECYCLE_REPORT_TASK_ID ?? null;
  const reporterAgentId = normalizeOptionalString(option(args, '--reporter-agent') ?? option(args, '--agent') ?? env.CLOUDFLARE_TASK_LIFECYCLE_REPORT_AGENT_ID ?? null);
  const reporterPrincipalId = normalizeOptionalString(option(args, '--reporter-principal') ?? env.CLOUDFLARE_TASK_LIFECYCLE_REPORT_PRINCIPAL_ID ?? null);
  const summary = option(args, '--summary') ?? env.CLOUDFLARE_TASK_LIFECYCLE_REPORT_SUMMARY ?? null;
  const reportId = normalizeOptionalString(option(args, '--report-id') ?? env.CLOUDFLARE_TASK_LIFECYCLE_REPORT_ID ?? null);
  const reportStatus = normalizeOptionalString(option(args, '--report-status') ?? env.CLOUDFLARE_TASK_LIFECYCLE_REPORT_STATUS ?? null);
  const resultingStatus = normalizeOptionalString(option(args, '--resulting-status') ?? option(args, '--new-status') ?? env.CLOUDFLARE_TASK_LIFECYCLE_REPORT_RESULTING_STATUS ?? null);
  const changedFiles = parseStringList(optionAll(args, '--changed-file'), option(args, '--changed-files') ?? env.CLOUDFLARE_TASK_LIFECYCLE_REPORT_CHANGED_FILES ?? null);
  const verification = parseVerification(optionAll(args, '--verification'), option(args, '--verification-json') ?? env.CLOUDFLARE_TASK_LIFECYCLE_REPORT_VERIFICATION ?? null);
  const admissionId = option(args, '--admission-id') ?? env.CLOUDFLARE_TASK_LIFECYCLE_REPORT_ADMISSION_ID ?? `task_lifecycle_report_${now()}`;
  const admitCloudflareTaskReport = booleanFlag(args, '--admit-cloudflare-task-report') || env.CLOUDFLARE_TASK_LIFECYCLE_REPORT_CUTOVER === 'true';
  const reportAuthorityRef = normalizeOptionalString(option(args, '--report-authority-ref') ?? env.CLOUDFLARE_TASK_LIFECYCLE_REPORT_AUTHORITY_REF ?? null);
  const reportSchemaRef = normalizeOptionalString(option(args, '--report-schema-ref') ?? env.CLOUDFLARE_TASK_LIFECYCLE_REPORT_SCHEMA_REF ?? null);
  const changedFileEvidenceBoundaryRef = normalizeOptionalString(option(args, '--changed-file-evidence-boundary-ref') ?? env.CLOUDFLARE_TASK_LIFECYCLE_REPORT_CHANGED_FILE_EVIDENCE_BOUNDARY_REF ?? null);
  const cutoverPointRef = normalizeOptionalString(option(args, '--cutover-point-ref') ?? env.CLOUDFLARE_TASK_LIFECYCLE_REPORT_CUTOVER_POINT_REF ?? null);
  const governedWriteContractRef = normalizeOptionalString(option(args, '--governed-write-contract-ref') ?? env.CLOUDFLARE_TASK_LIFECYCLE_REPORT_CONTRACT_REF ?? null);
  const confirmationEvidenceRef = normalizeOptionalString(option(args, '--confirmation-evidence-ref') ?? env.CLOUDFLARE_TASK_LIFECYCLE_REPORT_CONFIRMATION_EVIDENCE_REF ?? null);
  const requestId = option(args, '--request-id') ?? `task_lifecycle_report_${String(admissionId).replace(/[^a-z0-9]+/gi, '_')}_${now()}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_TASK_LIFECYCLE_REPORT_FORMAT ?? 'json';
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('task_lifecycle_report_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('task_lifecycle_report_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!taskId) throw new Error('task_lifecycle_report_requires_--task-id_or_CLOUDFLARE_TASK_LIFECYCLE_REPORT_TASK_ID');
  if (!reporterAgentId && !reporterPrincipalId) throw new Error('task_lifecycle_report_requires_--reporter-agent_or_--reporter-principal');
  if (!summary) throw new Error('task_lifecycle_report_requires_--summary_or_CLOUDFLARE_TASK_LIFECYCLE_REPORT_SUMMARY');
  if (!['json', 'text'].includes(format)) throw new Error(`task_lifecycle_report_format_unsupported:${format}`);
  if (!auth) throw new Error('task_lifecycle_report_requires_bearer_token_or_operator_session');
  if (reportStatus && !['submitted', 'blocked'].includes(reportStatus)) throw new Error(`task_lifecycle_report_status_unsupported:${reportStatus}`);
  if (resultingStatus && !['closed', 'needs_continuation'].includes(resultingStatus)) throw new Error(`task_lifecycle_report_resulting_status_unsupported:${resultingStatus}`);
  if (admitCloudflareTaskReport) {
    if (!reportAuthorityRef) throw new Error('task_lifecycle_report_admission_requires_--report-authority-ref');
    if (!reportSchemaRef) throw new Error('task_lifecycle_report_admission_requires_--report-schema-ref');
    if (!changedFileEvidenceBoundaryRef) throw new Error('task_lifecycle_report_admission_requires_--changed-file-evidence-boundary-ref');
    if (!cutoverPointRef) throw new Error('task_lifecycle_report_admission_requires_--cutover-point-ref');
    if (!governedWriteContractRef) throw new Error('task_lifecycle_report_admission_requires_--governed-write-contract-ref');
    if (!confirmationEvidenceRef) throw new Error('task_lifecycle_report_admission_requires_--confirmation-evidence-ref');
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
      ...(reporterAgentId ? { reporter_agent_id: reporterAgentId } : {}),
      ...(reporterPrincipalId ? { reporter_principal_id: reporterPrincipalId } : {}),
      summary,
      ...(reportId ? { report_id: reportId } : {}),
      ...(reportStatus ? { report_status: reportStatus } : {}),
      ...(resultingStatus ? { resulting_status: resultingStatus } : {}),
      ...(changedFiles.length ? { changed_files: changedFiles } : {}),
      ...(verification.length ? { verification } : {}),
      ...(admitCloudflareTaskReport ? {
        cloudflare_task_report_cutover: true,
        report_authority_ref: reportAuthorityRef,
        report_schema_ref: reportSchemaRef,
        changed_file_evidence_boundary_ref: changedFileEvidenceBoundaryRef,
        cutover_point_ref: cutoverPointRef,
        governed_write_contract_ref: governedWriteContractRef,
        confirmation_evidence_ref: confirmationEvidenceRef,
      } : {}),
    },
  };
}

export async function reportCloudflareTaskLifecycleTask(config, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/carrier', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
    },
    body: JSON.stringify({
      operation: 'task_lifecycle.task_report.admit',
      request_id: config.requestId,
      params: config.params,
    }),
  });
  const text = await response.text();
  const body = parseJsonText(text);
  if (response.status < 200 || response.status >= 300) {
    const code = body?.code ?? body?.error ?? `http_${response.status}`;
    const error = new Error(`task_lifecycle_report_request_failed:${code}`);
    error.code = code;
    error.http_status = response.status;
    error.response = body;
    error.summary = summarizeTaskLifecycleReport(body, config.params);
    error.config = config;
    throw error;
  }
  return {
    schema: 'narada.cloudflare_carrier.task_lifecycle_report.v1',
    status: 'ok',
    request_id: config.requestId,
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    params: redactTaskLifecycleReportParams(config.params),
    response: body,
    summary: summarizeTaskLifecycleReport(body, config.params),
  };
}

export function summarizeTaskLifecycleReport(body = {}, params = {}) {
  const task = body?.task ?? {};
  const report = body?.report ?? task?.report ?? {};
  const decision = body?.decision ?? {};
  return {
    ok: body.ok ?? null,
    code: body.code ?? null,
    site_id: task.site_id ?? body.site_id ?? params.site_id ?? null,
    admission_id: body.admission_id ?? params.admission_id ?? null,
    task_id: task.task_id ?? report.task_id ?? body.task_id ?? params.task_id ?? null,
    task_number: task.task_number ?? report.task_number ?? body.task_number ?? null,
    report_id: report.report_id ?? task.report_id ?? body.report_id ?? params.report_id ?? null,
    previous_status: body.previous_status ?? report.previous_status ?? null,
    new_status: body.new_status ?? report.resulting_status ?? task.status ?? body.status ?? null,
    status: task.status ?? body.status ?? null,
    report_status: report.report_status ?? task.report_status ?? params.report_status ?? null,
    reporter_agent_id: report.reporter_agent_id ?? task.reported_by_agent_id ?? body.reporter_agent_id ?? params.reporter_agent_id ?? null,
    reporter_principal_id: report.reporter_principal_id ?? task.reported_by_principal_id ?? body.reporter_principal_id ?? params.reporter_principal_id ?? null,
    operation_id: task.operation_id ?? report.operation_id ?? body.operation_id ?? params.operation_id ?? null,
    carrier_session_id: task.carrier_session_id ?? report.carrier_session_id ?? body.carrier_session_id ?? params.carrier_session_id ?? null,
    claimed_by_agent_id: body.claimed_by_agent_id ?? task.claimed_by_agent_id ?? null,
    summary: report.summary ?? params.summary ?? null,
    changed_file_count: Array.isArray(report.changed_files) ? report.changed_files.length : Array.isArray(params.changed_files) ? params.changed_files.length : null,
    verification_count: Array.isArray(report.verification) ? report.verification.length : Array.isArray(params.verification) ? params.verification.length : null,
    changed_file_evidence_admission: report.changed_file_evidence_admission ?? task.changed_file_evidence_admission ?? null,
    decision_action: decision.action ?? body.action ?? null,
    decision_reason: decision.reason ?? body.reason ?? null,
    conflict_policy: decision.conflict_policy ?? body.conflict_policy ?? null,
    mutation_authority: body.mutation_authority ?? task.mutation_authority ?? null,
    cloudflare_write_admission: body.cloudflare_write_admission ?? task.cloudflare_write_admission ?? null,
    write_effect: body.write_effect ?? null,
    report_authority_ref: report.report_authority_ref ?? task.report_authority_ref ?? params.report_authority_ref ?? null,
    report_schema_ref: report.report_schema_ref ?? task.report_schema_ref ?? params.report_schema_ref ?? null,
    changed_file_evidence_boundary_ref: report.changed_file_evidence_boundary_ref ?? task.changed_file_evidence_boundary_ref ?? params.changed_file_evidence_boundary_ref ?? null,
    cutover_point_ref: report.cutover_point_ref ?? task.report_cutover_point_ref ?? params.cutover_point_ref ?? null,
    governed_write_contract_ref: report.governed_write_contract_ref ?? task.report_governed_write_contract_ref ?? params.governed_write_contract_ref ?? null,
    confirmation_evidence_ref: report.confirmation_evidence_ref ?? task.report_confirmation_evidence_ref ?? params.confirmation_evidence_ref ?? null,
  };
}

export function formatTaskLifecycleReportText(result) {
  const summary = result?.summary ?? summarizeTaskLifecycleReport(result?.response ?? {}, result?.params ?? {});
  const workerUrl = result?.worker_url ?? null;
  const ok = summary.ok === false || result?.status === 'refused' ? false : true;
  const lines = [
    `Task Lifecycle Report: ${ok === false ? 'refused' : 'ok'}`,
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? result?.params?.site_id ?? 'unknown'}`,
    `Admission: ${summary.admission_id ?? result?.params?.admission_id ?? 'unknown'}`,
    ...(summary.code ? [`Code: ${summary.code}`] : []),
    `Task: ${summary.task_id ?? result?.params?.task_id ?? 'unknown'}${summary.task_number ? ` #${summary.task_number}` : ''}`,
    ...(summary.report_id ? [`Report: ${summary.report_id}`] : []),
    `Reporter: ${summary.reporter_agent_id ?? summary.reporter_principal_id ?? result?.params?.reporter_agent_id ?? result?.params?.reporter_principal_id ?? 'unknown'}`,
    `Status: ${summary.new_status ?? summary.status ?? 'unknown'}${summary.previous_status ? ` previous=${summary.previous_status}` : ''}${summary.report_status ? ` report=${summary.report_status}` : ''}`,
    `Decision: action=${summary.decision_action ?? 'unknown'} reason=${summary.decision_reason ?? 'unknown'}${summary.conflict_policy ? ` conflict_policy=${summary.conflict_policy}` : ''}`,
    `Authority: mutation=${summary.mutation_authority ?? 'unknown'} cloudflare_write=${summary.cloudflare_write_admission ?? 'unknown'} effect=${summary.write_effect ?? 'unknown'}`,
    ...(summary.changed_file_count !== null ? [`Changed Files: ${summary.changed_file_count}`] : []),
    ...(summary.verification_count !== null ? [`Verification: ${summary.verification_count}`] : []),
    ...(summary.changed_file_evidence_admission ? [`Changed File Evidence: ${summary.changed_file_evidence_admission}`] : []),
    ...(summary.claimed_by_agent_id ? [`Claimed By: ${summary.claimed_by_agent_id}`] : []),
    ...(summary.report_authority_ref ? [`Report Authority: ${summary.report_authority_ref}`] : []),
    ...(summary.report_schema_ref ? [`Report Schema: ${summary.report_schema_ref}`] : []),
    ...(summary.changed_file_evidence_boundary_ref ? [`Changed File Boundary: ${summary.changed_file_evidence_boundary_ref}`] : []),
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

function redactTaskLifecycleReportParams(params = {}) {
  return { ...params };
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function optionAll(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && index + 1 < args.length) values.push(args[index + 1]);
  }
  return values;
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

function parseStringList(repeatedValues = [], singleValue = null) {
  const values = [];
  for (const value of repeatedValues) {
    const text = normalizeOptionalString(value);
    if (text) values.push(text);
  }
  const single = normalizeOptionalString(singleValue);
  if (single) {
    const parsed = parseMaybeJson(single);
    if (Array.isArray(parsed)) {
      values.push(...parsed.map((entry) => String(entry).trim()).filter(Boolean));
    } else {
      values.push(...single.split(',').map((entry) => entry.trim()).filter(Boolean));
    }
  }
  return values;
}

function parseVerification(repeatedValues = [], jsonValue = null) {
  const values = [];
  for (const value of repeatedValues) {
    const parsed = parseMaybeJson(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) values.push(parsed);
    else if (normalizeOptionalString(value)) values.push({ note: String(value).trim() });
  }
  const json = normalizeOptionalString(jsonValue);
  if (json) {
    const parsed = parseMaybeJson(json);
    if (Array.isArray(parsed)) values.push(...parsed);
    else if (parsed && typeof parsed === 'object') values.push(parsed);
    else values.push({ note: json });
  }
  return values;
}

function parseMaybeJson(value) {
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseTaskLifecycleReportArgs(process.argv.slice(2));
    const result = await reportCloudflareTaskLifecycleTask(config);
    if (config.format === 'text') {
      process.stdout.write(formatTaskLifecycleReportText(result));
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  } catch (error) {
    if (error?.response && error?.summary && error?.config?.format === 'text') {
      process.stderr.write(formatTaskLifecycleReportText({
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
