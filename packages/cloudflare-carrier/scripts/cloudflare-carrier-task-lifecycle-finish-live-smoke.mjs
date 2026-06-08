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
const agentId = option('--agent') ?? process.env.CLOUDFLARE_TASK_LIFECYCLE_FINISH_AGENT_ID ?? process.env.CLOUDFLARE_TASK_LIFECYCLE_REPORT_AGENT_ID ?? 'cloudflare-live-smoke-agent';

if (!workerUrl) throw new Error('task_lifecycle_finish_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('task_lifecycle_finish_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('task_lifecycle_finish_live_smoke_requires_site_id');

const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const createAdmissionId = `task_lifecycle_finish_live_create_${suffix}`;
const claimAdmissionId = `task_lifecycle_finish_live_claim_${suffix}`;
const reportAdmissionId = `task_lifecycle_finish_live_report_${suffix}`;
const evidenceAdmissionId = `task_lifecycle_finish_live_file_evidence_${suffix}`;
const finishAdmissionId = `task_lifecycle_finish_live_finish_${suffix}`;
const title = option('--title') ?? `Cloudflare governed task finish ${suffix}`;

const created = await postCarrier({
  operation: 'task_lifecycle.task_create.admit',
  request_id: `task_lifecycle_finish_live_create_${suffix}`,
  params: {
    site_id: siteId,
    admission_id: createAdmissionId,
    title,
    description: 'Live proof setup for Cloudflare-owned task_finish after explicit finish cutover evidence.',
    cloudflare_task_create_cutover: true,
    cutover_point_ref: 'cutover:task-lifecycle-create:v1',
    governed_write_contract_ref: 'contract:task-lifecycle-create:v1',
    confirmation_evidence_ref: 'evidence:live-smoke:task-lifecycle-create',
  },
});
assert.equal(created.http_status, 200, JSON.stringify(created.body));
assert.equal(created.body.task.status, 'opened');

const claimed = await postCarrier({
  operation: 'task_lifecycle.task_claim.admit',
  request_id: `task_lifecycle_finish_live_claim_${suffix}`,
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
assert.equal(claimed.body.task.status, 'claimed');

const reported = await postCarrier({
  operation: 'task_lifecycle.task_report.admit',
  request_id: `task_lifecycle_finish_live_report_${suffix}`,
  params: {
    site_id: siteId,
    admission_id: reportAdmissionId,
    task_id: created.body.task.task_id,
    reporter_agent_id: agentId,
    summary: 'Live Cloudflare task lifecycle finish proof.',
    changed_files: ['packages/cloudflare-carrier/src/cloudflare-worker.mjs'],
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
assert.equal(reported.body.task.status, 'closed');
assert.equal(reported.body.task.report.changed_file_evidence_admission, 'not_admitted');

const fileEvidence = await postCarrier({
  operation: 'task_lifecycle.changed_file_evidence.admit',
  request_id: `task_lifecycle_finish_live_file_evidence_${suffix}`,
  params: {
    site_id: siteId,
    admission_id: evidenceAdmissionId,
    task_id: created.body.task.task_id,
    report_id: reported.body.report.report_id,
    file_path: 'packages/cloudflare-carrier/src/cloudflare-worker.mjs',
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
assert.equal(fileEvidence.http_status, 200, JSON.stringify(fileEvidence.body));
assert.equal(fileEvidence.body.task.changed_file_evidence_count, 1);
assert.equal(fileEvidence.body.evidence.filesystem_mutation_admission, 'not_admitted');
assert.equal(fileEvidence.body.evidence.repository_publication_admission, 'not_admitted');
assert.equal(fileEvidence.body.evidence.projection_write_admission, 'not_admitted');

const refusedFinish = await postCarrier({
  operation: 'task_lifecycle.task_finish.admit',
  request_id: `task_lifecycle_finish_live_refused_${suffix}`,
  params: {
    site_id: siteId,
    admission_id: `${finishAdmissionId}_refused`,
    task_id: created.body.task.task_id,
    finalizer_agent_id: agentId,
    finish_verdict: 'accepted',
  },
});
assert.equal(refusedFinish.http_status, 403, JSON.stringify(refusedFinish.body));
assert.equal(refusedFinish.body.code, 'task_lifecycle_finish_not_admitted');
assert.equal(refusedFinish.body.decision.reason, 'windows_task_lifecycle_mutation_authority_retained');

const finished = await postCarrier({
  operation: 'task_lifecycle.task_finish.admit',
  request_id: `task_lifecycle_finish_live_admitted_${suffix}`,
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
assert.equal(finished.body.status, 'finished');
assert.equal(finished.body.previous_status, 'closed');
assert.equal(finished.body.new_status, 'finished');
assert.equal(finished.body.write_effect, 'task_lifecycle_finish');
assert.equal(finished.body.task.status, 'finished');
assert.equal(finished.body.task.finish_verdict, 'accepted');
assert.equal(finished.body.task.changed_file_evidence_count, 1);

const operationRead = await postCarrier({
  operation: 'operation.read',
  request_id: `task_lifecycle_finish_live_operation_read_${suffix}`,
  params: { site_id: siteId, operation_id: operationId, task_lifecycle_task_limit: 100, task_lifecycle_write_admission_limit: 100 },
});
assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
assert.equal(operationRead.body.ok, true);
assert.ok(operationRead.body.task_lifecycle_tasks.some((entry) => entry.task_id === created.body.task.task_id && entry.status === 'finished' && entry.finish_id));
assert.equal(operationRead.body.operation_product_surface.task_lifecycle_task_finish_authority, 'cloudflare_task_lifecycle_d1');
assert.equal(operationRead.body.operation_product_surface.task_lifecycle_authority_partition, 'task_create_claim_report_finish_and_changed_file_evidence_cloudflare_remaining_windows');
assert.equal(operationRead.body.operation_product_surface.task_lifecycle_write_admission_posture, 'task_create_claim_report_finish_and_changed_file_evidence_admitted_remaining_writes_not_admitted');
assert.equal(operationRead.body.operation_product_surface.task_lifecycle_cloudflare_write_admission, 'task_create_claim_report_finish_and_changed_file_evidence_admitted');

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.task_lifecycle_finish_live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  site_id: siteId,
  operation_id: operationId,
  task_id: created.body.task.task_id,
  task_number: created.body.task.task_number,
  create_admission_id: createAdmissionId,
  claim_admission_id: claimAdmissionId,
  report_admission_id: reportAdmissionId,
  evidence_admission_id: evidenceAdmissionId,
  finish_admission_id: finishAdmissionId,
  finalizer_agent_id: agentId,
  mutation_authority: finished.body.mutation_authority,
  cloudflare_write_admission: finished.body.cloudflare_write_admission,
  write_effect: finished.body.write_effect,
  new_status: finished.body.new_status,
  finish_verdict: finished.body.task.finish_verdict,
  changed_file_evidence_count: finished.body.task.changed_file_evidence_count,
  authority_partition: operationRead.body.operation_product_surface.task_lifecycle_authority_partition,
  task_lifecycle_task_count: operationRead.body.operation_product_surface.task_lifecycle_task_count,
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
  if (!existsSync(resolved)) throw new Error(`task_lifecycle_finish_live_smoke_token_file_missing:${resolved}`);
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
