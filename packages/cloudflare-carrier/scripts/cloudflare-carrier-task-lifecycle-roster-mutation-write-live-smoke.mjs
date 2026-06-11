#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

if (!workerUrl) throw new Error('roster_mutation_write_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('roster_mutation_write_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');

const roleResolution = runRoleResolutionSmoke();
const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const rosterMutationAdmissionId = `roster_mutation_write_live_admitted_${suffix}`;
const assigneePrincipalId = roleResolution.assignee_principal_id;
const membershipRole = option('--membership-role') ?? process.env.CLOUDFLARE_TASK_LIFECYCLE_ROSTER_MEMBERSHIP_ROLE ?? roleResolution.resolved_role ?? 'owner';
const membershipStatus = option('--membership-status') ?? process.env.CLOUDFLARE_TASK_LIFECYCLE_ROSTER_MEMBERSHIP_STATUS ?? 'active';

const refusedRosterMutation = await postCarrier({
  operation: 'task_lifecycle.roster_mutation_write.admit',
  request_id: `roster_mutation_write_live_refused_${suffix}`,
  params: {
    site_id: siteId,
    admission_id: `${rosterMutationAdmissionId}_refused`,
    task_id: roleResolution.task_id,
    assignee_principal_id: assigneePrincipalId,
    roster_mutation_authority_ref: 'roster-mutation-authority:cloudflare-site-membership:v1',
    roster_schema_ref: 'schema:cloudflare-site-membership-roster:v1',
    roster_evidence_ref: `roster-evidence:${assigneePrincipalId}:membership-upsert`,
    membership_role: membershipRole,
    membership_status: membershipStatus,
  },
});
assert.equal(refusedRosterMutation.http_status, 403, JSON.stringify(refusedRosterMutation.body));
assert.equal(refusedRosterMutation.body.code, 'task_lifecycle_roster_mutation_write_not_admitted');
assert.equal(refusedRosterMutation.body.decision.reason, 'windows_task_lifecycle_mutation_authority_retained');

const rosterMutation = await postCarrier({
  operation: 'task_lifecycle.roster_mutation_write.admit',
  request_id: `roster_mutation_write_live_admitted_${suffix}`,
  params: {
    site_id: siteId,
    admission_id: rosterMutationAdmissionId,
    task_id: roleResolution.task_id,
    assignee_principal_id: assigneePrincipalId,
    cloudflare_task_roster_mutation_write_cutover: true,
    roster_mutation_authority_ref: 'roster-mutation-authority:cloudflare-site-membership:v1',
    roster_schema_ref: 'schema:cloudflare-site-membership-roster:v1',
    roster_evidence_ref: `roster-evidence:${assigneePrincipalId}:membership-upsert`,
    membership_role: membershipRole,
    membership_status: membershipStatus,
    cutover_point_ref: 'cutover:task-lifecycle-roster-mutation-write:v1',
    governed_write_contract_ref: 'contract:task-lifecycle-roster-mutation-write:v1',
    confirmation_evidence_ref: 'evidence:live-smoke:task-lifecycle-roster-mutation-write',
  },
});
assert.equal(rosterMutation.http_status, 200, JSON.stringify(rosterMutation.body));
assert.equal(rosterMutation.body.status, 'task_lifecycle_roster_mutation_written');
assert.equal(rosterMutation.body.write_effect, 'task_lifecycle_roster_mutation_write');
assert.equal(rosterMutation.body.roster_mutation.roster_mutation_admission, 'admitted');
assert.equal(rosterMutation.body.roster_mutation.mailbox_mutation_admission, 'not_admitted');
assert.equal(rosterMutation.body.roster_mutation.filesystem_mutation_admission, 'not_admitted');
assert.equal(rosterMutation.body.roster_mutation.repository_publication_admission, 'not_admitted');

const operationRead = await postCarrier({
  operation: 'operation.read',
  request_id: `roster_mutation_write_live_operation_read_${suffix}`,
  params: { site_id: siteId, operation_id: operationId, task_lifecycle_task_limit: 100, task_lifecycle_include_task_ids: [roleResolution.task_id], task_lifecycle_write_admission_limit: 100 },
});
assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
assert.ok(operationRead.body.task_lifecycle_tasks.some((entry) => entry.task_id === roleResolution.task_id && entry.task_lifecycle_roster_mutation_write_count === 1));
assert.equal(operationRead.body.operation_product_surface.task_lifecycle_roster_mutation_authority, 'cloudflare_task_lifecycle_d1');
assert.ok(operationRead.body.operation_product_surface.task_lifecycle_roster_mutation_write_count >= 1);
assert.equal(operationRead.body.operation_product_surface.task_lifecycle_roster_mutation_admission, 'admitted');
assert.ok(new Set([
  'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_and_roster_mutation_cloudflare_remaining_windows_effects',
  'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_roster_mutation_and_external_effects_cloudflare_owned',
]).has(operationRead.body.operation_product_surface.task_lifecycle_authority_partition), `unexpected authority partition: ${operationRead.body.operation_product_surface.task_lifecycle_authority_partition}`);
assert.ok(new Set([
  'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_and_roster_mutation_admitted_remaining_external_effects_not_admitted',
  'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_roster_mutation_and_external_effects_admitted',
]).has(operationRead.body.operation_product_surface.task_lifecycle_write_admission_posture), `unexpected write admission posture: ${operationRead.body.operation_product_surface.task_lifecycle_write_admission_posture}`);
assert.equal(operationRead.body.operation_product_surface.task_lifecycle_cloudflare_write_admission, 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_and_roster_mutation_admitted');

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.task_lifecycle_roster_mutation_write_live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  site_id: siteId,
  operation_id: operationId,
  task_id: roleResolution.task_id,
  task_number: roleResolution.task_number,
  role_resolution_write_admission_id: roleResolution.role_resolution_write_admission_id,
  roster_mutation_write_admission_id: rosterMutationAdmissionId,
  assignee_principal_id: assigneePrincipalId,
  membership_role: membershipRole,
  membership_status: membershipStatus,
  mutation_authority: rosterMutation.body.mutation_authority,
  cloudflare_write_admission: rosterMutation.body.cloudflare_write_admission,
  write_effect: rosterMutation.body.write_effect,
  roster_mutation_admission: rosterMutation.body.roster_mutation.roster_mutation_admission,
  mailbox_mutation_admission: rosterMutation.body.roster_mutation.mailbox_mutation_admission,
  filesystem_mutation_admission: rosterMutation.body.roster_mutation.filesystem_mutation_admission,
  repository_publication_admission: rosterMutation.body.roster_mutation.repository_publication_admission,
  authority_partition: operationRead.body.operation_product_surface.task_lifecycle_authority_partition,
  task_lifecycle_roster_mutation_write_count: operationRead.body.operation_product_surface.task_lifecycle_roster_mutation_write_count,
  task_lifecycle_write_admission_count: operationRead.body.operation_product_surface.task_lifecycle_write_admission_count,
}, null, 2)}\n`);

function runRoleResolutionSmoke() {
  const result = spawnSync(process.execPath, [join(scriptDir, 'cloudflare-carrier-task-lifecycle-role-resolution-write-live-smoke.mjs'), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? '');
    process.stderr.write(result.stdout ?? '');
    throw new Error(`role_resolution_smoke_failed:${result.status}`);
  }
  return JSON.parse(result.stdout);
}

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
  if (!existsSync(resolved)) throw new Error(`roster_mutation_write_live_smoke_token_file_missing:${resolved}`);
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
