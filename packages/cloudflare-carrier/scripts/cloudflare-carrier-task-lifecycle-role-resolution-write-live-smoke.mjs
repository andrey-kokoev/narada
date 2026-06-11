#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
loadLocalEnv(join(repoRoot, '.env'));

const workerUrl = trimTrailingSlash(option('--url') ?? process.env.CLOUDFLARE_CARRIER_URL ?? '');
const tokenFile = option('--token-file') ?? process.env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? '';
const bearerToken = option('--token') ?? (tokenFile ? readTokenFile(tokenFile) : process.env.CLOUDFLARE_CARRIER_TOKEN ?? '');
const siteId = option('--site') ?? process.env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
const operationId = option('--operation') ?? process.env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
const agentId = option('--agent') ?? process.env.CLOUDFLARE_TASK_LIFECYCLE_REPORT_AGENT_ID ?? 'cloudflare-live-smoke-agent';
const assigneePrincipalId = option('--assignee-principal') ?? process.env.CLOUDFLARE_TASK_LIFECYCLE_ASSIGNEE_PRINCIPAL_ID ?? 'service';

if (!workerUrl) throw new Error('role_resolution_write_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('role_resolution_write_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('role_resolution_write_live_smoke_requires_site_id');
if (!assigneePrincipalId) throw new Error('role_resolution_write_live_smoke_requires_assignee_principal');

const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const createAdmissionId = `role_resolution_write_live_create_${suffix}`;
const claimAdmissionId = `role_resolution_write_live_claim_${suffix}`;
const reportAdmissionId = `role_resolution_write_live_report_${suffix}`;
const evidenceAdmissionId = `role_resolution_write_live_evidence_${suffix}`;
const finishAdmissionId = `role_resolution_write_live_finish_${suffix}`;
const projectionAdmissionId = `role_resolution_write_live_projection_${suffix}`;
const sourceStateAdmissionId = `role_resolution_write_live_source_state_${suffix}`;
const assignmentAdmissionId = `role_resolution_write_live_assignment_${suffix}`;
const roleResolutionAdmissionId = `role_resolution_write_live_admitted_${suffix}`;
const filePath = option('--file') ?? 'packages/cloudflare-carrier/src/cloudflare-worker.mjs';
const title = option('--title') ?? `Cloudflare role resolution write ${suffix}`;

const created = await postCarrier({ operation: 'task_lifecycle.task_create.admit', request_id: `role_resolution_write_live_create_${suffix}`, params: { site_id: siteId, admission_id: createAdmissionId, title, description: 'Live proof setup for Cloudflare-owned task lifecycle role resolution write.', cloudflare_task_create_cutover: true, cutover_point_ref: 'cutover:task-lifecycle-create:v1', governed_write_contract_ref: 'contract:task-lifecycle-create:v1', confirmation_evidence_ref: 'evidence:live-smoke:task-lifecycle-create' } });
assert.equal(created.http_status, 200, JSON.stringify(created.body));
const taskId = created.body.task.task_id;

const claimed = await postCarrier({ operation: 'task_lifecycle.task_claim.admit', request_id: `role_resolution_write_live_claim_${suffix}`, params: { site_id: siteId, admission_id: claimAdmissionId, task_id: taskId, claimant_agent_id: agentId, claimant_principal_id: assigneePrincipalId, cloudflare_task_claim_cutover: true, assignment_authority_ref: 'assignment-authority:task-lifecycle-claim:v1', cutover_point_ref: 'cutover:task-lifecycle-claim:v1', governed_write_contract_ref: 'contract:task-lifecycle-claim:v1', confirmation_evidence_ref: 'evidence:live-smoke:task-lifecycle-claim' } });
assert.equal(claimed.http_status, 200, JSON.stringify(claimed.body));

const reported = await postCarrier({ operation: 'task_lifecycle.task_report.admit', request_id: `role_resolution_write_live_report_${suffix}`, params: { site_id: siteId, admission_id: reportAdmissionId, task_id: taskId, reporter_agent_id: agentId, reporter_principal_id: assigneePrincipalId, summary: 'Live Cloudflare role resolution write proof setup.', changed_files: [filePath], verification: [{ command: 'pnpm --filter @narada2/cloudflare-carrier test', result: 'passed' }], cloudflare_task_report_cutover: true, report_authority_ref: 'report-authority:task-lifecycle-report:v1', report_schema_ref: 'schema:work-result-report:v1', changed_file_evidence_boundary_ref: 'boundary:changed-file-evidence:separate-cutover', cutover_point_ref: 'cutover:task-lifecycle-report:v1', governed_write_contract_ref: 'contract:task-lifecycle-report:v1', confirmation_evidence_ref: 'evidence:live-smoke:task-lifecycle-report' } });
assert.equal(reported.http_status, 200, JSON.stringify(reported.body));

const evidence = await postCarrier({ operation: 'task_lifecycle.changed_file_evidence.admit', request_id: `role_resolution_write_live_evidence_${suffix}`, params: { site_id: siteId, admission_id: evidenceAdmissionId, task_id: taskId, report_id: reported.body.report.report_id, file_path: filePath, reporter_agent_id: agentId, reporter_principal_id: assigneePrincipalId, cloudflare_changed_file_evidence_cutover: true, file_evidence_authority_ref: 'file-evidence-authority:changed-file:v1', file_material_source_ref: 'material-source:git-diff-summary:v1', repository_authority_ref: 'repository-authority:narada:v1', cutover_point_ref: 'cutover:changed-file-evidence:v1', governed_write_contract_ref: 'contract:changed-file-evidence:v1', confirmation_evidence_ref: 'evidence:live-smoke:changed-file-evidence' } });
assert.equal(evidence.http_status, 200, JSON.stringify(evidence.body));

const finished = await postCarrier({ operation: 'task_lifecycle.task_finish.admit', request_id: `role_resolution_write_live_finish_${suffix}`, params: { site_id: siteId, admission_id: finishAdmissionId, task_id: taskId, finalizer_agent_id: agentId, finalizer_principal_id: assigneePrincipalId, finish_verdict: 'accepted', cloudflare_task_finish_cutover: true, finish_authority_ref: 'finish-authority:task-lifecycle-finish:v1', finish_schema_ref: 'schema:task-finish-acceptance:v1', cutover_point_ref: 'cutover:task-lifecycle-finish:v1', governed_write_contract_ref: 'contract:task-lifecycle-finish:v1', confirmation_evidence_ref: 'evidence:live-smoke:task-lifecycle-finish' } });
assert.equal(finished.http_status, 200, JSON.stringify(finished.body));

const projected = await postCarrier({ operation: 'task_lifecycle.projection_write.admit', request_id: `role_resolution_write_live_projection_${suffix}`, params: { site_id: siteId, admission_id: projectionAdmissionId, task_id: taskId, cloudflare_task_projection_write_cutover: true, projection_target_ref: 'projection-target:cloudflare-task-lifecycle-read-model:v1', projection_schema_ref: 'schema:cloudflare-task-lifecycle-read-model:v1', projection_authority_ref: 'projection-authority:task-lifecycle:v1', source_evidence_ref: `source-evidence:${taskId}:finished-row`, cutover_point_ref: 'cutover:task-lifecycle-projection-write:v1', governed_write_contract_ref: 'contract:task-lifecycle-projection-write:v1', confirmation_evidence_ref: 'evidence:live-smoke:task-lifecycle-projection-write' } });
assert.equal(projected.http_status, 200, JSON.stringify(projected.body));

const sourceState = await postCarrier({ operation: 'task_lifecycle.source_state_write.admit', request_id: `role_resolution_write_live_source_state_${suffix}`, params: { site_id: siteId, admission_id: sourceStateAdmissionId, task_id: taskId, cloudflare_task_source_state_write_cutover: true, source_state_authority_ref: 'source-state-authority:cloudflare-task-lifecycle-d1:v1', source_state_schema_ref: 'schema:cloudflare-task-lifecycle-source-state:v1', source_state_evidence_ref: `source-state-evidence:${taskId}:projection-row`, cutover_point_ref: 'cutover:task-lifecycle-source-state-write:v1', governed_write_contract_ref: 'contract:task-lifecycle-source-state-write:v1', confirmation_evidence_ref: 'evidence:live-smoke:task-lifecycle-source-state-write' } });
assert.equal(sourceState.http_status, 200, JSON.stringify(sourceState.body));

const assignment = await postCarrier({ operation: 'task_lifecycle.assignment_write.admit', request_id: `role_resolution_write_live_assignment_${suffix}`, params: { site_id: siteId, admission_id: assignmentAdmissionId, task_id: taskId, assignee_agent_id: agentId, assignee_principal_id: assigneePrincipalId, cloudflare_task_assignment_write_cutover: true, assignment_authority_ref: 'assignment-authority:cloudflare-task-lifecycle-assignment:v1', assignment_schema_ref: 'schema:cloudflare-task-lifecycle-assignment:v1', assignment_evidence_ref: `assignment-evidence:${taskId}:source-state-row`, cutover_point_ref: 'cutover:task-lifecycle-assignment-write:v1', governed_write_contract_ref: 'contract:task-lifecycle-assignment-write:v1', confirmation_evidence_ref: 'evidence:live-smoke:task-lifecycle-assignment-write' } });
assert.equal(assignment.http_status, 200, JSON.stringify(assignment.body));

const refusedRoleResolution = await postCarrier({ operation: 'task_lifecycle.role_resolution_write.admit', request_id: `role_resolution_write_live_refused_${suffix}`, params: { site_id: siteId, admission_id: `${roleResolutionAdmissionId}_refused`, task_id: taskId, assignee_principal_id: assigneePrincipalId, role_resolution_authority_ref: 'role-resolution-authority:cloudflare-site-membership:v1', roster_source_ref: 'roster-source:cloudflare-site-membership:v1', role_resolution_schema_ref: 'schema:cloudflare-task-lifecycle-role-resolution:v1', role_resolution_evidence_ref: `role-resolution-evidence:${assigneePrincipalId}:membership-row` } });
assert.equal(refusedRoleResolution.http_status, 403, JSON.stringify(refusedRoleResolution.body));
assert.equal(refusedRoleResolution.body.code, 'task_lifecycle_role_resolution_write_not_admitted');
assert.equal(refusedRoleResolution.body.decision.reason, 'windows_task_lifecycle_mutation_authority_retained');

const roleResolution = await postCarrier({ operation: 'task_lifecycle.role_resolution_write.admit', request_id: `role_resolution_write_live_admitted_${suffix}`, params: { site_id: siteId, admission_id: roleResolutionAdmissionId, task_id: taskId, assignee_principal_id: assigneePrincipalId, cloudflare_task_role_resolution_write_cutover: true, role_resolution_authority_ref: 'role-resolution-authority:cloudflare-site-membership:v1', roster_source_ref: 'roster-source:cloudflare-site-membership:v1', role_resolution_schema_ref: 'schema:cloudflare-task-lifecycle-role-resolution:v1', role_resolution_evidence_ref: `role-resolution-evidence:${assigneePrincipalId}:membership-row`, cutover_point_ref: 'cutover:task-lifecycle-role-resolution-write:v1', governed_write_contract_ref: 'contract:task-lifecycle-role-resolution-write:v1', confirmation_evidence_ref: 'evidence:live-smoke:task-lifecycle-role-resolution-write' } });
assert.equal(roleResolution.http_status, 200, JSON.stringify(roleResolution.body));
assert.equal(roleResolution.body.status, 'task_lifecycle_role_resolution_written');
assert.equal(roleResolution.body.write_effect, 'task_lifecycle_role_resolution_write');
assert.equal(roleResolution.body.role_resolution.role_resolution_authority_admission, 'admitted');
assert.equal(roleResolution.body.role_resolution.roster_read_admission, 'admitted');
assert.equal(roleResolution.body.role_resolution.roster_mutation_admission, 'not_admitted');
assert.equal(roleResolution.body.role_resolution.mailbox_mutation_admission, 'not_admitted');
assert.equal(roleResolution.body.role_resolution.filesystem_mutation_admission, 'not_admitted');
assert.equal(roleResolution.body.role_resolution.repository_publication_admission, 'not_admitted');

const operationRead = await postCarrier({ operation: 'operation.read', request_id: `role_resolution_write_live_operation_read_${suffix}`, params: { site_id: siteId, operation_id: operationId, task_lifecycle_task_limit: 100, task_lifecycle_include_task_ids: [taskId], task_lifecycle_write_admission_limit: 100 } });
assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
assert.ok(operationRead.body.task_lifecycle_tasks.some((entry) => entry.task_id === taskId && entry.task_lifecycle_role_resolution_write_count === 1));
assert.equal(operationRead.body.operation_product_surface.task_lifecycle_role_resolution_authority, 'cloudflare_task_lifecycle_d1');
assert.ok(operationRead.body.operation_product_surface.task_lifecycle_role_resolution_write_count >= 1);
assert.equal(operationRead.body.operation_product_surface.task_lifecycle_roster_read_admission, 'admitted');
assert.ok(new Set([
  'not_admitted',
  'admitted',
]).has(operationRead.body.operation_product_surface.task_lifecycle_roster_mutation_admission), `unexpected role-resolution smoke roster mutation admission: ${operationRead.body.operation_product_surface.task_lifecycle_roster_mutation_admission}`);
assert.equal(operationRead.body.operation_product_surface.task_lifecycle_role_resolution_authority_admission, 'admitted');
assert.ok(new Set([
  'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_and_role_resolution_cloudflare_remaining_windows_effects',
  'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_and_roster_mutation_cloudflare_remaining_windows_effects',
  'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_roster_mutation_and_external_effects_cloudflare_owned',
]).has(operationRead.body.operation_product_surface.task_lifecycle_authority_partition), `unexpected authority partition: ${operationRead.body.operation_product_surface.task_lifecycle_authority_partition}`);
assert.ok(new Set([
  'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_and_role_resolution_admitted_remaining_external_effects_not_admitted',
  'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_and_roster_mutation_admitted_remaining_external_effects_not_admitted',
  'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_roster_mutation_and_external_effects_admitted',
]).has(operationRead.body.operation_product_surface.task_lifecycle_write_admission_posture), `unexpected write admission posture: ${operationRead.body.operation_product_surface.task_lifecycle_write_admission_posture}`);
assert.ok(new Set([
  'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_and_role_resolution_admitted',
  'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_and_roster_mutation_admitted',
]).has(operationRead.body.operation_product_surface.task_lifecycle_cloudflare_write_admission), `unexpected Cloudflare write admission: ${operationRead.body.operation_product_surface.task_lifecycle_cloudflare_write_admission}`);

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.task_lifecycle_role_resolution_write_live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  site_id: siteId,
  operation_id: operationId,
  task_id: taskId,
  task_number: created.body.task.task_number,
  create_admission_id: createAdmissionId,
  claim_admission_id: claimAdmissionId,
  report_admission_id: reportAdmissionId,
  changed_file_evidence_admission_id: evidenceAdmissionId,
  finish_admission_id: finishAdmissionId,
  projection_write_admission_id: projectionAdmissionId,
  source_state_write_admission_id: sourceStateAdmissionId,
  assignment_write_admission_id: assignmentAdmissionId,
  role_resolution_write_admission_id: roleResolutionAdmissionId,
  assignee_agent_id: agentId,
  assignee_principal_id: assigneePrincipalId,
  resolved_role: roleResolution.body.role_resolution.resolved_role,
  mutation_authority: roleResolution.body.mutation_authority,
  cloudflare_write_admission: roleResolution.body.cloudflare_write_admission,
  write_effect: roleResolution.body.write_effect,
  role_resolution_authority_admission: roleResolution.body.role_resolution.role_resolution_authority_admission,
  roster_read_admission: roleResolution.body.role_resolution.roster_read_admission,
  roster_mutation_admission: roleResolution.body.role_resolution.roster_mutation_admission,
  mailbox_mutation_admission: roleResolution.body.role_resolution.mailbox_mutation_admission,
  filesystem_mutation_admission: roleResolution.body.role_resolution.filesystem_mutation_admission,
  repository_publication_admission: roleResolution.body.role_resolution.repository_publication_admission,
  authority_partition: operationRead.body.operation_product_surface.task_lifecycle_authority_partition,
  task_lifecycle_role_resolution_write_count: operationRead.body.operation_product_surface.task_lifecycle_role_resolution_write_count,
  task_lifecycle_write_admission_count: operationRead.body.operation_product_surface.task_lifecycle_write_admission_count,
}, null, 2)}\n`);

async function postCarrier(body) {
  const response = await fetch(`${workerUrl}/api/carrier`, { method: 'POST', headers: { authorization: `Bearer ${bearerToken}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { http_status: response.status, body: await response.json().catch(() => ({})) };
}

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function readTokenFile(tokenFilePath) {
  const resolved = isAbsolute(tokenFilePath) ? tokenFilePath : join(repoRoot, tokenFilePath);
  if (!existsSync(resolved)) throw new Error(`role_resolution_write_live_smoke_token_file_missing:${resolved}`);
  return readFileSync(resolved, 'utf8').trim();
}

function loadLocalEnv(envPath) {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/g, '');
}
