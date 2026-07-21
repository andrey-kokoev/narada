#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolveAuth } from '../shared/cloudflare-carrier-auth-http.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { authHeaders } from '../shared/cloudflare-carrier-auth-http.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, '../../../..');

export function parseTaskLifecycleAssignmentWriteLiveSmokeArgs(argv = [], env = process.env, { loadEnv = true } = {}) {
  const args = [...argv];
  if (loadEnv) loadLocalEnv(join(repoRoot, '.env'), env);

  const workerUrl = trimTrailingSlash(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const format = option(args, '--format') ?? env.CLOUDFLARE_TASK_LIFECYCLE_ASSIGNMENT_WRITE_LIVE_SMOKE_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const operationId = option(args, '--operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
  const agentId = option(args, '--agent') ?? env.CLOUDFLARE_TASK_LIFECYCLE_REPORT_AGENT_ID ?? 'cloudflare-live-smoke-agent';
  const filePath = option(args, '--file') ?? 'packages/cloudflare-carrier/src/cloudflare-worker.mjs';
  const title = option(args, '--title') ?? null;
  const auth = resolveAuth(args, env) ?? resolveBearerFromEnv(args, env);

  if (!workerUrl) throw new Error('assignment_write_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`assignment_write_live_smoke_unknown_format:${format}`);
  if (!auth) throw new Error('assignment_write_live_smoke_requires_bearer_token_or_operator_session');
  if (!siteId) throw new Error('assignment_write_live_smoke_requires_site_id');

  return {
    workerUrl,
    format,
    auth,
    siteId,
    operationId,
    agentId,
    filePath,
    title,
  };
}

export function formatTaskLifecycleAssignmentWriteLiveSmokeText(result) {
  const lines = [
    `Task Lifecycle Assignment Write Smoke: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Operation: ${result.operation_id}`,
    `Task: ${result.task_id} #${result.task_number}`,
    `Admissions: create=${result.create_admission_id} claim=${result.claim_admission_id} report=${result.report_admission_id} changed_file_evidence=${result.changed_file_evidence_admission_id} finish=${result.finish_admission_id} projection_write=${result.projection_write_admission_id} source_state_write=${result.source_state_write_admission_id} assignment_write=${result.assignment_write_admission_id}`,
    `Assignee: ${result.assignee_agent_id}`,
    `Authority: mutation=${result.mutation_authority ?? 'unknown'} cloudflare_write=${result.cloudflare_write_admission ?? 'unknown'} effect=${result.write_effect ?? 'unknown'}`,
    `Assignment: authority=${result.assignment_authority_admission ?? 'unknown'} roster=${result.roster_mutation_admission ?? 'unknown'} role_resolution=${result.role_resolution_authority_admission ?? 'unknown'} mailbox=${result.mailbox_mutation_admission ?? 'unknown'} filesystem=${result.filesystem_mutation_admission ?? 'unknown'} repository_publication=${result.repository_publication_admission ?? 'unknown'}`,
    `Partition: ${result.authority_partition ?? 'unknown'}`,
    `Counts: assignment_write=${result.task_lifecycle_assignment_write_count ?? 0} write_admissions=${result.task_lifecycle_write_admission_count ?? 0}`,
    `Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file> --execute-site-next`,
    `Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Task Review: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:review:text -- --url ${result.worker_url} --site ${result.site_id} --task-id ${result.task_id} --operator-session-file <operator-session-file>`,
    `Task Workflow: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --task-id ${result.task_id} --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next`,
    `Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file>`,
    `Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`,
  ];
  return `${lines.join('\n')}\n`;
}

export async function runTaskLifecycleAssignmentWriteLiveSmoke(config, { fetchImpl = fetch } = {}) {
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const createAdmissionId = `assignment_write_live_create_${suffix}`;
  const claimAdmissionId = `assignment_write_live_claim_${suffix}`;
  const reportAdmissionId = `assignment_write_live_report_${suffix}`;
  const evidenceAdmissionId = `assignment_write_live_evidence_${suffix}`;
  const finishAdmissionId = `assignment_write_live_finish_${suffix}`;
  const projectionAdmissionId = `assignment_write_live_projection_${suffix}`;
  const sourceStateAdmissionId = `assignment_write_live_source_state_${suffix}`;
  const assignmentAdmissionId = `assignment_write_live_admitted_${suffix}`;
  const title = config.title ?? `Cloudflare assignment write ${suffix}`;

  const created = await postCarrier(config, {
    operation: 'task_lifecycle.task_create.admit',
    request_id: `assignment_write_live_create_${suffix}`,
    params: {
      site_id: config.siteId,
      admission_id: createAdmissionId,
      title,
      description: 'Live proof setup for Cloudflare-owned task lifecycle assignment write.',
      cloudflare_task_create_cutover: true,
      cutover_point_ref: 'cutover:task-lifecycle-create:v1',
      governed_write_contract_ref: 'contract:task-lifecycle-create:v1',
      confirmation_evidence_ref: 'evidence:live-smoke:task-lifecycle-create',
    },
  }, fetchImpl);
  assert.equal(created.http_status, 200, JSON.stringify(created.body));

  const claimed = await postCarrier(config, {
    operation: 'task_lifecycle.task_claim.admit',
    request_id: `assignment_write_live_claim_${suffix}`,
    params: {
      site_id: config.siteId,
      admission_id: claimAdmissionId,
      task_id: created.body.task.task_id,
      claimant_agent_id: config.agentId,
      cloudflare_task_claim_cutover: true,
      assignment_authority_ref: 'assignment-authority:task-lifecycle-claim:v1',
      cutover_point_ref: 'cutover:task-lifecycle-claim:v1',
      governed_write_contract_ref: 'contract:task-lifecycle-claim:v1',
      confirmation_evidence_ref: 'evidence:live-smoke:task-lifecycle-claim',
    },
  }, fetchImpl);
  assert.equal(claimed.http_status, 200, JSON.stringify(claimed.body));

  const reported = await postCarrier(config, {
    operation: 'task_lifecycle.task_report.admit',
    request_id: `assignment_write_live_report_${suffix}`,
    params: {
      site_id: config.siteId,
      admission_id: reportAdmissionId,
      task_id: created.body.task.task_id,
      reporter_agent_id: config.agentId,
      summary: 'Live Cloudflare assignment write proof setup.',
      changed_files: [config.filePath],
      verification: [{ command: 'pnpm --filter @narada2/cloudflare-carrier test', result: 'passed' }],
      cloudflare_task_report_cutover: true,
      report_authority_ref: 'report-authority:task-lifecycle-report:v1',
      report_schema_ref: 'schema:work-result-report:v1',
      changed_file_evidence_boundary_ref: 'boundary:changed-file-evidence:separate-cutover',
      cutover_point_ref: 'cutover:task-lifecycle-report:v1',
      governed_write_contract_ref: 'contract:task-lifecycle-report:v1',
      confirmation_evidence_ref: 'evidence:live-smoke:task-lifecycle-report',
    },
  }, fetchImpl);
  assert.equal(reported.http_status, 200, JSON.stringify(reported.body));

  const evidence = await postCarrier(config, {
    operation: 'task_lifecycle.changed_file_evidence.admit',
    request_id: `assignment_write_live_evidence_${suffix}`,
    params: {
      site_id: config.siteId,
      admission_id: evidenceAdmissionId,
      task_id: created.body.task.task_id,
      report_id: reported.body.report.report_id,
      file_path: config.filePath,
      reporter_agent_id: config.agentId,
      cloudflare_changed_file_evidence_cutover: true,
      file_evidence_authority_ref: 'file-evidence-authority:changed-file:v1',
      file_material_source_ref: 'material-source:git-diff-summary:v1',
      repository_authority_ref: 'repository-authority:narada:v1',
      cutover_point_ref: 'cutover:changed-file-evidence:v1',
      governed_write_contract_ref: 'contract:changed-file-evidence:v1',
      confirmation_evidence_ref: 'evidence:live-smoke:changed-file-evidence',
    },
  }, fetchImpl);
  assert.equal(evidence.http_status, 200, JSON.stringify(evidence.body));

  const finished = await postCarrier(config, {
    operation: 'task_lifecycle.task_finish.admit',
    request_id: `assignment_write_live_finish_${suffix}`,
    params: {
      site_id: config.siteId,
      admission_id: finishAdmissionId,
      task_id: created.body.task.task_id,
      finalizer_agent_id: config.agentId,
      finish_verdict: 'accepted',
      cloudflare_task_finish_cutover: true,
      finish_authority_ref: 'finish-authority:task-lifecycle-finish:v1',
      finish_schema_ref: 'schema:task-finish-acceptance:v1',
      cutover_point_ref: 'cutover:task-lifecycle-finish:v1',
      governed_write_contract_ref: 'contract:task-lifecycle-finish:v1',
      confirmation_evidence_ref: 'evidence:live-smoke:task-lifecycle-finish',
    },
  }, fetchImpl);
  assert.equal(finished.http_status, 200, JSON.stringify(finished.body));
  assert.equal(finished.body.task.status, 'finished');

  const projected = await postCarrier(config, {
    operation: 'task_lifecycle.projection_write.admit',
    request_id: `assignment_write_live_projection_${suffix}`,
    params: {
      site_id: config.siteId,
      admission_id: projectionAdmissionId,
      task_id: created.body.task.task_id,
      cloudflare_task_projection_write_cutover: true,
      projection_target_ref: 'projection-target:cloudflare-task-lifecycle-read-model:v1',
      projection_schema_ref: 'schema:cloudflare-task-lifecycle-read-model:v1',
      projection_authority_ref: 'projection-authority:task-lifecycle:v1',
      source_evidence_ref: `source-evidence:${created.body.task.task_id}:finished-row`,
      cutover_point_ref: 'cutover:task-lifecycle-projection-write:v1',
      governed_write_contract_ref: 'contract:task-lifecycle-projection-write:v1',
      confirmation_evidence_ref: 'evidence:live-smoke:task-lifecycle-projection-write',
    },
  }, fetchImpl);
  assert.equal(projected.http_status, 200, JSON.stringify(projected.body));
  assert.equal(projected.body.write_effect, 'task_lifecycle_projection_write');

  const sourceState = await postCarrier(config, {
    operation: 'task_lifecycle.source_state_write.admit',
    request_id: `assignment_write_live_source_state_${suffix}`,
    params: {
      site_id: config.siteId,
      admission_id: sourceStateAdmissionId,
      task_id: created.body.task.task_id,
      cloudflare_task_source_state_write_cutover: true,
      source_state_authority_ref: 'source-state-authority:cloudflare-task-lifecycle-d1:v1',
      source_state_schema_ref: 'schema:cloudflare-task-lifecycle-source-state:v1',
      source_state_evidence_ref: `source-state-evidence:${created.body.task.task_id}:projection-row`,
      cutover_point_ref: 'cutover:task-lifecycle-source-state-write:v1',
      governed_write_contract_ref: 'contract:task-lifecycle-source-state-write:v1',
      confirmation_evidence_ref: 'evidence:live-smoke:task-lifecycle-source-state-write',
    },
  }, fetchImpl);
  assert.equal(sourceState.http_status, 200, JSON.stringify(sourceState.body));
  assert.equal(sourceState.body.write_effect, 'task_lifecycle_source_state_write');

  const refusedAssignment = await postCarrier(config, {
    operation: 'task_lifecycle.assignment_write.admit',
    request_id: `assignment_write_live_refused_${suffix}`,
    params: {
      site_id: config.siteId,
      admission_id: `${assignmentAdmissionId}_refused`,
      task_id: created.body.task.task_id,
      assignee_agent_id: config.agentId,
      assignment_authority_ref: 'assignment-authority:cloudflare-task-lifecycle-assignment:v1',
      assignment_schema_ref: 'schema:cloudflare-task-lifecycle-assignment:v1',
      assignment_evidence_ref: `assignment-evidence:${created.body.task.task_id}:source-state-row`,
    },
  }, fetchImpl);
  assert.equal(refusedAssignment.http_status, 403, JSON.stringify(refusedAssignment.body));
  assert.equal(refusedAssignment.body.code, 'task_lifecycle_assignment_write_not_admitted');
  assert.equal(refusedAssignment.body.decision.reason, 'windows_task_lifecycle_mutation_authority_retained');

  const assignment = await postCarrier(config, {
    operation: 'task_lifecycle.assignment_write.admit',
    request_id: `assignment_write_live_admitted_${suffix}`,
    params: {
      site_id: config.siteId,
      admission_id: assignmentAdmissionId,
      task_id: created.body.task.task_id,
      assignee_agent_id: config.agentId,
      cloudflare_task_assignment_write_cutover: true,
      assignment_authority_ref: 'assignment-authority:cloudflare-task-lifecycle-assignment:v1',
      assignment_schema_ref: 'schema:cloudflare-task-lifecycle-assignment:v1',
      assignment_evidence_ref: `assignment-evidence:${created.body.task.task_id}:source-state-row`,
      cutover_point_ref: 'cutover:task-lifecycle-assignment-write:v1',
      governed_write_contract_ref: 'contract:task-lifecycle-assignment-write:v1',
      confirmation_evidence_ref: 'evidence:live-smoke:task-lifecycle-assignment-write',
    },
  }, fetchImpl);
  assert.equal(assignment.http_status, 200, JSON.stringify(assignment.body));
  assert.equal(assignment.body.status, 'task_lifecycle_assignment_written');
  assert.equal(assignment.body.write_effect, 'task_lifecycle_assignment_write');
  assert.equal(assignment.body.assignment.assignment_authority_admission, 'admitted');
  assert.equal(assignment.body.assignment.roster_mutation_admission, 'not_admitted');
  assert.equal(assignment.body.assignment.role_resolution_authority_admission, 'not_admitted');
  assert.equal(assignment.body.assignment.mailbox_mutation_admission, 'not_admitted');
  assert.equal(assignment.body.assignment.filesystem_mutation_admission, 'not_admitted');
  assert.equal(assignment.body.assignment.repository_publication_admission, 'not_admitted');
  assert.equal(assignment.body.task.task_lifecycle_assignment_write_count, 1);

  const operationRead = await postCarrier(config, {
    operation: 'operation.read',
    request_id: `assignment_write_live_operation_read_${suffix}`,
    params: { site_id: config.siteId, operation_id: config.operationId, task_lifecycle_task_limit: 100, task_lifecycle_include_task_ids: [created.body.task.task_id], task_lifecycle_write_admission_limit: 100 },
  }, fetchImpl);
  assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
  assert.ok(operationRead.body.task_lifecycle_tasks.some((entry) => entry.task_id === created.body.task.task_id && entry.status === 'finished' && entry.task_lifecycle_assignment_write_count === 1));
  assert.equal(operationRead.body.operation_product_surface.task_lifecycle_assignment_authority, 'cloudflare_task_lifecycle_d1');
  assert.ok(operationRead.body.operation_product_surface.task_lifecycle_assignment_write_count >= 1);
  assert.ok(new Set(['not_admitted', 'admitted']).has(operationRead.body.operation_product_surface.task_lifecycle_roster_mutation_admission), `unexpected roster mutation admission: ${operationRead.body.operation_product_surface.task_lifecycle_roster_mutation_admission}`);
  assert.ok(new Set(['not_admitted', 'admitted']).has(operationRead.body.operation_product_surface.task_lifecycle_role_resolution_authority_admission), `unexpected role-resolution authority admission: ${operationRead.body.operation_product_surface.task_lifecycle_role_resolution_authority_admission}`);
  assert.ok(new Set([
    'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_and_assignment_cloudflare_remaining_windows_effects',
    'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_and_role_resolution_cloudflare_remaining_windows_effects',
    'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_and_roster_mutation_cloudflare_remaining_windows_effects',
    'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_roster_mutation_and_external_effects_cloudflare_owned',
  ]).has(operationRead.body.operation_product_surface.task_lifecycle_authority_partition), `unexpected authority partition: ${operationRead.body.operation_product_surface.task_lifecycle_authority_partition}`);
  assert.ok(new Set([
    'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_and_assignment_admitted_remaining_external_effects_not_admitted',
    'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_and_role_resolution_admitted_remaining_external_effects_not_admitted',
    'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_and_roster_mutation_admitted_remaining_external_effects_not_admitted',
    'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_roster_mutation_and_external_effects_admitted',
  ]).has(operationRead.body.operation_product_surface.task_lifecycle_write_admission_posture), `unexpected write admission posture: ${operationRead.body.operation_product_surface.task_lifecycle_write_admission_posture}`);
  assert.ok(new Set([
    'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_and_assignment_admitted',
    'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_and_role_resolution_admitted',
    'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_and_roster_mutation_admitted',
  ]).has(operationRead.body.operation_product_surface.task_lifecycle_cloudflare_write_admission), `unexpected Cloudflare write admission: ${operationRead.body.operation_product_surface.task_lifecycle_cloudflare_write_admission}`);

  return {
    schema: 'narada.cloudflare_carrier.task_lifecycle_assignment_write_live_smoke.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    operation_id: config.operationId,
    task_id: created.body.task.task_id,
    task_number: created.body.task.task_number,
    create_admission_id: createAdmissionId,
    claim_admission_id: claimAdmissionId,
    report_admission_id: reportAdmissionId,
    changed_file_evidence_admission_id: evidenceAdmissionId,
    finish_admission_id: finishAdmissionId,
    projection_write_admission_id: projectionAdmissionId,
    source_state_write_admission_id: sourceStateAdmissionId,
    assignment_write_admission_id: assignmentAdmissionId,
    assignee_agent_id: config.agentId,
    mutation_authority: assignment.body.mutation_authority,
    cloudflare_write_admission: assignment.body.cloudflare_write_admission,
    write_effect: assignment.body.write_effect,
    assignment_authority_admission: assignment.body.assignment.assignment_authority_admission,
    roster_mutation_admission: assignment.body.assignment.roster_mutation_admission,
    role_resolution_authority_admission: assignment.body.assignment.role_resolution_authority_admission,
    mailbox_mutation_admission: assignment.body.assignment.mailbox_mutation_admission,
    filesystem_mutation_admission: assignment.body.assignment.filesystem_mutation_admission,
    repository_publication_admission: assignment.body.assignment.repository_publication_admission,
    authority_partition: operationRead.body.operation_product_surface.task_lifecycle_authority_partition,
    task_lifecycle_assignment_write_count: assignment.body.task.task_lifecycle_assignment_write_count,
    task_lifecycle_write_admission_count: operationRead.body.operation_product_surface.task_lifecycle_write_admission_count,
  };
}

async function postCarrier(config, body, fetchImpl) {
  const response = await fetchImpl(`${config.workerUrl}/api/carrier`, {
    method: 'POST',
    headers: {
      ...authHeaders(config.auth),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { http_status: response.status, body: await response.json().catch(() => ({})) };
}

function resolveBearerFromEnv(args, env) {
  const tokenFile = option(args, '--token-file') ?? env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? null;
  if (tokenFile) return { kind: 'bearer', value: readTokenFile(tokenFile), source: tokenFile === env.CLOUDFLARE_CARRIER_TOKEN_FILE ? 'env:CLOUDFLARE_CARRIER_TOKEN_FILE' : 'token-file' };
  const token = option(args, '--token') ?? env.CLOUDFLARE_CARRIER_TOKEN ?? null;
  if (token) return { kind: 'bearer', value: token, source: option(args, '--token') ? 'flag:--token' : 'env:CLOUDFLARE_CARRIER_TOKEN' };
  return null;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function readTokenFile(tokenFilePath) {
  const resolved = isAbsolute(tokenFilePath) ? tokenFilePath : join(repoRoot, tokenFilePath);
  if (!existsSync(resolved)) throw new Error(`assignment_write_live_smoke_token_file_missing:${resolved}`);
  return readFileSync(resolved, 'utf8').trim();
}

function loadLocalEnv(envPath, env = process.env) {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^[\"']|[\"']$/g, '');
    if (!(key in env)) env[key] = value;
  }
}

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/g, '');
}

if (process.argv[1] === scriptPath) {
  const config = parseTaskLifecycleAssignmentWriteLiveSmokeArgs(process.argv.slice(2));
  const result = await runTaskLifecycleAssignmentWriteLiveSmoke(config);
  if (config.format === 'text') {
    process.stdout.write(formatTaskLifecycleAssignmentWriteLiveSmokeText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
