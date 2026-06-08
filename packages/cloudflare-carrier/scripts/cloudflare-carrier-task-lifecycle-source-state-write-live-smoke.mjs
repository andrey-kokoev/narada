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

if (!workerUrl) throw new Error('source_state_write_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('source_state_write_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('source_state_write_live_smoke_requires_site_id');

const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const createAdmissionId = `source_state_write_live_create_${suffix}`;
const claimAdmissionId = `source_state_write_live_claim_${suffix}`;
const reportAdmissionId = `source_state_write_live_report_${suffix}`;
const evidenceAdmissionId = `source_state_write_live_evidence_${suffix}`;
const finishAdmissionId = `source_state_write_live_finish_${suffix}`;
const projectionAdmissionId = `source_state_write_live_projection_${suffix}`;
const sourceStateAdmissionId = `source_state_write_live_admitted_${suffix}`;
const filePath = option('--file') ?? 'packages/cloudflare-carrier/src/cloudflare-worker.mjs';
const title = option('--title') ?? `Cloudflare source-state write ${suffix}`;

const created = await postCarrier({
  operation: 'task_lifecycle.task_create.admit',
  request_id: `source_state_write_live_create_${suffix}`,
  params: {
    site_id: siteId,
    admission_id: createAdmissionId,
    title,
    description: 'Live proof setup for Cloudflare-owned task lifecycle source-state write.',
    cloudflare_task_create_cutover: true,
    cutover_point_ref: 'cutover:task-lifecycle-create:v1',
    governed_write_contract_ref: 'contract:task-lifecycle-create:v1',
    confirmation_evidence_ref: 'evidence:live-smoke:task-lifecycle-create',
  },
});
assert.equal(created.http_status, 200, JSON.stringify(created.body));

const claimed = await postCarrier({
  operation: 'task_lifecycle.task_claim.admit',
  request_id: `source_state_write_live_claim_${suffix}`,
  params: {
    site_id: siteId,
    admission_id: claimAdmissionId,
    task_id: created.body.task.task_id,
    claimant_agent_id: agentId,
    cloudflare_task_claim_cutover: true,
    assignment_authority_ref: 'assignment-authority:task-lifecycle-claim:v1',
    cutover_point_ref: 'cutover:task-lifecycle-claim:v1',
    governed_write_contract_ref: 'contract:task-lifecycle-claim:v1',
    confirmation_evidence_ref: 'evidence:live-smoke:task-lifecycle-claim',
  },
});
assert.equal(claimed.http_status, 200, JSON.stringify(claimed.body));

const reported = await postCarrier({
  operation: 'task_lifecycle.task_report.admit',
  request_id: `source_state_write_live_report_${suffix}`,
  params: {
    site_id: siteId,
    admission_id: reportAdmissionId,
    task_id: created.body.task.task_id,
    reporter_agent_id: agentId,
    summary: 'Live Cloudflare source-state write proof setup.',
    changed_files: [filePath],
    verification: [{ command: 'pnpm --filter @narada2/cloudflare-carrier test', result: 'passed' }],
    cloudflare_task_report_cutover: true,
    report_authority_ref: 'report-authority:task-lifecycle-report:v1',
    report_schema_ref: 'schema:work-result-report:v1',
    changed_file_evidence_boundary_ref: 'boundary:changed-file-evidence:separate-cutover',
    cutover_point_ref: 'cutover:task-lifecycle-report:v1',
    governed_write_contract_ref: 'contract:task-lifecycle-report:v1',
    confirmation_evidence_ref: 'evidence:live-smoke:task-lifecycle-report',
  },
});
assert.equal(reported.http_status, 200, JSON.stringify(reported.body));

const evidence = await postCarrier({
  operation: 'task_lifecycle.changed_file_evidence.admit',
  request_id: `source_state_write_live_evidence_${suffix}`,
  params: {
    site_id: siteId,
    admission_id: evidenceAdmissionId,
    task_id: created.body.task.task_id,
    report_id: reported.body.report.report_id,
    file_path: filePath,
    reporter_agent_id: agentId,
    cloudflare_changed_file_evidence_cutover: true,
    file_evidence_authority_ref: 'file-evidence-authority:changed-file:v1',
    file_material_source_ref: 'material-source:git-diff-summary:v1',
    repository_authority_ref: 'repository-authority:narada:v1',
    cutover_point_ref: 'cutover:changed-file-evidence:v1',
    governed_write_contract_ref: 'contract:changed-file-evidence:v1',
    confirmation_evidence_ref: 'evidence:live-smoke:changed-file-evidence',
  },
});
assert.equal(evidence.http_status, 200, JSON.stringify(evidence.body));

const finished = await postCarrier({
  operation: 'task_lifecycle.task_finish.admit',
  request_id: `source_state_write_live_finish_${suffix}`,
  params: {
    site_id: siteId,
    admission_id: finishAdmissionId,
    task_id: created.body.task.task_id,
    finalizer_agent_id: agentId,
    finish_verdict: 'accepted',
    cloudflare_task_finish_cutover: true,
    finish_authority_ref: 'finish-authority:task-lifecycle-finish:v1',
    finish_schema_ref: 'schema:task-finish-acceptance:v1',
    cutover_point_ref: 'cutover:task-lifecycle-finish:v1',
    governed_write_contract_ref: 'contract:task-lifecycle-finish:v1',
    confirmation_evidence_ref: 'evidence:live-smoke:task-lifecycle-finish',
  },
});
assert.equal(finished.http_status, 200, JSON.stringify(finished.body));
assert.equal(finished.body.task.status, 'finished');

const projected = await postCarrier({
  operation: 'task_lifecycle.projection_write.admit',
  request_id: `source_state_write_live_projection_${suffix}`,
  params: {
    site_id: siteId,
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
});
assert.equal(projected.http_status, 200, JSON.stringify(projected.body));
assert.equal(projected.body.write_effect, 'task_lifecycle_projection_write');

const refusedSourceState = await postCarrier({
  operation: 'task_lifecycle.source_state_write.admit',
  request_id: `source_state_write_live_refused_${suffix}`,
  params: {
    site_id: siteId,
    admission_id: `${sourceStateAdmissionId}_refused`,
    task_id: created.body.task.task_id,
    source_state_authority_ref: 'source-state-authority:cloudflare-task-lifecycle-d1:v1',
    source_state_schema_ref: 'schema:cloudflare-task-lifecycle-source-state:v1',
    source_state_evidence_ref: `source-state-evidence:${created.body.task.task_id}:projection-row`,
  },
});
assert.equal(refusedSourceState.http_status, 403, JSON.stringify(refusedSourceState.body));
assert.equal(refusedSourceState.body.code, 'task_lifecycle_source_state_write_not_admitted');
assert.equal(refusedSourceState.body.decision.reason, 'windows_task_lifecycle_mutation_authority_retained');

const sourceState = await postCarrier({
  operation: 'task_lifecycle.source_state_write.admit',
  request_id: `source_state_write_live_admitted_${suffix}`,
  params: {
    site_id: siteId,
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
});
assert.equal(sourceState.http_status, 200, JSON.stringify(sourceState.body));
assert.equal(sourceState.body.status, 'task_lifecycle_source_state_written');
assert.equal(sourceState.body.write_effect, 'task_lifecycle_source_state_write');
assert.equal(sourceState.body.source_state_write.canonical_source_state_authority, 'cloudflare_task_lifecycle_d1');
assert.equal(sourceState.body.source_state_write.windows_sqlite_source_write_admission, 'not_admitted');
assert.equal(sourceState.body.source_state_write.filesystem_mutation_admission, 'not_admitted');
assert.equal(sourceState.body.source_state_write.repository_publication_admission, 'not_admitted');
assert.equal(sourceState.body.source_state_write.mailbox_mutation_admission, 'not_admitted');
assert.equal(sourceState.body.task.task_lifecycle_source_state_write_count, 1);

const operationRead = await postCarrier({
  operation: 'operation.read',
  request_id: `source_state_write_live_operation_read_${suffix}`,
  params: { site_id: siteId, operation_id: operationId, task_lifecycle_task_limit: 100, task_lifecycle_write_admission_limit: 100 },
});
assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
assert.ok(operationRead.body.task_lifecycle_tasks.some((entry) => entry.task_id === created.body.task.task_id && entry.status === 'finished' && entry.task_lifecycle_source_state_write_count === 1));
assert.equal(operationRead.body.operation_product_surface.task_lifecycle_source_state_authority, 'cloudflare_task_lifecycle_d1');
assert.ok(operationRead.body.operation_product_surface.task_lifecycle_source_state_write_count >= 1);
assert.equal(operationRead.body.operation_product_surface.task_lifecycle_windows_sqlite_source_write_admission, 'not_admitted');
assert.equal(operationRead.body.operation_product_surface.task_lifecycle_authority_partition, 'task_create_claim_report_finish_changed_file_evidence_projection_write_and_source_state_cloudflare_remaining_windows_effects');
assert.equal(operationRead.body.operation_product_surface.task_lifecycle_write_admission_posture, 'task_create_claim_report_finish_changed_file_evidence_projection_write_and_source_state_admitted_remaining_external_effects_not_admitted');
assert.equal(operationRead.body.operation_product_surface.task_lifecycle_cloudflare_write_admission, 'task_create_claim_report_finish_changed_file_evidence_projection_write_and_source_state_admitted');

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.task_lifecycle_source_state_write_live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  site_id: siteId,
  operation_id: operationId,
  task_id: created.body.task.task_id,
  task_number: created.body.task.task_number,
  create_admission_id: createAdmissionId,
  claim_admission_id: claimAdmissionId,
  report_admission_id: reportAdmissionId,
  changed_file_evidence_admission_id: evidenceAdmissionId,
  finish_admission_id: finishAdmissionId,
  projection_write_admission_id: projectionAdmissionId,
  source_state_write_admission_id: sourceStateAdmissionId,
  reporter_agent_id: agentId,
  mutation_authority: sourceState.body.mutation_authority,
  cloudflare_write_admission: sourceState.body.cloudflare_write_admission,
  write_effect: sourceState.body.write_effect,
  canonical_source_state_authority: sourceState.body.source_state_write.canonical_source_state_authority,
  windows_sqlite_source_write_admission: sourceState.body.source_state_write.windows_sqlite_source_write_admission,
  filesystem_mutation_admission: sourceState.body.source_state_write.filesystem_mutation_admission,
  repository_publication_admission: sourceState.body.source_state_write.repository_publication_admission,
  mailbox_mutation_admission: sourceState.body.source_state_write.mailbox_mutation_admission,
  authority_partition: operationRead.body.operation_product_surface.task_lifecycle_authority_partition,
  task_lifecycle_source_state_write_count: operationRead.body.operation_product_surface.task_lifecycle_source_state_write_count,
  task_lifecycle_write_admission_count: operationRead.body.operation_product_surface.task_lifecycle_write_admission_count,
}, null, 2)}\n`);

async function postCarrier(body) {
  const response = await fetch(`${workerUrl}/api/carrier`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${bearerToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { http_status: response.status, body: await response.json().catch(() => ({})) };
}

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function readTokenFile(tokenFilePath) {
  const resolved = isAbsolute(tokenFilePath) ? tokenFilePath : join(repoRoot, tokenFilePath);
  if (!existsSync(resolved)) throw new Error(`source_state_write_live_smoke_token_file_missing:${resolved}`);
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
