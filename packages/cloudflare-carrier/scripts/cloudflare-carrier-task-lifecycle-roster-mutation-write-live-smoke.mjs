#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';
import { runTaskLifecycleRoleResolutionWriteLiveSmoke } from './cloudflare-carrier-task-lifecycle-role-resolution-write-live-smoke.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, '../../..');

export function parseTaskLifecycleRosterMutationWriteLiveSmokeArgs(argv = [], env = process.env, { loadEnv = true } = {}) {
  const args = [...argv];
  if (loadEnv) loadLocalEnv(join(repoRoot, '.env'), env);

  const workerUrl = trimTrailingSlash(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const format = option(args, '--format') ?? env.CLOUDFLARE_TASK_LIFECYCLE_ROSTER_MUTATION_WRITE_LIVE_SMOKE_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const operationId = option(args, '--operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
  const agentId = option(args, '--agent') ?? env.CLOUDFLARE_TASK_LIFECYCLE_REPORT_AGENT_ID ?? 'cloudflare-live-smoke-agent';
  const assigneePrincipalId = option(args, '--assignee-principal') ?? env.CLOUDFLARE_TASK_LIFECYCLE_ASSIGNEE_PRINCIPAL_ID ?? 'service';
  const membershipRole = option(args, '--membership-role') ?? env.CLOUDFLARE_TASK_LIFECYCLE_ROSTER_MEMBERSHIP_ROLE ?? null;
  const membershipStatus = option(args, '--membership-status') ?? env.CLOUDFLARE_TASK_LIFECYCLE_ROSTER_MEMBERSHIP_STATUS ?? 'active';
  const filePath = option(args, '--file') ?? 'packages/cloudflare-carrier/src/cloudflare-worker.mjs';
  const title = option(args, '--title') ?? null;
  const auth = resolveAuth(args, env) ?? resolveBearerFromEnv(args, env);

  if (!workerUrl) throw new Error('roster_mutation_write_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`roster_mutation_write_live_smoke_unknown_format:${format}`);
  if (!auth) throw new Error('roster_mutation_write_live_smoke_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    format,
    auth,
    siteId,
    operationId,
    agentId,
    assigneePrincipalId,
    membershipRole,
    membershipStatus,
    filePath,
    title,
  };
}

export function formatTaskLifecycleRosterMutationWriteLiveSmokeText(result) {
  const lines = [
    `Task Lifecycle Roster Mutation Write Smoke: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Operation: ${result.operation_id}`,
    `Task: ${result.task_id} #${result.task_number}`,
    `Admissions: role_resolution_write=${result.role_resolution_write_admission_id} roster_mutation_write=${result.roster_mutation_write_admission_id}`,
    `Assignee Principal: ${result.assignee_principal_id}`,
    `Membership: role=${result.membership_role ?? 'unknown'} status=${result.membership_status ?? 'unknown'}`,
    `Authority: mutation=${result.mutation_authority ?? 'unknown'} cloudflare_write=${result.cloudflare_write_admission ?? 'unknown'} effect=${result.write_effect ?? 'unknown'}`,
    `Roster Mutation: admitted=${result.roster_mutation_admission ?? 'unknown'} mailbox=${result.mailbox_mutation_admission ?? 'unknown'} filesystem=${result.filesystem_mutation_admission ?? 'unknown'} repository_publication=${result.repository_publication_admission ?? 'unknown'}`,
    `Partition: ${result.authority_partition ?? 'unknown'}`,
    `Counts: roster_mutation_write=${result.task_lifecycle_roster_mutation_write_count ?? 0} write_admissions=${result.task_lifecycle_write_admission_count ?? 0}`,
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

export async function runTaskLifecycleRosterMutationWriteLiveSmoke(config, { fetchImpl = fetch } = {}) {
  const roleResolution = await runTaskLifecycleRoleResolutionWriteLiveSmoke({
    workerUrl: config.workerUrl,
    auth: config.auth,
    siteId: config.siteId,
    operationId: config.operationId,
    agentId: config.agentId,
    assigneePrincipalId: config.assigneePrincipalId,
    filePath: config.filePath,
    title: config.title ? `${config.title} role resolution` : null,
  }, { fetchImpl });

  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const rosterMutationAdmissionId = `roster_mutation_write_live_admitted_${suffix}`;
  const membershipRole = config.membershipRole ?? roleResolution.resolved_role ?? 'owner';

  const refusedRosterMutation = await postCarrier(config, {
    operation: 'task_lifecycle.roster_mutation_write.admit',
    request_id: `roster_mutation_write_live_refused_${suffix}`,
    params: {
      site_id: config.siteId,
      admission_id: `${rosterMutationAdmissionId}_refused`,
      task_id: roleResolution.task_id,
      assignee_principal_id: config.assigneePrincipalId,
      roster_mutation_authority_ref: 'roster-mutation-authority:cloudflare-site-membership:v1',
      roster_schema_ref: 'schema:cloudflare-site-membership-roster:v1',
      roster_evidence_ref: `roster-evidence:${config.assigneePrincipalId}:membership-upsert`,
      membership_role: membershipRole,
      membership_status: config.membershipStatus,
    },
  }, fetchImpl);
  assert.equal(refusedRosterMutation.http_status, 403, JSON.stringify(refusedRosterMutation.body));
  assert.equal(refusedRosterMutation.body.code, 'task_lifecycle_roster_mutation_write_not_admitted');
  assert.equal(refusedRosterMutation.body.decision.reason, 'windows_task_lifecycle_mutation_authority_retained');

  const rosterMutation = await postCarrier(config, {
    operation: 'task_lifecycle.roster_mutation_write.admit',
    request_id: `roster_mutation_write_live_admitted_${suffix}`,
    params: {
      site_id: config.siteId,
      admission_id: rosterMutationAdmissionId,
      task_id: roleResolution.task_id,
      assignee_principal_id: config.assigneePrincipalId,
      cloudflare_task_roster_mutation_write_cutover: true,
      roster_mutation_authority_ref: 'roster-mutation-authority:cloudflare-site-membership:v1',
      roster_schema_ref: 'schema:cloudflare-site-membership-roster:v1',
      roster_evidence_ref: `roster-evidence:${config.assigneePrincipalId}:membership-upsert`,
      membership_role: membershipRole,
      membership_status: config.membershipStatus,
      cutover_point_ref: 'cutover:task-lifecycle-roster-mutation-write:v1',
      governed_write_contract_ref: 'contract:task-lifecycle-roster-mutation-write:v1',
      confirmation_evidence_ref: 'evidence:live-smoke:task-lifecycle-roster-mutation-write',
    },
  }, fetchImpl);
  assert.equal(rosterMutation.http_status, 200, JSON.stringify(rosterMutation.body));
  assert.equal(rosterMutation.body.status, 'task_lifecycle_roster_mutation_written');
  assert.equal(rosterMutation.body.write_effect, 'task_lifecycle_roster_mutation_write');
  assert.equal(rosterMutation.body.roster_mutation.roster_mutation_admission, 'admitted');
  assert.equal(rosterMutation.body.roster_mutation.mailbox_mutation_admission, 'not_admitted');
  assert.equal(rosterMutation.body.roster_mutation.filesystem_mutation_admission, 'not_admitted');
  assert.equal(rosterMutation.body.roster_mutation.repository_publication_admission, 'not_admitted');

  const operationRead = await postCarrier(config, {
    operation: 'operation.read',
    request_id: `roster_mutation_write_live_operation_read_${suffix}`,
    params: { site_id: config.siteId, operation_id: config.operationId, task_lifecycle_task_limit: 100, task_lifecycle_include_task_ids: [roleResolution.task_id], task_lifecycle_write_admission_limit: 100 },
  }, fetchImpl);
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

  return {
    schema: 'narada.cloudflare_carrier.task_lifecycle_roster_mutation_write_live_smoke.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    operation_id: config.operationId,
    task_id: roleResolution.task_id,
    task_number: roleResolution.task_number,
    role_resolution_write_admission_id: roleResolution.role_resolution_write_admission_id,
    roster_mutation_write_admission_id: rosterMutationAdmissionId,
    assignee_principal_id: config.assigneePrincipalId,
    membership_role: membershipRole,
    membership_status: config.membershipStatus,
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
  if (!existsSync(resolved)) throw new Error(`roster_mutation_write_live_smoke_token_file_missing:${resolved}`);
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
  const config = parseTaskLifecycleRosterMutationWriteLiveSmokeArgs(process.argv.slice(2));
  const result = await runTaskLifecycleRosterMutationWriteLiveSmoke(config);
  if (config.format === 'text') {
    process.stdout.write(formatTaskLifecycleRosterMutationWriteLiveSmokeText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
