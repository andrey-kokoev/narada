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

if (!workerUrl) throw new Error('task_lifecycle_create_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('task_lifecycle_create_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('task_lifecycle_create_live_smoke_requires_site_id');

const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const admissionId = option('--admission-id') ?? `task_lifecycle_create_live_${suffix}`;
const title = option('--title') ?? `Cloudflare governed task create ${suffix}`;
const cutoverPointRef = option('--cutover-point-ref') ?? process.env.CLOUDFLARE_TASK_LIFECYCLE_CREATE_CUTOVER_POINT_REF ?? 'cutover:task-lifecycle-create:v1';
const governedWriteContractRef = option('--governed-write-contract-ref') ?? process.env.CLOUDFLARE_TASK_LIFECYCLE_CREATE_CONTRACT_REF ?? 'contract:task-lifecycle-create:v1';
const confirmationEvidenceRef = option('--confirmation-evidence-ref') ?? process.env.CLOUDFLARE_TASK_LIFECYCLE_CREATE_CONFIRMATION_EVIDENCE_REF ?? 'evidence:live-smoke:task-lifecycle-create';

const refused = await postCarrier({
  operation: 'task_lifecycle.task_create.admit',
  request_id: `task_lifecycle_create_live_refused_${suffix}`,
  params: {
    site_id: siteId,
    admission_id: `${admissionId}_refused`,
    title: `${title} refused guard`,
  },
});
assert.equal(refused.http_status, 403, JSON.stringify(refused.body));
assert.equal(refused.body.code, 'task_lifecycle_create_not_admitted');
assert.equal(refused.body.decision.action, 'refuse');
assert.equal(refused.body.decision.reason, 'windows_task_lifecycle_mutation_authority_retained');

const created = await postCarrier({
  operation: 'task_lifecycle.task_create.admit',
  request_id: `task_lifecycle_create_live_admitted_${suffix}`,
  params: {
    site_id: siteId,
    admission_id: admissionId,
    title,
    description: 'Live proof that Cloudflare can own the task_create mutation class after explicit cutover evidence.',
    cloudflare_task_create_cutover: true,
    cutover_point_ref: cutoverPointRef,
    governed_write_contract_ref: governedWriteContractRef,
    confirmation_evidence_ref: confirmationEvidenceRef,
  },
});
assert.equal(created.http_status, 200, JSON.stringify(created.body));
assert.equal(created.body.ok, true);
assert.equal(created.body.status, 'created');
assert.equal(created.body.decision.action, 'admit');
assert.equal(created.body.decision.reason, 'cloudflare_task_create_cutover_admitted');
assert.equal(created.body.mutation_authority, 'cloudflare_task_lifecycle_d1');
assert.equal(created.body.cloudflare_write_admission, 'admitted');
assert.equal(created.body.write_effect, 'task_lifecycle_create');
assert.equal(created.body.task.site_id, siteId);
assert.equal(created.body.task.status, 'opened');
assert.equal(created.body.task.cutover_point_ref, cutoverPointRef);
assert.equal(created.body.task.governed_write_contract_ref, governedWriteContractRef);
assert.equal(created.body.task.confirmation_evidence_ref, confirmationEvidenceRef);

const taskList = await postCarrier({
  operation: 'task_lifecycle.task.list',
  request_id: `task_lifecycle_create_live_list_${suffix}`,
  params: { site_id: siteId, limit: 20 },
});
assert.equal(taskList.http_status, 200, JSON.stringify(taskList.body));
assert.equal(taskList.body.ok, true);
const listedTask = taskList.body.tasks.find((entry) => entry.task_id === created.body.task.task_id);
assert.ok(listedTask, JSON.stringify(taskList.body.tasks));
assert.equal(listedTask.mutation_authority, 'cloudflare_task_lifecycle_d1');
assert.equal(listedTask.cloudflare_write_admission, 'admitted');

const operationRead = await postCarrier({
  operation: 'operation.read',
  request_id: `task_lifecycle_create_live_operation_read_${suffix}`,
  params: { site_id: siteId, operation_id: operationId, task_lifecycle_task_limit: 20, task_lifecycle_include_task_ids: [created.body.task.task_id], task_lifecycle_write_admission_limit: 20 },
});
assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
assert.equal(operationRead.body.ok, true);
assert.ok(operationRead.body.task_lifecycle_tasks.some((entry) => entry.task_id === created.body.task.task_id));
assert.equal(operationRead.body.operation_product_surface.task_lifecycle_default_mutation_authority, 'windows_task_lifecycle_sqlite');
assert.equal(operationRead.body.operation_product_surface.task_lifecycle_default_cloudflare_write_admission, 'not_admitted');
assert.equal(operationRead.body.operation_product_surface.task_lifecycle_task_create_authority, 'cloudflare_task_lifecycle_d1');
assert.ok([
  'task_create_cloudflare_remaining_windows',
  'task_create_and_claim_cloudflare_remaining_windows',
  'task_create_claim_and_report_cloudflare_remaining_windows',
].includes(operationRead.body.operation_product_surface.task_lifecycle_authority_partition));
assert.ok([
  'task_create_admitted_remaining_writes_not_admitted',
  'task_create_and_claim_admitted_remaining_writes_not_admitted',
  'task_create_claim_and_report_admitted_remaining_writes_not_admitted',
].includes(operationRead.body.operation_product_surface.task_lifecycle_write_admission_posture));
assert.equal(operationRead.body.operation_product_surface.task_lifecycle_mutation_authority, 'split_by_mutation_class');
assert.ok([
  'task_create_admitted',
  'task_create_and_claim_admitted',
  'task_create_claim_and_report_admitted',
].includes(operationRead.body.operation_product_surface.task_lifecycle_cloudflare_write_admission));

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.task_lifecycle_create_live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  site_id: siteId,
  operation_id: operationId,
  task_id: created.body.task.task_id,
  task_number: created.body.task.task_number,
  admission_id: admissionId,
  mutation_authority: created.body.mutation_authority,
  cloudflare_write_admission: created.body.cloudflare_write_admission,
  write_effect: created.body.write_effect,
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
  if (!existsSync(resolved)) throw new Error(`task_lifecycle_create_live_smoke_token_file_missing:${resolved}`);
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
