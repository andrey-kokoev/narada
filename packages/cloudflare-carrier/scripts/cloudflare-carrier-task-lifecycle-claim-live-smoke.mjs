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
const claimantAgentId = option('--claimant-agent') ?? process.env.CLOUDFLARE_TASK_LIFECYCLE_CLAIM_AGENT_ID ?? 'cloudflare-live-smoke-agent';

if (!workerUrl) throw new Error('task_lifecycle_claim_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('task_lifecycle_claim_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('task_lifecycle_claim_live_smoke_requires_site_id');

const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const createAdmissionId = option('--create-admission-id') ?? `task_lifecycle_claim_live_create_${suffix}`;
const claimAdmissionId = option('--claim-admission-id') ?? `task_lifecycle_claim_live_claim_${suffix}`;
const title = option('--title') ?? `Cloudflare governed task claim ${suffix}`;
const createCutoverPointRef = option('--create-cutover-point-ref') ?? process.env.CLOUDFLARE_TASK_LIFECYCLE_CREATE_CUTOVER_POINT_REF ?? 'cutover:task-lifecycle-create:v1';
const createContractRef = option('--create-governed-write-contract-ref') ?? process.env.CLOUDFLARE_TASK_LIFECYCLE_CREATE_CONTRACT_REF ?? 'contract:task-lifecycle-create:v1';
const createEvidenceRef = option('--create-confirmation-evidence-ref') ?? process.env.CLOUDFLARE_TASK_LIFECYCLE_CREATE_CONFIRMATION_EVIDENCE_REF ?? 'evidence:live-smoke:task-lifecycle-create';
const claimCutoverPointRef = option('--claim-cutover-point-ref') ?? process.env.CLOUDFLARE_TASK_LIFECYCLE_CLAIM_CUTOVER_POINT_REF ?? 'cutover:task-lifecycle-claim:v1';
const claimContractRef = option('--claim-governed-write-contract-ref') ?? process.env.CLOUDFLARE_TASK_LIFECYCLE_CLAIM_CONTRACT_REF ?? 'contract:task-lifecycle-claim:v1';
const claimEvidenceRef = option('--claim-confirmation-evidence-ref') ?? process.env.CLOUDFLARE_TASK_LIFECYCLE_CLAIM_CONFIRMATION_EVIDENCE_REF ?? 'evidence:live-smoke:task-lifecycle-claim';
const assignmentAuthorityRef = option('--assignment-authority-ref') ?? process.env.CLOUDFLARE_TASK_LIFECYCLE_CLAIM_ASSIGNMENT_AUTHORITY_REF ?? 'assignment-authority:task-lifecycle-claim:v1';

const created = await postCarrier({
  operation: 'task_lifecycle.task_create.admit',
  request_id: `task_lifecycle_claim_live_create_${suffix}`,
  params: {
    site_id: siteId,
    admission_id: createAdmissionId,
    title,
    description: 'Live proof setup for Cloudflare-owned task_claim after explicit claim cutover evidence.',
    cloudflare_task_create_cutover: true,
    cutover_point_ref: createCutoverPointRef,
    governed_write_contract_ref: createContractRef,
    confirmation_evidence_ref: createEvidenceRef,
  },
});
assert.equal(created.http_status, 200, JSON.stringify(created.body));
assert.equal(created.body.status, 'created');
assert.equal(created.body.task.status, 'opened');

const refusedClaim = await postCarrier({
  operation: 'task_lifecycle.task_claim.admit',
  request_id: `task_lifecycle_claim_live_refused_${suffix}`,
  params: {
    site_id: siteId,
    admission_id: `${claimAdmissionId}_refused`,
    task_id: created.body.task.task_id,
    claimant_agent_id: claimantAgentId,
  },
});
assert.equal(refusedClaim.http_status, 403, JSON.stringify(refusedClaim.body));
assert.equal(refusedClaim.body.code, 'task_lifecycle_claim_not_admitted');
assert.equal(refusedClaim.body.decision.reason, 'windows_task_lifecycle_mutation_authority_retained');

const claimed = await postCarrier({
  operation: 'task_lifecycle.task_claim.admit',
  request_id: `task_lifecycle_claim_live_admitted_${suffix}`,
  params: {
    site_id: siteId,
    admission_id: claimAdmissionId,
    task_id: created.body.task.task_id,
    claimant_agent_id: claimantAgentId,
    cloudflare_task_claim_cutover: true,
    assignment_authority_ref: assignmentAuthorityRef,
    cutover_point_ref: claimCutoverPointRef,
    governed_write_contract_ref: claimContractRef,
    confirmation_evidence_ref: claimEvidenceRef,
  },
});
assert.equal(claimed.http_status, 200, JSON.stringify(claimed.body));
assert.equal(claimed.body.status, 'claimed');
assert.equal(claimed.body.previous_status, 'opened');
assert.equal(claimed.body.decision.reason, 'cloudflare_task_claim_cutover_admitted');
assert.equal(claimed.body.decision.conflict_policy, 'opened_only_no_overwrite');
assert.equal(claimed.body.mutation_authority, 'cloudflare_task_lifecycle_d1');
assert.equal(claimed.body.cloudflare_write_admission, 'admitted');
assert.equal(claimed.body.write_effect, 'task_lifecycle_claim');
assert.equal(claimed.body.task.status, 'claimed');
assert.equal(claimed.body.task.claimed_by_agent_id, claimantAgentId);
assert.equal(claimed.body.task.assignment_authority_ref, assignmentAuthorityRef);

const duplicateClaim = await postCarrier({
  operation: 'task_lifecycle.task_claim.admit',
  request_id: `task_lifecycle_claim_live_duplicate_${suffix}`,
  params: {
    site_id: siteId,
    admission_id: `${claimAdmissionId}_duplicate`,
    task_id: created.body.task.task_id,
    claimant_agent_id: `${claimantAgentId}-duplicate`,
    cloudflare_task_claim_cutover: true,
    assignment_authority_ref: assignmentAuthorityRef,
    cutover_point_ref: claimCutoverPointRef,
    governed_write_contract_ref: claimContractRef,
    confirmation_evidence_ref: claimEvidenceRef,
  },
});
assert.equal(duplicateClaim.http_status, 409, JSON.stringify(duplicateClaim.body));
assert.equal(duplicateClaim.body.code, 'task_lifecycle_claim_conflict');
assert.equal(duplicateClaim.body.previous_status, 'claimed');
assert.equal(duplicateClaim.body.conflict_policy, 'opened_only_no_overwrite');

const operationRead = await postCarrier({
  operation: 'operation.read',
  request_id: `task_lifecycle_claim_live_operation_read_${suffix}`,
  params: { site_id: siteId, operation_id: operationId, task_lifecycle_task_limit: 50, task_lifecycle_write_admission_limit: 50 },
});
assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
assert.equal(operationRead.body.ok, true);
assert.ok(operationRead.body.task_lifecycle_tasks.some((entry) => entry.task_id === created.body.task.task_id && entry.status === 'claimed'));
assert.equal(operationRead.body.operation_product_surface.task_lifecycle_default_mutation_authority, 'windows_task_lifecycle_sqlite');
assert.equal(operationRead.body.operation_product_surface.task_lifecycle_default_cloudflare_write_admission, 'not_admitted');
assert.equal(operationRead.body.operation_product_surface.task_lifecycle_task_create_authority, 'cloudflare_task_lifecycle_d1');
assert.equal(operationRead.body.operation_product_surface.task_lifecycle_task_claim_authority, 'cloudflare_task_lifecycle_d1');
assert.equal(operationRead.body.operation_product_surface.task_lifecycle_task_claim_count >= 1, true);
assert.ok([
  'task_create_and_claim_cloudflare_remaining_windows',
  'task_create_claim_and_report_cloudflare_remaining_windows',
].includes(operationRead.body.operation_product_surface.task_lifecycle_authority_partition));
assert.ok([
  'task_create_and_claim_admitted_remaining_writes_not_admitted',
  'task_create_claim_and_report_admitted_remaining_writes_not_admitted',
].includes(operationRead.body.operation_product_surface.task_lifecycle_write_admission_posture));
assert.ok([
  'task_create_and_claim_admitted',
  'task_create_claim_and_report_admitted',
].includes(operationRead.body.operation_product_surface.task_lifecycle_cloudflare_write_admission));

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.task_lifecycle_claim_live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  site_id: siteId,
  operation_id: operationId,
  task_id: created.body.task.task_id,
  task_number: created.body.task.task_number,
  create_admission_id: createAdmissionId,
  claim_admission_id: claimAdmissionId,
  claimant_agent_id: claimantAgentId,
  mutation_authority: claimed.body.mutation_authority,
  cloudflare_write_admission: claimed.body.cloudflare_write_admission,
  write_effect: claimed.body.write_effect,
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
  if (!existsSync(resolved)) throw new Error(`task_lifecycle_claim_live_smoke_token_file_missing:${resolved}`);
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
